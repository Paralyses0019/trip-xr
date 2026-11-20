import * as THREE from 'three';

/**
 * Epilogue — DE LANDING
 * After the cosmic cathedral dissolves back into your real room (Passthrough),
 * one single softly glowing bioluminescent blossom remains on the floor in front of you.
 */
export class EpilogueBlossom {
  public readonly group = new THREE.Group();
  private readonly petals: THREE.Mesh[] = [];
  private readonly core: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly petalMat: THREE.MeshStandardMaterial;
  private readonly haloMat: THREE.MeshBasicMaterial;

  constructor() {
    this.group.visible = false;
    this.group.position.set(0, 0, -0.78);

    // Slender glowing stem
    const stemGeo = new THREE.CylinderGeometry(0.005, 0.009, 0.24, 10);
    stemGeo.translate(0, 0.12, 0);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      emissive: 0x2dd4bf,
      emissiveIntensity: 0.7,
      roughness: 0.4,
    });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    this.group.add(stem);

    // Layered luminous petals
    const petalGeo = new THREE.SphereGeometry(0.036, 12, 10);
    petalGeo.scale(0.55, 1.45, 0.22);
    petalGeo.translate(0, 0.045, 0);

    this.petalMat = new THREE.MeshStandardMaterial({
      color: 0x5eead4,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });

    const flowerHead = new THREE.Group();
    flowerHead.position.y = 0.24;

    const petalCount = 7;
    for (let i = 0; i < petalCount; i++) {
      const a = (i / petalCount) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, this.petalMat);
      petal.rotation.y = a;
      petal.rotation.x = 0.78;
      flowerHead.add(petal);
      this.petals.push(petal);
    }

    // Warm golden stamen core
    const coreGeo = new THREE.SphereGeometry(0.018, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.core.position.y = 0.015;
    flowerHead.add(this.core);

    // Soft additive aura around the blossom
    const haloGeo = new THREE.SphereGeometry(0.095, 16, 16);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Mesh(haloGeo, this.haloMat);
    flowerHead.add(this.halo);

    this.group.add(flowerHead);
  }

  public update(elapsed: number, weight: number): void {
    this.group.visible = weight > 0.01;
    if (!this.group.visible) return;

    const s = 0.001 + weight * (0.95 + Math.sin(elapsed * 1.6) * 0.05);
    this.group.scale.setScalar(s);
    this.group.rotation.y = elapsed * 0.22;

    this.petals.forEach((p, i) => {
      p.rotation.x = 0.68 + Math.sin(elapsed * 1.4 + i * 0.6) * 0.09;
    });

    this.halo.scale.setScalar(1.0 + Math.sin(elapsed * 2.2) * 0.12);
    this.haloMat.opacity = 0.2 * weight;
  }
}
