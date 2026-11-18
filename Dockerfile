# ==============================================================================
# SharVin Platform - Production Multi-Stage Dockerfile
# Architected for minimal image size, zero devDependencies, and non-root security.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Client Web Application Build
# ------------------------------------------------------------------------------
FROM node:22-alpine AS client-builder
WORKDIR /app

# Copy root workspace configurations
COPY package*.json ./
COPY client/package*.json ./client/

# Install root & workspace dependencies
RUN npm ci

# Copy client source code
COPY client/ ./client/

# Build client production bundle
RUN npm run build --workspace=client

# ------------------------------------------------------------------------------
# Stage 2: Server API Build & Prisma Generation
# ------------------------------------------------------------------------------
FROM node:22-alpine AS server-builder
WORKDIR /app

# Copy package descriptors
COPY package*.json ./
COPY server/package*.json ./server/
COPY server/prisma/ ./server/prisma/

# Install dependencies including devDependencies for TypeScript compilation
RUN npm ci

# Generate Prisma Client
RUN npm run prisma:generate --workspace=server

# Copy server source code & tsconfigs
COPY server/ ./server/

# Compile TypeScript into dist/
RUN npm run build --workspace=server

# ------------------------------------------------------------------------------
# Stage 3: Production Minimal Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Install dumb-init or curl for container health check
RUN apk add --no-cache curl

# Copy root package.json
COPY package*.json ./
COPY server/package*.json ./server/
COPY server/prisma/ ./server/prisma/

# Install ONLY production dependencies in server workspace
RUN npm ci --omit=dev --workspace=server

# Copy compiled server distribution and generated Prisma client
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=server-builder /app/node_modules/@prisma ./node_modules/@prisma

# Optional: Copy client static build for single-container serving or volume sharing
COPY --from=client-builder /app/client/dist ./client/dist

# Switch to non-root unprivileged user
USER node

# Expose API and WebSocket Port
EXPOSE 5000

# Container Healthcheck against Express health route
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/v1/health || exit 1

# Launch production server
CMD ["node", "server/dist/index.js"]
