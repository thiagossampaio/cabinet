#!/bin/bash
set -e

# Install Claude Code CLI if not present
# Uses --prefix /usr/local so the binary lands in /usr/local/bin/claude
# which is already in PATH and searched by terminal-server and cabinet-daemon
if ! command -v claude &> /dev/null; then
    echo "[entrypoint] Claude Code CLI not found — installing @anthropic-ai/claude-code..."
    npm install -g --prefix /usr/local @anthropic-ai/claude-code
    echo "[entrypoint] Claude Code CLI installed: $(claude --version 2>/dev/null || echo 'ok')"
else
    echo "[entrypoint] Claude Code CLI already present: $(claude --version 2>/dev/null || echo 'found')"
fi

# Install Codex CLI if not present
if ! command -v codex &> /dev/null; then
    echo "[entrypoint] Codex CLI not found — installing @openai/codex..."
    npm install -g --prefix /usr/local @openai/codex
    echo "[entrypoint] Codex CLI installed."
else
    echo "[entrypoint] Codex CLI already present."
fi

echo "[entrypoint] Starting Cabinet..."
exec npm run start
