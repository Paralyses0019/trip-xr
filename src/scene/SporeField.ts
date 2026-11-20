import * as THREE from 'three';

const sporeVertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aEnergy;

  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uAudio;

  varying vec3 vColor;
  varying float vEnergy;
  varying float vOpacity;

  void main() {
    vColor = aColor;
    vEnergy = aEnergy + uAudio * 0.45;
    vOpacity = uOpacity;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.35, -mvPosition.z);
    gl_PointSize = aSize * uPixelRatio * (1.0 + vEnergy * 1.25) * (185.0 / dist);
    gl_PointSize = clamp(gl_PointSize, 2.0, 74.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const sporeFragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vEnergy;
  varying float vOpacity;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float r = length(uv);
    if (r > 0.5) discard;

    float core = exp(-r * r * 26.0);
    float halo = exp(-r * r * 6.5) * 0.55;
    float alpha = (core + halo) * vOpacity;

    vec3 col = mix(vColor, vec3(1.0, 0.92, 0.65), clamp(vEnergy * 0.65 + core * 0.45, 0.0, 1.0));
    gl_FragColor = vec4(col * (1.2 + vEnergy * 1.1), alpha);
  }
`;

// Sculpted undulating bioluminescent jellyfish-cap shader (subsurface translucency + glowing radial gills)
const floraCapVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAudio;

  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 pos = position;
    float angle = atan(pos.z, pos.x);
    float rad = length(pos.xz);

    // Organic scalloped / ruffled bell rim that gently undulates underwater
    float ruffle = sin(angle * 7.0 + uTime * 1.4) * 0.014 * smoothstep(0.02, 0.11, rad);
    float breathe = sin(uTime * 2.1 - rad * 18.0) * 0.008 * (1.0 + uAudio * 0.9);
    pos.y += ruffle + breathe;
    pos.xz *= 1.0 + sin(uTime * 1.8 + pos.y * 12.0) * 0.04 * (1.0 + uAudio * 0.6);

    vLocalPos = pos;
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const floraCapFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAudio;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    float fresnel = pow(1.0 - abs(dot(N, V)), 2.2);

    float angle = atan(vLocalPos.z, vLocalPos.x);
    float rad = length(vLocalPos.xz);

    // Fine radial bioluminescent gills & pulsing rings
    float gills = pow(sin(angle * 16.0) * 0.5 + 0.5, 3.0);
    float ringPulse = sin(rad * 42.0 - uTime * 3.0) * 0.5 + 0.5;
    float rimGlow = smoothstep(0.045, 0.11, rad);

    vec3 baseCol = mix(uColorA, uColorB, smoothstep(0.0, 0.095, rad));
    vec3 col = baseCol * (0.45 + gills * 0.55 + ringPulse * 0.35);

    // Subsurface-scattering translucent rim glow
    col += mix(uColorB, vec3(1.0, 0.92, 0.68), 0.45) * (fresnel * 1.45 + rimGlow * 0.65);
    col *= 1.0 + uAudio * 0.65;

    float alpha = clamp((0.52 + fresnel * 0.48 + gills * 0.18) * uOpacity, 0.0, 0.96);
    gl_FragColor = vec4(col, alpha);
  }
`;

// Glowing rising mycelium tendril shader with travelling bioluminescent pulses
const tendrilVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const tendrilFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform float uOpacity;
  uniform float uAudio;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Grow upward along the vine (vUv.x goes 0 -> 1 from floor to tip)
    float growMask = smoothstep(uProgress + 0.05, uProgress - 0.12, vUv.x);
    if (growMask < 0.01) discard;

    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 1.8);
    float pulse = pow(sin(vUv.x * 16.0 - uTime * 3.6) * 0.5 + 0.5, 5.0);
    float tipGlow = exp(-pow((vUv.x - uProgress) * 14.0, 2.0));

    vec3 teal = vec3(0.08, 0.78, 0.76);
    vec3 violet = vec3(0.58, 0.28, 0.98);
    vec3 gold = vec3(1.0, 0.86, 0.45);

    vec3 col = mix(teal, violet, vUv.x);
    col += gold * (pulse * 0.95 + tipGlow * 1.4);
    col *= 0.75 + fresnel * 0.95 + uAudio * 0.6;

    float alpha = clamp((0.45 + fresnel * 0.5 + pulse * 0.4) * growMask * uOpacity, 0.0, 0.95);
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Chapter 1 — OVERGROEI (v0.3 Visual Overhaul)
 * - 1,600 hand-reactive glowing spores
 * - Sculpted undulating jellyfish/coral bioluminescent flora with curved stems & subsurface glow
 * - 16 rising glowing mycelium tendrils coiling upward around the room perimeter
 */
export class SporeField {
  public readonly group = new THREE.Group();

  private readonly count = 1600;
  private readonly positions: Float32Array;
  private readonly basePositions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly energies: Float32Array;
  private readonly phases: Float32Array;

  private readonly pointsGeo: THREE.BufferGeometry;
  private readonly pointsUniforms: {
    uPixelRatio: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uAudio: THREE.IUniform<number>;
  };

  private readonly floraGroup = new THREE.Group();
  private readonly floraItems: Array<{
    group: THREE.Group;
    targetScale: number;
    delay: number;
    phase: number;
  }> = [];
  private readonly capMaterials: THREE.ShaderMaterial[] = [];

  private readonly tendrilUniforms: {
    uTime: THREE.IUniform<number>;
    uProgress: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uAudio: THREE.IUniform<number>;
  };

  constructor() {
    this.positions = new Float32Array(this.count * 3);
    this.basePositions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.energies = new Float32Array(this.count);
    this.phases = new Float32Array(this.count);

    const colors = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);

    const palette = [
      new THREE.Color(0x2dd4bf),
      new THREE.Color(0x5eead4),
      new THREE.Color(0xa78bfa),
      new THREE.Color(0xf472b6),
      new THREE.Color(0xfbbf24),
    ];

    for (let i = 0; i < this.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.45 + Math.pow(Math.random(), 0.72) * 3.35;
      const x = Math.cos(angle) * radius;
      const y = 0.08 + Math.random() * 2.65;
      const z = Math.sin(angle) * radius;

      const i3 = i * 3;
      this.positions[i3] = x;
      this.positions[i3 + 1] = y;
      this.positions[i3 + 2] = z;

      this.basePositions[i3] = x;
      this.basePositions[i3 + 1] = y;
      this.basePositions[i3 + 2] = z;

      this.phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.14 + Math.random() * 0.24;

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    this.pointsGeo = new THREE.BufferGeometry();
    this.pointsGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.pointsGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.pointsGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.pointsGeo.setAttribute('aEnergy', new THREE.BufferAttribute(this.energies, 1));

    this.pointsUniforms = {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity: { value: 0 },
      uAudio: { value: 0 },
    };

    const pointsMat = new THREE.ShaderMaterial({
      uniforms: this.pointsUniforms,
      vertexShader: sporeVertexShader,
      fragmentShader: sporeFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(this.pointsGeo, pointsMat);
    points.frustumCulled = false;
    this.group.add(points);

    this.tendrilUniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uAudio: { value: 0 },
    };

    this.buildOrganicFlora();
    this.buildMyceliumTendrils();
    this.group.add(this.floraGroup);
  }

  private buildOrganicFlora(): void {
    // Sculpted bell-shaped jellyfish/coral cap profile (LatheGeometry)
    const capProfile = [
      new THREE.Vector2(0.0, 0.068),
      new THREE.Vector2(0.025, 0.064),
      new THREE.Vector2(0.055, 0.048),
      new THREE.Vector2(0.088, 0.022),
      new THREE.Vector2(0.112, -0.006),
      new THREE.Vector2(0.104, -0.018),
      new THREE.Vector2(0.065, -0.004),
      new THREE.Vector2(0.015, 0.01),
    ];
    const capGeo = new THREE.LatheGeometry(capProfile, 32);

    // Graceful S-curved organic stem
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.022, 0.11, 0.012),
      new THREE.Vector3(-0.018, 0.24, -0.01),
      new THREE.Vector3(0.005, 0.36, 0),
    ]);
    const stemGeo = new THREE.TubeGeometry(stemCurve, 14, 0.009, 8, false);

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x0b4f56,
      emissive: 0x14b8a6,
      emissiveIntensity: 0.65,
      roughness: 0.35,
      transparent: true,
      opacity: 0.9,
    });

    const colorPairs: Array<[THREE.Color, THREE.Color]> = [
      [new THREE.Color(0x0d9488), new THREE.Color(0x5eead4)],
      [new THREE.Color(0x6d28d9), new THREE.Color(0x38bdf8)],
      [new THREE.Color(0xbe185d), new THREE.Color(0xf472b6)],
      [new THREE.Color(0x0369a1), new THREE.Color(0xa78bfa)],
    ];

    colorPairs.forEach(([colA, colB]) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uAudio: { value: 0 },
          uOpacity: { value: 0 },
          uColorA: { value: colA },
          uColorB: { value: colB },
        },
        vertexShader: floraCapVertexShader,
        fragmentShader: floraCapFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.capMaterials.push(mat);
    });

    // 22 lush multi-stem bioluminescent flora clusters around the 1x1m sanctuary
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      const radius = 1.25 + Math.random() * 1.75;

      const cluster = new THREE.Group();
      cluster.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      cluster.rotation.y = Math.random() * Math.PI * 2;
      cluster.scale.setScalar(0.0001);

      const capMat = this.capMaterials[i % this.capMaterials.length];

      const subCount = 2 + (i % 3);
      for (let j = 0; j < subCount; j++) {
        const sub = new THREE.Group();
        const s = 0.6 + Math.random() * 1.05;
        sub.scale.setScalar(s);
        sub.position.set((Math.random() - 0.5) * 0.16, 0, (Math.random() - 0.5) * 0.16);
        sub.rotation.y = Math.random() * Math.PI * 2;
        sub.rotation.z = (Math.random() - 0.5) * 0.18;

        const stem = new THREE.Mesh(stemGeo, stemMat);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(0.005, 0.36, 0);
        sub.add(stem, cap);
        cluster.add(sub);
      }

      this.floraGroup.add(cluster);
      this.floraItems.push({
        group: cluster,
        targetScale: 0.72 + Math.random() * 0.85,
        delay: 0.12 + Math.random() * 0.52,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private buildMyceliumTendrils(): void {
    const tendrilMat = new THREE.ShaderMaterial({
      uniforms: this.tendrilUniforms,
      vertexShader: tendrilVertexShader,
      fragmentShader: tendrilFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // 16 organic curling light-vines climbing up the room perimeter
    for (let i = 0; i < 16; i++) {
      const baseAngle = (i / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const baseRadius = 1.65 + Math.random() * 0.85;
      const height = 1.6 + Math.random() * 1.1;

      const pts: THREE.Vector3[] = [];
      const steps = 7;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const twist = baseAngle + Math.sin(t * Math.PI * 2.2 + i) * 0.24;
        const r = baseRadius - t * 0.18 + Math.cos(t * Math.PI * 3.0) * 0.08;
        pts.push(new THREE.Vector3(Math.cos(twist) * r, t * height, Math.sin(twist) * r));
      }

      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 28, 0.011 + Math.random() * 0.008, 6, false);
      const mesh = new THREE.Mesh(geo, tendrilMat);
      this.floraGroup.add(mesh);
    }
  }

  public update(
    elapsed: number,
    dt: number,
    progress: number,
    visibility: number,
    audioEnergy: number,
    handLeft: THREE.Vector3 | null,
    handRight: THREE.Vector3 | null
  ): number {
    this.group.visible = progress > 0.01 && visibility > 0.01;
    this.pointsUniforms.uOpacity.value = THREE.MathUtils.smoothstep(progress, 0.04, 0.35) * visibility;
    this.pointsUniforms.uAudio.value = audioEnergy;

    this.tendrilUniforms.uTime.value = elapsed;
    this.tendrilUniforms.uProgress.value = THREE.MathUtils.smoothstep(progress, 0.1, 0.95);
    this.tendrilUniforms.uOpacity.value = visibility;
    this.tendrilUniforms.uAudio.value = audioEnergy;

    for (const mat of this.capMaterials) {
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uAudio.value = audioEnergy;
      mat.uniforms.uOpacity.value = visibility;
    }

    if (!this.group.visible) {
      return 0;
    }

    const clampedDt = Math.min(dt, 0.05);
    const hands: THREE.Vector3[] = [];
    if (handLeft) hands.push(handLeft);
    if (handRight) hands.push(handRight);

    let stirIntensity = 0;
    const interactRadius = 0.44;
    const interactRadiusSq = interactRadius * interactRadius;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const phase = this.phases[i];

      const targetX = this.basePositions[i3] + Math.sin(elapsed * 0.45 + phase) * 0.18;
      let targetY = this.basePositions[i3 + 1] + ((elapsed * 0.09 + phase * 0.3) % 2.6);
      if (targetY > 2.75) targetY -= 2.65;
      const targetZ = this.basePositions[i3 + 2] + Math.cos(elapsed * 0.4 + phase * 1.3) * 0.18;

      this.velocities[i3] += (targetX - this.positions[i3]) * 0.9 * clampedDt;
      this.velocities[i3 + 1] += (targetY - this.positions[i3 + 1]) * 0.9 * clampedDt;
      this.velocities[i3 + 2] += (targetZ - this.positions[i3 + 2]) * 0.9 * clampedDt;

      for (let h = 0; h < hands.length; h++) {
        const hand = hands[h];
        const dx = this.positions[i3] - hand.x;
        const dy = this.positions[i3 + 1] - hand.y;
        const dz = this.positions[i3 + 2] - hand.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < interactRadiusSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const force = (1.0 - dist / interactRadius) * 3.8 * clampedDt;
          const invD = 1.0 / dist;

          this.velocities[i3] += (dx * invD - dz * invD * 0.5) * force;
          this.velocities[i3 + 1] += (dy * invD + 0.4) * force;
          this.velocities[i3 + 2] += (dz * invD + dx * invD * 0.5) * force;

          this.energies[i] = Math.min(1.0, this.energies[i] + force * 3.0);
          stirIntensity += force;
        }
      }

      const damp = Math.pow(0.18, clampedDt);
      this.velocities[i3] *= damp;
      this.velocities[i3 + 1] *= damp;
      this.velocities[i3 + 2] *= damp;

      this.positions[i3] += this.velocities[i3] * clampedDt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * clampedDt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * clampedDt;

      this.energies[i] = Math.max(0, this.energies[i] - clampedDt * 0.85);
    }

    (this.pointsGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsGeo.attributes.aEnergy as THREE.BufferAttribute).needsUpdate = true;

    for (const item of this.floraItems) {
      const localP = THREE.MathUtils.clamp((progress - item.delay) / 0.35, 0, 1);
      const eased = 1 - Math.pow(1 - localP, 3);
      const sway = Math.sin(elapsed * 1.1 + item.phase) * 0.06;
      item.group.rotation.z = sway;
      const breathe = 1.0 + Math.sin(elapsed * 1.8 + item.phase) * 0.04 + audioEnergy * 0.08;
      const s = Math.max(0.0001, eased * item.targetScale * breathe * visibility);
      item.group.scale.setScalar(s);
    }

    return Math.min(1.0, stirIntensity * 0.15);
  }
}
