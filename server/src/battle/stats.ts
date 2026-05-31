import type { Stats } from '../types.js';

/** 固定等級 */
export const LEVEL = 50;

/**
 * 將 base stats 換算為 Lv.50 的實際能力值（IV/EV 視為 0，性格中性）。
 * HP   = floor(base * 2 * L / 100) + L + 10
 * 其他 = floor(base * 2 * L / 100) + 5
 */
export function computeStats(base: Stats): Stats {
  const common = (b: number) => Math.floor((b * 2 * LEVEL) / 100) + 5;
  return {
    hp: Math.floor((base.hp * 2 * LEVEL) / 100) + LEVEL + 10,
    attack: common(base.attack),
    defense: common(base.defense),
    specialAttack: common(base.specialAttack),
    specialDefense: common(base.specialDefense),
    speed: common(base.speed),
  };
}
