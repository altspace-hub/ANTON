# openEXPERT — Data, Privacy & Legal Notice

**Version:** 0.2.1
**Effective date:** 2026 (reflects the PostgreSQL-only, local-first architecture)
**Maintained by:** FutureChains / Anton

---

## 1. Overview

openEXPERT is a **locally-hosted software application**. It is installed and runs on your own hardware or on a server you control. There is no openEXPERT cloud service, no central server operated by FutureChains, and no software-as-a-service infrastructure involved in processing your work.

This document describes:
- What data is stored and where
- What data leaves your machine and to whom
- Your rights and responsibilities
- Legal considerations for enterprise and regulated-industry deployments

---

## 2. Data Residency — What Stays on Your Machine

All of the following are stored **exclusively on the device or server where openEXPERT is installed**:

| Data type | Storage location | Notes |
|---|---|---|
| Sessions and conversation history | Local **PostgreSQL** database (the `anton` DB at your `DATABASE_URL`) | Never transmitted to FutureChains |
| Uploaded documents | `uploads/` directory | PDF, DOCX, XLSX, etc. — local only |
| Generated outputs | `outputs/` directory | DOCX, PDF, PPTX exports |
| Vector embeddings & semantic index | Local PostgreSQL `embeddings` table (in-process cosine, or pgvector if enabled); an optional local ChromaDB index is used for knowledge-pack RAG search | Local semantic search index — stays on your machine |
| Workflow definitions and runs | Local PostgreSQL database | All run history is local |
| User accounts and credentials | Local PostgreSQL database — bcrypt-hashed passwords | Team mode only |
| Project workspaces | `workspaces/` directory | Local file system |
| Radar sources and regulatory items | Local PostgreSQL database | All classifications are local |
| Scheduled job history and notifications | Local PostgreSQL database | Local only |
| Application logs | Console / Electron log window | Not transmitted |

> **Database:** ANTON runs on **PostgreSQL only** (the legacy SQLite engine was removed). The database runs on your own machine or a server you control — set via the `DATABASE_URL` connection string. FutureChains has no access to it.

**FutureChains/Anton does not collect, receive, or have access to any of the above data.**

---

## 3. Data That Leaves Your Machine

openEXPERT uses external AI APIs to provide its core intelligence features. When you run an AI-powered analysis, generate content, or process a document with AI, the **text of your prompt and any attached document content** is transmitted to the AI provider you have configured.

### 3.1 Default provider — Anthropic (Claude)

- **What is sent:** Your prompts and the text content of any documents you attach.
- **Data retention:** Subject to Anthropic's API data usage policies.
- **Privacy policy:** [https://www.anthropic.com/privacy](https://www.anthropic.com/privacy)
- **API terms:** [https://www.anthropic.com/legal/aup](https://www.anthropic.com/legal/aup)
- **Commercial API note:** By default, Anthropic does not train models on API user data. Review current policy at the links above.

### 3.2 Optional providers (configured by the user)

| Provider | Privacy policy | API terms |
|---|---|---|
| OpenAI (GPT-4o) | [openai.com/policies/privacy-policy](https://openai.com/policies/privacy-policy) | [openai.com/policies/usage-policies](https://openai.com/policies/usage-policies) |
| Google AI (Gemini) | [policies.google.com/privacy](https://policies.google.com/privacy) | [ai.google.dev/terms](https://ai.google.dev/terms) |
| Mistral AI | [mistral.ai/privacy](https://mistral.ai/privacy) | [mistral.ai/terms](https://mistral.ai/terms) |
| Ollama (local) | N/A — runs entirely on-device | No data leaves the machine |

**Using Ollama with a local model means no data leaves your machine at all.** This is the recommended configuration for the highest data sensitivity requirements.

### 3.3 Optional integrations (user-configured)

The following only transmit data if you explicitly configure and use them:

- **SMTP email notifications** — sends notification emails to addresses you specify via your own SMTP server
- **External database connections** — openEXPERT can query your own databases (PostgreSQL, MySQL, MSSQL) in workflow steps; this traffic is between openEXPERT and your own infrastructure
- **RSS/web feeds** (Radar feature) — fetches publicly available regulatory feeds from URLs you configure

---

## 4. No Telemetry

openEXPERT collects **no usage telemetry, no error reporting, and no analytics** back to FutureChains or any third party. There is no analytics SDK, no crash reporter, and no phone-home mechanism in the application.

---

## 5. Authentication and Access Control

### 5.1 Solo mode (default)

The application runs without authentication. It is intended for a single user on a trusted machine. **Do not expose solo-mode openEXPERT to a public network.**

### 5.2 Team mode

When `DEPLOYMENT_MODE=team` is set:
- Authentication uses standard **JWT (JSON Web Tokens)** with a configurable expiry
- Passwords are hashed with **bcrypt** (no plaintext storage)
- Sessions are invalidated on password reset
- OAuth 2.0 integrations (Google, GitHub, enterprise OIDC/SAML via OpenID Connect) follow their respective providers' security standards
- Rate limiting is applied to all authentication endpoints

### 5.3 Network security recommendations

For team deployments accessible over a network:
- Place openEXPERT behind a **reverse proxy with TLS** (e.g., nginx, Caddy, Traefik)
- Restrict network access to known IP ranges where possible
- Set a strong `JWT_SECRET` (minimum 32 random bytes)
- Rotate `JWT_SECRET` periodically — this invalidates all active sessions

---

## 6. Data Classification Guidance

For organisations operating under data classification frameworks (e.g., ISO 27001, SOC 2, DORA, NIS2):

| Classification level | Recommendation |
|---|---|
| **Public / unrestricted** | All providers including cloud AI APIs |
| **Internal / business confidential** | Review your AI provider's commercial API data agreements; Anthropic and OpenAI both offer Data Processing Agreements (DPAs) |
| **Restricted / sensitive personal data** | Use Ollama with a local model, or obtain a signed DPA from your chosen cloud AI provider before use |
| **Secret / classified** | Local model only (Ollama); no cloud AI API calls; air-gapped deployment recommended |

---

## 7. GDPR and Personal Data

If you process personal data (within the meaning of the EU General Data Protection Regulation or equivalent legislation) using openEXPERT:

- openEXPERT itself is a **data processor tool** under your control — you are the data controller
- Personal data stored in the local database (e.g., user accounts in team mode) is held exclusively on your infrastructure
- Personal data sent to AI API providers (e.g., in document text) is subject to each provider's GDPR commitments and DPA arrangements:
  - Anthropic DPA: available upon request at [privacy@anthropic.com](mailto:privacy@anthropic.com)
  - OpenAI DPA: [openai.com/policies/data-processing-addendum](https://openai.com/policies/data-processing-addendum)
- You are responsible for ensuring you have a valid legal basis for any personal data you process through the tool
- FutureChains/Anton is not a data processor under GDPR with respect to your use of openEXPERT, as we do not receive or process your data

---

## 8. Financial Services and Regulated Industries

openEXPERT is designed with financial services, legal, and compliance use cases in mind. Note:

- The application generates AI-assisted analysis. **All outputs must be reviewed by a qualified professional** before use in client deliverables, regulatory submissions, or compliance decisions.
- AI-generated content is not legal, regulatory, or financial advice.
- For MiFID II, GDPR, DORA, and similar regimes, your obligations with respect to record-keeping, explainability, and human oversight apply to your use of this tool.
- Audit logging is built in — all significant actions are written to the `audit_log` table in the local database, providing a local evidence trail.

---

## 9. Open Source and Licensing

openEXPERT is proprietary software developed by FutureChains. It incorporates open-source dependencies, each governed by their respective licences. A full licence report can be generated by running:

```
pnpm run licenses:report
```

The generated report lists all dependencies and their licences.

---

## 10. Liability and Warranty Disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

IN NO EVENT SHALL FUTURECHAINS OR ITS AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Users are responsible for ensuring their use of openEXPERT and any connected AI providers complies with applicable laws and regulations in their jurisdiction.

---

## 11. Contact

For data, privacy, or legal enquiries:

**FutureChains**
[Insert registered address]
[Insert contact email]

For security vulnerability disclosures, please follow responsible disclosure and contact us directly before public disclosure.

---

*This document should be reviewed by qualified legal counsel before use in enterprise procurement or compliance contexts. FutureChains is not a law firm and this document does not constitute legal advice.*
