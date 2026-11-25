# Knot Plugin for Cursor

**Governed shared context, Turn-0 recovery, deterministic `v1 -> v2` supersession, and cross-AI handoffs inside Cursor over MCP.**

## 1-Click Install in Cursor

Click below to register the hosted Knot MCP server (`https://api.connectknot.com/mcp`) directly in Cursor using OAuth 2.1 + PKCE:

[![Install Knot MCP in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=Knot&config=eyJ1cmwiOiJodHRwczovL2FwaS5jb25uZWN0a25vdC5jb20vbWNwIn0%3D)

Direct install link:

```text
https://cursor.com/install-mcp?name=Knot&config=eyJ1cmwiOiJodHRwczovL2FwaS5jb25uZWN0a25vdC5jb20vbWNwIn0%3D
```

### Install the Full Cursor Plugin (Rules, Skill, Hook, and MCP)

1. Open **Cursor Settings** -> **Plugins** (or **Team Marketplaces**).
2. Import or add this repository URL:

```text
https://github.com/ConnectKnot/knot-cursor-plugin
```

3. Enable the **Knot** plugin and complete the browser **OAuth 2.1 with PKCE** sign-in when prompted (`https://api.connectknot.com/.well-known/oauth-protected-resource`). Zero API keys or static tokens are stored on disk.

## TL;DR: Static `.cursorrules` vs Live `v1 -> v2` Context Governance

| Capability | Static `.cursorrules` / Flat Notes | Knot Live `v1 -> v2` Context Governance |
| :--- | :--- | :--- |
| **Source of truth** | Manually edited repo markdown frozen at commit time | Live governed context compiled across ChatGPT, Claude, Gemini, Kiro, and Cursor |
| **Rule evolution** | Old `v1` and new `v2` prose sit side-by-side until someone deletes lines | Deterministic `v1 -> v2` supersession (`supersedes_context_id`) with full audit trail |
| **Turn-0 recovery** | Relies on developer remembering to paste decisions from chat tools | `sessionStart` hook + always-on rule trigger `get_context_recovery` and `get_relevant_context` |
| **Read latency & cost** | Large static prompt files consume context tokens on every turn | `<15ms` deterministic reads with zero read-time LLM calls (`EnterpriseRAG-Bench`) |
| **Cross-AI handoffs** | Copy-paste between ChatGPT, Claude, and Cursor | Structured `check_pending_handoffs`, `update_handoff_status`, and `create_handoff` |
| **Secret & PCI safety** | Whatever gets pasted into `.cursorrules` stays in git history | Write-door blocks PAN/CVV (`HTTP 422 PCI_CDE_PAYLOAD_REJECTED`) and high-entropy secrets |

## Included Plugin Components

```text
knot-cursor-plugin/
├── .cursor-plugin/
│   └── plugin.json                        # Official Cursor plugin manifest
├── .mcp.json                              # Remote Streamable HTTP MCP config (https://api.connectknot.com/mcp)
├── rules/
│   └── knot-context-governance.mdc        # Always-on rule: Turn-0 recovery, v1 -> v2, handoffs, secret/PCI refusal
├── skills/
│   └── knot-context-governance/
│       └── SKILL.md                       # Step-by-step governance and supersession workflow
├── hooks/
│   └── hooks.json                         # Cursor sessionStart hook manifest
├── scripts/
│   └── session-check.mjs                  # Zero-dependency Node script emitting sessionStart context
├── tests/
│   └── cursor-plugin.test.mjs             # Node 22 test suite verifying manifest, rules, hooks, and links
├── .github/
│   └── workflows/
│       └── ci.yml                         # GitHub Actions CI running tests on Node 22
├── LICENSE
└── README.md
```

## How It Works Inside Cursor

1. **Session Start (`hooks/hooks.json` + `scripts/session-check.mjs`)**: When a Cursor chat starts, `session-check.mjs` inspects workspace MCP overrides (`.cursor/mcp.json`, `.mcp.json`, or `KNOT_MCP_URL`) and injects Turn-0 governance instructions via `additional_context`.
2. **Turn-0 Recovery (`rules/knot-context-governance.mdc`)**: Cursor checks `check_pending_handoffs`, `get_context_recovery`, and `get_relevant_context` (using `query_mode: "trajectory"` for security, compliance, schema, or retry constraints) before modifying files.
3. **`v1 -> v2` Supersession (`skills/knot-context-governance/SKILL.md`)**: When implementation changes an earlier assumption, Cursor proposes an atomic update via `propose_context` with `supersedes_context_id` and a deterministic `idempotency_key` so stale `v1` decisions never leak back into future sessions.
4. **Closed-Loop Handoffs**: Cursor updates accepted tasks with `update_handoff_status` and delegates follow-up work (release notes, security review, or stakeholder QA) to ChatGPT, Claude, or Gemini via `create_handoff`.

## Self-Hosted `Knot EnterpriseBrain` VPC Configuration

Regulated engineering teams can run the identical single codebase inside their own cloud VPC or air-gapped cluster (`KNOT_DEPLOYMENT_MODE=self_hosted`) on PostgreSQL with `pgvector` and point Cursor at the internal `/mcp` ingress instead of hosted Knot Cloud.

### 1. Workspace `.cursor/mcp.json` Override

Create or update `.cursor/mcp.json` in your repository (or user-level `~/.cursor/mcp.json`) to route Cursor to your internal VPC endpoint:

```json
{
  "mcpServers": {
    "Knot": {
      "url": "https://knot-internal.your-vpc.internal/mcp"
    }
  }
}
```

`scripts/session-check.mjs` automatically detects `.cursor/mcp.json` overrides on `sessionStart` and switches Cursor's session context to your EnterpriseBrain VPC endpoint.

### 2. EnterpriseBrain Server Environment Highlights

```env
KNOT_DEPLOYMENT_MODE=self_hosted
KNOT_ALLOW_REMOTE_MODELS=false
DATABASE_URL=postgres://knot:***@aurora-internal.vpc:5432/knot
KNOT_ORG_LICENSE=/etc/knot/license.ed25519
```

- **Helm Presets**: `aws-eks.yaml`, `gcp-gke.yaml`, `azure-aks.yaml`, and `airgap-minimal.yaml`.
- **Zero Outbound Egress**: Setting `KNOT_ALLOW_REMOTE_MODELS=false` disables outbound LLM calls, telemetry, and license phone-home traffic.
- **Customer KMS Key Custody**: 3-level HKDF encryption (`K_org_root -> K_domain -> K_subject`) unwrapped via AWS KMS (SigV4), GCP Cloud KMS, Azure Key Vault, or HashiCorp Vault, with `<100ms` subject crypto-erasure.

## Security, Privacy, and VPC FAQ

**Does `.mcp.json` store API keys or long-lived tokens?**
No. Hosted Knot uses user-delegated OAuth 2.1 with PKCE and Dynamic Client Registration (`https://api.connectknot.com/.well-known/oauth-protected-resource`). Cursor opens a browser consent flow and scopes access to the knots you approve (`context:read`, `context:propose`, `context:contribute:project`).

**How does Knot prevent Cursor from committing secrets or PCI cardholder data?**
Protection runs in two layers. First, `rules/knot-context-governance.mdc` and `skills/knot-context-governance/SKILL.md` instruct Cursor to refuse and strip raw API keys, bearer tokens, private keys, and cardholder numbers before writing. Second, the Knot write door blocks raw PAN/CVV payloads (`HTTP 422 PCI_CDE_PAYLOAD_REJECTED`) and high-entropy credentials (`Shannon entropy H >= 3.55 bits/char` on assignments) before storage or indexing.

**How are shared team decisions protected from accidental overwrites?**
Writes to shared Knots support explicit `confirm_shared: true` checks, `needs_clarification` disambiguation when `related` items exist, and declarative `knot-policy.yaml` domain authority ACLs in EnterpriseBrain so lower-authority agents cannot silently overwrite production constraints.

**Can we verify the plugin offline before rolling it out to our team?**
Yes. Run the built-in Node 22 test suite with zero external dependencies:

```bash
node --test tests/cursor-plugin.test.mjs
```

## Links and Resources

- **Knot Home**: [https://connectknot.com](https://connectknot.com)
- **Developer Quickstart**: [https://connectknot.com/quickstart](https://connectknot.com/quickstart)
- **Knot EnterpriseBrain VPC**: [https://connectknot.com/enterprise-brain](https://connectknot.com/enterprise-brain)
- **Technical Whitepaper & Benchmarks**: [https://connectknot.com/whitepaper](https://connectknot.com/whitepaper)
- **Full LLM & Architecture Reference**: [https://connectknot.com/llms-full.txt](https://connectknot.com/llms-full.txt)

## License

MIT License. See [LICENSE](LICENSE).
