FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js ./
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY lib/ ./lib/
COPY data/ ./data/
COPY sync/ ./sync/
COPY scripts/ ./scripts/

EXPOSE 3001

CMD ["node", "--max-old-space-size=1536", "server.js"]
