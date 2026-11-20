import * as THREE from 'three';
import { AudioEngine } from './audio/AudioEngine';
import { ElixirBottle } from './scene/ElixirBottle';
import { SporeField } from './scene/SporeField';
import { HandVisuals, HandTrackerState } from './xr/HandVisuals';
import { RoomMeshManager } from './xr/RoomMeshManager';

type ExperiencePhase = 'idle' | 'prologue' | 'drinking' | 'chapter1';

const overlayEl = document.getElementById('overlay') as HTMLDivElement;
const btnXr = document.getElementById('btn-xr') as HTMLButtonElement;
const btnDesktop = document.getElementById('btn-desktop') as HTMLButtonElement;
const statusLine = document.getElementById('status-line') as HTMLParagraphElement;
const hudEl = document.getElementById('hud') as HTMLDivElement;
const hudPhase = document.getElementById('hud-phase') as HTMLDivElement;
const hudTip = document.getElementById('hud-tip') as HTMLDivElement;
const hudDebug = document.getElementById('hud-debug') as HTMLDivElement;

// --- Renderer & Scene ---
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 40);
camera.position.set(0, 1.48, 0);

// Subtle lighting for glass bottle & sprouting flora
const hemiLight = new THREE.HemisphereLight(0x9be7ff, 0x1a1033, 1.1);
scene.add(hemiLight);

const bottleLight = new THREE.PointLight(0x5eead4, 1.2, 3.0);
scene.add(bottleLight);

// --- Core Modules ---
const audio = new AudioEngine();
const roomManager = new RoomMeshManager();
const bottle = new ElixirBottle();
const sporeField = new SporeField();
const handVisuals = new HandVisuals(renderer);

scene.add(roomManager.group);
scene.add(bottle.group);
scene.add(sporeField.group);
scene.add(handVisuals.group);

// --- State ---
let phase: ExperiencePhase = 'idle';
let isDesktopMode = false;
let tripProgress = 0; // 0..1 for Chapter 1 overgrowth
let grabbedBy: 'left' | 'right' | null = null;
let lastDrinkSoundTime = 0;
let bottlePlacedForXR = false;

// Desktop preview interaction helpers
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const desktopHandPos = new THREE.Vector3(0, -10, 0);
let desktopHandActive = false;
let isDragging = false;
let dragMoved = false;
let prevPointerX = 0;
let prevPointerY = 0;
let yaw = 0;
let pitch = -0.08;

const camWorldPos = new THREE.Vector3();
const clock = new THREE.Clock();

// --- WebXR Capability Check ---
let xrMode: 'immersive-ar' | 'immersive-vr' | null = null;

async function checkWebXR(): Promise<void> {
  if (!('xr' in navigator) || !navigator.xr) {
    btnXr.textContent = 'WebXR niet beschikbaar op dit apparaat';
    btnXr.disabled = true;
    statusLine.textContent = 'Open deze pagina in de Meta Quest 3 Browser, of start Desktop Preview.';
    return;
  }

  try {
    const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
    if (arSupported) {
      xrMode = 'immersive-ar';
      btnXr.textContent = 'Enter Mixed Reality (Quest 3)';
      btnXr.disabled = false;
      statusLine.textContent = 'Mixed Reality + Passthrough klaar voor Quest 3.';
      return;
    }

    const vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
    if (vrSupported) {
      xrMode = 'immersive-vr';
      btnXr.textContent = 'Enter VR Experience';
      btnXr.disabled = false;
      statusLine.textContent = 'VR-modus ondersteund.';
      return;
    }

    btnXr.textContent = 'Geen XR-headset gedetecteerd';
    btnXr.disabled = true;
    statusLine.textContent = 'Gebruik Desktop Preview om te testen, of open op Quest 3.';
  } catch (err) {
    btnXr.textContent = 'WebXR niet beschikbaar';
    btnXr.disabled = true;
    statusLine.textContent = `WebXR check melding: ${String(err)}`;
  }
}

void checkWebXR();

// --- Start Mixed Reality (Quest 3) ---
btnXr.addEventListener('click', async () => {
  if (!xrMode || !navigator.xr) return;

  audio.init();
  statusLine.textContent = 'XR-sessie starten…';

  try {
    const session = await navigator.xr.requestSession(xrMode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'mesh-detection', 'plane-detection', 'bounded-floor'],
    });

    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    renderer.setClearColor(0x000000, xrMode === 'immersive-ar' ? 0 : 1);

    isDesktopMode = false;
    bottlePlacedForXR = false;
    phase = 'prologue';
    tripProgress = 0;
    roomManager.onXRSessionStart();

    overlayEl.classList.add('hidden');
    hudEl.classList.add('hidden');

    session.addEventListener('end', () => {
      phase = 'idle';
      overlayEl.classList.remove('hidden');
      statusLine.textContent = 'XR-sessie beëindigd. Klaar om opnieuw te starten.';
    });
  } catch (err) {
    statusLine.textContent = `Kon XR niet starten: ${String(err)}`;
  }
});

// --- Start Desktop Preview ---
btnDesktop.addEventListener('click', () => {
  audio.init();
  isDesktopMode = true;
  phase = 'prologue';
  tripProgress = 0;

  renderer.setClearColor(0x05070d, 1);
  roomManager.setDesktopMode(true);
  bottle.restPosition.set(0, 1.24, -0.78);
  bottle.group.position.copy(bottle.restPosition);

  overlayEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  updateHud();
});

function updateHud(): void {
  if (phase === 'prologue') {
    hudPhase.textContent = 'PROLOOG · DE KAMER';
    hudTip.textContent = 'Klik op het DRINK ME flesje om te beginnen · Sleep om rond te kijken';
  } else if (phase === 'drinking') {
    hudPhase.textContent = 'PROLOOG · DRINKING…';
    hudTip.textContent = 'De vloeistof werkt in…';
  } else if (phase === 'chapter1') {
    hudPhase.textContent = 'HOOFDSTUK 1 · OVERGROEI';
    hudTip.textContent = 'Beweeg je muis (of handen op Quest) door de sporen & over de muren';
  }
}

function triggerTripStart(origin: THREE.Vector3): void {
  if (phase === 'chapter1') return;
  phase = 'chapter1';
  bottle.isDrunk = true;
  bottle.isGrabbed = false;
  grabbedBy = null;

  roomManager.uniforms.uOrigin.value.copy(origin);
  audio.playTripStart();
  updateHud();
}

// --- Desktop Pointer & Camera Controls ---
window.addEventListener('pointerdown', (e) => {
  if (!isDesktopMode || phase === 'idle') return;
  isDragging = true;
  dragMoved = false;
  prevPointerX = e.clientX;
  prevPointerY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  if (!isDesktopMode || phase === 'idle') return;

  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (isDragging) {
    const dx = e.clientX - prevPointerX;
    const dy = e.clientY - prevPointerY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    yaw -= dx * 0.0045;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.0045, -1.25, 1.25);
    prevPointerX = e.clientX;
    prevPointerY = e.clientY;
  }

  // Project cursor ~1.1m into the scene as a virtual "hand" to stir spores & touch walls
  raycaster.setFromCamera(pointerNDC, camera);
  raycaster.ray.at(1.15, desktopHandPos);
  desktopHandActive = true;
});

window.addEventListener('pointerup', (e) => {
  if (!isDesktopMode || phase === 'idle') return;
  const wasClick = !dragMoved;
  isDragging = false;

  if (wasClick && phase === 'prologue') {
    pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(bottle.hitMesh, false);
    if (hits.length > 0) {
      phase = 'drinking';
      updateHud();
    }
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- XR Hand Grab & Drink Logic ---
function updateXRInteraction(dt: number, elapsed: number): void {
  if (phase !== 'prologue' && phase !== 'drinking') return;

  camera.getWorldPosition(camWorldPos);

  const checkGrab = (hand: HandTrackerState, side: 'left' | 'right') => {
    if (!hand.active) {
      if (grabbedBy === side) {
        grabbedBy = null;
        bottle.isGrabbed = false;
      }
      return;
    }

    const distToBottle = hand.position.distanceTo(bottle.group.position);

    // Grab if pinching near bottle OR gently cradling bottle with open palm
    if (!grabbedBy && ((hand.pinching && distToBottle < 0.16) || distToBottle < 0.095)) {
      grabbedBy = side;
      bottle.isGrabbed = true;
    }

    // Release if hand moves far or stops pinching when away from mouth
    if (grabbedBy === side) {
      if (!hand.pinching && distToBottle > 0.18) {
        grabbedBy = null;
        bottle.isGrabbed = false;
      }
    }
  };

  checkGrab(handVisuals.left, 'left');
  checkGrab(handVisuals.right, 'right');

  if (grabbedBy) {
    const activeHand = grabbedBy === 'left' ? handVisuals.left : handVisuals.right;
    bottle.group.position.lerp(activeHand.position, Math.min(1, dt * 16));

    // Check distance to mouth/head (slightly below eyes)
    const mouthPos = camWorldPos.clone();
    mouthPos.y -= 0.08;
    const distToMouth = bottle.group.position.distanceTo(mouthPos);

    if (distToMouth < 0.32) {
      phase = 'drinking';
      bottle.group.rotation.x = THREE.MathUtils.lerp(bottle.group.rotation.x, 0.95, Math.min(1, dt * 6));
      bottle.fillLevel = Math.max(0, bottle.fillLevel - dt * 0.85);

      if (elapsed - lastDrinkSoundTime > 0.2) {
        audio.playDrinkTick();
        lastDrinkSoundTime = elapsed;
      }

      if (bottle.fillLevel <= 0.01) {
        triggerTripStart(camWorldPos);
      }
    } else {
      bottle.group.rotation.x = THREE.MathUtils.lerp(bottle.group.rotation.x, 0, Math.min(1, dt * 6));
    }
  }
}

// --- Main Render Loop ---
renderer.setAnimationLoop((_time: number, frame?: XRFrame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  const xrSession = renderer.xr.getSession();
  const refSpace = renderer.xr.getReferenceSpace();

  // 1. Update XR room meshes & hands
  if (xrSession && frame && refSpace) {
    if (!bottlePlacedForXR) {
      bottle.placeInFrontOf(camera);
      bottlePlacedForXR = true;
    }

    roomManager.updateXR(frame, refSpace);
    handVisuals.updateXR(frame, refSpace, dt);
    updateXRInteraction(dt, elapsed);
  } else if (isDesktopMode) {
    // Desktop camera look
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    // Desktop automatic drinking animation after clicking bottle
    if (phase === 'drinking') {
      const targetPos = new THREE.Vector3(0, 1.38, -0.32);
      bottle.group.position.lerp(targetPos, Math.min(1, dt * 4));
      bottle.group.rotation.x = THREE.MathUtils.lerp(bottle.group.rotation.x, 0.95, Math.min(1, dt * 4));
      bottle.fillLevel = Math.max(0, bottle.fillLevel - dt * 0.75);

      if (elapsed - lastDrinkSoundTime > 0.2) {
        audio.playDrinkTick();
        lastDrinkSoundTime = elapsed;
      }

      if (bottle.fillLevel <= 0.01) {
        triggerTripStart(camera.position);
      }
    }
  }

  // 2. Advance Chapter 1 overgrowth smoothly
  if (phase === 'chapter1') {
    tripProgress = Math.min(1.0, tripProgress + dt * 0.075);
    audio.setTripIntensity(tripProgress);
  }

  // 3. Feed hand positions into Room Shader & Spore Field
  let activeLeft: THREE.Vector3 | null = null;
  let activeRight: THREE.Vector3 | null = null;

  if (xrSession) {
    if (handVisuals.left.active) activeLeft = handVisuals.left.position;
    if (handVisuals.right.active) activeRight = handVisuals.right.position;
  } else if (isDesktopMode && desktopHandActive) {
    activeRight = desktopHandPos;
  }

  roomManager.uniforms.uTime.value = elapsed;
  roomManager.uniforms.uProgress.value = tripProgress;

  if (activeLeft) {
    roomManager.uniforms.uHandLeft.value.copy(activeLeft);
    roomManager.uniforms.uHandLeftActive.value = 1.0;
  } else {
    roomManager.uniforms.uHandLeftActive.value = 0.0;
  }

  if (activeRight) {
    roomManager.uniforms.uHandRight.value.copy(activeRight);
    roomManager.uniforms.uHandRightActive.value = 1.0;
  } else {
    roomManager.uniforms.uHandRightActive.value = 0.0;
  }

  // 4. Update bottle, light & hand-reactive spores
  bottle.update(elapsed, dt, camera);
  bottleLight.position.copy(bottle.group.position);
  bottleLight.intensity = bottle.isDrunk ? 0.2 + tripProgress * 1.4 : 1.15;

  const stirEnergy = sporeField.update(elapsed, dt, tripProgress, activeLeft, activeRight);
  if (stirEnergy > 0.12) {
    audio.playSporeChime(stirEnergy);
  }

  if (isDesktopMode) {
    hudDebug.textContent = `overgrowth: ${Math.round(tripProgress * 100)}%`;
  }

  renderer.render(scene, camera);
});
