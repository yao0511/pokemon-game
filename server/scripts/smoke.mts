// 端到端煙霧測試：模擬兩個玩家完整打一局
import { io, type Socket } from 'socket.io-client';

const URL = 'http://localhost:3001';
const TEAM = [25, 6, 9, 3, 65, 94]; // 皮卡丘、噴火龍、水箭龜、妙蛙花、胡地、耿鬼

function connect(): Socket {
  return io(URL, { transports: ['websocket'], forceNew: true });
}

function pickAction(state: any): { type: 'move' | 'switch'; index: number } {
  const me = state.you;
  // 強制換場：換第一個未昏厥
  if (me.needsSwitch) {
    const idx = me.team.findIndex((p: any, i: number) => !p.fainted && i !== me.activeIndex);
    return { type: 'switch', index: idx >= 0 ? idx : 0 };
  }
  // 否則用第一個有 PP 的技能
  const active = me.team[me.activeIndex];
  const mi = active.moves.findIndex((m: any) => m.currentPp > 0);
  return { type: 'move', index: mi >= 0 ? mi : 0 };
}

async function main() {
  const p1 = connect();
  const p2 = connect();
  let roomCode = '';
  let turns = 0;
  let ended = false;

  const done = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('測試逾時（30s）')), 30_000);

    function finish(msg: string) {
      clearTimeout(timeout);
      console.log(msg);
      p1.close();
      p2.close();
      resolve();
    }

    p1.on('connect', () => p1.emit('create_room', { playerName: '小智' }));
    p1.on('room_created', ({ roomCode: code }) => {
      roomCode = code;
      console.log(`[p1] 建立房間：${code}`);
      p2.emit('join_room', { roomCode: code, playerName: '小茂' });
    });

    p2.on('room_joined', ({ roomCode }) => console.log(`[p2] 加入房間：${roomCode}`));
    p1.on('opponent_joined', ({ playerName }) => console.log(`[p1] 對手加入：${playerName}`));

    let teamsSubmitted = false;
    function submitTeams() {
      if (teamsSubmitted) return;
      teamsSubmitted = true;
      console.log('[both] 雙方提交隊伍');
      p1.emit('submit_team', { team: TEAM });
      p2.emit('submit_team', { team: TEAM });
    }
    p1.on('team_selection_start', submitTeams);

    p1.on('battle_start', (s) => {
      console.log(`[p1] 戰鬥開始！回合 ${s.turnNumber}`);
      p1.emit('submit_action', pickAction(s.battleState));
    });
    p2.on('battle_start', (s) => {
      p2.emit('submit_action', pickAction(s.battleState));
    });

    p1.on('turn_result', ({ log, battleState }) => {
      if (ended) return;
      turns++;
      const t = battleState.turn;
      console.log(`--- 回合 ${t - 1} ---`);
      log.forEach((l: string) => console.log('   ' + l));
      if (turns > 200) return finish('⚠️ 回合過多，中止');
      // 下一步行動
      p1.emit('submit_action', pickAction(battleState));
    });
    p2.on('turn_result', ({ battleState }) => {
      if (ended) return;
      p2.emit('submit_action', pickAction(battleState));
    });

    // 強制換場
    p1.on('force_switch', ({ battleState }) => p1.emit('submit_action', pickAction(battleState)));
    p2.on('force_switch', ({ battleState }) => p2.emit('submit_action', pickAction(battleState)));

    p1.on('battle_end', ({ winner, stats }) => {
      ended = true;
      finish(`\n🏆 [p1 視角] 戰鬥結束：${winner}（你方剩 ${stats.yourAlive} 隻 / 對方剩 ${stats.opponentAlive} 隻），共 ${turns} 回合`);
    });

    p1.on('error_msg', ({ message }) => reject(new Error('[p1] ' + message)));
    p2.on('error_msg', ({ message }) => reject(new Error('[p2] ' + message)));
  });

  await done;
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
