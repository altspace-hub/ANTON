/**
 * Slack Webhook Adapter — outbound messaging to Slack via Incoming Webhooks.
 * No Slack app or OAuth required — just a webhook URL from a Slack channel integration.
 *
 * How to get a webhook URL:
 *   Slack → Channel settings → Integrations → Add apps → Incoming Webhooks
 */

import { toSlackBlocks, toPlainText, type MessagePayload } from './message-formatter.js';

export interface SlackWebhookConfig {
  webhookUrl: string;          // Slack incoming webhook URL
  defaultChannel?: string;     // Optional channel override (must match webhook channel)
  username?: string;           // Display name override (default: 'ANTON')
  iconEmoji?: string;          // Icon emoji (default: ':robot_face:')
}

export interface SlackSendResult {
  ok: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Send a message to a Slack channel via incoming webhook.
 */
export async function sendSlackMessage(
  config: SlackWebhookConfig,
  message: MessagePayload,
): Promise<SlackSendResult> {
  if (!config.webhookUrl?.startsWith('https://hooks.slack.com/')) {
    return { ok: false, error: 'Invalid Slack webhook URL (must start with https://hooks.slack.com/)' };
  }

  const blocks = toSlackBlocks(message);
  const payload = {
    ...blocks,
    username: config.username ?? 'ANTON by openEXPERT',
    icon_emoji: config.iconEmoji ?? ':robot_face:',
    ...(config.defaultChannel ? { channel: config.defaultChannel } : {}),
    // Fallback text for notifications and accessibility
    text: `${message.title}: ${message.body.slice(0, 150)}`,
  };

  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Slack returned ${res.status}: ${text}`, statusCode: res.status };
    }

    return { ok: true, statusCode: res.status };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${msg}` };
  }
}

/**
 * Test a Slack webhook URL by sending a test message.
 */
export async function testSlackWebhook(webhookUrl: string): Promise<SlackSendResult> {
  return sendSlackMessage(
    { webhookUrl },
    {
      title: 'ANTON Connection Test',
      body: 'Your Slack integration is configured correctly. ANTON notifications will appear here.',
      level: 'success',
    },
  );
}
