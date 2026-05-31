// ===== 共用型別定義 =====

export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic'
  | 'bug' | 'rock' | 'ghost' | 'dragon';

export type DamageClass = 'physical' | 'special' | 'status';

/** 寶可夢的六項能力值 */
export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

/** 技能定義（從 PokéAPI 取得後的精簡版） */
export interface Move {
  name: string;          // 顯示名稱
  type: PokemonType;
  power: number;         // 威力（變化技為 0）
  damageClass: DamageClass;
  pp: number;            // 最大 PP
  accuracy: number;      // 命中率 0~100，null 視為必中(100)
}

/** 圖鑑中的寶可夢樣板（不含戰鬥即時狀態） */
export interface PokemonSpecies {
  id: number;
  name: string;          // 英文名
  displayName: string;   // 顯示名（首字大寫）
  types: PokemonType[];
  baseStats: Stats;
  spriteUrl: string;
  availableMoves: Move[]; // 可選技能池（已篩選有威力或常見變化技）
}

/** 戰鬥中的寶可夢即時狀態 */
export interface BattlePokemon {
  speciesId: number;
  name: string;
  displayName: string;
  types: PokemonType[];
  stats: Stats;          // Lv.50 換算後的實際數值
  maxHp: number;
  currentHp: number;
  spriteUrl: string;
  moves: BattleMove[];   // 已選的 4 個技能
  fainted: boolean;
}

export interface BattleMove extends Move {
  currentPp: number;
}

/** 回合行動 */
export type Action =
  | { type: 'move'; index: number }
  | { type: 'switch'; index: number };

export type Phase = 'waiting' | 'team_select' | 'battle' | 'ended';
