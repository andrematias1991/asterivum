FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/app/data/astralis.db
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/tsconfig.json ./
RUN mkdir -p /app/data
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["node","--import","tsx","server/index.ts"]
