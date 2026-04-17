// Minimal ambient types for bonjour-service so the server compiles
// before `pnpm install` pulls the real package. The real types overlay
// these once installed.

declare module 'bonjour-service' {
  export interface BonjourService {
    name: string;
    type: string;
    protocol: 'tcp' | 'udp';
    port: number;
    host?: string;
    addresses?: string[];
    txt?: Record<string, string>;
  }
  export interface BonjourBrowser {
    on(event: 'up' | 'down', cb: (svc: BonjourService) => void): void;
    stop(): void;
  }
  export class Bonjour {
    constructor(opts?: unknown);
    publish(opts: { name: string; type: string; protocol: 'tcp' | 'udp'; port: number; txt?: Record<string, string> }): unknown;
    find(opts: { type: string }, cb: (svc: BonjourService) => void): BonjourBrowser;
    destroy(): void;
  }
}
