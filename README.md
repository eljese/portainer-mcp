# Portainer MCP Server

An MCP (Model Context Protocol) server that enables AI assistants like Claude to manage Docker containers through Portainer's API.

> **Fair Warning:** This project has been thoroughly *vibe coded*. What does that mean? It means I built this for my own personal use and experimentation, guided primarily by vibes and AI-assisted development. Use at your own risk. Feel free to submit issues, but be aware they will be *vibe fixed* as well. No guarantees, no SLAs, just vibes.

## What is this?

This MCP server acts as a bridge between AI models and your Portainer instance. Once connected, your AI assistant can:

- List and inspect your Docker environments, containers, stacks, images, volumes, and networks
- View container logs
- Perform actions like starting, stopping, and removing containers
- Deploy new Docker Compose stacks
- Manage Docker resources (images, volumes, networks)

All write operations are disabled by default and must be explicitly enabled.

## Quick Start

### Docker (Recommended)

```bash
# Build the image
docker build -t portainer-mcp .

# Test it works
docker run --rm \
  -e PORTAINER_URL=https://portainer.example.com \
  -e PORTAINER_API_KEY=ptr_your_key_here \
  portainer-mcp
```

### Node.js

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run
PORTAINER_URL=https://portainer.example.com \
PORTAINER_API_KEY=ptr_your_key_here \
node dist/index.js
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORTAINER_URL` | Yes | - | Your Portainer instance URL |
| `PORTAINER_API_KEY` | Yes | - | Portainer API access token |
| `PORTAINER_WRITE_ENABLED` | No | `false` | Set to `true` to enable write operations |

### Getting a Portainer API Key

1. Log into Portainer
2. Go to **My Account** → **Access Tokens**
3. Click **Add access token**
4. Give it a descriptive name and copy the generated token

## Claude Desktop Integration

Add to your Claude Desktop config:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Using Docker

```json
{
  "mcpServers": {
    "portainer": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "PORTAINER_URL=https://portainer.example.com",
        "-e", "PORTAINER_API_KEY=ptr_your_api_key_here",
        "-e", "PORTAINER_WRITE_ENABLED=true",
        "portainer-mcp"
      ]
    }
  }
}
```

### Using Node.js

```json
{
  "mcpServers": {
    "portainer": {
      "command": "node",
      "args": ["/path/to/portainer-mcp/dist/index.js"],
      "env": {
        "PORTAINER_URL": "https://portainer.example.com",
        "PORTAINER_API_KEY": "ptr_your_api_key_here",
        "PORTAINER_WRITE_ENABLED": "true"
      }
    }
  }
}
```

## Available Tools

### Read-Only (Always Available)

| Tool | Description |
|------|-------------|
| `list_environments` | List all Portainer environments (Docker endpoints) |
| `list_containers` | List containers in an environment (optionally include stopped) |
| `inspect_container` | Get detailed information about a container |
| `container_logs` | Get container logs (default 100 lines, max 10,000) |
| `list_stacks` | List all stacks (optionally filter by environment) |
| `inspect_stack` | Get stack details including the compose file content |
| `list_images` | List Docker images in an environment |
| `list_volumes` | List Docker volumes in an environment |
| `list_networks` | List Docker networks in an environment |

### Write Operations (Require `PORTAINER_WRITE_ENABLED=true`)

| Tool | Description |
|------|-------------|
| `container_action` | Start, stop, restart, kill, or remove a container |
| `stack_action` | Start, stop, or remove a stack |
| `create_stack` | Create a new Docker Compose stack |
| `manage_image` | Pull or remove a Docker image |
| `manage_volume` | Create or remove a Docker volume |
| `manage_network` | Create or remove a Docker network (with optional custom subnet) |

## Example Workflows

### Check what's running

```
You: What containers are running in my environment?

Claude: Let me check...
→ list_environments
→ list_containers(environment_id=1)

You have 5 containers running:
- nginx (Up 2 days)
- postgres (Up 2 days)
- redis (Up 5 hours)
...
```

### View logs for a problematic container

```
You: Show me the last 50 lines of logs from the api container

Claude:
→ container_logs(environment_id=1, container_id="api", tail=50)
```

### Deploy a new stack

```
You: Deploy an nginx container as a stack called "webserver"

Claude:
→ create_stack(
    environment_id=1,
    name="webserver",
    compose_content="services:\n  web:\n    image: nginx:latest\n    ports:\n      - '8080:80'"
  )
```

## Development

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Watch mode (rebuild on changes)
pnpm dev

# Run tests
pnpm test

# Bundle for distribution
pnpm bundle

# Build Docker image
docker build -t portainer-mcp .
```

## Project Structure

```
src/
├── index.ts           # MCP server entry point
├── client.ts          # Portainer API client
├── types.ts           # TypeScript type definitions
├── schemas.ts         # Zod validation schemas
└── tools/
    ├── index.ts       # Tool registry and dispatcher
    ├── definitions.ts # MCP tool JSON Schema definitions
    ├── utils.ts       # Response formatting utilities
    ├── environments.ts
    ├── containers.ts
    ├── stacks.ts
    ├── images.ts
    ├── volumes.ts
    └── networks.ts
```

## Tech Stack

- **TypeScript** - Type safety throughout
- **@modelcontextprotocol/sdk** - MCP protocol implementation
- **Zod** - Runtime validation of tool arguments
- **Node.js 18+** - Runtime requirement
- **Docker** - Optimized multi-stage build (~148MB image)

## License

MIT
