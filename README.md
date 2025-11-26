# Portainer MCP Server

An MCP (Model Context Protocol) server that provides tools to interact with Portainer for Docker container management.

## Features

- **Environments**: List and inspect Portainer environments
- **Containers**: List, inspect, logs, start/stop/restart/kill/remove
- **Stacks**: List, inspect, create, start/stop/remove
- **Images**: List, pull, remove
- **Volumes**: List, create, remove
- **Networks**: List, create, remove

## Installation

```bash
pnpm install
pnpm build
```

## Configuration

Set these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORTAINER_URL` | Yes | Portainer instance URL (e.g., `https://portainer.example.com`) |
| `PORTAINER_API_KEY` | Yes | Portainer API key |
| `PORTAINER_WRITE_ENABLED` | No | Set to `true` to enable write operations (default: `false`) |

### Getting a Portainer API Key

1. Log into Portainer
2. Go to **My Account** → **Access Tokens**
3. Click **Add access token**
4. Copy the generated token

## Usage with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "portainer": {
      "command": "node",
      "args": ["/path/to/portainer-mcp/dist/index.js"],
      "env": {
        "PORTAINER_URL": "https://portainer.example.com",
        "PORTAINER_API_KEY": "ptr_your_api_key_here"
      }
    }
  }
}
```

To enable write operations:

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
| `list_environments` | List all Portainer environments |
| `list_containers` | List containers in an environment |
| `inspect_container` | Get container details |
| `container_logs` | Get container logs |
| `list_stacks` | List all stacks |
| `inspect_stack` | Get stack details + compose file |
| `list_images` | List images |
| `list_volumes` | List volumes |
| `list_networks` | List networks |

### Write Operations (Require `PORTAINER_WRITE_ENABLED=true`)

| Tool | Description |
|------|-------------|
| `container_action` | Start, stop, restart, kill, or remove a container |
| `stack_action` | Start, stop, or remove a stack |
| `create_stack` | Create a new Docker Compose stack |
| `manage_image` | Pull or remove an image |
| `manage_volume` | Create or remove a volume |
| `manage_network` | Create or remove a network |

## Example Workflows

### Check what's running

1. `list_environments` → Get environment IDs
2. `list_containers(environment_id=1)` → See containers
3. `container_logs(environment_id=1, container_id="abc123")` → View logs

### Deploy a stack

```
create_stack(
  environment_id=1,
  name="my-app",
  compose_content="version: '3'\nservices:\n  web:\n    image: nginx"
)
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm dev
```

## Project Structure

```
src/
├── types.ts           # Type definitions
├── client.ts          # Portainer API client
├── schemas.ts         # Zod validation schemas
├── index.ts           # MCP server entry point
└── tools/
    ├── definitions.ts # Tool JSON Schema definitions
    ├── index.ts       # Tool registry and dispatch
    ├── utils.ts       # Response formatting
    ├── environments.ts
    ├── containers.ts
    ├── stacks.ts
    ├── images.ts
    ├── volumes.ts
    └── networks.ts
```

## License

MIT
