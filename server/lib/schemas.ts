import { z } from 'zod';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  username: z.string().min(1).max(100).trim(),
  password: z.string().min(1).max(1000),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email().max(254).optional(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

export const RegisterSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, _ and - allowed'),
  password: z.string().min(12).max(200),
  email: z.string().email().max(254).optional(),
  displayName: z.string().max(100).optional(),
  inviteCode: z.string().max(200).optional(),
});

// ─── Folders ──────────────────────────────────────────────────────────────────

export const FolderBrowseSchema = z.object({
  path: z.string().min(1).max(500),
});

export const FolderRegisterSchema = z.object({
  path: z.string().min(1).max(500),
  label: z.string().max(200).optional(),
});

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html'];

export const FolderIndexSchema = z.object({
  path: z.string().min(1).max(500),
  recursive: z.boolean().optional().default(true),
  filter: z.array(z.enum(SUPPORTED_EXTENSIONS as [string, ...string[]])).optional(),
});

// ─── Files ────────────────────────────────────────────────────────────────────

// Filename param — must not contain path separators or null bytes
export const FileIdParamSchema = z.object({
  id: z.string().min(1).max(500).regex(/^[^/\\?%*:|"<>\0]+$/, 'Invalid filename'),
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const ExportSchema = z.object({
  format: z.enum(['md', 'docx', 'xlsx', 'pdf', 'pptx']),
  content: z.string().min(1).max(2_000_000), // 2 MB text cap
  metadata: z.object({
    filename: z.string().max(200).optional(),
    title: z.string().max(500).optional(),
    author: z.string().max(200).optional(),
    model: z.string().max(100).optional(),
    thinking: z.string().max(50).optional(),
    moduleId: z.string().max(100).optional(),
    sessionId: z.string().max(100).optional(),
    creativity: z.string().max(50).optional(),
    // ATTR-02: sources & scope
    documentsLoaded: z.array(z.string().max(300)).max(100).optional(),
  }).optional(),
});

export const ExportWithTemplateSchema = z.object({
  templateId: z.string().min(1).max(100),
  content: z.string().min(1).max(2_000_000),
  format: z.enum(['docx', 'pptx']),
});

export const TrustCertificateSchema = z.object({
  sessionId: z.string().min(1).max(100),
});

// ─── Claude / message ─────────────────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([
    z.string().max(500_000),
    z.array(z.object({ type: z.string(), text: z.string().max(500_000).optional() }).passthrough()),
  ]),
});

export const ClaudeMessageSchema = z.object({
  // Required
  userMessage: z.string().min(1).max(100_000),

  // Model + config
  model: z.string().max(100).optional(),
  thinking: z.string().max(50).optional(),
  creativity: z.enum(['strict', 'balanced', 'creative']).optional(),
  precision: z.string().max(50).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),

  // Session context
  sessionId: z.string().max(100).optional(),
  moduleId: z.string().max(100).optional(),
  areaId: z.string().max(100).optional(),

  // Prompting
  systemPrompt: z.string().max(200_000).optional(),
  outputInstruction: z.string().max(50_000).optional(),
  outputFormats: z.array(z.string().max(100)).max(20).optional(),
  outputLanguage: z.string().max(50).optional(),

  // History
  history: z.array(MessageSchema).max(200).optional(),

  // Knowledge sources — passthrough to avoid breaking existing flexible structure
  knowledgeSources: z.record(z.unknown()).optional(),
  moduleInputs: z.record(z.unknown()).optional(),

  // Feature flags (booleans)
  plainTextMode: z.boolean().optional(),
  multiAgentEnabled: z.boolean().optional(),
  multiPerspective: z.boolean().optional(),
  metaCognitiveEnabled: z.boolean().optional(),
  emojiEnabled: z.boolean().optional(),
  nativeReasoningEnabled: z.boolean().optional(),

  // Multi-agent
  multiAgentTeam: z.array(z.string().max(100)).max(20).optional(),
  multiAgentStyle: z.string().max(50).optional(),

  // Personas and skills
  selectedPersonas: z.array(z.string().max(100)).max(20).optional(),
  selectedSkills: z.array(z.string().max(100)).max(20).optional(),

  // Reference content
  structureReference: z.string().max(50_000).optional(),
  referenceOutput: z.string().max(50_000).optional(),

  // UI/UX settings
  transparencyLevel: z.enum(['off', 'summary', 'detailed']).optional(),
  writingTone: z.string().max(50).optional(),
  audience: z.string().max(100).optional(),
  channel: z.string().max(50).optional(),
});

// ─── Task Agent ───────────────────────────────────────────────────────────────

export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(4_000).trim(),
  source: z.string().max(50).optional().default('manual'),
  source_ref: z.string().max(200).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  due_date: z.string().max(30).optional(),
});

export const TaskMessageSchema = z.object({
  content: z.string().min(1).max(10_000).trim(),
});

export const TaskSelectApproachSchema = z.object({
  approach_id: z.string().min(1).max(100),
  config: z.record(z.unknown()).optional().default({}),
});

export const TaskIngestSchema = z.object({
  source: z.enum(['jira', 'slack', 'standup', 'email', 'webhook']),
  title: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(4_000).trim(),
  source_ref: z.string().max(200).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  metadata: z.record(z.unknown()).optional(),
});
