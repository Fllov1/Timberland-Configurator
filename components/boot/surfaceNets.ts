import * as THREE from "three";

export type Sdf = (x: number, y: number, z: number) => number;

export interface SdfBounds {
  min: [number, number, number];
  max: [number, number, number];
}

// Corner pairs forming the 12 edges of a cell (corner n → dx = n&1, dy = n>>1&1, dz = n>>2&1).
const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];

/**
 * Meshes the zero level-set of a signed distance field with naive surface nets.
 * The field must be symmetric in Z (only half of the grid is evaluated).
 * Returns a non-indexed geometry with gradient normals and box-projected UVs,
 * so tiling micro-textures (grain) can be applied without any unwrapping.
 */
export function sdfGeometry(f: Sdf, bounds: SdfBounds, h: number, uvScale = 1): THREE.BufferGeometry {
  const [x0, y0] = bounds.min;
  const nx = Math.ceil((bounds.max[0] - x0) / h) + 1;
  const ny = Math.ceil((bounds.max[1] - y0) / h) + 1;
  const halfZ = Math.ceil(bounds.max[2] / h);
  const nz = halfZ * 2 + 1;
  const z0 = -halfZ * h;

  const vals = new Float32Array(nx * ny * nz);
  for (let k = 0; k <= halfZ; k++) {
    const z = z0 + k * h;
    const mirror = nz - 1 - k;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * h;
      for (let i = 0; i < nx; i++) {
        const v = f(x0 + i * h, y, z);
        vals[i + nx * (j + ny * k)] = v;
        vals[i + nx * (j + ny * mirror)] = v;
      }
    }
  }

  // 1) one vertex per sign-changing cell
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const cellVertex = new Int32Array(cx * cy * cz).fill(-1);
  const verts: number[] = [];
  const c = new Float32Array(8);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let n = 0; n < 8; n++) {
          const v = vals[i + (n & 1) + nx * (j + ((n >> 1) & 1) + ny * (k + ((n >> 2) & 1)))];
          c[n] = v;
          if (v < 0) mask |= 1 << n;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e];
          const b = EDGES[e + 1];
          if (c[a] < 0 === c[b] < 0) continue;
          const t = c[a] / (c[a] - c[b]);
          sx += (a & 1) + t * ((b & 1) - (a & 1));
          sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
          sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
          count++;
        }
        cellVertex[i + cx * (j + cy * k)] = verts.length / 3;
        verts.push(x0 + (i + sx / count) * h, y0 + (j + sy / count) * h, z0 + (k + sz / count) * h);
      }
    }
  }

  // 2) gradient normals
  const vCount = verts.length / 3;
  const normals = new Float32Array(vCount * 3);
  const eps = h * 0.3;
  for (let v = 0; v < vCount; v++) {
    const x = verts[v * 3];
    const y = verts[v * 3 + 1];
    const z = verts[v * 3 + 2];
    const gx = f(x + eps, y, z) - f(x - eps, y, z);
    const gy = f(x, y + eps, z) - f(x, y - eps, z);
    const gz = f(x, y, z + eps) - f(x, y, z - eps);
    const len = Math.hypot(gx, gy, gz) || 1;
    normals[v * 3] = gx / len;
    normals[v * 3 + 1] = gy / len;
    normals[v * 3 + 2] = gz / len;
  }

  // 3) one quad per sign-changing grid edge
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];

  const tri = (a: number, b: number, d: number) => {
    const ax = verts[a * 3], ay = verts[a * 3 + 1], az = verts[a * 3 + 2];
    let bx = verts[b * 3], by = verts[b * 3 + 1], bz = verts[b * 3 + 2];
    let dx = verts[d * 3], dy = verts[d * 3 + 1], dz = verts[d * 3 + 2];
    // geometric normal
    const fx = (by - ay) * (dz - az) - (bz - az) * (dy - ay);
    const fy = (bz - az) * (dx - ax) - (bx - ax) * (dz - az);
    const fz = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const mx = normals[a * 3] + normals[b * 3] + normals[d * 3];
    const my = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[d * 3 + 1];
    const mz = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[d * 3 + 2];
    // make winding agree with the field gradient
    if (fx * mx + fy * my + fz * mz < 0) {
      const t = b;
      b = d;
      d = t;
      [bx, by, bz, dx, dy, dz] = [dx, dy, dz, bx, by, bz];
    }
    pos.push(ax, ay, az, bx, by, bz, dx, dy, dz);
    nor.push(
      normals[a * 3], normals[a * 3 + 1], normals[a * 3 + 2],
      normals[b * 3], normals[b * 3 + 1], normals[b * 3 + 2],
      normals[d * 3], normals[d * 3 + 1], normals[d * 3 + 2],
    );
    // box projection chosen per triangle → no smeared UVs between projections
    const wx = Math.abs(mx), wy = Math.abs(my), wz = Math.abs(mz);
    if (wx >= wy && wx >= wz) uv.push(az * uvScale, ay * uvScale, bz * uvScale, by * uvScale, dz * uvScale, dy * uvScale);
    else if (wy >= wz) uv.push(ax * uvScale, az * uvScale, bx * uvScale, bz * uvScale, dx * uvScale, dz * uvScale);
    else uv.push(ax * uvScale, ay * uvScale, bx * uvScale, by * uvScale, dx * uvScale, dy * uvScale);
  };

  const cell = (i: number, j: number, k: number) => cellVertex[i + cx * (j + cy * k)];
  const quad = (a: number, b: number, d: number, e: number) => {
    if (a < 0 || b < 0 || d < 0 || e < 0) return;
    tri(a, b, d);
    tri(a, d, e);
  };

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = vals[i + nx * (j + ny * k)] < 0;
        if (i < cx && j > 0 && j < cy && k > 0 && k < cz && v !== vals[i + 1 + nx * (j + ny * k)] < 0) {
          quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k));
        }
        if (j < cy && i > 0 && i < cx && k > 0 && k < cz && v !== vals[i + nx * (j + 1 + ny * k)] < 0) {
          quad(cell(i - 1, j, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i - 1, j, k));
        }
        if (k < cz && i > 0 && i < cx && j > 0 && j < cy && v !== vals[i + nx * (j + ny * (k + 1))] < 0) {
          quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k));
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
