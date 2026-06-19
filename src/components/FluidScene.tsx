import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { fluidSim } from '../gpu/FluidSimulator';
import { useSimStore } from '../store/useSimStore';
import { PARTICLE_COUNT, ObstacleType, WORLD_SIZE, OBSTACLE_RADIUS } from '../utils/constants';
import { SMOKE_COUNT } from '../gpu/SmokeSystem';

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
    smokeEnabled: true,
    smokeAmount: 800,
    smokeDiffusion: 0.15,
    showVortex: true,
    obstaclePos: [0, 0, 0] as [number, number, number],
  });
  const setFps = useSimStore((s) => s.setFps);
  const setActiveParticles = useSimStore((s) => s.setActiveParticles);
  const setSmokeCount = useSimStore((s) => s.setSmokeCount);
  const setBackendMode = useSimStore((s) => s.setBackendMode);
  const setObstaclePos = useSimStore((s) => s.setObstaclePos);
  const storeState = useSimStore.getState();
  paramsRef.current.isEmitting = storeState.isEmitting;
  paramsRef.current.viscosity = storeState.viscosity;
  paramsRef.current.emitRate = storeState.emitRate;
  paramsRef.current.obstacleType = storeState.obstacleType;
  paramsRef.current.obstacleRotationSpeed = storeState.obstacleRotationSpeed;
  paramsRef.current.flowSpeed = storeState.flowSpeed;
  paramsRef.current.smokeEnabled = storeState.smokeEnabled;
  paramsRef.current.smokeAmount = storeState.smokeAmount;
  paramsRef.current.smokeDiffusion = storeState.smokeDiffusion;
  paramsRef.current.showVortex = storeState.showVortex;
  paramsRef.current.obstaclePos = storeState.obstaclePos;

  useEffect(() => {
    return useSimStore.subscribe((state) => {
      paramsRef.current.isEmitting = state.isEmitting;
      paramsRef.current.viscosity = state.viscosity;
      paramsRef.current.emitRate = state.emitRate;
      paramsRef.current.obstacleType = state.obstacleType;
      paramsRef.current.obstacleRotationSpeed = state.obstacleRotationSpeed;
      paramsRef.current.flowSpeed = state.flowSpeed;
      paramsRef.current.smokeEnabled = state.smokeEnabled;
      paramsRef.current.smokeAmount = state.smokeAmount;
      paramsRef.current.smokeDiffusion = state.smokeDiffusion;
      paramsRef.current.showVortex = state.showVortex;
      paramsRef.current.obstaclePos = state.obstaclePos;
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    const init = async () => {
      const simOk = await fluidSim.init();
      if (disposed || !containerRef.current) return;
      if (simOk) setBackendMode(fluidSim.mode);
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
      obstacleMesh.position.set(...paramsRef.current.obstaclePos);
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

      const smokePositions = new Float32Array(SMOKE_COUNT * 3);
      const smokeColors = new Float32Array(SMOKE_COUNT * 3);
      const smokeSizes = new Float32Array(SMOKE_COUNT);
      for (let i = 0; i < SMOKE_COUNT; i++) {
        smokePositions[i * 3] = 1000;
        smokePositions[i * 3 + 1] = 1000;
        smokePositions[i * 3 + 2] = 1000;
        smokeColors[i * 3] = 0.85;
        smokeColors[i * 3 + 1] = 0.9;
        smokeColors[i * 3 + 2] = 1.0;
        smokeSizes[i] = 0;
      }

      const smokeGeo = new THREE.BufferGeometry();
      smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
      smokeGeo.setAttribute('color', new THREE.BufferAttribute(smokeColors, 3));
      smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(smokeSizes, 1));

      const smokeMat = new THREE.ShaderMaterial({
        uniforms: {
          uPixelRatio: { value: renderer.getPixelRatio() },
          uTime: { value: 0 },
        },
        vertexShader: `
          attribute float aSize;
          varying vec3 vColor;
          uniform float uPixelRatio;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uPixelRatio * (320.0 / -mv.z);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            if (d > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, d);
            alpha = pow(alpha, 2.0);
            gl_FragColor = vec4(vColor, alpha * 0.45);
          }
        `,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });

      const smokePoints = new THREE.Points(smokeGeo, smokeMat);
      scene.add(smokePoints);

      const vortexGroup = new THREE.Group();
      scene.add(vortexGroup);

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

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let dragMode: 'orbit' | 'obstacle' = 'orbit';
      let dragPlane = new THREE.Plane();
      let dragOffset = new THREE.Vector3();
      let lastObstacleType: ObstacleType = paramsRef.current.obstacleType;
      let obstacleNeedsRegen = false;
      let obstaclePosDirty = false;

      const canvas = renderer.domElement;

      const getMouseNdc = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const onDown = (e: PointerEvent) => {
        getMouseNdc(e);
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObject(obstacleMesh);
        if (intersects.length > 0) {
          dragMode = 'obstacle';
          const half = WORLD_SIZE / 2;
          const normal = new THREE.Vector3();
          camera.getWorldDirection(normal);
          normal.negate();
          dragPlane.setFromNormalAndCoplanarPoint(
            normal,
            intersects[0].point
          );
          dragOffset.copy(intersects[0].point).sub(obstacleMesh.position);
        } else {
          dragMode = 'orbit';
          dragging = true;
          prevX = e.clientX; prevY = e.clientY;
        }
        canvas.setPointerCapture(e.pointerId);
      };

      const onUp = (e: PointerEvent) => {
        dragging = false;
        dragMode = 'orbit';
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
      };

      const onMove = (e: PointerEvent) => {
        if (dragMode === 'obstacle') {
          getMouseNdc(e);
          raycaster.setFromCamera(mouse, camera);
          const hitPoint = new THREE.Vector3();
          raycaster.ray.intersectPlane(dragPlane, hitPoint);
          if (hitPoint) {
            const newPos = hitPoint.sub(dragOffset);
            const half = WORLD_SIZE / 2 - 0.5;
            newPos.x = Math.max(-half, Math.min(half, newPos.x));
            newPos.y = Math.max(-half, Math.min(half, newPos.y));
            newPos.z = Math.max(-half, Math.min(half, newPos.z));
            obstacleMesh.position.copy(newPos);
            paramsRef.current.obstaclePos = [newPos.x / (WORLD_SIZE / 2), newPos.y / (WORLD_SIZE / 2), newPos.z / (WORLD_SIZE / 2)] as [number, number, number];
            obstaclePosDirty = true;
            setObstaclePos(paramsRef.current.obstaclePos);
          }
        } else if (dragging) {
          const dx = e.clientX - prevX;
          const dy = e.clientY - prevY;
          targetAz.v -= dx * 0.007;
          targetPol.v = Math.max(0.12, Math.min(Math.PI * 0.49, targetPol.v - dy * 0.007));
          prevX = e.clientX; prevY = e.clientY;
        }
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
        obstacleMesh.position.set(
          paramsRef.current.obstaclePos[0] * (WORLD_SIZE / 2),
          paramsRef.current.obstaclePos[1] * (WORLD_SIZE / 2),
          paramsRef.current.obstaclePos[2] * (WORLD_SIZE / 2)
        );
        scene.add(obstacleMesh);
      };

      const updateVortexVisual = () => {
        while (vortexGroup.children.length > 0) {
          const c = vortexGroup.children[0];
          vortexGroup.remove(c);
          if ((c as THREE.ArrowHelper).dispose) (c as THREE.ArrowHelper).dispose();
        }
        if (!paramsRef.current.showVortex) return;

        const half = WORLD_SIZE / 2;
        const centers = fluidSim.getVortexCenters();

        if (centers.length > 0) {
          for (const center of centers) {
            const pos = new THREE.Vector3(
              center.position[0] * half,
              center.position[1] * half,
              center.position[2] * half
            );
            const dir = new THREE.Vector3(...center.axis).normalize();
            const arrowSize = Math.min(1.2, 0.3 + center.magnitude * 20);
            const arrow = new THREE.ArrowHelper(
              dir,
              pos,
              arrowSize,
              0xff66bb,
              0.22,
              0.12
            );
            (arrow as any).line.material.transparent = true;
            (arrow as any).line.material.opacity = 0.75;
            (arrow as any).cone.material.transparent = true;
            (arrow as any).cone.material.opacity = 0.85;
            vortexGroup.add(arrow);
          }
        } else {
          const vortexPositions = [
            [-half * 0.3, 0, -half * 0.2],
            [half * 0.3, 0, -half * 0.2],
          ];
          const vortexAxes = [
            [0, 1, 0],
            [0, -1, 0],
          ];

          for (let i = 0; i < vortexPositions.length; i++) {
            const pos = new THREE.Vector3(
              vortexPositions[i][0] + paramsRef.current.obstaclePos[0] * half,
              vortexPositions[i][1] + paramsRef.current.obstaclePos[1] * half,
              vortexPositions[i][2] + paramsRef.current.obstaclePos[2] * half
            );
            const dir = new THREE.Vector3(...vortexAxes[i] as [number, number, number]).normalize();
            const arrow = new THREE.ArrowHelper(
              dir,
              pos,
              0.6,
              0xff88cc,
              0.18,
              0.1
            );
            (arrow as any).line.material.transparent = true;
            (arrow as any).line.material.opacity = 0.5;
            (arrow as any).cone.material.transparent = true;
            (arrow as any).cone.material.opacity = 0.6;
            vortexGroup.add(arrow);
          }
        }
      };

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
          obstacleNeedsRegen = true;
        }

        if (obstaclePosDirty || obstacleNeedsRegen) {
          fluidSim.regenerateSDF(
            paramsRef.current.obstacleType,
            obstacleMesh.rotation.y,
            paramsRef.current.obstaclePos
          );
          obstaclePosDirty = false;
          obstacleNeedsRegen = false;
        }

        const yaw = paramsRef.current.obstacleRotationSpeed * Math.PI / 180;
        obstacleMesh.rotation.y += yaw * dt;
        obstacleMesh.rotation.x = Math.sin(now * 0.0004) * 0.08;

        light1.position.x = Math.sin(now * 0.0003) * 5;
        light1.position.z = Math.cos(now * 0.0003) * 5;

        const posAttr = pGeo.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = pGeo.getAttribute('color') as THREE.BufferAttribute;
        const sizeAttr = pGeo.getAttribute('aSize') as THREE.BufferAttribute;

        const smokePosAttr = smokeGeo.getAttribute('position') as THREE.BufferAttribute;
        const smokeColAttr = smokeGeo.getAttribute('color') as THREE.BufferAttribute;
        const smokeSizeAttr = smokeGeo.getAttribute('aSize') as THREE.BufferAttribute;

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
              smokeEnabled: paramsRef.current.smokeEnabled,
              smokeAmount: paramsRef.current.smokeAmount,
              smokeDiffusion: paramsRef.current.smokeDiffusion,
              smokeSource: [-0.7, 0.2, 0],
              smokeSourceRadius: 0.12,
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

            if (result.smokeData && result.smokeCount !== undefined) {
              const smPosArr = smokePosAttr.array as Float32Array;
              const smColArr = smokeColAttr.array as Float32Array;
              const smSizeArr = smokeSizeAttr.array as Float32Array;
              const sd = result.smokeData;
              const half = WORLD_SIZE / 2;

              for (let i = 0; i < SMOKE_COUNT; i++) {
                const density = sd[i * 4 + 3];
                if (density > 0.02 && Math.abs(sd[i * 4]) < 50) {
                  smPosArr[i * 3] = sd[i * 4] * half;
                  smPosArr[i * 3 + 1] = sd[i * 4 + 1] * half;
                  smPosArr[i * 3 + 2] = sd[i * 4 + 2] * half;

                  const vx = sd[i * 4 + 0];
                  const vy = sd[i * 4 + 1];
                  const vz = sd[i * 4 + 2];
                  const speedT = Math.min(1, Math.sqrt(vx*vx + vy*vy + vz*vz) * 2.0);

                  const r = 0.7 + speedT * 0.2;
                  const g = 0.78 + speedT * 0.1;
                  const b = 0.95;
                  smColArr[i * 3] = r;
                  smColArr[i * 3 + 1] = g;
                  smColArr[i * 3 + 2] = b;

                  smSizeArr[i] = 0.12 + density * 0.08;
                } else {
                  smPosArr[i * 3] = 10000;
                  smPosArr[i * 3 + 1] = 10000;
                  smPosArr[i * 3 + 2] = 10000;
                  smSizeArr[i] = 0;
                }
              }

              smokePosAttr.needsUpdate = true;
              smokeColAttr.needsUpdate = true;
              smokeSizeAttr.needsUpdate = true;

              setSmokeCount(result.smokeCount);

              if (paramsRef.current.showVortex) {
                updateVortexVisual();
              }
            }
          } catch (err) {
            console.warn('sim step error', err);
          }
        }

        pMat.uniforms.uTime.value = now * 0.001;
        smokeMat.uniforms.uTime.value = now * 0.001;

        smokePoints.visible = paramsRef.current.smokeEnabled;
        vortexGroup.visible = paramsRef.current.showVortex;

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
  }, [onReady, setFps, setActiveParticles, setSmokeCount, setBackendMode, setObstaclePos]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden"
      style={{ touchAction: 'none' }}
    />
  );
}
