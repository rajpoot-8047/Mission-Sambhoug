/**
 * Procedural Audio Engine for 3D Ludo
 * Uses Web Audio API to create authentic tabletop tactile sounds
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  _initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playDiceRoll() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    // Simulate multiple dice rattle impacts
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.08 + Math.random() * 0.04;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120 + Math.random() * 80, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.06);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.07);
    }
  }

  playDiceBounce(intensity = 1.0) {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. Resonant wood/ceramic body
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220 * intensity, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.055);

    gain.gain.setValueAtTime(0.35 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.065);

    // 2. High-frequency tactile edge click
    if (intensity > 0.35) {
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = 'sine';
      clickOsc.frequency.setValueAtTime(950 * intensity, now);
      clickOsc.frequency.exponentialRampToValueAtTime(180, now + 0.02);
      clickGain.gain.setValueAtTime(0.25 * intensity, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      clickOsc.connect(clickGain);
      clickGain.connect(this.ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.025);
    }
  }

  playPawnStep() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    // Crisp wooden pawn tap on ceramic slab
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.04);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  playCapture() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    // Heavy dramatic knock on opponent knock-out
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  playSafeStar() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    // Celestial glockenspiel chime on safe star
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const t = now + idx * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  playVictory() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    // Royal brass fanfare chords
    const notes = [
      { f: 523.25, t: 0.0 }, // C5
      { f: 659.25, t: 0.15 }, // E5
      { f: 783.99, t: 0.3 }, // G5
      { f: 1046.5, t: 0.5 } // C6
    ];

    const now = this.ctx.currentTime;
    notes.forEach((n) => {
      const t = now + n.t;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.65);
    });
  }
}

const sounds = new SoundEngine();
