import * as THREE from 'three';
import { AudioEngine } from './audio/AudioEngine';
import { CosmicCathedral } from './scene/CosmicCathedral';
import { ElixirBottle } from './scene/ElixirBottle';
import { EpilogueBlossom } from './scene/EpilogueBlossom';
import { GeometricLabyrinth } from './scene/GeometricLabyrinth';
import { SporeField } from './scene/SporeField';
import { HandTrackerState, HandVisuals } from './xr/HandVisuals';
import { RoomMeshManager } from './xr/RoomMeshManager';

type ExperiencePhase = 'idle' | 'prologue' | 'drinking' | 'chapter1' | 'chapter2' | 'chapter3' | 'epilogue';

// Timeline boundaries in seconds after drinking the elixir (~2.5 min full experience)
const T_CH1_END = 36;
const T_CH2_END = 82;
const T_CH3_END = 136;

const overlayEl = document.getElementById('overlay') as HTMLDivElement;
const btnXr = document.getElementById('btn-xr') as HTMLButtonElement;
const btnDesktop = document.getElementById('btn-desktop') as HTMLButtonElement;
const statusLine = document.getElementById('status-line') as HTMLParagraphElement;
const hudEl = document.getElementById('hud') as HTMLDivElement;
const hudPhase = document.getElementById('hud-phase') as HTMLDivElement;
const hudTip = document.getElementById('hud-tip') as HTMLDivElement;
const hudDebug = document.getElementById('hud-debug') as HTMLDivElement;
const chapterBar = document.getElementById('chapter-bar') as HTMLDivElement;
const chapterButtons = Array.from(chapterBar.querySelectorAll<HTMLButtonElement>('button[data-jump]'));

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
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0, 1.48, 0);

// Lighting for glass bottle, flora & geometric rings
const hemiLight = new THREE.HemisphereLight(0x9be7ff, 0x1a1033, 1.15);
scene.add(hemiLight);

const bottleLight = new THREE.PointLight(0x5eead4, 1.2, 4.0);
scene.add(bottleLight);

// --- Core Modules ---
const audio = new AudioEngine();
const roomManager = new RoomMeshManager();
const bottle = new ElixirBottle();
const sporeField = new SporeField();
const labyrinth = new GeometricLabyrinth();
const cathedral = new CosmicCathedral();
const blossom = new EpilogueBlossom();
const handVisuals = new HandVisuals(renderer);

scene.add(roomManager.group);
scene.add(bottle.group);
scene.add(sporeField.group);
scene.add(labyrinth.group);
scene.add(cathedral.group);
scene.add(blossom.group);
scene.add(handVisuals.group);

// --- State ---
let phase: ExperiencePhase = 'idle';
let isDesktopMode = false;
let tripTime = 0; // seconds since elixir was drunk
let grabbedBy: 'left' | 'right' | null = null;
let lastDrinkSoundTime = 0;
let bottlePlacedForXR = false;

// Desktop preview controls
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const desktopHandPos = new THREE.Vector3(0, -10, 0);
let desktopHandActive = false;
let isDragging = false;
let dragMoved = false;
let prevPointerX = 0;
let prevPointerY = 0;
let yaw = 0;
let pitch = -0.06;

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
    tripTime = 0;
    bottle.reset();
    roomManager.onXRSessionStart();

    overlayEl.classList.add('hidden');
    hudEl.classList.add('hidden');
    chapterBar.classList.add('hidden');

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
  tripTime = 0;

  renderer.setClearColor(0x05070d, 1);
  roomManager.setDesktopMode(true);
  bottle.restPosition.set(0, 1.24, -0.78);
  bottle.reset();

  overlayEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  chapterBar.classList.remove('hidden');
  updateHud();
});

function updateHud(): void {
  const activeKey = phase === 'drinking' ? 'prologue' : phase;
  chapterButtons.forEach((b) => {
    b.classList.toggle('active', b.dataset.jump === activeKey);
  });

  if (phase === 'prologue') {
    hudPhase.textContent = '1 · PROLOOG — DE KAMER';
    hudTip.textContent = 'Klik op het DRINK ME flesje om te beginnen · Sleep om rond te kijken';
  } else if (phase === 'drinking') {
    hudPhase.textContent = '1 · PROLOOG — DRINKING…';
    hudTip.textContent = 'De vloeistof werkt in…';
  } else if (phase === 'chapter1') {
    hudPhase.textContent = '2 · HOOFDSTUK 1 — OVERGROEI';
    hudTip.textContent = 'Beweeg je muis / handen door de sporen en over de muren';
  } else if (phase === 'chapter2') {
    hudPhase.textContent = '3 · HOOFDSTUK 2 — DE BREUK (ESCHER)';
    hudTip.textContent = 'Dirigeer de architectuur door je muis / handen te bewegen';
  } else if (phase === 'chapter3') {
    hudPhase.textContent = '4 · HOOFDSTUK 3 — DE KATHEDRAAL (KOSMOS)';
    hudTip.textContent = 'Klik of druk Spatie (Quest: handen samen → open) voor een kosmische schokgolf';
  } else if (phase === 'epilogue') {
    hudPhase.textContent = '5 · EPILOOG — DE LANDING';
    hudTip.textContent = 'Terug in je echte kamer — één lichtgevende herinnering blijft achter';
  }
}

function triggerTripStart(origin: THREE.Vector3): void {
  if (phase !== 'prologue' && phase !== 'drinking') return;
  phase = 'chapter1';
  tripTime = 0;
  bottle.isDrunk = true;
  bottle.isGrabbed = false;
  grabbedBy = null;

  roomManager.uniforms.uOrigin.value.copy(origin);
  audio.playTripStart();
  updateHud();
}

function jumpToChapter(target: string): void {
  if (!isDesktopMode) return;
  audio.init();
  roomManager.uniforms.uOrigin.value.copy(camera.position);

  if (target === 'prologue') {
    phase = 'prologue';
    tripTime = 0;
    bottle.reset();
    audio.setChapterMood(0, 0, 0, 0);
  } else if (target === 'chapter1') {
    phase = 'chapter1';
    tripTime = 1.0;
    bottle.isDrunk = true;
    bottle.group.visible = false;
    audio.playTripStart();
  } else if (target === 'chapter2') {
    phase = 'chapter2';
    tripTime = T_CH1_END + 6.5;
    bottle.isDrunk = true;
    bottle.group.visible = false;
  } else if (target === 'chapter3') {
    phase = 'chapter3';
    tripTime = T_CH2_END + 6.5;
    bottle.isDrunk = true;
    bottle.group.visible = false;
  } else if (target === 'epilogue') {
    phase = 'epilogue';
    tripTime = T_CH3_END + 7.5;
    bottle.isDrunk = true;
    bottle.group.visible = false;
  }
  updateHud();
}

chapterButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const target = btn.dataset.jump;
    if (target) jumpToChapter(target);
  });
});

// Keyboard shortcuts (1-5 to jump chapters, Space for shockwave in Chapter 3)
window.addEventListener('keydown', (e) => {
  if (!isDesktopMode || phase === 'idle') return;
  if (e.key === '1') jumpToChapter('prologue');
  else if (e.key === '2') jumpToChapter('chapter1');
  else if (e.key === '3') jumpToChapter('chapter2');
  else if (e.key === '4') jumpToChapter('chapter3');
  else if (e.key === '5') jumpToChapter('epilogue');
  else if (e.code === 'Space' && phase === 'chapter3') {
    e.preventDefault();
    cathedral.triggerShockwave();
    audio.playShockwaveBoom();
  }
});

// --- Desktop Pointer & Camera Controls ---
window.addEventListener('pointerdown', (e) => {
  if (!isDesktopMode || phase === 'idle') return;
  if ((e.target as HTMLElement).closest('#chapter-bar')) return;
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

  raycaster.setFromCamera(pointerNDC, camera);
  raycaster.ray.at(1.25, desktopHandPos);
  desktopHandActive = true;
});

window.addEventListener('pointerup', (e) => {
  if (!isDesktopMode || phase === 'idle') return;
  if ((e.target as HTMLElement).closest('#chapter-bar')) return;

  const wasClick = !dragMoved;
  isDragging = false;

  if (!wasClick) return;

  if (phase === 'prologue') {
    pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(bottle.hitMesh, false);
    if (hits.length > 0) {
      phase = 'drinking';
      updateHud();
    }
  } else if (phase === 'chapter3') {
    cathedral.triggerShockwave();
    audio.playShockwaveBoom();
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
    if (!grabbedBy && ((hand.pinching && distToBottle < 0.16) || distToBottle < 0.095)) {
      grabbedBy = side;
      bottle.isGrabbed = true;
    }

    if (grabbedBy === side && !hand.pinching && distToBottle > 0.18) {
      grabbedBy = null;
      bottle.isGrabbed = false;
    }
  };

  checkGrab(handVisuals.left, 'left');
  checkGrab(handVisuals.right, 'right');

  if (grabbedBy) {
    const activeHand = grabbedBy === 'left' ? handVisuals.left : handVisuals.right;
    bottle.group.position.lerp(activeHand.position, Math.min(1, dt * 16));

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

// --- Compute smooth chapter blend weights from tripTime ---
function computeChapterWeights(t: number) {
  // Chapter 1: Overgrowth ramps up 0..14s, stays full, fades out 32..40s
  const ch1Progress = THREE.MathUtils.clamp(t / 14.0, 0, 1);
  const ch1FadeOut = 1.0 - THREE.MathUtils.smoothstep(t, T_CH1_END - 4, T_CH1_END + 4);
  const ch1Weight = ch1Progress > 0 ? ch1FadeOut : 0;

  // Chapter 2: Escher Labyrinth fades in 33..41s, fades out 78..86s
  const ch2In = THREE.MathUtils.smoothstep(t, T_CH1_END - 3, T_CH1_END + 5);
  const ch2Out = 1.0 - THREE.MathUtils.smoothstep(t, T_CH2_END - 4, T_CH2_END + 4);
  const ch2Weight = ch2In * ch2Out;

  // Chapter 3: Cosmic Cathedral fades in 78..87s, fades out 130..140s
  const ch3In = THREE.MathUtils.smoothstep(t, T_CH2_END - 4, T_CH2_END + 5);
  const ch3Out = 1.0 - THREE.MathUtils.smoothstep(t, T_CH3_END - 6, T_CH3_END + 4);
  const ch3Weight = ch3In * ch3Out;

  // VR Void Dome stays solid across Chapter 2 & 3, then dissolves back to Passthrough in Epilogue
  const voidOpacity =
    THREE.MathUtils.smoothstep(t, T_CH1_END - 2, T_CH1_END + 6) *
    (1.0 - THREE.MathUtils.smoothstep(t, T_CH3_END - 4, T_CH3_END + 6));

  // Epilogue Blossom blooms softly as real room returns
  const epilogueWeight = THREE.MathUtils.smoothstep(t, T_CH3_END, T_CH3_END + 7);

  return { ch1Progress, ch1Weight, ch2Weight, ch3Weight, voidOpacity, epilogueWeight };
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
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

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

  // 2. Advance experience timeline once elixir is drunk
  const isTripping = phase === 'chapter1' || phase === 'chapter2' || phase === 'chapter3' || phase === 'epilogue';
  if (isTripping) {
    tripTime += dt;

    const nextPhase: ExperiencePhase =
      tripTime < T_CH1_END
        ? 'chapter1'
        : tripTime < T_CH2_END
          ? 'chapter2'
          : tripTime < T_CH3_END
            ? 'chapter3'
            : 'epilogue';

    if (nextPhase !== phase) {
      phase = nextPhase;
      updateHud();
    }
  }

  const weights = isTripping
    ? computeChapterWeights(tripTime)
    : { ch1Progress: 0, ch1Weight: 0, ch2Weight: 0, ch3Weight: 0, voidOpacity: 0, epilogueWeight: 0 };

  if (isTripping) {
    audio.setChapterMood(weights.ch1Weight, weights.ch2Weight, weights.ch3Weight, weights.epilogueWeight);
  }

  // 3. Active hand positions (XR or Desktop virtual pointer)
  let activeLeft: THREE.Vector3 | null = null;
  let activeRight: THREE.Vector3 | null = null;

  if (xrSession) {
    if (handVisuals.left.active) activeLeft = handVisuals.left.position;
    if (handVisuals.right.active) activeRight = handVisuals.right.position;
  } else if (isDesktopMode && desktopHandActive) {
    activeRight = desktopHandPos;
  }

  // 4. Update Room Overgrowth (Chapter 1)
  // Smoothly fade out the desktop virtual room shell as the VR void opens in Chapter 2 & 3
  const roomShellAlpha = 1.0 - weights.voidOpacity;
  if (isDesktopMode) {
    roomManager.group.visible = roomShellAlpha > 0.01;
  }
  roomManager.uniforms.uTime.value = elapsed;
  roomManager.uniforms.uProgress.value = weights.ch1Progress;
  roomManager.uniforms.uVisibility.value = weights.ch1Weight;
  roomManager.uniforms.uRoomShellAlpha.value = roomShellAlpha;

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

  // 5. Update Prologue Bottle & Chapter 1 Spores
  bottle.update(elapsed, dt, camera);
  bottleLight.position.copy(bottle.group.position);
  bottleLight.intensity = bottle.isDrunk ? 0.3 + weights.ch1Weight * 1.2 : 1.15;

  const stirEnergy = sporeField.update(elapsed, dt, weights.ch1Progress, weights.ch1Weight, activeLeft, activeRight);
  if (stirEnergy > 0.12) {
    audio.playSporeChime(stirEnergy);
  }

  // 6. Update Chapter 2 (Geometric Labyrinth) & Chapter 3 (Cosmic Cathedral) & Epilogue
  labyrinth.update(elapsed, dt, weights.ch2Weight, weights.voidOpacity, activeLeft, activeRight);

  const unleashedShockwave = cathedral.update(elapsed, dt, weights.ch3Weight, activeLeft, activeRight);
  if (unleashedShockwave) {
    audio.playShockwaveBoom();
  }

  blossom.update(elapsed, weights.epilogueWeight);

  if (isDesktopMode) {
    hudDebug.textContent = isTripping ? `timeline: ${tripTime.toFixed(1)}s` : 'wacht op elixir';
  }

  renderer.render(scene, camera);
});
