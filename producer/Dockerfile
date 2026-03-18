# ─────────────────────────────────────────────────────────────
# MobCloudX — Producer Service
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# ── Dependency layer (cached unless lockfile changes) ───────
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build layer ─────────────────────────────────────────────
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# ── Production image ────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/index.js"]
