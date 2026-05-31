import type { PokemonType } from '../types.js';

/**
 * 第一世代屬性相剋表。
 * 只列出「非 1.0 倍」的條目，未列出者預設 1.0。
 * 結構：CHART[攻擊方][防禦方] = 倍率
 *
 * 註：採用第一世代設定，無鋼/惡屬性。
 * Ghost → Psychic 採用「設計意圖」的 2.0（原版因程式 bug 為 0，此處還原設計）。
 * Poison ↔ Bug 在第一世代皆為 2.0（與後續世代不同）。
 */
export const TYPE_CHART: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
  normal: { rock: 0.5, ghost: 0 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: {
    fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2,
    flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5,
  },
  ice: { water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2 },
  fighting: {
    normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5,
    bug: 0.5, rock: 2, ghost: 0,
  },
  poison: { grass: 2, poison: 0.5, ground: 0.5, bug: 2, rock: 0.5, ghost: 0.5 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5 },
  bug: {
    fire: 0.5, grass: 2, fighting: 0.5, poison: 2, flying: 0.5,
    psychic: 2, ghost: 0.5,
  },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2 },
  ghost: { normal: 0, psychic: 2, ghost: 2 },
  dragon: { dragon: 2 },
};

/** 計算攻擊屬性對一組防禦屬性（單/雙）的總相剋倍率 */
export function getTypeEffectiveness(
  attackType: PokemonType,
  defenderTypes: PokemonType[],
): number {
  return defenderTypes.reduce((mult, defType) => {
    const row = TYPE_CHART[attackType];
    const factor = row[defType] ?? 1;
    return mult * factor;
  }, 1);
}
