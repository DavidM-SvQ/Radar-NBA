// Web Audio API Sound Synthesizer for PequeSabios
class SoundEffects {
  private ctx: AudioContext | null = null;
  public soundEnabled: boolean = true;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public playClick() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio fallback
    }
  }

  public playCorrect() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.07);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + idx * 0.07 + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + idx * 0.07);
        osc.stop(this.ctx.currentTime + idx * 0.07 + 0.25);
      });
    } catch {
      // Audio fallback
    }
  }

  public playTryAgain() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const notes = [392.00, 329.63]; // G4, E4 gentle wobble
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.12);

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + idx * 0.12 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + idx * 0.12);
        osc.stop(this.ctx.currentTime + idx * 0.12 + 0.28);
      });
    } catch {
      // Audio fallback
    }
  }

  public playFanfare() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const melody = [
        { note: 523.25, duration: 0.12 }, // C5
        { note: 659.25, duration: 0.12 }, // E5
        { note: 783.99, duration: 0.12 }, // G5
        { note: 1046.50, duration: 0.35 }, // C6
      ];

      let startTime = this.ctx.currentTime;
      melody.forEach((item) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(item.note, startTime);

        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + item.duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + item.duration + 0.05);
        startTime += item.duration;
      });
    } catch {
      // Audio fallback
    }
  }
}

export const sounds = new SoundEffects();
