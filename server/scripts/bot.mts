// 練習機器人：建立房間並自動完成選隊與每回合出招，供前端對戰驗證用。
import { io } from 'socket.io-client';

const URL = process.env.SERVER_URL || 'http://localhost:3001';
const TEAM = [25, 6, 9, 3, 65, 94];

const bot = io(URL, { transports: ['websocket'], forceNew: true });

function pickAction(state: any): { type: 'move' | 'switch'; index: number } {
  const me = state.you;
  if (me.needsSwitch) {
    const idx = me.team.findIndex((p: any, i: number) => !p.fainted && i !== me.activeIndex);
    return { type: 'switch', index: idx >= 0 ? idx : 0 };
  }
  const active = me.team[me.activeIndex];
  const mi = active.moves.findIndex((m: any) => m.currentPp > 0);
  return { type: 'move', index: mi >= 0 ? mi : 0 };
}

bot.on('connect', () => bot.emit('create_room', { playerName: '練習機器人' }));
bot.on('room_created', ({ roomCode }) => console.log(`ROOMCODE=${roomCode}`));
bot.on('team_selection_start', () => bot.emit('submit_team', { team: TEAM }));
bot.on('battle_start', (s) => bot.emit('submit_action', pickAction(s.battleState)));
bot.on('turn_result', ({ battleState }) => {
  if (battleState.phase === 'battle') bot.emit('submit_action', pickAction(battleState));
});
bot.on('force_switch', ({ battleState }) => bot.emit('submit_action', pickAction(battleState)));
bot.on('battle_end', ({ winner }) => console.log(`BOT_BATTLE_END winner=${winner}`));
bot.on('error_msg', ({ message }) => console.log('BOT_ERROR', message));

console.log('bot 已啟動，等待對手…');
