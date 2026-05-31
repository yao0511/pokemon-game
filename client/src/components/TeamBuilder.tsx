import { useMemo, useState } from 'react';
import type { PokedexEntry, PokemonType } from '../types';
import { TypeBadge, ALL_TYPES, TYPE_LABELS } from './common';

interface Props {
  pokedex: PokedexEntry[];
  submitted: boolean;
  opponentReady: boolean;
  onSubmit: (ids: number[]) => void;
}

const MAX_TEAM = 6;
const STAT_LABELS: [keyof PokedexEntry['baseStats'], string][] = [
  ['hp', 'HP'], ['attack', '攻擊'], ['defense', '防禦'],
  ['specialAttack', '特攻'], ['specialDefense', '特防'], ['speed', '速度'],
];

export default function TeamBuilder({ pokedex, submitted, opponentReady, onSubmit }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState<PokemonType | 'all'>('all');
  const [detailId, setDetailId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return pokedex;
    return pokedex.filter((p) => p.types.includes(filter));
  }, [pokedex, filter]);

  const detail = detailId != null ? pokedex.find((p) => p.id === detailId) ?? null : null;
  const byId = (id: number) => pokedex.find((p) => p.id === id);

  function toggle(id: number) {
    setDetailId(id);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_TEAM) return prev;
      return [...prev, id];
    });
  }

  if (submitted) {
    return (
      <div className="home-card panel col center" style={{ marginTop: 60 }}>
        <h2>隊伍已送出</h2>
        <p className="muted">{opponentReady ? '對手也準備好了，即將開戰！' : '等待對手選擇隊伍…'}</p>
        <div className="row center" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {selected.map((id) => {
            const p = byId(id);
            return p ? <img key={id} className="sprite" src={p.spriteUrl} width={56} height={56} alt={p.displayName} /> : null;
          })}
        </div>
      </div>
    );
  }

  if (pokedex.length === 0) {
    return <div className="center muted" style={{ marginTop: 80 }}>圖鑑載入中…</div>;
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>選擇你的隊伍</h2>
        <div className="spacer" />
        <span className="pixel" style={{ color: selected.length === MAX_TEAM ? 'var(--good)' : 'var(--accent)' }}>
          {selected.length} / {MAX_TEAM}
        </span>
      </div>

      <div className="filter-bar">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
        {ALL_TYPES.map((t) => (
          <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="team-layout">
        <div className="panel">
          <div className="dex-grid">
            {filtered.map((p) => {
              const isSel = selected.includes(p.id);
              const disabled = !isSel && selected.length >= MAX_TEAM;
              return (
                <div
                  key={p.id}
                  className={`dex-cell ${isSel ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => toggle(p.id)}
                >
                  <div className="dex-id">#{String(p.id).padStart(3, '0')}</div>
                  <img className="sprite" src={p.spriteUrl} alt={p.displayName} loading="lazy" />
                  <div className="dex-name">{p.displayName}</div>
                  <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
                    {p.types.map((t) => <TypeBadge key={t} type={t} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="col">
          <div className="panel col" style={{ gap: 8 }}>
            <strong>我的隊伍</strong>
            {Array.from({ length: MAX_TEAM }).map((_, i) => {
              const id = selected[i];
              const p = id != null ? byId(id) : null;
              return (
                <div className="team-slot" key={i}>
                  {p ? (
                    <>
                      <img className="sprite" src={p.spriteUrl} alt={p.displayName} />
                      <span style={{ flex: 1 }}>{p.displayName}</span>
                      <button onClick={() => toggle(p.id)}>✕</button>
                    </>
                  ) : (
                    <span className="slot-empty">空位 {i + 1}</span>
                  )}
                </div>
              );
            })}
            <button
              className="primary"
              disabled={selected.length === 0}
              onClick={() => onSubmit(selected)}
            >
              {selected.length === MAX_TEAM ? '確認出戰！' : `確認出戰（${selected.length} 隻）`}
            </button>
          </div>

          {detail && (
            <div className="panel col" style={{ gap: 6 }}>
              <div className="row">
                <img className="sprite" src={detail.spriteUrl} width={56} height={56} alt={detail.displayName} />
                <div>
                  <strong>{detail.displayName}</strong>
                  <div className="row" style={{ gap: 4 }}>
                    {detail.types.map((t) => <TypeBadge key={t} type={t} />)}
                  </div>
                </div>
              </div>
              <div className="col" style={{ gap: 4 }}>
                {STAT_LABELS.map(([key, label]) => (
                  <div className="stat-row" key={key}>
                    <span className="stat-label">{label}</span>
                    <div className="stat-bar-bg">
                      <div className="stat-bar-fill" style={{ width: `${(detail.baseStats[key] / 200) * 100}%` }} />
                    </div>
                    <span style={{ width: 28, textAlign: 'right' }}>{detail.baseStats[key]}</span>
                  </div>
                ))}
              </div>
              <div>
                <strong style={{ fontSize: 13 }}>預設技能</strong>
                <div className="col" style={{ gap: 2, marginTop: 4 }}>
                  {detail.availableMoves.slice(0, 4).map((m, i) => (
                    <div key={i} className="row" style={{ gap: 6, fontSize: 12 }}>
                      <TypeBadge type={m.type} />
                      <span>{m.name}</span>
                      <span className="spacer" />
                      <span className="muted">{m.power > 0 ? `威力 ${m.power}` : '變化'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
