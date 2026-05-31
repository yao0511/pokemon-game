import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Move, PokemonSpecies, PokemonType, Stats, DamageClass } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, 'cache');
const CACHE_FILE = join(CACHE_DIR, 'gen1.json');

const API_BASE = 'https://pokeapi.co/api/v2';
const GEN1_COUNT = 151;
const GEN1_VERSION_GROUPS = new Set(['red-blue', 'yellow']);
const CONCURRENCY = 12;

const VALID_TYPES = new Set<string>([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
  'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
]);

function isValidType(t: string): t is PokemonType {
  return VALID_TYPES.has(t);
}

// ===== 記憶體中的圖鑑 =====
let pokedex: PokemonSpecies[] = [];
const pokedexById = new Map<number, PokemonSpecies>();

export function getPokedex(): PokemonSpecies[] {
  return pokedex;
}

export function getSpecies(id: number): PokemonSpecies | undefined {
  return pokedexById.get(id);
}

// ===== 工具：並發限制 + 重試 =====
async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function pMap<T, R>(items: T[], fn: (item: T, i: number) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function capitalize(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseStats(raw: any[]): Stats {
  const get = (name: string) => raw.find((s) => s.stat.name === name)?.base_stat ?? 0;
  return {
    hp: get('hp'),
    attack: get('attack'),
    defense: get('defense'),
    specialAttack: get('special-attack'),
    specialDefense: get('special-defense'),
    speed: get('speed'),
  };
}

// ===== 主流程 =====

/** 載入圖鑑：優先讀磁碟快取，否則從 PokéAPI 抓取後寫入快取 */
export async function loadPokedex(): Promise<void> {
  if (existsSync(CACHE_FILE)) {
    try {
      const raw = await readFile(CACHE_FILE, 'utf-8');
      pokedex = JSON.parse(raw);
      indexPokedex();
      console.log(`[pokeapi] 從快取載入 ${pokedex.length} 隻寶可夢`);
      return;
    } catch {
      console.warn('[pokeapi] 快取損壞，改為重新抓取');
    }
  }
  await fetchFromApi();
}

function indexPokedex() {
  pokedexById.clear();
  for (const p of pokedex) pokedexById.set(p.id, p);
}

async function fetchFromApi(): Promise<void> {
  console.log('[pokeapi] 開始從 PokéAPI 抓取第一世代資料（首次需數十秒）…');
  const ids = Array.from({ length: GEN1_COUNT }, (_, i) => i + 1);

  // 1. 抓每隻寶可夢的基本資料
  const rawPokemon = await pMap(ids, (id) => fetchJson(`${API_BASE}/pokemon/${id}`), CONCURRENCY);
  console.log('[pokeapi] 已取得 151 隻基本資料，整理技能清單…');

  // 2. 蒐集所有第一世代可學的技能名稱（去重）
  const moveNames = new Set<string>();
  for (const p of rawPokemon) {
    for (const m of p.moves) {
      const learnable = m.version_group_details.some((d: any) =>
        GEN1_VERSION_GROUPS.has(d.version_group.name),
      );
      if (learnable) moveNames.add(m.move.name);
    }
  }

  // 3. 批次抓技能詳細，建立 move 快取
  const moveList = [...moveNames];
  const moveCache = new Map<string, Move | null>();
  const moveDetails = await pMap(
    moveList,
    (name) => fetchJson(`${API_BASE}/move/${name}`),
    CONCURRENCY,
  );
  for (let i = 0; i < moveList.length; i++) {
    const d = moveDetails[i];
    const typeName = d.type?.name;
    if (!isValidType(typeName)) {
      moveCache.set(moveList[i], null); // 第一世代不存在的屬性（如後來改成妖精）跳過
      continue;
    }
    const move: Move = {
      name: capitalize(d.name),
      type: typeName,
      power: d.power ?? 0,
      damageClass: (d.damage_class?.name ?? 'status') as DamageClass,
      pp: d.pp ?? 5,
      accuracy: d.accuracy ?? 100,
    };
    moveCache.set(moveList[i], move);
  }
  console.log(`[pokeapi] 已取得 ${moveCache.size} 個技能詳細`);

  // 4. 組裝圖鑑
  pokedex = rawPokemon.map((p) => {
    const types = p.types
      .map((t: any) => t.type.name)
      .filter(isValidType) as PokemonType[];

    const learnable: Move[] = [];
    const seen = new Set<string>();
    for (const m of p.moves) {
      const isGen1 = m.version_group_details.some((d: any) =>
        GEN1_VERSION_GROUPS.has(d.version_group.name),
      );
      if (!isGen1 || seen.has(m.move.name)) continue;
      seen.add(m.move.name);
      const mv = moveCache.get(m.move.name);
      if (mv) learnable.push(mv);
    }

    // 攻擊技優先（power 由高到低），補上變化技
    const attacking = learnable.filter((m) => m.power > 0).sort((a, b) => b.power - a.power);
    const status = learnable.filter((m) => m.power <= 0);
    const availableMoves = [...attacking, ...status];

    return {
      id: p.id,
      name: p.name,
      displayName: capitalize(p.name),
      types,
      baseStats: parseStats(p.stats),
      spriteUrl:
        p.sprites?.front_default ??
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`,
      availableMoves,
    } satisfies PokemonSpecies;
  });

  indexPokedex();

  // 5. 寫入磁碟快取
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(pokedex), 'utf-8');
  console.log(`[pokeapi] 完成，已快取至 ${CACHE_FILE}`);
}
