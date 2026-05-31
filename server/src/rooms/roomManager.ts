import type { Server, Socket } from 'socket.io';
import type { Action, BattlePokemon, Phase } from '../types.js';
import { buildBattlePokemon, resolveTurn, type BattleSide } from '../battle/engine.js';

const TURN_TIME_MS = 30_000;
const TEAM_SIZE = 6;

interface TeamEntry {
  speciesId: number;
  moveIndices?: number[];
}

interface Player {
  socketId: string;
  name: string;
  side: number;
  team: BattlePokemon[];
  activeIndex: number;
  submittedTeam: boolean;
  pendingAction: Action | null;
  connected: boolean;
}

interface Room {
  code: string;
  players: Player[];
  phase: Phase;
  turn: number;
  timer: NodeJS.Timeout | null;
  forceSwitch: Set<number>; // 等待強制換場的 side
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混字
function genRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// ===== 狀態序列化（依視角） =====

function publicActive(p: Player) {
  const a = p.team[p.activeIndex];
  if (!a) return null;
  return {
    displayName: a.displayName,
    types: a.types,
    currentHp: a.currentHp,
    maxHp: a.maxHp,
    spriteUrl: a.spriteUrl,
    fainted: a.fainted,
  };
}

function serializeFor(room: Room, side: number) {
  const me = room.players[side];
  const opp = room.players[1 - side];
  return {
    roomCode: room.code,
    turn: room.turn,
    phase: room.phase,
    you: {
      side,
      name: me.name,
      activeIndex: me.activeIndex,
      team: me.team, // 自己看到完整資訊
      needsSwitch: room.forceSwitch.has(side),
    },
    opponent: opp
      ? {
          name: opp.name,
          activeIndex: opp.activeIndex,
          active: publicActive(opp),
          aliveCount: opp.team.filter((p) => !p.fainted).length,
          teamStatus: opp.team.map((p) => ({ fainted: p.fainted })),
          connected: opp.connected,
        }
      : null,
  };
}

// ===== 計時器 =====

function clearTimer(room: Room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function startTurnTimer(io: Server, room: Room) {
  clearTimer(room);
  room.timer = setTimeout(() => onTurnTimeout(io, room), TURN_TIME_MS);
}

function onTurnTimeout(io: Server, room: Room) {
  if (room.phase !== 'battle') return;
  if (room.forceSwitch.size > 0) {
    // 強制換場逾時：自動換第一個存活者
    for (const side of room.forceSwitch) {
      const p = room.players[side];
      const idx = p.team.findIndex((mon) => !mon.fainted);
      if (idx >= 0) p.activeIndex = idx;
    }
    room.forceSwitch.clear();
    afterForceSwitch(io, room);
    return;
  }
  // 一般回合逾時：未提交者自動選第一個有 PP 的技能
  for (const p of room.players) {
    if (!p.pendingAction) {
      const moveIdx = p.team[p.activeIndex].moves.findIndex((m) => m.currentPp > 0);
      p.pendingAction = { type: 'move', index: moveIdx >= 0 ? moveIdx : 0 };
    }
  }
  tryResolveTurn(io, room);
}

// ===== 房間生命週期 =====

function broadcastBattleState(io: Server, room: Room, eventName: string, extra: Record<string, unknown> = {}) {
  for (const p of room.players) {
    io.to(p.socketId).emit(eventName, { ...extra, battleState: serializeFor(room, p.side) });
  }
}

function buildTeam(entries: TeamEntry[]): BattlePokemon[] {
  return entries.slice(0, TEAM_SIZE).map((e) => buildBattlePokemon(e.speciesId, e.moveIndices));
}

function tryResolveTurn(io: Server, room: Room) {
  if (room.players.length < 2) return;
  if (!room.players.every((p) => p.pendingAction)) return;

  clearTimer(room);
  const sides: [BattleSide, BattleSide] = [
    { team: room.players[0].team, activeIndex: room.players[0].activeIndex },
    { team: room.players[1].team, activeIndex: room.players[1].activeIndex },
  ];
  const actions: [Action, Action] = [room.players[0].pendingAction!, room.players[1].pendingAction!];

  const result = resolveTurn(sides, actions);

  // 將 engine 改動的 activeIndex 寫回 player
  room.players[0].activeIndex = sides[0].activeIndex;
  room.players[1].activeIndex = sides[1].activeIndex;
  room.players.forEach((p) => (p.pendingAction = null));
  room.turn += 1;

  const log = result.events.map((e) => e.message);

  if (result.ended) {
    room.phase = 'ended';
    clearTimer(room);
    for (const p of room.players) {
      const won = result.winner === p.side;
      io.to(p.socketId).emit('turn_result', { log, events: result.events, battleState: serializeFor(room, p.side) });
      io.to(p.socketId).emit('battle_end', {
        winner: result.winner === null ? 'draw' : won ? 'you' : 'opponent',
        stats: {
          yourAlive: p.team.filter((x) => !x.fainted).length,
          opponentAlive: room.players[1 - p.side].team.filter((x) => !x.fainted).length,
        },
      });
    }
    return;
  }

  // 廣播回合結果
  for (const p of room.players) {
    io.to(p.socketId).emit('turn_result', { log, events: result.events, battleState: serializeFor(room, p.side) });
  }

  if (result.needsSwitch.length > 0) {
    room.forceSwitch = new Set(result.needsSwitch);
    for (const side of result.needsSwitch) {
      io.to(room.players[side].socketId).emit('force_switch', { battleState: serializeFor(room, side) });
    }
    startTurnTimer(io, room);
  } else {
    startTurnTimer(io, room);
  }
}

function afterForceSwitch(io: Server, room: Room) {
  // 換場完成，回到正常回合
  broadcastBattleState(io, room, 'turn_result', { log: ['換場完成，繼續戰鬥！'], events: [] });
  startTurnTimer(io, room);
}

function endByDisconnect(io: Server, room: Room, leaverSide: number) {
  if (room.phase === 'ended') return;
  room.phase = 'ended';
  clearTimer(room);
  const winnerSide = 1 - leaverSide;
  const w = room.players[winnerSide];
  if (w) {
    io.to(w.socketId).emit('opponent_disconnected', {});
    io.to(w.socketId).emit('battle_end', { winner: 'you', stats: { reason: 'opponent_disconnected' } });
  }
}

// ===== Socket 事件註冊 =====

export function attachGameServer(io: Server) {
  io.on('connection', (socket: Socket) => {
    socket.on('create_room', ({ playerName }: { playerName: string }) => {
      const code = genRoomCode();
      const room: Room = { code, players: [], phase: 'waiting', turn: 0, timer: null, forceSwitch: new Set() };
      const player: Player = {
        socketId: socket.id, name: playerName || '訓練家', side: 0,
        team: [], activeIndex: 0, submittedTeam: false, pendingAction: null, connected: true,
      };
      room.players.push(player);
      rooms.set(code, room);
      socketToRoom.set(socket.id, code);
      socket.join(code);
      socket.emit('room_created', { roomCode: code });
    });

    socket.on('join_room', ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      const room = rooms.get((roomCode || '').toUpperCase());
      if (!room) return socket.emit('error_msg', { message: '房間不存在' });
      if (room.players.length >= 2) return socket.emit('error_msg', { message: '房間已滿' });
      if (room.phase !== 'waiting') return socket.emit('error_msg', { message: '對戰已開始' });

      const player: Player = {
        socketId: socket.id, name: playerName || '訓練家', side: 1,
        team: [], activeIndex: 0, submittedTeam: false, pendingAction: null, connected: true,
      };
      room.players.push(player);
      socketToRoom.set(socket.id, room.code);
      socket.join(room.code);

      socket.emit('room_joined', { roomCode: room.code, players: room.players.map((p) => p.name) });
      io.to(room.players[0].socketId).emit('opponent_joined', { playerName: player.name });

      // 兩人到齊，開始選隊
      room.phase = 'team_select';
      io.to(room.code).emit('team_selection_start', {});
    });

    socket.on('submit_team', ({ team }: { team: Array<number | TeamEntry> }) => {
      const room = getRoom(socket.id);
      if (!room || room.phase !== 'team_select') return;
      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player || player.submittedTeam) return;

      const entries: TeamEntry[] = (team || []).map((t) =>
        typeof t === 'number' ? { speciesId: t } : t,
      );
      if (entries.length === 0) return socket.emit('error_msg', { message: '隊伍不可為空' });

      try {
        player.team = buildTeam(entries);
      } catch (e) {
        return socket.emit('error_msg', { message: (e as Error).message });
      }
      player.activeIndex = 0;
      player.submittedTeam = true;

      const opp = room.players.find((p) => p.socketId !== socket.id);
      if (opp) io.to(opp.socketId).emit('opponent_ready', {});

      // 雙方都提交 → 開始戰鬥
      if (room.players.length === 2 && room.players.every((p) => p.submittedTeam)) {
        room.phase = 'battle';
        room.turn = 1;
        for (const p of room.players) {
          io.to(p.socketId).emit('battle_start', { turnNumber: room.turn, battleState: serializeFor(room, p.side) });
        }
        startTurnTimer(io, room);
      }
    });

    socket.on('submit_action', ({ type, index }: { type: 'move' | 'switch'; index: number }) => {
      const room = getRoom(socket.id);
      if (!room || room.phase !== 'battle') return;
      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;

      const action: Action = type === 'switch' ? { type: 'switch', index } : { type: 'move', index };

      // 強制換場階段：只接受該玩家的 switch
      if (room.forceSwitch.size > 0) {
        if (!room.forceSwitch.has(player.side) || action.type !== 'switch') return;
        const target = player.team[action.index];
        if (!target || target.fainted) return socket.emit('error_msg', { message: '無法換上昏厥的寶可夢' });
        player.activeIndex = action.index;
        room.forceSwitch.delete(player.side);
        if (room.forceSwitch.size === 0) afterForceSwitch(io, room);
        return;
      }

      // 一般回合：記錄行動，雙方齊備後結算
      player.pendingAction = action;
      // 通知對手「已出招」（不洩漏內容）
      const opp = room.players.find((p) => p.socketId !== socket.id);
      if (opp) io.to(opp.socketId).emit('opponent_action_submitted', {});
      tryResolveTurn(io, room);
    });

    socket.on('disconnect', () => {
      const room = getRoom(socket.id);
      socketToRoom.delete(socket.id);
      if (!room) return;
      const player = room.players.find((p) => p.socketId === socket.id);
      if (player) player.connected = false;

      if (room.phase === 'battle' || room.phase === 'team_select') {
        endByDisconnect(io, room, player ? player.side : 0);
      }
      // 清理空房間
      if (room.players.every((p) => !p.connected)) {
        clearTimer(room);
        rooms.delete(room.code);
      }
    });
  });
}

function getRoom(socketId: string): Room | undefined {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : undefined;
}

export function roomCount(): number {
  return rooms.size;
}
