// audio.js — every sound in Palm City Heat is synthesised with WebAudio.
// No audio files: an engine hum whose pitch follows the car's speed, a
// two-tone siren that fades with police distance, one-shot thuds, blips and
// jingles, and a slow synth pad loop for the menu and the city.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = 0;
    this.musicTimer = null;
  }

  // browsers only allow audio after a gesture, so this runs on the first click
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startMusic();
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 800) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  punch() {
    this.noise(0.08, 0.35, 500);
    this.tone(90, 0.1, 'sine', 0.3, 0, 45);
  }

  crash(strength = 1) {
    this.noise(0.25, 0.3 * strength, 900);
    this.tone(60, 0.2, 'triangle', 0.25 * strength, 0, 30);
  }

  pickup() {
    this.tone(880, 0.09, 'square', 0.12);
    this.tone(1320, 0.14, 'square', 0.12, 0.07);
  }

  cash() {
    this.tone(1180, 0.07, 'square', 0.1);
    this.tone(1560, 0.12, 'square', 0.1, 0.06);
  }

  missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.16, i * 0.11));
  }

  bustedJingle() {
    const notes = [392, 370, 349, 311];
    notes.forEach((n, i) => this.tone(n, 0.3, 'triangle', 0.16, i * 0.16));
  }

  door() {
    this.noise(0.06, 0.15, 1200);
    this.tone(180, 0.07, 'square', 0.06, 0.02, 120);
  }

  // continuous engine hum; call every frame with speed 0..1, or null to stop
  engine(level) {
    if (!this.ctx) return;
    if (level === null) {
      if (this.engineOsc) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + level * 165, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.05 + level * 0.06, t, 0.09);
  }

  // continuous siren; intensity 0..1 by nearest police distance, null to stop
  siren(intensity, dt) {
    if (!this.ctx) return;
    if (intensity === null || intensity <= 0) {
      if (this.sirenOsc) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    }
    this.sirenFlip += dt;
    const high = this.sirenFlip % 0.8 < 0.4;
    const t = this.ctx.currentTime;
    this.sirenOsc.frequency.setTargetAtTime(high ? 960 : 690, t, 0.03);
    this.sirenGain.gain.setTargetAtTime(0.028 * intensity, t, 0.1);
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // a lazy four-chord pad (Am7 – Fmaj7 – Cmaj7 – G6) with a soft bass pulse
    const chords = [
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 329.63],
      [130.81, 196.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 392.0],
    ];
    let step = 0;
    const playChord = () => {
      if (!this.ctx) return;
      const chord = chords[step % chords.length];
      chord.forEach((f) => this.tone(f, 3.6, 'sine', 0.028));
      this.tone(chord[0] / 2, 1.6, 'triangle', 0.05);
      step++;
    };
    playChord();
    this.musicTimer = setInterval(playChord, 3600);
  }
}
