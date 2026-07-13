# ── Stage 1: build shared ──────────────────────────────────────────────
FROM node:24-alpine AS shared-builder
WORKDIR /app/shared
COPY shared/package*.json ./
RUN npm ci
COPY shared/ ./
RUN npm run build

# ── Stage 2: build backend ─────────────────────────────────────────────
FROM node:24-alpine AS backend-builder
WORKDIR /app
COPY --from=shared-builder /app/shared ./shared
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci
COPY backend/ ./
RUN npm run build

# ── Stage 3: production ────────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy package files and lock file from builder (not from host context)
COPY --from=backend-builder /app/backend/package*.json ./
COPY --from=backend-builder /app/backend/node_modules ./node_modules

# Remove dev dependencies
RUN npm prune --omit=dev

COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/migrations ./migrations
COPY --from=backend-builder /app/backend/scripts ./scripts
COPY --from=shared-builder /app/shared ./shared

COPY backend/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]