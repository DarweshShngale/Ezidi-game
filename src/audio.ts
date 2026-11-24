// Original procedural score and field sounds. No audio downloads or microphone access.
type Surface = 'stone' | 'earth' | 'wood';
type Cue = 'creak' | 'radio' | 'success' | 'pulse';

const phrases = [
  [0, 7, 10, 7, 5, 3, 2, 0],
  [0, -5, 2, 3, 0, -2, -5, -2],
  [0, 3, 5, 7, 5, 2, 3, 0],
  [0, 2, 3, 7, 3, 2, -2, 0],
  [7, 5, 3, 2, 3, 0, -2, 0],
  [0, 3, 7, 10, 7, 5, 7, 3],
  [0, 5, 7, 12, 10, 7, 5, 0],
];
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export class GameAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private score?: GainNode;
  private field?: GainNode;
  private echo?: GainNode;
  private noise?: AudioBuffer;
  private strings = new Map<number, AudioBuffer>();
  private timer?: ReturnType<typeof setInterval>;
  private chapter = 0;
  private beat = 0;
  private next = 0;
  private awake = false;
  private pending = 0;
  private volume = .55;
  private music = true;
  private speech = false;
  private utterance?: SpeechSynthesisUtterance;
  private lx = 0;
  private lz = 0;

  /** Call on the play/resume gesture. Embedded browsers can decline audio. */
  async start(): Promise<void> {
    if (this.volume <= 0 || document.hidden) return;
    const token = ++this.pending;
    try {
      if (!this.ctx || this.ctx.state === 'closed') this.build();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== 'running') await ctx.resume();
      if (token !== this.pending || ctx.state !== 'running') return;
      this.awake = true;
      this.master!.gain.setTargetAtTime(this.volume, ctx.currentTime, .045);
      if (!this.timer) {
        this.next = ctx.currentTime + .12;
        this.tick();
        this.timer = setInterval(() => this.tick(), 140);
      }
    } catch { /* The subtitle track remains available with audio disabled. */ }
  }

  pause(): void {
    this.pending++;
    this.awake = false;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.stopSpeech();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.master!.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master!.gain.value = 0;
      void this.ctx.suspend().catch(() => {});
    }
  }

  setVolume(value: number): void {
    this.volume = clamp(value, 0, 1);
    if (this.awake && this.ctx) {
      this.master!.gain.setTargetAtTime(this.volume, this.ctx.currentTime, .035);
    }
    if (!this.volume) this.stopSpeech();
  }

  setMusic(enabled: boolean): void {
    this.music = enabled;
    if (this.ctx && this.score) this.score.gain.setTargetAtTime(enabled ? .55 : 0, this.ctx.currentTime, .05);
  }

  setSpeech(enabled: boolean): void {
    this.speech = enabled;
    if (!enabled) this.stopSpeech();
  }

  setChapter(index: number): void {
    this.chapter = Math.trunc(clamp(index, 0, phrases.length - 1));
    this.beat = 0;
    if (this.ctx) this.next = this.ctx.currentTime + .25;
  }

  /** Camera yaw is measured from -Z; positive yaw turns toward -X (Three.js). */
  listener(x: number, z: number, yaw: number): void {
    this.lx = x; this.lz = z;
    const l = this.ctx?.listener;
    if (!l || !this.awake) return;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = 1.6; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardZ.value = fz;
    } else {
      l.setPosition(x, 1.6, z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  step(x: number, z: number, surface: Surface = 'stone'): void {
    const ctx = this.ctx;
    if (!ctx || !this.audible()) return;
    const t = ctx.currentTime;
    const bus = this.point(x, z, .15);
    const dirt = surface === 'earth';
    const wood = surface === 'wood';
    this.hiss(bus, t, dirt ? .17 : .09, dirt ? 900 : wood ? 440 : 1700,
      dirt ? .14 : .11, 'lowpass');
    this.tone(bus, t, .095, wood ? 142 : 93, .21, 'sine', .48);
    if (!dirt) this.hiss(bus, t + .037, .042, wood ? 680 : 2400, .06, 'bandpass');
    this.detach(bus, .32);
  }

  cue(kind: Cue, x?: number, z?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.audible()) return;
    const spatial = x !== undefined && z !== undefined ? this.point(x, z, 1.3) : undefined;
    const bus = spatial ?? this.field!;
    const t = ctx.currentTime;
    switch (kind) {
      case 'success':
        [196, 293.66, 392].forEach((f, i) => this.pluck(bus, t + i * .17, f, .29));
        break;
      case 'radio':
        this.hiss(bus, t, .24, 2100, .22, 'bandpass');
        this.tone(bus, t + .03, .085, 824, .055, 'sine');
        this.hiss(bus, t + .24, .12, 1450, .18, 'bandpass');
        break;
      case 'creak':
        this.tone(bus, t, .67, 165, .028, 'sawtooth', .51);
        this.hiss(bus, t + .13, .45, 680, .16, 'bandpass');
        break;
      case 'pulse':
        this.tone(bus, t, .16, 68, .32, 'sine', .65);
        this.tone(bus, t + .25, .12, 52, .19, 'sine', .72);
        break;
    }
    if (spatial) this.detach(spatial, 3.8);
  }

  dialogue(text: string): void {
    if (!this.speech || !this.audible() || !('speechSynthesis' in window)) return;
    // Use a local Arabic voice only. If none is installed the game retains its Arabic subtitles.
    const voices = window.speechSynthesis.getVoices().filter(v => v.localService && /^ar(?:-|$)/i.test(v.lang));
    const voice = voices.find(v => /^ar-IQ/i.test(v.lang)) ?? voices[0];
    if (!voice) return;
    this.stopSpeech();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = .94; u.volume = this.volume;
    this.utterance = u;
    u.onend = u.onerror = () => { if (this.utterance === u) this.utterance = undefined; };
    window.speechSynthesis.speak(u);
  }

  dispose(): void {
    this.pause();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
    this.ctx = undefined; this.noise = undefined;
    this.master = this.score = this.field = this.echo = undefined;
    this.strings.clear();
  }

  private stopSpeech(): void {
    if (this.utterance && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.utterance = undefined;
  }

  private audible(): boolean {
    return this.awake && this.volume > 0 && this.ctx?.state === 'running';
  }

  private build(): void {
    const webkit = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Constructor = window.AudioContext ?? webkit.webkitAudioContext;
    if (!Constructor) return;
    const c = this.ctx = new Constructor({latencyHint:'interactive'});
    const master = this.master = c.createGain();
    const score = this.score = c.createGain();
    const field = this.field = c.createGain();
    master.gain.value = 0;
    score.gain.value = this.music ? .55 : 0;
    field.gain.value = .72;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.ratio.value = 5;
    score.connect(master); field.connect(master); master.connect(limiter); limiter.connect(c.destination);
    const echo = this.echo = c.createGain();
    const delay = c.createDelay(1); delay.delayTime.value = .19;
    const damping = c.createBiquadFilter(); damping.frequency.value = 1800;
    echo.gain.value = .19;
    // Wet score shares the music bus, hence switching off music also mutes tails.
    echo.connect(delay); delay.connect(damping); damping.connect(score);

    const sr = c.sampleRate;
    const noise = this.noise = c.createBuffer(1, Math.ceil(sr * 2.4), sr);
    const channel = noise.getChannelData(0);
    let random = 17981;
    for (let i = 0; i < channel.length; i++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      channel[i] = random / 2147483648 - 1;
    }
    const breeze = c.createBufferSource(); breeze.buffer = noise; breeze.loop = true;
    const wind = c.createBiquadFilter(); wind.type = 'bandpass'; wind.frequency.value = 405; wind.Q.value = .52;
    const breezeGain = c.createGain(); breezeGain.gain.value = .078;
    const sweep = c.createOscillator(); sweep.frequency.value = .063;
    const depth = c.createGain(); depth.gain.value = 160;
    sweep.connect(depth); depth.connect(wind.frequency);
    breeze.connect(wind); wind.connect(breezeGain); breezeGain.connect(field);
    sweep.start(); breeze.start();
  }

  private tick(): void {
    const c = this.ctx;
    if (!c || !this.awake || c.state !== 'running') return;
    if (document.hidden) { this.pause(); return; }
    const now = c.currentTime;
    if (this.next > now + .23) return;
    const t = Math.max(this.next, now + .012);
    const phrase = phrases[this.chapter]!;
    const slot = this.beat % phrase.length;
    const hz = 146.83 * 2 ** (phrase[slot]! / 12);
    if (this.music && this.volume > 0) {
      this.pluck(this.score!, t, hz, slot % 3 === 0 ? .35 : .23, true);
      if (slot === 0 || slot === 4) {
        this.tone(this.score!, t, 2.8, slot === 0 ? 73.415 : 110, .065, 'sine');
      }
      if (slot === 6 && this.chapter >= 3) this.pluck(this.score!, t + .26, hz * 1.5, .16, true);
    }
    if (this.beat % 17 === 12) this.cue('creak', this.lx - 7, this.lz - 10);
    this.next = t + [1.15,.66,.87,1.35,.79,.8,.71,2.05][slot]!;
    this.beat++;
  }

  private point(x: number, z: number, y: number): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = 2; p.maxDistance = 55; p.rolloffFactor = .72;
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else p.setPosition(x, y, z);
    p.connect(this.field!);
    return p;
  }

  private detach(node: AudioNode, seconds: number): void {
    // Audio-clock sentinel also handles a suspended context mid-effect.
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise!; src.loop = true;
    src.onended = () => { node.disconnect(); src.disconnect(); };
    src.start(); src.stop(this.ctx!.currentTime + seconds);
  }

  private envelope(t: number, length: number, volume: number, destination: AudioNode, attack=.009): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(volume, .00011), t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + length);
    g.connect(destination);
    return g;
  }

  private tone(bus: AudioNode, t: number, length: number, hz: number, gain: number,
               type: OscillatorType, endRatio = 1): void {
    const o = this.ctx!.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * endRatio, t + length);
    const env = this.envelope(t, length, gain, bus, length > 2 ? .45 : .011);
    o.connect(env); o.onended = () => { o.disconnect(); env.disconnect(); };
    o.start(t); o.stop(t + length + .015);
  }

  private hiss(bus: AudioNode, t: number, length: number, hz: number, gain: number, type: BiquadFilterType): void {
    const c = this.ctx!; const src = c.createBufferSource();
    src.buffer = this.noise!;
    const filter = c.createBiquadFilter(); filter.type = type; filter.frequency.value = hz;
    const env = this.envelope(t, length, gain, bus);
    src.connect(filter); filter.connect(env);
    src.onended = () => { src.disconnect(); filter.disconnect(); env.disconnect(); };
    src.start(t, Math.random() * .65); src.stop(t + length + .015);
  }

  private pluck(bus: AudioNode, t: number, hz: number, volume: number, wet = false): void {
    // Karplus–Strong synthesis. Cache one short string impulse response per played pitch.
    const c = this.ctx!;
    const key = Math.round(hz * 100);
    let buf = this.strings.get(key);
    if (!buf) {
      const sr = 22050;
      const period = Math.max(4, Math.round(sr / hz - .5));
      buf = c.createBuffer(1, sr * 2, sr);
      const wave = buf.getChannelData(0);
      let seed = key;
      for (let i = 0; i < period; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        wave[i] = (seed / 2147483648 - 1) * .78;
      }
      for (let i = period; i < wave.length; i++) {
        const prev = i - period;
        wave[i] = .498 * (wave[prev]! + wave[Math.max(0, prev - 1)]!);
      }
      this.strings.set(key, buf);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const gain = this.envelope(t, 1.96, volume, bus, .003);
    if (wet) gain.connect(this.echo!);
    src.connect(gain); src.onended = () => { src.disconnect(); gain.disconnect(); };
    src.start(t); src.stop(t + 2);
  }
}
