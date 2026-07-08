/**
 * Service d'immersion pour la navigation GPS
 *
 * Centralise les APIs navigateur qui améliorent l'expérience :
 * - Vibration haptique (Navigator.vibrate)
 * - Synthèse vocale (speechSynthesis)
 * - Effets sonores courts (WebAudio API — pas de fichier à charger)
 *
 * Toutes les méthodes sont safe : no-op si l'API n'est pas dispo.
 */

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    // Safari iOS prefix
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Vibration haptique — séquence de pulses courts.
 * @param pattern ex: [100, 50, 100] ou un nombre simple
 */
export function haptic(pattern: number | number[] = 60): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}

/**
 * Annonce vocale via Web Speech API.
 * Si `speechSynthesis` n'est pas dispo, no-op silencieux.
 */
export function speak(text: string, opts: { lang?: string; rate?: number; pitch?: number } = {}): void {
  if (typeof window === "undefined") return;
  if (typeof window.speechSynthesis === "undefined") return;
  try {
    // Annuler toute annonce en cours pour ne pas se chevaucher
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = opts.lang ?? "fr-FR";
    utter.rate = opts.rate ?? 1.0;
    utter.pitch = opts.pitch ?? 1.0;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

export function stopSpeaking(): void {
  if (typeof window === "undefined") return;
  if (typeof window.speechSynthesis !== "undefined") {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * Joue un petit "blip" audio (Web Audio API — pas de fichier).
 * @param freq fréquence en Hz (ex: 440 pour un La)
 * @param duration durée en secondes (défaut 0.08)
 */
export function blip(freq = 440, duration = 0.08): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.04; // volume très bas, ne pas déranger
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    // Fade-out pour éviter le "clic" de fin
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.stop(now + duration);
  } catch {
    // ignore
  }
}

/**
 * Patterns d'immersion prédéfinis.
 */
export const Immersion = {
  /** Nouveau segment de trajet : retour audio (blip) + voix optionnelle. */
  segmentChange: (instruction: string, voiceEnabled = true) => {
    blip(660, 0.06);
    if (voiceEnabled) speak(instruction);
  },
  /** Arrivée à destination : retour audio + voix optionnelle. */
  arrived: (voiceEnabled = true) => {
    blip(880, 0.15);
    if (voiceEnabled) speak("Vous êtes arrivé à destination.");
  },
  /** Hors trajet : retour audio grave + voix d'alerte optionnelle. */
  offRoute: (voiceEnabled = true) => {
    blip(220, 0.2);
    if (voiceEnabled) speak("Vous vous êtes écarté de l'itinéraire. Recalcul en cours.");
  },
  /** Recalcul en cours */
  recalculating: () => {
    blip(440, 0.04);
  },
};
