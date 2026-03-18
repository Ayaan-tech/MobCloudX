# ─────────────────────────────────────────────────────────────
# MobCloudX — Client Dashboard (Next.js)
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# ── Dependency layer ────────────────────────────────────────
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build layer ─────────────────────────────────────────────
COPY . .

# Clerk + MongoDB env vars required at build-time for Next.js static generation
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLERK_SECRET_KEY
ARG MONGODB_URI
ARG DB_NAME=test
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV MONGODB_URI=$MONGODB_URI
ENV DB_NAME=$DB_NAME

RUN pnpm build

# ── Production image ────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
