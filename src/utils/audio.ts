// Web Audio API Synthesizer for instant, zero-external-dependency sound effects

class SoundEffectsManager {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Cheerful correct chime
  playSuccess(muted: boolean = false) {
    if (muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.15, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.3);
    });
  }

  // Gentle boop for mistake (encouraging, non-jarring)
  playError(muted: boolean = false) {
    if (muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(261.63, now); // C4
    osc.frequency.exponentialRampToValueAtTime(196.00, now + 0.2); // G3

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Twinkling sound when earning a star
  playStarEarned(muted: boolean = false) {
    if (muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [880, 1174.66, 1396.91, 1760];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.12, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.25);
    });
  }

  // Fanfare victory tune when completing a module
  playFanfare(muted: boolean = false) {
    if (muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // C5, C5, C5, G5, A5, B5, C6
    const melody = [
      { f: 523.25, d: 0.12, t: 0 },
      { f: 523.25, d: 0.12, t: 0.14 },
      { f: 523.25, d: 0.12, t: 0.28 },
      { f: 659.25, d: 0.2, t: 0.42 },
      { f: 783.99, d: 0.25, t: 0.65 },
      { f: 1046.50, d: 0.4, t: 0.95 },
    ];

    melody.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, now + note.t);

      gain.gain.setValueAtTime(0.18, now + note.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.t);
      osc.stop(now + note.t + note.d + 0.05);
    });
  }
}

export const sounds = new SoundEffectsManager();

// Text-to-speech engine using SpeechSynthesis API
export function speakText(text: string, lang: 'es-ES' | 'en-US' = 'es-ES') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9; // Slightly slower for 7yo clarity
  utterance.pitch = 1.15; // Friendly warm pitch

  window.speechSynthesis.speak(utterance);
}
