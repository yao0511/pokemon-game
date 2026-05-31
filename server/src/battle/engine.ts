import type { Action, BattleMove, BattlePokemon, PokemonSpecies } from '../types.js';
import { getSpecies } from '../data/pokeapi.js';
import { computeStats } from './stats.js';
import { calculateDamage } from './damage.js';

// ===== 建立戰鬥寶可夢 =====

/** Struggle（掙扎）：所有技能無 PP 時使用 */
const STRUGGLE: BattleMove = {
  name: 'Struggle',
  type: 'normal',
  power: 50,
  damageClass: 'physical',
  pp: 1,
  accuracy: 100,
  currentPp: 1,
};

/**
 * 由圖鑑建立一隻戰鬥寶可夢。
 * @param moveIndices 從 species.availableMoves 選的技能索引（最多 4 個）；未指定則取前 4。
 */
export function buildBattlePokemon(speciesId: number, moveIndices?: number[]): BattlePokemon {
  const species = getSpecies(speciesId);
  if (!species) throw new Error(`找不到寶可夢 #${speciesId}`);

  const indices = (moveIndices && moveIndices.length > 0
    ? moveIndices
    : species.availableMoves.slice(0, 4).map((_, i) => i)
  ).slice(0, 4);

  const moves: BattleMove[] = indices
    .map((i) => species.availableMoves[i])
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({ ...m, currentPp: m.pp }));

  // 保底：若沒有任何技能，給 Struggle
  if (moves.length === 0) moves.push({ ...STRUGGLE });

  const stats = computeStats(species.baseStats);
  return {
    speciesId: species.id,
    name: species.name,
    displayName: species.displayName,
    types: species.types,
    stats,
    maxHp: stats.hp,
    currentHp: stats.hp,
    spriteUrl: species.spriteUrl,
    moves,
    fainted: false,
  };
}

// ===== 回合結算 =====

export interface BattleSide {
  team: BattlePokemon[];
  activeIndex: number;
}

export type BattleEvent =
  | { kind: 'switch'; side: number; toName: string; message: string }
  | { kind: 'move'; side: number; userName: string; moveName: string; message: string }
  | { kind: 'damage'; side: number; targetName: string; amount: number; effectiveness: number; message: string }
  | { kind: 'miss'; side: number; message: string }
  | { kind: 'noeffect'; side: number; message: string }
  | { kind: 'faint'; side: number; pokemonName: string; message: string }
  | { kind: 'recoil'; side: number; amount: number; message: string };

export interface TurnResult {
  events: BattleEvent[];
  needsSwitch: number[]; // 本回合昏厥、且隊伍尚有存活、需強制換場的 side
  ended: boolean;
  winner: number | null; // 勝方 side，平手為 null 且 ended=true
}

export interface RngLike {
  (): number;
}

function hasAlive(side: BattleSide): boolean {
  return side.team.some((p) => !p.fainted);
}

function active(side: BattleSide): BattlePokemon {
  return side.team[side.activeIndex];
}

function resolveSwitch(side: BattleSide, sideIndex: number, action: Extract<Action, { type: 'switch' }>, events: BattleEvent[]) {
  const target = side.team[action.index];
  if (!target || target.fainted || action.index === side.activeIndex) return; // 非法換場，忽略
  side.activeIndex = action.index;
  events.push({
    kind: 'switch',
    side: sideIndex,
    toName: target.displayName,
    message: `換上了 ${target.displayName}！`,
  });
}

function resolveMove(
  attackerSide: BattleSide,
  defenderSide: BattleSide,
  atkIndex: number,
  defIndex: number,
  action: Extract<Action, { type: 'move' }>,
  events: BattleEvent[],
  rng: RngLike,
) {
  const attacker = active(attackerSide);
  const defender = active(defenderSide);
  if (attacker.fainted) return; // 本回合稍早被打昏，無法行動

  // 選技能：無 PP 時退而求其次，全無 PP 用 Struggle
  let move = attacker.moves[action.index];
  if (!move || move.currentPp <= 0) {
    move = attacker.moves.find((m) => m.currentPp > 0) ?? { ...STRUGGLE };
  }
  const isStruggle = move.name === 'Struggle';
  if (!isStruggle) move.currentPp = Math.max(0, move.currentPp - 1);

  events.push({
    kind: 'move',
    side: atkIndex,
    userName: attacker.displayName,
    moveName: move.name,
    message: `${attacker.displayName} 使用了 ${move.name}！`,
  });

  const result = calculateDamage(attacker, defender, move, { rng, typeless: isStruggle });

  if (result.isStatus) {
    // 基礎版：變化技不實作具體效果
    events.push({ kind: 'damage', side: defIndex, targetName: defender.displayName, amount: 0, effectiveness: 1, message: `（變化技尚未實作效果）` });
    return;
  }
  if (result.missed) {
    events.push({ kind: 'miss', side: atkIndex, message: `但是沒有命中！` });
    return;
  }
  if (result.effectiveness === 0) {
    events.push({ kind: 'noeffect', side: defIndex, message: `對 ${defender.displayName} 沒有效果…` });
    return;
  }

  defender.currentHp = Math.max(0, defender.currentHp - result.damage);
  let effMsg = '';
  if (result.effectiveness > 1) effMsg = ' 效果絕佳！';
  else if (result.effectiveness < 1) effMsg = ' 效果不太好…';
  events.push({
    kind: 'damage',
    side: defIndex,
    targetName: defender.displayName,
    amount: result.damage,
    effectiveness: result.effectiveness,
    message: `${defender.displayName} 受到 ${result.damage} 點傷害！${effMsg}`,
  });

  // Struggle 反傷（造成傷害的 1/4）
  if (isStruggle) {
    const recoil = Math.max(1, Math.floor(result.damage / 4));
    attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
    events.push({ kind: 'recoil', side: atkIndex, amount: recoil, message: `${attacker.displayName} 受到 ${recoil} 點反作用力傷害！` });
    if (attacker.currentHp === 0) {
      attacker.fainted = true;
      events.push({ kind: 'faint', side: atkIndex, pokemonName: attacker.displayName, message: `${attacker.displayName} 倒下了！` });
    }
  }

  if (defender.currentHp === 0) {
    defender.fainted = true;
    events.push({ kind: 'faint', side: defIndex, pokemonName: defender.displayName, message: `${defender.displayName} 倒下了！` });
  }
}

/**
 * 結算一個回合。會就地修改 sides。
 * @param sides [side0, side1]
 * @param actions [side0 的行動, side1 的行動]
 */
export function resolveTurn(
  sides: [BattleSide, BattleSide],
  actions: [Action, Action],
  rng: RngLike = Math.random,
): TurnResult {
  const events: BattleEvent[] = [];

  // 換場優先：先處理所有 switch
  for (let i = 0; i < 2; i++) {
    const a = actions[i];
    if (a.type === 'switch') resolveSwitch(sides[i], i, a, events);
  }

  // 攻擊：依速度排序，速度相同隨機
  const movers: number[] = [0, 1].filter((i) => actions[i].type === 'move');
  movers.sort((x, y) => {
    const sx = active(sides[x]).stats.speed;
    const sy = active(sides[y]).stats.speed;
    if (sx !== sy) return sy - sx;
    return rng() < 0.5 ? -1 : 1;
  });

  for (const i of movers) {
    if (!hasAlive(sides[0]) || !hasAlive(sides[1])) break;
    const opp = i === 0 ? 1 : 0;
    resolveMove(sides[i], sides[opp], i, opp, actions[i] as Extract<Action, { type: 'move' }>, events, rng);
  }

  // 判定勝負與強制換場
  const aliveA = hasAlive(sides[0]);
  const aliveB = hasAlive(sides[1]);
  if (!aliveA || !aliveB) {
    const winner = aliveA && !aliveB ? 0 : !aliveA && aliveB ? 1 : null;
    return { events, needsSwitch: [], ended: true, winner };
  }

  const needsSwitch: number[] = [];
  for (let i = 0; i < 2; i++) {
    if (active(sides[i]).fainted) needsSwitch.push(i);
  }

  return { events, needsSwitch, ended: false, winner: null };
}
