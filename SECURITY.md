# Security Policy — openEXPERT

## Overview

openEXPERT is a local-first application designed to run on individual laptops or private internal servers. It does not transmit data to any external service other than:
- The Anthropic Claude API (for AI inference)
- URLs explicitly provided by the user for the "Online Reference" knowledge source mode

## Deployment Modes

| Mode | Auth Required | Network Exposure |
|------|--------------|-----------------|
| `DEPLOYMENT_MODE=solo` | None — local access only | localhost only |
| `DEPLOYMENT_MODE=team` | JWT + bcrypt | Internal network (configure firewall) |

**For team deployment:** Never expose openEXPERT directly to the public internet. Use a reverse proxy (nginx/Caddy) with TLS termination and restrict access to your organisation's network or VPN.

## Security Controls

### Authentication (Team Mode)
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with 7-day expiry
- Tokens invalidated on logout (server-side session store)
- Role-based access control: admin / analyst / viewer

### API Security
- Anthropic API key stored server-side only — never exposed to the browser
- All Claude API calls proxied through the local Express server
- Rate limiting on all API endpoints (300 req/15min general; 30 req/15min for Claude endpoint)

### Content Security
- Helmet.js CSP headers on all responses
- CORS restricted to localhost origins by default
- File uploads: size-limited, type-restricted, stored in local `uploads/` directory only

### Local File Access
- Folder browser requires absolute paths
- Path traversal (`../`) rejected on all folder/file endpoints
- Registered folder paths stored in SQLite, verified on each access

### Database
- SQLite stored locally at `./data/workbench.sqlite` (gitignored)
- No sensitive data transmitted externally
- All user data stays on the machine

## Responsible Disclosure

If you discover a security vulnerability in openEXPERT:

1. **Do not** open a public GitHub issue describing the vulnerability
2. Email security details to: **daniel.bardun@advisense.com**
3. Include: description, steps to reproduce, potential impact, your suggested fix (if any)
4. We will acknowledge within 48 hours and aim to release a fix within 14 days

## Known Limitations

- openEXPERT is designed for trusted internal use. It does not defend against malicious users with physical access to the machine.
- Document content uploaded for analysis is stored in `./uploads/` as plain text. Treat this directory accordingly.
- The SQLite database contains session history and conversation logs. Back up and protect accordingly.
- In solo mode, there is no authentication. Do not run solo mode on a network-accessible port without additional protection.

## Dependencies

Run `pnpm audit` to check for known vulnerabilities in dependencies. Report any findings via the disclosure process above.

---

*Last updated: 2026-02-18*
