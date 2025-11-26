import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// We need to test the tool handlers. Since index.ts creates the client at module level,
// we'll recreate the handler logic here for testing with mocked client.

import { PortainerClient, PortainerClientError } from "./client.js";

// Mock client for testing
function createMockClient(overrides: Partial<PortainerClient> = {}) {
  return {
    getEnvironments: mock.fn(async () => [
      { Id: 1, Name: "local", Type: 1, URL: "unix://", Status: 1 },
      { Id: 2, Name: "remote", Type: 1, URL: "tcp://10.0.0.1:2375", Status: 2 },
    ]),
    getEnvironment: mock.fn(async (id: number) => ({
      Id: id,
      Name: "local",
      Type: 1,
      URL: "unix://",
      Status: 1,
    })),
    getContainers: mock.fn(async () => [
      {
        Id: "abc123def456",
        Names: ["/web"],
        Image: "nginx:latest",
        State: "running",
        Status: "Up 2 hours",
        Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: "tcp" }],
        Created: 1234567890,
      },
    ]),
    inspectContainer: mock.fn(async () => ({
      Id: "abc123def456full",
      Name: "/web",
      Image: "nginx",
      State: {
        Status: "running",
        Running: true,
        Paused: false,
        Restarting: false,
        StartedAt: "2024-01-01T00:00:00Z",
        FinishedAt: "",
      },
      Config: {
        Image: "nginx:latest",
        Env: ["PATH=/usr/local/bin"],
        Cmd: ["nginx", "-g", "daemon off;"],
        Labels: { app: "web" },
      },
      NetworkSettings: {
        Networks: {
          bridge: { IPAddress: "172.17.0.2", Gateway: "172.17.0.1" },
        },
      },
      Mounts: [{ Type: "bind", Source: "/data", Destination: "/app/data" }],
    })),
    getContainerLogs: mock.fn(async () => "log line 1\nlog line 2\nlog line 3"),
    containerAction: mock.fn(async () => {}),
    getStacks: mock.fn(async () => [
      { Id: 1, Name: "mystack", Type: 1, EndpointId: 1, Status: 1, CreationDate: 0, UpdateDate: 0 },
    ]),
    getStack: mock.fn(async (id: number) => ({
      Id: id,
      Name: "mystack",
      Type: 1,
      EndpointId: 1,
      Status: 1,
      CreationDate: 0,
      UpdateDate: 0,
    })),
    getStackFile: mock.fn(async () => ({
      StackFileContent: "version: '3'\nservices:\n  web:\n    image: nginx",
    })),
    stackAction: mock.fn(async () => {}),
    createStack: mock.fn(async () => ({
      Id: 2,
      Name: "newstack",
      Type: 1,
      EndpointId: 1,
      Status: 1,
      CreationDate: 0,
      UpdateDate: 0,
    })),
    deleteStack: mock.fn(async () => {}),
    getImages: mock.fn(async () => [
      { Id: "sha256:abc123", RepoTags: ["nginx:latest"], Size: 142000000, Created: 1234567890 },
    ]),
    pullImage: mock.fn(async () => {}),
    removeImage: mock.fn(async () => {}),
    getVolumes: mock.fn(async () => ({
      Volumes: [
        { Name: "myvolume", Driver: "local", Mountpoint: "/var/lib/docker/volumes/myvolume", CreatedAt: "", Labels: {} },
      ],
    })),
    createVolume: mock.fn(async () => ({
      Name: "newvolume",
      Driver: "local",
      Mountpoint: "/var/lib/docker/volumes/newvolume",
      CreatedAt: "",
      Labels: {},
    })),
    removeVolume: mock.fn(async () => {}),
    getNetworks: mock.fn(async () => [
      {
        Id: "net123abc456",
        Name: "bridge",
        Driver: "bridge",
        Scope: "local",
        IPAM: { Config: [{ Subnet: "172.17.0.0/16", Gateway: "172.17.0.1" }] },
      },
    ]),
    createNetwork: mock.fn(async () => ({ Id: "newnet123" })),
    removeNetwork: mock.fn(async () => {}),
    ...overrides,
  } as unknown as PortainerClient;
}

// Import the schemas used for validation
import { z } from "zod";

const ListContainersSchema = z.object({
  environment_id: z.number(),
  all: z.boolean().optional(),
});

const InspectContainerSchema = z.object({
  environment_id: z.number(),
  container_id: z.string(),
});

const ContainerLogsSchema = z.object({
  environment_id: z.number(),
  container_id: z.string(),
  tail: z.number().optional(),
});

const ContainerActionSchema = z.object({
  environment_id: z.number(),
  container_id: z.string(),
  action: z.enum(["start", "stop", "restart", "kill", "remove"]),
});

const ListStacksSchema = z.object({
  environment_id: z.number().optional(),
});

const InspectStackSchema = z.object({
  stack_id: z.number(),
});

const StackActionSchema = z.object({
  stack_id: z.number(),
  action: z.enum(["start", "stop", "remove"]),
  environment_id: z.number().optional(),
});

const CreateStackSchema = z.object({
  environment_id: z.number(),
  name: z.string(),
  compose_content: z.string(),
});

const EnvironmentIdSchema = z.object({
  environment_id: z.number(),
});

const ManageImageSchema = z.object({
  environment_id: z.number(),
  action: z.enum(["pull", "remove"]),
  image: z.string(),
});

const ManageVolumeSchema = z.object({
  environment_id: z.number(),
  action: z.enum(["create", "remove"]),
  name: z.string(),
});

const ManageNetworkSchema = z.object({
  environment_id: z.number(),
  action: z.enum(["create", "remove"]),
  name: z.string(),
  subnet: z.string().optional(),
});

// Helper to format responses (same as in index.ts)
function formatResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function formatError(error: unknown) {
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

// Create a tool handler function for testing
function createToolHandler(client: PortainerClient) {
  return async (name: string, args: unknown) => {
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
        const container = await client.inspectContainer(parsed.environment_id, parsed.container_id);
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
        const logs = await client.getContainerLogs(parsed.environment_id, parsed.container_id, parsed.tail);
        return formatResponse({ logs });
      }

      case "container_action": {
        const parsed = ContainerActionSchema.parse(args);
        await client.containerAction(parsed.environment_id, parsed.container_id, parsed.action);
        return formatResponse({ success: true, message: `Container ${parsed.action} completed` });
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
        return formatResponse({ success: true, message: `Stack ${parsed.action} completed` });
      }

      case "create_stack": {
        const parsed = CreateStackSchema.parse(args);
        const stack = await client.createStack(parsed.environment_id, parsed.name, parsed.compose_content);
        return formatResponse({ success: true, id: stack.Id, name: stack.Name });
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
        return formatResponse({ success: true, message: `Image ${parsed.action} completed` });
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
          return formatResponse({ success: true, name: vol.Name, mountpoint: vol.Mountpoint });
        } else {
          await client.removeVolume(parsed.environment_id, parsed.name);
          return formatResponse({ success: true, message: `Volume ${parsed.name} removed` });
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
          const net = await client.createNetwork(parsed.environment_id, parsed.name, parsed.subnet);
          return formatResponse({ success: true, id: net.Id, name: parsed.name });
        } else {
          await client.removeNetwork(parsed.environment_id, parsed.name);
          return formatResponse({ success: true, message: `Network removed` });
        }
      }

      default:
        return formatError(new Error(`Unknown tool: ${name}`));
    }
  };
}

describe("MCP Server Tool Handlers", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let handleTool: ReturnType<typeof createToolHandler>;

  beforeEach(() => {
    mockClient = createMockClient();
    handleTool = createToolHandler(mockClient);
  });

  describe("list_environments", () => {
    it("should return formatted environments", async () => {
      const result = await handleTool("list_environments", {});
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.count, 2);
      assert.strictEqual(data.items[0].id, 1);
      assert.strictEqual(data.items[0].name, "local");
      assert.strictEqual(data.items[0].status, "up");
      assert.strictEqual(data.items[0].type, "docker");
      assert.strictEqual(data.items[1].status, "down");
    });
  });

  describe("list_containers", () => {
    it("should return formatted containers with truncated IDs", async () => {
      const result = await handleTool("list_containers", { environment_id: 1 });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.items[0].id, "abc123def456");
      assert.strictEqual(data.items[0].name, "web");
      assert.strictEqual(data.items[0].image, "nginx:latest");
      assert.deepStrictEqual(data.items[0].ports, ["8080:80/tcp"]);
    });

    it("should pass all flag to client", async () => {
      await handleTool("list_containers", { environment_id: 1, all: true });

      const calls = (mockClient.getContainers as ReturnType<typeof mock.fn>).mock.calls;
      assert.strictEqual(calls[0].arguments[1], true);
    });
  });

  describe("inspect_container", () => {
    it("should return detailed container info", async () => {
      const result = await handleTool("inspect_container", {
        environment_id: 1,
        container_id: "abc123",
      });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.name, "web");
      assert.strictEqual(data.image, "nginx:latest");
      assert.strictEqual(data.state.Status, "running");
      assert.ok(data.config.env.includes("PATH=/usr/local/bin"));
      assert.ok(data.networks.bridge);
    });
  });

  describe("container_logs", () => {
    it("should return logs", async () => {
      const result = await handleTool("container_logs", {
        environment_id: 1,
        container_id: "abc123",
      });
      const data = JSON.parse(result.content[0].text);

      assert.ok(data.logs.includes("log line 1"));
    });
  });

  describe("container_action", () => {
    it("should call containerAction with correct params", async () => {
      const result = await handleTool("container_action", {
        environment_id: 1,
        container_id: "abc123",
        action: "stop",
      });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes("stop"));

      const calls = (mockClient.containerAction as ReturnType<typeof mock.fn>).mock.calls;
      assert.strictEqual(calls[0].arguments[0], 1);
      assert.strictEqual(calls[0].arguments[1], "abc123");
      assert.strictEqual(calls[0].arguments[2], "stop");
    });
  });

  describe("list_stacks", () => {
    it("should return formatted stacks", async () => {
      const result = await handleTool("list_stacks", {});
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.items[0].name, "mystack");
      assert.strictEqual(data.items[0].status, "active");
    });

    it("should filter by environment_id", async () => {
      mockClient = createMockClient({
        getStacks: mock.fn(async () => [
          { Id: 1, Name: "stack1", Type: 1, EndpointId: 1, Status: 1, CreationDate: 0, UpdateDate: 0 },
          { Id: 2, Name: "stack2", Type: 1, EndpointId: 2, Status: 1, CreationDate: 0, UpdateDate: 0 },
        ]),
      });
      handleTool = createToolHandler(mockClient);

      const result = await handleTool("list_stacks", { environment_id: 1 });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.items[0].name, "stack1");
    });
  });

  describe("inspect_stack", () => {
    it("should return stack with compose content", async () => {
      const result = await handleTool("inspect_stack", { stack_id: 1 });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.name, "mystack");
      assert.ok(data.compose_content.includes("nginx"));
    });
  });

  describe("stack_action", () => {
    it("should call stackAction for start/stop", async () => {
      await handleTool("stack_action", { stack_id: 1, action: "start" });

      const calls = (mockClient.stackAction as ReturnType<typeof mock.fn>).mock.calls;
      assert.strictEqual(calls[0].arguments[1], "start");
    });

    it("should call deleteStack for remove with environment_id", async () => {
      await handleTool("stack_action", { stack_id: 1, action: "remove", environment_id: 1 });

      const calls = (mockClient.deleteStack as ReturnType<typeof mock.fn>).mock.calls;
      assert.strictEqual(calls[0].arguments[0], 1);
      assert.strictEqual(calls[0].arguments[1], 1);
    });

    it("should throw error for remove without environment_id", async () => {
      await assert.rejects(
        () => handleTool("stack_action", { stack_id: 1, action: "remove" }),
        /environment_id is required/
      );
    });
  });

  describe("create_stack", () => {
    it("should create stack and return result", async () => {
      const result = await handleTool("create_stack", {
        environment_id: 1,
        name: "newstack",
        compose_content: "version: '3'",
      });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.id, 2);
      assert.strictEqual(data.name, "newstack");
    });
  });

  describe("list_images", () => {
    it("should return formatted images with size in MB", async () => {
      const result = await handleTool("list_images", { environment_id: 1 });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.items[0].id, "abc123");
      assert.strictEqual(data.items[0].size_mb, 135);
      assert.deepStrictEqual(data.items[0].tags, ["nginx:latest"]);
    });
  });

  describe("manage_image", () => {
    it("should call pullImage for pull action", async () => {
      await handleTool("manage_image", {
        environment_id: 1,
        action: "pull",
        image: "nginx:alpine",
      });

      const calls = (mockClient.pullImage as ReturnType<typeof mock.fn>).mock.calls;
      assert.strictEqual(calls[0].arguments[1], "nginx:alpine");
    });

    it("should call removeImage for remove action", async () => {
      await handleTool("manage_image", {
        environment_id: 1,
        action: "remove",
        image: "abc123",
      });

      const calls = (mockClient.removeImage as ReturnType<typeof mock.fn>).mock.calls;
      assert.strictEqual(calls[0].arguments[1], "abc123");
    });
  });

  describe("list_volumes", () => {
    it("should return formatted volumes", async () => {
      const result = await handleTool("list_volumes", { environment_id: 1 });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.items[0].name, "myvolume");
      assert.strictEqual(data.items[0].driver, "local");
    });
  });

  describe("manage_volume", () => {
    it("should create volume and return result", async () => {
      const result = await handleTool("manage_volume", {
        environment_id: 1,
        action: "create",
        name: "newvolume",
      });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.name, "newvolume");
    });

    it("should remove volume", async () => {
      const result = await handleTool("manage_volume", {
        environment_id: 1,
        action: "remove",
        name: "oldvolume",
      });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes("oldvolume"));
    });
  });

  describe("list_networks", () => {
    it("should return formatted networks with subnet", async () => {
      const result = await handleTool("list_networks", { environment_id: 1 });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.items[0].name, "bridge");
      assert.strictEqual(data.items[0].subnet, "172.17.0.0/16");
    });
  });

  describe("manage_network", () => {
    it("should create network and return result", async () => {
      const result = await handleTool("manage_network", {
        environment_id: 1,
        action: "create",
        name: "mynet",
        subnet: "172.20.0.0/16",
      });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.id, "newnet123");

      const calls = (mockClient.createNetwork as ReturnType<typeof mock.fn>).mock.calls;
      assert.strictEqual(calls[0].arguments[2], "172.20.0.0/16");
    });

    it("should remove network", async () => {
      const result = await handleTool("manage_network", {
        environment_id: 1,
        action: "remove",
        name: "oldnet",
      });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.success, true);
    });
  });

  describe("unknown tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await handleTool("unknown_tool", {});

      assert.strictEqual((result as { isError: boolean }).isError, true);
      assert.ok(result.content[0].text.includes("Unknown tool"));
    });
  });

  describe("validation errors", () => {
    it("should throw on missing required parameters", async () => {
      await assert.rejects(
        () => handleTool("list_containers", {}),
        /environment_id/
      );
    });

    it("should throw on invalid action", async () => {
      await assert.rejects(
        () => handleTool("container_action", {
          environment_id: 1,
          container_id: "abc",
          action: "invalid",
        })
      );
    });
  });
});
