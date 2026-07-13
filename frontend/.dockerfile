# ── Stage 1: build shared ──────────────────────────────────────────────
FROM node:24-alpine AS shared-builder
WORKDIR /app/shared
COPY shared/package*.json ./
RUN npm ci
COPY shared/ ./
RUN npm run build

# ── Stage 2: development ───────────────────────────────────────────────
FROM node:24-alpine AS development
WORKDIR /app

# Copy built shared library dependency
COPY --from=shared-builder /app/shared ./shared

# Copy frontend packages and install all dependencies (including devDependencies)
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm ci

# Copy frontend source files (necessary for the dev server to access source code)
COPY frontend/ ./

EXPOSE 5173

# Run the Vite development server with external host accessibility
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]