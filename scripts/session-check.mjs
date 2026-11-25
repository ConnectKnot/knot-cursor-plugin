#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CLOUD_URL = "https://api.connectknot.com/mcp";

function readStdinUtf8() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseJsonSafe(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractKnotUrl(mcpPath) {
  if (!fs.existsSync(mcpPath)) return null;
  const parsed = parseJsonSafe(fs.readFileSync(mcpPath, "utf8"));
  const servers = parsed?.mcpServers;
  if (!servers || typeof servers !== "object") return null;

  const candidate = servers.Knot ?? servers.knot;
  if (candidate && typeof candidate.url === "string" && candidate.url.trim()) {
    return candidate.url.trim();
  }
  return null;
}

function resolveKnotEndpoint(payload) {
  if (process.env.KNOT_MCP_URL && process.env.KNOT_MCP_URL.trim()) {
    return process.env.KNOT_MCP_URL.trim();
  }

  const workspaceRoots = Array.isArray(payload?.workspace_roots)
    ? payload.workspace_roots
    : [];
  const candidates = [];

  for (const root of workspaceRoots) {
    if (typeof root === "string" && root.trim()) {
      candidates.push(path.join(root, ".cursor", "mcp.json"));
      candidates.push(path.join(root, ".mcp.json"));
    }
  }

  if (typeof payload?.cwd === "string" && payload.cwd.trim()) {
    candidates.push(path.join(payload.cwd, ".cursor", "mcp.json"));
    candidates.push(path.join(payload.cwd, ".mcp.json"));
  }

  candidates.push(path.join(process.cwd(), ".cursor", "mcp.json"));
  candidates.push(path.join(process.cwd(), ".mcp.json"));
  candidates.push(path.join(PLUGIN_ROOT, ".mcp.json"));

  for (const candidatePath of candidates) {
    const url = extractKnotUrl(candidatePath);
    if (url) return url;
  }

  return DEFAULT_CLOUD_URL;
}

function main() {
  const payload = parseJsonSafe(readStdinUtf8()) ?? {};
  const endpointUrl = resolveKnotEndpoint(payload);
  const modeLabel =
    endpointUrl === DEFAULT_CLOUD_URL
      ? "Knot Cloud OAuth 2.1"
      : "Self-Hosted Knot EnterpriseBrain VPC";

  const output = {
    continue: true,
    additional_context: [
      `Knot MCP endpoint configured: ${endpointUrl} (${modeLabel}).`,
      'Turn-0 recovery: call get_context_recovery or get_relevant_context (use query_mode: "trajectory" for security, schema, billing, or retry rules) and check_pending_handoffs before making architecture or code edits.',
      "Governance rules: resolve v1 -> v2 updates with propose_context and supersedes_context_id (plus idempotency_key), delegate cross-AI work via create_handoff, and refuse to store raw secrets, API keys, tokens, or PCI cardholder data."
    ].join(" ")
  };

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main();
