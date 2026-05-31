# 註：此 Dockerfile 僅供「前後端分離」時打包純後端使用。
# 單一服務（後端一起提供前端）請改用 repo 根目錄的 /Dockerfile。
FROM node:22-alpine

WORKDIR /app

# 先裝依賴（利用 layer 快取）
COPY package*.json ./
RUN npm install

# 複製原始碼
COPY . .

ENV PORT=3001
# 部署時請設定 CLIENT_ORIGIN 為前端網域，例如 https://your-app.vercel.app
ENV CLIENT_ORIGIN=*

EXPOSE 3001

CMD ["npm", "start"]
