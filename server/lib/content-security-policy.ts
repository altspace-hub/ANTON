/**
 * The Content-Security-Policy directives helmet sends on every response
 * (server/index.ts).
 *
 * Fonts come from this origin only: the web app bundles Inter and JetBrains
 * Mono from @fontsource (src/fonts.ts), so no Google Fonts host is allowed.
 *
 * On the public demo (DEMO_MODE=true) img-src allows no remote origin. An AI
 * answer is rendered as Markdown, so an image in it becomes an <img>; with
 * `https:` allowed, a prompt-injected document could make a visitor's browser
 * fetch a URL of its choosing, which carries data out and shows that host the
 * visitor's IP address. The app's own images are 'self', data: (QR codes) and
 * blob: (upload previews). Outside the demo remote images still load.
 *
 * On the demo connect-src is 'self' only: the browser talks to this server
 * and nothing else. No web-client code calls a model provider (the server
 * does), and the only WebSocket users, Study Rooms and Community, are refused
 * on a demo (their Socket.IO namespaces; long-polling is 'self' anyway), so
 * neither the provider API hosts nor ws:/wss: to any host are needed there.
 * CSP Level 3 lets 'self' match same-origin ws:/wss: as well. Outside the
 * demo both stay allowed.
 */
export function cspDirectives(demo: boolean): Record<string, string[]> {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],  // SEC-02: no unsafe-inline; Vite prod build uses ES module scripts
    styleSrc:  ["'self'", "'unsafe-inline'"],
    imgSrc:    demo ? ["'self'", 'data:', 'blob:'] : ["'self'", 'data:', 'blob:', 'https:'],
    connectSrc: demo ? ["'self'"] : [
      "'self'",
      'ws:',
      'wss:',
      'https://api.anthropic.com',
      'https://api.openai.com',
      'https://generativelanguage.googleapis.com',
      'https://api.mistral.ai',
    ],
    fontSrc:   ["'self'", 'data:'],
    objectSrc: ["'none'"],
    mediaSrc:  ["'self'"],
    frameSrc:  ["'self'", 'blob:'],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: [], // Upgrade HTTP to HTTPS when available
  };
}
