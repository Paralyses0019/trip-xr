import * as THREE from 'three';

const auroraVertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const auroraFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uShockwave;

  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec3 dir = normalize(vDir);
    float elevation = dir.y;

    // Deep cosmic cathedral zenith -> horizon gradient
    vec3 zenith = vec3(0.015, 0.02, 0.08);
    vec3 horizon = vec3(0.07, 0.04, 0.18);
    vec3 col = mix(horizon, zenith, smoothstep(-0.1, 0.75, elevation));

    // Flowing aurora curtains overhead
    float angle = atan(dir.z, dir.x);
    float band1 = sin(angle * 3.0 + uTime * 0.25 + noise(vec2(angle * 2.0, uTime * 0.15)) * 4.0);
    float band2 = cos(angle * 5.0 - uTime * 0.18 + noise(vec2(angle * 3.5, elevation * 3.0)) * 3.0);

    float curtain = smoothstep(0.02, 0.55, elevation) * (1.0 - smoothstep(0.55, 0.98, elevation));
    float ribbon1 = pow(max(0.0, band1 * 0.5 + 0.5), 3.0) * curtain;
    float ribbon2 = pow(max(0.0, band2 * 0.5 + 0.5), 4.0) * curtain;

    vec3 auroraTeal = vec3(0.12, 0.92, 0.82);
    vec3 auroraViolet = vec3(0.58, 0.24, 0.98);
    vec3 auroraGold = vec3(1.0, 0.74, 0.35);

    col += auroraTeal * ribbon1 * 0.62;
    col += auroraViolet * ribbon2 * 0.55;
    col += auroraGold * pow(ribbon1 * ribbon2, 1.2) * (0.65 + uShockwave * 1.4);

    // Subtle procedural starfield in upper sky
    vec2 starUV = floor(vec2(angle * 45.0, elevation * 90.0));
    float star = step(0.992, hash(starUV)) * smoothstep(0.05, 0.35, elevation);
    float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + hash(starUV + 1.0) * 20.0);
    col += vec3(0.85, 0.95, 1.0) * star * twinkle * 0.9;

    // Expanding shockwave flash across the sky
    float shockBand = exp(-pow((elevation - uShockwave * 1.1) * 7.0, 2.0)) * (1.0 - uShockwave) * step(0.001, uShockwave);
    col += vec3(0.45, 0.95, 1.0) * shockBand * 0.9;

    gl_FragColor = vec4(col, uOpacity);
  }
`;

const floorVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const floorFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uShockwave;

  varying vec3 vWorldPos;

  void main() {
    float dist = length(vWorldPos.xz);
    float fade = 1.0 - smoothstep(8.0, 24.0, dist);

    // Concentric liquid-mercury ripples
    float ripple1 = sin(dist * 3.6 - uTime * 1.8) * 0.5 + 0.5;
    float ripple2 = sin(dist * 7.2 + uTime * 1.1 + atan(vWorldPos.z, vWorldPos.x) * 4.0) * 0.5 + 0.5;

    // Shockwave ring racing across the infinite floor
    float shockRadius = uShockwave * 18.0;
    float shockRing = exp(-pow((dist - shockRadius) * 1.4, 2.0)) * (1.0 - uShockwave) * step(0.001, uShockwave);

    vec3 obsidian = vec3(0.02, 0.025, 0.06);
    vec3 cyan = vec3(0.18, 0.88, 0.92);
    vec3 violet = vec3(0.55, 0.25, 0.95);
    vec3 gold = vec3(1.0, 0.82, 0.42);

    vec3 reflection = mix(violet, cyan, ripple1) * (0.14 + pow(ripple2, 4.0) * 0.35);
    vec3 col = obsidian + reflection + gold * shockRing * 1.8;

    // Subtle glowing circle right under the user's 1x1m sanctuary
    float sanctuary = exp(-pow((dist - 0.85) * 10.0, 2.0)) * 0.45;
    col += cyan * sanctuary;

    gl_FragColor = vec4(col, uOpacity * fade);
  }
`;

const oceanVertexShader = /* glsl */ `
  attribute float aPhase;
  attribute vec3 aColor;
  attribute float aSize;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform vec3 uHandLeft;
  uniform vec3 uHandRight;
  uniform float uHandLeftActive;
  uniform float uHandRightActive;
  uniform float uShockwave;

  varying vec3 vColor;
  varying float vGlow;
  varying float vOpacity;

  void main() {
    vec3 pos = position;

    // Slow, monumental aurora wave flowing through the cosmic ocean
    float wave = sin(pos.x * 0.45 + uTime * 0.65 + aPhase) * 0.55
               + cos(pos.z * 0.4 + uTime * 0.5 - aPhase) * 0.55;
    pos.y += wave;

    // Slow cosmic orbit around the cathedral
    float orbitAngle = uTime * 0.06 + aPhase * 0.05;
    float c = cos(orbitAngle);
    float s = sin(orbitAngle);
    pos.xz = mat2(c, -s, s, c) * pos.xz;

    float glow = 0.0;

    // Gravity/magnetic attraction toward user's hands
    if (uHandLeftActive > 0.5) {
      vec3 toL = uHandLeft - pos;
      float dL = length(toL);
      float pullL = exp(-dL * 0.85) * 0.55;
      pos += normalize(toL + 0.0001) * pullL;
      glow += pullL * 1.4;
    }
    if (uHandRightActive > 0.5) {
      vec3 toR = uHandRight - pos;
      float dR = length(toR);
      float pullR = exp(-dR * 0.85) * 0.55;
      pos += normalize(toR + 0.0001) * pullR;
      glow += pullR * 1.4;
    }

    // Shockwave expansion push!
    if (uShockwave > 0.001) {
      float r = length(pos.xz);
      float shockR = uShockwave * 16.0;
      float ring = exp(-pow((r - shockR) * 0.75, 2.0)) * (1.0 - uShockwave);
      pos += normalize(pos + vec3(0.0, 0.2, 0.0)) * ring * 1.8;
      glow += ring * 2.2;
    }

    vColor = aColor;
    vGlow = clamp(glow, 0.0, 1.5);
    vOpacity = uOpacity;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    float dist = max(0.4, -mvPos.z);
    gl_PointSize = clamp(aSize * uPixelRatio * (1.0 + vGlow * 0.9) * (210.0 / dist), 2.0, 64.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const oceanFragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vGlow;
  varying float vOpacity;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float r = length(uv);
    if (r > 0.5) discard;

    float core = exp(-r * r * 24.0);
    float halo = exp(-r * r * 6.0) * 0.45;
    vec3 col = mix(vColor, vec3(1.0, 0.92, 0.65), clamp(vGlow * 0.7 + core * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col * (1.25 + vGlow), (core + halo) * vOpacity);
  }
`;

/**
 * Chapter 3 — DE KATHEDRAAL (Monumentaal & Kosmisch)
 * - Vast Aurora Sky Dome
 * - Infinite liquid-mirror floor with ripples & shockwaves
 * - 8,500 GPU-driven cosmic ocean particles attracted to your hands
 * - 12 towering distant light pillars
 * - Gravity Orb & Shockwave: bring hands together to charge a star between your palms, then push apart!
 */
export class CosmicCathedral {
  public readonly group = new THREE.Group();

  private readonly auroraUniforms: {
    uTime: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uShockwave: THREE.IUniform<number>;
  };
  private readonly floorUniforms: {
    uTime: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uShockwave: THREE.IUniform<number>;
  };
  private readonly oceanUniforms: {
    uTime: THREE.IUniform<number>;
    uPixelRatio: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uHandLeft: THREE.IUniform<THREE.Vector3>;
    uHandRight: THREE.IUniform<THREE.Vector3>;
    uHandLeftActive: THREE.IUniform<number>;
    uHandRightActive: THREE.IUniform<number>;
    uShockwave: THREE.IUniform<number>;
  };

  private readonly pillarsMat: THREE.MeshBasicMaterial;
  private readonly chargeOrb: THREE.Mesh;
  private readonly chargeOrbMat: THREE.MeshBasicMaterial;

  private chargeLevel = 0;
  private shockwaveProgress = 0; // 0 = idle, 0..1 = expanding wave
  private wasCharging = false;

  constructor() {
    this.group.visible = false;

    // 1. Aurora Sky Dome
    const skyGeo = new THREE.SphereGeometry(26, 36, 24);
    skyGeo.scale(-1, 1, 1);
    this.auroraUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uShockwave: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.auroraUniforms,
      vertexShader: auroraVertexShader,
      fragmentShader: auroraFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.renderOrder = -1;
    this.group.add(skyMesh);

    // 2. Infinite liquid-mirror floor
    const floorGeo = new THREE.CircleGeometry(24, 64);
    floorGeo.rotateX(-Math.PI / 2);
    this.floorUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uShockwave: { value: 0 },
    };
    const floorMat = new THREE.ShaderMaterial({
      uniforms: this.floorUniforms,
      vertexShader: floorVertexShader,
      fragmentShader: floorFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = 0.005;
    this.group.add(floorMesh);

    // 3. 12 Monumental Light Pillars around the cathedral perimeter
    const pillarGeo = new THREE.CylinderGeometry(0.14, 0.35, 22, 12, 1, true);
    this.pillarsMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 11.5;
      const pillar = new THREE.Mesh(pillarGeo, this.pillarsMat);
      pillar.position.set(Math.cos(a) * r, 11, Math.sin(a) * r);
      this.group.add(pillar);
    }

    // 4. 8,500 GPU-driven Cosmic Particle Ocean
    const count = 8500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    const palette = [
      new THREE.Color(0x2dd4bf),
      new THREE.Color(0x38bdf8),
      new THREE.Color(0x818cf8),
      new THREE.Color(0xc084fc),
      new THREE.Color(0xfbbf24),
    ];

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.pow(Math.random(), 0.7) * 14.5;
      const y = 0.25 + Math.pow(Math.random(), 1.3) * 9.5;
      const i3 = i * 3;
      positions[i3] = Math.cos(a) * r;
      positions[i3 + 1] = y;
      positions[i3 + 2] = Math.sin(a) * r;

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;

      sizes[i] = 0.1 + Math.random() * 0.24;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const oceanGeo = new THREE.BufferGeometry();
    oceanGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    oceanGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    oceanGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    oceanGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.oceanUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity: { value: 0 },
      uHandLeft: { value: new THREE.Vector3(0, -10, 0) },
      uHandRight: { value: new THREE.Vector3(0, -10, 0) },
      uHandLeftActive: { value: 0 },
      uHandRightActive: { value: 0 },
      uShockwave: { value: 0 },
    };

    const oceanMat = new THREE.ShaderMaterial({
      uniforms: this.oceanUniforms,
      vertexShader: oceanVertexShader,
      fragmentShader: oceanFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const oceanPoints = new THREE.Points(oceanGeo, oceanMat);
    oceanPoints.frustumCulled = false;
    this.group.add(oceanPoints);

    // 5. Pulsing Star-Orb formed between both palms when hands come close together
    const orbGeo = new THREE.SphereGeometry(0.11, 20, 20);
    this.chargeOrbMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.chargeOrb = new THREE.Mesh(orbGeo, this.chargeOrbMat);
    this.chargeOrb.visible = false;
    this.group.add(this.chargeOrb);
  }

  /**
   * Manually trigger a cosmic shockwave (used by Desktop click/Spacebar)
   */
  public triggerShockwave(): void {
    this.shockwaveProgress = 0.01;
  }

  /**
   * @returns true on the exact frame a shockwave is unleashed (so AudioEngine can play the boom!)
   */
  public update(
    elapsed: number,
    dt: number,
    weight: number,
    handLeft: THREE.Vector3 | null,
    handRight: THREE.Vector3 | null
  ): boolean {
    this.group.visible = weight > 0.005;
    if (!this.group.visible) return false;

    let unleashedShockwave = false;

    // Advance active shockwave
    if (this.shockwaveProgress > 0) {
      this.shockwaveProgress += dt * 0.65;
      if (this.shockwaveProgress >= 1.0) {
        this.shockwaveProgress = 0;
      }
    }

    // Two-hand Star-Orb Charge & Release mechanic (Quest 3 Hand Tracking)
    if (handLeft && handRight) {
      const dist = handLeft.distanceTo(handRight);
      if (dist < 0.24) {
        this.wasCharging = true;
        this.chargeLevel = Math.min(1.0, this.chargeLevel + dt * 1.1);
        this.chargeOrb.position.copy(handLeft).add(handRight).multiplyScalar(0.5);
        this.chargeOrb.visible = true;
        const pulse = 1.0 + Math.sin(elapsed * 14.0) * 0.14;
        this.chargeOrb.scale.setScalar((0.25 + this.chargeLevel * 0.95) * pulse);
        this.chargeOrbMat.opacity = this.chargeLevel * weight * 0.9;
      } else {
        // Released hands apart after charging -> UNLEASH SHOCKWAVE!
        if (this.wasCharging && this.chargeLevel > 0.35 && dist > 0.34) {
          this.shockwaveProgress = 0.01;
          unleashedShockwave = true;
        }
        this.wasCharging = false;
        this.chargeLevel = Math.max(0, this.chargeLevel - dt * 2.2);
        this.chargeOrbMat.opacity = this.chargeLevel * weight * 0.9;
        if (this.chargeLevel <= 0.02) this.chargeOrb.visible = false;
      }
    } else {
      this.chargeLevel = Math.max(0, this.chargeLevel - dt * 2.0);
      this.chargeOrb.visible = false;
    }

    // Feed uniforms
    this.auroraUniforms.uTime.value = elapsed;
    this.auroraUniforms.uOpacity.value = weight;
    this.auroraUniforms.uShockwave.value = this.shockwaveProgress;

    this.floorUniforms.uTime.value = elapsed;
    this.floorUniforms.uOpacity.value = weight * 0.94;
    this.floorUniforms.uShockwave.value = this.shockwaveProgress;

    this.pillarsMat.opacity = weight * (0.12 + 0.05 * Math.sin(elapsed * 1.2) + (this.shockwaveProgress > 0 ? 0.14 : 0));

    this.oceanUniforms.uTime.value = elapsed;
    this.oceanUniforms.uOpacity.value = weight * 0.95;
    this.oceanUniforms.uShockwave.value = this.shockwaveProgress;

    if (handLeft) {
      this.oceanUniforms.uHandLeft.value.copy(handLeft);
      this.oceanUniforms.uHandLeftActive.value = 1.0;
    } else {
      this.oceanUniforms.uHandLeftActive.value = 0.0;
    }

    if (handRight) {
      this.oceanUniforms.uHandRight.value.copy(handRight);
      this.oceanUniforms.uHandRightActive.value = 1.0;
    } else {
      this.oceanUniforms.uHandRightActive.value = 0.0;
    }

    return unleashedShockwave;
  }
}
