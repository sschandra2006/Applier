FROM node:20-alpine

WORKDIR /app

# Copy shared contract package
COPY shared/ ./shared/

# Setup backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./

EXPOSE 5000

CMD ["node", "server.js"]
