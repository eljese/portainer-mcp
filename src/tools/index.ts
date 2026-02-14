import type { PortainerClient } from "../client.js";
import { allTools } from "./definitions.js";
import { formatError, type ToolResponse } from "./utils.js";

// Environment handlers
import { listEnvironments, environmentDashboard } from "./environments.js";

// Container handlers
import {
  listContainers,
  inspectContainer,
  containerLogs,
  containerAction,
  containerStats,
} from "./containers.js";

// Stack handlers
import {
  listStacks,
  inspectStack,
  stackAction,
  createStack,
  createStackFromGit,
  updateStack,
  redeployStack,
  getStackByName,
} from "./stacks.js";

// Image handlers
import { listImages, manageImage } from "./images.js";

// Volume handlers
import { listVolumes, manageVolume } from "./volumes.js";

// Network handlers
import { listNetworks, manageNetwork } from "./networks.js";

// System handlers
import { systemInfo, listRegistries } from "./system.js";

export { allTools };
export { formatError, type ToolResponse };

export type ToolHandler = (
  client: PortainerClient,
  args: unknown
) => Promise<ToolResponse>;

const toolHandlers: Record<string, ToolHandler> = {
  // Environments
  list_environments: (client) => listEnvironments(client),
  environment_dashboard: environmentDashboard,

  // Containers
  list_containers: listContainers,
  inspect_container: inspectContainer,
  container_logs: containerLogs,
  container_action: containerAction,
  container_stats: containerStats,

  // Stacks
  list_stacks: listStacks,
  inspect_stack: inspectStack,
  stack_action: stackAction,
  create_stack: createStack,
  create_stack_from_git: createStackFromGit,
  update_stack: updateStack,
  redeploy_stack: redeployStack,
  get_stack_by_name: getStackByName,

  // Images
  list_images: listImages,
  manage_image: manageImage,

  // Volumes
  list_volumes: listVolumes,
  manage_volume: manageVolume,

  // Networks
  list_networks: listNetworks,
  manage_network: manageNetwork,

  // System
  system_info: (client) => systemInfo(client),
  list_registries: (client) => listRegistries(client),
};

export async function handleToolCall(
  client: PortainerClient,
  name: string,
  args: unknown
): Promise<ToolResponse> {
  const handler = toolHandlers[name];
  if (!handler) {
    return formatError(new Error(`Unknown tool: ${name}`));
  }

  try {
    return await handler(client, args);
  } catch (error) {
    return formatError(error);
  }
}
