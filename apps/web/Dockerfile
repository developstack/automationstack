FROM node:24-slim AS builder
RUN npm install -g pnpm@11
WORKDIR /app

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
# 不传也能构建：packages/env/src/web.ts 给了 http://localhost:3002 的默认值。
ARG VITE_FARM_URL
ENV VITE_FARM_URL=${VITE_FARM_URL}
ENV NODE_ENV=production
RUN cd apps/web && pnpm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001

# SSR chunks require workspace dependencies at runtime
WORKDIR /app/apps/web
CMD ["node", ".output/server/index.mjs"]
