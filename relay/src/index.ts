/**
 * index.ts — CLI entrypoint for the ANTON Mesh reference relay.
 *
 * Reads configuration from environment variables (per README.md), starts
 * the server, and traps SIGTERM/SIGINT for graceful shutdown.
 *
 * Usage:
 *   RELAY_URL=wss://r1.example.org pnpm dev
 *   RELAY_URL=wss://r1.example.org RELAY_INSECURE=1 node dist/index.js
 */

import { readFileSync } from 'node:fs';
import { RelayServer } from './server.js';
import { createAuditLogger } from './audit.js';

function fromEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function fromEnvNum(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) {
    throw new Error(`${name} must be an integer, got "${v}"`);
  }
  return n;
}

function main(): void {
  const ownUrl = fromEnv('RELAY_URL');
  if (!ownUrl) {
    console.error('RELAY_URL is required (e.g. wss://r1.openexpert.org).');
    process.exit(2);
  }

  const port = fromEnvNum('RELAY_PORT', 8443);
  const host = fromEnv('RELAY_HOST') ?? '0.0.0.0';
  const certPath = fromEnv('RELAY_TLS_CERT');
  const keyPath = fromEnv('RELAY_TLS_KEY');
  const insecure = fromEnv('RELAY_INSECURE') === '1';

  const audit = createAuditLogger(fromEnv('RELAY_AUDIT_LOG_PATH'));

  let tlsCert: Buffer | undefined;
  let tlsKey: Buffer | undefined;
  if (certPath && keyPath) {
    tlsCert = readFileSync(certPath);
    tlsKey = readFileSync(keyPath);
  }

  const maxSessions = fromEnvNum('RELAY_MAX_SESSIONS_PER_INSTANCE', 32);

  const server = new RelayServer({
    ownUrl,
    port,
    host,
    tlsCert,
    tlsKey,
    insecure,
    audit,
    matchLimits: {
      maxSessionsPerInstance: maxSessions,
      pendingPhoneTimeoutSec: 30,
    },
  });

  // Graceful shutdown — drain active connections + close listening socket.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    audit.emit({ type: 'disconnect', reason: `signal_${signal}` });
    server.stop().then(() => {
      audit.flush?.().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.start()
    .then(() => {
      const scheme = tlsCert ? 'wss' : 'ws';
      console.error(`anton-mesh-relay listening: ${scheme}://${host}:${server.actualPort()}`);
      console.error(`canonical URL announced to clients: ${ownUrl}`);
      if (insecure) {
        console.error('WARNING: RELAY_INSECURE=1 — running plain WS. Use only behind a trusted reverse proxy.');
      }
    })
    .catch((err: Error) => {
      console.error(`failed to start relay: ${err.message}`);
      process.exit(1);
    });
}

main();
