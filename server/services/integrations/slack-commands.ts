/**
 * Slack Slash Command Handler
 *
 * Handles inbound Slack slash commands: /anton <subcommand> [args]
 *
 * Supported commands:
 *   /anton brief <question>       — runs a quick question through Brief Me service
 *   /anton status <workflow-id>   — returns current workflow status
 *   /anton latest <area>          — returns most recent session in an area
 *   /anton help                   — lists available commands
 *
 * Authentication: HMAC-SHA256 signature verification (x-slack-signature header)
 * Required env: SLACK_SIGNING_SECRET
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

// ── HMAC Verification ─────────────────────────────────────────────────────

export interface SlackCommandPayload {
  command: string;          // '/anton'
  text: string;             // everything after the command
  user_id: string;
  user_name: string;
  channel_id: string;
  team_id: string;
  response_url: string;     // URL to post delayed responses
  trigger_id: string;
}

/**
 * Verify a Slack request signature.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(params: {
  signingSecret: string;
  rawBody: string;
  timestamp: string;
  signature: string;
}): boolean {
  const { signingSecret, rawBody, timestamp, signature } = params;

  // Reject if timestamp is more than 5 minutes old (replay attack prevention)
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parseInt(timestamp, 10)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`;

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Command routing ───────────────────────────────────────────────────────

export interface CommandResult {
  text: string;
  response_type?: 'ephemeral' | 'in_channel';
  blocks?: object[];
}

export async function handleSlackCommand(
  payload: SlackCommandPayload,
  db: DatabaseAdapter,
): Promise<CommandResult> {
  const parts = payload.text.trim().split(/\s+/);
  const subcommand = (parts[0] || 'help').toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (subcommand) {
    case 'brief':
      return handleBrief(args, payload, db);
    case 'status':
      return handleStatus(args, db);
    case 'latest':
      return handleLatest(args, db);
    case 'help':
    default:
      return helpMessage();
  }
}

// ── /anton brief <question> ───────────────────────────────────────────────

async function handleBrief(
  question: string,
  payload: SlackCommandPayload,
  db: DatabaseAdapter,
): Promise<CommandResult> {
  if (!question) {
    return { text: 'Usage: `/anton brief <your question>`', response_type: 'ephemeral' };
  }

  // Look up recent sessions for context
  const recentSession = await db.get(
    "SELECT id, module_id, title, summary FROM sessions WHERE summary IS NOT NULL ORDER BY updated_at DESC LIMIT 1"
  ) as { id: string; module_id: string; title: string; summary: string } | undefined;

  // Return an immediate acknowledgement + note that full analysis is available in web UI
  // (For actual AI response we'd need async handling — this is the Pattern B approach:
  //  immediate response + POST to response_url once LLM completes)
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3001';

  return {
    response_type: 'ephemeral',
    text: `*Question received:* ${question}\n\n` +
      (recentSession
        ? `Recent context: *${recentSession.title}* (${recentSession.module_id})\n${recentSession.summary?.slice(0, 200) ?? ''}\n\n`
        : '') +
      `For a full analysis, open ANTON: ${baseUrl}\n\n` +
      `_Tip: /anton run gap-analysis to trigger a full module analysis_`,
  };
}

// ── /anton status <run-id-or-workflow-id> ────────────────────────────────

async function handleStatus(
  id: string,
  db: DatabaseAdapter,
): Promise<CommandResult> {
  if (!id) {
    return { text: 'Usage: `/anton status <workflow-run-id>`', response_type: 'ephemeral' };
  }

  // Try workflow run first
  const run = await db.get(
    "SELECT * FROM workflow_runs WHERE id = ? OR workflow_id = ? ORDER BY started_at DESC LIMIT 1"
  , id, id) as { id: string; workflow_id: string; status: string; started_at: string; completed_at: string | null; error_message: string | null } | undefined;

  if (!run) {
    return { text: `No workflow run found for ID: \`${id}\``, response_type: 'ephemeral' };
  }

  const statusEmoji: Record<string, string> = {
    completed: '✅', running: '⏳', failed: '❌', pending: '🕐',
  };
  const emoji = statusEmoji[run.status] || '❓';

  return {
    response_type: 'ephemeral',
    text: `${emoji} *Workflow Run Status*\n` +
      `Run ID: \`${run.id}\`\n` +
      `Status: *${run.status}*\n` +
      `Started: ${run.started_at}\n` +
      (run.completed_at ? `Completed: ${run.completed_at}\n` : '') +
      (run.error_message ? `Error: ${run.error_message}\n` : ''),
  };
}

// ── /anton latest <area> ──────────────────────────────────────────────────

async function handleLatest(
  area: string,
  db: DatabaseAdapter,
): Promise<CommandResult> {
  const query = area
    ? "SELECT id, title, summary, updated_at FROM sessions WHERE module_id LIKE ? ORDER BY updated_at DESC LIMIT 1"
    : "SELECT id, title, summary, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 1";

  const session = area
    ? await db.get(query, `%${area}%`) as { id: string; title: string; summary: string; updated_at: string } | undefined
    : await db.get(query) as { id: string; title: string; summary: string; updated_at: string } | undefined;

  if (!session) {
    return {
      text: area ? `No recent sessions found for area: *${area}*` : 'No sessions found.',
      response_type: 'ephemeral',
    };
  }

  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3001';
  return {
    response_type: 'ephemeral',
    text: `*Latest session:* ${session.title}\n` +
      `Updated: ${session.updated_at}\n` +
      (session.summary ? `${session.summary.slice(0, 300)}\n\n` : '') +
      `View: ${baseUrl}/sessions/${session.id}`,
  };
}

// ── /anton help ───────────────────────────────────────────────────────────

function helpMessage(): CommandResult {
  return {
    response_type: 'ephemeral',
    text: `*ANTON by openEXPERT — available commands:*\n\n` +
      `• \`/anton brief <question>\` — Quick question to ANTON\n` +
      `• \`/anton status <run-id>\` — Check workflow run status\n` +
      `• \`/anton latest [area]\` — Most recent session (optionally filtered by area)\n` +
      `• \`/anton help\` — Show this message\n\n` +
      `_For full analysis and rich outputs, use the web UI._`,
  };
}
