import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { Server } from 'socket.io';
import { loadPokedex, getPokedex } from './data/pokeapi.js';
import { attachGameServer, roomCount } from './rooms/roomManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const CLIENT_DIST = join(__dirname, '../../client/dist');

let pokedexReady = false;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

// REST：提供圖鑑給前端選隊畫面
app.get('/api/pokedex', (_req, res) => {
  res.json(getPokedex());
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ready: pokedexReady, rooms: roomCount(), pokedex: getPokedex().length });
});

// 單一服務：同時提供前端靜態檔（client build 後的產物）
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback：非 /api、非靜態檔的 GET 都回 index.html
  app.get('*', (_req, res) => {
    res.sendFile(join(CLIENT_DIST, 'index.html'));
  });
  console.log(`[server] 提供前端靜態檔：${CLIENT_DIST}`);
} else {
  console.log('[server] 找不到 client/dist，僅提供 API（開發模式請另跑 vite dev）');
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

attachGameServer(io);

async function main() {
  // 先開始監聽（健康檢查可立即通過），再背景載入圖鑑
  httpServer.listen(PORT, () => {
    console.log(`[server] 監聽於 http://localhost:${PORT}`);
  });

  try {
    await loadPokedex();
    pokedexReady = true;
    console.log(`[server] 圖鑑就緒，共 ${getPokedex().length} 隻寶可夢`);
  } catch (err) {
    console.error('[server] 圖鑑載入失敗：', err);
  }
}

main().catch((err) => {
  console.error('[server] 啟動失敗：', err);
  process.exit(1);
});
