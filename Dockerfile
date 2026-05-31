# 單一服務 Docker 映像：build 前端 + 由後端一起提供（API + 靜態檔 + WebSocket）
# build context 為 repo 根目錄：  docker build -t pokemon-battle .
FROM node:22-alpine
WORKDIR /app

# 1) 前端：安裝依賴並 build
COPY client/package*.json client/
RUN npm --prefix client install
COPY client/ client/
RUN npm --prefix client run build

# 2) 後端：安裝依賴並複製原始碼（含 src/data/cache）
COPY server/package*.json server/
RUN npm --prefix server install
COPY server/ server/

ENV PORT=3001
EXPOSE 3001

# 後端啟動時會自動提供 ../client/dist
CMD ["npm", "--prefix", "server", "start"]
