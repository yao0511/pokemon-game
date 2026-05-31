import { SERVER_URL } from './socket';
import type { PokedexEntry } from './types';

let cache: PokedexEntry[] | null = null;

export async function fetchPokedex(): Promise<PokedexEntry[]> {
  if (cache) return cache;
  const res = await fetch(`${SERVER_URL}/api/pokedex`);
  if (!res.ok) throw new Error(`圖鑑載入失敗：HTTP ${res.status}`);
  cache = await res.json();
  return cache!;
}
