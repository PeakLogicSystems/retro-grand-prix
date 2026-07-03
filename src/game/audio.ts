// All sound is synthesized (oscillators/noise) rather than loaded from audio
// files - fits the retro aesthetic and needs no external assets. Browsers
// block audio until a user gesture; call resume() from an existing click
// handler (the canvas-focus click) to unlock it.
export class SoundEngine {
  private readonly ctx: AudioContext;
  private readonly engineOsc: OscillatorNode;
  private readonly engineGain: GainNode;

  constructor() {
    this.ctx = new AudioContext();

    // Persistent engine hum - created once and left running, rather than a
    // one-shot sound, since its pitch/volume need to track speed live.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
  }

  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // speedFraction: 0 (stopped) to 1+ (top speed or beyond)
  updateEngine(speedFraction: number, active: boolean): void {
    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1.3, speedFraction));
    const targetFreq = 55 + clamped * 160;
    const targetGain = active ? 0.03 + clamped * 0.05 : 0;

    // Short ramps instead of snapping the value, so the pitch/volume glide
    // smoothly frame to frame rather than clicking/stepping audibly.
    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);
  }

  private playTone(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  }

  playMenuMove(): void {
    this.playTone(440, 0.05, 'square', 0.12);
  }

  playMenuSelect(): void {
    this.playTone(523, 0.05, 'square', 0.14);
    this.playTone(659, 0.08, 'square', 0.14, 0.05);
  }

  playCheckpoint(): void {
    this.playTone(880, 0.06, 'square', 0.1);
  }

  playNewBest(): void {
    [523, 659, 784, 1047].forEach((freq, i) => this.playTone(freq, 0.12, 'square', 0.15, i * 0.09));
  }

  playCrash(): void {
    // Short burst of noise through a fast pitch/volume drop reads as an
    // impact - no oscillator gives that harsh, unpitched "thud" on its own.
    const start = this.ctx.currentTime;
    const duration = 0.25;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, start);
    filter.frequency.exponentialRampToValueAtTime(80, start + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(start);
    noise.stop(start + duration);
  }
}
