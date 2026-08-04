import { ClaudeCodeRuntimeAdapter } from "./claude-code.js";
import { CodexRuntimeAdapter } from "./codex.js";
import { HermesRuntimeAdapter } from "./hermes.js";
import { runtimeNames, type RuntimeAdapter, type RuntimeName } from "./types.js";
import type { CommandRunner } from "./types.js";

const adapters = new Map<RuntimeName, RuntimeAdapter>();
adapters.set("hermes", new HermesRuntimeAdapter());
adapters.set("claude-code", new ClaudeCodeRuntimeAdapter());
adapters.set("codex", new CodexRuntimeAdapter());

export function registerRuntimeAdapter(adapter: RuntimeAdapter): void {
  adapters.set(adapter.name, adapter);
}

export function getRuntimeAdapter(name: string): RuntimeAdapter {
  if (!(runtimeNames as readonly string[]).includes(name)) throw new Error(`Unknown runtime: ${name}`);
  const adapter = adapters.get(name as RuntimeName);
  if (!adapter) throw new Error(`Runtime adapter not registered: ${name}`);
  return adapter;
}

export function createRuntimeAdapter(name: string, runner?: CommandRunner): RuntimeAdapter {
  if (!(runtimeNames as readonly string[]).includes(name)) throw new Error(`Unknown runtime: ${name}`);
  if (name === "hermes") return new HermesRuntimeAdapter(runner);
  if (name === "claude-code") return new ClaudeCodeRuntimeAdapter(runner);
  return new CodexRuntimeAdapter(runner);
}
