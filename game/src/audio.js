// Palm City Heat — all sound is synthesized with the WebAudio API; there are
// no audio files. One SoundKit owns the context: an engine hum whose pitch
// follows the driven car's speed, a two-tone siren that fades with the
// nearest patrol car, short noise thuds, pickup blips, mission jingles and
// a slow ambient bass-and-pad loop. Nothing starts until the first user
// gesture, as browsers require.

export class SoundKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.step = 0;
  }

  /** Create the context and start the ambient loop. Call on a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Engine: a detuned saw pair through a lowpass, silent until driving.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // Siren: a square wave whose frequency the update loop wobbles.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();

    this.startMusic();
  }

  /** speedKmh of the car the player drives (0 on foot), sirenLevel 0..1. */
  update(speedKmh, sirenLevel, time) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const driving = speedKmh > 1;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + Math.min(0.05, speedKmh / 1800) : 0, t, 0.08);
    if (driving) this.engineOsc.frequency.setTargetAtTime(50 + speedKmh * 1.6, t, 0.05);
    const wobble = 700 + Math.sin(time * 5.2) * 160;
    this.sirenOsc.frequency.setTargetAtTime(wobble, t, 0.03);
    this.sirenGain.gain.setTargetAtTime(0.045 * sirenLevel, t, 0.15);
  }

  tone(freq, dur, type = 'square', vol = 0.12, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  thud(strength = 1) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.14);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(0.5, 0.18 * strength);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  blip() { this.tone(880, 0.09, 'square', 0.1, 1320); }
  punch() { this.thud(0.7); this.tone(140, 0.07, 'sine', 0.16, 70); }
  cash() { this.tone(990, 0.08, 'square', 0.09); this.tone(1480, 0.12, 'square', 0.09, null, 0.07); }
  jingle(win = true) {
    const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    notes.forEach((n, i) => this.tone(n, 0.16, 'triangle', 0.12, null, i * 0.11));
  }
  bustedSound() { this.tone(220, 0.5, 'sawtooth', 0.12, 110); }

  /** A slow two-bar loop: warm bass roots with a soft pad fifth above. */
  startMusic() {
    const roots = [110, 110, 87.3, 98]; // A, A, F, G
    const playStep = () => {
      if (!this.ctx) return;
      const root = roots[this.step % roots.length];
      this.tone(root, 1.6, 'sine', 0.055);
      this.tone(root * 1.5, 1.6, 'sine', 0.028);
      if (this.step % 2 === 0) this.tone(root * 2, 0.5, 'triangle', 0.02);
      this.step++;
    };
    playStep();
    this.musicTimer = setInterval(playStep, 1700);
  }
}
