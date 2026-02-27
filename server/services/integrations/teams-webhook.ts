/**
 * Microsoft Teams Webhook Adapter — outbound messaging via Incoming Webhooks.
 * No Azure Bot registration required — just a webhook URL from a Teams channel.
 *
 * How to get a webhook URL:
 *   Teams channel → ... menu → Connectors → Incoming Webhook → Configure
 */

import { toTeamsCard, toPlainText, type MessagePayload } from './message-formatter.js';

export interface TeamsWebhookConfig {
  webhookUrl: string;          // Teams incoming webhook URL
}

export interface TeamsSendResult {
  ok: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Send a message to a Teams channel via incoming webhook.
 * Uses Adaptive Cards format for rich formatting.
 */
export async function sendTeamsMessage(
  config: TeamsWebhookConfig,
  message: MessagePayload,
): Promise<TeamsSendResult> {
  if (!config.webhookUrl?.startsWith('https://')) {
    return { ok: false, error: 'Invalid Teams webhook URL' };
  }

  const card = toTeamsCard(message);

  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Teams returned ${res.status}: ${text}`, statusCode: res.status };
    }

    return { ok: true, statusCode: res.status };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${msg}` };
  }
}

/**
 * Test a Teams webhook URL.
 */
export async function testTeamsWebhook(webhookUrl: string): Promise<TeamsSendResult> {
  return sendTeamsMessage(
    { webhookUrl },
    {
      title: 'ANTON Connection Test',
      body: 'Your Microsoft Teams integration is configured correctly. ANTON notifications will appear here.',
      level: 'success',
    },
  );
}
