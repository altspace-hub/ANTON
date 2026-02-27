/**
 * connector-templates.ts
 * Pre-configured connector templates for the 10 most common external integrations.
 *
 * Templates provide a starting point for creating new connections.
 * They define the config structure, required permissions, and setup instructions.
 */

export interface ConnectorTemplate {
  id: string;
  name: string;
  type: 'api' | 'rss' | 'email' | 'channel_bridge' | 'webhook';
  description: string;
  category: 'communication' | 'storage' | 'task-management' | 'regulatory' | 'generic';
  icon: string; // emoji
  configTemplate: Record<string, unknown>;
  permissionsRequired: string[];
  setupInstructions: string;
  isRegulatory: boolean;
}

export const CONNECTOR_TEMPLATES: ConnectorTemplate[] = [
  // ── Communication ──────────────────────────────────────────────────────────

  {
    id: 'slack',
    name: 'Slack',
    type: 'webhook',
    description:
      'Post ANTON outputs, alerts, and regulatory updates directly to Slack channels via an Incoming Webhook.',
    category: 'communication',
    icon: '💬',
    configTemplate: {
      webhookUrl: '',
      channel: '#compliance-updates',
      username: 'ANTON',
      iconEmoji: ':shield:',
      notifyOnKeywords: ['sanction', 'regulatory update', 'deadline'],
    },
    permissionsRequired: ['incoming-webhook'],
    setupInstructions:
      '1. Go to https://api.slack.com/apps and create a new app.\n2. Enable "Incoming Webhooks" and add a webhook to your workspace.\n3. Copy the Webhook URL and paste it into the webhookUrl field.\n4. Optionally set a default channel and display name.',
    isRegulatory: false,
  },

  {
    id: 'teams',
    name: 'Microsoft Teams',
    type: 'webhook',
    description:
      'Send ANTON analysis results and compliance alerts to a Microsoft Teams channel via Power Automate or Incoming Webhook.',
    category: 'communication',
    icon: '🟦',
    configTemplate: {
      webhookUrl: '',
      channel: 'Compliance Alerts',
      cardThemeColor: '2DD4A8',
      includeActionButtons: true,
      mentionUsers: [],
    },
    permissionsRequired: ['IncomingWebhook'],
    setupInstructions:
      '1. In Microsoft Teams, open the channel and click the three-dot menu → Connectors.\n2. Add an "Incoming Webhook" connector.\n3. Give it a name (e.g., "ANTON Alerts") and copy the generated webhook URL.\n4. Paste the URL into the webhookUrl field.',
    isRegulatory: false,
  },

  // ── Storage ────────────────────────────────────────────────────────────────

  {
    id: 'sharepoint',
    name: 'SharePoint / OneDrive',
    type: 'api',
    description:
      'Upload ANTON-generated documents (.docx, .xlsx, .pdf) directly to a SharePoint document library or OneDrive folder.',
    category: 'storage',
    icon: '📁',
    configTemplate: {
      tenantId: '',
      clientId: '',
      clientSecret: '',
      siteUrl: 'https://yourorg.sharepoint.com/sites/Compliance',
      libraryPath: '/Shared Documents/ANTON Outputs',
      autoUploadOnExport: false,
      folderPerModule: true,
    },
    permissionsRequired: ['Sites.ReadWrite.All', 'Files.ReadWrite.All'],
    setupInstructions:
      '1. Register an app in Azure Active Directory (portal.azure.com → App registrations).\n2. Grant the app Sites.ReadWrite.All and Files.ReadWrite.All API permissions.\n3. Create a client secret under "Certificates & secrets".\n4. Copy the Tenant ID, Client ID, and Client Secret into the config fields.\n5. Set the siteUrl to your SharePoint site and libraryPath to the target document library.',
    isRegulatory: false,
  },

  // ── Task Management ────────────────────────────────────────────────────────

  {
    id: 'jira',
    name: 'Jira',
    type: 'api',
    description:
      'Automatically create Jira issues from ANTON gap analysis findings and action plans. Each finding becomes a tracked ticket.',
    category: 'task-management',
    icon: '🎯',
    configTemplate: {
      baseUrl: 'https://yourorg.atlassian.net',
      email: '',
      apiToken: '',
      projectKey: 'COMP',
      issueType: 'Task',
      defaultPriority: 'Medium',
      labelPrefix: 'ANTON',
      assignee: '',
      epicLink: '',
    },
    permissionsRequired: ['write:issue', 'read:project'],
    setupInstructions:
      '1. Log in to your Atlassian account at id.atlassian.com → API tokens.\n2. Create a new API token and copy it.\n3. Set baseUrl to your Jira instance URL, and email to your account email.\n4. Set projectKey to your compliance project (e.g., COMP or AML).\n5. Optionally specify a default assignee and epic link for ANTON-created issues.',
    isRegulatory: false,
  },

  // ── Regulatory Feeds ───────────────────────────────────────────────────────

  {
    id: 'eba-rss',
    name: 'EBA (European Banking Authority)',
    type: 'rss',
    description:
      'Monitor EBA publications — guidelines, opinions, Q&As, and consultation papers — via the official RSS feed.',
    category: 'regulatory',
    icon: '🏛️',
    configTemplate: {
      url: 'https://www.eba.europa.eu/rss.xml',
      pollIntervalMinutes: 60,
      filterKeywords: ['AML', 'CFT', 'sanctions', 'AMLA', 'AMLR', 'payment services'],
      categories: ['Guidelines', 'Opinions', 'Consultation Papers', 'Q&As'],
      notifyOnNew: true,
      archiveDays: 90,
    },
    permissionsRequired: [],
    setupInstructions:
      '1. No authentication required — EBA RSS is publicly accessible.\n2. Adjust filterKeywords to focus on topics relevant to your clients.\n3. Set pollIntervalMinutes to control how frequently ANTON checks for updates.\n4. Enable notifyOnNew to receive alerts when new publications are detected.',
    isRegulatory: true,
  },

  {
    id: 'esma-rss',
    name: 'ESMA (European Securities and Markets Authority)',
    type: 'rss',
    description:
      'Track ESMA regulatory publications, MiFID II updates, market abuse guidance, and sustainable finance developments.',
    category: 'regulatory',
    icon: '📊',
    configTemplate: {
      url: 'https://www.esma.europa.eu/rss.xml',
      pollIntervalMinutes: 120,
      filterKeywords: ['MiFID', 'MiFIR', 'AML', 'sustainable finance', 'EMIR', 'short selling'],
      categories: ['Technical Standards', 'Guidelines', 'Opinions', 'Statements'],
      notifyOnNew: true,
      archiveDays: 90,
    },
    permissionsRequired: [],
    setupInstructions:
      '1. No authentication required — ESMA RSS is publicly accessible.\n2. Customise filterKeywords for your areas of regulatory focus.\n3. ESMA publishes technical standards and guidelines that frequently affect compliance programmes.',
    isRegulatory: true,
  },

  {
    id: 'fatf',
    name: 'FATF (Financial Action Task Force)',
    type: 'rss',
    description:
      'Receive FATF publications including Recommendations updates, mutual evaluation reports, grey/black list changes, and guidance papers.',
    category: 'regulatory',
    icon: '🌍',
    configTemplate: {
      url: 'https://www.fatf-gafi.org/content/fatf-gafi/en/publications.xml',
      pollIntervalMinutes: 240,
      filterKeywords: ['grey list', 'black list', 'mutual evaluation', 'recommendations', 'guidance'],
      categories: ['Guidance', 'Reports', 'Statements', 'Mutual Evaluations'],
      notifyOnNew: true,
      alertOnGreylistChange: true,
      archiveDays: 180,
    },
    permissionsRequired: [],
    setupInstructions:
      '1. No authentication required — FATF publications are publicly accessible.\n2. Enable alertOnGreylistChange to get immediate notification when the grey or black list changes (high regulatory impact).\n3. Mutual evaluation reports are often long — ANTON can summarise them on ingestion.',
    isRegulatory: true,
  },

  {
    id: 'eur-lex',
    name: 'EUR-Lex (EU Official Journal)',
    type: 'rss',
    description:
      'Monitor EUR-Lex for new EU legislative acts including Regulations, Directives, and Decisions relevant to financial crime prevention.',
    category: 'regulatory',
    icon: '🇪🇺',
    configTemplate: {
      url: 'https://eur-lex.europa.eu/RSSLINKS/rss_OJ_L.xml',
      pollIntervalMinutes: 120,
      filterKeywords: ['money laundering', 'terrorism financing', 'sanctions', 'financial intelligence', 'AMLA', 'AMLR'],
      documentTypes: ['Regulation', 'Directive', 'Decision', 'Delegated Regulation', 'Implementing Regulation'],
      notifyOnNew: true,
      archiveDays: 365,
      includeCorrigenda: false,
    },
    permissionsRequired: [],
    setupInstructions:
      '1. No authentication required — EUR-Lex is publicly accessible.\n2. ANTON will automatically cross-reference new legislative acts with the modules you are working on.\n3. Set includeCorrigenda to true if you want correction notices as well as primary legislation.',
    isRegulatory: true,
  },

  // ── Generic ────────────────────────────────────────────────────────────────

  {
    id: 'smtp-email',
    name: 'Email (SMTP)',
    type: 'email',
    description:
      'Send ANTON reports and alerts via email using any SMTP server. Useful for scheduled compliance digests and deadline reminders.',
    category: 'generic',
    icon: '📧',
    configTemplate: {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        user: '',
        pass: '',
      },
      from: 'anton@yourorg.com',
      defaultTo: [],
      subjectPrefix: '[ANTON]',
      attachPdfByDefault: false,
      dailyDigestEnabled: false,
      dailyDigestTime: '08:00',
    },
    permissionsRequired: ['smtp:send'],
    setupInstructions:
      '1. Set host to your SMTP server (e.g., smtp.office365.com for Microsoft 365, smtp.gmail.com for Gmail).\n2. Use port 587 with STARTTLS (secure: false) or port 465 with SSL (secure: true).\n3. Enter your SMTP username and password (or app-specific password if using MFA).\n4. Set defaultTo to a list of email addresses that should receive ANTON reports by default.',
    isRegulatory: false,
  },

  {
    id: 'generic-webhook',
    name: 'Generic Webhook',
    type: 'webhook',
    description:
      'Send ANTON outputs to any HTTP endpoint via webhook. Compatible with Zapier, Make (Integromat), n8n, Power Automate, and custom systems.',
    category: 'generic',
    icon: '🔗',
    configTemplate: {
      url: '',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: '',
      },
      payloadTemplate: 'default',
      secretHeader: 'X-ANTON-Secret',
      secretValue: '',
      retryOnFailure: true,
      maxRetries: 3,
      timeoutMs: 10000,
    },
    permissionsRequired: [],
    setupInstructions:
      '1. Set url to the target webhook endpoint.\n2. Configure headers if the target requires an Authorization token or API key.\n3. Set a secretValue to sign requests — the receiving system can verify the X-ANTON-Secret header.\n4. ANTON sends a JSON payload containing the module ID, output content, and metadata.',
    isRegulatory: false,
  },
];
