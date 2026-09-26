/**
 * PrivacyNoticePage — /privacy, reachable without signing in.
 *
 * The privacy notice of the public demo (DEMO_MODE=true; privacy review G10).
 * The text is written for the launch configuration: GLM 5.3 Flash through
 * OpenRouter, pinned to Inceptron with zero data retention; no memory
 * learning, Online References, voice input or sign-off form for visitors; the
 * demo-mode session cookie and the preference keys cleared at sign-out
 * (src/lib/safe-storage.ts); nothing loaded from other sites. Change the
 * text when any of that changes.
 *
 * [[NAME]] marks a fact the owner supplies (src/lib/demo-legal.ts); the
 * retention period comes from the server. The DRAFT box stays up until every
 * fact is filled in and counsel has signed the notice off.
 */
import LegalDocument from '@/components/shared/LegalDocument';

export const PRIVACY_NOTICE_MD = `# Privacy notice: ANTON public demo

**Last updated:** [[NOTICE_EFFECTIVE_DATE]]

**This notice covers:** the public demo of ANTON at [[DEMO_URL]]

> ### The short version
>
> - **Who is responsible:** [[CONTROLLER_NAME]] runs this demo. Contact: [[PRIVACY_EMAIL]].
> - **What we ask for:** an invite code, a username and a password. You also confirm that you are 18 or over and that you accept the demo terms. We don't ask for an email address or your real name.
> - **Please don't enter real personal data**, about you or about anyone else. That means no real names, no personal identity numbers (personnummer), and no health, money, job or client details. Use made-up or public information.
> - **Where your input goes:** what you type or upload in a module goes to OpenRouter, Inc. in the USA. OpenRouter passes it to Inceptron AB, which runs the AI model GLM 5.3 Flash in the EU/EEA.
>   - Both companies say they don't store your prompts and answers after the answer is generated, and that they don't use them to train AI. There are narrow exceptions: brief caching, where the law requires it, and dealing with misuse.
>   - OpenRouter also runs its own misuse checks and anonymous statistics. It is responsible for those itself (section 6.2).
> - **Transfer to the USA:** OpenRouter is not certified under the EU-U.S. Data Privacy Framework. The transfer rests on the EU Standard Contractual Clauses (section 8).
> - **Answers are written by an AI**, not by a person. They can be wrong. They are not professional advice.
> - **Deleted after about [[ACCOUNT_TTL_DAYS]] days:** your account stops working [[ACCOUNT_TTL_DAYS]] days after sign-up. It is then deleted with everything in it, normally within a day. Backup copies are overwritten within 7 more days.
> - **No tracking:** we use no analytics, no advertising and no tracking cookies. Our pages load nothing from other websites.
> - **Your rights:** you can ask for a copy of your data, a correction or deletion, and you can object. Write to [[PRIVACY_EMAIL]] and give your username. You can also complain to IMY, the Swedish Authority for Privacy Protection.
>
> The full notice follows. Each section can be read on its own.

---

## 1. Who is responsible for your data

The "controller" decides why and how your data is used. For this demo the controller is:

| | |
|---|---|
| Name | [[CONTROLLER_NAME]] ([[CONTROLLER_LEGAL_FORM]]) |
| Address | [[CONTROLLER_ADDRESS]] |
| Organisation number | [[CONTROLLER_ORG_NO]] |
| VAT number | [[CONTROLLER_VAT_NO]] |
| Email for privacy questions and requests | [[PRIVACY_EMAIL]] |

We have not appointed a data protection officer, because the law does not require one for this demo.

## 2. Whose data this notice covers

- **Visitors who create a demo account and use it.**
- **Anyone who opens the demo's pages**, including people who only try to sign in or sign up.
- **Anyone who writes to us** at [[PRIVACY_EMAIL]].
- **People mentioned in what visitors enter or upload.** We ask visitors not to do this (section 15).

## 3. What data we process

| Kind of data | What exactly | Where it comes from |
|---|---|---|
| Your account | An internal account ID and your username. Your password, stored only as a one-way hash (bcrypt). Your role and your monthly token budget. When you signed up, when the account expires, when you last signed in, and whether the account is switched off. When you accepted the demo terms, which version you accepted, and when you confirmed that you are 18 or over. The invite code you enter is checked and then discarded. | You and our system |
| Sign-in sessions | A sign-in token, when it was issued, when it expires and when it was last used. | Our system |
| What you enter | Your prompts, module inputs and settings, and the earlier messages in the same session. The titles and notes you give your sessions. Module instructions, if you edit them. For files you upload: the file itself (stored under a name that includes its original file name), its size and type, and the text we extract from it on our own server. | You |
| What the AI produces | Answers and two automatic copies of them: a version copy, and a copy of each module answer in our output store. The model's reasoning text, where the model returns it. The session titles and session summaries the AI writes. | The AI model |
| Run records | For each answer: the full instructions sent to the AI (including the text of your uploaded files), the sources used, the model, the number of tokens and the cost. | Our system |
| Your ratings | The verdicts, star ratings and comments you give on answers. | You |
| Usage records | Which modules you used and when. The settings of each run and the names of the files used as sources. Your token totals and the cost of each AI call. A count of your runs per module. For each module, your last-used settings and inputs, so that the form can be pre-filled next time. | Our system |
| Security and technical data | **Web server log:** for every request, your IP address (section 9 says how it is stored), the time, the address requested and your browser type (user agent). **Sign-in attempts:** the username typed, the IP address, the time and whether it succeeded. A failed sign-in also creates a security event with the IP address and the time. If the username belongs to an account, the event is linked to that account and can include the username. If it belongs to no account, the event holds a short keyed code (an HMAC) made from the typed name, not the name itself. **Sign-up attempts:** a successful sign-up is recorded like a successful sign-in. A failed sign-up records no username. If the invite code was wrong, a security event records the IP address and the time. **Log of changes made through the site:** your account ID, the kind of request, the address, the result and the IP address reported for the request. None of these logs holds the content of your requests. | Your browser and our system |
| Pseudonymous code | A code we derive from your account ID with a secret key that is used for nothing else (an HMAC). It is sent to OpenRouter with the AI requests (section 6). It does not contain your username. | Our system |

**What we don't ask for when you sign up:** your email address, real name, phone number, payment details or location. If you write to us about your rights, we keep your email address with your request (section 9).

**Switched off on this demo:**

- fetching web pages from web addresses you give (Online References);
- voice input (the microphone button);
- the sign-off form that asks for a reviewer's name.

None of these features is available on this demo. We also don't offer the modules on health, HR, workers' rights, criminal law and investigations, or the credit-risk and CV-writing modules.

## 4. Why we use your data, and on what legal basis

| Purpose | Data used | Legal basis (GDPR) |
|---|---|---|
| **1. Run the demo you signed up for.** This means opening and running your account, running the modules you choose, sending your input to the AI service, and showing and storing your sessions. It also covers writing session titles and summaries, pre-filling module forms with your last-used settings, and letting you export answers. | Account, sign-in sessions, what you enter, what the AI produces, run records, your last-used settings for each module | Art. 6(1)(b): the processing is necessary to provide the service under the demo terms you accept. |
| **2. Keep the demo secure and stop abuse.** This covers sign-in checks, rate limits and lock-outs, logs of sign-ins and changes, web server logs, and investigating misuse. The pseudonymous code lets OpenRouter act against one account instead of blocking the whole demo. | Security and technical data, pseudonymous code | Art. 6(1)(f): our legitimate interest in a secure service that is not misused. |
| **3. Keep the free demo affordable** with monthly token budgets, daily spending caps and cost records. | Usage records | Art. 6(1)(f): our legitimate interest in controlling the cost of a free service. |
| **4. See which modules work well.** Your ratings also update anonymous quality statistics for each module. | Your ratings | Art. 6(1)(f): our legitimate interest in improving the modules. |
| **5. Recover from failures** with a nightly backup of the database. | Everything in the database | Art. 6(1)(f): our legitimate interest in not losing the service and its data. |
| **6. Handle your rights requests and record security incidents.** | Your request, our correspondence (including your email address), incident records | Art. 6(1)(c): our legal obligations under the GDPR. |
| **7. Handle information about other people that a visitor enters** (section 15). | Whatever was entered | Art. 6(1)(f): our legitimate interest in providing the demo the visitor asked for. |
| **8. Let OpenRouter carry out the checks and statistics that are a condition of its service** (section 6.2). | What you enter, the pseudonymous code | Art. 6(1)(f): our legitimate interest in using an AI service that is only offered on these terms. |

If you only open the demo's pages, only purpose 2 applies to you.

We use your data for nothing else. We don't sell it and we don't use it for advertising. Before we use it for a new purpose, we will update this notice (section 19).

> ## 5. Your right to object
>
> Where we rely on our legitimate interests (purposes 2, 3, 4, 5, 7 and 8), you may object at any time, on grounds relating to your particular situation. Write to [[PRIVACY_EMAIL]].
>
> We will then stop, with two exceptions:
>
> - we have compelling legitimate grounds that override your interests, rights and freedoms;
> - we need the data to establish, exercise or defend legal claims.
>
> One example is the security logs of an ongoing abuse case.
>
> OpenRouter only offers its service with the checks in purpose 8. If you object to them, the only way we can stop is to stop sending your requests, which means closing your account.
>
> The simplest way to end all processing is to ask us to delete your account (section 12).

## 6. How the AI works on this demo

### 6.1 What we send, and to whom

When you run a module, our server sends a request to **OpenRouter, Inc.** in the USA. The request contains:

- your prompt, your module inputs and settings, and the earlier messages of the session;
- the module's instructions, including any you edited;
- when you return to a session after a break, the session summary written so far;
- the text of files you uploaded to the session, with their file names, and images if the model can read images;
- the pseudonymous code for your account.

With the demo's standard setting, two more requests go to the same model:

- **After your first message:** the message (up to 400 characters) and the start of the answer (up to 600 characters). The AI uses them to write a session title.
- **After each answer of 200 characters or more:** the last 12 messages of the session, each cut to its first 1,500 characters. The newest answer keeps its first and last 1,500 characters. The AI uses them to write the session summary shown on the page.

The operator can also switch on two requests that ANTON makes after each answer on other installations. With them on, the AI also rates the quality of each answer longer than 200 characters (that request carries the first 3,000 characters of the answer), and extracts the structure of each answer longer than 100 characters, such as its sections and tables (that request carries the whole answer).

OpenRouter does **not** receive your IP address, username, password or cookies. It sees only our server's address.

OpenRouter passes each request to **Inceptron AB** (Lund, Sweden), which runs the AI model **GLM 5.3 Flash** in the EU/EEA. Our OpenRouter account and every request are set up so that requests go only to Inceptron. When Inceptron is busy, the demo shows an error. We don't send your request to another provider instead.

OpenRouter lists the model as made by Z.ai. We don't send your data to Z.ai.

### 6.2 What OpenRouter and Inceptron promise, and what OpenRouter does for itself

**OpenRouter as our processor.** OpenRouter handles your requests for us under its Data Processing Agreement. We have done three things:

- In our account, we switched off OpenRouter's optional prompt logging and its use of inputs and outputs.
- With every request, we ask for "zero data retention" endpoints only (\`zdr: true\`), and only for providers that do not collect data (\`data_collection: deny\`).
- We allow only Inceptron to run the model (section 6.1).

OpenRouter's agreement says that it "will delete Inputs and Outputs promptly following generation of the relevant Output". There are exceptions where the law requires otherwise, or where OpenRouter must deal with malicious use. Its definition of zero data retention also allows "transient processing in memory, short-lived buffering or caching strictly necessary to transmit, secure, or complete the request".

**OpenRouter for its own purposes.** OpenRouter also processes some data for its own purposes. For these it decides the purposes itself, so it is responsible for them as a controller in its own right, under its own privacy policy (https://openrouter.ai/privacy):

- It screens requests automatically before deleting them, to detect misuse. Its terms mention screening "for known child sexual abuse material (CSAM) and malware". It must report apparent CSAM to the US National Center for Missing & Exploited Children.
- It keeps metadata about each request, such as token counts and timing, but not the content. It may keep the pseudonymous code with this metadata. It has not published a fixed period for the metadata. Its privacy policy says it keeps information "for as long as is reasonably necessary to comply with our business and legal obligations".
- Its terms give it a licence to use your inputs "in anonymized form, solely for tracking and sharing user metrics". Its documentation says it sorts "a small number of prompts" into categories and stores the result anonymously. Its privacy policy, however, speaks of assigning "a topic category to each Input".

You can write to OpenRouter about this processing at privacy@openrouter.ai.

**Inceptron.** Inceptron says that by default prompts and outputs "are not logged or stored", unless its customer (here, OpenRouter) enables logging or agrees otherwise in writing. OpenRouter lists Inceptron as a zero-data-retention provider. Inceptron also says:

- customer content "is processed exclusively within the European Union or European Economic Area";
- "We do not train models on customer data".

It keeps request metadata (such as request IDs, timestamps and token counts) and telemetry logs. Telemetry logs are "typically retained for 30 days, unless required longer for troubleshooting". It has not published a separate period for request metadata. Inceptron's privacy policy is at https://www.inceptron.io/privacy.

### 6.3 Answers are generated by AI

You are using an AI system. Answers, session titles and session summaries are generated automatically by GLM 5.3 Flash, a large language model. No person writes or checks them before you see them.

They can be wrong, incomplete or out of date, and the model can make things up. They are not legal, financial, tax, medical or other professional advice.

### 6.4 What we don't do

- We don't train AI models on your content. OpenRouter and Inceptron say they don't either. OpenRouter's anonymous statistics are described in section 6.2.
- ANTON's memory learning is switched off on this demo. We extract no memory items from your content and build no search index from it. Nothing from your other sessions, or from other visitors, is added to your prompts. The one stored text added back is the summary of that same session, when you return to it after a break (section 6.1).
- To find reference material in ANTON's own library that fits your question, our server uses your message once as a search query. This happens on our own server, and the query is not saved.
- Other visitors cannot see your sessions.

## 7. Who receives your data

| Recipient | Role | Where | What they receive |
|---|---|---|---|
| Bahnhof AB, Stockholm | Hosts our server (our processor) | Sweden | Everything we store, as it sits on our server |
| OpenRouter, Inc., 169 Madison Avenue, New York, NY 10016 | Routes AI requests to the model (our processor) | USA | What is listed in section 6.1 |
| OpenRouter, Inc. (for its own purposes) | Independent controller for its misuse screening, request metadata and anonymous statistics (section 6.2) | USA | Your requests as listed in section 6.1, and request metadata, which may include the pseudonymous code |
| Companies OpenRouter uses to run its service. Its security documentation names Google Cloud Platform (hosting "in US regions"), Cloudflare (firewall and DDoS protection) and Datadog (logging). Its full sub-processor list is available from OpenRouter on request. | Help OpenRouter run its service | USA and other countries | Parts of the same data, as part of OpenRouter's service |
| Inceptron AB, Scheelevägen 15, 223 70 Lund | Runs the AI model (a sub-processor of OpenRouter) | EU/EEA | The content of each request (section 6.1) |
| [[MAILBOX_PROVIDER]] | Hosts our privacy mailbox (our processor) | [[MAILBOX_LOCATION]] | Emails you send to [[PRIVACY_EMAIL]] and our replies |
| Public authorities and courts | Receive data only where the law requires us to disclose it | Where the law applies | What the law requires |

Nobody else receives your data.

## 8. Transfers outside the EU/EEA

OpenRouter is a US company and its platform is hosted in the USA. So everything listed in section 6.1 is transferred to the USA, even though the model itself runs in the EU/EEA.

- **No adequacy decision covers OpenRouter.** The EU's adequacy decision for the USA covers only companies certified under the EU-U.S. Data Privacy Framework. OpenRouter is not certified: we checked the official list on 26 September 2026.
- **What we rely on instead.** We use the EU Standard Contractual Clauses (Commission Implementing Decision (EU) 2021/914, Module 2: controller to processor). They are part of OpenRouter's Data Processing Agreement, the version dated [[OPENROUTER_DPA_VERSION_DATE]], at https://openrouter.ai/data-processing-agreement. You can also ask us for a copy.
- **Our own assessment and safeguards.** We have assessed this transfer and added our own safeguards:
  - OpenRouter receives no IP address, username or password.
  - Under its agreement, it deletes prompts and answers promptly after the answer is generated, apart from the narrow exceptions in section 6.2.
  - We ask visitors not to enter real personal data in what they type or upload.
- **Sub-processors.** Under the Standard Contractual Clauses (Clause 9), OpenRouter must bind its sub-processors by a written contract with, in substance, the same data protection obligations as its own. It remains responsible for them.
- **OpenRouter's own purposes.** The clauses govern OpenRouter's work as our processor. What OpenRouter does for its own purposes (section 6.2) is governed by its own privacy policy (https://openrouter.ai/privacy).

## 9. How long we keep your data

| Data | How long |
|---|---|
| **Your account and everything in it:** sessions, prompts and edited module instructions, uploaded files and their text, answers and copies of answers, run records, session titles and summaries, ratings, usage records and sign-in sessions | Your account stops working [[ACCOUNT_TTL_DAYS]] days after you sign up. A clean-up job runs once a day and then deletes it, normally within 24 hours. It can take longer if the server was down. |
| A session you delete yourself | These are removed from our live database at once: its messages, answers, the version copies of its answers, the copy of its answers in our output store, its run records and its summary, and its ratings and any quality scores and feedback on its answers. These stay until your account is deleted: your token totals, your run counts and last-used settings for each module, and the files you uploaded. The cost records of its AI calls stay too, without the link to the session. |
| Sign-in attempts, security events and the log of changes, with IP addresses | Deleted by the daily clean-up once they are [[ACCOUNT_TTL_DAYS]] days old. Most entries about your account go earlier, when your account is deleted. The rest are deleted when they reach [[ACCOUNT_TTL_DAYS]] days. |
| Web server access log | [[NGINX_LOG_SENTENCE]] |
| Technical error logs of our server and database | 30 days. They are not meant to hold your content, but an error line can contain the name of a file you uploaded, or your username. |
| Backups of the database | Each nightly backup is overwritten after 7 days, so a deleted account can stay in a backup for up to 7 more days. If we ever have to restore a backup, we first delete again every account that expired, or that we deleted on request, since the backup was taken. A session you deleted yourself in that time could come back. If it does, it is deleted with your account. |
| Files you export | We keep no copy. The file goes straight to your browser. |
| Cost records of AI calls: model, tokens, cost, purpose and time | Kept while the demo runs, to control costs. When your account is deleted, we remove the link to your account and session. |
| Results of the automatic checks run on each answer: which rule ran and what it found, never the answer text | Kept. They carry only the internal IDs of the session and the answer, which point to nothing once those are deleted. |
| Anonymous quality statistics per module | Kept. They do not identify you. |
| Rate-limit counters, by IP address or account | Held in memory for up to one hour. |
| Your emails with us about your rights | 3 years after your request is closed, so that we can show how we handled it. |
| At OpenRouter | Prompts and answers are deleted promptly after the answer is generated, apart from the exceptions in section 6.2. OpenRouter has not published a fixed period for request metadata. Its privacy policy says it keeps information "for as long as is reasonably necessary to comply with our business and legal obligations". |
| At Inceptron | By default, prompts and answers are not stored. Telemetry logs are "typically retained for 30 days, unless required longer for troubleshooting". Inceptron has not published a separate period for request metadata. |

## 10. Cookies and storage on your device

We use only the cookie and browser storage listed below. None of them is used for analytics, advertising or tracking.

- The demo's pages load no fonts, scripts or other files from other websites.
- Images from other websites inside AI answers are blocked.
- The demo installs no service worker and keeps no offline copy of its pages in your browser.

| Name | Type | Why | How long |
|---|---|---|---|
| \`openexpert_session\` | Cookie (HttpOnly, Secure, SameSite=Strict) | Keeps you signed in | Until you close the browser or sign out. The server ends the sign-in after 8 hours at the latest. |
| \`openexpert-token\` | Browser session storage | The same sign-in token, used by the app | Until you close the tab or sign out. It stops working after 8 hours in any case. |
| Preference keys (examples below) | Browser local storage and session storage | Remember your choices and settings (list below) | Local storage: until you sign out, or clear this site's data in your browser. Session storage: until you close the tab or sign out. These keys stay in your browser. |

**Examples of preference keys:** \`openexpert-language\`, \`openexpert-theme\`, \`openexpert-sidebar-collapsed\`, \`openexpert-sidebar-sections\`, \`openexpert-favorite-nav-items\`, \`openexpert-hidden-nav-items\`, \`openexpert-default-model\`, \`openexpert-default-thinking\`, \`openexpert-default-creativity\`, \`openexpert-app-mode\`, \`openexpert-tour-completed\`, \`openexpert-has-entered\`, \`openexpert-location\`, \`anton-favorites\`, \`anton-home-v2-rail-collapsed\`, \`pwa-install-dismissed\`, \`dismissed-skills-…\`, \`dismissed-lib-suggest-…\`, \`recent-commands\` and \`command-macros\`. In session storage: \`openexpert-intel-health-banner-dismissed\` and \`openexpert-model-reco-dismissed\`.

**What the preference keys remember:**

- language, theme, layout and favourites;
- default model settings, which the app first fills in from the server's default;
- the guided tour, and tips and banners you dismissed;
- recent commands and shortcuts you save;
- a city and country, only if you type them on the Settings page.

You can delete all of these in your browser's settings at any time. Signing out removes the sign-in token and these keys, and ends your session.

## 11. Your rights

You have the right to:

- **access:** get a copy of your data and information about how we use it;
- **rectification:** have wrong data corrected;
- **erasure:** have your data deleted;
- **restriction:** have us limit the use of your data to storing it. This applies:
  - while we check whether your data is correct, or whether your objection outweighs our reasons;
  - where the processing is unlawful but you prefer restriction to deletion;
  - where we no longer need the data but you need it for a legal claim;
- **portability:** get the data you gave us in a structured, commonly used and machine-readable format (JSON), and pass it to another service. Where it is technically feasible, you can ask us to send it there directly;
- **object:** see section 5.

**Fees.** Using your rights is free. If a request is manifestly unfounded or excessive (for example, repetitive), we may charge a reasonable fee or refuse it. We will explain why.

**Timing.** We answer without undue delay, and within one month at the latest. If a request is complex, or if there are many requests, we may take two more months. If so, we will tell you within the first month and explain why.

**Things you can do yourself at any time:**

- delete a session (see section 9 for what is removed at once);
- download any answer with the Export button.

## 12. How to use your rights without an email address on file

We only know your username, not your email address or real name. We check that you control the account, so that someone who only knows your username cannot get your data:

1. Write to [[PRIVACY_EMAIL]]. Give your username and say what you want.
2. We reply with a one-time code.
3. Sign in to the demo and rename one of your sessions to that code.
4. We check the rename and then answer your request. We send a copy of your data only to someone who has passed this check.

**Deletion needs less proof.** Give your username and either the title of one of your sessions or roughly when you signed up. We switch the account off at once and delete it without undue delay, and within one month at the latest.

**If you have lost your password** and cannot sign in, give us details that only the account holder is likely to know instead. Examples are the titles of several of your sessions and roughly when you signed up. If we still cannot confirm that the account is yours, we will tell you so and explain why. We can still switch the account off, and it will be deleted automatically when it expires.

We keep a record of your request and our answer (section 9).

OpenRouter and Inceptron do not keep your prompts and answers beyond the exceptions in section 6.2, so they normally have nothing to delete. Where they still hold data, we will pass your request on to them. If you ask, we will tell you who they are. For what OpenRouter keeps for its own purposes, you can also write to OpenRouter directly at privacy@openrouter.ai.

## 13. Complaints

You can complain to a data protection supervisory authority. In particular, you can complain in the EU/EEA country where you live or work, or where you think the problem happened. In Sweden the authority is:

**Integritetsskyddsmyndigheten (IMY)**, the Swedish Authority for Privacy Protection\\
Box 8114, 104 20 Stockholm, Sweden\\
Phone +46 (0)8 657 61 00 · imy@imy.se\\
Complaint form: https://www.imy.se/en/individuals/forms-and-e-services/file-a-gdpr-complaint/

We would welcome the chance to put things right first, but you don't have to contact us before you complain.

## 14. Do you have to give us data?

- **To create an account**, you must:
  - enter the invite code you were given;
  - choose a username and a password;
  - confirm that you are 18 or over;
  - accept the demo terms.

  These are conditions of the demo. Without them we cannot open an account.
- **To get an answer**, you have to type something. You decide what. Please keep it free of real personal data.
- Nothing else is required.

## 15. Information about other people

If you enter, upload or paste information about other people, we process it only to answer you, and we delete it together with your account (section 9). We tell those people about this through this public notice, because we don't know who they are and have no way to contact them (GDPR Art. 14(5)(b)).

Please don't enter such information: the demo is not meant for real personal data. Never enter health data, information about crimes, or personal identity numbers. That is why this demo does not offer the modules on health, HR, workers' rights, criminal law and investigations, or the credit-risk and CV-writing modules.

## 16. Automated decisions

We make no decision about you that is based solely on automated processing and has legal or similarly significant effects (GDPR Art. 22).

Automatic limits can refuse a request for a while:

- the monthly token budget;
- the daily spending caps;
- upload limits;
- rate limits;
- limits on new sign-ups;
- a 15-minute lock after five failed sign-ins.

If you think a limit has refused you wrongly, write to us.

## 17. Age limit

The demo is only for people aged 18 or over. You confirm your age when you sign up, and we record when you did. If we learn that an account belongs to someone under 18, we delete it.

## 18. Security, and who at our end can see your content

- The connection to the demo is encrypted (HTTPS).
- Passwords are stored only as one-way hashes.
- Each visitor can see only their own sessions.
- The database can only be reached from inside our server, and the key to the AI service is stored encrypted.
- The operator's administrator account can technically see every account and its content. We look at your content only in these cases:
  - to deal with abuse or a security incident;
  - to meet a legal obligation;
  - to handle a request from you.

## 19. Changes to this notice

We publish every change on this page with a new date. Before we add a new purpose, a new recipient, or any learning from your content, we will update this notice and announce the change in the demo banner.
`;

export default function PrivacyNoticePage() {
  return <LegalDocument markdown={PRIVACY_NOTICE_MD} what="privacy notice" />;
}
