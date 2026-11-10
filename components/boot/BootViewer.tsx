"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { getLace, getLeather, getSole, hasStamp, type BootConfig } from "@/lib/config";
import { BOOT_CENTER, GROUND_Y, buildBootGeometry, disposeBootGeometry } from "./geometry";

export type CaptureFn = () => string | null;

interface BootViewerProps {
  config: BootConfig;
  captureRef: MutableRefObject<CaptureFn | null>;
}

const BACKGROUND = "#0a0a0a";
const TARGET: [number, number, number] = [BOOT_CENTER.x, BOOT_CENTER.y, BOOT_CENTER.z];

/* ───────────────────────── materials ───────────────────────── */

/** Fine tiling grain: gives nubuck its velvety nap and leather its pores (used as a bump map). */
function makeGrainTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    const img = g.createImageData(size, size);
    // two octaves of value noise: coarse mottling + per-pixel fibre
    const coarse = new Float32Array(32 * 32).map(() => Math.random());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * 32;
        const fy = (y / size) * 32;
        const x0 = Math.floor(fx) % 32;
        const y0 = Math.floor(fy) % 32;
        const x1 = (x0 + 1) % 32;
        const y1 = (y0 + 1) % 32;
        const tx = fx - Math.floor(fx);
        const ty = fy - Math.floor(fy);
        const low =
          (coarse[x0 + y0 * 32] * (1 - tx) + coarse[x1 + y0 * 32] * tx) * (1 - ty) +
          (coarse[x0 + y1 * 32] * (1 - tx) + coarse[x1 + y1 * 32] * tx) * ty;
        const value = Math.round((0.45 * low + 0.55 * Math.random()) * 255);
        const i = (x + y * size) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.anisotropy = 4;
  return tex;
}

/** Two-tone herringbone braid for the laces (colour map and bump in one). */
function makeBraidTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const fold = v < 0.5 ? v * 2 : (1 - v) * 2;
        const phase = (((u + fold * 0.5) % 1) + 1) % 1;
        const strand = Math.abs(phase - 0.5) * 2; // 0 at strand centre → 1 at its edge
        const tone = phase < 0.5 ? 1 : 0.8;
        const value = Math.round(255 * tone * (1 - 0.3 * Math.pow(strand, 3)));
        const i = (x + y * size) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createMaterials() {
  const grain = makeGrainTexture();
  const braid = makeBraidTexture();
  const side = THREE.DoubleSide;
  return {
    textures: [grain, braid],
    upper: new THREE.MeshPhysicalMaterial({
      color: "#c07f2c",
      roughness: 0.95,
      sheen: 0.6,
      sheenRoughness: 0.5,
      clearcoatRoughness: 0.55,
      bumpMap: grain,
      bumpScale: 0.55,
    }),
    collar: new THREE.MeshPhysicalMaterial({ color: "#241d1a", roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5, bumpMap: grain, bumpScale: 0.35 }),
    laces: new THREE.MeshStandardMaterial({ color: "#c9952e", roughness: 0.9, map: braid, bumpMap: braid, bumpScale: 0.6 }),
    eyelets: new THREE.MeshStandardMaterial({ color: "#c9ccd1", roughness: 0.24, metalness: 1 }),
    stitches: new THREE.MeshStandardMaterial({ color: "#f0e2bf", roughness: 0.85 }),
    welt: new THREE.MeshStandardMaterial({ color: "#c9a064", roughness: 0.8, side }),
    midsole: new THREE.MeshStandardMaterial({ color: "#b98a4e", roughness: 0.72, side }),
    outsole: new THREE.MeshStandardMaterial({ color: "#6e431f", roughness: 0.82, side }),
    stamp: new THREE.MeshStandardMaterial({
      color: "#000000",
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      side,
    }),
  };
}

function makeStampTexture(text: string) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "#000";
    g.fillRect(0, 0, size, size);
    g.strokeStyle = g.fillStyle = "#fff";
    g.lineWidth = 14;
    g.beginPath();
    g.arc(256, 256, 214, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(256, 256, 188, 0, Math.PI * 2);
    g.stroke();
    const px = text.length <= 2 ? 190 : text.length === 3 ? 148 : 112;
    g.font = `900 ${px}px "Arial Black", Impact, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 268);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,200,130,0.16)");
    grad.addColorStop(0.45, "rgba(255,190,120,0.05)");
    grad.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ───────────────────────── boot ───────────────────────── */

function Boot({ config }: { config: BootConfig }) {
  const geo = useMemo(buildBootGeometry, []);
  const mats = useMemo(createMaterials, []);

  useEffect(
    () => () => {
      disposeBootGeometry(geo);
      const { textures, ...materials } = mats;
      textures.forEach((t) => t.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
    [geo, mats],
  );

  const leather = getLeather(config.leather);
  const lace = getLace(config.lace);
  const sole = getSole(config.sole);

  const targets = useMemo(() => {
    const upper = new THREE.Color(leather.color);
    const nubuck = leather.finish === "nubuck";
    return {
      upper,
      sheenColor: upper.clone().lerp(new THREE.Color("#ffffff"), 0.12),
      roughness: nubuck ? 0.95 : 0.58,
      sheen: nubuck ? 0.6 : 0.08,
      clearcoat: nubuck ? 0 : 0.14,
      bump: nubuck ? 0.55 : 0.22,
      stitches: new THREE.Color(leather.stitch),
      collar: new THREE.Color(leather.collar),
      laces: new THREE.Color(lace.color),
      welt: new THREE.Color(sole.welt),
      midsole: new THREE.Color(sole.midsole),
      outsole: new THREE.Color(sole.outsole),
    };
  }, [leather, lace, sole]);

  // Ease every material toward its target so swaps feel like a dissolve, not a cut.
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 8);
    mats.upper.color.lerp(targets.upper, k);
    mats.upper.sheenColor.lerp(targets.sheenColor, k);
    mats.upper.roughness += (targets.roughness - mats.upper.roughness) * k;
    mats.upper.sheen += (targets.sheen - mats.upper.sheen) * k;
    mats.upper.clearcoat += (targets.clearcoat - mats.upper.clearcoat) * k;
    mats.upper.bumpScale += (targets.bump - mats.upper.bumpScale) * k;
    mats.stitches.color.lerp(targets.stitches, k);
    mats.collar.color.lerp(targets.collar, k);
    mats.laces.color.lerp(targets.laces, k);
    mats.welt.color.lerp(targets.welt, k);
    mats.midsole.color.lerp(targets.midsole, k);
    mats.outsole.color.lerp(targets.outsole, k);
  });

  // Heel stamp: canvas text used as an alpha mask on a surface-hugging patch.
  const stampOn = hasStamp(config);
  const stampText = config.stamp.text;
  const stampFinish = config.stamp.finish;
  useEffect(() => {
    if (!stampOn) return;
    const tex = makeStampTexture(stampText);
    mats.stamp.alphaMap = tex;
    mats.stamp.needsUpdate = true;
    return () => {
      mats.stamp.alphaMap = null;
      tex.dispose();
    };
  }, [stampOn, stampText, mats]);

  useEffect(() => {
    if (stampFinish === "foil") {
      mats.stamp.color.set("#e2ae4a");
      mats.stamp.metalness = 1;
      mats.stamp.roughness = 0.28;
      mats.stamp.opacity = 1;
    } else {
      mats.stamp.color.set(leather.color).multiplyScalar(0.32);
      mats.stamp.metalness = 0;
      mats.stamp.roughness = 0.95;
      mats.stamp.opacity = 0.9;
    }
  }, [stampFinish, leather.color, mats]);

  return (
    <group>
      <mesh geometry={geo.upper} material={mats.upper} />
      <mesh geometry={geo.collar} material={mats.collar} />
      <mesh geometry={geo.laces} material={mats.laces} />
      <mesh geometry={geo.eyelets} material={mats.eyelets} />
      <mesh geometry={geo.stitches} material={mats.stitches} />
      <mesh geometry={geo.welt} material={mats.welt} />
      <mesh geometry={geo.midsole} material={mats.midsole} />
      <mesh geometry={geo.outsole} material={mats.outsole} />
      {stampOn && <mesh geometry={geo.stamp} material={mats.stamp} renderOrder={2} />}
    </group>
  );
}

/* ───────────────────────── stage ───────────────────────── */

function Floor() {
  const glow = useMemo(makeGlowTexture, []);
  useEffect(() => () => glow.dispose(), [glow]);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0.1, GROUND_Y - 0.004, 0]}>
        <circleGeometry args={[4.2, 48]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <ContactShadows
        position={[0.1, GROUND_Y, 0]}
        scale={7}
        far={1.4}
        blur={2.4}
        opacity={0.8}
        resolution={512}
        frames={1}
      />
    </>
  );
}

/** Procedural studio "HDRI": emissive cards baked once into an environment map. */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#050505"]} />
      <Lightformer form="rect" intensity={2.6} position={[0, 6, 0]} scale={[9, 9, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={2.2} color="#ffd7a3" position={[-6, 2.5, 3]} scale={[7, 3, 1]} target={[0, 0.5, 0]} />
      <Lightformer form="rect" intensity={1.8} color="#cfe0ff" position={[6, 1.5, -3]} scale={[7, 3, 1]} target={[0, 0.5, 0]} />
      <Lightformer form="rect" intensity={1} position={[1, 1.5, 7]} scale={[5, 2, 1]} target={[0, 0.5, 0]} />
      <Lightformer form="ring" intensity={3} color="#ffb45e" position={[-2, 3, -6]} scale={3} target={[0, 0.5, 0]} />
    </Environment>
  );
}

/** Keeps the whole boot framed for any aspect ratio (portrait phones need more distance). */
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useEffect(() => {
    if (!width || !height) return;
    const distance = THREE.MathUtils.clamp(6.4 / (width / height), 6.6, 12.5);
    const dir = camera.position.clone().sub(BOOT_CENTER).normalize();
    camera.position.copy(BOOT_CENTER).addScaledVector(dir, distance);
    camera.lookAt(BOOT_CENTER);
  }, [camera, width, height]);
  return null;
}

/** Exposes a synchronous high-res JPEG snapshot of the current look. */
function CaptureBridge({ captureRef }: { captureRef: MutableRefObject<CaptureFn | null> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);

  useEffect(() => {
    captureRef.current = () => {
      try {
        const previous = gl.getPixelRatio();
        gl.setPixelRatio(THREE.MathUtils.clamp(1400 / Math.max(width, 1), 1, 3));
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL("image/jpeg", 0.9);
        gl.setPixelRatio(previous);
        gl.render(scene, camera);
        return url;
      } catch {
        return null;
      }
    };
    return () => {
      captureRef.current = null;
    };
  }, [gl, scene, camera, width, captureRef]);
  return null;
}

export default function BootViewer({ config, captureRef }: BootViewerProps) {
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <Canvas
      // Clamp DPR to 2: sharp on retina, no thermal throttling on phones.
      dpr={[1, 2]}
      camera={{ position: [2.6, 1.9, 6.2], fov: 32, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      className="touch-none"
    >
      <color attach="background" args={[BACKGROUND]} />
      <ambientLight intensity={0.12} />
      <directionalLight position={[3, 6, 4]} intensity={0.9} />
      <StudioEnvironment />

      <Boot config={config} />
      <Floor />

      <CameraRig />
      <CaptureBridge captureRef={captureRef} />
      <OrbitControls
        makeDefault
        target={TARGET}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.85}
        zoomSpeed={0.8}
        minDistance={3.4}
        maxDistance={14}
        minPolarAngle={Math.PI * 0.12}
        maxPolarAngle={Math.PI * 0.6}
        autoRotate={autoRotate}
        autoRotateSpeed={0.9}
        onStart={() => setAutoRotate(false)}
        // 1 finger orbits, 2 fingers pinch-zoom (pan is disabled).
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
    </Canvas>
  );
}
