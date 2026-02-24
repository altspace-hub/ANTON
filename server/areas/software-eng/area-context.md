# Software Engineering & Architecture Area Context

## Domain Landscape

The Software Engineering & Architecture area supports software engineers, architects, engineering managers, and technology leaders in producing high-quality technical work — from system design and API specification through code review, technical documentation, architecture decision records, and security architecture. It serves individuals and teams building production software systems who need rigorous technical thinking, clear documentation, and structured approaches to quality, security, and maintainability.

## Core Software Engineering Domains

**System Architecture and Design:**
- Architectural patterns: monolith, microservices, event-driven, CQRS, saga pattern, hexagonal architecture
- C4 Model (Simon Brown): Context, Container, Component, Code diagrams for layered architectural documentation
- Non-functional requirements: scalability, availability, latency, throughput, resilience, security, maintainability
- Trade-off analysis: CAP theorem, consistency vs. availability, build vs. buy vs. integrate
- Cloud-native architecture: AWS/Azure/GCP services, serverless, containers, Kubernetes
- Data architecture: event streaming (Kafka), data lakes, OLTP vs. OLAP, CDC patterns

**Architecture Decision Records (ADRs):**
- ADR structure: title, status, context, decision, consequences, alternatives considered
- When to write ADRs: significant technology choices, framework selections, integration patterns, security decisions
- Governance: ADR review process, superseding old ADRs, linking ADRs to architectural diagrams
- Lightweight vs. heavyweight ADR formats: MADR (Markdown Architectural Decision Records)

**API Design:**
- RESTful API design: resource modelling, HTTP method semantics, status codes, versioning strategies
- GraphQL: schema design, resolver patterns, N+1 problem, federation
- gRPC and Protocol Buffers: service definitions, streaming patterns, performance characteristics
- API-first development: OpenAPI (Swagger) specification before implementation
- API design principles: consistency, discoverability, idempotency, pagination, filtering, error responses
- API security: OAuth 2.0, OIDC, API keys, rate limiting, JWT validation

**Code Review:**
- Code review objectives: correctness, security, maintainability, performance, test coverage
- SOLID principles (Robert C. Martin): Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- Review checklists: language-specific, security-focused, performance-focused
- Constructive code review culture: separating code quality from personal criticism
- Automated vs. manual review: what static analysis catches vs. what requires human judgement

**Technical Documentation:**
- API documentation: OpenAPI specs, reference documentation, getting started guides, tutorials
- Release notes: audience-appropriate, feature-led, breaking changes clearly signalled
- Technical specifications: problem statement, proposed solution, alternatives considered, implementation plan, testing approach
- Sprint demo preparation: audience calibration, demo script, success criteria

**Technical Debt:**
- Technical debt quadrant (Fowler): reckless/prudent × deliberate/inadvertent
- Technical debt registry: identification, classification, business impact, remediation effort estimation
- Debt prioritisation: risk-adjusted cost of inaction vs. cost of remediation
- Architectural fitness functions: automated quality gates to prevent debt accumulation

**Security Architecture:**
- Zero Trust architecture: "never trust, always verify" — network, identity, device, application, data
- OWASP Top 10: injection, broken authentication, XSS, IDOR, security misconfiguration, SSRF
- Threat modelling: STRIDE (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege), PASTA
- Security by design vs. security as an afterthought
- Dependency audit: CVE scanning, dependency confusion attacks, software supply chain security

**Dependency and Release Management:**
- Dependency audit: outdated packages, known vulnerabilities, licence compliance
- Semantic versioning (SemVer): MAJOR.MINOR.PATCH versioning semantics
- Release management: changelog maintenance, release branching strategy, rollback procedures
- SRE principles: SLIs, SLOs, SLAs, error budgets, toil reduction

## Key Frameworks and Concepts

- **SOLID Principles** — Object-oriented design principles for maintainable code
- **C4 Model** — Hierarchical architectural diagramming standard
- **Zero Trust** — Security model: no implicit trust based on network location
- **OWASP Top 10** — Most critical web application security risks
- **SemVer** — Semantic versioning for dependency management
- **DORA Metrics** — Deployment frequency, lead time, MTTR, change failure rate: engineering performance indicators

## Major Challenges

- Maintaining architectural coherence as teams scale and codebases grow
- Balancing delivery velocity with technical debt accumulation
- Embedding security thinking throughout the development lifecycle
- Writing documentation that stays current as software evolves
- Conducting code reviews that improve quality without slowing teams

## How the Modules Help

**Architecture-review** provides structured assessment of architectural decisions against quality attributes. **Adr-writer** produces consistent, well-reasoned Architecture Decision Records. **Api-design** and **api-documentation-generator** create specification-compliant API designs and documentation. **Code-review** and **code-review-checklist** structure rigorous, constructive review processes. **Technical-spec** develops detailed, implementation-ready specifications. **Tech-debt-assessment** and **tech-debt-tracker** quantify and prioritise remediation backlogs. **Zero-trust-assessment** evaluates architecture against Zero Trust principles. **Dependency-audit** identifies vulnerability and licence risks. **Release-notes-generator** and **sprint-demo-prep** support delivery communication. 

## Analytical Principles

1. **Correctness before cleverness** — Working, readable code beats ingenious but opaque solutions
2. **Explicit is better than implicit** — Architecture decisions, assumptions, and constraints must be documented
3. **Security is a property of the system, not a layer** — Security must be designed in, not bolted on
4. **Measure what matters** — DORA metrics and SLOs ground engineering quality in observable outcomes
5. **Technical debt is a business risk** — Debt that is not managed compounds into delivery slowdown and reliability failures
