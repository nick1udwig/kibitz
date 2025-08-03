# ============================================================================
# Multi-stage Dockerfile for Kibitz + ws-mcp Development Environment
# Optimized for production with industry best practices
# ============================================================================

# Stage 1: Base image with common dependencies
FROM ubuntu:24.04 AS base

# Metadata
LABEL maintainer="kibitz-team"
LABEL description="Kibitz LLM Chat + ws-mcp WebSocket Service"
LABEL version="1.0.0"

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Update and install essential packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Basic utilities
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    # Build tools
    build-essential \
    cmake \
    pkg-config \
    libssl-dev \
    # Network tools for debugging
    net-tools \
    netcat-openbsd \
    iputils-ping \
    # System libraries
    libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# ============================================================================
# Stage 2: Python environment for ws-mcp
# ============================================================================
FROM base AS python-base

# Install Python 3.12 and related tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.12 \
        python3.12-dev \
        python3.12-venv \
        python3-pip \
        git \
        build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Python 3 as default and verify version
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3 1
RUN python3 --version && pip3 --version

# Install uv package manager and ensure it's in PATH
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    cp /root/.local/bin/uv /usr/local/bin/uv && \
    cp /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uv /usr/local/bin/uvx && \
    ln -sf /usr/local/bin/uv /usr/bin/uv && \
    ln -sf /usr/local/bin/uvx /usr/bin/uvx
ENV PATH="/root/.cargo/bin:/root/.local/bin:/usr/local/bin:${PATH}"

# Install essential Python packages
RUN pip3 install --no-cache-dir --break-system-packages \
    requests \
    fastapi \
    uvicorn \
    websockets \
    websocket-client \
    pydantic

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# Stage 3: Node.js environment for Kibitz
# ============================================================================
FROM python-base AS node-base

# Install Node.js 20.x LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Verify Node.js installation
RUN node --version && npm --version

# Install yarn and pnpm globally
RUN npm install -g yarn pnpm --no-audit --no-fund

# ============================================================================
# Stage 4: Dependencies installation
# ============================================================================
FROM node-base AS deps

# Create app user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser


RUN mkdir -p /app/kibitz /Users/test/gitrepo/projects /app/logs /app/scripts /app/config
RUN chown -R appuser:appuser /app/kibitz /Users/test/gitrepo/projects /app/logs /app/scripts /app/config


# Set working directory
WORKDIR /app/kibitz

# Install production dependencies only initially
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --no-audit --no-fund && \
    npm rebuild better-sqlite3

# ============================================================================
# Stage 5: Build stage for Next.js application
# ============================================================================
FROM deps AS build

# Install all dependencies (including dev dependencies for build)
RUN npm ci --no-audit --no-fund && \
    npm rebuild better-sqlite3

# Copy source code
COPY . .

# Copy missing configuration files that are essential for CSS/styling
COPY postcss.config.mjs ./
COPY tailwind.config.ts ./
COPY eslint.config.mjs ./

# Build the Next.js application
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PHASE=phase-production-build
RUN npm run build

# ============================================================================
# Stage 6: Production runtime
# ============================================================================
# Runtime stage
FROM node-base AS runtime

# Install Python and uv for ws-mcp support
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.12 \
        python3.12-dev \
        python3.12-venv \
        python3-pip \
        git \
        build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Python 3 as default and verify version
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3 1

# Verify Python installation
RUN python3 --version && pip3 --version

# Install uv package manager and ensure it's in PATH
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    cp /root/.local/bin/uv /usr/local/bin/uv && \
    cp /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uv /usr/local/bin/uvx && \
    ln -sf /usr/local/bin/uv /usr/bin/uv && \
    ln -sf /usr/local/bin/uvx /usr/bin/uvx
ENV PATH="/root/.cargo/bin:/root/.local/bin:/usr/local/bin:${PATH}"

# Install Python dependencies for ws-mcp
RUN pip3 install --no-cache-dir --break-system-packages \
    requests \
    websockets \
    asyncio

# Install GitHub CLI in runtime stage
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -m appuser

# Create necessary directories
RUN mkdir -p /app/kibitz /Users/test/gitrepo/projects /app/logs /app/scripts /app/config

RUN chown -R appuser:appuser /app/kibitz /Users/test/gitrepo/projects /app/logs /app/scripts /app/config

# Set working directory
WORKDIR /app/kibitz

# Copy built application and dependencies
COPY --from=deps --chown=appuser:appuser /app/kibitz/node_modules ./node_modules
COPY --from=deps --chown=appuser:appuser /app/kibitz/package*.json ./
COPY --from=build --chown=appuser:appuser /app/kibitz/.next ./.next
COPY --from=build --chown=appuser:appuser /app/kibitz/public ./public
COPY --from=build --chown=appuser:appuser /app/kibitz/next.config.ts ./
COPY --from=build --chown=appuser:appuser /app/kibitz/tsconfig.json ./

# Copy source files and data
COPY --chown=appuser:appuser src ./src
COPY --chown=appuser:appuser data ./data

# Copy root-level JavaScript files needed for GitHub sync functionality
COPY --chown=appuser:appuser project-json-manager.js ./
COPY --chown=appuser:appuser github-sync-api.js ./
COPY --chown=appuser:appuser github-sync-manager.js ./
COPY --chown=appuser:appuser github-sync-scheduler.js ./
COPY --chown=appuser:appuser sync-detection-service.js ./

# Copy CSS/styling configuration files
COPY --chown=appuser:appuser postcss.config.mjs ./
COPY --chown=appuser:appuser tailwind.config.ts ./
COPY --chown=appuser:appuser eslint.config.mjs ./

# Copy Docker scripts and config
COPY --chown=appuser:appuser docker/scripts/ /app/scripts/
COPY --chown=appuser:appuser docker/config/ /app/config/

# Clone ws-mcp repository
RUN cd /app && \
    git clone https://github.com/nick1udwig/ws-mcp.git && \
    chown -R appuser:appuser /app/ws-mcp

# Patch ws-mcp to listen on all interfaces instead of just localhost
RUN sed -i 's/"localhost"/"0.0.0.0"/g' /app/ws-mcp/src/ws_mcp/__init__.py && \
    sed -i 's/ws:\/\/localhost/ws:\/\/0.0.0.0/g' /app/ws-mcp/src/ws_mcp/__init__.py

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

# Configure Git with simplified authentication
RUN git config --global user.name "malikrohail" && \
    git config --global user.email "malikrohail525@gmail.com" && \
    git config --global init.defaultBranch main && \
    git config --global pull.rebase false && \
    git config --global credential.helper store

# Fix ownership of all files for appuser
RUN chown -R appuser:appuser /app/kibitz /app/ws-mcp /Users/test/gitrepo/projects /app/logs /app/scripts /app/config 

# Switch to non-root user for security
USER appuser

# Expose ports
EXPOSE 3000 10125

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Health check - check if Kibitz frontend is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/storage || exit 1

# Default command
CMD ["/app/scripts/start-services.sh"] 