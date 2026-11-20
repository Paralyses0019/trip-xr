import * as THREE from 'three';
import { createRoomOvergrowthMaterial, RoomOvergrowthUniforms } from '../shaders/roomOvergrowthShader';

// Minimal TypeScript declarations for WebXR Mesh & Plane Detection (Quest 3 Browser)
interface XRMeshLike {
  meshSpace: XRSpace;
  vertices: Float32Array;
  indices: Uint32Array;
  lastChangedTime: number;
  semanticLabel?: string;
}

interface XRPlaneLike {
  planeSpace: XRSpace;
  polygon: DOMPointReadOnly[];
  lastChangedTime: number;
  orientation?: 'horizontal' | 'vertical';
  semanticLabel?: string;
}

interface XRFrameWithScene {
  detectedMeshes?: Set<XRMeshLike>;
  detectedPlanes?: Set<XRPlaneLike>;
}

/**
 * Syncs Quest 3 real-world room meshes & planes into Three.js,
 * applying the bioluminescent overgrowth shader directly onto real walls, floor, ceiling & furniture.
 * Falls back cleanly to a virtual room shell on Desktop Preview or if no Quest room scan exists.
 */
export class RoomMeshManager {
  public readonly group = new THREE.Group();
  public readonly material: THREE.ShaderMaterial;
  public readonly uniforms: RoomOvergrowthUniforms;

  private readonly meshEntries = new Map<XRMeshLike, { mesh: THREE.Mesh; lastChanged: number }>();
  private readonly planeEntries = new Map<XRPlaneLike, { mesh: THREE.Mesh; lastChanged: number }>();
  private readonly fallbackRoom: THREE.Mesh;

  private isDesktopMode = false;
  private xrStartTime = 0;

  constructor() {
    const { material, uniforms } = createRoomOvergrowthMaterial();
    this.material = material;
    this.uniforms = uniforms;

    // Fallback room shell (4.6m x 2.8m x 4.6m, centered around user, floor at y=0)
    const boxGeo = new THREE.BoxGeometry(4.6, 2.8, 4.6, 1, 1, 1);
    boxGeo.translate(0, 1.4, 0);
    // Flip normals inward
    boxGeo.scale(-1, 1, 1);
    this.fallbackRoom = new THREE.Mesh(boxGeo, this.material);
    this.fallbackRoom.frustumCulled = false;
    this.fallbackRoom.visible = false;
    this.group.add(this.fallbackRoom);
  }

  public setDesktopMode(enabled: boolean): void {
    this.isDesktopMode = enabled;
    this.uniforms.uVirtualRoomMode.value = enabled ? 1.0 : 0.0;
    this.fallbackRoom.visible = enabled;
  }

  public onXRSessionStart(): void {
    this.isDesktopMode = false;
    this.xrStartTime = performance.now();
    this.uniforms.uVirtualRoomMode.value = 0.0;
    this.fallbackRoom.visible = false;
  }

  public get detectedMeshCount(): number {
    return this.meshEntries.size;
  }

  public get detectedPlaneCount(): number {
    return this.planeEntries.size;
  }

  public updateXR(frame: XRFrame, refSpace: XRReferenceSpace): void {
    const sceneFrame = frame as unknown as XRFrameWithScene;

    // 1. Prefer Quest 3 Room Meshes (full 3D walls, ceiling, floor, furniture)
    if (sceneFrame.detectedMeshes && sceneFrame.detectedMeshes.size > 0) {
      this.syncMeshes(sceneFrame.detectedMeshes, frame, refSpace);
      // Hide planes if full meshes are present to avoid double-rendering surfaces
      this.planeEntries.forEach(({ mesh }) => {
        mesh.visible = false;
      });
      this.fallbackRoom.visible = false;
      return;
    }

    // 2. Fallback to WebXR Plane Detection
    if (sceneFrame.detectedPlanes && sceneFrame.detectedPlanes.size > 0) {
      this.syncPlanes(sceneFrame.detectedPlanes, frame, refSpace);
      this.fallbackRoom.visible = false;
      return;
    }

    // 3. If user hasn't scanned their room on Quest after 2.5s, enable subtle surround fallback
    if (!this.isDesktopMode && performance.now() - this.xrStartTime > 2500) {
      this.fallbackRoom.visible = true;
    }
  }

  private syncMeshes(
    detectedMeshes: Set<XRMeshLike>,
    frame: XRFrame,
    refSpace: XRReferenceSpace
  ): void {
    // Remove stale meshes
    for (const [xrMesh, entry] of this.meshEntries.entries()) {
      if (!detectedMeshes.has(xrMesh)) {
        this.group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        this.meshEntries.delete(xrMesh);
      }
    }

    for (const xrMesh of detectedMeshes) {
      let entry = this.meshEntries.get(xrMesh);
      if (!entry) {
        const geometry = this.buildMeshGeometry(xrMesh);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        entry = { mesh, lastChanged: xrMesh.lastChangedTime };
        this.meshEntries.set(xrMesh, entry);
      } else if (entry.lastChanged < xrMesh.lastChangedTime) {
        entry.mesh.geometry.dispose();
        entry.mesh.geometry = this.buildMeshGeometry(xrMesh);
        entry.lastChanged = xrMesh.lastChangedTime;
      }

      const pose = frame.getPose(xrMesh.meshSpace, refSpace);
      if (pose) {
        entry.mesh.visible = true;
        entry.mesh.matrix.fromArray(pose.transform.matrix);
        entry.mesh.matrixWorldNeedsUpdate = true;
      } else {
        entry.mesh.visible = false;
      }
    }
  }

  private buildMeshGeometry(xrMesh: XRMeshLike): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(xrMesh.vertices), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(xrMesh.indices), 1));
    geometry.computeVertexNormals();
    return geometry;
  }

  private syncPlanes(
    detectedPlanes: Set<XRPlaneLike>,
    frame: XRFrame,
    refSpace: XRReferenceSpace
  ): void {
    for (const [xrPlane, entry] of this.planeEntries.entries()) {
      if (!detectedPlanes.has(xrPlane)) {
        this.group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        this.planeEntries.delete(xrPlane);
      }
    }

    for (const xrPlane of detectedPlanes) {
      let entry = this.planeEntries.get(xrPlane);
      if (!entry) {
        const geometry = this.buildPlaneGeometry(xrPlane);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        entry = { mesh, lastChanged: xrPlane.lastChangedTime };
        this.planeEntries.set(xrPlane, entry);
      } else if (entry.lastChanged < xrPlane.lastChangedTime) {
        entry.mesh.geometry.dispose();
        entry.mesh.geometry = this.buildPlaneGeometry(xrPlane);
        entry.lastChanged = xrPlane.lastChangedTime;
      }

      const pose = frame.getPose(xrPlane.planeSpace, refSpace);
      if (pose) {
        entry.mesh.visible = true;
        entry.mesh.matrix.fromArray(pose.transform.matrix);
        entry.mesh.matrixWorldNeedsUpdate = true;
      } else {
        entry.mesh.visible = false;
      }
    }
  }

  private buildPlaneGeometry(xrPlane: XRPlaneLike): THREE.BufferGeometry {
    const polygon = xrPlane.polygon;
    if (polygon.length < 3) {
      return new THREE.BufferGeometry();
    }

    // WebXR plane polygon vertices lie in the XZ plane of planeSpace
    const positions: number[] = [];
    const indices: number[] = [];
    for (const pt of polygon) {
      positions.push(pt.x, pt.y, pt.z);
    }
    for (let i = 1; i < polygon.length - 1; i++) {
      indices.push(0, i, i + 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}
