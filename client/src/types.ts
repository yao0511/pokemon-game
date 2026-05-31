// 與後端對應的前端型別

export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic'
  | 'bug' | 'rock' | 'ghost' | 'dragon';

export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface Move {
  name: string;
  type: PokemonType;
  power: number;
  damageClass: 'physical' | 'special' | 'status';
  pp: number;
  accuracy: number;
}

export interface BattleMove extends Move {
  currentPp: number;
}

export interface PokedexEntry {
  id: number;
  name: string;
  displayName: string;
  types: PokemonType[];
  baseStats: Stats;
  spriteUrl: string;
  availableMoves: Move[];
}

export interface BattlePokemon {
  speciesId: number;
  name: string;
  displayName: string;
  types: PokemonType[];
  stats: Stats;
  maxHp: number;
  currentHp: number;
  spriteUrl: string;
  moves: BattleMove[];
  fainted: boolean;
}

export interface OpponentView {
  name: string;
  activeIndex: number;
  active: {
    displayName: string;
    types: PokemonType[];
    currentHp: number;
    maxHp: number;
    spriteUrl: string;
    fainted: boolean;
  } | null;
  aliveCount: number;
  teamStatus: { fainted: boolean }[];
  connected: boolean;
}

export interface BattleState {
  roomCode: string;
  turn: number;
  phase: 'waiting' | 'team_select' | 'battle' | 'ended';
  you: {
    side: number;
    name: string;
    activeIndex: number;
    team: BattlePokemon[];
    needsSwitch: boolean;
  };
  opponent: OpponentView | null;
}

export interface BattleEvent {
  kind: 'switch' | 'move' | 'damage' | 'miss' | 'noeffect' | 'faint' | 'recoil';
  side: number;        // 絕對 side（0/1）
  amount?: number;     // damage / recoil
  effectiveness?: number;
  moveName?: string;
}

export interface BattleEndPayload {
  winner: 'you' | 'opponent' | 'draw';
  stats: { yourAlive?: number; opponentAlive?: number; reason?: string };
}
