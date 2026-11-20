import * as THREE from 'three';

const monolithVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const monolithFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uConductEnergy;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.4);
    float scan = sin(vWorldPos.y * 5.0 - uTime * 2.2 + length(vWorldPos.xz) * 1.5) * 0.5 + 0.5;

    vec3 obsidian = vec3(0.04, 0.05, 0.11);
    vec3 indigo = vec3(0.22, 0.18, 0.65);
    vec3 gold = vec3(1.0, 0.78, 0.36);
    vec3 cyan = vec3(0.28, 0.92, 0.96);

    vec3 rimCol = mix(indigo, cyan, scan);
    rimCol = mix(rimCol, gold, clamp(fresnel * 0.8 + uConductEnergy * 0.65, 0.0, 1.0));

    vec3 col = obsidian + rimCol * (fresnel * 1.45 + 0.12 + uConductEnergy * 0.35);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

/**
 * Chapter 2 — DE BREUK (Geometrisch & Escher)
 * Your real room breaks open into an impossible, infinite architectural void:
 * - Counter-rotating monumental sacred-geometry rings
 * - 140 floating Escher-like obsidian & gold monoliths in layered parallax depth
 * - Hand-conducting interaction: moving/spreading your hands bends the rings' tilt, scale & speed
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
    baseRadius: number;
  }> = [];

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
  };

  private readonly dummy = new THREE.Object3D();
  private readonly ringMat: THREE.MeshStandardMaterial;
  private readonly wireMat: THREE.MeshBasicMaterial;

  private smoothedSpread = 0.4;
  private smoothedTiltX = 0;
  private smoothedTiltZ = 0;

  constructor() {
    this.group.visible = false;

    // 1. Deep void sky dome that smoothly swallows Passthrough (MR -> VR)
    const domeGeo = new THREE.SphereGeometry(28, 32, 24);
    domeGeo.scale(-1, 1, 1);
    this.voidMat = new THREE.MeshBasicMaterial({
      color: 0x040510,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.voidDome = new THREE.Mesh(domeGeo, this.voidMat);
    this.voidDome.renderOrder = -2;
    this.group.add(this.voidDome);

    // 2. Monumental concentric Escher / sacred geometry rings
    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c38,
      emissive: 0x6366f1,
      emissiveIntensity: 0.65,
      metalness: 0.85,
      roughness: 0.2,
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
      { r: 2.6, tube: 0.032, sx: 0.14, sy: 0.22, sz: 0.08 },
      { r: 3.9, tube: 0.045, sx: -0.11, sy: 0.16, sz: -0.12 },
      { r: 5.5, tube: 0.06, sx: 0.08, sy: -0.14, sz: 0.1 },
      { r: 7.4, tube: 0.075, sx: -0.06, sy: 0.09, sz: -0.07 },
      { r: 9.8, tube: 0.09, sx: 0.04, sy: -0.07, sz: 0.05 },
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
        baseRadius: cfg.r,
      });
    });

    // Add an outer geometric icosahedron cathedral cage
    const cageGeo = new THREE.IcosahedronGeometry(11.5, 1);
    const cage = new THREE.Mesh(cageGeo, this.wireMat);
    this.ringsGroup.add(cage);
    this.rings.push({
      mesh: cage,
      baseSpeedX: 0.025,
      baseSpeedY: -0.035,
      baseSpeedZ: 0.015,
      baseRadius: 11.5,
    });

    this.ringsGroup.position.y = 1.4;
    this.group.add(this.ringsGroup);

    // 3. 140 floating Escher monoliths / stair-blocks in layered parallax
    const count = 140;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.monolithUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uConductEnergy: { value: 0 },
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
      const radius = 2.2 + layer * 2.1 + Math.random() * 1.8;
      const angle = (i / count) * Math.PI * 2 * 3 + Math.random() * 0.5;
      const y = -3.5 + Math.random() * 11.0;

      // Mix of tall pillars, floating stair slabs, and cubes
      const shapeType = i % 3;
      const scale =
        shapeType === 0
          ? new THREE.Vector3(0.18 + Math.random() * 0.25, 1.2 + Math.random() * 2.8, 0.18 + Math.random() * 0.25)
          : shapeType === 1
            ? new THREE.Vector3(0.9 + Math.random() * 1.4, 0.12 + Math.random() * 0.18, 0.35 + Math.random() * 0.5)
            : new THREE.Vector3(0.35 + Math.random() * 0.45, 0.35 + Math.random() * 0.45, 0.35 + Math.random() * 0.45);

      this.monolithData.push({
        angle,
        radius,
        y,
        scale,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 0.25,
          (Math.random() - 0.5) * 0.35,
          (Math.random() - 0.5) * 0.2
        ),
        orbitSpeed: (layer % 2 === 0 ? 1 : -1) * (0.04 + Math.random() * 0.06),
        phase: Math.random() * Math.PI * 2,
      });
    }

    this.group.add(this.monolithMesh);
  }

  /**
   * @param elapsed Global elapsed seconds
   * @param dt Delta time
   * @param weight 0..1 visibility weight of Chapter 2
   * @param voidOpacity 0..1 opacity of the VR sky dome (can stay 1.0 when handing off to Chapter 3)
   * @returns conductEnergy (0..1) for audio feedback
   */
  public update(
    elapsed: number,
    dt: number,
    weight: number,
    voidOpacity: number,
    handLeft: THREE.Vector3 | null,
    handRight: THREE.Vector3 | null
  ): number {
    this.group.visible = weight > 0.005 || voidOpacity > 0.005;
    if (!this.group.visible) return 0;

    this.voidMat.opacity = THREE.MathUtils.clamp(voidOpacity, 0, 1);
    this.voidDome.visible = voidOpacity > 0.005;

    const showGeom = weight > 0.005;
    this.ringsGroup.visible = showGeom;
    this.monolithMesh.visible = showGeom;
    if (!showGeom) return 0;

    // Conducting mechanic: hand spread & height bend the architecture
    let targetSpread = 0.45;
    let targetTiltX = 0;
    let targetTiltZ = 0;
    let conductEnergy = 0;

    if (handLeft && handRight) {
      const spread = handLeft.distanceTo(handRight); // typically 0.15m..1.1m
      targetSpread = THREE.MathUtils.clamp(spread, 0.15, 1.3);
      targetTiltZ = THREE.MathUtils.clamp((handLeft.y - handRight.y) * 0.9, -0.55, 0.55);
      targetTiltX = THREE.MathUtils.clamp(((handLeft.y + handRight.y) * 0.5 - 1.2) * 0.6, -0.45, 0.45);
      conductEnergy = THREE.MathUtils.clamp((spread - 0.35) * 1.1, 0, 1);
    } else if (handRight) {
      // Single hand or desktop cursor fallback
      targetSpread = 0.45 + THREE.MathUtils.clamp(Math.abs(handRight.x) * 0.55, 0, 0.8);
      targetTiltZ = THREE.MathUtils.clamp(-handRight.x * 0.35, -0.45, 0.45);
      targetTiltX = THREE.MathUtils.clamp((handRight.y - 1.25) * 0.35, -0.4, 0.4);
      conductEnergy = THREE.MathUtils.clamp(Math.abs(handRight.x) * 0.65, 0, 0.85);
    }

    const lerpRate = Math.min(1, dt * 3.5);
    this.smoothedSpread = THREE.MathUtils.lerp(this.smoothedSpread, targetSpread, lerpRate);
    this.smoothedTiltX = THREE.MathUtils.lerp(this.smoothedTiltX, targetTiltX, lerpRate);
    this.smoothedTiltZ = THREE.MathUtils.lerp(this.smoothedTiltZ, targetTiltZ, lerpRate);

    // Smoothly expand/contract the entire labyrinth with weight + hand spread
    const breathScale = (0.45 + weight * 0.55) * (0.82 + this.smoothedSpread * 0.42);
    this.ringsGroup.scale.setScalar(breathScale);
    this.ringsGroup.rotation.x = this.smoothedTiltX;
    this.ringsGroup.rotation.z = this.smoothedTiltZ;

    this.ringMat.opacity = weight * 0.92;
    this.wireMat.opacity = weight * (0.38 + conductEnergy * 0.42);

    const speedMult = 0.7 + this.smoothedSpread * 1.4;
    for (const r of this.rings) {
      r.mesh.rotation.x += r.baseSpeedX * speedMult * dt;
      r.mesh.rotation.y += r.baseSpeedY * speedMult * dt;
      r.mesh.rotation.z += r.baseSpeedZ * speedMult * dt;
    }

    // Update instanced Escher monoliths
    this.monolithUniforms.uTime.value = elapsed;
    this.monolithUniforms.uOpacity.value = weight * 0.95;
    this.monolithUniforms.uConductEnergy.value = conductEnergy;

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
