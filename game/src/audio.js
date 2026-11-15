// RUSTLINE — synthesized sound: every effect is built with WebAudio, no assets.
// The context is created lazily on the first user gesture; in headless smoke
// runs it simply stays silent.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { return false; }
    return true;
  }

  // A short burst of filtered noise with an exponential decay.
  burst(freq, dur, gain, type = 'lowpass', when = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // A pure tone with a pitch slide, for beeps and the explosion's body.
  tone(freq0, freq1, dur, gain, type = 'sine', when = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  shot(kind) {
    if (kind === 'longbow') { this.burst(900, 0.32, 0.9); this.tone(140, 40, 0.3, 0.7, 'sawtooth'); }
    else if (kind === 'ar77') { this.burst(2400, 0.11, 0.55); this.tone(220, 90, 0.09, 0.4, 'square'); }
    else if (kind === 'vex9') { this.burst(3200, 0.08, 0.42); }
    else { this.burst(1800, 0.1, 0.5); this.tone(180, 70, 0.08, 0.35, 'square'); }
  }

  dryFire() { this.tone(1200, 900, 0.05, 0.2, 'square'); }
  reload() { this.burst(5000, 0.05, 0.25, 'highpass'); this.burst(3500, 0.05, 0.2, 'highpass', 0.35); }
  hit() { this.tone(1800, 1800, 0.05, 0.3, 'sine'); }
  hurt() { this.tone(140, 60, 0.18, 0.5, 'sawtooth'); }
  step() { this.burst(700, 0.06, 0.12); }
  plantBeep(final) { this.tone(final ? 1400 : 950, final ? 1400 : 950, final ? 0.4 : 0.12, 0.4, 'sine'); }
  explosion() {
    this.burst(300, 1.1, 1.0);
    this.tone(90, 28, 1.0, 0.9, 'sine');
    this.burst(5000, 0.25, 0.5, 'highpass');
  }
  roundStart() { this.tone(520, 780, 0.16, 0.3, 'sine'); this.tone(780, 780, 0.22, 0.3, 'sine', 0.18); }
  roundEnd(win) {
    if (win) { this.tone(520, 520, 0.14, 0.3, 'sine'); this.tone(660, 660, 0.14, 0.3, 'sine', 0.15); this.tone(880, 880, 0.3, 0.3, 'sine', 0.3); }
    else { this.tone(420, 320, 0.3, 0.3, 'sine'); this.tone(320, 240, 0.4, 0.3, 'sine', 0.2); }
  }
}
