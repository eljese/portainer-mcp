#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PortainerClient, PortainerClientError } from "./client.js";

// Environment validation
const PORTAINER_URL = process.env.PORTAINER_URL;
const PORTAINER_API_KEY = process.env.PORTAINER_API_KEY;
const WRITE_ENABLED = process.env.PORTAINER_WRITE_ENABLED === "true";

if (!PORTAINER_URL || !PORTAINER_API_KEY) {
  console.error(
    "Error: PORTAINER_URL and PORTAINER_API_KEY environment variables are required"
  );
  process.exit(1);
}

const client = new PortainerClient(PORTAINER_URL, PORTAINER_API_KEY, WRITE_ENABLED);

// Tool schemas
const ListContainersSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  all: z.boolean().optional().describe("Include stopped containers"),
});

const InspectContainerSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  container_id: z.string().describe("Container ID or name"),
});

const ContainerLogsSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  container_id: z.string().describe("Container ID or name"),
  tail: z.number().optional().describe("Number of lines (default 100, max 10000)"),
});

const ContainerActionSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  container_id: z.string().describe("Container ID or name"),
  action: z.enum(["start", "stop", "restart", "kill", "remove"]).describe("Action to perform"),
});

const ListStacksSchema = z.object({
  environment_id: z.number().optional().describe("Filter by environment ID"),
});

const InspectStackSchema = z.object({
  stack_id: z.number().describe("Stack ID"),
});

const StackActionSchema = z.object({
  stack_id: z.number().describe("Stack ID"),
  action: z.enum(["start", "stop", "remove"]).describe("Action to perform"),
  environment_id: z.number().optional().describe("Required for remove action"),
});

const CreateStackSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  name: z.string().describe("Stack name"),
  compose_content: z.string().describe("Docker Compose YAML content"),
});

const EnvironmentIdSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
});

const ManageImageSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  action: z.enum(["pull", "remove"]).describe("Action to perform"),
  image: z.string().describe("Image name (for pull) or ID (for remove)"),
});

const ManageVolumeSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  action: z.enum(["create", "remove"]).describe("Action to perform"),
  name: z.string().describe("Volume name"),
});

const ManageNetworkSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  action: z.enum(["create", "remove"]).describe("Action to perform"),
  name: z.string().describe("Network name (for create) or ID (for remove)"),
  subnet: z.string().optional().describe("CIDR subnet for create (e.g., 172.20.0.0/16)"),
});

// Tool definitions
const tools = [
  {
    name: "list_environments",
    description: "List all Portainer environments (Docker endpoints)",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_containers",
    description: "List containers in a Portainer environment",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        all: { type: "boolean", description: "Include stopped containers" },
      },
      required: ["environment_id"],
    },
  },
  {
    name: "inspect_container",
    description: "Get detailed information about a container",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        container_id: { type: "string", description: "Container ID or name" },
      },
      required: ["environment_id", "container_id"],
    },
  },
  {
    name: "container_logs",
    description: "Get logs from a container",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        container_id: { type: "string", description: "Container ID or name" },
        tail: { type: "number", description: "Number of lines (default 100, max 10000)" },
      },
      required: ["environment_id", "container_id"],
    },
  },
  {
    name: "container_action",
    description: "Perform an action on a container (start, stop, restart, kill, remove). Requires PORTAINER_WRITE_ENABLED=true",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        container_id: { type: "string", description: "Container ID or name" },
        action: { type: "string", enum: ["start", "stop", "restart", "kill", "remove"], description: "Action to perform" },
      },
      required: ["environment_id", "container_id", "action"],
    },
  },
  {
    name: "list_stacks",
    description: "List all stacks",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Filter by environment ID" },
      },
      required: [],
    },
  },
  {
    name: "inspect_stack",
    description: "Get stack details including compose file content",
    inputSchema: {
      type: "object" as const,
      properties: {
        stack_id: { type: "number", description: "Stack ID" },
      },
      required: ["stack_id"],
    },
  },
  {
    name: "stack_action",
    description: "Perform an action on a stack (start, stop, remove). Requires PORTAINER_WRITE_ENABLED=true",
    inputSchema: {
      type: "object" as const,
      properties: {
        stack_id: { type: "number", description: "Stack ID" },
        action: { type: "string", enum: ["start", "stop", "remove"], description: "Action to perform" },
        environment_id: { type: "number", description: "Required for remove action" },
      },
      required: ["stack_id", "action"],
    },
  },
  {
    name: "create_stack",
    description: "Create a new standalone Docker Compose stack. Requires PORTAINER_WRITE_ENABLED=true",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        name: { type: "string", description: "Stack name" },
        compose_content: { type: "string", description: "Docker Compose YAML content" },
      },
      required: ["environment_id", "name", "compose_content"],
    },
  },
  {
    name: "list_images",
    description: "List Docker images in an environment",
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
    description: "Pull or remove a Docker image. Requires PORTAINER_WRITE_ENABLED=true",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        action: { type: "string", enum: ["pull", "remove"], description: "Action to perform" },
        image: { type: "string", description: "Image name:tag (for pull) or ID (for remove)" },
      },
      required: ["environment_id", "action", "image"],
    },
  },
  {
    name: "list_volumes",
    description: "List Docker volumes in an environment",
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
    description: "Create or remove a Docker volume. Requires PORTAINER_WRITE_ENABLED=true",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        action: { type: "string", enum: ["create", "remove"], description: "Action to perform" },
        name: { type: "string", description: "Volume name" },
      },
      required: ["environment_id", "action", "name"],
    },
  },
  {
    name: "list_networks",
    description: "List Docker networks in an environment",
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
    description: "Create or remove a Docker network. Requires PORTAINER_WRITE_ENABLED=true",
    inputSchema: {
      type: "object" as const,
      properties: {
        environment_id: { type: "number", description: "Portainer environment ID" },
        action: { type: "string", enum: ["create", "remove"], description: "Action to perform" },
        name: { type: "string", description: "Network name (for create) or ID (for remove)" },
        subnet: { type: "string", description: "CIDR subnet for create (e.g., 172.20.0.0/16)" },
      },
      required: ["environment_id", "action", "name"],
    },
  },
];

// Helper to format responses
function formatResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function formatError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = error instanceof PortainerClientError
    ? error.message
    : error instanceof Error
    ? error.message
    : "Unknown error";

  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

// Server setup
const server = new Server(
  { name: "portainer-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_environments": {
        const envs = await client.getEnvironments();
        return formatResponse({
          items: envs.map((e) => ({
            id: e.Id,
            name: e.Name,
            status: e.Status === 1 ? "up" : "down",
            type: e.Type === 1 ? "docker" : e.Type === 2 ? "swarm" : "other",
            url: e.URL,
          })),
          count: envs.length,
        });
      }

      case "list_containers": {
        const parsed = ListContainersSchema.parse(args);
        const containers = await client.getContainers(parsed.environment_id, parsed.all);
        return formatResponse({
          items: containers.map((c) => ({
            id: c.Id.substring(0, 12),
            name: c.Names[0]?.replace(/^\//, ""),
            image: c.Image,
            state: c.State,
            status: c.Status,
            ports: c.Ports.filter((p) => p.PublicPort).map(
              (p) => `${p.PublicPort}:${p.PrivatePort}/${p.Type}`
            ),
          })),
          count: containers.length,
        });
      }

      case "inspect_container": {
        const parsed = InspectContainerSchema.parse(args);
        const container = await client.inspectContainer(
          parsed.environment_id,
          parsed.container_id
        );
        return formatResponse({
          id: container.Id,
          name: container.Name.replace(/^\//, ""),
          image: container.Config.Image,
          state: container.State,
          config: {
            env: container.Config.Env,
            cmd: container.Config.Cmd,
            labels: container.Config.Labels,
          },
          networks: container.NetworkSettings.Networks,
          mounts: container.Mounts,
        });
      }

      case "container_logs": {
        const parsed = ContainerLogsSchema.parse(args);
        const logs = await client.getContainerLogs(
          parsed.environment_id,
          parsed.container_id,
          parsed.tail
        );
        return formatResponse({ logs });
      }

      case "container_action": {
        const parsed = ContainerActionSchema.parse(args);
        await client.containerAction(
          parsed.environment_id,
          parsed.container_id,
          parsed.action
        );
        return formatResponse({
          success: true,
          message: `Container ${parsed.action} completed`,
        });
      }

      case "list_stacks": {
        const parsed = ListStacksSchema.parse(args);
        let stacks = await client.getStacks();
        if (parsed.environment_id !== undefined) {
          stacks = stacks.filter((s) => s.EndpointId === parsed.environment_id);
        }
        return formatResponse({
          items: stacks.map((s) => ({
            id: s.Id,
            name: s.Name,
            status: s.Status === 1 ? "active" : "inactive",
            environment_id: s.EndpointId,
          })),
          count: stacks.length,
        });
      }

      case "inspect_stack": {
        const parsed = InspectStackSchema.parse(args);
        const [stack, stackFile] = await Promise.all([
          client.getStack(parsed.stack_id),
          client.getStackFile(parsed.stack_id),
        ]);
        return formatResponse({
          id: stack.Id,
          name: stack.Name,
          status: stack.Status === 1 ? "active" : "inactive",
          environment_id: stack.EndpointId,
          compose_content: stackFile.StackFileContent,
        });
      }

      case "stack_action": {
        const parsed = StackActionSchema.parse(args);
        if (parsed.action === "remove") {
          if (!parsed.environment_id) {
            throw new Error("environment_id is required for remove action");
          }
          await client.deleteStack(parsed.stack_id, parsed.environment_id);
        } else {
          await client.stackAction(parsed.stack_id, parsed.action);
        }
        return formatResponse({
          success: true,
          message: `Stack ${parsed.action} completed`,
        });
      }

      case "create_stack": {
        const parsed = CreateStackSchema.parse(args);
        const stack = await client.createStack(
          parsed.environment_id,
          parsed.name,
          parsed.compose_content
        );
        return formatResponse({
          success: true,
          id: stack.Id,
          name: stack.Name,
        });
      }

      case "list_images": {
        const parsed = EnvironmentIdSchema.parse(args);
        const images = await client.getImages(parsed.environment_id);
        return formatResponse({
          items: images.map((i) => ({
            id: i.Id.replace("sha256:", "").substring(0, 12),
            tags: i.RepoTags || ["<none>"],
            size_mb: Math.round(i.Size / 1024 / 1024),
            created: new Date(i.Created * 1000).toISOString(),
          })),
          count: images.length,
        });
      }

      case "manage_image": {
        const parsed = ManageImageSchema.parse(args);
        if (parsed.action === "pull") {
          await client.pullImage(parsed.environment_id, parsed.image);
        } else {
          await client.removeImage(parsed.environment_id, parsed.image);
        }
        return formatResponse({
          success: true,
          message: `Image ${parsed.action} completed`,
        });
      }

      case "list_volumes": {
        const parsed = EnvironmentIdSchema.parse(args);
        const result = await client.getVolumes(parsed.environment_id);
        return formatResponse({
          items: (result.Volumes || []).map((v) => ({
            name: v.Name,
            driver: v.Driver,
            mountpoint: v.Mountpoint,
          })),
          count: result.Volumes?.length || 0,
        });
      }

      case "manage_volume": {
        const parsed = ManageVolumeSchema.parse(args);
        if (parsed.action === "create") {
          const vol = await client.createVolume(parsed.environment_id, parsed.name);
          return formatResponse({
            success: true,
            name: vol.Name,
            mountpoint: vol.Mountpoint,
          });
        } else {
          await client.removeVolume(parsed.environment_id, parsed.name);
          return formatResponse({
            success: true,
            message: `Volume ${parsed.name} removed`,
          });
        }
      }

      case "list_networks": {
        const parsed = EnvironmentIdSchema.parse(args);
        const networks = await client.getNetworks(parsed.environment_id);
        return formatResponse({
          items: networks.map((n) => ({
            id: n.Id.substring(0, 12),
            name: n.Name,
            driver: n.Driver,
            scope: n.Scope,
            subnet: n.IPAM?.Config?.[0]?.Subnet,
          })),
          count: networks.length,
        });
      }

      case "manage_network": {
        const parsed = ManageNetworkSchema.parse(args);
        if (parsed.action === "create") {
          const net = await client.createNetwork(
            parsed.environment_id,
            parsed.name,
            parsed.subnet
          );
          return formatResponse({
            success: true,
            id: net.Id,
            name: parsed.name,
          });
        } else {
          await client.removeNetwork(parsed.environment_id, parsed.name);
          return formatResponse({
            success: true,
            message: `Network removed`,
          });
        }
      }

      default:
        return formatError(new Error(`Unknown tool: ${name}`));
    }
  } catch (error) {
    return formatError(error);
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Portainer MCP server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
