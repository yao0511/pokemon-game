import type { BattleMove, BattlePokemon, PokemonType } from '../types.js';
import { getTypeEffectiveness } from '../data/typeChart.js';
import { LEVEL } from './stats.js';

/**
 * 第一世代以「屬性」決定物理／特殊：
 * 火、水、草、電、冰、超能力、龍 → 特殊；其餘 → 物理。
 */
const SPECIAL_TYPES = new Set<PokemonType>([
  'fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon',
]);

export function isSpecialType(type: PokemonType): boolean {
  return SPECIAL_TYPES.has(type);
}

export interface DamageResult {
  damage: number;
  effectiveness: number; // 屬性倍率
  stab: boolean;         // 是否有同屬性加成
  missed: boolean;       // 是否未命中
  isStatus: boolean;     // 是否為變化技（無傷害）
}

export interface DamageOptions {
  /** 注入隨機數（0~1）以利測試；預設用 Math.random */
  rng?: () => number;
  /** Struggle（掙扎）等 typeless 攻擊：無視屬性相剋與 STAB，必中 */
  typeless?: boolean;
}

/**
 * 計算一次攻擊的傷害。
 *
 * damage = floor((2*L/5 + 2) * power * (atk/def) / 50 + 2)
 *          * effectiveness * stab * random(0.85~1.00)
 */
export function calculateDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattleMove,
  opts: DamageOptions = {},
): DamageResult {
  const rng = opts.rng ?? Math.random;

  // 變化技：無直接傷害
  if (move.damageClass === 'status' || move.power <= 0) {
    return { damage: 0, effectiveness: 1, stab: false, missed: false, isStatus: true };
  }

  // 命中判定（accuracy 為 0 或 typeless 視為必中）
  const accuracy = move.accuracy > 0 ? move.accuracy : 100;
  const missed = !opts.typeless && rng() * 100 >= accuracy;
  if (missed) {
    return { damage: 0, effectiveness: 1, stab: false, missed: true, isStatus: false };
  }

  const special = isSpecialType(move.type);
  const atk = special ? attacker.stats.specialAttack : attacker.stats.attack;
  const def = special ? defender.stats.specialDefense : defender.stats.defense;

  const base = Math.floor(((2 * LEVEL) / 5 + 2) * move.power * (atk / def) / 50) + 2;

  const effectiveness = opts.typeless ? 1 : getTypeEffectiveness(move.type, defender.types);
  const stab = !opts.typeless && attacker.types.includes(move.type);
  const stabMult = stab ? 1.5 : 1.0;
  const randomMult = 0.85 + rng() * 0.15; // 0.85 ~ 1.00

  // 屬性無效時直接 0 傷害
  if (effectiveness === 0) {
    return { damage: 0, effectiveness: 0, stab, missed: false, isStatus: false };
  }

  const damage = Math.max(1, Math.floor(base * effectiveness * stabMult * randomMult));

  return { damage, effectiveness, stab, missed: false, isStatus: false };
}
