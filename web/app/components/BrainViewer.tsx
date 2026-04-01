"use client";

import { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { buildColorArray, getBaseColor } from "../lib/colormap";
import type { BrainMeshData } from "../lib/types";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const LERP_SPEED = 4.0;
const OPEN_SPREAD = 0.90;
const OPEN_ROTATE = Math.PI * 0.25;
const ANIM_SPEED = 2.5;

const CAM_CLOSED = new THREE.Vector3(-5, 0.5, 1.5);
const CAM_OPEN = new THREE.Vector3(0, 1.0, 5.0);

interface HemiGeometries {
  left: THREE.BufferGeometry;
  right: THREE.BufferGeometry;
  nLeft: number;
}

function buildHemispheres(meshData: BrainMeshData): HemiGeometries {
  const allVerts = new Float32Array(meshData.vertices);
  const allFaces = new Uint32Array(meshData.faces);
  const nLeft = meshData.n_left;
  const nTotal = meshData.n_vertices;

  const bbox = new THREE.Box3();
  for (let i = 0; i < nTotal; i++) {
    bbox.expandByPoint(new THREE.Vector3(allVerts[i * 3], allVerts[i * 3 + 1], allVerts[i * 3 + 2]));
  }
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const scale = 2.0 / Math.max(size.x, size.y, size.z);

  for (let i = 0; i < nTotal; i++) {
    allVerts[i * 3] = (allVerts[i * 3] - center.x) * scale;
    allVerts[i * 3 + 1] = (allVerts[i * 3 + 1] - center.y) * scale;
    allVerts[i * 3 + 2] = (allVerts[i * 3 + 2] - center.z) * scale;
  }

  const leftFaces: number[] = [];
  const rightFaces: number[] = [];
  const nFaces = allFaces.length / 3;
  for (let f = 0; f < nFaces; f++) {
    const a = allFaces[f * 3], b = allFaces[f * 3 + 1], c = allFaces[f * 3 + 2];
    if (a < nLeft && b < nLeft && c < nLeft) {
      leftFaces.push(a, b, c);
    } else if (a >= nLeft && b >= nLeft && c >= nLeft) {
      rightFaces.push(a - nLeft, b - nLeft, c - nLeft);
    }
  }

  const base = getBaseColor();

  function makeGeo(verts: Float32Array, faces: number[], nVerts: number) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(faces), 1));
    geo.computeVertexNormals();
    geo.rotateX(-Math.PI / 2);
    const colors = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) {
      colors[i * 3] = base[0];
      colors[i * 3 + 1] = base[1];
      colors[i * 3 + 2] = base[2];
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }

  const leftVerts = allVerts.slice(0, nLeft * 3);
  const rightVerts = allVerts.slice(nLeft * 3, nTotal * 3);

  return {
    left: makeGeo(leftVerts, leftFaces, nLeft),
    right: makeGeo(rightVerts, rightFaces, nTotal - nLeft),
    nLeft,
  };
}

interface HemiMeshProps {
  geometry: THREE.BufferGeometry;
  activations: Float32Array | null;
}

function HemiMesh({ geometry, activations }: HemiMeshProps) {
  const colorsRef = useRef<THREE.BufferAttribute | null>(null);
  const targetRef = useRef<Float32Array | null>(null);
  const currentRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const attr = geometry.getAttribute("color") as THREE.BufferAttribute;
    colorsRef.current = attr;
    currentRef.current = new Float32Array(attr.array as Float32Array);
    targetRef.current = new Float32Array(attr.array as Float32Array);
  }, [geometry]);

  useEffect(() => {
    if (activations) targetRef.current = new Float32Array(activations);
  }, [activations]);

  useFrame((_, delta) => {
    const attr = colorsRef.current;
    const tgt = targetRef.current;
    const cur = currentRef.current;
    if (!attr || !tgt || !cur) return;
    const arr = attr.array as Float32Array;
    const t = Math.min(1, delta * LERP_SPEED);
    let changed = false;
    for (let i = 0; i < arr.length; i++) {
      const d = tgt[i] - cur[i];
      if (Math.abs(d) > 0.001) {
        cur[i] += d * t;
        arr[i] = cur[i];
        changed = true;
      }
    }
    if (changed) attr.needsUpdate = true;
  });

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

interface BrainGroupProps {
  meshData: BrainMeshData;
  activations: number[] | null;
  isOpen: boolean;
  autoRotate: boolean;
}

function BrainGroup({ meshData, activations, isOpen, autoRotate }: BrainGroupProps) {
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const wrapRef = useRef<THREE.Group>(null);

  const hemi = useMemo(() => buildHemispheres(meshData), [meshData]);

  const leftColors = useMemo(() => {
    if (!activations) return null;
    const slice = activations.slice(0, hemi.nLeft);
    return buildColorArray(slice, 0, 1);
  }, [activations, hemi.nLeft]);

  const rightColors = useMemo(() => {
    if (!activations) return null;
    const slice = activations.slice(hemi.nLeft);
    return buildColorArray(slice, 0, 1);
  }, [activations, hemi.nLeft]);

  const targetOpen = useRef(0);
  const currentOpen = useRef(0);

  useEffect(() => {
    targetOpen.current = isOpen ? 1 : 0;
  }, [isOpen]);

  useFrame((_, delta) => {
    const diff = targetOpen.current - currentOpen.current;
    if (Math.abs(diff) > 0.001) {
      currentOpen.current += diff * Math.min(1, delta * ANIM_SPEED);
    }
    const t = currentOpen.current;

    if (leftRef.current) {
      leftRef.current.position.x = -t * OPEN_SPREAD;
      leftRef.current.rotation.y = -t * OPEN_ROTATE;
    }
    if (rightRef.current) {
      rightRef.current.position.x = t * OPEN_SPREAD;
      rightRef.current.rotation.y = t * OPEN_ROTATE;
    }

    if (wrapRef.current && autoRotate && !activations && !isOpen) {
      wrapRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={wrapRef}>
      <group ref={leftRef}>
        <HemiMesh geometry={hemi.left} activations={leftColors} />
      </group>
      <group ref={rightRef}>
        <HemiMesh geometry={hemi.right} activations={rightColors} />
      </group>
    </group>
  );
}

function SceneControls({ isOpen, onInteraction }: { isOpen: boolean; onInteraction: () => void }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const targetPos = useRef(CAM_CLOSED.clone());
  const isAnimating = useRef(false);

  useEffect(() => {
    targetPos.current.copy(isOpen ? CAM_OPEN : CAM_CLOSED);
    isAnimating.current = true;
  }, [isOpen]);

  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const handler = () => onInteraction();
    c.addEventListener("start", handler);
    return () => c.removeEventListener("start", handler);
  }, [onInteraction]);

  useFrame(({ camera }, delta) => {
    if (!isAnimating.current) return;
    const t = Math.min(1, delta * 3.0);
    camera.position.lerp(targetPos.current, t);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    const dist = camera.position.distanceTo(targetPos.current);
    if (dist < 0.05) {
      camera.position.copy(targetPos.current);
      isAnimating.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.04}
      rotateSpeed={0.35}
      zoomSpeed={0.3}
      panSpeed={0.3}
      minDistance={2.5}
      maxDistance={12}
      enablePan={false}
    />
  );
}

function ActivityLegend() {
  return (
    <div className="absolute top-4 left-4 flex items-center gap-2 select-none">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Low</span>
      <div
        className="w-24 h-1.5 rounded-full"
        style={{
          background: "linear-gradient(to right, #661a04, #e04010, #ff8820, #ffd060, #ffffff)",
        }}
      />
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">High</span>
      <span className="text-[10px] text-zinc-600 ml-1">Activity</span>
    </div>
  );
}

interface BrainViewerProps {
  meshData: BrainMeshData | null;
  activations: number[] | null;
}

export default function BrainViewer({ meshData, activations }: BrainViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const stopAutoRotate = useCallback(() => setAutoRotate(false), []);

  if (!meshData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading brain mesh...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-black">
      <Canvas
        camera={{ position: [-5, 0.5, 1.5], fov: 35, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ background: "#000000" }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.9} color="#ffffff" />
        <directionalLight position={[-4, 2, -3]} intensity={0.3} color="#dde0e8" />
        <directionalLight position={[0, -3, 4]} intensity={0.15} color="#ffffff" />
        <directionalLight position={[2, 6, -1]} intensity={0.25} color="#fff5e0" />
        <BrainGroup meshData={meshData} activations={activations} isOpen={isOpen} autoRotate={autoRotate} />
        <SceneControls isOpen={isOpen} onInteraction={stopAutoRotate} />
      </Canvas>

      <ActivityLegend />

      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 select-none z-10">
        <button
          onClick={() => setIsOpen(false)}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            !isOpen
              ? "bg-violet-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Closed
        </button>
        <button
          onClick={() => setIsOpen(true)}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isOpen
              ? "bg-violet-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Open
        </button>
      </div>

      {!activations && (
        <div className="absolute top-4 right-4 text-[10px] text-zinc-700 select-none">
          drag to rotate &middot; scroll to zoom
        </div>
      )}
    </div>
  );
}
