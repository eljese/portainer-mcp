import { z } from "zod";

export const ListContainersSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  all: z.boolean().optional().describe("Include stopped containers"),
});

export const InspectContainerSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  container_id: z.string().describe("Container ID or name"),
});

export const ContainerLogsSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  container_id: z.string().describe("Container ID or name"),
  tail: z.number().optional().describe("Number of lines (default 100, max 10000)"),
});

export const ContainerActionSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  container_id: z.string().describe("Container ID or name"),
  action: z.enum(["start", "stop", "restart", "kill", "remove"]).describe("Action to perform"),
});

export const ListStacksSchema = z.object({
  environment_id: z.number().optional().describe("Filter by environment ID"),
});

export const InspectStackSchema = z.object({
  stack_id: z.number().describe("Stack ID"),
});

export const StackActionSchema = z.object({
  stack_id: z.number().describe("Stack ID"),
  action: z.enum(["start", "stop", "remove"]).describe("Action to perform"),
  environment_id: z.number().optional().describe("Required for remove action"),
});

export const CreateStackSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  name: z.string().describe("Stack name"),
  compose_content: z.string().describe("Docker Compose YAML content"),
  env: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional().describe("Environment variables for the stack"),
});

export const CreateStackFromGitSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  name: z.string().describe("Stack name"),
  repository_url: z.string().describe("Git repository URL"),
  compose_file: z.string().describe("Path to Compose file in repo"),
  reference_name: z.string().optional().describe("Git reference (branch/tag, e.g. refs/heads/main)"),
  username: z.string().optional().describe("Git username"),
  password: z.string().optional().describe("Git password/token"),
  env: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional().describe("Environment variables for the stack"),
});

export const UpdateStackSchema = z.object({
  stack_id: z.number().describe("Stack ID"),
  environment_id: z.number().describe("Portainer environment ID"),
  compose_content: z.string().optional().describe("New Docker Compose YAML content"),
  env: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional().describe("Environment variables for the stack"),
  prune: z.boolean().optional().describe("Prune services that are no longer referenced"),
  pull_image: z.boolean().optional().describe("Pull latest image versions"),
});

export const RedeployStackSchema = z.object({
  stack_id: z.number().describe("Stack ID"),
  environment_id: z.number().describe("Portainer environment ID"),
  pull_image: z.boolean().optional().describe("Pull latest image versions"),
});

export const ContainerStatsSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  container_id: z.string().describe("Container ID or name"),
});

export const StackByNameSchema = z.object({
  name: z.string().describe("Stack name"),
});

export const EnvironmentIdSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
});

export const ManageImageSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  action: z.enum(["pull", "remove"]).describe("Action to perform"),
  image: z.string().describe("Image name (for pull) or ID (for remove)"),
});

export const ManageVolumeSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  action: z.enum(["create", "remove"]).describe("Action to perform"),
  name: z.string().describe("Volume name"),
});

export const ManageNetworkSchema = z.object({
  environment_id: z.number().describe("Portainer environment ID"),
  action: z.enum(["create", "remove"]).describe("Action to perform"),
  name: z.string().describe("Network name (for create) or ID (for remove)"),
  subnet: z.string().optional().describe("CIDR subnet for create (e.g., 172.20.0.0/16)"),
});
