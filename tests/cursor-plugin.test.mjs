import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readUtf8(relPath) {
  const fullPath = path.join(ROOT, relPath);
  assert.equal(fs.existsSync(fullPath), true, `Expected file to exist: ${relPath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function readJson(relPath) {
  const raw = readUtf8(relPath);
  try {
    return JSON.parse(raw);
  } catch (err) {
    assert.fail(`Invalid JSON in ${relPath}: ${err.message}`);
  }
}

function parseYamlFrontmatter(raw, relPath) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(match, `${relPath} must start with YAML frontmatter delimited by ---`);
  const yamlBlock = match[1];
  const body = match[2];
  const fields = {};

  for (const line of yamlBlock.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value === "true") {
      fields[key] = true;
    } else if (value === "false") {
      fields[key] = false;
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      fields[key] = value.slice(1, -1);
    } else {
      fields[key] = value;
    }
  }

  return { fields, body };
}

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

test(".cursor-plugin/plugin.json satisfies Cursor plugin manifest contract", () => {
  const manifest = readJson(".cursor-plugin/plugin.json");

  assert.equal(manifest.name, "knot");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.license, "MIT");
  assert.equal(typeof manifest.description, "string");
  assert.ok(manifest.description.length > 20, "plugin description must be meaningful");
  assert.equal(typeof manifest.author, "object");
  assert.ok(manifest.author?.name, "author.name must be present");
  assert.equal(manifest.repository, "https://github.com/ConnectKnot/knot-cursor-plugin");

  // Cursor schema prohibits unknown top-level keys and unknown author keys
  const allowedAuthorKeys = new Set(["name", "email"]);
  for (const key of Object.keys(manifest.author)) {
    assert.ok(allowedAuthorKeys.has(key), `Unexpected author key in plugin.json: ${key}`);
  }

  assert.ok(manifest.mcpServers, "plugin.json must declare mcpServers");
  if (typeof manifest.mcpServers === "string") {
    const resolvedMcp = path.resolve(ROOT, manifest.mcpServers);
    assert.equal(resolvedMcp, path.join(ROOT, ".mcp.json"));
    assert.equal(fs.existsSync(resolvedMcp), true, "Referenced mcpServers file must exist");
  } else {
    assert.equal(
      manifest.mcpServers?.Knot?.url,
      "https://api.connectknot.com/mcp",
      "Inline mcpServers must define Knot URL"
    );
  }

  assert.equal(manifest.hooks, "./hooks/hooks.json");
  assert.equal(fs.existsSync(path.join(ROOT, "hooks/hooks.json")), true);
  assert.equal(manifest.rules, "./rules/");
  assert.equal(fs.existsSync(path.join(ROOT, "rules")), true);
  assert.equal(manifest.skills, "./skills/");
  assert.equal(fs.existsSync(path.join(ROOT, "skills")), true);
});

test(".mcp.json defines Knot remote MCP server without embedded credentials", () => {
  const mcpConfig = readJson(".mcp.json");
  assert.equal(typeof mcpConfig.mcpServers, "object");
  assert.equal(typeof mcpConfig.mcpServers.Knot, "object");
  assert.equal(mcpConfig.mcpServers.Knot.url, "https://api.connectknot.com/mcp");
  assert.equal(mcpConfig.mcpServers.Knot.headers, undefined, "Do not hardcode auth headers in .mcp.json");
  assert.equal(mcpConfig.mcpServers.Knot.env, undefined, "Do not embed tokens in .mcp.json");
});

test("rules/knot-context-governance.mdc enforces Turn-0 recovery, v1 -> v2 supersession, handoffs, and secret/PCI refusal", () => {
  const raw = readUtf8("rules/knot-context-governance.mdc");
  const { fields, body } = parseYamlFrontmatter(raw, "rules/knot-context-governance.mdc");

  assert.equal(typeof fields.description, "string");
  assert.ok(fields.description.length > 15, "Rule frontmatter description must be non-empty");
  assert.equal(fields.alwaysApply, true, "Rule must set alwaysApply: true");

  assert.match(body, /\bget_relevant_context\b/);
  assert.match(body, /\bget_context_recovery\b/);
  assert.match(body, /\bpropose_context\b/);
  assert.match(body, /\bsupersedes_context_id\b/);
  assert.match(body, /\bcreate_handoff\b/);
  assert.match(body, /v1\s*->\s*v2/);
  assert.match(body, /PCI/i);
  assert.match(body, /secret|credential|API key|token/i);
  assert.match(body, /refuse|never\s+(?:store|write|commit|propose)/i);
});

test("skills/knot-context-governance/SKILL.md defines valid frontmatter and actionable workflow", () => {
  const raw = readUtf8("skills/knot-context-governance/SKILL.md");
  const { fields, body } = parseYamlFrontmatter(raw, "skills/knot-context-governance/SKILL.md");

  assert.equal(fields.name, "knot-context-governance");
  assert.equal(typeof fields.description, "string");
  assert.ok(fields.description.length > 20, "Skill description must be non-empty");

  assert.match(body, /\bknot_list_scopes\b/);
  assert.match(body, /\bget_context_recovery\b/);
  assert.match(body, /\bget_relevant_context\b/);
  assert.match(body, /\bpropose_context\b/);
  assert.match(body, /\bsupersedes_context_id\b/);
  assert.match(body, /\bcreate_handoff\b/);
  assert.match(body, /\bupdate_handoff_status\b/);
  assert.match(body, /\bidempotency_key\b/);
  assert.match(body, /PCI_CDE_PAYLOAD_REJECTED/);
});

test("hooks/hooks.json and scripts/session-check.mjs run cleanly on sessionStart stdin", () => {
  const hooksConfig = readJson("hooks/hooks.json");
  assert.equal(hooksConfig.version, 1);
  assert.ok(Array.isArray(hooksConfig.hooks?.sessionStart), "hooks.sessionStart must be an array");
  assert.ok(hooksConfig.hooks.sessionStart.length >= 1, "At least one sessionStart hook is required");

  const hookCommand = hooksConfig.hooks.sessionStart[0].command;
  assert.equal(typeof hookCommand, "string");
  assert.match(hookCommand, /scripts\/session-check\.mjs/);
  assert.match(hookCommand, /\$\{CURSOR_PLUGIN_ROOT\}/);

  const scriptPath = path.join(ROOT, "scripts/session-check.mjs");
  assert.equal(fs.existsSync(scriptPath), true, "scripts/session-check.mjs must exist");

  // Sample Cursor sessionStart hook payload
  const samplePayload = JSON.stringify({
    conversation_id: "conv-123",
    generation_id: "gen-456",
    session_id: "sess-789",
    hook_event_name: "sessionStart",
    workspace_roots: [ROOT]
  });

  // Run directly via `node scripts/session-check.mjs`
  const run = spawnSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    input: samplePayload,
    encoding: "utf8"
  });

  assert.equal(run.status, 0, `Expected exit 0, got ${run.status}: ${run.stderr}`);
  const parsed = JSON.parse(run.stdout.trim());
  assert.equal(parsed.continue, true);
  assert.equal(typeof parsed.additional_context, "string");
  assert.match(parsed.additional_context, /get_relevant_context/);
  assert.match(parsed.additional_context, /get_context_recovery/);
  assert.match(parsed.additional_context, /supersedes_context_id/);
  assert.match(parsed.additional_context, /https:\/\/api\.connectknot\.com\/mcp/);

  // Run via exact hooks.json command template with CURSOR_PLUGIN_ROOT set
  const expandedCmd = hookCommand.replaceAll("${CURSOR_PLUGIN_ROOT}", ROOT);
  const hookRun = spawnSync(expandedCmd, {
    cwd: ROOT,
    shell: true,
    input: samplePayload,
    encoding: "utf8"
  });
  assert.equal(hookRun.status, 0, `Expanded hooks.json command failed: ${hookRun.stderr}`);
  const hookParsed = JSON.parse(hookRun.stdout.trim());
  assert.equal(hookParsed.continue, true);

  // Resilience check: empty stdin and custom EnterpriseBrain workspace override
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "knot-cursor-hook-test-"));
  try {
    fs.mkdirSync(path.join(tmpDir, ".cursor"));
    fs.writeFileSync(
      path.join(tmpDir, ".cursor/mcp.json"),
      JSON.stringify({
        mcpServers: {
          Knot: { url: "https://knot-internal.corp.internal/mcp" }
        }
      })
    );

    const enterpriseRun = spawnSync(process.execPath, [scriptPath], {
      cwd: tmpDir,
      input: JSON.stringify({
        hook_event_name: "sessionStart",
        workspace_roots: [tmpDir]
      }),
      encoding: "utf8"
    });
    assert.equal(enterpriseRun.status, 0);
    const enterpriseOut = JSON.parse(enterpriseRun.stdout.trim());
    assert.equal(enterpriseOut.continue, true);
    assert.match(enterpriseOut.additional_context, /https:\/\/knot-internal\.corp\.internal\/mcp/);

    const emptyStdinRun = spawnSync(process.execPath, [scriptPath], {
      cwd: ROOT,
      input: "",
      encoding: "utf8"
    });
    assert.equal(emptyStdinRun.status, 0);
    const emptyOut = JSON.parse(emptyStdinRun.stdout.trim());
    assert.equal(emptyOut.continue, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("README.md includes Cursor 1-click install deeplink, comparison TL;DR, EnterpriseBrain VPC config, Security FAQ, and required cross-links", () => {
  const readme = readUtf8("README.md");

  // 1-click install deeplink with exact base64 config
  const linkMatch = readme.match(
    /https:\/\/cursor\.com\/install-mcp\?[^\s)"'>]+/
  );
  assert.ok(linkMatch, "README.md must include a https://cursor.com/install-mcp deeplink");
  const installUrl = new URL(linkMatch[0]);
  assert.equal(installUrl.searchParams.get("name"), "Knot");
  const encodedConfig = installUrl.searchParams.get("config");
  assert.ok(encodedConfig, "Install deeplink must include config query param");
  const decodedConfig = JSON.parse(Buffer.from(encodedConfig, "base64").toString("utf8"));
  assert.deepEqual(decodedConfig, { url: "https://api.connectknot.com/mcp" });

  // Required sections and content
  assert.match(readme, /TL;DR/i);
  assert.match(readme, /\.cursorrules/);
  assert.match(readme, /v1\s*->\s*v2/);
  assert.match(readme, /Knot EnterpriseBrain/);
  assert.match(readme, /VPC/i);
  assert.match(readme, /KNOT_DEPLOYMENT_MODE/);
  assert.match(readme, /Security.*Privacy.*VPC FAQ|Security, Privacy, and VPC FAQ/i);

  // Required connectknot.com cross-links
  const requiredLinks = [
    "https://connectknot.com",
    "https://connectknot.com/enterprise-brain",
    "https://connectknot.com/whitepaper",
    "https://connectknot.com/quickstart",
    "https://connectknot.com/llms-full.txt"
  ];
  for (const link of requiredLinks) {
    assert.ok(readme.includes(link), `README.md must include required link: ${link}`);
  }

  // Verify local markdown links resolve to real files
  for (const match of readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (target.startsWith("http://") || target.startsWith("https://") || target.startsWith("#")) {
      continue;
    }
    const cleanTarget = target.split("#")[0];
    assert.equal(
      fs.existsSync(path.join(ROOT, cleanTarget)),
      true,
      `Broken relative link in README.md: ${target}`
    );
  }
});

test("LICENSE is MIT for ConnectKnot and CI workflow tests Node 22", () => {
  const license = readUtf8("LICENSE");
  assert.match(license, /MIT License/);
  assert.match(license, /ConnectKnot/);

  const ci = readUtf8(".github/workflows/ci.yml");
  assert.match(ci, /node-version:\s*["']?22["']?/);
  assert.match(ci, /node --test tests\/cursor-plugin\.test\.mjs/);
});

test("Repository contains zero Unicode em-dashes across all files", () => {
  const files = walkFiles(ROOT);
  assert.ok(files.length > 0, "Repository must contain tracked source files");

  for (const fullPath of files) {
    const content = fs.readFileSync(fullPath, "utf8");
    const relPath = path.relative(ROOT, fullPath);
    assert.equal(
      content.includes("\u2014"),
      false,
      `Forbidden Unicode em-dash (\\u2014) found in ${relPath}`
    );
  }
});
