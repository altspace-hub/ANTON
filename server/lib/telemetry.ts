/**
 * OBS-02: OpenTelemetry tracing setup.
 *
 * All OTel SDK imports are lazy (dynamic) so the server starts normally
 * when the packages are not installed. Set OTEL_ENABLED=true to activate.
 *
 * Environment variables:
 *   OTEL_ENABLED=true             — enable tracing (default: false in dev)
 *   OTEL_EXPORTER_OTLP_ENDPOINT   — OTLP endpoint (default: http://localhost:4318)
 *   OTEL_SERVICE_NAME             — service name (default: openexpert)
 *   OTEL_LOG_LEVEL                — debug|info|warn|error (default: warn)
 */

import { trace, context } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';

export const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'openexpert';
const SERVICE_VERSION = process.env.npm_package_version || '0.2.0';
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

if (OTEL_ENABLED) {
  // Dynamically import SDK packages — only required when tracing is enabled.
  // If packages are not installed, the import will throw and tracing is skipped.
  Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/auto-instrumentations-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
    import('@opentelemetry/api'),
  ]).then(([
    { NodeSDK },
    { getNodeAutoInstrumentations },
    { OTLPTraceExporter },
    { Resource },
    { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
    { diag, DiagConsoleLogger, DiagLogLevel },
  ]) => {
    const logLevel = (() => {
      switch (process.env.OTEL_LOG_LEVEL?.toLowerCase()) {
        case 'debug': return DiagLogLevel.DEBUG;
        case 'info':  return DiagLogLevel.INFO;
        case 'error': return DiagLogLevel.ERROR;
        default:      return DiagLogLevel.WARN;
      }
    })();
    diag.setLogger(new DiagConsoleLogger(), logLevel);

    const sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${OTLP_ENDPOINT}/v1/traces`,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
        }),
      ],
    });

    sdk.start();
    console.log(`[otel] Tracing enabled → ${OTLP_ENDPOINT} (service: ${SERVICE_NAME})`);

    process.on('SIGTERM', () => sdk.shutdown().catch(() => {}));
    process.on('SIGINT',  () => sdk.shutdown().catch(() => {}));
  }).catch((err) => {
    console.warn('[otel] Tracing packages not available — tracing disabled:', err.message);
  });
}

/**
 * Wrap an async operation in a named span.
 * If OTEL is disabled, the function runs without any overhead.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  if (!OTEL_ENABLED) return fn(tracer.startSpan(name));

  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: 1 }); // SpanStatusCode.OK = 1
      return result;
    } catch (err) {
      span.setStatus({ code: 2, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Add span attributes to the currently active span (if any).
 */
export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
  }
}

export { trace as otelTrace, context as otelContext };
