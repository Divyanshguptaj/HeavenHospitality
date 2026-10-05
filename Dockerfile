FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @heaven/api...

RUN pnpm --filter @heaven/api run db:generate
RUN pnpm --filter @heaven/api... run build

ENV NODE_ENV=production
EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
