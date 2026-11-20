import * as THREE from 'three';

export interface RoomOvergrowthUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uProgress: THREE.IUniform<number>;
  uOrigin: THREE.IUniform<THREE.Vector3>;
  uHandLeft: THREE.IUniform<THREE.Vector3>;
  uHandRight: THREE.IUniform<THREE.Vector3>;
  uHandLeftActive: THREE.IUniform<number>;
  uHandRightActive: THREE.IUniform<number>;
  uVirtualRoomMode: THREE.IUniform<number>;
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform vec3 uOrigin;
  uniform vec3 uHandLeft;
  uniform vec3 uHandRight;
  uniform float uHandLeftActive;
  uniform float uHandRightActive;
  uniform float uVirtualRoomMode;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  // Compact 3D value noise for seamless world-space organic veins
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec3(13.1, 7.7, 5.3);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float dist = length(vWorldPos - uOrigin);

    // Organic warped coordinates in world space (meters)
    vec3 q = vWorldPos * 1.35;
    float n1 = fbm(q + vec3(0.0, -uTime * 0.06, uTime * 0.04));
    float n2 = fbm(q * 2.1 + vec3(n1 * 2.2) + vec3(uTime * 0.05, 0.0, -uTime * 0.05));

    // Ridged mycelium / bioluminescent vein network
    float ridge1 = 1.0 - abs(n1 * 2.0 - 1.0);
    float ridge2 = 1.0 - abs(n2 * 2.0 - 1.0);
    float veins = pow(ridge1, 5.0) * 0.85 + pow(ridge2, 7.0) * 1.15;

    // Expanding growth wave from player origin (reaches ~9m at uProgress = 1)
    float waveRadius = uProgress * 9.5;
    float organicDist = dist + (n1 - 0.5) * 1.35;
    float growthMask = smoothstep(waveRadius + 0.65, waveRadius - 0.55, organicDist) * smoothstep(0.0, 0.08, uProgress);

    // Leading luminous edge of the expanding wave
    float waveFront = exp(-pow((organicDist - waveRadius) * 2.4, 2.0)) * smoothstep(0.0, 0.06, uProgress) * (1.0 - smoothstep(0.88, 1.0, uProgress));

    // Hand proximity bloom on real surfaces
    float dL = length(vWorldPos - uHandLeft);
    float dR = length(vWorldPos - uHandRight);
    float touchL = exp(-dL * dL * 4.5) * uHandLeftActive;
    float touchR = exp(-dR * dR * 4.5) * uHandRightActive;
    float handBloom = clamp(touchL + touchR, 0.0, 1.5);
    float handRipple = sin(dL * 18.0 - uTime * 5.0) * 0.5 + 0.5;
    float handRippleR = sin(dR * 18.0 - uTime * 5.0) * 0.5 + 0.5;
    float handEnergy = touchL * (0.65 + 0.35 * handRipple) + touchR * (0.65 + 0.35 * handRippleR);

    // Breathing bioluminescent pulse
    float pulse = 0.78 + 0.22 * sin(uTime * 1.6 - dist * 1.4 + n1 * 4.0);

    // Color palette: deep ocean teal -> electric cyan -> violet -> golden-pink tips
    vec3 colTeal = vec3(0.03, 0.62, 0.68);
    vec3 colCyan = vec3(0.24, 0.96, 0.86);
    vec3 colViolet = vec3(0.56, 0.25, 0.96);
    vec3 colGold = vec3(1.0, 0.78, 0.38);

    vec3 baseVeins = mix(colTeal, colViolet, smoothstep(0.25, 0.78, n2));
    vec3 glowColor = mix(baseVeins, colCyan, smoothstep(0.45, 0.95, veins));
    glowColor = mix(glowColor, colGold, clamp(waveFront * 1.2 + handEnergy * 0.85, 0.0, 1.0));

    // Soft mossy aura behind the veins so surfaces feel genuinely transformed
    float mossAura = smoothstep(0.42, 0.78, n1) * 0.24 * growthMask;
    float veinIntensity = veins * 1.45 * pulse * growthMask;

    // Combine alpha for Passthrough (AR): completely transparent before drinking!
    float effectAlpha = clamp(veinIntensity * 0.88 + mossAura + waveFront * 0.75 + handEnergy * 0.85, 0.0, 0.92);

    vec3 finalColor = glowColor * (veinIntensity * 1.35 + mossAura * 0.85 + waveFront * 1.7 + handEnergy * 1.9);

    // On Desktop Preview (no passthrough camera), render a subtle dim room shell underneath
    if (uVirtualRoomMode > 0.5) {
      float grid = (
        smoothstep(0.96, 1.0, abs(sin(vWorldPos.x * 3.14159))) +
        smoothstep(0.96, 1.0, abs(sin(vWorldPos.z * 3.14159))) +
        smoothstep(0.96, 1.0, abs(sin(vWorldPos.y * 3.14159)))
      ) * 0.06;
      vec3 roomBase = vec3(0.045, 0.055, 0.08) + vec3(0.025, 0.035, 0.05) * abs(vWorldNormal.y) + vec3(grid);
      finalColor = mix(roomBase, finalColor + roomBase * 0.35, clamp(effectAlpha, 0.0, 1.0));
      gl_FragColor = vec4(finalColor, 1.0);
    } else {
      if (effectAlpha < 0.01) discard;
      gl_FragColor = vec4(finalColor, effectAlpha);
    }
  }
`;

export function createRoomOvergrowthMaterial(): {
  material: THREE.ShaderMaterial;
  uniforms: RoomOvergrowthUniforms;
} {
  const uniforms: RoomOvergrowthUniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uOrigin: { value: new THREE.Vector3(0, 1.1, 0) },
    uHandLeft: { value: new THREE.Vector3(0, -10, 0) },
    uHandRight: { value: new THREE.Vector3(0, -10, 0) },
    uHandLeftActive: { value: 0 },
    uHandRightActive: { value: 0 },
    uVirtualRoomMode: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  return { material, uniforms };
}
