FROM python:3.12-slim

# Install minimal deps for uv and MCP servers
RUN apt-get update && apt-get install -y \
    curl \
    git \
    socat \
  && rm -rf /var/lib/apt/lists/*

# Install uv (Python package manager / runner used by ws-mcp)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Workspace mount point (your local project will be mounted here)
WORKDIR /workspace

EXPOSE 10125

# Start a TCP forwarder on 0.0.0.0:10125 to the ws-mcp loopback port
# and run ws-mcp (which binds to localhost) on 10126 with verbose logs
CMD ["sh", "-lc", "socat TCP-LISTEN:10125,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:10126 & uvx --refresh ws-mcp@latest --port 10126 --log-level DEBUG"]


