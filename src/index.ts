#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PortainerClient, PortainerClientError } from "./client.js";
import { allTools, handleToolCall } from "./tools/index.js";

// Version from package.json concept - keep in sync
const VERSION = "0.0.1";

// Environment validation with helpful messages
function validateEnvironment(): { url: string; apiKey: string; writeEnabled: boolean } {
  const url = process.env.PORTAINER_URL;
  const apiKey = process.env.PORTAINER_API_KEY;
  const writeEnabled = process.env.PORTAINER_WRITE_ENABLED === "true";

  const missing: string[] = [];
  if (!url) missing.push("PORTAINER_URL");
  if (!apiKey) missing.push("PORTAINER_API_KEY");

  if (missing.length > 0) {
    console.error("╭─ Portainer MCP Server ─ Configuration Error ─────────────────╮");
    console.error("│                                                               │");
    console.error(`│  Missing required environment variables:                      │`);
    missing.forEach((v) => {
      console.error(`│    • ${v.padEnd(52)}│`);
    });
    console.error("│                                                               │");
    console.error("│  Example configuration:                                       │");
    console.error("│    PORTAINER_URL=https://portainer.example.com:9443           │");
    console.error("│    PORTAINER_API_KEY=ptr_xxxxxxxxxxxxxxxxxxxx                 │");
    console.error("│    PORTAINER_WRITE_ENABLED=true  (optional)                   │");
    console.error("│                                                               │");
    console.error("╰───────────────────────────────────────────────────────────────╯");
    process.exit(1);
  }

  return { url: url!, apiKey: apiKey!, writeEnabled };
}

// Test connection to Portainer
async function testConnection(client: PortainerClient): Promise<{ ok: boolean; environments: number; error?: string }> {
  try {
    const environments = await client.getEnvironments();
    return { ok: true, environments: environments.length };
  } catch (error) {
    if (error instanceof PortainerClientError) {
      return { ok: false, environments: 0, error: error.message };
    }
    return { ok: false, environments: 0, error: String(error) };
  }
}

// Main startup
async function main() {
  const config = validateEnvironment();
  const client = new PortainerClient(config.url, config.apiKey, config.writeEnabled);

  // Test connection before starting
  console.error("╭─ Portainer MCP Server ──────────────────────────────────────────╮");
  console.error(`│  Version: ${VERSION.padEnd(53)}│`);
  console.error(`│  Portainer: ${config.url.substring(0, 50).padEnd(51)}│`);
  console.error(`│  Write mode: ${(config.writeEnabled ? "enabled" : "disabled").padEnd(50)}│`);
  console.error("├──────────────────────────────────────────────────────────────────┤");

  const connectionTest = await testConnection(client);
  if (!connectionTest.ok) {
    console.error(`│  ✗ Connection failed: ${(connectionTest.error || "Unknown error").substring(0, 40).padEnd(41)}│`);
    console.error("│                                                                  │");
    console.error("│  Troubleshooting:                                                │");
    console.error("│    • Check PORTAINER_URL is correct and reachable               │");
    console.error("│    • Verify API key is valid (Portainer → My Account → Tokens)  │");
    console.error("│    • Ensure no firewall blocking the connection                 │");
    console.error("╰──────────────────────────────────────────────────────────────────╯");
    process.exit(1);
  }

  console.error(`│  ✓ Connected (${connectionTest.environments} environment${connectionTest.environments !== 1 ? "s" : ""} found)${" ".repeat(Math.max(0, 35 - String(connectionTest.environments).length))}│`);
  console.error(`│  ✓ ${allTools.length} tools available${" ".repeat(47 - String(allTools.length).length)}│`);
  console.error("╰──────────────────────────────────────────────────────────────────╯");

  // Server setup
  const server = new Server(
    { name: "portainer-mcp", version: VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(client, name, args);
  });

  // Start transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("╭─ Portainer MCP Server ─ Fatal Error ────────────────────────────╮");
  console.error(`│  ${String(error).substring(0, 64).padEnd(64)}│`);
  console.error("╰──────────────────────────────────────────────────────────────────╯");
  process.exit(1);
});
