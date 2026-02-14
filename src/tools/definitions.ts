import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const environmentTools: Tool[] = [
  {
    name: "list_environments",
    description: "List all Portainer environments (Docker endpoints). Returns ID, name, status (up/down), type (docker/swarm), and URL for each environment. Use this first to get environment IDs needed for other tools.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "environment_dashboard",
    description: "Get a quick overview of an environment: container counts (running/stopped/healthy/unhealthy), total images and disk usage, volume count, network count, and stack count. Useful for health checks.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID (get from list_environments)" },
      },
      required: ["environment_id"],
    },
  },
];

export const containerTools: Tool[] = [
  {
    name: "list_containers",
    description: "List containers in an environment. By default only shows running containers. Returns ID, name, image, state, status, and exposed ports.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID (get from list_environments)" },
        all: { type: "boolean", description: "Include stopped containers (default: false, only running)" },
      },
      required: ["environment_id"],
    },
  },
  {
    name: "inspect_container",
    description: "Get detailed container info: full config, environment variables, labels, network settings (IPs, gateways), mount points, and current state.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        container_id: { type: "string", description: "Container ID (short or full) or container name" },
      },
      required: ["environment_id", "container_id"],
    },
  },
  {
    name: "container_logs",
    description: "Get recent logs from a container. Returns combined stdout/stderr output.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        container_id: { type: "string", description: "Container ID or name" },
        tail: { type: "number", description: "Number of lines from end (default: 100, max: 10000)" },
      },
      required: ["environment_id", "container_id"],
    },
  },
  {
    name: "container_action",
    description: "Control a container: start, stop, restart, kill, or remove it. Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        container_id: { type: "string", description: "Container ID or name" },
        action: { type: "string", enum: ["start", "stop", "restart", "kill", "remove"], description: "start=run stopped container, stop=graceful shutdown, restart=stop+start, kill=force stop, remove=delete container" },
      },
      required: ["environment_id", "container_id", "action"],
    },
  },
  {
    name: "container_stats",
    description: "Get real-time resource usage: CPU %, memory usage/limit/%, and network I/O. This is a point-in-time snapshot.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        container_id: { type: "string", description: "Container ID or name" },
      },
      required: ["environment_id", "container_id"],
    },
  },
];

export const stackTools: Tool[] = [
  {
    name: "list_stacks",
    description: "List all Docker Compose stacks. Returns ID, name, status (active/inactive), and environment ID for each stack.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Filter to only show stacks in this environment (optional)" },
      },
      required: [],
    },
  },
  {
    name: "inspect_stack",
    description: "Get full stack details: compose file content, environment variables, git config (if git-based), status, and environment ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        stack_id: { type: "number", description: "Stack ID (get from list_stacks)" },
      },
      required: ["stack_id"],
    },
  },
  {
    name: "stack_action",
    description: "Control a stack: start (deploy), stop (take down), or remove (delete). Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        stack_id: { type: "number", description: "Stack ID" },
        action: { type: "string", enum: ["start", "stop", "remove"], description: "start=deploy stack, stop=take down containers, remove=delete stack entirely" },
        environment_id: { type: "number", description: "Required for remove action" },
      },
      required: ["stack_id", "action"],
    },
  },
  {
    name: "create_stack",
    description: "Deploy a new Docker Compose stack. Provide compose YAML content and optional environment variables. Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Environment to deploy to" },
        name: { type: "string", description: "Stack name (must be unique)" },
        compose_content: { type: "string", description: "Docker Compose YAML (version, services, networks, volumes)" },
        env: {
          type: "array",
          description: "Environment variables injected into the stack (like .env file). Referenced in compose as ${VAR_NAME}.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Variable name (e.g., DB_PASSWORD)" },
              value: { type: "string", description: "Variable value" },
            },
            required: ["name", "value"],
          },
        },
      },
      required: ["environment_id", "name", "compose_content"],
    },
  },
  {
    name: "create_stack_from_git",
    description: "Deploy a new stack from a Git repository. Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        name: { type: "string", description: "Stack name" },
        repository_url: { type: "string", description: "Git repository URL" },
        compose_file: { type: "string", description: "Path to Compose file in repo" },
        reference_name: { type: "string", description: "Git reference (e.g. refs/heads/main)" },
        username: { type: "string", description: "Git username" },
        password: { type: "string", description: "Git password/token" },
        env: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
            },
            required: ["name", "value"],
          },
        },
      },
      required: ["environment_id", "name", "repository_url", "compose_file"],
    },
  },
  {
    name: "update_stack",
    description: "Update a deployed stack: change compose content, environment variables, or redeploy with latest images. Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        stack_id: { type: "number", description: "Stack ID to update" },
        environment_id: { type: "number", description: "Environment the stack is in" },
        compose_content: { type: "string", description: "New Docker Compose YAML content (optional, keeps existing if not provided)" },
        env: {
          type: "array",
          description: "New environment variables (replaces existing). Use inspect_stack first to get current values.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Variable name" },
              value: { type: "string", description: "Variable value" },
            },
            required: ["name", "value"],
          },
        },
        prune: { type: "boolean", description: "Remove services that are no longer defined in compose file" },
        pull_image: { type: "boolean", description: "Pull latest versions of all images before deploying" },
      },
      required: ["stack_id", "environment_id"],
    },
  },
  {
    name: "redeploy_stack",
    description: "Pull latest changes from git and redeploy a git-based stack. Only works for stacks created from a git repository. Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        stack_id: { type: "number", description: "Stack ID (must be a git-based stack)" },
        environment_id: { type: "number", description: "Environment the stack is in" },
        pull_image: { type: "boolean", description: "Also pull latest image versions" },
      },
      required: ["stack_id", "environment_id"],
    },
  },
  {
    name: "get_stack_by_name",
    description: "Look up a stack by name instead of ID. Returns same info as inspect_stack: compose content, env vars, git config, status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Exact stack name" },
      },
      required: ["name"],
    },
  },
];

export const imageTools: Tool[] = [
  {
    name: "list_images",
    description: "List all Docker images in an environment. Returns ID, tags, size (MB), and creation date.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
      },
      required: ["environment_id"],
    },
  },
  {
    name: "manage_image",
    description: "Pull a new image from a registry or remove an existing image. Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        action: { type: "string", enum: ["pull", "remove"], description: "pull=download from registry, remove=delete from host" },
        image: { type: "string", description: "For pull: image:tag (e.g., nginx:latest). For remove: image ID or name:tag" },
      },
      required: ["environment_id", "action", "image"],
    },
  },
];

export const volumeTools: Tool[] = [
  {
    name: "list_volumes",
    description: "List Docker volumes in an environment. Returns name, driver, and mount point for each volume.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
      },
      required: ["environment_id"],
    },
  },
  {
    name: "manage_volume",
    description: "Create a new volume or remove an existing one. Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        action: { type: "string", enum: ["create", "remove"], description: "create=new volume, remove=delete volume (fails if in use)" },
        name: { type: "string", description: "Volume name" },
      },
      required: ["environment_id", "action", "name"],
    },
  },
];

export const networkTools: Tool[] = [
  {
    name: "list_networks",
    description: "List Docker networks in an environment. Returns ID, name, driver, scope, and subnet for each network.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
      },
      required: ["environment_id"],
    },
  },
  {
    name: "manage_network",
    description: "Create a new network or remove an existing one. Requires PORTAINER_WRITE_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        action: { type: "string", enum: ["create", "remove"], description: "create=new network, remove=delete network (fails if in use)" },
        name: { type: "string", description: "For create: network name. For remove: network name or ID" },
        subnet: { type: "string", description: "For create only: CIDR subnet (e.g., 172.20.0.0/16). Optional - Docker assigns one if not specified." },
      },
      required: ["environment_id", "action", "name"],
    },
  },
];

export const systemTools: Tool[] = [
  {
    name: "system_info",
    description: "Get Portainer server info: version, edition (CE/EE), platform, update availability, and connected agent counts.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_registries",
    description: "List configured Docker registries (Docker Hub, GitHub, GitLab, ECR, etc.). Returns name, URL, type, and authentication status.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

export const allTools: Tool[] = [
  ...environmentTools,
  ...containerTools,
  ...stackTools,
  ...imageTools,
  ...volumeTools,
  ...networkTools,
  ...systemTools,
];
