function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function claudeHasEnabledPlugin(text: string, name: string): boolean {
  const parsed = parseJson(text);
  if (!Array.isArray(parsed)) return false;
  return parsed.some((entry) => {
    const plugin = object(entry);
    return plugin !== null
      && plugin.enabled === true
      && typeof plugin.id === "string"
      && (plugin.id === name || plugin.id.startsWith(`${name}@`));
  });
}

export function codexHasEnabledPlugin(text: string, name: string): boolean {
  const parsed = object(parseJson(text));
  if (parsed === null || !Array.isArray(parsed.installed)) return false;
  return parsed.installed.some((entry) => {
    const plugin = object(entry);
    return plugin !== null && plugin.name === name && plugin.installed === true && plugin.enabled === true;
  });
}

export function codexHasEnabledMcp(text: string, name: string): boolean {
  const parsed = parseJson(text);
  if (!Array.isArray(parsed)) return false;
  return parsed.some((entry) => {
    const server = object(entry);
    return server !== null && server.name === name && server.enabled === true;
  });
}

export function textHasIdentifier(text: string, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`, "m").test(text);
}

export function hermesHasEnabledTool(text: string, requiredTool: string): boolean {
  const mcpStyle = requiredTool.match(/^mcp__(.+?)__/);
  const identifiers = new Set([
    requiredTool,
    requiredTool.split(":", 1)[0]!,
    ...(mcpStyle?.[1] === undefined ? [] : [mcpStyle[1]]),
  ]);
  const clean = text.replace(/\u001b\[[0-9;]*m/g, "");
  return clean.split("\n").some((line) => {
    if (/disabled/i.test(line) || !/(?:✓\s*)?enabled|all tools enabled/i.test(line)) return false;
    return [...identifiers].some((identifier) => textHasIdentifier(line, identifier));
  });
}
