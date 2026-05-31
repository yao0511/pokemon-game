# 寶可夢對戰遊戲

第一世代（151 隻）· 6v6 · 即時線上對戰，回合制。

系統架構見 [ARCHITECTURE.md](./ARCHITECTURE.md)，完整規格見 [SPEC.md](./SPEC.md)。

## 技術架構

- **後端** `server/`：Node.js + Express + Socket.io（TypeScript）
- **前端** `client/`：React + Vite（TypeScript）
- **資料**：PokéAPI（第一世代，啟動時抓取並寫入磁碟快取）

## 啟動方式

> 註：此機器用 nvm 安裝 Node，且 shell 不自動載入 PATH，
> 每個指令前請先執行：
> `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`

本專案採「單一服務」架構：**後端同時提供前端、API 與 WebSocket**，
但程式碼仍是 `server/` 與 `client/` 兩個獨立資料夾，開發時照樣分離。

### 開發模式（前後端分離、有 HMR）

開兩個終端機：

```bash
# 後端 :3001
npm --prefix server install   # 首次
npm --prefix server run dev

# 前端 :5173（Vite 已設 proxy，自動把 /api 與 /socket.io 轉給 :3001）
npm --prefix client install   # 首次
npm --prefix client run dev
```

瀏覽器開 http://localhost:5173 。

> 首次啟動後端會從 PokéAPI 抓 151 隻（數十秒），快取於
> `server/src/data/cache/gen1.json`（已隨 repo 提供），之後秒啟動。

### 單一服務模式（一個網址，接近正式環境 / 給別人玩）

```bash
npm --prefix client run build     # 產生 client/dist
npm --prefix server start         # 後端在 :3001 同時提供前端 + API + WebSocket
```

瀏覽器開 http://localhost:3001 ：一邊「建立新房間」拿房間碼，
另一邊輸入房間碼「加入房間」即可對戰。

## 測試

```bash
cd server
npx tsx --test src/battle/engine.test.ts   # 戰鬥引擎單元測試（15 項）
npx tsx scripts/smoke.mts                   # 端到端對戰煙霧測試（需先啟動後端）
npx tsx scripts/bot.mts                     # 練習機器人（建房後自動對戰，供單人測試）
```

## 讓其他電腦透過 URL 一起玩

單一服務 → 整個遊戲走**同一個網址**，分享一條連結即可。

### 方法 A — 臨時跟朋友玩（最快，免部署）

1. build 前端並啟動單一服務：
   ```bash
   npm --prefix client run build
   npm --prefix server start          # 後端在 :3001 同時提供前端
   ```
2. 用 tunnel 把 :3001 變成公開網址（擇一）：
   ```bash
   npx localtunnel --port 3001                      # 零安裝，得到 https://xxx.loca.lt
   # 或 Cloudflare 官方（較穩、原生支援 WebSocket）：
   cloudflared tunnel --url http://localhost:3001   # 得到 https://xxx.trycloudflare.com
   ```
3. 把網址傳給朋友：一人建房拿房間碼，另一人輸入碼加入即可對戰。
   （關閉終端機 tunnel 即失效，適合臨時。）

> ⚠️ 別把前端 dev server（:5173）直接 tunnel 出去——那樣對方連不到後端（:3001）。
> 一定是 tunnel **單一服務的 :3001**。

### 方法 B — 永久公開上線（GitHub + Render，固定網址）

倉庫已含 [`render.yaml`](./render.yaml)（單一服務 Blueprint）與根目錄 [`Dockerfile`](./Dockerfile)。

1. 把專案推到 GitHub。
2. Render → New → **Blueprint** → 連結此 repo，自動讀 `render.yaml`：
   build 前後端並 build 前端 → `npm --prefix server start` → 健康檢查 `/api/health`。
3. 部署完成得到固定網址（如 `https://pokemon-battle.onrender.com`），分享即可玩。

> PokéAPI 快取已隨 repo 提供，啟動即秒讀，免重抓。
> Render free 方案閒置會休眠，下次有人連線時冷啟動約 30–60 秒。

#### Docker（自架 / 其他平台）

```bash
docker build -t pokemon-battle .      # 於 repo 根目錄
docker run -p 3001:3001 pokemon-battle
```

### 環境變數

| 變數 | 說明 |
|------|------|
| `PORT` | 後端監聽埠（預設 3001） |
| `CLIENT_ORIGIN` | （選用）CORS 來源；單一服務同源時不需設定 |
| `VITE_SERVER_URL` | （選用）前端 build 時覆寫後端位址，供前後端分離部署用 |

## 已實作（MVP）

- 房間建立/加入（6 位房間碼）
- 151 隻選隊、屬性篩選、能力值與技能預覽
- 回合制對戰：傷害計算、第一世代屬性相剋、STAB、物理/特殊（屬性決定）
- 換隊員、強制換場、PP/掙扎、30 秒回合計時、斷線判定
- 勝敗結果

## 尚未實作（未來）

狀態異常、道具、特性、AI 對手、二世代以後、觀戰、再戰（rematch）同房。
