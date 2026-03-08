# Governance

## Project Maintainers

openEXPERT / FCP Workbench is maintained by the **Futurechain** team:

| Name | Role |
|------|------|
| Daniel Bardun | Lead — Architecture, FCP Domain |
| Jonas Karlsson | Engineering |
| Max Krackhardt | Engineering |
| Björn Heir | FCP Advisory |
| Sofia Stenius-Linna | FCP Advisory |
| Petra Andrésdottir | FCP Advisory |

Contact: **hello@futurechain.io**

---

## Decision Making

- **Day-to-day changes** (bug fixes, documentation, minor features): any maintainer can merge after one approval.
- **Architecture changes** (new modules, schema migrations, API additions): requires two maintainer approvals and an issue discussion.
- **Breaking changes**: require all maintainers to be notified and a 7-day comment period on the issue.
- **Security fixes**: applied immediately by any maintainer; disclosed after 14 days.

---

## Contribution Process

1. Fork the repository and create a feature branch: `feature/<short-description>`
2. Follow the coding conventions in `CLAUDE.md`
3. Open a pull request against `main` with a clear description
4. At least one maintainer must review and approve
5. CI checks (typecheck, security audit, build) must pass

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/):
- **PATCH** (`0.x.y`): bug fixes and minor improvements
- **MINOR** (`0.x.0`): new features, backward-compatible
- **MAJOR** (`x.0.0`): breaking changes (API, schema, configuration)

---

## Security Policy

Report security vulnerabilities **privately** to **security@futurechain.io**.
Do not open public issues for security problems.
We aim to respond within 48 hours and patch within 14 days.

---

## License

Licensed under the MIT License. See `LICENSE` for full text.
Commercial use is permitted. Attribution is appreciated but not required.

---

## Code of Conduct

All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
