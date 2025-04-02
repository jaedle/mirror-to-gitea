# Build stage
FROM node:lts-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev dependencies needed for build)
RUN npm ci

# Copy source code
COPY --chown=node:node . .

# Build the application with minification
RUN npm run build -- --minify

# Prune dependencies stage
FROM node:lts-alpine AS deps

WORKDIR /app

# Copy package files
COPY --from=builder /app/package.json /app/package-lock.json ./

# Install production dependencies only
RUN npm install --omit=dev --production && \
    # Remove unnecessary npm cache and temp files to reduce size
    npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# Production stage
FROM node:lts-alpine AS production

# Add Docker Alpine packages and remove cache in the same layer
RUN apk --no-cache add ca-certificates tini && \
    rm -rf /var/cache/apk/*

# Set non-root user for better security
USER node

# Set working directory owned by node user
WORKDIR /app

# Copy only the built application and entry point from builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/docker-entrypoint.sh .

# Copy only production node_modules
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Make entry point executable
RUN chmod +x /app/docker-entrypoint.sh

# Set environment to production to disable development features
ENV NODE_ENV=production

# Use tini as init system to properly handle signals
ENTRYPOINT ["/sbin/tini", "--"]

# The command to run
CMD [ "/app/docker-entrypoint.sh" ]
