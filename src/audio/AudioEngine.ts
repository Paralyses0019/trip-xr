/**
 * Procedural Web Audio soundscape — zero external audio files required.
 * Generates:
 * - Warm evolving harmonic pad as the trip unfolds
 * - Liquid drinking shimmer & resonant heartbeat pulse
 * - Crystalline pentatonic chimes when hands stir the bioluminescent spores
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private started = false;
  private lastChimeTime = 0;

  // D-minor / F-major dreamy pentatonic frequencies (Hz)
  private readonly scale = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0];

  public init(): void {
    if (this.started) {
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.7;
    this.masterGain.connect(this.ctx.destination);

    this.setupDrone();
    this.started = true;
  }

  private setupDrone(): void {
    if (!this.ctx || !this.masterGain) return;

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 180;
    this.droneFilter.Q.value = 2.2;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.001;

    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    // Rich detuned harmonic chord (D2, A2, F3, A3)
    const freqs = [73.42, 110.0, 174.61, 220.0, 293.66];
    const detunes = [-6, 4, -8, 7, 3];

    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.droneFilter) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx < 2 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = detunes[idx];

      const oscGain = this.ctx.createGain();
      oscGain.gain.value = idx < 2 ? 0.24 : 0.09;

      osc.connect(oscGain);
      oscGain.connect(this.droneFilter);
      osc.start();
    });
  }

  /**
   * Call every frame with trip intensity (0..1) to open up the ambient pad
   */
  public setTripIntensity(progress: number): void {
    if (!this.ctx || !this.droneGain || !this.droneFilter) return;
    const now = this.ctx.currentTime;
    const targetGain = 0.02 + progress * 0.28;
    const targetCutoff = 160 + progress * 1150;
    this.droneGain.gain.setTargetAtTime(targetGain, now, 0.35);
    this.droneFilter.frequency.setTargetAtTime(targetCutoff, now, 0.4);
  }

  /**
   * Soft shimmering sound while sipping the elixir
   */
  public playDrinkTick(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 520 + Math.random() * 260;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Deep resonant bass drop + rising harmonic bloom when the elixir takes effect
   */
  public playTripStart(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Deep sub-bass thump
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 1.4);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.45, now + 0.06);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 2.3);

    // Rising crystalline arpeggio
    const chord = [293.66, 349.23, 440.0, 523.25, 698.46, 880.0];
    chord.forEach((freq, i) => {
      this.playChimeAt(freq, now + i * 0.12, 0.11, 1.8);
    });
  }

  /**
   * Play a gentle pentatonic sparkle when hands move through spores
   */
  public playSporeChime(intensity = 0.5): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (now - this.lastChimeTime < 0.14) return;
    this.lastChimeTime = now;

    const freq = this.scale[Math.floor(Math.random() * this.scale.length)];
    this.playChimeAt(freq, now, Math.min(0.12, 0.04 + intensity * 0.07), 1.1);
  }

  private playChimeAt(freq: number, startTime: number, peakGain: number, duration: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const overtone = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2.0, startTime);

    const overtoneGain = this.ctx.createGain();
    overtoneGain.gain.value = 0.18;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    overtone.start(startTime);
    osc.stop(startTime + duration + 0.05);
    overtone.stop(startTime + duration + 0.05);
  }
}
