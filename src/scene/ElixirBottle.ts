import * as THREE from 'three';

const liquidVertexShader = /* glsl */ `
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vLocalPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const liquidFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uFill;

  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Liquid height spans local y in [-0.055, +0.045]
    float maxY = mix(-0.058, 0.046, uFill);
    float wave = sin(vLocalPos.x * 55.0 + uTime * 3.2) * 0.0025 + cos(vLocalPos.z * 55.0 - uTime * 2.6) * 0.0025;
    if (vLocalPos.y > maxY + wave) discard;

    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.2);
    float swirl = sin(vLocalPos.y * 42.0 - uTime * 2.4 + atan(vLocalPos.z, vLocalPos.x) * 3.0) * 0.5 + 0.5;

    vec3 deepTeal = vec3(0.05, 0.72, 0.78);
    vec3 violet = vec3(0.62, 0.28, 0.98);
    vec3 gold = vec3(1.0, 0.84, 0.45);

    vec3 col = mix(deepTeal, violet, swirl);
    col = mix(col, gold, fresnel * 0.75);

    // Bright surface meniscus glow
    float topGlow = smoothstep(maxY - 0.014, maxY + 0.002, vLocalPos.y);
    col += vec3(0.35, 1.0, 0.9) * topGlow * 0.65;

    gl_FragColor = vec4(col * 1.25, 0.92);
  }
`;

/**
 * The Alice-in-Wonderland "DRINK ME" elixir bottle.
 * Floats gently in front of the user; can be grabbed with Hand Tracking, Controllers, or clicked on Desktop.
 */
export class ElixirBottle {
  public readonly group = new THREE.Group();
  public readonly hitMesh: THREE.Mesh;

  private readonly liquidUniforms: {
    uTime: THREE.IUniform<number>;
    uFill: THREE.IUniform<number>;
  };
  private readonly glowHalo: THREE.Mesh;
  private readonly tagGroup: THREE.Group;

  public readonly restPosition = new THREE.Vector3(0, 1.18, -0.58);
  public isGrabbed = false;
  public fillLevel = 1.0;
  public isDrunk = false;
  private dissolveTimer = 0;

  constructor() {
    this.group.position.copy(this.restPosition);

    // 1. Outer glass flask profile (LatheGeometry, ~16cm tall)
    const glassPoints = [
      new THREE.Vector2(0.0, -0.06),
      new THREE.Vector2(0.036, -0.06),
      new THREE.Vector2(0.044, -0.045),
      new THREE.Vector2(0.045, 0.015),
      new THREE.Vector2(0.032, 0.045),
      new THREE.Vector2(0.016, 0.06),
      new THREE.Vector2(0.016, 0.092),
      new THREE.Vector2(0.022, 0.098),
      new THREE.Vector2(0.019, 0.104),
    ];
    const glassGeo = new THREE.LatheGeometry(glassPoints, 32);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8f8ff,
      roughness: 0.08,
      metalness: 0.05,
      transmission: 0.85,
      transparent: true,
      opacity: 0.42,
      ior: 1.45,
      thickness: 0.01,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      side: THREE.DoubleSide,
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.renderOrder = 3;
    this.group.add(glassMesh);

    // Invisible slightly larger collider for easy grabbing / clicking
    const hitGeo = new THREE.SphereGeometry(0.095, 12, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitMesh = new THREE.Mesh(hitGeo, hitMat);
    this.group.add(this.hitMesh);

    // 2. Swirling bioluminescent elixir inside
    const liquidPoints = [
      new THREE.Vector2(0.0, -0.056),
      new THREE.Vector2(0.033, -0.056),
      new THREE.Vector2(0.04, -0.042),
      new THREE.Vector2(0.041, 0.014),
      new THREE.Vector2(0.029, 0.042),
      new THREE.Vector2(0.013, 0.052),
      new THREE.Vector2(0.0, 0.052),
    ];
    const liquidGeo = new THREE.LatheGeometry(liquidPoints, 28);
    this.liquidUniforms = {
      uTime: { value: 0 },
      uFill: { value: 1.0 },
    };
    const liquidMat = new THREE.ShaderMaterial({
      uniforms: this.liquidUniforms,
      vertexShader: liquidVertexShader,
      fragmentShader: liquidFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
    liquidMesh.renderOrder = 2;
    this.group.add(liquidMesh);

    // 3. Cork stopper
    const corkGeo = new THREE.CylinderGeometry(0.014, 0.011, 0.028, 18);
    const corkMat = new THREE.MeshStandardMaterial({
      color: 0x9c6e44,
      roughness: 0.9,
      metalness: 0.0,
    });
    const cork = new THREE.Mesh(corkGeo, corkMat);
    cork.position.y = 0.106;
    this.group.add(cork);

    // 4. Soft radiant halo behind the flask
    const haloGeo = new THREE.SphereGeometry(0.09, 20, 20);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glowHalo = new THREE.Mesh(haloGeo, haloMat);
    this.group.add(this.glowHalo);

    // 5. Delicate "DRINK ME" floating tag
    this.tagGroup = this.createDrinkMeTag();
    this.tagGroup.position.set(0.058, 0.055, 0.01);
    this.group.add(this.tagGroup);
  }

  private createDrinkMeTag(): THREE.Group {
    const tagGroup = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Translucent dark-gold parchment card
      ctx.fillStyle = 'rgba(12, 18, 28, 0.86)';
      ctx.strokeStyle = 'rgba(110, 231, 220, 0.85)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.roundRect(14, 14, 484, 164, 24);
      ctx.fill();
      ctx.stroke();

      // Text
      ctx.fillStyle = '#e6fffb';
      ctx.font = '700 66px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DRINK ME', 256, 98);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const planeGeo = new THREE.PlaneGeometry(0.095, 0.036);
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const label = new THREE.Mesh(planeGeo, planeMat);
    tagGroup.add(label);

    return tagGroup;
  }

  /**
   * Place the bottle comfortably in front of the user's initial gaze
   */
  public placeInFrontOf(camera: THREE.Camera): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();

    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);

    this.restPosition.copy(camPos).addScaledVector(forward, 0.56);
    this.restPosition.y = Math.max(0.85, camPos.y - 0.28);
    this.group.position.copy(this.restPosition);
  }

  public update(elapsed: number, dt: number, camera: THREE.Camera): void {
    this.liquidUniforms.uTime.value = elapsed;
    this.liquidUniforms.uFill.value = Math.max(0, this.fillLevel);

    // Subtle breathing halo
    const haloScale = 1.0 + Math.sin(elapsed * 2.4) * 0.08;
    this.glowHalo.scale.setScalar(haloScale * Math.max(0.15, this.fillLevel));

    // Gently face the tag toward the viewer
    this.tagGroup.lookAt(camera.position);

    if (this.isDrunk) {
      this.dissolveTimer += dt;
      // Gently float upward and shrink away after being drunk
      this.group.position.y += dt * 0.14;
      this.group.rotation.y += dt * 1.4;
      const s = Math.max(0.001, 1.0 - this.dissolveTimer * 0.55);
      this.group.scale.setScalar(s);
      if (s <= 0.01) {
        this.group.visible = false;
      }
      return;
    }

    if (!this.isGrabbed) {
      // Gentle levitation back to restPosition
      const targetY = this.restPosition.y + Math.sin(elapsed * 1.8) * 0.025;
      this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, this.restPosition.x, Math.min(1, dt * 4));
      this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, targetY, Math.min(1, dt * 4));
      this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, this.restPosition.z, Math.min(1, dt * 4));

      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, Math.min(1, dt * 4));
      this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, Math.sin(elapsed * 1.1) * 0.06, Math.min(1, dt * 4));
      this.group.rotation.y += dt * 0.35;
    }
  }
}
