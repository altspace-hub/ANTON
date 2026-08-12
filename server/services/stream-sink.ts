// ═══════════════════════════════════════════════════════════
// StreamSink — the minimal write surface the LLM streaming core
// needs from its output channel (2026-07-29).
//
// Express's Response satisfies this structurally, so route call
// sites keep passing `res` unchanged. The point is directional:
// the gateway (unified-llm-client, claude-client, the streaming
// adapters) no longer names Express in its signatures, which is
// what lets it compile outside the platform (Code Studio
// standalone extraction, W0.1 refactor 2 of 3) — and what
// streamToHandler previously faked with an `as unknown as
// Response` cast, now a real implementation.
//
// Keep this interface at four members. If a streaming path needs
// more from the channel (flush, close events), add it HERE with
// a comment naming the consumer — never re-import Express types
// into the gateway.
// ═══════════════════════════════════════════════════════════

export interface StreamSink {
  /** True once headers have been written (Express parity — checked
   *  before writeHead to keep retry paths idempotent). */
  readonly headersSent: boolean;
  writeHead(status: number, headers: Record<string, string>): unknown;
  write(chunk: string): unknown;
  end(): unknown;
}
