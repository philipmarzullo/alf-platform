FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js ./
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY lib/ ./lib/

EXPOSE 3001

CMD ["node", "server.js"]
