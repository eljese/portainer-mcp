# Portainer MCP Server Design

## Overview

An MCP (Model Context Protocol) server that provides Claude and other MCP clients with tools to interact with Portainer for Docker container management.

## Requirements

- **Platform:** Docker Standalone only (no Swarm, no Kubernetes)
- **Features:** Full Docker suite - environments, containers, stacks, images, volumes, networks, registries
- **Container ops:** Full management (list, inspect, logs, stats, start/stop/restart, create, remove)
- **Language:** TypeScript/Node with official MCP SDK
- **Package Manager:** pnpm
- **Auth:** API Key + URL via environment variables
- **Safety:** Read-only by default, write operations require opt-in via `PORTAINER_WRITE_ENABLED=true`

## Architecture

**Hybrid smart approach:** Common operations as individual tools, complex/write operations grouped.

### Tool Organization

**Read-only tools (always available):**

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_environments` | none | id, name, status, type, URL |
| `list_containers` | `environment_id`, optional `all` (include stopped) | id, name, image, state, ports |
| `inspect_container` | `environment_id`, `container_id` | Full container details |
| `container_logs` | `environment_id`, `container_id`, optional `tail` (lines) | Log output |
| `list_stacks` | optional `environment_id` filter | id, name, status, environment |
| `inspect_stack` | `stack_id` | Stack details + compose file content |
| `list_images` | `environment_id` | id, tags, size, created |
| `list_volumes` | `environment_id` | name, driver, mountpoint |
| `list_networks` | `environment_id` | id, name, driver, subnet |

**Write tools (require PORTAINER_WRITE_ENABLED=true):**

| Tool | Parameters | Actions |
|------|------------|---------|
| `container_action` | `environment_id`, `container_id`, `action` | start, stop, restart, kill, remove |
| `stack_action` | `stack_id`, `action` | start, stop, redeploy, remove |
| `create_stack` | `environment_id`, `name`, `compose_content` | Creates standalone stack |
| `manage_image` | `environment_id`, `action`, `image` | pull, remove |
| `manage_volume` | `environment_id`, `action`, `name` | create, remove |
| `manage_network` | `environment_id`, `action`, `name`, optional `subnet` | create, remove |

## Project Structure

```
portainer-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── client.ts             # Portainer API client
│   ├── tools/
│   │   ├── environments.ts   # Environment tools
│   │   ├── containers.ts     # Container tools
│   │   ├── stacks.ts         # Stack tools
│   │   ├── images.ts         # Image tools
│   │   ├── volumes.ts        # Volume tools
│   │   └── networks.ts       # Network tools
│   └── types.ts              # TypeScript types from OpenAPI
├── package.json
├── tsconfig.json
└── README.md
```

## API Client Design

- Single `PortainerClient` class wrapping all API calls
- Constructor takes URL + API key
- Methods return typed responses
- Handles authentication header injection
- Error handling with meaningful messages

```typescript
// All tools receive the client instance
const client = new PortainerClient(url, apiKey);

// Tools call client methods
async function listContainers(envId: number) {
  return client.getContainers(envId);
}
```

**Write Protection:**
- Client checks `PORTAINER_WRITE_ENABLED` before any mutating call
- Returns clear error: "Write operations disabled. Set PORTAINER_WRITE_ENABLED=true"

## Error Handling

**API Errors:**
- 401 Unauthorized → "Invalid API key or expired token"
- 404 Not Found → "Resource not found: {type} {id}"
- 403 Forbidden → "Insufficient permissions for this operation"
- Connection errors → "Cannot connect to Portainer at {url}"

**Validation:**
- Missing `environment_id` when required → Clear error listing available environments
- Invalid `action` parameter → List valid actions for that tool
- Environment doesn't exist → "Environment {id} not found. Use list_environments to see available."

**Edge Cases:**
- Container names with special characters → Handle URL encoding
- Large log output → Default `tail=100`, max `tail=10000`
- Stack compose file retrieval → Return raw YAML content as string
- Empty results → Return empty array, not error

**Timeout Handling:**
- Default 30s timeout for API calls
- Log operations: 60s timeout (can be slow for large logs)

**Response Format:**
- All tools return JSON objects
- Lists return `{ items: [...], count: N }`
- Single items return the object directly
- Errors return `{ error: "message", code: "ERROR_CODE" }`

## Configuration

**Environment Variables:**
```bash
PORTAINER_URL=https://portainer.example.com   # Required
PORTAINER_API_KEY=ptr_xxxxxxxxxxxxxx          # Required
PORTAINER_WRITE_ENABLED=true                   # Optional, default false
```

**MCP Client Configuration (Claude Desktop example):**
```json
{
  "mcpServers": {
    "portainer": {
      "command": "pnpm",
      "args": ["dlx", "portainer-mcp"],
      "env": {
        "PORTAINER_URL": "https://portainer.example.com",
        "PORTAINER_API_KEY": "ptr_xxx"
      }
    }
  }
}
```

## Dependencies

- `@modelcontextprotocol/sdk` - Official MCP SDK
- `zod` - Schema validation for tool parameters
- No other runtime dependencies (fetch is built-in to Node 18+)

## Typical Workflow

1. `list_environments` → Get environment IDs
2. `list_containers(env_id)` → See what's running
3. `inspect_container(env_id, container_id)` → Get details
4. `container_logs(env_id, container_id, tail=50)` → Debug issues
