FROM node:24-slim AS builder
RUN npm install -g pnpm@11
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
RUN cd apps/farm && pnpm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

EXPOSE 3002

WORKDIR /app/apps/farm
CMD ["node", "dist/index.mjs"]
