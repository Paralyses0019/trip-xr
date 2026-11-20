import * as THREE from 'three';

const trailVertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  attribute vec3 aColor;

  uniform float uPixelRatio;

  varying float vLife;
  varying vec3 vColor;

  void main() {
    vLife = aLife;
    vColor = aColor;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.25, -mvPos.z);
    gl_PointSize = clamp(aSize * aLife * uPixelRatio * (140.0 / dist), 0.0, 56.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const trailFragmentShader = /* glsl */ `
  precision highp float;

  varying float vLife;
  varying vec3 vColor;

  void main() {
    if (vLife <= 0.01) discard;
    vec2 uv = gl_PointCoord - vec2(0.5);
    float r = length(uv);
    if (r > 0.5) discard;

    float core = exp(-r * r * 28.0);
    float halo = exp(-r * r * 7.0) * 0.5;
    vec3 col = mix(vColor, vec3(1.0, 0.94, 0.72), core * 0.55);
    gl_FragColor = vec4(col * 1.4, (core + halo) * vLife * 0.85);
  }
`;

/**
 * Luminous stardust ribbon trails that flow off your hands (or desktop cursor) as you move.
 */
export class HandTrails {
  public readonly group = new THREE.Group();

  private readonly maxParticles = 240;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly lives: Float32Array;
  private readonly sizes: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: THREE.BufferGeometry;

  private cursor = 0;
  private readonly prevLeft = new THREE.Vector3();
  private readonly prevRight = new THREE.Vector3();
  private hasPrevLeft = false;
  private hasPrevRight = false;

  private readonly palette = [
    new THREE.Color(0x5eead4),
    new THREE.Color(0x38bdf8),
    new THREE.Color(0xa78bfa),
    new THREE.Color(0xfbbf24),
  ];

  constructor() {
    this.positions = new Float32Array(this.maxParticles * 3);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.lives = new Float32Array(this.maxParticles);
    this.sizes = new Float32Array(this.maxParticles);
    this.colors = new Float32Array(this.maxParticles * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(this.geometry, mat);
    points.frustumCulled = false;
    this.group.add(points);
  }

  private emit(pos: THREE.Vector3, velX: number, velY: number, velZ: number, colorIdx: number): void {
    const i = this.cursor;
    const i3 = i * 3;
    this.cursor = (this.cursor + 1) % this.maxParticles;

    this.positions[i3] = pos.x + (Math.random() - 0.5) * 0.025;
    this.positions[i3 + 1] = pos.y + (Math.random() - 0.5) * 0.025;
    this.positions[i3 + 2] = pos.z + (Math.random() - 0.5) * 0.025;

    this.velocities[i3] = velX * 0.15 + (Math.random() - 0.5) * 0.08;
    this.velocities[i3 + 1] = velY * 0.15 + 0.05 + Math.random() * 0.06;
    this.velocities[i3 + 2] = velZ * 0.15 + (Math.random() - 0.5) * 0.08;

    this.lives[i] = 1.0;
    this.sizes[i] = 0.08 + Math.random() * 0.11;

    const c = this.palette[colorIdx % this.palette.length];
    this.colors[i3] = c.r;
    this.colors[i3 + 1] = c.g;
    this.colors[i3 + 2] = c.b;
  }

  public update(
    dt: number,
    elapsed: number,
    handLeft: THREE.Vector3 | null,
    handRight: THREE.Vector3 | null
  ): void {
    const clampedDt = Math.min(dt, 0.05);

    if (handLeft) {
      if (this.hasPrevLeft) {
        const dist = handLeft.distanceTo(this.prevLeft);
        if (dist > 0.008) {
          const vx = (handLeft.x - this.prevLeft.x) / Math.max(clampedDt, 0.01);
          const vy = (handLeft.y - this.prevLeft.y) / Math.max(clampedDt, 0.01);
          const vz = (handLeft.z - this.prevLeft.z) / Math.max(clampedDt, 0.01);
          this.emit(handLeft, vx, vy, vz, Math.floor(elapsed * 2));
        }
      }
      this.prevLeft.copy(handLeft);
      this.hasPrevLeft = true;
    } else {
      this.hasPrevLeft = false;
    }

    if (handRight) {
      if (this.hasPrevRight) {
        const dist = handRight.distanceTo(this.prevRight);
        if (dist > 0.008) {
          const vx = (handRight.x - this.prevRight.x) / Math.max(clampedDt, 0.01);
          const vy = (handRight.y - this.prevRight.y) / Math.max(clampedDt, 0.01);
          const vz = (handRight.z - this.prevRight.z) / Math.max(clampedDt, 0.01);
          this.emit(handRight, vx, vy, vz, Math.floor(elapsed * 2) + 1);
        }
      }
      this.prevRight.copy(handRight);
      this.hasPrevRight = true;
    } else {
      this.hasPrevRight = false;
    }

    for (let i = 0; i < this.maxParticles; i++) {
      if (this.lives[i] <= 0) continue;
      const i3 = i * 3;
      this.positions[i3] += this.velocities[i3] * clampedDt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * clampedDt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * clampedDt;

      this.velocities[i3] *= 0.94;
      this.velocities[i3 + 1] *= 0.94;
      this.velocities[i3 + 2] *= 0.94;

      this.lives[i] = Math.max(0, this.lives[i] - clampedDt * 1.15);
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }
}
