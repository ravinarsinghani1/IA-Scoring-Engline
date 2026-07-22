# Long-running Express API for Fly.io (region syd).
#
# This runs ONLY the backend. The Vite SPA continues to be served as static
# assets by Vercel; only the API moved here so generation can hold an SSE
# connection for minutes without a serverless/proxy request timeout.
#
# Build context is server/ (run `fly deploy` from server/), so every COPY path
# below is relative to server/. Nothing outside server/ is needed — the app is
# self-contained under src/.

FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies only. No dev/test deps are needed at runtime;
# the test suite runs in CI/locally, never in the image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application source. Tests, scripts, and .env are excluded via .dockerignore.
COPY src ./src

# Fly routes to this port (see fly.toml internal_port); index.js honours PORT.
EXPOSE 8080

CMD ["node", "src/index.js"]
