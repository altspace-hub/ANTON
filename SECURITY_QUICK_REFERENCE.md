# Security Audit Quick Reference

## Daily Commands
```bash
pnpm run audit              # Check for vulnerabilities
```

## Before Committing
```bash
pnpm run typecheck          # Verify TypeScript
pnpm run audit              # Check security
```

## Weekly/Monthly
```bash
pnpm run audit:full         # Full security audit
pnpm run outdated           # Check for updates
pnpm run licenses:report    # Generate license report
pnpm run security:report    # Generate vulnerability report
```

## Emergency Response
```bash
pnpm run audit:fix          # Auto-fix vulnerabilities
```

## Generated Reports
- `LICENSES.csv` - All package licenses
- `vulnerability-report.json` - Security vulnerabilities
- `audit-report.json` - Raw audit data

## Documentation
- [Dependency Policy](docs/DEPENDENCY_POLICY.md)
- [Security Audit Guide](docs/SECURITY_AUDIT.md)
- [Exceptions](docs/EXCEPTIONS.md)

## Current Status
- ✅ 0 critical vulnerabilities
- ✅ 0 high vulnerabilities
- ✅ All licenses compliant
- ⚠️ Some packages have updates available
