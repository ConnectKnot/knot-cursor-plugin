---
name: knot-context-governance
description: Recover governed project truth on Turn 0, enforce v1 -> v2 supersession with propose_context, coordinate cross-AI handoffs via create_handoff, and enforce secret and PCI refusal rules in Cursor.
license: MIT
metadata:
  author: ConnectKnot
  version: "1.0.0"
---

# Knot Context Governance Workflow

Use this skill when starting work in a repository connected to Knot, resolving conflicting cross-AI specifications, committing verified engineering decisions back upstream, or handing tasks across AI tools.

## Step 1: Verify Scope and Recover Turn-0 Context

1. Confirm the active connection and readable scopes:
   - Call `get_knot_connection_status` to check authentication and `projectContextRead` permissions.
   - Call `knot_list_scopes` to inspect personal and shared team Knots (`sharedKnots`, `scopes`).
   - If the project belongs to a shared team Knot, either pass `shared_knot_id` on each call or call `knot_set_active_scope`.
2. Check for pending cross-AI delegations:
   - Call `check_pending_handoffs` (or `list_handoffs` with `limit: 20`).
   - If accepting a handoff for Cursor, update status via `update_handoff_status` with `"status": "accepted"`, and switch to `"working"` before editing files.
3. Hydrate active governing truth before writing code:
   - Call `get_context_recovery` with `entity_hint`, `query`, `limit: 6`, and `trigger: "skill"` on session start or after chat compaction.
   - Call `get_relevant_context` with `query_mode: "trajectory"` for security, compliance, billing, schema, or retry rules so superseded `v1` decisions are clearly separated from active `v2` constraints.
   - Call `get_shared_understanding` when you need provenance across ChatGPT, Claude, Gemini, Kiro, and Cursor.
4. Surface conflicts instead of guessing:
   - If `potential_conflicts` is non-empty, show the competing statements, sources, and timestamps to the user and confirm which version stands before editing code.

## Step 2: Enforce `v1 -> v2` Supersession on Writes

Keep one atomic fact per item so individual rules evolve cleanly over time.

1. Read the prior active record with `get_relevant_context` to locate its context ID.
2. Call `propose_context` with `supersedes_context_id` and a deterministic `idempotency_key`:

```json
{
  "entity_hint": "OrderStream Webhook Service",
  "kind": "decision",
  "statement": "Enforce max 3 exponential-backoff retries with AWS SQS dead-letter queue retention of 14 days.",
  "supersedes_context_id": "<prior-v1-context-uuid>",
  "subject_key": "orderstream-retry-policy",
  "rationale": "Verified retry ceiling against PCI security guardrail in Cursor.",
  "confidence": "high",
  "idempotency_key": "cursor-orderstream-retry-v2"
}
```

3. Use `batch_propose_context` when recording 2 to 5 atomic updates after a milestone (for example, one `decision` and one verified `project_state`).
4. If Knot returns `needs_clarification` with `related` IDs, ask the user whether the new item replaces one (`supersedes_context_id`) or stands beside them (`coexists_with_context_ids`), then retry.
5. If Knot holds a shared write for confirmation, obtain user approval before re-submitting with `confirm_shared: true`.

## Step 3: Close and Delegate Cross-AI Handoffs

1. Report completed engineering work with `report_active_state` (`status: "completed"`, concise `task_summary`, and `activity_summary` citing tests that actually ran after your final edit).
2. Close any incoming handoff via `update_handoff_status`:

```json
{
  "handoff_id": "<handoff-uuid>",
  "status": "completed",
  "resolution_summary": "Implemented v2 constraint, verified unit tests pass, and superseded v1 state in Knot."
}
```

3. Pass follow-up tasks to ChatGPT, Claude, Gemini, or teammates via `create_handoff`:

```json
{
  "destination_client_id": "chatgpt",
  "context_refs": ["<verified-context-uuid>"],
  "task": "Draft release notes and rollout checklist from the verified v2 constraints synced in Knot."
}
```

## Step 4: Secret, Credential, and PCI Refusal Rules

1. Refuse to write raw secrets (API keys, OAuth tokens, private keys, passwords) or raw cardholder data (PAN, CVV, track data) into Knot, Cursor rules, or `.mcp.json`.
2. Redact sensitive strings into abstract architectural facts (for example, describe `"Use AWS KMS root key unwrapping"` rather than pasting key material).
3. If Knot rejects a write with `HTTP 422 PCI_CDE_PAYLOAD_REJECTED` or a high-entropy credential error (`H >= 3.55 bits/char`), scrub the offending payload completely instead of disguising or encoding it.

## Step 5: Self-Hosted EnterpriseBrain VPC Notes

For regulated organizations running self-hosted `Knot EnterpriseBrain` (`KNOT_DEPLOYMENT_MODE=self_hosted`, `KNOT_ALLOW_REMOTE_MODELS=false`), override `.cursor/mcp.json` locally in the workspace to point `mcpServers.Knot.url` at the internal VPC `/mcp` ingress rather than committing environment-specific internal hostnames to shared templates.
