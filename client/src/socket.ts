import { io, type Socket } from 'socket.io-client';

// 單一服務（同源）時留空字串 → socket.io / fetch 走相對路徑（同一個 URL）。
// 若要前後端分離部署，於前端 build 時設定 VITE_SERVER_URL 指向後端網域即可覆寫。
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export const socket: Socket = io(SERVER_URL, {
  // 允許 polling 後援，提高在各種部署平台的連線成功率
  transports: ['websocket', 'polling'],
  autoConnect: true,
});
