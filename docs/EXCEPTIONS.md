# License and Security Exceptions

This document tracks approved exceptions to the standard [Dependency Policy](DEPENDENCY_POLICY.md).

## License Exceptions

### openexpert@0.1.0 - UNLICENSED
- **Package**: openexpert (main application)
- **License**: UNLICENSED
- **Reason**: This is the main application package, not a dependency. The application itself is proprietary and internal to Advisense/FutureChain AB.
- **Risk**: None - this is our own codebase
- **Approved by**: Development team
- **Date**: 2026-02-19

### Deprecated Type Packages

The following type definition packages show as deprecated because the underlying packages now provide their own types. These can be safely removed in a future cleanup:

- **@types/bcryptjs** - bcryptjs now provides its own types
- **@types/jszip** - jszip now provides its own types

**Action**: Remove these packages and update imports to use native types.

## Security Exceptions

### Multer 1.x Vulnerability Warning

- **Package**: multer@1.4.5-lts.2
- **Issue**: Multiple vulnerabilities patched in 2.x
- **Status**: Upgrade to multer 2.x planned
- **Temporary Mitigation**:
  - File uploads are validated server-side
  - Maximum file size enforced
  - File type restrictions in place
  - Path traversal protection active
- **Target Upgrade Date**: Q1 2026
- **Approved by**: Security team
- **Date**: 2026-02-19

## Approval Process

To add a new exception:

1. Document the issue in this file using the template below
2. Provide technical justification
3. Outline risk mitigation measures
4. Get approval from senior developer or security team
5. Set a review/remediation date

### Exception Template

```markdown
### [Package Name] - [Issue Summary]
- **Package**: package-name@version
- **License/Issue**: [License type or security issue]
- **Reason**: [Why this exception is needed]
- **Risk**: [Security/legal risk assessment]
- **Mitigation**: [Steps taken to reduce risk]
- **Review Date**: [When to re-evaluate]
- **Approved by**: [Name]
- **Date**: [YYYY-MM-DD]
```

## Review Schedule

All exceptions are reviewed:
- **Monthly**: Security exceptions
- **Quarterly**: License exceptions
- **Annually**: All exceptions for removal/renewal
