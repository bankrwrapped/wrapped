// The story's score, synthesised live with Web Audio, so there's nothing to
// license or download: synthwave at 120 BPM in A minor (Am F C G). Each scene
// sets an energy level that adds or strips layers (pads and arp, then kick
// and bass, then the full groove, then the octave-up arp). Scene lengths are
// whole bars, so cuts that happen on their own land on the downbeat; a riser
// builds into each one and cut() plays the hit that goes with it.
// Scheduling uses the usual look-ahead loop: a timer queues notes a little
// ahead on the audio clock, so pausing is just suspending the context.
// Soundtrack.render() plays the same score into an OfflineAudioContext, for a
// soundtrack file to put under a recording of the story.

export const BPM = 120;
const BEAT = 60 / BPM;
const STEP = BEAT / 4;
export const BAR_MS = BEAT * 4 * 1000;
const LOOKAHEAD = 0.15;
const LEVEL = 0.8;

export type Energy = 0 | 1 | 2 | 3 | 4;
export type CutSound = "impact" | "whoosh" | "soft";
export type Cue = { duration: number; energy: Energy; sound: CutSound };

// One chord per bar, as MIDI notes.
const PROG = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
// Indexes into the chord spread over two octaves.
const ARP = [0, 2, 4, 5, 3, 1, 4, 2];
const PAD_CUTOFF = [500, 700, 1100, 1600, 2400];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Soundtrack {
  private ctx: BaseAudioContext;
  // null when rendering offline
  private live: AudioContext | null;
  // Offline renders set the clock by hand.
  private cursor: number | null = null;
  private out: GainNode;
  private padBus: GainNode;
  private reverb: GainNode;
  private echo: GainNode;
  private noise: AudioBuffer;
  private energy: Energy = 1;
  private step = 0;
  private next = 0;
  private t0 = 0;
  private timer = 0;
  private riser: AudioBufferSourceNode | null = null;
  private muted: boolean;
  private ended = false;

  constructor(muted: boolean, offline?: OfflineAudioContext) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.live = offline ? null : new Ctx();
    const ctx = (this.ctx = offline ?? this.live!);
    this.muted = muted;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.out = ctx.createGain();
    this.out.gain.value = muted ? 0 : LEVEL;
    this.out.connect(comp);

    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.8);
    conv.connect(this.out);
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.35;
    this.reverb.connect(conv);

    // Dotted-eighth echo with a darkening feedback loop.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = BEAT * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.frequency.value = 2600;
    this.echo = ctx.createGain();
    this.echo.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(this.out);

    // Pads go through their own bus so the kick can duck them.
    this.padBus = ctx.createGain();
    this.padBus.connect(this.out);
    this.padBus.connect(this.reverb);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // The whole score for a run through the story with no taps: each cue's hit
  // and energy at its start, a riser into the next, then the ending's hit and
  // a fade. Resolves to the rendered audio.
  static render(cues: Cue[], { tail = 5, fade = 4, sampleRate = 48000 } = {}): Promise<AudioBuffer> {
    const length = cues.reduce((a, c) => a + c.duration, 0) / 1000 + tail;
    const ctx = new OfflineAudioContext(2, Math.ceil(length * sampleRate), sampleRate);
    const s = new Soundtrack(false, ctx);
    s.t0 = s.next = 0;
    let at = 0;
    for (const cue of cues) {
      s.cursor = at;
      s.setEnergy(cue.energy);
      s.cut(cue.sound);
      s.riseTo(cue.duration);
      at += cue.duration / 1000;
      s.scheduleUntil(at);
    }
    s.cursor = at;
    s.end(fade);
    s.scheduleUntil(length);
    return ctx.startRendering();
  }

  start() {
    void this.live!.resume();
    this.t0 = this.next = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  setEnergy(e: Energy) {
    this.energy = e;
  }

  // The hit for a cut happening now. Cancels the riser if the cut came early.
  cut(sound: CutSound) {
    if (this.ended) return;
    const t = this.now();
    this.cancelRiser(t);
    if (sound === "impact") {
      this.sweep("sine", 90, 32, t, 0.9, 1.4, this.out);
      this.noiseHit(t, 0.9, 0.35, "lowpass", 4000, 150, [this.out, this.reverb]);
    } else if (sound === "whoosh") {
      this.noiseHit(t, 0.5, 0.3, "bandpass", 5000, 300, [this.out, this.reverb], 1.5);
    } else {
      this.tone("triangle", hz(76), t, 1.2, 0.08, [this.reverb, this.echo]);
    }
  }

  // A noise swell that peaks `ms` from now, where the next cut will land.
  riseTo(ms: number) {
    if (this.ended) return;
    const end = this.now() + ms / 1000;
    const len = Math.min(1.8, ms / 1000 - 0.3);
    this.cancelRiser(this.now());
    if (len < 0.5) return;
    const start = end - len;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, start);
    f.frequency.exponentialRampToValueAtTime(7000, end);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.18, end);
    src.connect(f).connect(g);
    g.connect(this.out);
    g.connect(this.reverb);
    src.start(start);
    src.stop(end);
    this.riser = src;
  }

  pause() {
    if (!this.ended) void this.live?.suspend();
  }

  resume() {
    if (!this.ended) void this.live?.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ended) this.out.gain.setTargetAtTime(muted ? 0 : LEVEL, this.ctx.currentTime, 0.05);
  }

  // 0..1 through the current beat, for visuals that pulse with the kick.
  beatPhase(): number {
    const t = this.ctx.currentTime - this.t0;
    return t <= 0 ? 0 : (t / BEAT) % 1;
  }

  // Final hit, then the pads ring out and the context closes.
  end(fade = 4) {
    if (this.ended) return;
    this.cut("impact");
    this.ended = true;
    this.energy = 0;
    const t = this.now();
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.muted ? 0 : LEVEL, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    const live = this.live;
    if (!live) return;
    void live.resume();
    window.setTimeout(() => {
      clearInterval(this.timer);
      void live.close();
    }, fade * 1000 + 500);
  }

  private now(): number {
    return this.cursor ?? this.ctx.currentTime;
  }

  private schedule() {
    this.scheduleUntil(this.ctx.currentTime + LOOKAHEAD);
  }

  private scheduleUntil(until: number) {
    while (this.next < until) {
      this.play(this.step, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  private play(step: number, t: number) {
    const s = step % 16;
    const chord = PROG[Math.floor(step / 16) % PROG.length];
    const e = this.energy;
    if (s === 0) this.pad(chord, t, e);
    if (e >= 2 && s % 4 === 0) {
      this.kick(t);
      this.duck(t);
    }
    if (e >= 3 && (s === 4 || s === 12)) this.snare(t);
    if (e >= 2 && s % 4 === 2) this.noiseHit(t, 0.05, 0.09, "highpass", 7500);
    else if (e >= 3 && s % 2 === 1) this.noiseHit(t, 0.04, 0.035, "highpass", 8000);
    if (e >= 2 && s % (e >= 3 ? 2 : 4) === 0) this.bass(chord[0] - 24 + (e >= 3 && s % 4 === 2 ? 12 : 0), t);
    if (e >= 1 && (e >= 3 || s % 2 === 0)) {
      const spread = [...chord, ...chord.map((n) => n + 12)];
      this.pluck(spread[ARP[step % ARP.length]] + (e >= 4 ? 12 : 0), t, e);
    }
  }

  private kick(t: number) {
    this.sweep("sine", 150, 42, t, 1, 0.4, this.out, 0.13);
  }

  private duck(t: number) {
    const g = this.padBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.3, t);
    g.linearRampToValueAtTime(1, t + BEAT * 0.9);
  }

  private snare(t: number) {
    this.noiseHit(t, 0.2, 0.4, "bandpass", 1800, undefined, [this.out, this.reverb], 0.8);
    this.tone("triangle", 190, t, 0.1, 0.25, [this.out]);
  }

  private bass(note: number, t: number) {
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = hz(note);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1100, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.9);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + STEP * 2);
  }

  private pad(chord: number[], t: number, e: Energy) {
    const bar = BEAT * 4;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = PAD_CUTOFF[e];
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.4);
    g.gain.setValueAtTime(0.05, t + bar - 0.1);
    g.gain.linearRampToValueAtTime(0, t + bar + 0.5);
    f.connect(g).connect(this.padBus);
    for (const note of [chord[0] - 12, ...chord]) {
      for (const detune of [-8, 8]) {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(note);
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(t + bar + 0.6);
      }
    }
  }

  private pluck(note: number, t: number, e: Energy) {
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = hz(note);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1800 + e * 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(f).connect(g);
    g.connect(this.out);
    g.connect(this.echo);
    o.start(t);
    o.stop(t + 0.2);
  }

  // An oscillator gliding from one pitch to another with a decaying level.
  private sweep(type: OscillatorType, from: number, to: number, t: number, gain: number, dur: number, dest: AudioNode, glide = dur * 0.65) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + glide);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private tone(type: OscillatorType, freq: number, t: number, dur: number, gain: number, dests: AudioNode[]) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    for (const d of dests) g.connect(d);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Filtered noise with a decaying level; `to` sweeps the filter.
  private noiseHit(t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, to?: number, dests: AudioNode[] = [this.out], q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g);
    for (const d of dests) g.connect(d);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private cancelRiser(t: number) {
    try {
      this.riser?.stop(t);
    } catch {
      // already stopped
    }
    this.riser = null;
  }

  private impulse(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }
}

