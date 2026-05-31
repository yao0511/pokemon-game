import type { BattleEndPayload } from '../types';

interface Props {
  result: BattleEndPayload;
  log: string[];
  onBackHome: () => void;
}

export default function Result({ result, log, onBackHome }: Props) {
  const { winner, stats } = result;
  const isWin = winner === 'you';
  const isDraw = winner === 'draw';

  const banner = isDraw ? '平手！' : isWin ? '勝利！' : '戰敗…';

  return (
    <div>
      <div className={`result-banner ${isWin ? 'result-win' : 'result-lose'}`}>{banner}</div>

      <div className="home-card panel col center">
        {stats.reason === 'opponent_disconnected' && (
          <p className="muted">對手已斷線，你獲得勝利。</p>
        )}
        {stats.yourAlive !== undefined && (
          <p className="muted">
            你方剩餘 {stats.yourAlive} 隻 · 對方剩餘 {stats.opponentAlive} 隻
          </p>
        )}
        <button className="primary" onClick={onBackHome}>回首頁再來一局</button>
      </div>

      <div className="battle-log" style={{ height: 200, marginTop: 16 }}>
        {log.map((line, i) =>
          line.startsWith('__TURN__') ? (
            <div key={i} className="log-turn">— 回合 {line.replace('__TURN__', '')} —</div>
          ) : (
            <div key={i} className="log-line">{line}</div>
          ),
        )}
      </div>
    </div>
  );
}
