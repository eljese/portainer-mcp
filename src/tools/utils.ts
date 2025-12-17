import { PortainerClientError } from "../client.js";

export type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function formatResponse(data: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Format response with compose content displayed as readable YAML.
 * Separates metadata from compose content for better readability.
 */
export function formatStackResponse(
  metadata: Record<string, unknown>,
  composeContent?: string
): ToolResponse {
  const content: Array<{ type: "text"; text: string }> = [
    {
      type: "text" as const,
      text: JSON.stringify(metadata, null, 2),
    },
  ];

  if (composeContent) {
    content.push({
      type: "text" as const,
      text: `\n--- Docker Compose File ---\n\`\`\`yaml\n${composeContent}\n\`\`\``,
    });
  }

  return { content };
}

export function formatError(error: unknown): ToolResponse {
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
