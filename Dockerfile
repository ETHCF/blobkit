# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json tsconfig*.json ./
# COPY packages/contracts/package*.json ./packages/contracts/
COPY packages/proxy-server/package*.json ./packages/proxy-server/
COPY packages/sdk/package*.json ./packages/sdk/

# Install dependencies
RUN npm ci --workspace=packages/proxy-server --workspace=packages/sdk

# Copy source code
# COPY packages/contracts ./packages/contracts

COPY packages/proxy-server ./packages/proxy-server
COPY packages/sdk ./packages/sdk

# Build packages
WORKDIR /app/packages/sdk
RUN npm run build
WORKDIR /app
RUN npm run build --workspace=packages/proxy-server

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/proxy-server/package*.json ./packages/proxy-server/
COPY packages/sdk/package*.json ./packages/sdk/

RUN npm ci --workspace=packages/proxy-server --workspace=packages/sdk --production

# Copy built artifacts
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=builder /app/packages/proxy-server/dist ./packages/proxy-server/dist

# Copy necessary runtime files
COPY packages/proxy-server/openapi.yaml ./packages/proxy-server/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start proxy server
CMD ["node", "packages/proxy-server/dist/index.js"]
