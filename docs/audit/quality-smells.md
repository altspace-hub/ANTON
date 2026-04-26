# Quality Smells Report

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.3 (quality smell detection)

Severity: error swallowing > console.log in prod > TODO density > file size.

## 1. Error swallowing (`catch (...) {}`)

Empty catch blocks silently drop errors. Top offenders:

```
(none — clean!)
```

## 2. `console.log` / `console.warn` in production code

These should be removed or replaced by structured logging. CLAUDE.md anti-pattern §6.

**Total occurrences:** 612

Top files by count:

```
     89 server/index.ts
     53 server/db/init.ts
     51 server/db/init_enhanced.ts
     23 server/db/init-postgresql.ts
     17 server/services/anton-bundler.ts
     16 server/services/event-workflow-processor.ts
     13 server/services/workflow-executor.ts
     13 server/services/embedding-pipeline.ts
     12 server/services/orchestrator-heartbeat.ts
     11 server/services/orchestrator-engine.ts
     10 server/services/market-workflow-orchestrator.ts
     10 server/routes/workflows.ts
     10 server/db/migrate-workspaces.ts
      9 server/services/market-data-service.ts
      8 server/services/task-auto-processor.ts
```

## 3. TODO / FIXME / HACK / XXX density

**Total markers:** 52

Top files:

```
      8 server/routes/workflows.ts
      5 src/pages/community/CommunityContactsPage.tsx
      3 server/services/coding-engine.ts
      2 src/pages/community/CommunityMailPage.tsx
      2 server/services/roaring-connector.ts
      2 server/services/community-crypto.ts
      2 server/routes/community.ts
      2 server/routes/coding-scripts.ts
      2 server/routes/coding-large.ts
      2 server/db/init.ts
      2 server/db/init-postgresql.ts
      1 src/pages/jobs/CareerProfilePage.tsx
      1 src/pages/futurechain/FCKycPage.tsx
      1 src/pages/community/CommunityPage.tsx
      1 src/pages/community/CommunityJoinPage.tsx
```

## 4. Files over 500 lines

Candidates for split per CLAUDE.md anti-pattern (god services).

```
 229295 total
  32970 total
   2776 src/components/layout/Sidebar.tsx
   2755 src/pages/Settings.tsx
   2224 src/pages/GapAssessmentWizard.tsx
   2108 server/services/anton-bundler.ts
   1906 src/pages/CodingLargeProjectPage.tsx
   1747 src/pages/ScriptMediumPage.tsx
   1657 server/services/market-workflow-orchestrator.ts
   1652 src/pages/BuildYourOwnModule.tsx
   1624 src/pages/AntonTaskAgentPage.tsx
   1611 server/services/orchestrator-engine.ts
   1548 server/services/discovery-engine.ts
   1463 src/pages/OrchestratorDashboard.tsx
   1323 src/pages/RadarPage.tsx
   1316 src/pages/ModulePage.tsx
   1281 server/services/pathfinder-engine.ts
   1251 src/components/engagement/EngagementReview.tsx
   1218 server/services/market-index-rebalance-service.ts
   1213 src/pages/procure/ProcureCyclePage.tsx
   1195 src/pages/TradesHubPage.tsx
   1178 src/pages/KnowledgeBasePage.tsx
   1155 server/services/app-gateway.ts
   1146 src/pages/portals/PortalManagePage.tsx
   1129 src/pages/DiscoverPage.tsx
```

## 5. Hard-coded HTTP(S) URLs in server code

Should be env vars or config — CLAUDE.md anti-pattern §6.

```
server/db/init-postgresql.ts:85:      ('src_eba', 'European Banking Authority', 'https://www.eba.europa.eu/sites/default/documents/files/document_library/Publications/Guidelines/feed.xml', 'rss', 24, '["fcp","legal","banking"]', '["AML","CFT","capital","liquidity","governance"]'),
server/db/init-postgresql.ts:86:      ('src_esma', 'ESMA News', 'https://www.esma.europa.eu/press-news/esma-news', 'web_page', 24, '["legal","investment"]', '["MiFID","EMIR","MAR","sustainable finance"]'),
server/db/init-postgresql.ts:87:      ('src_fatf', 'FATF Publications', 'https://www.fatf-gafi.org/en/publications.html', 'web_page', 168, '["fcp"]', '["money laundering","terrorist financing","FATF","recommendation"]'),
server/db/init-postgresql.ts:88:      ('src_amla', 'EU AML/CFT Publications', 'https://eur-lex.europa.eu/search.html?scope=EURLEX&type=quick&lang=en&SUBDOM_INIT=LEGAL_SOURCES&DTS_SUBDOM=LEGAL_SOURCES', 'eur_lex', 24, '["fcp","legal"]', '["anti-money laundering","AMLA","AMLR","financial crime"]'),
server/db/init-postgresql.ts:89:      ('src_ecb', 'ECB Banking Supervision', 'https://www.bankingsupervision.europa.eu/press/publications/rss.xml', 'rss', 24, '["banking","risk"]', '["supervision","capital","stress test","SREP"]')
server/db/init-postgresql.ts:95:  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/', 'rss', 12, '[\"pe-vc\",\"startups\"]', '[\"funding\",\"startup\",\"Series A\",\"Series B\",\"acquisition\",\"IPO\"]', 'pe-vc') ON CONFLICT DO NOTHING");
server/db/init-postgresql.ts:96:  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_arxiv_cs', 'arXiv (CS/AI)', 'https://arxiv.org/rss/cs.AI', 'rss', 24, '[\"pe-vc\",\"data-analytics\"]', '[\"AI\",\"machine learning\",\"LLM\",\"deep learning\",\"breakthrough\"]', 'pe-vc') ON CONFLICT DO NOTHING");
server/db/init-postgresql.ts:97:  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_sec_edgar', 'SEC EDGAR (Filings)', 'https://efts.sec.gov/LATEST/search-index?q=%22S-1%22&dateRange=custom&startdt=2024-01-01&forms=S-1,F-1', 'web_page', 24, '[\"pe-vc\",\"investment\"]', '[\"S-1\",\"F-1\",\"IPO\",\"prospectus\",\"public offering\"]', 'pe-vc') ON CONFLICT DO NOTHING");
server/db/init-postgresql.ts:98:  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_hackernews', 'Hacker News', 'https://news.ycombinator.com/rss', 'rss', 6, '[\"pe-vc\",\"software-eng\"]', '[\"funding\",\"launch\",\"acquired\",\"raised\",\"Series\",\"YC\"]', 'pe-vc') ON CONFLICT DO NOTHING");
server/db/init-postgresql.ts:99:  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_eu_ai_act', 'EU AI Act Tracker', 'https://www.europarl.europa.eu/topics/en/article/20230601STO93804/eu-ai-act-first-regulation-on-artificial-intelligence', 'web_page', 168, '[\"pe-vc\",\"legal\",\"fcp\"]', '[\"AI Act\",\"AI regulation\",\"GPAI\",\"artificial intelligence regulation\"]', 'pe-vc') ON CONFLICT DO NOTHING");
server/db/init-postgresql.ts:100:  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_crunchbase_news', 'Crunchbase News', 'https://news.crunchbase.com/feed/', 'rss', 12, '[\"pe-vc\"]', '[\"funding\",\"investment\",\"venture\",\"Series\",\"unicorn\",\"acquisition\",\"exit\"]', 'pe-vc') ON CONFLICT DO NOTHING");
server/db/init-postgresql.ts:101:  await db.run("INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category) VALUES ('src_the_information', 'The Information', 'https://www.theinformation.com', 'web_page', 24, '[\"pe-vc\",\"startups\"]', '[\"startup\",\"venture\",\"funding\",\"IPO\",\"tech\",\"enterprise\"]', 'pe-vc') ON CONFLICT DO NOTHING");
server/db/init.ts:980:      ('src_eba', 'European Banking Authority', 'https://www.eba.europa.eu/sites/default/documents/files/document_library/Publications/Guidelines/feed.xml', 'rss', 24, '["fcp","legal","banking"]', '["AML","CFT","capital","liquidity","governance"]'),
server/db/init.ts:981:      ('src_esma', 'ESMA News', 'https://www.esma.europa.eu/press-news/esma-news', 'web_page', 24, '["legal","investment"]', '["MiFID","EMIR","MAR","sustainable finance"]'),
server/db/init.ts:982:      ('src_fatf', 'FATF Publications', 'https://www.fatf-gafi.org/en/publications.html', 'web_page', 168, '["fcp"]', '["money laundering","terrorist financing","FATF","recommendation"]'),
server/db/init.ts:983:      ('src_amla', 'EU AML/CFT Publications', 'https://eur-lex.europa.eu/search.html?scope=EURLEX&type=quick&lang=en&SUBDOM_INIT=LEGAL_SOURCES&DTS_SUBDOM=LEGAL_SOURCES', 'eur_lex', 24, '["fcp","legal"]', '["anti-money laundering","AMLA","AMLR","financial crime"]'),
server/db/init.ts:984:      ('src_ecb', 'ECB Banking Supervision', 'https://www.bankingsupervision.europa.eu/press/publications/rss.xml', 'rss', 24, '["banking","risk"]', '["supervision","capital","stress test","SREP"]')
server/db/init.ts:2369:      'src_techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/', 'rss', 12, '["pe-vc","startups"]', '["funding","startup","Series A","Series B","acquisition","IPO"]', 'pe-vc'
server/db/init.ts:2372:      'src_arxiv_cs', 'arXiv (CS/AI)', 'https://arxiv.org/rss/cs.AI', 'rss', 24, '["pe-vc","data-analytics"]', '["AI","machine learning","LLM","deep learning","breakthrough"]', 'pe-vc'
server/db/init.ts:2375:      'src_sec_edgar', 'SEC EDGAR (Filings)', 'https://efts.sec.gov/LATEST/search-index?q=%22S-1%22&dateRange=custom&startdt=2024-01-01&forms=S-1,F-1', 'web_page', 24, '["pe-vc","investment"]', '["S-1","F-1","IPO","prospectus","public offering"]', 'pe-vc'
```

## 6. Untested service files

**Services:** 363 · **Test files:** 16

Service basenames without a corresponding `<basename>.test.ts` anywhere under tests/:

```
server/services/aap-rollout-bridge.ts
server/services/aap-transport-client.ts
server/services/aap-transport-server.ts
server/services/action-risk-registry.ts
server/services/adapters/azureOpenaiAdapter.ts
server/services/adapters/geminiAdapter.ts
server/services/adapters/mistralAdapter.ts
server/services/adapters/ollamaAdapter.ts
server/services/adapters/openaiAdapter.ts
server/services/agent-builder.ts
server/services/agent-connector-executor.ts
server/services/agent-processor.ts
server/services/agent-service.ts
server/services/anton-bundler.ts
server/services/anton-importer.ts
server/services/anton-validator.ts
server/services/antonExport.ts
server/services/antonImport.ts
server/services/app-checkpoint-service.ts
server/services/app-enrollment-service.ts
server/services/app-gateway.ts
server/services/app-mail-service.ts
server/services/app-push-service.ts
server/services/app-websocket.ts
server/services/apprentice.ts
server/services/atom-boost.ts
server/services/atom-extractor.ts
server/services/audience-adapter.ts
server/services/audit-queue.ts
server/services/auditLogger.ts
```

## Cadence

Run weekly via `pnpm run anton:investigate -- --pattern quality`.
