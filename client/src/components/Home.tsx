import { useState } from 'react';

interface Props {
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
}

export default function Home({ onCreate, onJoin }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const trimmedName = name.trim();

  return (
    <div>
      <h1 className="home-title">寶可夢對戰</h1>
      <p className="home-sub">第一世代 · 6v6 · 線上對戰</p>

      <div className="home-card panel col">
        <label className="col" style={{ gap: 6 }}>
          <span className="muted">你的名字</span>
          <input
            type="text"
            value={name}
            maxLength={12}
            placeholder="輸入訓練家名稱"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <button
          className="primary"
          disabled={!trimmedName}
          onClick={() => onCreate(trimmedName)}
        >
          建立新房間
        </button>

        <div className="divider">或</div>

        <label className="col" style={{ gap: 6 }}>
          <span className="muted">房間碼</span>
          <input
            type="text"
            value={code}
            maxLength={6}
            placeholder="輸入 6 位房間碼"
            style={{ textTransform: 'uppercase', letterSpacing: 4 }}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button
          className="secondary"
          disabled={!trimmedName || code.trim().length !== 6}
          onClick={() => onJoin(code.trim(), trimmedName)}
        >
          加入房間
        </button>
      </div>
    </div>
  );
}
