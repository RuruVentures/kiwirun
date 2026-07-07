/**
 * Tiny WebAudio synth — all sound effects and the background chiptune loop
 * are generated at runtime, no audio assets needed.
 */
let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slideTo?: number,
  when = 0
) {
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    const t0 = c.currentTime + when;
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  } catch {
    // audio not available — the game plays on silently
  }
}

export const sfx = {
  jump() {
    tone(300, 0.14, "square", 0.05, 560);
  },
  flap() {
    tone(440, 0.06, "square", 0.045);
    tone(660, 0.07, "square", 0.045, undefined, 0.06);
  },
  pickup(step: number) {
    const f = 620 * Math.pow(1.09, Math.min(step, 12));
    tone(f, 0.09, "sine", 0.06);
    tone(f * 1.5, 0.1, "sine", 0.035, undefined, 0.05);
  },
  thump() {
    tone(130, 0.06, "triangle", 0.05, 80);
  },
  die() {
    tone(420, 0.5, "sawtooth", 0.07, 70);
    tone(210, 0.4, "square", 0.04, 55, 0.08);
  },
  start() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.1, "square", 0.045, undefined, i * 0.09)
    );
  },
  record() {
    [784, 988, 1175, 1568].forEach((f, i) =>
      tone(f, 0.14, "square", 0.05, undefined, i * 0.11)
    );
  },
  smash() {
    tone(220, 0.12, "square", 0.06, 90);
    tone(720, 0.06, "square", 0.045, undefined, 0.02);
  },
  slide() {
    tone(90, 0.22, "sawtooth", 0.035, 55);
  },
  boing() {
    tone(150, 0.16, "sine", 0.07, 430);
    tone(430, 0.12, "sine", 0.05, 240, 0.15);
  },
  buddyReady() {
    [880, 1175, 1568].forEach((f, i) =>
      tone(f, 0.12, "sine", 0.05, undefined, i * 0.11)
    );
  },
  buddyCall() {
    [523, 659, 880, 1319].forEach((f, i) =>
      tone(f, 0.09, "square", 0.05, undefined, i * 0.07)
    );
  },
};

// ------------------------------------------------------------- music loop
// A cheerful little pentatonic loop: melody (square) over a bass (triangle).
const STEP_S = 60 / 152 / 2; // 152 bpm, eighth notes
const MELODY: (number | null)[] = [
  0, 4, 7, 9, null, 7, 4, 7, 2, 4, 7, 12, null, 9, 7, 4,
  0, 4, 7, 9, null, 12, 9, 7, 4, 7, 9, 7, 4, 2, null, null,
];
const BASS = [130.81, 130.81, 98.0, 110.0, 130.81, 130.81, 87.31, 98.0]; // C C G A C C F G
const BASE = 523.25; // C5

let musicOn = true;
let timer: number | null = null;
let step = 0;
let nextTime = 0;

function scheduleStep(s: number, t: number) {
  const c = ac();
  const when = t - c.currentTime;
  const m = MELODY[s % MELODY.length];
  if (m !== null) {
    tone(BASE * Math.pow(2, m / 12), 0.16, "square", 0.028, undefined, when);
  }
  if (s % 4 === 0) {
    tone(BASS[(s / 4) % BASS.length], 0.22, "triangle", 0.05, undefined, when);
  }
}

function tick() {
  const c = ac();
  while (nextTime < c.currentTime + 0.35) {
    scheduleStep(step, nextTime);
    step = (step + 1) % (MELODY.length * 4);
    nextTime += STEP_S;
  }
}

export function startMusic() {
  if (!musicOn || timer !== null) return;
  try {
    const c = ac();
    step = 0;
    nextTime = c.currentTime + 0.1;
    timer = window.setInterval(tick, 120);
  } catch {
    // no audio — fine
  }
}

export function stopMusic() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export function toggleMusic(): boolean {
  musicOn = !musicOn;
  if (musicOn) startMusic();
  else stopMusic();
  return musicOn;
}
