# ── Stage: Production ─────────────────────────────────────────────────────────
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files first (layer cache)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY server.js ./
COPY src/ ./src/

# Create uploads directory (for transient local use; use GCS in prod)
RUN mkdir -p uploads/videos uploads/audio

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN chown -R appuser:appgroup /app
USER appuser

# Cloud Run sets PORT env var automatically
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
