FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Copy shared contracts and backend
COPY shared/ ./shared/
COPY backend/ ./backend/

# Setup browser-worker
WORKDIR /app/browser-worker
COPY browser-worker/package*.json ./
RUN npm ci --omit=dev

COPY browser-worker/ ./

CMD ["node", "src/index.js"]
