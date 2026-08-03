'use client';
// 3D Hero — a slowly rotating ring of brass cubes suspended in real light.
// No bloom. No particles. No neon. The motion is gravity-like, not jelly-like.
import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const Canvas = dynamic(() => import('@react-three/fiber').then((m) => m.Canvas), { ssr: false });
const Group = dynamic(() => import('@react-three/fiber').then((m) => m.group), { ssr: false });
const Mesh = dynamic(() => import('@react-three/fiber').then((m) => m.mesh), { ssr: false });
const MeshStandardMaterial = dynamic(
  () => import('@react-three/fiber').then((m) => m.MeshStandardMaterial as any),
  { ssr: false }
);
const AmbientLight = dynamic(() => import('@react-three/fiber').then((m) => m.AmbientLight as any), { ssr: false });
const DirectionalLight = dynamic(() => import('@react-three/fiber').then((m) => m.DirectionalLight as any), { ssr: false });
const FrameLoop = 'always' as const;
const ThreeMath = dynamic(() => import('three'), { ssr: false });

function Cubes({ count = 11 }: { count?: number }) {
  const [reduced, setReduced] = useState(false);
  const ref = useRef<any>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!ref.current || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      ref.current.rotation.y = t * 0.08;
      // Tiny vertical breathing so the form feels suspended, not floating.
      ref.current.rotation.x = Math.sin(t * 0.4) * 0.05;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const items = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const r = 1.7;
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle * 0.5) * 0.4,
      z: Math.sin(angle) * r,
      key: i
    };
  });

  return (
    <group ref={ref as any}>
      {items.map((p) => (
        <mesh key={p.key} position={[p.x, p.y, p.z]} rotation={[p.x * 0.3, p.y * 0.3, 0]}>
          <boxGeometry args={[0.18, 0.18, 0.18]} />
          <meshStandardMaterial color="#9F7E3F" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {/* Center "vault" — a beveled cylinder ring. Slightly inset so it reads as the subject. */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[054, 0, 16, 64]} />
        <meshStandardMaterial color="#C9A86A" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}

export default function Hero3D() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 select-none">
      <Suspense fallback={null}>
        <Canvas dpr={[1, 2]} frameloop={FrameLoop} gl={{ antialias: true, alpha: true }}>
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 4, 2]} intensity={1.1} color="#fff" />
          <directionalLight position={[-3, -2, -1]} intensity={0.3} color="#C9A86A" />
          <Cubes />
        </Canvas>
      </Suspense>
    </div>
  );
}
