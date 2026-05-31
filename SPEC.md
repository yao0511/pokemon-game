# 寶可夢線上對戰遊戲 — 開發規格

## 概覽

第一世代（151 隻）6v6 即時線上對戰，回合制，基礎版戰鬥系統。

---

## 技術架構

| 層級 | 技術 |
|------|------|
| 前端 | React + TypeScript + Vite |
| 樣式 | CSS Modules（無 UI 框架，手刻像素風） |
| 後端 | Node.js + Express + Socket.io |
| 資料來源 | PokéAPI (https://pokeapi.co) |
| 部署 | 前後端分離，後端可跑 Railway/Render，前端 Vercel |

---

## 遊戲流程

```
[首頁] → [建立/加入房間] → [選隊畫面] → [等待對手] → [對戰] → [結果畫面] → [首頁]
```

---

## 功能模組

### 1. 首頁
- 按鈕：建立新房間 / 輸入房間碼加入
- 顯示房間碼（6 位英數）供分享

### 2. 選隊畫面（Team Builder）
- 顯示全部 151 隻寶可夢（圖片 + 名稱 + 屬性標籤）
- 可篩選屬性（火、水、草⋯）
- 點選加入隊伍，最多 6 隻
- 每隻寶可夢顯示：
  - 基本能力值（HP / 攻擊 / 防禦 / 特攻 / 特防 / 速度）
  - 4 個技能（從 PokéAPI 取得，預設前 4 個可學技能）
  - 屬性（單 / 雙屬性）
- 確認陣容後等待對手完成選隊

### 3. 對戰畫面（Battle Screen）

#### 版面配置
```
┌─────────────────────────────────────┐
│  [對手名稱]  [對手 HP 列表 x6 點]    │
│  ┌──────────┐         ┌──────────┐  │
│  │ 對手寶可夢│         │          │  │
│  │  HP ██░░ │         │ HP Bar   │  │
│  └──────────┘         └──────────┘  │
│              ┌──────────┐           │
│              │ 我的寶可夢│           │
│              │  HP ████ │           │
│              └──────────┘           │
│  ┌──────────────────────────────┐   │
│  │ [技能1] [技能2] [技能3] [技能4]│   │
│  │         [換隊員]              │   │
│  └──────────────────────────────┘   │
│  [戰鬥紀錄 Log]                      │
└─────────────────────────────────────┘
```

#### 回合流程
1. 雙方同時選擇行動（技能 or 換隊員）
2. 後端收到雙方行動後計算結果
3. 依照速度決定先後手（換隊員永遠優先）
4. 結算傷害、狀態，廣播結果給雙方
5. 若有寶可夢 HP 歸零，強制換隊員（若還有）

#### 行動計時
- 每回合限時 **30 秒**，超時自動選第一個技能

### 4. 結果畫面
- 顯示勝敗
- 剩餘寶可夢數
- 「再來一局」按鈕（重新進入選隊）

---

## 戰鬥系統規格

### 能力值
所有寶可夢固定 **Lv.50**，能力值從 PokéAPI 取 base stats 後套用：

```
HP = floor(base_hp * 2 * 50 / 100) + 50 + 10
其他 = floor(base_stat * 2 * 50 / 100) + 5
```

### 傷害公式（簡化版）

```
damage = floor((2 * 50 / 5 + 2) * power * (atk / def) / 50 + 2)
         * type_effectiveness
         * stab  (同屬性加成 1.5，否則 1.0)
         * random (0.85 ~ 1.00)
```

- `atk`：物理技用攻擊，特殊技用特攻
- `def`：物理技用防禦，特殊技用特防
- 第一世代判斷物理/特殊：**屬性決定**（火/水/草/電/冰/超能力/龍 = 特殊，其餘 = 物理）

### 屬性相剋表
使用第一世代原始相剋表（無鋼/惡屬性）。

| 倍率 | 說明 |
|------|------|
| 2.0 | 效果絕佳 |
| 1.0 | 正常 |
| 0.5 | 效果不佳 |
| 0.0 | 無效 |

### 技能規格
- 每隻寶可夢 4 個技能，從 PokéAPI 取得（取可學技能的前 4 個）
- 技能資訊：名稱、威力、PP（使用次數）、屬性、種類
- PP 歸零後該技能無法使用

### 換隊員規則
- 任何回合可換隊員（優先於攻擊行動）
- 寶可夢 HP 歸零時強制換（若隊伍已全滅則判輸）
- 換上來的寶可夢無額外懲罰

---

## WebSocket 事件規格

### Client → Server

| 事件 | Payload | 說明 |
|------|---------|------|
| `create_room` | `{ playerName }` | 建立房間 |
| `join_room` | `{ roomCode, playerName }` | 加入房間 |
| `submit_team` | `{ team: PokemonId[] }` | 提交選好的隊伍 |
| `submit_action` | `{ type: 'move'\|'switch', index: number }` | 提交回合行動 |
| `ready_next_round` | — | 確認繼續下一局 |

### Server → Client

| 事件 | Payload | 說明 |
|------|---------|------|
| `room_created` | `{ roomCode }` | 房間已建立 |
| `room_joined` | `{ roomCode, players }` | 成功加入 |
| `opponent_joined` | `{ playerName }` | 對手加入通知 |
| `team_selection_start` | — | 雙方都到齊，開始選隊 |
| `opponent_ready` | — | 對手選隊完畢 |
| `battle_start` | `{ yourTeam, turnNumber }` | 戰鬥開始 |
| `turn_result` | `{ log, battleState }` | 回合結算結果 |
| `force_switch` | — | 強制換場（寶可夢 HP 歸零） |
| `battle_end` | `{ winner, stats }` | 戰鬥結束 |
| `opponent_disconnected` | — | 對手斷線 |

---

## 資料結構

### BattleState（後端維護）
```typescript
interface BattleState {
  roomCode: string;
  players: [PlayerState, PlayerState];
  turn: number;
  phase: 'team_select' | 'battle' | 'ended';
  pendingActions: Map<SocketId, Action>;
}

interface PlayerState {
  socketId: string;
  name: string;
  team: Pokemon[];          // 6 隻
  activePokemonIndex: number;
  hasSubmittedAction: boolean;
}

interface Pokemon {
  id: number;              // PokéAPI id
  name: string;
  types: string[];
  stats: Stats;
  currentHp: number;
  maxHp: number;
  moves: Move[];
}

interface Move {
  name: string;
  power: number;
  pp: number;
  currentPp: number;
  type: string;
  damageClass: 'physical' | 'special' | 'status';
}
```

---

## 前端頁面路由

```
/               首頁
/room/:code     等待室 + 選隊 + 對戰（單一頁面，用狀態機切換）
/result         結果畫面
```

---

## 開發階段規劃

### Phase 1 — 核心對戰邏輯（後端）
- [ ] WebSocket 房間管理
- [ ] PokéAPI 資料快取（啟動時預載 151 隻）
- [ ] 傷害計算、屬性相剋
- [ ] 回合狀態機

### Phase 2 — 基本前端
- [ ] 首頁 + 房間建立/加入
- [ ] 選隊畫面
- [ ] 對戰畫面（基本功能可玩）

### Phase 3 — 完善 UI/UX
- [ ] 動畫（攻擊、換場、HP 扣血）
- [ ] 音效（可選）
- [ ] 計時器 UI
- [ ] 行動 Log 美化

### Phase 4 — 部署
- [ ] Docker / 環境設定
- [ ] 部署後端（Railway）
- [ ] 部署前端（Vercel）

---

## 不在 MVP 範圍內（未來可加）

- 狀態異常（中毒、燒傷、睡眠⋯）
- 道具
- 特性（Ability）
- 帳號系統 / 排行榜
- AI 對手模式
- 二~九世代寶可夢
- 觀戰模式
