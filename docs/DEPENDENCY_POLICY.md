# Dependency Management Policy

## Allowed Licenses

The following licenses are approved for production use:
- ✅ MIT
- ✅ Apache-2.0
- ✅ BSD-2-Clause, BSD-3-Clause
- ✅ ISC
- ✅ CC0-1.0 (public domain)
- ✅ Unlicense
- ⚠️ GPL-3.0 (only as dev dependency, not in production bundle)

## Forbidden Licenses
- ❌ Proprietary licenses
- ❌ Copyleft (AGPL, GPL) in production dependencies
- ❌ Unlicensed code

## Update Schedule

### Critical Security Updates
- Applied immediately upon discovery
- Tested in dev → staging → production within 24 hours

### High/Moderate Vulnerabilities
- Applied within 7 days
- Full test suite run before deployment

### Low/Informational
- Reviewed monthly
- Bundled into regular maintenance releases

### Dependency Updates (Non-Security)
- Major versions: Quarterly review, test thoroughly
- Minor versions: Monthly review
- Patch versions: Automated updates allowed

## Audit Process

1. **Weekly**: Automated `npm audit` via CI/CD
2. **Monthly**: Full dependency review (`npm outdated`)
3. **Quarterly**: License compliance check + manual review
4. **Annually**: Major version upgrade planning

## Approval Process

New dependencies require:
1. License check (must be on allowed list)
2. Security audit (no known CVEs)
3. Maintenance check (active project, recent commits)
4. Bundle size impact assessment
5. Performance impact review

## Automated Checks

CI/CD pipeline runs:
- `npm audit` on every commit
- License check on every PR
- Bundle size diff on every PR

## Documentation Requirements

For each production dependency, document in README.md:
- Purpose (why needed)
- License
- Version constraints
- Security considerations

## Exceptions

Exceptions to this policy require:
- Written justification
- Senior developer approval
- Documentation in EXCEPTIONS.md
