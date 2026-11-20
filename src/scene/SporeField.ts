import * as THREE from 'three';

const sporeVertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aEnergy;

  uniform float uPixelRatio;
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vEnergy;
  varying float vOpacity;

  void main() {
    vColor = aColor;
    vEnergy = aEnergy;
    vOpacity = uOpacity;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.35, -mvPosition.z);
    gl_PointSize = aSize * uPixelRatio * (1.0 + aEnergy * 1.35) * (180.0 / dist);
    gl_PointSize = clamp(gl_PointSize, 2.0, 72.0);
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

    // Soft glowing bioluminescent orb with bright core
    float core = exp(-r * r * 26.0);
    float halo = exp(-r * r * 6.5) * 0.55;
    float alpha = (core + halo) * vOpacity;

    vec3 col = mix(vColor, vec3(1.0, 0.92, 0.65), clamp(vEnergy * 0.75 + core * 0.45, 0.0, 1.0));
    gl_FragColor = vec4(col * (1.2 + vEnergy * 1.2), alpha);
  }
`;

/**
 * Chapter 1 Bioluminescent Spore Field + Sprouting Room Flora.
 * Spores react to your hands (swirling away & flaring bright gold/cyan).
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
  };

  // Sprouting bioluminescent flora around the perimeter (outside 1.1m comfort bubble)
  private readonly floraGroup = new THREE.Group();
  private readonly floraItems: Array<{
    group: THREE.Group;
    targetScale: number;
    delay: number;
    phase: number;
  }> = [];

  constructor() {
    this.positions = new Float32Array(this.count * 3);
    this.basePositions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.energies = new Float32Array(this.count);
    this.phases = new Float32Array(this.count);

    const colors = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);

    const palette = [
      new THREE.Color(0x2dd4bf), // teal
      new THREE.Color(0x5eead4), // cyan
      new THREE.Color(0xa78bfa), // violet
      new THREE.Color(0xf472b6), // bioluminescent pink
      new THREE.Color(0xfbbf24), // warm gold
    ];

    for (let i = 0; i < this.count; i++) {
      // Distribute in a lush cylinder/dome around the user (radius 0.45m..3.8m, height 0.08m..2.7m)
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

    this.buildFlora();
    this.group.add(this.floraGroup);
  }

  private buildFlora(): void {
    const stemGeo = new THREE.CylinderGeometry(0.008, 0.016, 0.32, 8);
    stemGeo.translate(0, 0.16, 0);

    const capGeo = new THREE.SphereGeometry(0.075, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
    capGeo.scale(1.0, 0.65, 1.0);

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      emissive: 0x14b8a6,
      emissiveIntensity: 0.45,
      roughness: 0.5,
    });

    const capColors = [0x2dd4bf, 0xa78bfa, 0x38bdf8, 0xf472b6];

    // 26 delicate glowing flora clusters sprouting around the room perimeter
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const radius = 1.25 + Math.random() * 1.9;

      const cluster = new THREE.Group();
      cluster.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      cluster.rotation.y = Math.random() * Math.PI * 2;
      cluster.scale.setScalar(0.0001);

      const capColor = capColors[i % capColors.length];
      const capMat = new THREE.MeshStandardMaterial({
        color: capColor,
        emissive: capColor,
        emissiveIntensity: 1.15,
        roughness: 0.25,
        transparent: true,
        opacity: 0.88,
      });

      const subCount = 2 + (i % 3);
      for (let j = 0; j < subCount; j++) {
        const sub = new THREE.Group();
        const s = 0.55 + Math.random() * 0.9;
        sub.scale.setScalar(s);
        sub.position.set((Math.random() - 0.5) * 0.14, 0, (Math.random() - 0.5) * 0.14);
        sub.rotation.z = (Math.random() - 0.5) * 0.28;
        sub.rotation.x = (Math.random() - 0.5) * 0.28;

        const stem = new THREE.Mesh(stemGeo, stemMat);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.31;
        sub.add(stem, cap);
        cluster.add(sub);
      }

      this.floraGroup.add(cluster);
      this.floraItems.push({
        group: cluster,
        targetScale: 0.65 + Math.random() * 0.85,
        delay: 0.15 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /**
   * Updates spore drift, hand-swirl physics, and flora sprouting.
   * Returns total hand-stir energy (0..1+) so AudioEngine can trigger chimes.
   */
  public update(
    elapsed: number,
    dt: number,
    progress: number,
    handLeft: THREE.Vector3 | null,
    handRight: THREE.Vector3 | null
  ): number {
    this.pointsUniforms.uOpacity.value = THREE.MathUtils.smoothstep(progress, 0.04, 0.35);

    if (progress <= 0.01) {
      return 0;
    }

    const clampedDt = Math.min(dt, 0.05);
    const hands: THREE.Vector3[] = [];
    if (handLeft) hands.push(handLeft);
    if (handRight) hands.push(handRight);

    let stirIntensity = 0;
    const interactRadius = 0.42;
    const interactRadiusSq = interactRadius * interactRadius;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const phase = this.phases[i];

      // Gentle upward drift & organic sine sway
      const targetX = this.basePositions[i3] + Math.sin(elapsed * 0.45 + phase) * 0.18;
      let targetY = this.basePositions[i3 + 1] + ((elapsed * 0.09 + phase * 0.3) % 2.6);
      if (targetY > 2.75) targetY -= 2.65;
      const targetZ = this.basePositions[i3 + 2] + Math.cos(elapsed * 0.4 + phase * 1.3) * 0.18;

      // Soft spring back toward organic drift path
      this.velocities[i3] += (targetX - this.positions[i3]) * 0.9 * clampedDt;
      this.velocities[i3 + 1] += (targetY - this.positions[i3 + 1]) * 0.9 * clampedDt;
      this.velocities[i3 + 2] += (targetZ - this.positions[i3 + 2]) * 0.9 * clampedDt;

      // Hand repulsion + swirling vortex
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

          // Push outward + gentle upward swirl
          this.velocities[i3] += (dx * invD - dz * invD * 0.5) * force;
          this.velocities[i3 + 1] += (dy * invD + 0.4) * force;
          this.velocities[i3 + 2] += (dz * invD + dx * invD * 0.5) * force;

          this.energies[i] = Math.min(1.0, this.energies[i] + force * 3.0);
          stirIntensity += force;
        }
      }

      // Damping
      const damp = Math.pow(0.18, clampedDt);
      this.velocities[i3] *= damp;
      this.velocities[i3 + 1] *= damp;
      this.velocities[i3 + 2] *= damp;

      this.positions[i3] += this.velocities[i3] * clampedDt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * clampedDt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * clampedDt;

      // Decay glow energy
      this.energies[i] = Math.max(0, this.energies[i] - clampedDt * 0.85);
    }

    (this.pointsGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsGeo.attributes.aEnergy as THREE.BufferAttribute).needsUpdate = true;

    // Sprout bioluminescent flora around the room
    for (const item of this.floraItems) {
      const localP = THREE.MathUtils.clamp((progress - item.delay) / 0.35, 0, 1);
      // Smooth elastic ease-out
      const eased = 1 - Math.pow(1 - localP, 3);
      const breathe = 1.0 + Math.sin(elapsed * 1.8 + item.phase) * 0.04;
      const s = Math.max(0.0001, eased * item.targetScale * breathe);
      item.group.scale.setScalar(s);
    }

    return Math.min(1.0, stirIntensity * 0.15);
  }
}
