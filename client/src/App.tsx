import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from './socket';
import { fetchPokedex } from './api';
import { sfx, isSoundEnabled } from './sound';
import type { BattleState, BattleEndPayload, BattleEvent, PokedexEntry } from './types';
import Home from './components/Home';
import TeamBuilder from './components/TeamBuilder';
import Battle from './components/Battle';
import Result from './components/Result';

type Screen = 'home' | 'lobby' | 'team' | 'battle' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [pokedex, setPokedex] = useState<PokedexEntry[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opponentName, setOpponentName] = useState('');

  // 選隊階段
  const [teamSubmitted, setTeamSubmitted] = useState(false);
  const [opponentTeamReady, setOpponentTeamReady] = useState(false);

  // 對戰階段
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [events, setEvents] = useState<BattleEvent[]>([]);
  const [eventSeq, setEventSeq] = useState(0);
  const [waitingTurn, setWaitingTurn] = useState(false); // 已送出行動，等結算
  const [opponentActed, setOpponentActed] = useState(false);

  // 結果
  const [result, setResult] = useState<BattleEndPayload | null>(null);
  const [toast, setToast] = useState('');

  const logRef = useRef<string[]>([]);
  const pushLog = useCallback((lines: string[], turn?: number) => {
    const next = [...logRef.current];
    if (turn !== undefined) next.push(`__TURN__${turn}`);
    next.push(...lines);
    logRef.current = next;
    setLog(next);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  // 預載圖鑑
  useEffect(() => {
    fetchPokedex().then(setPokedex).catch((e) => showToast(e.message));
  }, [showToast]);

  // 註冊 socket 事件
  useEffect(() => {
    const onRoomCreated = ({ roomCode }: { roomCode: string }) => {
      setRoomCode(roomCode);
      setIsHost(true);
      setScreen('lobby');
    };
    const onRoomJoined = ({ roomCode }: { roomCode: string }) => {
      setRoomCode(roomCode);
      setScreen('lobby');
    };
    const onOpponentJoined = ({ playerName }: { playerName: string }) => {
      setOpponentName(playerName);
    };
    const onTeamSelectionStart = () => {
      setScreen('team');
      setTeamSubmitted(false);
      setOpponentTeamReady(false);
    };
    const onOpponentReady = () => setOpponentTeamReady(true);
    const onBattleStart = ({ battleState }: { battleState: BattleState }) => {
      logRef.current = [];
      setLog([]);
      setBattleState(battleState);
      setWaitingTurn(false);
      setOpponentActed(false);
      setOpponentName(battleState.opponent?.name ?? opponentName);
      setScreen('battle');
    };
    const onTurnResult = ({ log: lines, events: evts, battleState }: { log: string[]; events?: BattleEvent[]; battleState: BattleState }) => {
      setBattleState(battleState);
      if (evts && evts.length) {
        setEvents(evts);
        setEventSeq((s) => s + 1);
      }
      pushLog(lines, battleState.turn - 1 >= 0 ? battleState.turn : undefined);
      setWaitingTurn(false);
      setOpponentActed(false);
    };
    const onForceSwitch = ({ battleState }: { battleState: BattleState }) => {
      setBattleState(battleState);
      setWaitingTurn(false);
    };
    const onOpponentActionSubmitted = () => setOpponentActed(true);
    const onBattleEnd = (payload: BattleEndPayload) => {
      setResult(payload);
      setScreen('result');
      if (isSoundEnabled()) (payload.winner === 'you' ? sfx.win : payload.winner === 'opponent' ? sfx.lose : sfx.select)();
    };
    const onOpponentDisconnected = () => showToast('對手已斷線');
    const onError = ({ message }: { message: string }) => showToast(message);

    socket.on('room_created', onRoomCreated);
    socket.on('room_joined', onRoomJoined);
    socket.on('opponent_joined', onOpponentJoined);
    socket.on('team_selection_start', onTeamSelectionStart);
    socket.on('opponent_ready', onOpponentReady);
    socket.on('battle_start', onBattleStart);
    socket.on('turn_result', onTurnResult);
    socket.on('force_switch', onForceSwitch);
    socket.on('opponent_action_submitted', onOpponentActionSubmitted);
    socket.on('battle_end', onBattleEnd);
    socket.on('opponent_disconnected', onOpponentDisconnected);
    socket.on('error_msg', onError);

    return () => {
      socket.off('room_created', onRoomCreated);
      socket.off('room_joined', onRoomJoined);
      socket.off('opponent_joined', onOpponentJoined);
      socket.off('team_selection_start', onTeamSelectionStart);
      socket.off('opponent_ready', onOpponentReady);
      socket.off('battle_start', onBattleStart);
      socket.off('turn_result', onTurnResult);
      socket.off('force_switch', onForceSwitch);
      socket.off('opponent_action_submitted', onOpponentActionSubmitted);
      socket.off('battle_end', onBattleEnd);
      socket.off('opponent_disconnected', onOpponentDisconnected);
      socket.off('error_msg', onError);
    };
  }, [pushLog, showToast, opponentName]);

  // ===== 動作 =====
  const handleCreate = (name: string) => {
    socket.emit('create_room', { playerName: name });
  };
  const handleJoin = (code: string, name: string) => {
    socket.emit('join_room', { roomCode: code.toUpperCase(), playerName: name });
  };
  const handleSubmitTeam = (ids: number[]) => {
    socket.emit('submit_team', { team: ids });
    setTeamSubmitted(true);
  };
  const handleAction = (type: 'move' | 'switch', index: number) => {
    socket.emit('submit_action', { type, index });
    if (battleState?.you.needsSwitch) {
      setWaitingTurn(false); // 換場後等對手/下一回合
    } else {
      setWaitingTurn(true);
    }
  };
  const handleBackHome = () => {
    socket.disconnect();
    socket.connect();
    setScreen('home');
    setRoomCode('');
    setIsHost(false);
    setOpponentName('');
    setBattleState(null);
    setResult(null);
    setTeamSubmitted(false);
    setOpponentTeamReady(false);
    logRef.current = [];
    setLog([]);
  };

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      {screen === 'home' && <Home onCreate={handleCreate} onJoin={handleJoin} />}

      {screen === 'lobby' && (
        <Lobby roomCode={roomCode} isHost={isHost} opponentName={opponentName} />
      )}

      {screen === 'team' && (
        <TeamBuilder
          pokedex={pokedex}
          submitted={teamSubmitted}
          opponentReady={opponentTeamReady}
          onSubmit={handleSubmitTeam}
        />
      )}

      {screen === 'battle' && battleState && (
        <Battle
          state={battleState}
          log={log}
          events={events}
          eventSeq={eventSeq}
          waitingTurn={waitingTurn}
          opponentActed={opponentActed}
          onAction={handleAction}
        />
      )}

      {screen === 'result' && result && (
        <Result result={result} log={log} onBackHome={handleBackHome} />
      )}
    </div>
  );
}

function Lobby({ roomCode, isHost, opponentName }: { roomCode: string; isHost: boolean; opponentName: string }) {
  return (
    <div className="home-card panel col center" style={{ marginTop: 60 }}>
      <h2>等待室</h2>
      {isHost ? (
        <>
          <p className="muted">把房間碼分享給對手：</p>
          <div className="room-code-big">{roomCode}</div>
          <p className="muted">
            {opponentName ? `${opponentName} 已加入，準備開始…` : '等待對手加入…'}
          </p>
        </>
      ) : (
        <p className="muted">已加入房間 {roomCode}，等待開始…</p>
      )}
    </div>
  );
}
