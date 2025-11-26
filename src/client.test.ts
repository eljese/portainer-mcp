import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { PortainerClient, PortainerClientError } from "./client.js";

// Mock fetch globally
const originalFetch = globalThis.fetch;

function mockFetch(response: {
  ok: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}) {
  return mock.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    text: async () =>
      response.text ?? (response.body ? JSON.stringify(response.body) : ""),
  }));
}

describe("PortainerClient", () => {
  let client: PortainerClient;
  let clientWithWrite: PortainerClient;

  beforeEach(() => {
    client = new PortainerClient("https://portainer.example.com", "test-api-key", false);
    clientWithWrite = new PortainerClient("https://portainer.example.com", "test-api-key", true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("should strip trailing slash from baseUrl", () => {
      const c = new PortainerClient("https://example.com/", "key");
      // We can't directly access private fields, but we can test via a request
      globalThis.fetch = mockFetch({ ok: true, body: [] });
      c.getEnvironments();
      const call = (globalThis.fetch as ReturnType<typeof mock.fn>).mock.calls[0];
      assert.ok(!call.arguments[0].includes("//api"));
    });
  });

  describe("getEnvironments", () => {
    it("should fetch environments from /api/endpoints", async () => {
      const mockEnvs = [
        { Id: 1, Name: "local", Type: 1, URL: "unix://", Status: 1 },
        { Id: 2, Name: "remote", Type: 1, URL: "tcp://10.0.0.1:2375", Status: 1 },
      ];
      globalThis.fetch = mockFetch({ ok: true, body: mockEnvs });

      const result = await client.getEnvironments();

      assert.deepStrictEqual(result, mockEnvs);
      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.strictEqual(fetchMock.mock.calls.length, 1);
      assert.strictEqual(
        fetchMock.mock.calls[0].arguments[0],
        "https://portainer.example.com/api/endpoints"
      );
      assert.strictEqual(
        fetchMock.mock.calls[0].arguments[1].headers["X-API-Key"],
        "test-api-key"
      );
    });
  });

  describe("getContainers", () => {
    it("should fetch containers without all flag", async () => {
      const mockContainers = [
        { Id: "abc123", Names: ["/web"], Image: "nginx", State: "running", Status: "Up", Ports: [], Created: 1234567890 },
      ];
      globalThis.fetch = mockFetch({ ok: true, body: mockContainers });

      const result = await client.getContainers(1);

      assert.deepStrictEqual(result, mockContainers);
      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.strictEqual(
        fetchMock.mock.calls[0].arguments[0],
        "https://portainer.example.com/api/endpoints/1/docker/containers/json"
      );
    });

    it("should include all=true query param when requested", async () => {
      globalThis.fetch = mockFetch({ ok: true, body: [] });

      await client.getContainers(1, true);

      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.strictEqual(
        fetchMock.mock.calls[0].arguments[0],
        "https://portainer.example.com/api/endpoints/1/docker/containers/json?all=true"
      );
    });
  });

  describe("inspectContainer", () => {
    it("should fetch container details", async () => {
      const mockContainer = {
        Id: "abc123full",
        Name: "/web",
        Image: "nginx",
        State: { Status: "running", Running: true, Paused: false, Restarting: false, StartedAt: "", FinishedAt: "" },
        Config: { Image: "nginx", Env: [], Cmd: [], Labels: {} },
        NetworkSettings: { Networks: {} },
        Mounts: [],
      };
      globalThis.fetch = mockFetch({ ok: true, body: mockContainer });

      const result = await client.inspectContainer(1, "abc123");

      assert.deepStrictEqual(result, mockContainer);
      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.strictEqual(
        fetchMock.mock.calls[0].arguments[0],
        "https://portainer.example.com/api/endpoints/1/docker/containers/abc123/json"
      );
    });
  });

  describe("getContainerLogs", () => {
    it("should fetch container logs with default tail", async () => {
      globalThis.fetch = mockFetch({ ok: true, text: "log line 1\nlog line 2" });

      const result = await client.getContainerLogs(1, "abc123");

      assert.strictEqual(result, "log line 1\nlog line 2");
      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.ok(fetchMock.mock.calls[0].arguments[0].includes("tail=100"));
    });

    it("should clamp tail to valid range", async () => {
      globalThis.fetch = mockFetch({ ok: true, text: "" });

      await client.getContainerLogs(1, "abc123", 50000);

      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.ok(fetchMock.mock.calls[0].arguments[0].includes("tail=10000"));
    });

    it("should clamp minimum tail to 1", async () => {
      globalThis.fetch = mockFetch({ ok: true, text: "" });

      await client.getContainerLogs(1, "abc123", -5);

      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.ok(fetchMock.mock.calls[0].arguments[0].includes("tail=1"));
    });
  });

  describe("containerAction", () => {
    it("should throw when write is disabled", async () => {
      await assert.rejects(
        () => client.containerAction(1, "abc123", "stop"),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          assert.strictEqual((err as PortainerClientError).code, "WRITE_DISABLED");
          return true;
        }
      );
    });

    it("should POST start action when write is enabled", async () => {
      globalThis.fetch = mockFetch({ ok: true, text: "" });

      await clientWithWrite.containerAction(1, "abc123", "start");

      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.strictEqual(fetchMock.mock.calls[0].arguments[1].method, "POST");
      assert.ok(fetchMock.mock.calls[0].arguments[0].includes("/start"));
    });

    it("should DELETE for remove action", async () => {
      globalThis.fetch = mockFetch({ ok: true, text: "" });

      await clientWithWrite.containerAction(1, "abc123", "remove");

      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.strictEqual(fetchMock.mock.calls[0].arguments[1].method, "DELETE");
      assert.ok(fetchMock.mock.calls[0].arguments[0].includes("force=true"));
    });
  });

  describe("getStacks", () => {
    it("should fetch stacks from /api/stacks", async () => {
      const mockStacks = [
        { Id: 1, Name: "mystack", Type: 1, EndpointId: 1, Status: 1, CreationDate: 0, UpdateDate: 0 },
      ];
      globalThis.fetch = mockFetch({ ok: true, body: mockStacks });

      const result = await client.getStacks();

      assert.deepStrictEqual(result, mockStacks);
    });
  });

  describe("createStack", () => {
    it("should throw when write is disabled", async () => {
      await assert.rejects(
        () => client.createStack(1, "test", "version: '3'"),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          assert.strictEqual((err as PortainerClientError).code, "WRITE_DISABLED");
          return true;
        }
      );
    });

    it("should POST stack creation when write is enabled", async () => {
      const mockStack = { Id: 1, Name: "test", Type: 1, EndpointId: 1, Status: 1, CreationDate: 0, UpdateDate: 0 };
      globalThis.fetch = mockFetch({ ok: true, body: mockStack });

      const result = await clientWithWrite.createStack(1, "test", "version: '3'");

      assert.deepStrictEqual(result, mockStack);
      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      assert.strictEqual(fetchMock.mock.calls[0].arguments[1].method, "POST");
      const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.name, "test");
      assert.strictEqual(body.stackFileContent, "version: '3'");
    });
  });

  describe("getImages", () => {
    it("should fetch images", async () => {
      const mockImages = [
        { Id: "sha256:abc", RepoTags: ["nginx:latest"], Size: 1024000, Created: 1234567890 },
      ];
      globalThis.fetch = mockFetch({ ok: true, body: mockImages });

      const result = await client.getImages(1);

      assert.deepStrictEqual(result, mockImages);
    });
  });

  describe("pullImage", () => {
    it("should throw when write is disabled", async () => {
      await assert.rejects(
        () => client.pullImage(1, "nginx:latest"),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          return true;
        }
      );
    });

    it("should parse image name and tag correctly", async () => {
      globalThis.fetch = mockFetch({ ok: true, text: "" });

      await clientWithWrite.pullImage(1, "nginx:alpine");

      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      const url = fetchMock.mock.calls[0].arguments[0];
      assert.ok(url.includes("fromImage=nginx"));
      assert.ok(url.includes("tag=alpine"));
    });

    it("should default to latest tag", async () => {
      globalThis.fetch = mockFetch({ ok: true, text: "" });

      await clientWithWrite.pullImage(1, "nginx");

      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      const url = fetchMock.mock.calls[0].arguments[0];
      assert.ok(url.includes("tag=latest"));
    });
  });

  describe("getVolumes", () => {
    it("should fetch volumes", async () => {
      const mockVolumes = { Volumes: [{ Name: "myvolume", Driver: "local", Mountpoint: "/var/lib/docker/volumes/myvolume", CreatedAt: "", Labels: {} }] };
      globalThis.fetch = mockFetch({ ok: true, body: mockVolumes });

      const result = await client.getVolumes(1);

      assert.deepStrictEqual(result, mockVolumes);
    });
  });

  describe("createVolume", () => {
    it("should throw when write is disabled", async () => {
      await assert.rejects(
        () => client.createVolume(1, "test"),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          return true;
        }
      );
    });
  });

  describe("getNetworks", () => {
    it("should fetch networks", async () => {
      const mockNetworks = [
        { Id: "net123", Name: "bridge", Driver: "bridge", Scope: "local", IPAM: { Config: [] } },
      ];
      globalThis.fetch = mockFetch({ ok: true, body: mockNetworks });

      const result = await client.getNetworks(1);

      assert.deepStrictEqual(result, mockNetworks);
    });
  });

  describe("createNetwork", () => {
    it("should throw when write is disabled", async () => {
      await assert.rejects(
        () => client.createNetwork(1, "test"),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          return true;
        }
      );
    });

    it("should include IPAM config when subnet provided", async () => {
      globalThis.fetch = mockFetch({ ok: true, body: { Id: "net123" } });

      await clientWithWrite.createNetwork(1, "mynet", "172.20.0.0/16");

      const fetchMock = globalThis.fetch as ReturnType<typeof mock.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.Name, "mynet");
      assert.deepStrictEqual(body.IPAM, { Config: [{ Subnet: "172.20.0.0/16" }] });
    });
  });

  describe("error handling", () => {
    it("should throw PortainerClientError on 401", async () => {
      globalThis.fetch = mockFetch({ ok: false, status: 401 });

      await assert.rejects(
        () => client.getEnvironments(),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          assert.strictEqual((err as PortainerClientError).code, "HTTP_401");
          assert.ok(err.message.includes("Invalid API key"));
          return true;
        }
      );
    });

    it("should throw PortainerClientError on 403", async () => {
      globalThis.fetch = mockFetch({ ok: false, status: 403 });

      await assert.rejects(
        () => client.getEnvironments(),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          assert.strictEqual((err as PortainerClientError).code, "HTTP_403");
          assert.ok(err.message.includes("Insufficient permissions"));
          return true;
        }
      );
    });

    it("should throw PortainerClientError on 404", async () => {
      globalThis.fetch = mockFetch({ ok: false, status: 404 });

      await assert.rejects(
        () => client.getEnvironment(999),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          assert.strictEqual((err as PortainerClientError).code, "HTTP_404");
          assert.ok(err.message.includes("Resource not found"));
          return true;
        }
      );
    });

    it("should parse error message from response body", async () => {
      globalThis.fetch = mockFetch({
        ok: false,
        status: 500,
        text: JSON.stringify({ message: "Internal server error details" }),
      });

      await assert.rejects(
        () => client.getEnvironments(),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          assert.ok(err.message.includes("Internal server error details"));
          return true;
        }
      );
    });

    it("should handle connection errors", async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new Error("ECONNREFUSED");
      });

      await assert.rejects(
        () => client.getEnvironments(),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          assert.strictEqual((err as PortainerClientError).code, "CONNECTION_ERROR");
          return true;
        }
      );
    });

    it("should handle timeout via AbortError", async () => {
      globalThis.fetch = mock.fn(async () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      });

      await assert.rejects(
        () => client.getEnvironments(),
        (err: Error) => {
          assert.ok(err instanceof PortainerClientError);
          assert.strictEqual((err as PortainerClientError).code, "TIMEOUT");
          return true;
        }
      );
    });
  });
});
