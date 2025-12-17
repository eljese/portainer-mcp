import {
  PortainerEnvironment,
  DockerContainer,
  DockerContainerInspect,
  DockerContainerStats,
  PortainerStack,
  PortainerStackFile,
  DockerImage,
  DockerVolume,
  DockerNetwork,
  DashboardResponse,
  SystemInfo,
  SystemVersion,
  PortainerRegistry,
} from "./types.js";

export class PortainerClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "PortainerClientError";
  }
}

export class PortainerClient {
  private baseUrl: string;
  private apiKey: string;
  private writeEnabled: boolean;

  constructor(baseUrl: string, apiKey: string, writeEnabled = false) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.writeEnabled = writeEnabled;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeout = 30000,
    raw = false
  ): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        let message = `Portainer API error: ${response.status}`;

        if (response.status === 401) {
          message = "Invalid API key or expired token";
        } else if (response.status === 403) {
          message = "Insufficient permissions for this operation";
        } else if (response.status === 404) {
          message = `Resource not found: ${path}`;
        } else {
          try {
            const parsed = JSON.parse(errorBody);
            message = parsed.message || parsed.details || message;
          } catch {
            // Use default message
          }
        }

        throw new PortainerClientError(
          message,
          `HTTP_${response.status}`,
          response.status
        );
      }

      const text = await response.text();
      if (!text) return {} as T;
      if (raw) return text as T;
      return JSON.parse(text) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof PortainerClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PortainerClientError(
          `Request timeout after ${timeout}ms`,
          "TIMEOUT"
        );
      }
      throw new PortainerClientError(
        `Cannot connect to Portainer at ${this.baseUrl}: ${error}`,
        "CONNECTION_ERROR"
      );
    }
  }

  private checkWriteEnabled(): void {
    if (!this.writeEnabled) {
      throw new PortainerClientError(
        "Write operations disabled. Set PORTAINER_WRITE_ENABLED=true to enable.",
        "WRITE_DISABLED"
      );
    }
  }

  // Environments
  async getEnvironments(): Promise<PortainerEnvironment[]> {
    return this.request<PortainerEnvironment[]>("GET", "/endpoints");
  }

  async getEnvironment(id: number): Promise<PortainerEnvironment> {
    return this.request<PortainerEnvironment>("GET", `/endpoints/${id}`);
  }

  // Containers
  async getContainers(envId: number, all = false): Promise<DockerContainer[]> {
    const query = all ? "?all=true" : "";
    return this.request<DockerContainer[]>(
      "GET",
      `/endpoints/${envId}/docker/containers/json${query}`
    );
  }

  async inspectContainer(
    envId: number,
    containerId: string
  ): Promise<DockerContainerInspect> {
    return this.request<DockerContainerInspect>(
      "GET",
      `/endpoints/${envId}/docker/containers/${containerId}/json`
    );
  }

  async getContainerLogs(
    envId: number,
    containerId: string,
    tail = 100
  ): Promise<string> {
    const clampedTail = Math.min(Math.max(tail, 1), 10000);
    const url = `${this.baseUrl}/api/endpoints/${envId}/docker/containers/${containerId}/logs?stdout=true&stderr=true&tail=${clampedTail}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "X-API-Key": this.apiKey },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new PortainerClientError(
          `Failed to get logs: ${response.status}`,
          `HTTP_${response.status}`,
          response.status
        );
      }

      // Get raw bytes to properly handle Docker multiplexed stream
      const arrayBuffer = await response.arrayBuffer();
      return this.stripDockerLogHeaders(Buffer.from(arrayBuffer));
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof PortainerClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PortainerClientError("Request timeout after 60000ms", "TIMEOUT");
      }
      throw new PortainerClientError(
        `Cannot connect to Portainer: ${error}`,
        "CONNECTION_ERROR"
      );
    }
  }

  private stripDockerLogHeaders(buffer: Buffer): string {
    if (!buffer || buffer.length === 0) {
      return "";
    }

    const firstByte = buffer[0];
    // Stream types: 0=stdin, 1=stdout, 2=stderr
    // If first byte is > 2, it's TTY mode (no headers)
    if (firstByte > 2) {
      return buffer.toString("utf8");
    }

    // Parse multiplexed stream
    const chunks: string[] = [];
    let offset = 0;

    while (offset + 8 <= buffer.length) {
      // Read header: [stream_type (1)][padding (3)][size (4 big-endian)]
      const size = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (size === 0) continue;
      if (offset + size > buffer.length) {
        // Incomplete frame, take what we can
        chunks.push(buffer.subarray(offset).toString("utf8"));
        break;
      }

      chunks.push(buffer.subarray(offset, offset + size).toString("utf8"));
      offset += size;
    }

    return chunks.join("");
  }

  async containerAction(
    envId: number,
    containerId: string,
    action: "start" | "stop" | "restart" | "kill" | "remove"
  ): Promise<void> {
    this.checkWriteEnabled();
    if (action === "remove") {
      await this.request<void>(
        "DELETE",
        `/endpoints/${envId}/docker/containers/${containerId}?force=true`
      );
    } else {
      await this.request<void>(
        "POST",
        `/endpoints/${envId}/docker/containers/${containerId}/${action}`
      );
    }
  }

  async getContainerStats(
    envId: number,
    containerId: string
  ): Promise<DockerContainerStats> {
    return this.request<DockerContainerStats>(
      "GET",
      `/endpoints/${envId}/docker/containers/${containerId}/stats?stream=false`
    );
  }

  // Stacks
  async getStacks(): Promise<PortainerStack[]> {
    return this.request<PortainerStack[]>("GET", "/stacks");
  }

  async getStack(stackId: number): Promise<PortainerStack> {
    return this.request<PortainerStack>("GET", `/stacks/${stackId}`);
  }

  async getStackFile(stackId: number): Promise<PortainerStackFile> {
    return this.request<PortainerStackFile>("GET", `/stacks/${stackId}/file`);
  }

  async stackAction(
    stackId: number,
    action: "start" | "stop"
  ): Promise<void> {
    this.checkWriteEnabled();
    await this.request<void>("POST", `/stacks/${stackId}/${action}`);
  }

  async createStack(
    envId: number,
    name: string,
    composeContent: string,
    env?: Array<{ name: string; value: string }>
  ): Promise<PortainerStack> {
    this.checkWriteEnabled();
    const body: Record<string, unknown> = {
      name,
      stackFileContent: composeContent,
    };
    if (env && env.length > 0) {
      body.env = env;
    }
    return this.request<PortainerStack>(
      "POST",
      `/stacks/create/standalone/string?endpointId=${envId}`,
      body
    );
  }

  async updateStack(
    stackId: number,
    envId: number,
    options: {
      composeContent?: string;
      env?: Array<{ name: string; value: string }>;
      prune?: boolean;
      pullImage?: boolean;
    }
  ): Promise<PortainerStack> {
    this.checkWriteEnabled();
    const body: Record<string, unknown> = {};
    if (options.composeContent !== undefined) {
      body.stackFileContent = options.composeContent;
    }
    if (options.env !== undefined) {
      body.env = options.env;
    }
    if (options.prune !== undefined) {
      body.prune = options.prune;
    }
    if (options.pullImage !== undefined) {
      body.pullImage = options.pullImage;
    }
    return this.request<PortainerStack>(
      "PUT",
      `/stacks/${stackId}?endpointId=${envId}`,
      body
    );
  }

  async redeployStack(
    stackId: number,
    envId: number,
    pullImage = false
  ): Promise<void> {
    this.checkWriteEnabled();
    await this.request<void>(
      "PUT",
      `/stacks/${stackId}/git/redeploy?endpointId=${envId}`,
      { pullImage }
    );
  }

  async deleteStack(stackId: number, envId: number): Promise<void> {
    this.checkWriteEnabled();
    await this.request<void>(
      "DELETE",
      `/stacks/${stackId}?endpointId=${envId}`
    );
  }

  // Images
  async getImages(envId: number): Promise<DockerImage[]> {
    return this.request<DockerImage[]>(
      "GET",
      `/endpoints/${envId}/docker/images/json`
    );
  }

  async pullImage(envId: number, image: string): Promise<void> {
    this.checkWriteEnabled();
    const [fromImage, tag = "latest"] = image.split(":");
    await this.request<void>(
      "POST",
      `/endpoints/${envId}/docker/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`
    );
  }

  async removeImage(envId: number, imageId: string): Promise<void> {
    this.checkWriteEnabled();
    await this.request<void>(
      "DELETE",
      `/endpoints/${envId}/docker/images/${encodeURIComponent(imageId)}?force=true`
    );
  }

  // Volumes
  async getVolumes(envId: number): Promise<{ Volumes: DockerVolume[] }> {
    return this.request<{ Volumes: DockerVolume[] }>(
      "GET",
      `/endpoints/${envId}/docker/volumes`
    );
  }

  async createVolume(envId: number, name: string): Promise<DockerVolume> {
    this.checkWriteEnabled();
    return this.request<DockerVolume>(
      "POST",
      `/endpoints/${envId}/docker/volumes/create`,
      { Name: name }
    );
  }

  async removeVolume(envId: number, name: string): Promise<void> {
    this.checkWriteEnabled();
    await this.request<void>(
      "DELETE",
      `/endpoints/${envId}/docker/volumes/${encodeURIComponent(name)}`
    );
  }

  // Networks
  async getNetworks(envId: number): Promise<DockerNetwork[]> {
    return this.request<DockerNetwork[]>(
      "GET",
      `/endpoints/${envId}/docker/networks`
    );
  }

  async createNetwork(
    envId: number,
    name: string,
    subnet?: string
  ): Promise<{ Id: string }> {
    this.checkWriteEnabled();
    const body: Record<string, unknown> = { Name: name };
    if (subnet) {
      body.IPAM = { Config: [{ Subnet: subnet }] };
    }
    return this.request<{ Id: string }>(
      "POST",
      `/endpoints/${envId}/docker/networks/create`,
      body
    );
  }

  async removeNetwork(envId: number, networkId: string): Promise<void> {
    this.checkWriteEnabled();
    await this.request<void>(
      "DELETE",
      `/endpoints/${envId}/docker/networks/${networkId}`
    );
  }

  // Dashboard
  async getDashboard(envId: number): Promise<DashboardResponse> {
    return this.request<DashboardResponse>(
      "GET",
      `/docker/${envId}/dashboard`
    );
  }

  // System
  async getSystemInfo(): Promise<SystemInfo> {
    return this.request<SystemInfo>("GET", "/system/info");
  }

  async getSystemVersion(): Promise<SystemVersion> {
    return this.request<SystemVersion>("GET", "/system/version");
  }

  // Registries
  async getRegistries(): Promise<PortainerRegistry[]> {
    return this.request<PortainerRegistry[]>("GET", "/registries");
  }

  // Stack by name (no direct API endpoint, so we filter from list)
  async getStackByName(name: string): Promise<PortainerStack> {
    const stacks = await this.getStacks();
    const stack = stacks.find((s) => s.Name === name);
    if (!stack) {
      throw new PortainerClientError(`Stack not found: ${name}`, "NOT_FOUND", 404);
    }
    return stack;
  }
}
