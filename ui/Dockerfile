# syntax=docker/dockerfile:1
# Multi-stage build
# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Install Python and build dependencies for native modules
# This helps with ARM64 builds and native module compilation
RUN apk add --no-cache python3 make g++ libc6-compat

# LOCAL PATCH: domestic npm mirror. Direct registry.npmjs.org access from CN
# idle-times out at ~450s (npm error code EIDLETIMEOUT). package-lock.json
# resolves everything to registry.npmjs.org, but npm's `replace-registry-host`
# rewrites those URLs to NPM_CONFIG_REGISTRY automatically, so no lock edits
# are needed. Revert with `git checkout ui/Dockerfile` if upstream polish matters.
ENV NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
ENV NPM_CONFIG_FETCH_TIMEOUT="600000"
ENV NPM_CONFIG_FETCH_RETRIES="5"
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT="20000"
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT="120000"

# Copy package files
COPY ui/package*.json ./

# Clean install with proper handling of native modules
RUN --mount=type=cache,target=/root/.npm npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install libc6-compat for native modules in builder stage too
RUN apk add --no-cache libc6-compat

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all files needed for build
COPY ui/package*.json ./
COPY ui/tsconfig.json ./
COPY ui/next.config.ts ./
COPY ui/components.json ./
COPY ui/sentry.edge.config.ts ./
COPY ui/sentry.server.config.ts ./
COPY ui/postcss.config.mjs ./
COPY ui/public ./public
COPY ui/src ./src
# Translation catalogs, resolved by src/i18n/request.ts via
# `import('../../messages/<locale>.json')`. The build context is the repo root
# and this stage copies an explicit allowlist, so without this line `next build`
# fails to resolve the message imports. The JSON ends up inlined into the
# .next/server chunks by webpack, so the runner stage needs no copy.
COPY ui/messages ./messages

# Set build-time environment variables (needed for Next.js build)
ENV NEXT_PUBLIC_NODE_ENV="oss"
ENV NEXT_TELEMETRY_DISABLED="1"
ENV NEXT_PUBLIC_CHATWOOT_URL="https://chat.dograh.com"
ENV NEXT_PUBLIC_CHATWOOT_TOKEN="3fkFx2mCEjNHjM9gaNc4A82X"
ENV BACKEND_URL="http://api:8000"

# Build the application with standalone mode
# Increase Node.js heap size to prevent out-of-memory errors during build
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build && \
    rm -rf /tmp/* /root/.npm /root/.next/cache

# Stage 3: Runner (production image)
FROM node:22-alpine AS runner
WORKDIR /app

# Environment variables will be provided by docker-compose
ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Switch to non-root user
USER nextjs

# Expose the port Next.js runs on
EXPOSE 3010

# Start the production server using the standalone Node.js server
CMD sh -c "echo '🚀 Application ready at http://localhost:3010' && PORT=3010 node server.js"
