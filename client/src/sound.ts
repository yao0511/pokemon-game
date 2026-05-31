// 用 Web Audio 合成簡單音效（不依賴外部素材）

let ctx: AudioContext | null = null;
let enabled = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (v) getCtx()?.resume();
}
export function isSoundEnabled() {
  return enabled;
}

interface ToneOpts {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  sweepTo?: number; // 頻率掃頻終點
}

function tone({ freq, duration, type = 'square', gain = 0.06, sweepTo }: ToneOpts, startAt = 0) {
  const c = getCtx();
  if (!c || !enabled) return;
  const t0 = c.currentTime + startAt;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

export const sfx = {
  attack: () => tone({ freq: 220, sweepTo: 440, duration: 0.12, type: 'sawtooth', gain: 0.05 }),
  hit: () => tone({ freq: 160, sweepTo: 60, duration: 0.18, type: 'square', gain: 0.07 }),
  superEffective: () => {
    tone({ freq: 300, sweepTo: 90, duration: 0.22, type: 'square', gain: 0.08 });
    tone({ freq: 500, duration: 0.1, type: 'sawtooth', gain: 0.04 }, 0.02);
  },
  faint: () => tone({ freq: 400, sweepTo: 70, duration: 0.5, type: 'triangle', gain: 0.07 }),
  switchIn: () => tone({ freq: 500, sweepTo: 700, duration: 0.1, type: 'sine', gain: 0.05 }),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, duration: 0.16, type: 'square', gain: 0.06 }, i * 0.13));
  },
  lose: () => {
    [392, 330, 262].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'triangle', gain: 0.06 }, i * 0.18));
  },
  select: () => tone({ freq: 660, duration: 0.05, type: 'sine', gain: 0.04 }),
};
