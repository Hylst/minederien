/**
 * Mine de Rien — Audio Engine
 * Procedural music & SFX via Web Audio API
 * Hylst — Geoffroy
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let music: GainNode | null = null;
let sfx: GainNode | null = null;
let pads: OscillatorNode[] = [];
let musicOn = false;
let ambTimer: ReturnType<typeof setInterval> | null = null;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = 0.25; music.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 0.6; sfx.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────
function osc(type: OscillatorType, freq: number, dur: number, vol: number, dest: GainNode, delay = 0) {
  const c = ac(); const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + delay);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + delay + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
  o.connect(g); g.connect(dest);
  o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.01);
}

function sweep(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, dest: GainNode, delay = 0) {
  const c = ac(); const o = c.createOscillator(); const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, c.currentTime + delay);
  o.frequency.exponentialRampToValueAtTime(f1, c.currentTime + delay + dur);
  g.gain.setValueAtTime(vol, c.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
  o.connect(g); g.connect(dest);
  o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.01);
}

function noise(dur: number, vol: number, freq: number, dest: GainNode, delay = 0) {
  const c = ac(); const sz = c.sampleRate * dur;
  const buf = c.createBuffer(1, sz, c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sz, 2);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(c.currentTime + delay);
}

function reverbChime(freq: number, dur: number, vol: number) {
  const c = ac(); const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  const conv = c.createConvolver(); const len = c.sampleRate * 1.2;
  const imp = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const dd = imp.getChannelData(ch); for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  conv.buffer = imp;
  const dry = c.createGain(); dry.gain.value = 0.3;
  const wet = c.createGain(); wet.gain.value = 0.7;
  o.connect(g); g.connect(dry); g.connect(conv); conv.connect(wet);
  dry.connect(music!); wet.connect(music!);
  o.start(); o.stop(c.currentTime + dur + 0.1);
}

// ─── Ambient Music ───────────────────────────────────────────
export function startAmbientMusic() {
  if (musicOn) return;
  const c = ac(); musicOn = true;
  const makePad = (freq: number, det: number, vol: number) => {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq; o.detune.value = det;
    const g = c.createGain(); g.gain.value = 0;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700; f.Q.value = 2;
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.04 + Math.random() * 0.08;
    const lg = c.createGain(); lg.gain.value = 80; lfo.connect(lg); lg.connect(f.frequency);
    o.connect(f); f.connect(g); g.connect(music!);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + 4); lfo.start(); o.start();
    pads.push(o);
  };
  makePad(130.81, 0, 0.10); makePad(130.81, 6, 0.06); makePad(196, -4, 0.05); makePad(155.56, 2, 0.04); makePad(87.31, 0, 0.03);
  reverbChime(261.63, 2.5, 0.06);
  ambTimer = setInterval(() => { if (musicOn) { const notes = [261.63,293.66,329.63,392,440,523.25]; reverbChime(notes[Math.floor(Math.random()*notes.length)], 2.5, 0.06); } }, 4000 + Math.random() * 5000);
}

export function stopAmbientMusic() {
  musicOn = false;
  if (ambTimer) { clearInterval(ambTimer); ambTimer = null; }
  if (ctx) { pads.forEach(o => { try { o.stop(ctx!.currentTime + 1); } catch {} }); pads = []; if (music) music.gain.linearRampToValueAtTime(0, ctx.currentTime + 1); }
}

export function toggleMusic(): boolean {
  if (musicOn) { stopAmbientMusic(); return false; }
  startAmbientMusic();
  if (ctx && music) { music.gain.cancelScheduledValues(ctx.currentTime); music.gain.setValueAtTime(music.gain.value, ctx.currentTime); music.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.5); }
  return true;
}

export function setMasterVolume(v: number) { const c = ac(); if (master) master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), c.currentTime + 0.1); }
export function isMusicOn() { return musicOn; }

// ─── Sound Effects ───────────────────────────────────────────
export function playReveal() { sweep("sine", 500, 1100, 0.08, 0.12, sfx!); }
export function playFlag() { osc("square", 280, 0.05, 0.08, sfx!); sweep("triangle", 380, 750, 0.12, 0.10, sfx!, 0.03); }
export function playUnflag() { sweep("triangle", 550, 280, 0.12, 0.08, sfx!); }
export function playClick() { osc("sine", 900, 0.04, 0.06, sfx!); }
export function playFlood() { sweep("sine", 350, 750, 0.25, 0.07, sfx!); }

export function playExplosion() {
  noise(0.5, 0.4, 2000, sfx!); sweep("sine", 80, 20, 0.35, 0.5, sfx!); osc("sawtooth", 40, 0.6, 0.08, sfx!, 0.1);
}

export function playLose() {
  [440, 392, 349.23, 261.63].forEach((f, i) => osc("sine", f, 0.45, 0.12, sfx!, i * 0.18));
}

export function playWin() {
  [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => osc("triangle", f, 0.7, 0.18, sfx!, i * 0.13));
  osc("sine", 2093, 1.8, 0.04, sfx!, 0.55);
}

export function playWaveComplete() {
  [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => osc("triangle", f, 0.5, 0.15, sfx!, i * 0.1));
  noise(0.3, 0.05, 4000, sfx!, 0.5);
}

export function playPowerUpPickup() {
  sweep("sine", 800, 1600, 0.15, 0.12, sfx!); sweep("triangle", 1200, 2400, 0.12, 0.08, sfx!, 0.08);
}

export function playPowerUpActivate() {
  sweep("sawtooth", 200, 800, 0.2, 0.10, sfx!); noise(0.15, 0.04, 3000, sfx!, 0.1);
}

export function playCombo(lvl: number) {
  const base = 400 + Math.min(lvl, 15) * 50;
  osc("triangle", base, 0.12, 0.1, sfx!); osc("sine", base * 1.5, 0.1, 0.06, sfx!, 0.04);
}

export function playShieldAbsorb() {
  sweep("sine", 1200, 200, 0.4, 0.15, sfx!); noise(0.2, 0.08, 1500, sfx!, 0.05);
}

export function playRadarPing() {
  sweep("sine", 2000, 400, 0.6, 0.1, sfx!); osc("sine", 1800, 0.08, 0.06, sfx!, 0.3);
}

export function playFreezeSfx() {
  sweep("sine", 3000, 500, 0.3, 0.08, sfx!); noise(0.15, 0.05, 6000, sfx!);
}

export function playHintSfx() {
  [800, 1000, 1200].forEach((f, i) => osc("triangle", f, 0.2, 0.06, sfx!, i * 0.08));
}

export function playDefuseSfx() {
  sweep("square", 600, 100, 0.2, 0.08, sfx!); osc("sine", 300, 0.15, 0.05, sfx!, 0.15);
}

export function playScannerSfx() {
  sweep("sawtooth", 100, 2000, 0.4, 0.06, sfx!); sweep("sawtooth", 2000, 100, 0.4, 0.04, sfx!, 0.3);
}

export function playBonusFound() {
  [660, 880, 1100].forEach((f, i) => osc("sine", f, 0.15, 0.1, sfx!, i * 0.06));
}

export function playStar(n: number) {
  for (let i = 0; i < n; i++) osc("triangle", 800 + i * 200, 0.2, 0.1, sfx!, i * 0.15);
}

export function playGameOver() {
  [400, 350, 300, 200].forEach((f, i) => { osc("sine", f, 0.5, 0.1, sfx!, i * 0.2); osc("sawtooth", f * 0.5, 0.4, 0.04, sfx!, i * 0.2); });
  noise(0.8, 0.06, 200, sfx!, 0.8);
}
