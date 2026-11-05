interface SoundSettings {
  volume: number;
  muted: boolean;
}

const SETTINGS_KEY = "pageshooter_sound_settings";

class SoundManager {
  private ctx: AudioContext | null = null;
  private settings: SoundSettings = {
    volume: 0.7,
    muted: false
  };

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.volume === "number") {
          this.settings.volume = Math.max(0, Math.min(1, parsed.volume));
        }
        if (typeof parsed.muted === "boolean") {
          this.settings.muted = parsed.muted;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  private saveSettings(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore localStorage errors
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  public setVolume(volume: number): void {
    this.settings.volume = Math.max(0, Math.min(1, volume));
    this.saveSettings();
  }

  public setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.saveSettings();
  }

  public toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.saveSettings();
    return this.settings.muted;
  }

  private getEffectiveVolume(): number {
    return this.settings.muted ? 0 : this.settings.volume;
  }

  public playTurnChime(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(vol * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  public playPageFlip(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.Q.setValueAtTime(1.5, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  }

  public playRuneHum(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(146.83, ctx.currentTime); // D3
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(220, ctx.currentTime); // A3

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol * 0.3, ctx.currentTime + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 1.2);
    osc2.stop(ctx.currentTime + 1.2);
  }

  public playGunshot(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Noise blast
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Low punch
    const kick = ctx.createOscillator();
    kick.type = "triangle";
    kick.frequency.setValueAtTime(180, ctx.currentTime);
    kick.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.25);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.7, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    noise.connect(gain);
    kick.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    kick.start();
    kick.stop(ctx.currentTime + 0.35);
  }

  public playCellDestroyed(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Shattering glass / stone crunch
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }

  public playElimination(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Dark tomb gong
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 1.8);

    sub.type = "sine";
    sub.frequency.setValueAtTime(55, ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 2.0);

    gain.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);

    osc.connect(gain);
    sub.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    sub.start();
    osc.stop(ctx.currentTime + 2.0);
    sub.stop(ctx.currentTime + 2.0);
  }

  public playVictory(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const notes = [261.63, 329.63, 392.0, 523.25, 659.25]; // C4, E4, G4, C5, E5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.12;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol * 0.35, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.8);
    });
  }
}

export const soundManager = new SoundManager();
