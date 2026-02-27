/**
 * Message Formatter — shared formatting utilities for Slack and Teams messages.
 * Produces plain text, Slack Block Kit JSON, and Teams Adaptive Card JSON.
 */

export interface MessagePayload {
  title: string;
  body: string;
  url?: string;          // Link back to the ANTON session/workflow
  urlLabel?: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  fields?: Array<{ label: string; value: string }>;
}

// ── Slack Block Kit ────────────────────────────────────────────────────────

export function toSlackBlocks(msg: MessagePayload): object {
  const colorMap = { info: '#3498DB', success: '#27AE60', warning: '#F5A623', error: '#E74C3C' };
  const color = colorMap[msg.level ?? 'info'];

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: msg.title.slice(0, 150), emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: msg.body.slice(0, 2000) },
    },
  ];

  if (msg.fields && msg.fields.length > 0) {
    blocks.push({
      type: 'section',
      fields: msg.fields.slice(0, 10).map(f => ({
        type: 'mrkdwn',
        text: `*${f.label}*\n${f.value}`,
      })),
    });
  }

  if (msg.url) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: msg.urlLabel ?? 'View in ANTON', emoji: true },
        url: msg.url,
        style: 'primary',
      }],
    });
  }

  blocks.push({ type: 'divider' });

  return {
    attachments: [{
      color,
      blocks,
    }],
  };
}

// ── Teams Adaptive Card ────────────────────────────────────────────────────

export function toTeamsCard(msg: MessagePayload): object {
  const accentMap = { info: 'Accent', success: 'Good', warning: 'Warning', error: 'Attention' };
  const accent = accentMap[msg.level ?? 'info'];

  const body: object[] = [
    {
      type: 'TextBlock',
      size: 'Large',
      weight: 'Bolder',
      text: msg.title,
      color: accent,
      wrap: true,
    },
    {
      type: 'TextBlock',
      text: msg.body.slice(0, 1000),
      wrap: true,
    },
  ];

  if (msg.fields && msg.fields.length > 0) {
    const factSet = {
      type: 'FactSet',
      facts: msg.fields.slice(0, 10).map(f => ({ title: f.label, value: f.value })),
    };
    body.push(factSet);
  }

  const actions: object[] = [];
  if (msg.url) {
    actions.push({
      type: 'Action.OpenUrl',
      title: msg.urlLabel ?? 'View in ANTON',
      url: msg.url,
    });
  }

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4',
        body,
        ...(actions.length > 0 ? { actions } : {}),
      },
    }],
  };
}

// ── Plain text (fallback) ─────────────────────────────────────────────────

export function toPlainText(msg: MessagePayload): string {
  const lines = [`[ANTON] ${msg.title}`, '', msg.body];
  if (msg.fields) {
    lines.push('');
    for (const f of msg.fields) lines.push(`${f.label}: ${f.value}`);
  }
  if (msg.url) lines.push('', `${msg.urlLabel ?? 'View in ANTON'}: ${msg.url}`);
  return lines.join('\n');
}

// ── Variable substitution in templates ────────────────────────────────────

export function substituteVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}
