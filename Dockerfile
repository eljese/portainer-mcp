FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy source files
COPY package.json bun.lockb* ./
COPY src ./src
COPY tsconfig.json ./

# Install deps and compile to standalone binary
RUN bun install --frozen-lockfile || bun install
RUN bun build src/index.ts --compile --outfile=portainer-mcp

# Minimal runtime - just the binary
FROM alpine:3.21

# Add CA certificates for HTTPS and required libs for Bun binary
RUN apk add --no-cache ca-certificates libstdc++ libgcc

WORKDIR /app
COPY --from=builder /app/portainer-mcp ./portainer-mcp

# MCP servers communicate via stdio
ENTRYPOINT ["./portainer-mcp"]
