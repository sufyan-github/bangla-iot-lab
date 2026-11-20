/**
 * The buzzer's tone. One oscillator is kept running and its volume is switched,
 * which avoids clicks. Browsers allow audio only after the student has tapped
 * something, which pressing Run already is.
 */
let context: AudioContext | undefined;
let gain: GainNode | undefined;

export function setBuzzing(on: boolean): void {
  if (!on && !context) return;
  try {
    if (!context) {
      context = new AudioContext();
      gain = context.createGain();
      gain.gain.value = 0;
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = 2300; // typical resonance of a small piezo buzzer
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
    }
    if (on) void context.resume();
    // Quiet on purpose: a classroom may have forty of these going.
    gain!.gain.setTargetAtTime(on ? 0.04 : 0, context.currentTime, 0.005);
  } catch {
    // No audio device or audio blocked: the buzzer still shows that it is sounding.
  }
}
