# 系統架構

寶可夢對戰遊戲的設計文件。說明整體架構、模組職責、通訊協定與關鍵設計決策。
功能與啟動方式見 [README.md](./README.md)，規格見 [SPEC.md](./SPEC.md)。

---

## 1. 宏觀架構：單一服務的權威伺服器

```
        瀏覽器 A                     瀏覽器 B
   ┌──────────────┐            ┌──────────────┐
   │ React 前端    │            │ React 前端    │
   │ (只負責渲染)   │            │ (只負責渲染)   │
   └──────┬───────┘            └──────┬───────┘
          │  WebSocket (Socket.io)    │
          │  + HTTP (/api, 靜態檔)     │
          └────────────┬──────────────┘
                       ▼
        ┌─────────────────────────────────┐
        │   Node 單一服務 (Express)         │
        │  ┌───────────────────────────┐  │
        │  │ index.ts  HTTP+靜態+socket  │  │ ← 入口
        │  ├───────────────────────────┤  │
        │  │ roomManager  房間狀態機      │  │ ← 唯一的「真相來源」
        │  ├───────────────────────────┤  │
        │  │ battle/  純函數戰鬥引擎       │  │ ← 可單測、無副作用
        │  ├───────────────────────────┤  │
        │  │ data/  PokéAPI 快取+相剋表   │  │
        │  └───────────────────────────┘  │
        └─────────────────────────────────┘
```

**核心原則：權威伺服器（authoritative server）。**
所有戰鬥邏輯、傷害計算、勝負判定**只在後端發生**。前端不算傷害——它只送出
「我要用第幾招／換第幾隻」，再渲染後端回傳的結果。好處：

- **防作弊**：前端改不了血量、看不到對手底牌。
- **一致性**：兩個瀏覽器永遠看到同一份戰況（後端是唯一真相來源）。

**單一服務**：後端 Express 同時提供前端靜態檔、REST API 與 WebSocket，整個遊戲走
同一個 origin。程式碼仍是 `server/` 與 `client/` 兩個獨立資料夾，僅部署時合一。

---

## 2. 技術棧

| 層 | 技術 |
|----|------|
| 後端 | Node.js · Express · Socket.io · TypeScript（以 `tsx` 直接執行） |
| 前端 | React 18 · Vite · TypeScript |
| 資料 | PokéAPI（第一世代 151 隻，啟動時抓取並寫入磁碟快取） |
| 音效 | Web Audio API 即時合成（無音檔素材） |

---

## 3. 目錄結構

```
server/src/
├── index.ts              入口：HTTP + 靜態檔 + socket.io 啟動
├── types.ts              後端共用型別
├── rooms/
│   └── roomManager.ts    連線層 + 房間狀態機（系統大腦）
├── battle/
│   ├── engine.ts         回合結算（純函數）
│   ├── damage.ts         傷害公式
│   ├── stats.ts          能力值換算
│   └── engine.test.ts    戰鬥引擎單元測試（15 項）
└── data/
    ├── pokeapi.ts        PokéAPI 抓取 + 磁碟快取
    └── typeChart.ts      第一世代屬性相剋表

client/src/
├── main.tsx              React 進入點
├── App.tsx               總狀態機 + 所有 socket 事件監聽
├── socket.ts             Socket.io 單例（同源相對路徑）
├── api.ts                抓 /api/pokedex
├── sound.ts              Web Audio 合成音效
├── types.ts              對應後端的前端型別
└── components/
    ├── Home.tsx          建房 / 加入
    ├── TeamBuilder.tsx   151 隻選隊
    ├── Battle.tsx        戰場渲染 + 動畫時間軸
    ├── Result.tsx        勝敗結果
    └── common.tsx        HP 條、屬性徽章、隊伍點等共用元件
```

---

## 4. 通訊協定（Socket.io 事件）

整個對戰是一組事件往返。**Client→Server 只有 4 個動詞**，Server→Client 推送狀態。

### Client → Server

| 事件 | Payload | 意義 |
|------|---------|------|
| `create_room` | `{ playerName }` | 建立房間，回傳 6 位房間碼 |
| `join_room` | `{ roomCode, playerName }` | 用房間碼加入 |
| `submit_team` | `{ team: number[] }` | 送出隊伍（species id 陣列，最多 6） |
| `submit_action` | `{ type: 'move'\|'switch', index }` | 送出回合行動 |

### Server → Client

| 事件 | 意義 |
|------|------|
| `room_created` / `room_joined` / `opponent_joined` | 房間事件 |
| `team_selection_start` | 兩人到齊 → 進入選隊 |
| `opponent_ready` | 對手已送出隊伍 |
| `battle_start` | 雙方都送隊 → 開戰 |
| `turn_result` | 回合結算：`{ log, events, battleState }` |
| `force_switch` | 你的寶可夢倒下，需強制換場 |
| `opponent_action_submitted` | 對手已出招（不洩漏內容） |
| `battle_end` | 對局結束：`{ winner, stats }` |
| `opponent_disconnected` | 對手斷線 |
| `error_msg` | 錯誤訊息 |

---

## 5. 後端設計

### 5.1 入口 `index.ts`

- 建 Express + http server + Socket.io。
- 掛載：`/api/health`、`/api/pokedex`、前端靜態檔（`client/dist`）、SPA fallback。
- **「先 listen 再背景載入圖鑑」**：伺服器立刻開始監聽（雲端健康檢查
  `/api/health` 馬上通過），PokéAPI 在背景載入，`ready` 旗標完成後翻 true。

### 5.2 房間狀態機 `rooms/roomManager.ts`

整個系統的大腦，負責所有「髒活」：連線、計時器、狀態同步。

**房間生命週期**

```
waiting ──(雙方到齊)──► team_select ──(雙方送隊)──► battle ──(全滅/斷線)──► ended
```

**回合同步機制**

```
A 送 submit_action ─► 存進 A.pendingAction，通知 B「對手已出招」
B 送 submit_action ─► 存進 B.pendingAction
        │
        ▼ tryResolveTurn：兩邊 pendingAction 都齊了嗎？
        │  齊 → 呼叫 engine.resolveTurn → 廣播 turn_result
        │
        ├─ 有人昏厥但隊伍尚有存活 → 進入「強制換場」插入步驟
        │     (forceSwitch Set，此時只接受昏厥方的 switch)
        │
        └─ 有人全滅 → battle_end 判定勝負
```

**伺服器權威計時器**：每回合 30 秒。逾時自動代選——一般回合選第一個有 PP 的
技能，強制換場則換上第一隻存活者。確保有人發呆或斷線時對局不卡死。

**斷線處理**：對戰中斷線即判對手獲勝（`endByDisconnect`）；雙方都離線則清除房間。

**記憶體狀態**：房間存在 `Map<string, Room>`，另有 `socketToRoom` 反查。
簡單夠用，代價是伺服器重啟對局即消失（休閒小遊戲可接受）。

### 5.3 視角化序列化（防作弊關鍵）

`serializeFor(room, side)` 對每個玩家**只送他該看到的**：

- **你自己**：完整資訊（每隻精確 HP、PP、能力值、技能）。
- **對手**：僅 `publicActive`——出場那隻的名字、屬性、目前/最大 HP、是否昏厥，
  外加隊伍的「6 個圓點（存活/昏厥）」與存活數。對手的**後備、PP、能力值看不到**。

### 5.4 純函數戰鬥引擎 `battle/`

引擎**完全不知道 socket / 玩家存在**，只做規則運算：

```ts
resolveTurn(sides, actions, rng) → TurnResult
```

吃「兩邊隊伍 + 兩邊行動 + 亂數函數」，吐「事件列表 + 是否結束 + 勝方 + 待換場」。

**回合結算順序**（`engine.ts`）：

1. **換場優先**：先處理所有 `switch`。
2. **依速度排序出招**：速度高者先攻，相同則由注入的 `rng` 決定。
3. 逐一結算傷害；任一方被打昏可能讓對手後續落空。
4. 判定全滅（→結束）或單隻昏厥（→該方強制換場）。

**亂數可注入**是關鍵：`rng` 預設 `Math.random`，測試時餵固定值，傷害就完全
可預測——這就是 `engine.test.ts` 15 項測試能成立的原因。

#### 能力值換算 `stats.ts`（固定 Lv.50，IV/EV 視為 0）

```
HP   = floor(base * 2 * 50 / 100) + 50 + 10
其他 = floor(base * 2 * 50 / 100) + 5
```

#### 傷害公式 `damage.ts`

```
base   = floor((2*50/5 + 2) * power * (atk/def) / 50) + 2
damage = max(1, floor(base * effectiveness * stab * random))
```

- **物理／特殊由屬性決定**（第一世代規則）：火/水/草/電/冰/超能力/龍 為特殊，
  其餘為物理 → 決定用 攻擊/特攻 與 防禦/特防。
- `effectiveness`：屬性相剋倍率（`typeChart.ts`），無效時直接 0 傷害。
- `stab`：攻擊方屬性與招式相同 → ×1.5。
- `random`：0.85 ~ 1.00 的浮動。
- **Struggle（掙扎）**：所有技能無 PP 時使用，無視相剋與 STAB、必中，並對自己
  造成所受傷害 1/4 的反作用力。

### 5.5 資料層 `data/`

- `pokeapi.ts`：啟動時抓第一世代 151 隻的 base stats、屬性、技能，
  寫入 `src/data/cache/gen1.json`（已納入版控 → 雲端/離線啟動皆秒級）。
- `typeChart.ts`：第一世代屬性相剋表。

---

## 6. 事件驅動：log 與動畫同源

戰鬥引擎產生的不是字串，而是**結構化的 `BattleEvent`**：

```ts
{ kind: 'damage', side: 1, amount: 64, effectiveness: 2, message: '…受到 64 點傷害！效果絕佳！' }
```

同一份 `events` 被前端**兩邊各取所需**：

- `message` → 戰鬥 **log**（並依關鍵字上色：絕佳/不好/倒下）。
- `kind`/`side`/`amount`/`effectiveness` → **動畫**（攻擊 lunge、受擊抖動、
  浮動傷害數字、效果絕佳則數字變黃放大、昏厥下沉）。

`App.tsx` 把 events 連同遞增的 `eventSeq` 傳給 `Battle.tsx`，後者用 `setTimeout`
把事件排成一條動畫時間軸。文字與動畫永遠同步，因為它們是**同一個資料源**。

> 註：events 的 `side` 是絕對的（0/1）。前端靠 `battleState.you.side` 把它翻譯成
> 「我方/對方」，決定動畫演在哪一隻身上。

---

## 7. 前端設計

- `App.tsx` 是**唯一**持有 socket 監聽的地方，集中管理 `screen` 狀態機
  （`home → lobby → team → battle → result`）。
- 子元件皆為「拿 props 渲染 + 把操作往上回呼」的純展示元件 → 狀態集中、單向資料流。
- `socket.ts` 用空字串作預設 URL → 同源相對路徑連線；可用 `VITE_SERVER_URL`
  覆寫以支援前後端分離部署。

---

## 8. 資料流範例：完整一個回合

```
1. A 在 Battle.tsx 點技能 → socket.emit('submit_action', {type:'move', index:0})
2. 後端 roomManager 收到 → 存 A.pendingAction，emit 'opponent_action_submitted' 給 B
3. B 點技能 → 後端收到 B.pendingAction
4. tryResolveTurn：兩邊齊備 → 呼叫 engine.resolveTurn(sides, actions)
5. engine 換場優先 → 依速度排序 → 算傷害 → 產生 BattleEvent[] → 回 TurnResult
6. 後端把改動寫回 player，對「每個」玩家以其視角 serializeFor，
   emit 'turn_result' {log, events, battleState}
7. 前端 App.tsx 收到 → 更新 battleState、推進 eventSeq
8. Battle.tsx 依 events 播放動畫時間軸 + 音效，HP 條過渡，log 追加上色
9. 若有人昏厥 → 後端 emit 'force_switch'；若全滅 → emit 'battle_end'
```

---

## 9. 設計取捨總結

| 決策 | 理由 / 代價 |
|------|------------|
| 權威伺服器 | 防作弊、雙方一致；代價是每步 round-trip（回合制無感） |
| 純函數引擎 + 注入 RNG | 可單測、規則與網路解耦；好維護 |
| 結構化事件 | log 與動畫同源，不會對不上 |
| 視角化序列化 | 對手看不到底牌 |
| 房間狀態存記憶體 | 簡單夠用；伺服器重啟對局消失 |
| 單一服務 | 一個 URL、無 CORS；前端不走獨立 CDN |
| PokéAPI 啟動快取（納版控） | 啟動秒級、離線可跑 |

---

## 10. 目前未實作（未來方向）

狀態異常、天氣、能力變化、特性、道具、AI 對手、二世代以後、觀戰、
同房再戰（rematch）、持久化儲存（目前對局在記憶體）。
