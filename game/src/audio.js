// All of Palm City's sound is synthesised with WebAudio — no audio files.
// An engine hum that follows the car's speed, a two-tone siren that swells
// as police close in, thuds, blips and jingles, and a slow synth pad loop
// for the sea air. Nothing starts until the player's first click or key.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = 0;
  let chordStep = 0;

  // A lazy I–V–vi–IV style drift in A minor: warm, coastal, unhurried.
  const CHORDS = [
    [110.0, 164.81, 261.63], // A2 E3 C4
    [87.31, 130.81, 220.0], // F2 C3 A3
    [98.0, 146.83, 246.94], // G2 D3 B3
    [110.0, 164.81, 329.63], // A2 E3 E4
  ];

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function startEngine() {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
  }

  function startSiren() {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'sine';
    sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.frequency.value = 760;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, gain, cutoff) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  function padChord(freqs, dur) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.028, t + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  return {
    /** Call from a user gesture: builds the context and starts the loops. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!engineOsc) {
        startEngine();
        startSiren();
      }
    },
    /** Per-frame: engine pitch by speed, siren volume by police distance. */
    update(dt, drive, policeDist) {
      if (!ctx) return;
      const speedNorm = drive.inCar ? Math.min(1, Math.abs(drive.speed) / 34) : 0;
      const engineLevel = drive.inCar ? 0.05 + speedNorm * 0.075 : 0;
      engineGain.gain.setTargetAtTime(engineLevel, ctx.currentTime, 0.08);
      const freq = 42 + speedNorm * 128 + (drive.inCar ? 6 : 0);
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.06);
      engineOsc2.frequency.setTargetAtTime(freq * 0.5 + 2, ctx.currentTime, 0.06);
      const sirenLevel = policeDist < 55 ? (1 - policeDist / 55) * 0.055 : 0;
      sirenGain.gain.setTargetAtTime(sirenLevel, ctx.currentTime, 0.15);
      musicTimer -= dt;
      if (musicTimer <= 0) {
        musicTimer = 3.4;
        padChord(CHORDS[chordStep % CHORDS.length], 3.6);
        chordStep++;
      }
    },
    thud(strength = 1) {
      noiseBurst(0.12, 0.22 * strength, 300);
      tone(70, 0.12, 'sine', 0.25 * strength, 0, 40);
    },
    punch() {
      noiseBurst(0.07, 0.16, 900);
    },
    blip() {
      tone(880, 0.09, 'square', 0.06, 0, 1320);
    },
    coin() {
      tone(1180, 0.07, 'square', 0.05);
      tone(1560, 0.1, 'square', 0.05, 0.06);
    },
    door() {
      tone(180, 0.08, 'square', 0.08, 0, 120);
      noiseBurst(0.05, 0.08, 500);
    },
    jingle(win = true) {
      const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [392, 329.63, 261.63];
      notes.forEach((f, i) => tone(f, 0.16, 'triangle', 0.09, i * 0.11));
    },
    alarm() {
      tone(660, 0.14, 'square', 0.07);
      tone(660, 0.14, 'square', 0.07, 0.2);
    },
  };
}
