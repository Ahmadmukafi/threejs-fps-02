// RUSTLINE — procedural sound. Every sound is synthesized with WebAudio:
// no audio files, no network. A tiny synth per event, kept quiet and short.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Short filtered noise burst: the body of every gunshot and explosion.
  noise(dur, filterFreq, gain, type = 'lowpass') {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  // A pure tone with a fast pitch drop: thumps, beeps and dings.
  tone(freq, dur, gain, slideTo = null, type = 'sine') {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // distance: 0 = at the listener, 1 = far. Far sounds get quieter and duller.
  shot(kind, distance = 0) {
    this.resume();
    const att = Math.max(0.15, 1 - distance * 0.75);
    if (kind === 'pistol') { this.noise(0.09, 2400, 0.5 * att); this.tone(180, 0.07, 0.25 * att, 70, 'square'); }
    else if (kind === 'smg') { this.noise(0.07, 3000, 0.38 * att); this.tone(220, 0.05, 0.18 * att, 90, 'square'); }
    else if (kind === 'rifle') { this.noise(0.11, 1900, 0.6 * att); this.tone(140, 0.09, 0.3 * att, 55, 'square'); }
    else if (kind === 'sniper') { this.noise(0.22, 1200, 0.85 * att); this.tone(110, 0.18, 0.4 * att, 40, 'sawtooth'); }
  }

  dryFire() { this.tone(1200, 0.03, 0.12, null, 'square'); }
  reload() {
    this.tone(900, 0.03, 0.15, null, 'square');
    setTimeout(() => this.tone(600, 0.03, 0.15, null, 'square'), 140);
    setTimeout(() => this.tone(1100, 0.03, 0.18, null, 'square'), 320);
  }
  hit(head = false) { this.tone(head ? 2400 : 1700, 0.05, 0.22, null, 'sine'); }
  hurt() { this.noise(0.12, 500, 0.3); this.tone(90, 0.14, 0.25, 50, 'sine'); }
  kill() { this.tone(880, 0.08, 0.2); setTimeout(() => this.tone(1320, 0.12, 0.2), 80); }
  explosion(distance = 0) {
    const att = Math.max(0.2, 1 - distance * 0.6);
    this.noise(0.7, 400, 0.9 * att);
    this.tone(70, 0.6, 0.5 * att, 28, 'sine');
  }
  plantBeep() { this.tone(1500, 0.06, 0.2); }
  defuseBeep() { this.tone(1100, 0.06, 0.2); }
  roundWin() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 0.22), i * 110));
  }
  roundLose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 0.2), i * 130));
  }
  buy() { this.tone(1000, 0.05, 0.18); setTimeout(() => this.tone(1400, 0.06, 0.18), 60); }
  denied() { this.tone(220, 0.12, 0.2, 180, 'square'); }
  step() { this.noise(0.04, 700, 0.06); }
  grenadePin() { this.tone(2000, 0.03, 0.12, null, 'square'); }
}
