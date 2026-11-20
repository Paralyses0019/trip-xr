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
  uniform float uAudio;

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

    vec3 zenith = vec3(0.012, 0.018, 0.075);
    vec3 horizon = vec3(0.075, 0.035, 0.19);
    vec3 col = mix(horizon, zenith, smoothstep(-0.1, 0.75, elevation));

    float angle = atan(dir.z, dir.x);
    float band1 = sin(angle * 3.0 + uTime * 0.25 + noise(vec2(angle * 2.0, uTime * 0.15)) * 4.0);
    float band2 = cos(angle * 5.0 - uTime * 0.18 + noise(vec2(angle * 3.5, elevation * 3.0)) * 3.0);

    float curtain = smoothstep(0.02, 0.55, elevation) * (1.0 - smoothstep(0.55, 0.98, elevation));
    float ribbon1 = pow(max(0.0, band1 * 0.5 + 0.5), 3.0) * curtain;
    float ribbon2 = pow(max(0.0, band2 * 0.5 + 0.5), 4.0) * curtain;

    vec3 auroraTeal = vec3(0.12, 0.92, 0.82);
    vec3 auroraViolet = vec3(0.58, 0.24, 0.98);
    vec3 auroraGold = vec3(1.0, 0.74, 0.35);

    col += auroraTeal * ribbon1 * (0.58 + uAudio * 0.35);
    col += auroraViolet * ribbon2 * (0.52 + uAudio * 0.35);
    col += auroraGold * pow(ribbon1 * ribbon2, 1.2) * (0.65 + uShockwave * 1.4);

    // Starfield
    vec2 starUV = floor(vec2(angle * 48.0, elevation * 96.0));
    float star = step(0.991, hash(starUV)) * smoothstep(0.04, 0.35, elevation);
    float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + hash(starUV + 1.0) * 20.0);
    col += vec3(0.85, 0.95, 1.0) * star * twinkle * 0.95;

    float shockBand = exp(-pow((elevation - uShockwave * 1.1) * 7.0, 2.0)) * (1.0 - uShockwave) * step(0.001, uShockwave);
    col += vec3(0.45, 0.95, 1.0) * shockBand * 0.95;

    gl_FragColor = vec4(col, uOpacity);
  }
`;

// Colossal 3D Silk Aurora Curtain Ribbon shader
const silkRibbonVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uAudio;

  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Sweeping 3D undulating silk motion overhead
    float wave1 = sin(uv.x * 8.0 + uTime * 0.75 + uPhase) * 0.85;
    float wave2 = cos(uv.x * 13.0 - uTime * 0.55 + uPhase * 1.7) * 0.45;
    pos.y += (wave1 + wave2) * (0.6 + uv.y * 0.6) * (1.0 + uAudio * 0.35);
    pos.z += sin(uv.x * 5.0 + uTime * 0.45 + uPhase) * 1.1;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const silkRibbonFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uShockwave;
  uniform float uAudio;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying vec2 vUv;

  void main() {
    // Soft feathered edges at both ends and top/bottom of the silk curtain
    float edgeX = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
    float edgeY = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.68, 1.0, vUv.y));

    // Vertical luminous aurora striations flowing along the ribbon
    float streaks = pow(sin(vUv.x * 38.0 + uTime * 1.4) * 0.5 + 0.5, 2.5) * 0.65 +
                    pow(cos(vUv.x * 62.0 - uTime * 1.9) * 0.5 + 0.5, 3.0) * 0.5;
    float bottomRim = exp(-pow((vUv.y - 0.18) * 5.5, 2.0));

    vec3 col = mix(uColorA, uColorB, vUv.y);
    col = mix(col, vec3(1.0, 0.88, 0.52), clamp(bottomRim * 0.45 + uShockwave * 0.8, 0.0, 1.0));

    float intensity = (0.45 + streaks * 0.9 + bottomRim * 0.85) * (1.0 + uAudio * 0.65 + uShockwave * 0.9);
    float alpha = edgeX * edgeY * clamp(0.26 + streaks * 0.35 + bottomRim * 0.3, 0.0, 0.85) * uOpacity;

    gl_FragColor = vec4(col * intensity, alpha);
  }
`;

// Volumetric God-Ray Light Shaft shader (smooth Fresnel edge fade -> zero hard edges)
const godRayVertexShader = /* glsl */ `
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

const godRayFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uAudio;
  uniform float uShockwave;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Center of shaft is bright, silhouette edges fade cleanly to 0
    float facing = pow(abs(dot(normalize(vNormal), normalize(vViewDir))), 2.2);
    float verticalFade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));
    float shimmer = 0.78 + 0.22 * sin(vUv.y * 10.0 - uTime * 1.6);

    vec3 cyan = vec3(0.22, 0.88, 0.98);
    vec3 gold = vec3(1.0, 0.84, 0.48);
    vec3 col = mix(cyan, gold, uShockwave * 0.85 + vUv.y * 0.25);

    float alpha = facing * verticalFade * shimmer * uOpacity * (0.28 + uAudio * 0.22 + uShockwave * 0.35);
    gl_FragColor = vec4(col * 1.4, alpha);
  }
`;

// Upgraded Infinite Liquid-Mirror Floor with shimmering caustics + shockwave ring
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
  uniform float uAudio;

  varying vec3 vWorldPos;

  void main() {
    float dist = length(vWorldPos.xz);
    float fade = 1.0 - smoothstep(9.0, 24.0, dist);

    // Overlapping liquid caustics web
    vec2 p = vWorldPos.xz * 0.85;
    float c1 = sin(p.x * 2.4 + uTime * 0.9 + cos(p.y * 2.1 - uTime * 0.7));
    float c2 = cos(p.y * 2.8 - uTime * 1.1 + sin(p.x * 2.3 + uTime * 0.6));
    float caustics = pow(1.0 - abs(c1 + c2) * 0.5, 4.0);

    float ripple = sin(dist * 3.4 - uTime * 1.7) * 0.5 + 0.5;

    float shockRadius = uShockwave * 19.0;
    float shockRing = exp(-pow((dist - shockRadius) * 1.25, 2.0)) * (1.0 - uShockwave) * step(0.001, uShockwave);

    vec3 obsidian = vec3(0.015, 0.02, 0.055);
    vec3 cyan = vec3(0.18, 0.9, 0.95);
    vec3 violet = vec3(0.56, 0.24, 0.96);
    vec3 gold = vec3(1.0, 0.84, 0.44);

    vec3 reflection = mix(violet, cyan, ripple) * (0.14 + caustics * (0.48 + uAudio * 0.35));
    vec3 col = obsidian + reflection + gold * shockRing * 2.1;

    float sanctuary = exp(-pow((dist - 0.85) * 10.0, 2.0)) * (0.45 + uAudio * 0.3);
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
  uniform float uAudio;
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

    float wave = sin(pos.x * 0.45 + uTime * 0.65 + aPhase) * 0.55
               + cos(pos.z * 0.4 + uTime * 0.5 - aPhase) * 0.55;
    pos.y += wave * (1.0 + uAudio * 0.35);

    float orbitAngle = uTime * 0.06 + aPhase * 0.05;
    float c = cos(orbitAngle);
    float s = sin(orbitAngle);
    pos.xz = mat2(c, -s, s, c) * pos.xz;

    float glow = uAudio * 0.35;

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
    gl_PointSize = clamp(aSize * uPixelRatio * (1.0 + vGlow * 0.9) * (215.0 / dist), 2.0, 64.0);
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
 * Chapter 3 — DE KATHEDRAAL (v0.3 Visual Overhaul)
 * - Vast Aurora Sky Dome
 * - 6 Colossal 3D Silk Aurora Ribbons soaring overhead
 * - 12 Soft Volumetric God-Ray Light Shafts
 * - Infinite Liquid-Mirror Floor with shimmering water caustics
 * - 8,500 GPU-driven Cosmic Ocean Particles attracted to your hands + Gravity Orb Shockwave
 */
export class CosmicCathedral {
  public readonly group = new THREE.Group();

  private readonly auroraUniforms: {
    uTime: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uShockwave: THREE.IUniform<number>;
    uAudio: THREE.IUniform<number>;
  };
  private readonly floorUniforms: {
    uTime: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uShockwave: THREE.IUniform<number>;
    uAudio: THREE.IUniform<number>;
  };
  private readonly godRayUniforms: {
    uTime: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uAudio: THREE.IUniform<number>;
    uShockwave: THREE.IUniform<number>;
  };
  private readonly oceanUniforms: {
    uTime: THREE.IUniform<number>;
    uPixelRatio: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uAudio: THREE.IUniform<number>;
    uHandLeft: THREE.IUniform<THREE.Vector3>;
    uHandRight: THREE.IUniform<THREE.Vector3>;
    uHandLeftActive: THREE.IUniform<number>;
    uHandRightActive: THREE.IUniform<number>;
    uShockwave: THREE.IUniform<number>;
  };
  private readonly ribbonMaterials: THREE.ShaderMaterial[] = [];

  private readonly chargeOrb: THREE.Mesh;
  private readonly chargeOrbMat: THREE.MeshBasicMaterial;

  private chargeLevel = 0;
  private shockwaveProgress = 0;
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
      uAudio: { value: 0 },
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

    // 2. 6 Colossal 3D Silk Aurora Ribbons soaring overhead
    const ribbonColors: Array<[THREE.Color, THREE.Color]> = [
      [new THREE.Color(0x14b8a6), new THREE.Color(0x6366f1)],
      [new THREE.Color(0x38bdf8), new THREE.Color(0xc084fc)],
      [new THREE.Color(0x2dd4bf), new THREE.Color(0xf472b6)],
    ];

    for (let i = 0; i < 6; i++) {
      // Build a sweeping 3D arc ribbon around the cathedral ceiling
      const segX = 48;
      const segY = 6;
      const ribbonGeo = new THREE.PlaneGeometry(18, 3.6, segX, segY);
      const posAttr = ribbonGeo.attributes.position as THREE.BufferAttribute;
      const arcRadius = 8.5 + (i % 3) * 3.2;
      const arcHeight = 5.2 + (i % 3) * 2.4;
      const startAngle = (i / 6) * Math.PI * 2;

      for (let v = 0; v < posAttr.count; v++) {
        const lx = posAttr.getX(v); // -9..+9
        const ly = posAttr.getY(v); // -1.8..+1.8
        const theta = startAngle + (lx / 9.0) * 1.15;
        const r = arcRadius + Math.sin((lx / 9.0) * Math.PI) * 1.4;
        posAttr.setXYZ(v, Math.cos(theta) * r, arcHeight + ly, Math.sin(theta) * r);
      }
      ribbonGeo.computeVertexNormals();

      const [cA, cB] = ribbonColors[i % ribbonColors.length];
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: i * 1.35 },
          uOpacity: { value: 0 },
          uShockwave: { value: 0 },
          uAudio: { value: 0 },
          uColorA: { value: cA },
          uColorB: { value: cB },
        },
        vertexShader: silkRibbonVertexShader,
        fragmentShader: silkRibbonFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.ribbonMaterials.push(mat);
      const mesh = new THREE.Mesh(ribbonGeo, mat);
      this.group.add(mesh);
    }

    // 3. Infinite Liquid-Mirror Floor with Caustics
    const floorGeo = new THREE.CircleGeometry(24, 64);
    floorGeo.rotateX(-Math.PI / 2);
    this.floorUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uShockwave: { value: 0 },
      uAudio: { value: 0 },
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

    // 4. 12 Volumetric God-Ray Light Shafts (soft Fresnel-fading cones)
    const shaftGeo = new THREE.CylinderGeometry(0.35, 1.35, 22, 18, 1, true);
    this.godRayUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uAudio: { value: 0 },
      uShockwave: { value: 0 },
    };
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: this.godRayUniforms,
      vertexShader: godRayVertexShader,
      fragmentShader: godRayFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 11.2;
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.position.set(Math.cos(a) * r, 10.8, Math.sin(a) * r);
      this.group.add(shaft);
    }

    // 5. 8,500 GPU-driven Cosmic Particle Ocean
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
      uAudio: { value: 0 },
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

    // 6. Pulsing Star-Orb between both palms
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

  public triggerShockwave(): void {
    this.shockwaveProgress = 0.01;
  }

  public update(
    elapsed: number,
    dt: number,
    weight: number,
    audioEnergy: number,
    handLeft: THREE.Vector3 | null,
    handRight: THREE.Vector3 | null
  ): boolean {
    this.group.visible = weight > 0.005;
    if (!this.group.visible) return false;

    let unleashedShockwave = false;

    if (this.shockwaveProgress > 0) {
      this.shockwaveProgress += dt * 0.62;
      if (this.shockwaveProgress >= 1.0) {
        this.shockwaveProgress = 0;
      }
    }

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

    this.auroraUniforms.uTime.value = elapsed;
    this.auroraUniforms.uOpacity.value = weight;
    this.auroraUniforms.uShockwave.value = this.shockwaveProgress;
    this.auroraUniforms.uAudio.value = audioEnergy;

    for (const mat of this.ribbonMaterials) {
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uOpacity.value = weight;
      mat.uniforms.uShockwave.value = this.shockwaveProgress;
      mat.uniforms.uAudio.value = audioEnergy;
    }

    this.floorUniforms.uTime.value = elapsed;
    this.floorUniforms.uOpacity.value = weight * 0.95;
    this.floorUniforms.uShockwave.value = this.shockwaveProgress;
    this.floorUniforms.uAudio.value = audioEnergy;

    this.godRayUniforms.uTime.value = elapsed;
    this.godRayUniforms.uOpacity.value = weight;
    this.godRayUniforms.uAudio.value = audioEnergy;
    this.godRayUniforms.uShockwave.value = this.shockwaveProgress;

    this.oceanUniforms.uTime.value = elapsed;
    this.oceanUniforms.uOpacity.value = weight * 0.95;
    this.oceanUniforms.uAudio.value = audioEnergy;
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
