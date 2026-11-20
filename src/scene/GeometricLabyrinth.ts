import * as THREE from 'three';

const monolithVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// Engraved Sacred-Geometry Obsidian & Liquid-Gold Fresnel Shader
const monolithFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uConductEnergy;
  uniform float uAudio;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.3);

    // Crisp engraved sacred-geometry border & diamond inlay on every face
    vec2 centered = abs(vUv - 0.5) * 2.0;
    float border = smoothstep(0.84, 0.94, max(centered.x, centered.y));
    float innerFrame = smoothstep(0.62, 0.65, max(centered.x, centered.y)) *
                       (1.0 - smoothstep(0.66, 0.69, max(centered.x, centered.y)));
    float diamond = smoothstep(0.45, 0.48, centered.x + centered.y) *
                    (1.0 - smoothstep(0.49, 0.52, centered.x + centered.y));
    float engravings = clamp(border * 0.85 + innerFrame * 0.9 + diamond * 0.8, 0.0, 1.0);

    // Travelling golden energy wave across the architecture
    float energyWave = sin(vWorldPos.y * 2.6 - uTime * 2.4 + length(vWorldPos.xz) * 0.9) * 0.5 + 0.5;
    float pulse = 0.65 + 0.35 * energyWave + uAudio * 0.65 + uConductEnergy * 0.6;

    vec3 obsidian = vec3(0.025, 0.03, 0.075);
    vec3 indigo = vec3(0.28, 0.22, 0.78);
    vec3 cyan = vec3(0.22, 0.94, 0.96);
    vec3 gold = vec3(1.0, 0.78, 0.34);

    vec3 rimCol = mix(indigo, cyan, energyWave);
    vec3 etchCol = mix(cyan, gold, clamp(fresnel * 0.6 + energyWave * 0.5 + uConductEnergy * 0.5, 0.0, 1.0));

    // Distance atmospheric depth fog (melts distant monoliths into indigo void)
    float dist = length(vWorldPos - cameraPosition);
    float fog = smoothstep(6.0, 22.0, dist);

    vec3 col = obsidian + rimCol * (fresnel * 1.55) + etchCol * engravings * (0.95 * pulse);
    col = mix(col, vec3(0.03, 0.035, 0.11), fog * 0.75);

    gl_FragColor = vec4(col, uOpacity);
  }
`;

// Luminous Sacred-Geometry Floor Mandala shader
const mandalaVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const mandalaFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uAudio;

  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;

    float a = atan(p.y, p.x);

    // Concentric rings + rotating 8-fold sacred geometry star
    float rings = pow(abs(sin(r * 22.0 - uTime * 0.8)), 16.0);
    float star = pow(abs(sin(a * 8.0 + r * 6.0 + uTime * 0.35)), 14.0) * smoothstep(0.12, 0.85, r);
    float spokes = pow(abs(cos(a * 4.0 - uTime * 0.2)), 28.0) * (1.0 - smoothstep(0.85, 1.0, r));
    float outerRing = exp(-pow((r - 0.92) * 22.0, 2.0));

    float pattern = clamp(rings * 0.65 + star * 0.55 + spokes * 0.45 + outerRing * 1.1, 0.0, 1.5);
    float fade = (1.0 - smoothstep(0.75, 1.0, r));

    vec3 cyan = vec3(0.22, 0.92, 0.96);
    vec3 gold = vec3(1.0, 0.8, 0.38);
    vec3 col = mix(cyan, gold, smoothstep(0.25, 0.92, r)) * (1.0 + uAudio * 0.75);

    gl_FragColor = vec4(col * pattern, pattern * fade * uOpacity * 0.72);
  }
`;

/**
 * Chapter 2 — DE BREUK (v0.3 Visual Overhaul)
 * - Deep indigo void dome smoothly swallowing Passthrough (MR -> VR)
 * - 8 Monumental Escher Archways / Portal Gates forming an impossible octagonal temple
 * - Sacred-Geometry glowing floor mandala beneath your feet
 * - Counter-rotating monumental rings + 140 engraved obsidian & liquid-gold monoliths
 * - Hand-conducting interaction: moving/spreading hands bends the entire architecture
 */
export class GeometricLabyrinth {
  public readonly group = new THREE.Group();

  private readonly voidDome: THREE.Mesh;
  private readonly voidMat: THREE.MeshBasicMaterial;

  private readonly ringsGroup = new THREE.Group();
  private readonly rings: Array<{
    mesh: THREE.Mesh;
    baseSpeedX: number;
    baseSpeedY: number;
    baseSpeedZ: number;
  }> = [];

  private readonly archesGroup = new THREE.Group();
  private readonly archMat: THREE.MeshStandardMaterial;
  private readonly archGlowMat: THREE.MeshBasicMaterial;

  private readonly mandalaUniforms: {
    uTime: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uAudio: THREE.IUniform<number>;
  };

  private readonly monolithMesh: THREE.InstancedMesh;
  private readonly monolithData: Array<{
    angle: number;
    radius: number;
    y: number;
    scale: THREE.Vector3;
    rotSpeed: THREE.Vector3;
    orbitSpeed: number;
    phase: number;
  }> = [];
  private readonly monolithUniforms: {
    uTime: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uConductEnergy: THREE.IUniform<number>;
    uAudio: THREE.IUniform<number>;
  };

  private readonly dummy = new THREE.Object3D();
  private readonly ringMat: THREE.MeshStandardMaterial;
  private readonly wireMat: THREE.MeshBasicMaterial;

  private smoothedSpread = 0.4;
  private smoothedTiltX = 0;
  private smoothedTiltZ = 0;

  constructor() {
    this.group.visible = false;

    // 1. Deep indigo void sky dome
    const domeGeo = new THREE.SphereGeometry(28, 32, 24);
    domeGeo.scale(-1, 1, 1);
    this.voidMat = new THREE.MeshBasicMaterial({
      color: 0x040512,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.voidDome = new THREE.Mesh(domeGeo, this.voidMat);
    this.voidDome.renderOrder = -2;
    this.group.add(this.voidDome);

    // 2. Luminous Floor Mandala beneath your feet
    const mandalaGeo = new THREE.PlaneGeometry(5.6, 5.6);
    mandalaGeo.rotateX(-Math.PI / 2);
    this.mandalaUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uAudio: { value: 0 },
    };
    const mandalaMat = new THREE.ShaderMaterial({
      uniforms: this.mandalaUniforms,
      vertexShader: mandalaVertexShader,
      fragmentShader: mandalaFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mandalaMesh = new THREE.Mesh(mandalaGeo, mandalaMat);
    mandalaMesh.position.y = 0.01;
    this.group.add(mandalaMesh);

    // 3. 8 Monumental Escher Archways / Portal Gates around you
    this.archMat = new THREE.MeshStandardMaterial({
      color: 0x10132b,
      emissive: 0x312e81,
      emissiveIntensity: 0.45,
      metalness: 0.85,
      roughness: 0.22,
      transparent: true,
      opacity: 0,
    });
    this.archGlowMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const pillarGeo = new THREE.BoxGeometry(0.26, 5.2, 0.26);
    const lintelGeo = new THREE.BoxGeometry(2.3, 0.26, 0.3);
    const frameGeo = new THREE.TorusGeometry(0.75, 0.025, 8, 32);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 4.6;
      const gate = new THREE.Group();
      gate.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      gate.lookAt(0, 0, 0);

      const leftPillar = new THREE.Mesh(pillarGeo, this.archMat);
      leftPillar.position.set(-0.95, 2.5, 0);
      const rightPillar = new THREE.Mesh(pillarGeo, this.archMat);
      rightPillar.position.set(0.95, 2.5, 0);
      const topLintel = new THREE.Mesh(lintelGeo, this.archMat);
      topLintel.position.set(0, 5.1, 0);

      // Glowing sacred ring suspended inside each portal arch
      const innerRing = new THREE.Mesh(frameGeo, this.archGlowMat);
      innerRing.position.set(0, 2.6, 0);

      gate.add(leftPillar, rightPillar, topLintel, innerRing);
      this.archesGroup.add(gate);
    }
    this.group.add(this.archesGroup);

    // 4. Concentric counter-rotating sacred-geometry rings
    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c38,
      emissive: 0x6366f1,
      emissiveIntensity: 0.72,
      metalness: 0.88,
      roughness: 0.18,
      transparent: true,
      opacity: 0,
    });

    this.wireMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      wireframe: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const ringConfigs = [
      { r: 2.8, tube: 0.032, sx: 0.14, sy: 0.22, sz: 0.08 },
      { r: 4.1, tube: 0.045, sx: -0.11, sy: 0.16, sz: -0.12 },
      { r: 5.8, tube: 0.06, sx: 0.08, sy: -0.14, sz: 0.1 },
      { r: 7.8, tube: 0.075, sx: -0.06, sy: 0.09, sz: -0.07 },
      { r: 10.2, tube: 0.09, sx: 0.04, sy: -0.07, sz: 0.05 },
    ];

    ringConfigs.forEach((cfg, idx) => {
      const geo = new THREE.TorusGeometry(cfg.r, cfg.tube, 12, 72);
      const mesh = new THREE.Mesh(geo, idx % 2 === 0 ? this.ringMat : this.wireMat);
      mesh.rotation.set(idx * 0.7, idx * 1.1, idx * 0.4);
      this.ringsGroup.add(mesh);
      this.rings.push({
        mesh,
        baseSpeedX: cfg.sx,
        baseSpeedY: cfg.sy,
        baseSpeedZ: cfg.sz,
      });
    });

    const cageGeo = new THREE.IcosahedronGeometry(12.2, 1);
    const cage = new THREE.Mesh(cageGeo, this.wireMat);
    this.ringsGroup.add(cage);
    this.rings.push({
      mesh: cage,
      baseSpeedX: 0.025,
      baseSpeedY: -0.035,
      baseSpeedZ: 0.015,
    });

    this.ringsGroup.position.y = 1.4;
    this.group.add(this.ringsGroup);

    // 5. 140 Engraved Escher Monoliths
    const count = 140;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.monolithUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uConductEnergy: { value: 0 },
      uAudio: { value: 0 },
    };
    const monolithMat = new THREE.ShaderMaterial({
      uniforms: this.monolithUniforms,
      vertexShader: monolithVertexShader,
      fragmentShader: monolithFragmentShader,
      transparent: true,
      depthWrite: true,
    });

    this.monolithMesh = new THREE.InstancedMesh(boxGeo, monolithMat, count);
    this.monolithMesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const layer = i % 4;
      const radius = 2.6 + layer * 2.2 + Math.random() * 1.9;
      const angle = (i / count) * Math.PI * 2 * 3 + Math.random() * 0.5;
      const y = -3.8 + Math.random() * 12.0;

      const shapeType = i % 3;
      const scale =
        shapeType === 0
          ? new THREE.Vector3(0.2 + Math.random() * 0.25, 1.4 + Math.random() * 3.0, 0.2 + Math.random() * 0.25)
          : shapeType === 1
            ? new THREE.Vector3(1.0 + Math.random() * 1.5, 0.14 + Math.random() * 0.18, 0.4 + Math.random() * 0.5)
            : new THREE.Vector3(0.4 + Math.random() * 0.5, 0.4 + Math.random() * 0.5, 0.4 + Math.random() * 0.5);

      this.monolithData.push({
        angle,
        radius,
        y,
        scale,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 0.22,
          (Math.random() - 0.5) * 0.32,
          (Math.random() - 0.5) * 0.18
        ),
        orbitSpeed: (layer % 2 === 0 ? 1 : -1) * (0.04 + Math.random() * 0.06),
        phase: Math.random() * Math.PI * 2,
      });
    }

    this.group.add(this.monolithMesh);
  }

  public update(
    elapsed: number,
    dt: number,
    weight: number,
    voidOpacity: number,
    audioEnergy: number,
    handLeft: THREE.Vector3 | null,
    handRight: THREE.Vector3 | null
  ): number {
    this.group.visible = weight > 0.005 || voidOpacity > 0.005;
    if (!this.group.visible) return 0;

    this.voidMat.opacity = THREE.MathUtils.clamp(voidOpacity, 0, 1);
    this.voidDome.visible = voidOpacity > 0.005;

    const showGeom = weight > 0.005;
    this.ringsGroup.visible = showGeom;
    this.archesGroup.visible = showGeom;
    this.monolithMesh.visible = showGeom;
    this.mandalaUniforms.uOpacity.value = weight;
    this.mandalaUniforms.uTime.value = elapsed;
    this.mandalaUniforms.uAudio.value = audioEnergy;

    if (!showGeom) return 0;

    let targetSpread = 0.45;
    let targetTiltX = 0;
    let targetTiltZ = 0;
    let conductEnergy = 0;

    if (handLeft && handRight) {
      const spread = handLeft.distanceTo(handRight);
      targetSpread = THREE.MathUtils.clamp(spread, 0.15, 1.3);
      targetTiltZ = THREE.MathUtils.clamp((handLeft.y - handRight.y) * 0.9, -0.55, 0.55);
      targetTiltX = THREE.MathUtils.clamp(((handLeft.y + handRight.y) * 0.5 - 1.2) * 0.6, -0.45, 0.45);
      conductEnergy = THREE.MathUtils.clamp((spread - 0.35) * 1.1, 0, 1);
    } else if (handRight) {
      targetSpread = 0.45 + THREE.MathUtils.clamp(Math.abs(handRight.x) * 0.55, 0, 0.8);
      targetTiltZ = THREE.MathUtils.clamp(-handRight.x * 0.35, -0.45, 0.45);
      targetTiltX = THREE.MathUtils.clamp((handRight.y - 1.25) * 0.35, -0.4, 0.4);
      conductEnergy = THREE.MathUtils.clamp(Math.abs(handRight.x) * 0.65, 0, 0.85);
    }

    const lerpRate = Math.min(1, dt * 3.5);
    this.smoothedSpread = THREE.MathUtils.lerp(this.smoothedSpread, targetSpread, lerpRate);
    this.smoothedTiltX = THREE.MathUtils.lerp(this.smoothedTiltX, targetTiltX, lerpRate);
    this.smoothedTiltZ = THREE.MathUtils.lerp(this.smoothedTiltZ, targetTiltZ, lerpRate);

    // Arches rise monumentally from below & rotate slowly
    this.archesGroup.position.y = (1.0 - weight) * -3.5;
    this.archesGroup.rotation.y = elapsed * 0.03 + this.smoothedTiltZ * 0.25;
    this.archMat.opacity = weight * 0.94;
    this.archGlowMat.opacity = weight * (0.45 + audioEnergy * 0.4 + conductEnergy * 0.35);

    const breathScale = (0.45 + weight * 0.55) * (0.82 + this.smoothedSpread * 0.42 + audioEnergy * 0.06);
    this.ringsGroup.scale.setScalar(breathScale);
    this.ringsGroup.rotation.x = this.smoothedTiltX;
    this.ringsGroup.rotation.z = this.smoothedTiltZ;

    this.ringMat.opacity = weight * 0.92;
    this.wireMat.opacity = weight * (0.38 + conductEnergy * 0.42 + audioEnergy * 0.25);

    const speedMult = 0.7 + this.smoothedSpread * 1.4;
    for (const r of this.rings) {
      r.mesh.rotation.x += r.baseSpeedX * speedMult * dt;
      r.mesh.rotation.y += r.baseSpeedY * speedMult * dt;
      r.mesh.rotation.z += r.baseSpeedZ * speedMult * dt;
    }

    this.monolithUniforms.uTime.value = elapsed;
    this.monolithUniforms.uOpacity.value = weight * 0.96;
    this.monolithUniforms.uConductEnergy.value = conductEnergy;
    this.monolithUniforms.uAudio.value = audioEnergy;

    const expandFactor = 0.78 + this.smoothedSpread * 0.45;
    for (let i = 0; i < this.monolithData.length; i++) {
      const m = this.monolithData[i];
      const a = m.angle + elapsed * m.orbitSpeed * (0.65 + conductEnergy * 1.1);
      const r = m.radius * expandFactor;
      const bob = Math.sin(elapsed * 0.8 + m.phase) * 0.35;

      this.dummy.position.set(Math.cos(a) * r, m.y + bob, Math.sin(a) * r);
      this.dummy.rotation.set(
        elapsed * m.rotSpeed.x + this.smoothedTiltX * 0.6,
        a + elapsed * m.rotSpeed.y,
        elapsed * m.rotSpeed.z + this.smoothedTiltZ * 0.6
      );
      this.dummy.scale.copy(m.scale).multiplyScalar(0.2 + weight * 0.8);
      this.dummy.updateMatrix();
      this.monolithMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.monolithMesh.instanceMatrix.needsUpdate = true;

    return conductEnergy;
  }
}
