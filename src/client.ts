import {
  PortainerEnvironment,
  DockerContainer,
  DockerContainerInspect,
  PortainerStack,
  PortainerStackFile,
  DockerImage,
  DockerVolume,
  DockerNetwork,
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
    return this.request<string>(
      "GET",
      `/endpoints/${envId}/docker/containers/${containerId}/logs?stdout=true&stderr=true&tail=${clampedTail}`,
      undefined,
      60000,
      true
    );
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
    composeContent: string
  ): Promise<PortainerStack> {
    this.checkWriteEnabled();
    return this.request<PortainerStack>(
      "POST",
      `/stacks/create/standalone/string?endpointId=${envId}`,
      {
        name,
        stackFileContent: composeContent,
      }
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
}
