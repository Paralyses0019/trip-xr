import * as THREE from 'three';

export interface HandTrackerState {
  active: boolean;
  position: THREE.Vector3;
  pinching: boolean;
  speed: number;
}

const KEY_JOINTS = [
  'wrist',
  'thumb-tip',
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
  'middle-finger-metacarpal',
] as const;

/**
 * Tracks both WebXR Hands (with controller fallback) and renders subtle,
 * ethereal glowing stardust orbs at your fingertips & palms so your hands
 * feel alive in Mixed Reality without obscuring your real hands.
 */
export class HandVisuals {
  public readonly group = new THREE.Group();

  public readonly left: HandTrackerState = {
    active: false,
    position: new THREE.Vector3(0, -10, 0),
    pinching: false,
    speed: 0,
  };

  public readonly right: HandTrackerState = {
    active: false,
    position: new THREE.Vector3(0, -10, 0),
    pinching: false,
    speed: 0,
  };

  private readonly prevLeft = new THREE.Vector3();
  private readonly prevRight = new THREE.Vector3();
  private readonly tempThumb = new THREE.Vector3();
  private readonly tempIndex = new THREE.Vector3();
  private readonly tempPalm = new THREE.Vector3();

  private readonly leftOrbs: THREE.Mesh[] = [];
  private readonly rightOrbs: THREE.Mesh[] = [];
  private readonly orbMat: THREE.MeshBasicMaterial;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const orbGeo = new THREE.SphereGeometry(0.009, 10, 10);
    this.orbMat = new THREE.MeshBasicMaterial({
      color: 0x6ee7dc,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < KEY_JOINTS.length; i++) {
      const mL = new THREE.Mesh(orbGeo, this.orbMat);
      mL.visible = false;
      this.group.add(mL);
      this.leftOrbs.push(mL);

      const mR = new THREE.Mesh(orbGeo, this.orbMat);
      mR.visible = false;
      this.group.add(mR);
      this.rightOrbs.push(mR);
    }
  }

  public updateXR(frame: XRFrame, refSpace: XRReferenceSpace, dt: number): void {
    const session = this.renderer.xr.getSession();
    if (!session) return;

    this.left.active = false;
    this.left.pinching = false;
    this.right.active = false;
    this.right.pinching = false;
    this.leftOrbs.forEach((m) => (m.visible = false));
    this.rightOrbs.forEach((m) => (m.visible = false));

    const clampedDt = Math.max(dt, 0.008);

    for (const source of session.inputSources) {
      const isLeft = source.handedness === 'left';
      const isRight = source.handedness === 'right';
      if (!isLeft && !isRight) continue;

      const state = isLeft ? this.left : this.right;
      const prev = isLeft ? this.prevLeft : this.prevRight;
      const orbs = isLeft ? this.leftOrbs : this.rightOrbs;

      // 1. Hand Tracking path (Quest 3 native)
      if (source.hand && frame.getJointPose) {
        let hasPalm = false;
        let hasThumb = false;
        let hasIndex = false;

        KEY_JOINTS.forEach((jointName, idx) => {
          const joint = source.hand?.get(jointName as XRHandJoint);
          if (!joint) return;
          const pose = frame.getJointPose?.(joint, refSpace);
          if (!pose) return;

          const p = pose.transform.position;
          const orb = orbs[idx];
          orb.position.set(p.x, p.y, p.z);
          orb.visible = true;

          if (jointName === 'middle-finger-metacarpal') {
            this.tempPalm.set(p.x, p.y, p.z);
            hasPalm = true;
          } else if (jointName === 'thumb-tip') {
            this.tempThumb.set(p.x, p.y, p.z);
            hasThumb = true;
          } else if (jointName === 'index-finger-tip') {
            this.tempIndex.set(p.x, p.y, p.z);
            hasIndex = true;
          }
        });

        if (hasThumb && hasIndex) {
          const pinchDist = this.tempThumb.distanceTo(this.tempIndex);
          state.pinching = pinchDist < 0.045;
          // Use midpoint between thumb and index if pinching, else palm
          if (state.pinching) {
            state.position.copy(this.tempThumb).add(this.tempIndex).multiplyScalar(0.5);
          } else if (hasPalm) {
            state.position.copy(this.tempPalm);
          } else {
            state.position.copy(this.tempIndex);
          }
          state.active = true;
        } else if (hasPalm) {
          state.position.copy(this.tempPalm);
          state.active = true;
        }
      } else if (source.gripSpace) {
        // 2. Controller fallback
        const pose = frame.getPose(source.gripSpace, refSpace);
        if (pose) {
          const p = pose.transform.position;
          state.position.set(p.x, p.y, p.z);
          state.active = true;

          // Trigger or squeeze button acts as pinch/grab
          const gp = source.gamepad;
          if (gp && gp.buttons.length > 0) {
            state.pinching = gp.buttons[0].pressed || (gp.buttons[1]?.pressed ?? false);
          }

          orbs[0].position.copy(state.position);
          orbs[0].visible = true;
        }
      }

      if (state.active) {
        state.speed = state.position.distanceTo(prev) / clampedDt;
        prev.copy(state.position);
      } else {
        state.speed = 0;
      }
    }
  }
}
