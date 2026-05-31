import type { PokemonType } from '../types';

export const TYPE_LABELS: Record<PokemonType, string> = {
  normal: '一般', fire: '火', water: '水', electric: '電', grass: '草',
  ice: '冰', fighting: '格鬥', poison: '毒', ground: '地面', flying: '飛行',
  psychic: '超能力', bug: '蟲', rock: '岩石', ghost: '幽靈', dragon: '龍',
};

export const ALL_TYPES: PokemonType[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
];

export function TypeBadge({ type }: { type: PokemonType }) {
  return <span className={`type-badge type-${type}`}>{TYPE_LABELS[type]}</span>;
}

/** HP 條：依血量比例變色 */
export function HpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? '#4caf50' : pct > 20 ? '#ff9800' : '#e84545';
  return (
    <div className="hp-row">
      <span className="hp-label">HP</span>
      <div className="hp-bar-bg">
        <div className="hp-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="hp-text">{current}/{max}</span>
    </div>
  );
}

/** 隊伍存活點（6 點） */
export function TeamDots({ status }: { status: { fainted: boolean }[] }) {
  return (
    <div className="team-dots">
      {status.map((s, i) => (
        <div key={i} className={`team-dot ${s.fainted ? 'fainted' : ''}`} title={s.fainted ? '昏厥' : '健康'} />
      ))}
    </div>
  );
}
