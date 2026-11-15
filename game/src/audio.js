// RUSTLINE — round 3. Synthesized sound effects: everything is WebAudio,
// no audio files. A tiny synth per effect, shared noise buffer, master gain.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  _noise(dur, filterFreq, type, gain, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, type, gain, slideTo = null, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // weaponKind: pistol | rifle | smg | dmr | shotgun
  shot(kind, dist = 0) {
    if (!this.ctx) return;
    const att = Math.max(0.25, 1 - dist / 70);
    switch (kind) {
      case 'pistol':
        this._noise(0.09, 2400, 'bandpass', 0.5 * att);
        this._tone(190, 0.08, 'square', 0.22 * att, 70);
        break;
      case 'rifle':
        this._noise(0.12, 1500, 'bandpass', 0.6 * att);
        this._tone(150, 0.1, 'sawtooth', 0.28 * att, 55);
        break;
      case 'smg':
        this._noise(0.07, 2800, 'bandpass', 0.42 * att);
        this._tone(210, 0.06, 'square', 0.16 * att, 90);
        break;
      case 'dmr':
        this._noise(0.22, 1100, 'bandpass', 0.75 * att);
        this._tone(110, 0.2, 'sawtooth', 0.35 * att, 40);
        break;
      case 'shotgun':
        this._noise(0.18, 900, 'lowpass', 0.8 * att);
        this._tone(90, 0.16, 'sawtooth', 0.3 * att, 35);
        break;
      default:
        this._noise(0.1, 1800, 'bandpass', 0.5 * att);
    }
  }

  dryFire() {
    this._tone(1200, 0.03, 'square', 0.08);
  }

  reload() {
    this._tone(700, 0.05, 'square', 0.1);
    this._tone(500, 0.05, 'square', 0.1, null, 0.18);
    this._tone(900, 0.06, 'square', 0.12, null, 0.38);
  }

  hit() {
    this._tone(1900, 0.05, 'sine', 0.22, 1400);
  }

  kill() {
    this._tone(1400, 0.07, 'sine', 0.25, 900);
    this._tone(1900, 0.09, 'sine', 0.2, 1200, 0.07);
  }

  hurt() {
    this._noise(0.12, 500, 'lowpass', 0.35);
    this._tone(130, 0.12, 'sawtooth', 0.2, 60);
  }

  step() {
    this._noise(0.05, 700, 'lowpass', 0.07);
  }

  plantBeep(final = false) {
    this._tone(final ? 1500 : 1000, 0.09, 'sine', 0.22);
  }

  defuseBeep() {
    this._tone(1200, 0.06, 'sine', 0.18);
  }

  explosion() {
    this._noise(0.9, 300, 'lowpass', 0.9);
    this._tone(70, 0.8, 'sine', 0.6, 28);
    this._noise(0.3, 3500, 'highpass', 0.3);
  }

  grenadeThrow() {
    this._noise(0.15, 1200, 'bandpass', 0.15);
  }

  flash() {
    this._tone(2400, 0.5, 'sine', 0.3, 400);
  }

  roundWin() {
    this._tone(523, 0.14, 'triangle', 0.25);
    this._tone(659, 0.14, 'triangle', 0.25, null, 0.14);
    this._tone(784, 0.22, 'triangle', 0.28, null, 0.28);
  }

  roundLose() {
    this._tone(392, 0.16, 'triangle', 0.22);
    this._tone(330, 0.2, 'triangle', 0.22, null, 0.16);
    this._tone(262, 0.3, 'triangle', 0.24, null, 0.32);
  }

  buy() {
    this._tone(880, 0.06, 'sine', 0.18);
    this._tone(1320, 0.08, 'sine', 0.16, null, 0.06);
  }

  tick() {
    this._tone(1500, 0.03, 'sine', 0.12);
  }
}
