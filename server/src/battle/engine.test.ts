import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTypeEffectiveness } from '../data/typeChart.js';
import { computeStats } from './stats.js';
import { calculateDamage, isSpecialType } from './damage.js';
import { resolveTurn, type BattleSide } from './engine.js';
import type { BattleMove, BattlePokemon, Stats } from '../types.js';

// ---- 屬性相剋 ----
test('屬性相剋：水打火 2 倍', () => {
  assert.equal(getTypeEffectiveness('water', ['fire']), 2);
});
test('屬性相剋：電打地面 0 倍（無效）', () => {
  assert.equal(getTypeEffectiveness('electric', ['ground']), 0);
});
test('屬性相剋：雙屬性相乘（草打 水/地 = 2*2 = 4）', () => {
  assert.equal(getTypeEffectiveness('grass', ['water', 'ground']), 4);
});
test('屬性相剋：一般打幽靈 0 倍', () => {
  assert.equal(getTypeEffectiveness('normal', ['ghost']), 0);
});
test('第一世代特性：毒打蟲 2 倍', () => {
  assert.equal(getTypeEffectiveness('poison', ['bug']), 2);
});

// ---- 能力值換算 ----
test('能力值換算：base 100 → Lv.50 HP/攻擊', () => {
  const base: Stats = { hp: 100, attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 };
  const s = computeStats(base);
  assert.equal(s.hp, 160); // 100*100/100 + 50 + 10 = 100+60
  assert.equal(s.attack, 105); // 100 + 5
});

// ---- 物理/特殊判定 ----
test('第一世代屬性決定特殊：fire 是特殊、normal 是物理', () => {
  assert.equal(isSpecialType('fire'), true);
  assert.equal(isSpecialType('normal'), false);
});

// ---- 測試用工廠 ----
function mkMon(over: Partial<BattlePokemon> = {}): BattlePokemon {
  const stats: Stats = { hp: 160, attack: 105, defense: 105, specialAttack: 105, specialDefense: 105, speed: 100 };
  return {
    speciesId: 1, name: 'test', displayName: 'Test', types: ['normal'],
    stats, maxHp: stats.hp, currentHp: stats.hp, spriteUrl: '', moves: [], fainted: false,
    ...over,
  };
}
function mkMove(over: Partial<BattleMove> = {}): BattleMove {
  return { name: 'Tackle', type: 'normal', power: 40, damageClass: 'physical', pp: 35, accuracy: 100, currentPp: 35, ...over };
}

// ---- 傷害計算 ----
test('傷害計算：必中時造成正數傷害、扣除目標 HP', () => {
  const atk = mkMon({ types: ['fire'] });
  const def = mkMon({ types: ['grass'] });
  const move = mkMove({ type: 'fire', power: 90, damageClass: 'special' });
  const r = calculateDamage(atk, def, move, { rng: () => 0.99 });
  assert.equal(r.missed, false);
  assert.equal(r.stab, true); // fire 打 fire 屬性使用者 → STAB
  assert.equal(r.effectiveness, 2); // fire 打 grass
  assert.ok(r.damage > 0);
});

test('傷害計算：無效屬性傷害為 0', () => {
  const atk = mkMon();
  const def = mkMon({ types: ['ghost'] });
  const move = mkMove({ type: 'normal', power: 50 });
  const r = calculateDamage(atk, def, move, { rng: () => 0.99 });
  assert.equal(r.damage, 0);
  assert.equal(r.effectiveness, 0);
});

test('傷害計算：未命中', () => {
  const atk = mkMon();
  const def = mkMon();
  const move = mkMove({ accuracy: 50 });
  const r = calculateDamage(atk, def, move, { rng: () => 0.99 }); // 0.99*100=99 >= 50 → miss
  assert.equal(r.missed, true);
});

// ---- 回合結算 ----
test('回合結算：較快者先攻', () => {
  const fast = mkMon({ displayName: 'Fast', stats: { ...mkMon().stats, speed: 200 }, moves: [mkMove({ power: 200, type: 'normal' })] });
  const slow = mkMon({ displayName: 'Slow', stats: { ...mkMon().stats, speed: 10 }, moves: [mkMove({ power: 200, type: 'normal' })] });
  const sides: [BattleSide, BattleSide] = [
    { team: [fast], activeIndex: 0 },
    { team: [slow], activeIndex: 0 },
  ];
  const res = resolveTurn(sides, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }], () => 0.99);
  const firstMove = res.events.find((e) => e.kind === 'move');
  assert.equal(firstMove?.side, 0); // Fast (side 0) 先動
});

test('回合結算：換場優先於攻擊', () => {
  const a1 = mkMon({ displayName: 'A1', moves: [mkMove()] });
  const a2 = mkMon({ displayName: 'A2', moves: [mkMove()] });
  const b1 = mkMon({ displayName: 'B1', stats: { ...mkMon().stats, speed: 1 }, moves: [mkMove({ power: 100 })] });
  const sides: [BattleSide, BattleSide] = [
    { team: [a1, a2], activeIndex: 0 },
    { team: [b1], activeIndex: 0 },
  ];
  const res = resolveTurn(sides, [{ type: 'switch', index: 1 }, { type: 'move', index: 0 }], () => 0.99);
  assert.equal(sides[0].activeIndex, 1); // A 換成 A2
  const switchIdx = res.events.findIndex((e) => e.kind === 'switch');
  const moveIdx = res.events.findIndex((e) => e.kind === 'move');
  assert.ok(switchIdx >= 0 && switchIdx < moveIdx); // 換場事件在攻擊之前
});

test('回合結算：擊倒對方唯一寶可夢 → 結束並判勝', () => {
  const killer = mkMon({ displayName: 'Killer', stats: { ...mkMon().stats, speed: 200 }, moves: [mkMove({ power: 250, type: 'normal' })] });
  const victim = mkMon({ displayName: 'Victim', currentHp: 1, maxHp: 160, stats: { ...mkMon().stats, speed: 1 }, moves: [mkMove()] });
  const sides: [BattleSide, BattleSide] = [
    { team: [killer], activeIndex: 0 },
    { team: [victim], activeIndex: 0 },
  ];
  const res = resolveTurn(sides, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }], () => 0.99);
  assert.equal(res.ended, true);
  assert.equal(res.winner, 0);
});

test('Struggle（掙扎）對幽靈系仍有效（typeless，避免無限循環）', () => {
  // 攻方所有技能無 PP → 觸發 Struggle；防方為幽靈系
  const noPpMove = mkMove({ currentPp: 0 });
  const attacker = mkMon({ displayName: 'Atk', stats: { ...mkMon().stats, speed: 200 }, moves: [noPpMove] });
  const ghost = mkMon({ displayName: 'Ghost', types: ['ghost'], stats: { ...mkMon().stats, speed: 1 }, moves: [mkMove({ currentPp: 5 })] });
  const sides: [BattleSide, BattleSide] = [
    { team: [attacker], activeIndex: 0 },
    { team: [ghost], activeIndex: 0 },
  ];
  const res = resolveTurn(sides, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }], () => 0.99);
  const dmg = res.events.find((e) => e.kind === 'damage' && e.side === 1 && e.amount > 0);
  assert.ok(dmg, 'Struggle 應對幽靈系造成傷害');
  assert.ok(ghost.currentHp < ghost.maxHp, '幽靈系應受到傷害');
});

test('回合結算：昏厥但隊伍尚有存活 → 需強制換場', () => {
  const killer = mkMon({ displayName: 'Killer', stats: { ...mkMon().stats, speed: 200 }, moves: [mkMove({ power: 250, type: 'normal' })] });
  const victim = mkMon({ displayName: 'Victim', currentHp: 1, stats: { ...mkMon().stats, speed: 1 }, moves: [mkMove()] });
  const backup = mkMon({ displayName: 'Backup' });
  const sides: [BattleSide, BattleSide] = [
    { team: [killer], activeIndex: 0 },
    { team: [victim, backup], activeIndex: 0 },
  ];
  const res = resolveTurn(sides, [{ type: 'move', index: 0 }, { type: 'move', index: 0 }], () => 0.99);
  assert.equal(res.ended, false);
  assert.deepEqual(res.needsSwitch, [1]);
});
