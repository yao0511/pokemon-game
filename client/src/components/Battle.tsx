import { useEffect, useRef, useState } from 'react';
import type { BattleState, BattleEvent } from '../types';
import { HpBar, TypeBadge, TeamDots } from './common';
import { sfx, setSoundEnabled, isSoundEnabled } from '../sound';

interface Props {
  state: BattleState;
  log: string[];
  events: BattleEvent[];
  eventSeq: number;
  waitingTurn: boolean;
  opponentActed: boolean;
  onAction: (type: 'move' | 'switch', index: number) => void;
}

const TURN_SECONDS = 30;
type Anim = '' | 'attack' | 'hit' | 'faint';
interface Float {
  id: number;
  mine: boolean;
  text: string;
  kind: 'normal' | 'super' | 'weak';
}

export default function Battle({ state, log, events, eventSeq, waitingTurn, opponentActed, onAction }: Props) {
  const { you, opponent, turn } = state;
  const mySide = you.side;
  const myActive = you.team[you.activeIndex];
  const needsSwitch = you.needsSwitch;
  const opponentSwitching = !needsSwitch && Boolean(opponent?.active?.fainted);
  const blocked = waitingTurn || opponentSwitching;

  const [showSwitch, setShowSwitch] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const [myAnim, setMyAnim] = useState<Anim>('');
  const [oppAnim, setOppAnim] = useState<Anim>('');
  const [floats, setFloats] = useState<Float[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const floatId = useRef(0);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  // 回合 / 強制換場切換時重置計時器
  useEffect(() => {
    setTimeLeft(TURN_SECONDS);
    setShowSwitch(false);
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [turn, needsSwitch]);

  // log 自動捲到底
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // 由 events 播放動畫 + 音效
  useEffect(() => {
    if (!events.length) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setMyAnim('');
    setOppAnim('');

    const at = (fn: () => void, delay: number) => timersRef.current.push(setTimeout(fn, delay));
    const setAnim = (mine: boolean, a: Anim) => (mine ? setMyAnim(a) : setOppAnim(a));
    const addFloat = (mine: boolean, text: string, kind: Float['kind']) => {
      const id = ++floatId.current;
      setFloats((f) => [...f, { id, mine, text, kind }]);
      at(() => setFloats((f) => f.filter((x) => x.id !== id)), 1000);
    };

    let t = 0;
    for (const e of events) {
      const mine = e.side === mySide;
      if (e.kind === 'move') {
        at(() => { setAnim(mine, 'attack'); sfx.attack(); }, t);
        at(() => setAnim(mine, ''), t + 380);
        t += 260;
      } else if (e.kind === 'damage' && e.amount) {
        const eff = e.effectiveness ?? 1;
        at(() => {
          setAnim(mine, 'hit');
          addFloat(mine, `-${e.amount}`, eff > 1 ? 'super' : eff < 1 ? 'weak' : 'normal');
          eff > 1 ? sfx.superEffective() : sfx.hit();
        }, t);
        at(() => setAnim(mine, ''), t + 450);
        t += 650;
      } else if (e.kind === 'recoil' && e.amount) {
        at(() => addFloat(mine, `-${e.amount}`, 'normal'), t);
        t += 200;
      } else if (e.kind === 'faint') {
        at(() => { setAnim(mine, 'faint'); sfx.faint(); }, t);
        t += 500;
      }
    }
    return () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSeq]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) sfx.select();
  }
  function chooseMove(i: number) {
    if (blocked) return;
    sfx.select();
    onAction('move', i);
  }
  function chooseSwitch(i: number) {
    if (i === you.activeIndex || you.team[i].fainted) return;
    if (!needsSwitch && blocked) return;
    sfx.switchIn();
    onAction('switch', i);
    setShowSwitch(false);
  }

  const animClass = (a: Anim, mine: boolean) =>
    a === 'attack' ? (mine ? 'sprite-attack-mine' : 'sprite-attack-opp')
      : a === 'hit' ? 'sprite-hit'
      : a === 'faint' ? 'sprite-faint'
      : '';

  return (
    <div>
      {/* 對手資訊列 */}
      <div className="row" style={{ marginBottom: 8 }}>
        {opponent && (
          <>
            <strong>{opponent.name}</strong>
            <TeamDots status={opponent.teamStatus} />
            {!opponent.connected && <span className="muted">（已斷線）</span>}
          </>
        )}
        <div className="spacer" />
        <button className="ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={toggleSound}>
          {soundOn ? '🔊 音效開' : '🔇 音效關'}
        </button>
      </div>

      {/* 戰場 */}
      <div className="battle-field">
        <div className="field-side opp">
          {opponent?.active && (
            <>
              <div className="sprite-wrap">
                <img className={`sprite battle-sprite ${animClass(oppAnim, false)}`} src={opponent.active.spriteUrl} alt={opponent.active.displayName} />
                {floats.filter((f) => !f.mine).map((f) => (
                  <span key={f.id} className={`dmg-float dmg-${f.kind}`}>{f.text}</span>
                ))}
              </div>
              <div className="mon-info">
                <div className="mon-name"><span>{opponent.active.displayName} Lv.50</span></div>
                <div className="row" style={{ gap: 4 }}>
                  {opponent.active.types.map((t) => <TypeBadge key={t} type={t} />)}
                </div>
                <HpBar current={opponent.active.currentHp} max={opponent.active.maxHp} />
              </div>
            </>
          )}
        </div>

        <div className="field-side mine">
          {myActive && (
            <>
              <div className="mon-info">
                <div className="mon-name"><span>{myActive.displayName} Lv.50</span></div>
                <div className="row" style={{ gap: 4 }}>
                  {myActive.types.map((t) => <TypeBadge key={t} type={t} />)}
                </div>
                <HpBar current={myActive.currentHp} max={myActive.maxHp} />
              </div>
              <div className="sprite-wrap">
                <img className={`sprite battle-sprite mine ${animClass(myAnim, true)}`} src={myActive.spriteUrl} alt={myActive.displayName} />
                {floats.filter((f) => f.mine).map((f) => (
                  <span key={f.id} className={`dmg-float dmg-${f.kind}`}>{f.text}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 行動面板 */}
      <div className="action-panel">
        <div className="timer-bar-bg">
          <div className={`timer-bar-fill ${timeLeft <= 10 ? 'low' : ''}`} style={{ width: `${(timeLeft / TURN_SECONDS) * 100}%` }} />
        </div>

        {needsSwitch ? (
          <>
            <p className="center" style={{ color: 'var(--warn)', margin: '4px 0 10px' }}>
              你的寶可夢倒下了！選擇下一隻：
            </p>
            <SwitchGrid you={you} onPick={chooseSwitch} forced />
          </>
        ) : blocked ? (
          <div className="waiting-status">
            {opponentSwitching ? '對手的寶可夢倒下了，等待對手換場…' : '已出招，等待對手…'}
            {opponentActed && !opponentSwitching && ' ✓ 對手已出招'}
          </div>
        ) : showSwitch ? (
          <>
            <div className="row">
              <strong>換哪一隻上場？</strong>
              <div className="spacer" />
              <button className="ghost" onClick={() => setShowSwitch(false)}>返回</button>
            </div>
            <SwitchGrid you={you} onPick={chooseSwitch} />
          </>
        ) : (
          <>
            <div className="move-grid">
              {myActive?.moves.map((m, i) => (
                <button key={i} className="move-btn" disabled={m.currentPp <= 0} onClick={() => chooseMove(i)}>
                  <span className="move-name"><TypeBadge type={m.type} /> {m.name}</span>
                  <span className="move-meta">
                    <span>{m.power > 0 ? `威力 ${m.power}` : '變化技'}</span>
                    <span>PP {m.currentPp}/{m.pp}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={() => setShowSwitch(true)}>換隊員</button>
              <div className="spacer" />
              <span className={`muted ${timeLeft <= 10 ? 'timer-low-text' : ''}`}>剩餘 {timeLeft}s</span>
            </div>
          </>
        )}
      </div>

      {/* 戰鬥紀錄 */}
      <div className="battle-log">
        {log.map((line, i) =>
          line.startsWith('__TURN__') ? (
            <div key={i} className="log-turn">— 回合 {line.replace('__TURN__', '')} —</div>
          ) : (
            <div key={i} className={`log-line ${lineClass(line)}`}>{line}</div>
          ),
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function lineClass(line: string): string {
  if (line.includes('效果絕佳')) return 'log-super';
  if (line.includes('效果不太好')) return 'log-weak';
  if (line.includes('倒下')) return 'log-faint';
  if (line.includes('沒有命中') || line.includes('沒有效果')) return 'log-miss';
  return '';
}

function SwitchGrid({
  you,
  onPick,
  forced,
}: {
  you: BattleState['you'];
  onPick: (i: number) => void;
  forced?: boolean;
}) {
  return (
    <div className="switch-grid">
      {you.team.map((p, i) => {
        const isActive = i === you.activeIndex;
        const disabled = p.fainted || isActive;
        return (
          <div
            key={i}
            className={`switch-cell ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => !disabled && onPick(i)}
          >
            <img className="sprite" src={p.spriteUrl} alt={p.displayName} />
            <div style={{ flex: 1 }}>
              <div>{p.displayName}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {p.fainted ? '昏厥' : `${p.currentHp}/${p.maxHp}`}
                {isActive && !forced ? '（場上）' : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
