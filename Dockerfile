FROM node:22-slim

# Dependencies for native modules (node-pty, better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 python3-dev make g++ gcc git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./

# Install project dependencies
RUN npm ci

# Install CLIs globally — land in /usr/local/bin (already searched by cabinet-daemon and terminal-server)
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000 3001

CMD ["/bin/bash", "scripts/docker-entrypoint.sh"]
