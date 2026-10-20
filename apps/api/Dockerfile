# --- Stage 1: Install dependencies ---
# Node 24 matches .nvmrc. pnpm is pinned by root package.json
# ("packageManager": "pnpm@11.18.0"); that pnpm requires node:sqlite, which
# does not exist in Node 20, so corepack must not be pinned to pnpm@9 here.
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

# Copy root workspace files. tsconfig.base.json is required: apps/api/tsconfig.json
# extends ../../tsconfig.base.json and without it tsc falls back to its default
# (target ES5) and the build fails.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy API package.json. tsconfig.build.json is the config `nest build` uses by
# default; it excludes **/*.spec.ts (the specs are type-checked by the CI
# tsconfig, not by the production build).
COPY apps/api/package.json apps/api/tsconfig.build.json ./apps/api/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile --filter api...

# --- Stage 2: Build ---
FROM base AS build
COPY apps/api/tsconfig.json apps/api/nest-cli.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/src ./apps/api/src

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build NestJS
RUN cd apps/api && pnpm run build

# --- Stage 3: Production ---
FROM node:24-slim AS production
RUN corepack enable

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter api... --prod

# Copy built output
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Copy Prisma schema and generated client
COPY apps/api/prisma ./apps/api/prisma
RUN cd apps/api && npx prisma generate

# Copy seed files (needed for runtime)
COPY apps/api/prisma/templates-seed.json ./apps/api/prisma/

# Set working directory to API
WORKDIR /app/apps/api

# AUTO-SAFETY-002: default outbound-send policy is DENY, baked into the image so
# it can never boot with real sends enabled because a variable was forgotten.
# Real sends require OUTBOUND_SEND_ENABLED=ENABLED *plus* an explicit
# organization allowlist, an explicit channel allowlist and a non-expired
# OUTBOUND_SEND_UNTIL window. docker-compose declares the variable explicitly,
# which overrides this default.
ENV OUTBOUND_SEND_ENABLED=DENIED

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/api/v1/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })" || exit 1

# Start production server
CMD ["node", "dist/main"]
