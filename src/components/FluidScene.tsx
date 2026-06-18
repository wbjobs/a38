import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { fluidSim } from '../gpu/FluidSimulator';
import { useSimStore } from '../store/useSimStore';
import { PARTICLE_COUNT, ObstacleType, WORLD_SIZE, OBSTACLE_RADIUS } from '../utils/constants';

interface Props {
  onReady: (ok: boolean) => void;
}

export default function FluidScene({ onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paramsRef = useRef({
    isEmitting: false,
    viscosity: 0.01,
    emitRate: 400,
    obstacleType: 'torus' as ObstacleType,
    obstacleRotationSpeed: 60,
    flowSpeed: 0.15,
  });
  const setFps = useSimStore((s) => s.setFps);
  const setActiveParticles = useSimStore((s) => s.setActiveParticles);
  const storeState = useSimStore.getState();
  paramsRef.current.isEmitting = storeState.isEmitting;
  paramsRef.current.viscosity = storeState.viscosity;
  paramsRef.current.emitRate = storeState.emitRate;
  paramsRef.current.obstacleType = storeState.obstacleType;
  paramsRef.current.obstacleRotationSpeed = storeState.obstacleRotationSpeed;
  paramsRef.current.flowSpeed = storeState.flowSpeed;

  useEffect(() => {
    return useSimStore.subscribe((state) => {
      paramsRef.current.isEmitting = state.isEmitting;
      paramsRef.current.viscosity = state.viscosity;
      paramsRef.current.emitRate = state.emitRate;
      paramsRef.current.obstacleType = state.obstacleType;
      paramsRef.current.obstacleRotationSpeed = state.obstacleRotationSpeed;
      paramsRef.current.flowSpeed = state.flowSpeed;
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    const init = async () => {
      const simOk = await fluidSim.init();
      if (disposed || !containerRef.current) return;
      onReady(simOk);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0e1a);
      scene.fog = new THREE.FogExp2(0x0a0e1a, 0.055);

      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
      camera.position.set(0, 2.2, 6.5);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      containerRef.current.appendChild(renderer.domElement);

      const ambient = new THREE.AmbientLight(0xffffff, 0.2);
      scene.add(ambient);

      const light1 = new THREE.PointLight(0x88ccff, 60, 25, 1.5);
      light1.position.set(-4, 4, 4);
      scene.add(light1);

      const light2 = new THREE.PointLight(0xbb77ff, 45, 25, 1.5);
      light2.position.set(4, -2, -4);
      scene.add(light2);

      const rimLight = new THREE.DirectionalLight(0x4488ff, 0.4);
      rimLight.position.set(0, 3, -5);
      scene.add(rimLight);

      const createObstacle = (type: ObstacleType): THREE.Mesh => {
        let geo: THREE.BufferGeometry;
        switch (type) {
          case 'sphere':
            geo = new THREE.SphereGeometry(OBSTACLE_RADIUS * (WORLD_SIZE / 2), 64, 48);
            break;
          case 'torusKnot':
            geo = new THREE.TorusKnotGeometry(OBSTACLE_RADIUS * 0.9 * 0.5, OBSTACLE_RADIUS * 0.9 * 0.18, 160, 32, 2, 3);
            break;
          default:
            geo = new THREE.TorusGeometry(OBSTACLE_RADIUS * (WORLD_SIZE / 2), OBSTACLE_RADIUS * 0.35 * (WORLD_SIZE / 2), 48, 120);
        }
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xe8b4b8,
          metalness: 0.85,
          roughness: 0.18,
          transmission: 0.55,
          thickness: 0.6,
          ior: 1.5,
          transparent: true,
          opacity: 0.88,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
          sheen: 0.5,
          sheenRoughness: 0.5,
          emissive: 0x331122,
          emissiveIntensity: 0.08,
        });
        const mesh = new THREE.Mesh(geo, mat);
        return mesh;
      };

      let obstacleMesh = createObstacle(paramsRef.current.obstacleType);
      scene.add(obstacleMesh);

      const shellGeo = new THREE.BoxGeometry(WORLD_SIZE, WORLD_SIZE, WORLD_SIZE);
      const shellMat = new THREE.MeshBasicMaterial({
        color: 0x112244,
        transparent: true,
        opacity: 0.04,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      scene.add(shell);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(shellGeo),
        new THREE.LineBasicMaterial({ color: 0x224488, transparent: true, opacity: 0.25 })
      );
      scene.add(edges);

      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const colors = new Float32Array(PARTICLE_COUNT * 3);
      const sizes = new Float32Array(PARTICLE_COUNT);
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions[i * 3] = 1000;
        positions[i * 3 + 1] = 1000;
        positions[i * 3 + 2] = 1000;
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 1;
        sizes[i] = 0;
      }

      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      pGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

      const pMat = new THREE.ShaderMaterial({
        uniforms: {
          uPixelRatio: { value: renderer.getPixelRatio() },
          uTime: { value: 0 },
        },
        vertexShader: `
          attribute float aSize;
          varying vec3 vColor;
          varying float vLife;
          uniform float uPixelRatio;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uPixelRatio * (280.0 / -mv.z);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            if (d > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, d);
            alpha = pow(alpha, 1.5);
            vec3 col = vColor + 0.15 * (1.0 - d) * vColor;
            gl_FragColor = vec4(col, alpha);
          }
        `,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(pGeo, pMat);
      scene.add(points);

      const resize = () => {
        if (!containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener('resize', resize);

      let dragging = false;
      let prevX = 0, prevY = 0;
      let azimuth = 0;
      let polar = Math.PI * 0.35;
      let distance = 7.2;
      const targetAz = { v: 0 };
      const targetPol = { v: Math.PI * 0.35 };
      const targetDist = { v: 7.2 };

      const applyCam = () => {
        const cp = Math.cos(polar), sp = Math.sin(polar);
        const ca = Math.cos(azimuth), sa = Math.sin(azimuth);
        camera.position.set(
          distance * sp * sa,
          distance * cp,
          distance * sp * ca
        );
        camera.lookAt(0, 0, 0);
      };
      applyCam();

      const canvas = renderer.domElement;
      const onDown = (e: PointerEvent) => {
        dragging = true;
        prevX = e.clientX; prevY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      };
      const onUp = (e: PointerEvent) => {
        dragging = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        targetAz.v -= dx * 0.007;
        targetPol.v = Math.max(0.12, Math.min(Math.PI * 0.49, targetPol.v - dy * 0.007));
        prevX = e.clientX; prevY = e.clientY;
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        targetDist.v = Math.max(3.5, Math.min(14, targetDist.v + e.deltaY * 0.005));
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('wheel', onWheel, { passive: false });

      let lastTime = performance.now();
      let fpsAccum = 0;
      let fpsFrames = 0;
      let fpsTimer = 0;
      let running = true;

      const updateObstacle = (type: ObstacleType) => {
        scene.remove(obstacleMesh);
        obstacleMesh.geometry.dispose();
        (obstacleMesh.material as THREE.Material).dispose();
        obstacleMesh = createObstacle(type);
        scene.add(obstacleMesh);
      };
      let lastObstacleType: ObstacleType = paramsRef.current.obstacleType;

      const loop = async () => {
        if (!running) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        fpsAccum += dt;
        fpsFrames++;
        fpsTimer += dt;
        if (fpsTimer > 0.35) {
          setFps(Math.round(fpsFrames / fpsAccum));
          fpsAccum = 0; fpsFrames = 0; fpsTimer = 0;
        }

        azimuth += (targetAz.v - azimuth) * 0.12;
        polar += (targetPol.v - polar) * 0.12;
        distance += (targetDist.v - distance) * 0.12;
        applyCam();

        if (paramsRef.current.obstacleType !== lastObstacleType) {
          updateObstacle(paramsRef.current.obstacleType);
          lastObstacleType = paramsRef.current.obstacleType;
          fluidSim.regenerateSDF(paramsRef.current.obstacleType, fluidSim.rotationAngle);
        }

        const yaw = paramsRef.current.obstacleRotationSpeed * Math.PI / 180;
        obstacleMesh.rotation.y += yaw * dt;
        obstacleMesh.rotation.x = Math.sin(now * 0.0004) * 0.08;

        light1.position.x = Math.sin(now * 0.0003) * 5;
        light1.position.z = Math.cos(now * 0.0003) * 5;

        const posAttr = pGeo.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = pGeo.getAttribute('color') as THREE.BufferAttribute;
        const sizeAttr = pGeo.getAttribute('aSize') as THREE.BufferAttribute;

        if (simOk) {
          try {
            const result = await fluidSim.step({
              dt,
              viscosity: paramsRef.current.viscosity,
              flowSpeed: paramsRef.current.flowSpeed,
              isEmitting: paramsRef.current.isEmitting,
              emitRate: paramsRef.current.emitRate,
              obstacleType: paramsRef.current.obstacleType,
              obstacleRotationSpeed: paramsRef.current.obstacleRotationSpeed,
            });

            if (result.positionData) {
              const posArr = posAttr.array as Float32Array;
              const colArr = colAttr.array as Float32Array;
              const sizeArr = sizeAttr.array as Float32Array;
              const pd = result.positionData;
              const half = WORLD_SIZE / 2;

              for (let i = 0; i < PARTICLE_COUNT; i++) {
                const life = pd[i * 4 + 3];
                if (life > 0 && Math.abs(pd[i * 4]) < 50) {
                  posArr[i * 3] = pd[i * 4] * half;
                  posArr[i * 3 + 1] = pd[i * 4 + 1] * half;
                  posArr[i * 3 + 2] = pd[i * 4 + 2] * half;

                  const vx = pd[i * 4 + 0];
                  const vy = pd[i * 4 + 1];
                  const vz = pd[i * 4 + 2];
                  const t = Math.min(1, Math.sqrt(vx*vx + vy*vy + vz*vz) * 1.2 + 0.15 * life);

                  const r = 0.05 + t * 0.44;
                  const g = 0.72 + (1 - t) * 0.2;
                  const b = 0.95 + (1 - t) * 0.05;
                  colArr[i * 3] = r;
                  colArr[i * 3 + 1] = g - t * 0.2;
                  colArr[i * 3 + 2] = b - t * 0.35;

                  const fadeIn = Math.min(1, life * 4);
                  const fadeOut = life > 5 ? Math.max(0, 1 - (life - 5) * 2) : 1;
                  sizeArr[i] = 0.032 * fadeIn * fadeOut;
                } else {
                  posArr[i * 3] = 10000;
                  posArr[i * 3 + 1] = 10000;
                  posArr[i * 3 + 2] = 10000;
                  sizeArr[i] = 0;
                }
              }

              posAttr.needsUpdate = true;
              colAttr.needsUpdate = true;
              sizeAttr.needsUpdate = true;

              setActiveParticles(result.activeCount);
            }
          } catch (err) {
            console.warn('sim step error', err);
          }
        }

        pMat.uniforms.uTime.value = now * 0.001;

        renderer.render(scene, camera);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);

      return () => {
        running = false;
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('wheel', onWheel);
        if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    };
    init();

    return () => {
      disposed = true;
    };
  }, [onReady, setFps, setActiveParticles]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden"
      style={{ touchAction: 'none' }}
    />
  );
}
