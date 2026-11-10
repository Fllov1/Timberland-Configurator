import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sdfGeometry } from "./surfaceNets";

/**
 * Fully procedural 6-inch work boot — no external assets.
 *
 * The leather upper and the padded collar are sculpted as signed distance fields
 * (smooth-blended capsules, with panels, throat, tongue and a hollow opening carved in)
 * and meshed once at start-up. Every detail that sits on the leather — stitch rows,
 * hex eyelets, braided laces, heel stamp — is ray-projected onto that same field,
 * so it always hugs the surface exactly.
 *
 * Axes: +X toe, +Y up, +Z outer side. The upper meets the welt at y = 0.
 */

const { lerp, clamp } = THREE.MathUtils;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const GROUND_Y = -0.345;
export const BOOT_CENTER = new THREE.Vector3(0.1, 0.72, 0);

/* ═════════════════════════ signed distance field ═════════════════════════ */

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Distance to a segment lying in the z = 0 plane; leaves the segment parameter in `segT`. */
let segT = 0;
function seg(px: number, py: number, pz: number, ax: number, ay: number, bx: number, by: number) {
  const bax = bx - ax;
  const bay = by - ay;
  let t = ((px - ax) * bax + (py - ay) * bay) / (bax * bax + bay * bay);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  segT = t;
  const dx = px - ax - bax * t;
  const dy = py - ay - bay * t;
  return Math.sqrt(dx * dx + dy * dy + pz * pz);
}

/** Solid boot volume: toe box + vamp, ankle column, slanted instep/shin. */
function base(x: number, y: number, z: number) {
  const footD = seg(x, y, z, -0.66, 0.04, 0.92, 0.04);
  const foot = footD - (0.44 + 0.09 * smooth(0, 0.55, segT)); // narrower heel, full ball
  const shaft = (seg(x, y, z / 0.84, -0.67, -0.4, -0.66, 2.5) - 0.54) * 0.84;
  const slant = (seg(x, y, z / 0.86, 0.14, 0.2, -0.76, 2.2) - 0.44) * 0.86;
  return smin(foot, smin(shaft, slant, 0.1), 0.16);
}

// Tilted top line: the front of the collar sits higher than the back.
const TOP_NX = -0.2 / Math.hypot(0.2, 0.98);
const TOP_NY = 0.98 / Math.hypot(0.2, 0.98);
const topDist = (x: number, y: number) => (x + 0.66) * TOP_NX + (y - 1.72) * TOP_NY;

// Front (lacing) plane of the instep, in side view.
const FRONT_N = v3(0.9119, 0.4104, 0);
const FRONT_D = v3(-0.4104, 0.9119, 0);
const FRONT_0 = v3(0.54, 0.38, 0);
const frontness = (x: number, y: number) => (x - 0.14) * FRONT_N.x + (y - 0.2) * FRONT_N.y;

/** Quarter/vamp seam in side view: runs from the heel down along the side, then up and over the vamp. */
const seamCurve = new THREE.CatmullRomCurve3(
  [
    v3(-1.3, 0.76, 0),
    v3(-1.1, 0.74, 0),
    v3(-0.7, 0.66, 0),
    v3(-0.25, 0.56, 0),
    v3(0.15, 0.47, 0),
    v3(0.4, 0.45, 0),
    v3(0.54, 0.52, 0),
    v3(0.63, 0.66, 0),
    v3(0.68, 0.9, 0),
  ],
  false,
  "centripetal",
);
const SEAM_X0 = -1.3;
const SEAM_X1 = 0.68;
const SEAM_N = 256;
const seamTable = (() => {
  const samples = seamCurve.getPoints(600);
  const table = new Float32Array(SEAM_N);
  let s = 0;
  for (let i = 0; i < SEAM_N; i++) {
    const x = lerp(SEAM_X0, SEAM_X1, i / (SEAM_N - 1));
    while (s < samples.length - 2 && samples[s + 1].x < x) s++;
    const a = samples[s];
    const b = samples[s + 1];
    table[i] = lerp(a.y, b.y, clamp((x - a.x) / Math.max(b.x - a.x, 1e-6), 0, 1));
  }
  return table;
})();
function seamY(x: number) {
  if (x >= SEAM_X1) return 5;
  if (x <= SEAM_X0) return seamTable[0];
  const f = ((x - SEAM_X0) / (SEAM_X1 - SEAM_X0)) * (SEAM_N - 1);
  const i = Math.min(Math.floor(f), SEAM_N - 2);
  return seamTable[i] + (seamTable[i + 1] - seamTable[i]) * (f - i);
}

/** Front edge of the heel counter panel (side view). */
const counterX = (y: number) => -0.42 - 0.28 * y - 0.3 * y * y;
/** Half width of the lacing throat. */
const throatHalf = (y: number) => 0.085 + 0.035 * smooth(0.6, 1.8, y);

function roundBox2(px: number, py: number, hx: number, hy: number, r: number) {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

const PANEL = 0.016;
const EDGE = 0.02;
const WALL = 0.085;
const THROAT_DEPTH = 0.036;

/** Leather upper: layered panels, lacing throat with the tongue as its floor, hollow shaft. */
function upperSdf(x: number, y: number, z: number) {
  const az = Math.abs(z);
  const b = base(x, y, z);
  const gq = y - seamY(x); // > 0 on the quarter (above the seam)
  const fr = frontness(x, y);
  const t = topDist(x, y);

  // overlapping panels: quarter over vamp, heel counter over both
  // (edges are bevelled over ~1.5 voxels so they mesh as a clean step, not a jagged one)
  const gc = Math.min(-gq, counterX(y) - x);
  let d = b - PANEL * smooth(-EDGE, EDGE, gq) - PANEL * 1.6 * smooth(-EDGE, EDGE, gc);

  // throat: a channel between the eyestays whose floor is the tongue
  const throat = Math.max(az - throatHalf(y), 0.05 - gq, -fr);
  d = Math.max(d, -Math.max(throat, -(b + THROAT_DEPTH)));

  // hollow opening, then trim along the tilted top line
  d = Math.max(d, -Math.max(b + WALL, 0.9 - y));
  d = Math.max(d, t);

  // tongue flap rising above the collar line
  const flap = Math.max(Math.abs(b + 0.066) - 0.034, roundBox2(z, t, 0.17, 0.15, 0.09), -fr) - 0.006;
  d = Math.min(d, flap);

  return Math.max(d, -y - 0.05);
}

/** Padded collar: a soft roll wrapped over the top edge, open at the eyestays. */
function collarSdf(x: number, y: number, z: number) {
  const u = base(x, y, z) / 0.062;
  const v = (topDist(x, y) + 0.135) / 0.155;
  const roll = (Math.sqrt(u * u + v * v) - 1) * 0.062;
  const front = Math.max(Math.abs(z) - 0.275, -frontness(x, y));
  return Math.max(roll, -front);
}

/* ═════════════════════════ surface queries ═════════════════════════ */

function normalAt(p: THREE.Vector3) {
  const e = 0.004;
  return v3(
    upperSdf(p.x + e, p.y, p.z) - upperSdf(p.x - e, p.y, p.z),
    upperSdf(p.x, p.y + e, p.z) - upperSdf(p.x, p.y - e, p.z),
    upperSdf(p.x, p.y, p.z + e) - upperSdf(p.x, p.y, p.z - e),
  ).normalize();
}

/** Sphere-traces the upper from `origin` along `dir`; null when the ray misses. */
function hit(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 2.6) {
  const p = origin.clone();
  let travelled = 0;
  for (let i = 0; i < 90; i++) {
    const d = upperSdf(p.x, p.y, p.z);
    if (d < 0.0008) return p;
    const step = Math.max(d * 0.7, 0.0015);
    travelled += step;
    if (travelled > maxDist) return null;
    p.addScaledVector(dir, step);
  }
  return null;
}

const sidePoint = (x: number, y: number, side: number) => hit(v3(x, y, side * 1.2), v3(0, 0, -side), 1.25);

/** Point on the lacing face: `t` runs up the instep, `z` is the lateral offset. */
function front(t: number, z: number, lift = 0) {
  const origin = FRONT_0.clone().addScaledVector(FRONT_D, t).addScaledVector(FRONT_N, 0.6);
  origin.z = z;
  const p = hit(origin, FRONT_N.clone().negate()) ?? origin.addScaledVector(FRONT_N, -0.6);
  const n = normalAt(p);
  return { p: p.addScaledVector(n, lift), n };
}

/* ═════════════════════════ mesh helpers ═════════════════════════ */

function merge(parts: THREE.BufferGeometry[], keepUv = false) {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && !(keepUv && name === "uv")) g.deleteAttribute(name);
    }
    return g;
  });
  const merged = mergeGeometries(flat, false);
  parts.forEach((p) => p.dispose());
  flat.forEach((p) => p.dispose());
  if (!merged) throw new Error("Boot geometry merge failed");
  return merged;
}

/** Skins equally sized closed rings into a smooth surface, optionally capping the last ring. */
function loft(rings: THREE.Vector3[][], capEnd = false) {
  const n = rings[0].length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const ring of rings) for (const p of ring) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + j;
      const d = (i + 1) * n + ((j + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  }
  if (capEnd) {
    const last = rings.length - 1;
    const centre = rings[last].reduce((acc, p) => acc.add(p), v3(0, 0, 0)).multiplyScalar(1 / n);
    const ci = pos.length / 3;
    pos.push(centre.x, centre.y, centre.z);
    for (let j = 0; j < n; j++) idx.push(ci, last * n + j, last * n + ((j + 1) % n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ═════════════════════════ stitching ═════════════════════════ */

interface StitchStyle {
  pitch: number;
  length: number;
  width: number;
  normal?: THREE.Vector3;
}
const THREAD: StitchStyle = { pitch: 0.046, length: 0.031, width: 0.009 };
const WELT_THREAD: StitchStyle = { pitch: 0.068, length: 0.046, width: 0.014, normal: v3(0, 1, 0) };

/** Lays individual thread stitches along a polyline that lies on the leather. */
function stitchRun(path: THREE.Vector3[], out: THREE.BufferGeometry[], style: StitchStyle = THREAD) {
  if (path.length < 2) return;
  const basis = new THREE.Matrix4();
  let next = style.pitch / 2;
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = a.distanceTo(b);
    if (len > 0.2) {
      // a jump means the row was interrupted — never bridge it with a stitch
      walked += len;
      next = walked + style.pitch / 2;
      continue;
    }
    while (next <= walked + len) {
      const p = a.clone().lerp(b, (next - walked) / len);
      const n = style.normal ?? normalAt(p);
      const tangent = b.clone().sub(a);
      tangent.addScaledVector(n, -tangent.dot(n)).normalize();
      const binormal = v3(0, 0, 0).crossVectors(tangent, n);
      const box = new THREE.BoxGeometry(style.length, style.width * 0.75, style.width);
      basis.makeBasis(tangent, n, binormal).setPosition(p.addScaledVector(n, style.width * 0.2));
      box.applyMatrix4(basis);
      out.push(box);
      next += style.pitch;
    }
    walked += len;
  }
}

function buildStitches(outline: OutlinePoint[]) {
  const parts: THREE.BufferGeometry[] = [];
  const seamSamples = seamCurve.getSpacedPoints(160);

  for (const side of [1, -1]) {
    // quad-row seam along the quarter, continued around the heel
    for (let row = 0; row < 4; row++) {
      const offset = 0.03 + row * 0.025;
      const path: THREE.Vector3[] = [];
      for (let a = 0; a <= 24; a++) {
        const phi = lerp(Math.PI, Math.PI * 0.62, a / 24);
        const origin = v3(-0.66 + 1.3 * Math.cos(phi), 0.745 + offset, side * 1.3 * Math.sin(phi));
        const p = hit(origin, v3(-Math.cos(phi), 0, -side * Math.sin(phi)));
        if (p && p.x < -1.08) path.push(p);
      }
      for (let i = 0; i < seamSamples.length; i++) {
        const s = seamSamples[i];
        const tan = seamCurve.getTangentAt(i / (seamSamples.length - 1));
        const x = s.x - tan.y * offset;
        const y = s.y + tan.x * offset;
        if (x < -1.08) continue;
        const p = sidePoint(x, y, side);
        if (p) path.push(p);
      }
      stitchRun(path, parts);
    }

    // double row along the heel counter edge
    for (const inset of [0.03, 0.056]) {
      const path: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const y = lerp(0.035, 0.72, i / 40);
        const x = counterX(y) - inset;
        if (y > seamY(x) - 0.025) break;
        const p = sidePoint(x, y, side);
        if (p) path.push(p);
      }
      stitchRun(path, parts);
    }

    // double row down each eyestay
    for (const inset of [0.148, 0.176]) {
      const path: THREE.Vector3[] = [];
      for (let i = 0; i <= 70; i++) {
        const t = lerp(0.2, 1.52, i / 70);
        const y = FRONT_0.y + FRONT_D.y * t;
        path.push(front(t, side * (throatHalf(y) + inset)).p);
      }
      stitchRun(path, parts);
    }

    // collar seam, just under the padded roll
    for (const drop of [0.325, 0.352]) {
      const path: THREE.Vector3[] = [];
      for (let a = 0; a <= 60; a++) {
        const phi = lerp(Math.PI, 0.5, a / 60);
        const dir = v3(Math.cos(phi), 0, side * Math.sin(phi));
        const xs = -0.64 + 0.5 * dir.x;
        const y = 1.72 + (0.2 * (xs + 0.66) - drop) / 0.98;
        const p = hit(v3(-0.64, y, 0).addScaledVector(dir, 1.3), dir.clone().negate());
        if (p && Math.abs(p.z) > throatHalf(p.y) + 0.2) path.push(p);
      }
      stitchRun(path, parts);
    }
  }

  // back seam: one row each side of the centre line
  for (const z of [0.022, -0.022]) {
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const p = hit(v3(-2, lerp(0.8, 1.36, i / 40), z), v3(1, 0, 0));
      if (p) path.push(p);
    }
    stitchRun(path, parts);
  }

  // the signature welt stitch, running the whole perimeter
  const welt = outline.map((o) => v3(o.x + o.nx * 0.042, 0.004, o.z + o.nz * 0.042));
  welt.push(welt[0].clone());
  stitchRun(welt, parts, WELT_THREAD);

  return merge(parts);
}

/* ═════════════════════════ hardware & laces ═════════════════════════ */

const EYELET_PAIRS = 7;
const EYELET_T0 = 0.36;
const EYELET_T1 = 1.47;
const LACE_R = 0.019;

function hexEyelet() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 0.05;
    const y = Math.sin(a) * 0.05;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.024, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelSize: 0.005,
    bevelThickness: 0.005,
    bevelSegments: 2,
    curveSegments: 14,
  });
  g.translate(0, 0, -0.002);
  return g;
}

/** Tube with U scaled by its length so the braid texture keeps a constant pitch. */
function laceTube(points: THREE.Vector3[], closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const length = curve.getLength();
  const g = new THREE.TubeGeometry(curve, Math.max(10, Math.round(length / 0.022)), LACE_R, 8, closed);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (length / 0.085), uv.getY(i) * 2);
  return g;
}

function buildLacing() {
  const eyelets: THREE.BufferGeometry[] = [];
  const laces: THREE.BufferGeometry[] = [];
  const template = hexEyelet();
  const quat = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const zAxis = v3(0, 0, 1);

  type Eye = { p: THREE.Vector3; n: THREE.Vector3 };
  const left: Eye[] = [];
  const right: Eye[] = [];
  const ts: number[] = [];

  for (let i = 0; i < EYELET_PAIRS; i++) {
    const t = lerp(EYELET_T0, EYELET_T1, i / (EYELET_PAIRS - 1));
    ts.push(t);
    const y = FRONT_0.y + FRONT_D.y * t;
    for (const side of [1, -1]) {
      const eye = front(t, side * (throatHalf(y) + 0.078));
      const g = template.clone();
      quat.setFromUnitVectors(zAxis, eye.n);
      m.makeRotationFromQuaternion(quat).setPosition(eye.p);
      g.applyMatrix4(m);
      eyelets.push(g);
      (side === 1 ? left : right).push(eye);
    }
  }
  template.dispose();

  // A lace leaves one eyelet, arcs over the tongue and dives into the other.
  const span = (a: Eye, b: Eye, tMid: number, lift: number) => {
    const mid = front(tMid, 0);
    const crown = mid.p.clone().addScaledVector(mid.n, 0.075 + lift);
    return laceTube([
      a.p.clone().addScaledVector(a.n, -0.022),
      a.p.clone().addScaledVector(a.n, 0.03),
      a.p.clone().lerp(b.p, 0.5).setZ(0).lerp(crown, 0.85),
      b.p.clone().addScaledVector(b.n, 0.03),
      b.p.clone().addScaledVector(b.n, -0.022),
    ]);
  };

  laces.push(span(left[0], right[0], ts[0], 0));
  for (let i = 0; i < EYELET_PAIRS - 1; i++) {
    const tMid = (ts[i] + ts[i + 1]) / 2;
    const over = i % 2 === 0;
    laces.push(span(left[i], right[i + 1], tMid, over ? 0.02 : -0.012));
    laces.push(span(right[i], left[i + 1], tMid, over ? -0.012 : 0.02));
  }

  // Bow tied over the top pair.
  const last = EYELET_PAIRS - 1;
  const tk = ts[last] - 0.04;
  const knot = front(tk, 0, 0.1).p;
  const sphere = new THREE.SphereGeometry(0.045, 12, 10);
  sphere.scale(1.25, 0.9, 0.9);
  sphere.translate(knot.x, knot.y, knot.z);
  laces.push(sphere);
  const at = (dt: number, z: number, lift: number) => front(tk + dt, z, Math.abs(z) > 0.26 ? Math.max(lift, 0.1) : lift).p;

  const ends: [Eye, number][] = [
    [left[last], 1],
    [right[last], -1],
  ];
  for (const [eye, s] of ends) {
    laces.push(
      laceTube([eye.p.clone().addScaledVector(eye.n, -0.022), eye.p.clone().addScaledVector(eye.n, 0.035), at(0.0, s * 0.07, 0.09), knot.clone()]),
      // loop
      laceTube([knot.clone(), at(0.07, s * 0.15, 0.1), at(0.03, s * 0.31, 0.1), at(-0.1, s * 0.33, 0.1), at(-0.09, s * 0.16, 0.09)], true),
      // loose end
      laceTube([knot.clone(), at(-0.1, s * 0.07, 0.1), at(-0.27, s * 0.14, 0.085), at(-0.43, s * 0.12, 0.085), at(-0.5, s * 0.16, 0.08)]),
    );
  }

  return { eyelets: merge(eyelets), laces: merge(laces, true) };
}

/* ═════════════════════════ sole unit ═════════════════════════ */

interface OutlinePoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

/** Footprint of the upper where it meets the welt, traced from the field itself. */
function traceOutline(count = 168): OutlinePoint[] {
  const cx = 0.1;
  const pts: OutlinePoint[] = [];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let lo = 0.1;
    let hi = 2.2;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (base(cx + dx * mid, 0, dz * mid) < 0) lo = mid;
      else hi = mid;
    }
    const x = cx + dx * lo;
    const z = dz * lo;
    const e = 0.004;
    const gx = base(x + e, 0, z) - base(x - e, 0, z);
    const gz = base(x, 0, z + e) - base(x, 0, z - e);
    const len = Math.hypot(gx, gz) || 1;
    pts.push({ x, z, nx: gx / len, nz: gz / len });
  }
  return pts;
}

/** Underside of the outsole body, with a little toe spring. */
const soleBottom = (x: number) => -0.255 + 0.075 * smooth(0.7, 1.5, x);

function buildSole(outline: OutlinePoint[]) {
  const ring = (offset: number, y: number | ((x: number) => number)) =>
    outline.map((o) => {
      const x = o.x + o.nx * offset;
      return v3(x, typeof y === "number" ? y : y(x), o.z + o.nz * offset);
    });

  const welt = loft([ring(-0.06, 0.004), ring(0.07, 0.004), ring(0.082, -0.006), ring(0.082, -0.034), ring(0.06, -0.04)]);
  const midsole = loft([ring(0.06, -0.036), ring(0.074, -0.044), ring(0.076, -0.1), ring(0.062, -0.108)]);

  const body = loft(
    [
      ring(0.05, -0.104),
      ring(0.088, -0.118),
      ring(0.094, -0.15),
      ring(0.08, -0.158), // side groove
      ring(0.094, -0.168),
      ring(0.094, (x) => soleBottom(x) + 0.04),
      ring(0.08, (x) => soleBottom(x) + 0.008),
      ring(0.05, soleBottom),
    ],
    true,
  );

  // Perimeter lugs: tapered blocks separated by deep grooves.
  const lugs: THREE.BufferGeometry[] = [];
  const up = v3(0, 1, 0);
  const basis = new THREE.Matrix4();
  const lugDepth = 0.09;
  const taper = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setXYZ(i, p.getX(i) * 0.8, p.getY(i), p.getZ(i) * 0.86);
    g.computeVertexNormals();
    return g;
  };

  const rim = ring(0.09, 0);
  let walked = 0;
  let next = 0;
  const pitch = 0.215;
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i];
    const b = rim[(i + 1) % rim.length];
    const len = a.distanceTo(b);
    while (next <= walked + len) {
      const p = a.clone().lerp(b, (next - walked) / len);
      const o = outline[i];
      const inward = v3(-o.nx, 0, -o.nz);
      const tangent = v3(0, 0, 0).crossVectors(up, inward).normalize();
      const block = taper(new THREE.BoxGeometry(0.15, lugDepth + 0.03, 0.2));
      const top = soleBottom(p.x) + 0.03;
      basis.makeBasis(tangent, up, inward).setPosition(p.x + inward.x * 0.1, top - (lugDepth + 0.03) / 2, p.z + inward.z * 0.1);
      block.applyMatrix4(basis);
      lugs.push(block);
      next += pitch;
    }
    walked += len;
  }

  // Centre tread: chevron bars under the forefoot and the heel.
  const chevron = (x: number) => {
    for (const s of [1, -1]) {
      const bar = taper(new THREE.BoxGeometry(0.1, lugDepth * 0.9 + 0.03, 0.25));
      bar.rotateY(s * 0.5);
      bar.translate(x, soleBottom(x) + 0.03 - (lugDepth * 0.9 + 0.03) / 2, s * 0.13);
      lugs.push(bar);
    }
  };
  for (let x = -0.98; x <= -0.52; x += 0.2) chevron(x);
  for (let x = 0.0; x <= 1.05; x += 0.2) chevron(x);

  return { welt, midsole, outsole: merge([body, ...lugs]) };
}

/* ═════════════════════════ heel stamp ═════════════════════════ */

/** Decal patch conforming to the outer heel counter (has UVs for the stamp mask). */
function buildStampPatch() {
  const N = 16;
  const cx = -0.86;
  const cy = 0.35;
  const half = 0.18;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const v = j / N;
      const p = sidePoint(cx + (u - 0.5) * 2 * half, cy + (v - 0.5) * 2 * half, 1) ?? v3(cx, cy, 0.5);
      const n = normalAt(p);
      p.addScaledVector(n, 0.004);
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ═════════════════════════ assembly ═════════════════════════ */

export interface BootGeometry {
  upper: THREE.BufferGeometry;
  collar: THREE.BufferGeometry;
  laces: THREE.BufferGeometry;
  eyelets: THREE.BufferGeometry;
  stitches: THREE.BufferGeometry;
  welt: THREE.BufferGeometry;
  midsole: THREE.BufferGeometry;
  outsole: THREE.BufferGeometry;
  stamp: THREE.BufferGeometry;
}

/** Grid pitch of the sculpted meshes. Lower = sharper panel edges, more triangles. */
const VOXEL = 0.02;

export function buildBootGeometry(): BootGeometry {
  const outline = traceOutline();
  const { eyelets, laces } = buildLacing();
  const sole = buildSole(outline);

  return {
    upper: sdfGeometry(upperSdf, { min: [-1.32, -0.09, 0], max: [1.56, 2.1, 0.66] }, VOXEL),
    collar: sdfGeometry(collarSdf, { min: [-1.36, 1.28, 0], max: [0.12, 2.0, 0.62] }, VOXEL),
    laces,
    eyelets,
    stitches: buildStitches(outline),
    ...sole,
    stamp: buildStampPatch(),
  };
}

export function disposeBootGeometry(g: BootGeometry) {
  Object.values(g).forEach((geo: THREE.BufferGeometry) => geo.dispose());
}
