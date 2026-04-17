# ANTON Service Pack Target Map — Global & Country-Specific

**Purpose:** This document maps the most important websites, apps, and services that ANTON Missions should be able to interact with. It is organised by **Service Pack Category** so that Claude Code can build packs in logical groups. Each category contains global platforms plus country-specific variants for: Sweden (SE), France (FR), Germany (DE), Italy (IT), UK (GB), Japan (JP), Spain (ES), Netherlands (NL), India (IN).

**Data sources:** Semrush (March 2026), Similarweb (Feb 2026), Wikipedia most-visited list (Jan 2026), Business of Apps (2025 downloads), AppTweak (2025 global).

**How to read this:** Each entry includes the service name, URL/app identifier, interaction type (Browser = Playwright needed, API = REST API available, MCP = MCP server exists/planned), and the primary use cases for ANTON Missions.

---

## CATEGORY 1: SEARCH ENGINES

*Service Packs for search are high-value — ANTON uses these for research tasks in almost every mission type.*

| # | Service | URL | Interaction | Global Rank | Country-Specific Notes |
|---|---------|-----|-------------|-------------|----------------------|
| 1 | Google Search | google.com | API (Custom Search JSON API) + Browser | #1 (112B visits/mo) | Default everywhere |
| 2 | Bing | bing.com | API (Bing Web Search API) | #10 | — |
| 3 | DuckDuckGo | duckduckgo.com | API (Instant Answer API) + Browser | #42 | Privacy-focused, growing in EU |
| 4 | Yahoo Japan | yahoo.co.jp | Browser | #12 | JP: dominant portal, #2 in Japan |
| 5 | Yandex | yandex.ru | Browser | #13 | — (Russia-focused but relevant for some markets) |
| 6 | Naver | naver.com | Browser | #21 | — (South Korea dominant) |
| 7 | Baidu | baidu.com | Browser | #17 | — (China dominant) |

**Priority packs:** Google (API-first), DuckDuckGo, Bing. Yahoo Japan for JP market.

---

## CATEGORY 2: SOCIAL MEDIA & PROFESSIONAL NETWORKS

*Critical for Marketing, Recruitment, and Brand Monitoring missions.*

| # | Service | URL/App | Interaction | Global Rank | Key Mission Use Cases |
|---|---------|---------|-------------|-------------|----------------------|
| 8 | Facebook | facebook.com | API (Graph API) + MCP (planned) | #3 (10.9B) | Page management, ad campaigns, community monitoring |
| 9 | Instagram | instagram.com | API (Graph API) + Browser | #4 (6.5B) | Content posting, influencer tracking, ad management |
| 10 | X (Twitter) | x.com | API (X API v2) | #6 (4.2B) | Content posting, monitoring, brand tracking |
| 11 | LinkedIn | linkedin.com | API (LinkedIn Marketing API) + Browser | #19 (1.7B) | Recruiting, content marketing, professional networking |
| 12 | Reddit | reddit.com | API (Reddit API) | #7 (5.1B) | Market research, community monitoring, content posting |
| 13 | TikTok | tiktok.com | API (TikTok for Business API) + Browser | #11 (2.1B) | Short-form video marketing, trend monitoring |
| 14 | Pinterest | pinterest.com | API (Pinterest API) | #23 | Visual marketing, product pins, trend research |
| 15 | Threads | threads.net | Browser (no public API yet) | Top 20 app | Social engagement, brand presence |
| 16 | Twitch | twitch.tv | API (Twitch API) | #33 | Streaming, gaming community engagement |
| 17 | Discord | discord.com | API (Discord API) + Bot | App: 806M downloads | Community management, team communication |

**Country-specific:**

| # | Service | Country | URL | Notes |
|---|---------|---------|-----|-------|
| 18 | VK (VKontakte) | RU/EU-East | vk.com | Russia's dominant social network (#35 global) |
| 19 | LINE | JP | line.me | Japan's dominant messaging + social platform |
| 20 | Mixi | JP | mixi.jp | Japanese social network (niche) |

**Priority packs:** LinkedIn (Recruitment + Marketing), Instagram (Marketing), X (Monitoring), Facebook (Ad management), TikTok (Marketing).

---

## CATEGORY 3: MESSAGING & COMMUNICATION

| # | Service | URL/App | Interaction | Global Rank | Use Cases |
|---|---------|---------|-------------|-------------|-----------|
| 21 | WhatsApp | whatsapp.com | API (WhatsApp Business API) | #9 (2.7B) | Business messaging, customer communication |
| 22 | Telegram | t.me | API (Telegram Bot API) | #39 | Channel management, notifications, bot integration |
| 23 | Slack | slack.com | API + MCP (available) | Business essential | Team communication, notifications, workflow integration |
| 24 | Microsoft Teams | teams.microsoft.com | API (Microsoft Graph) + MCP (planned) | Business essential | Enterprise communication, meeting scheduling |
| 25 | Gmail | gmail.com | API (Gmail API) + MCP (available) | Part of Google (#1) | Email automation, inbox management |
| 26 | Outlook | outlook.com / live.com | API (Microsoft Graph) | #24 | Email automation, calendar integration |
| 27 | Zoom | zoom.us | API (Zoom API) | Business essential | Meeting scheduling, webinar management |

**Priority packs:** Slack (MCP-first), Gmail (MCP-first), Teams, WhatsApp Business.

---

## CATEGORY 4: E-COMMERCE & MARKETPLACES

*For Marketing missions (product research, competitor monitoring) and Life missions (shopping, deal finding).*

| # | Service | URL | Interaction | Global Rank | Notes |
|---|---------|-----|-------------|-------------|-------|
| 28 | Amazon | amazon.com | API (Product Advertising API) + Browser | #15 | Global marketplace, product research |
| 29 | eBay | ebay.com | API (eBay API) | #46 | Marketplace, price comparison |
| 30 | Temu | temu.com | Browser | #22 | Fast-growing discount marketplace |
| 31 | SHEIN | shein.com | Browser | Top 30 | Fast fashion, trend-driven |
| 32 | AliExpress | aliexpress.com | Browser + API | Top 50 | B2C cross-border |
| 33 | Etsy | etsy.com | API (Etsy API) | Top 50 | Handmade/vintage marketplace |

**Country-specific e-commerce (critical — each country has dominant local players):**

| # | Service | Country | URL | Notes |
|---|---------|---------|-----|-------|
| 34 | Blocket | SE | blocket.se | Sweden's #1 classifieds (10.6 pages/visit — highest engagement in SE) |
| 35 | Tradera | SE | tradera.se | Swedish auction/marketplace |
| 36 | CDON | SE | cdon.se | Nordic marketplace |
| 37 | Leboncoin | FR | leboncoin.fr | France's #1 classifieds |
| 38 | Cdiscount | FR | cdiscount.com | French e-commerce leader |
| 39 | Fnac | FR | fnac.com | French electronics/media |
| 40 | Kleinanzeigen | DE | kleinanzeigen.de | Germany's #1 classifieds (formerly eBay Kleinanzeigen) |
| 41 | Otto | DE | otto.de | Germany's #2 e-commerce after Amazon |
| 42 | Zalando | DE/EU | zalando.de | European fashion marketplace |
| 43 | Subito | IT | subito.it | Italy's #1 classifieds |
| 44 | Amazon.it | IT | amazon.it | Italy's dominant e-commerce |
| 45 | Gumtree / eBay UK | GB | gumtree.com / ebay.co.uk | UK classifieds and marketplace |
| 46 | ASOS | GB | asos.com | UK fashion marketplace |
| 47 | Rakuten | JP | rakuten.co.jp | Japan's #2 marketplace after Amazon JP |
| 48 | Mercari | JP | mercari.com | Japanese C2C marketplace |
| 49 | Wallapop | ES | wallapop.com | Spain's #1 classifieds |
| 50 | Marktplaats | NL | marktplaats.nl | Netherlands #1 classifieds |
| 51 | Bol.com | NL | bol.com | Netherlands/Belgium marketplace leader |
| 52 | Flipkart | IN | flipkart.com | India's #2 e-commerce (Walmart-owned) |
| 53 | Meesho | IN | meesho.com | India social commerce |

**Priority packs:** Amazon (API-first), country-specific classifieds (Blocket, Leboncoin, Kleinanzeigen, Subito, Marktplaats — Browser packs).

---

## CATEGORY 5: ADVERTISING PLATFORMS

*Essential for Online Marketing missions.*

| # | Service | URL | Interaction | Use Cases |
|---|---------|-----|-------------|-----------|
| 54 | Google Ads | ads.google.com | API (Google Ads API) + Browser | Campaign management, budget optimisation, keyword research |
| 55 | Meta Business Suite | business.facebook.com | API (Marketing API) + Browser | Facebook/Instagram ad management |
| 56 | LinkedIn Campaign Manager | linkedin.com/campaignmanager | API + Browser | B2B advertising |
| 57 | TikTok Ads Manager | ads.tiktok.com | API + Browser | Short-form video advertising |
| 58 | Google Analytics | analytics.google.com | API (GA4 API) | Performance tracking, audience insights |
| 59 | Google Search Console | search.google.com/search-console | API | SEO monitoring, search performance |

**Priority packs:** Google Ads (API + Browser), Meta Business (API + Browser), Google Analytics (API).

---

## CATEGORY 6: CRM & BUSINESS TOOLS

| # | Service | URL | Interaction | Use Cases |
|---|---------|-----|-------------|-----------|
| 60 | Salesforce | salesforce.com | API + MCP (available) | CRM, sales pipeline, customer management |
| 61 | HubSpot | hubspot.com | API (HubSpot API) | CRM, marketing automation, email sequences |
| 62 | Pipedrive | pipedrive.com | API | Sales pipeline management |
| 63 | Monday.com | monday.com | API | Project management, workflow automation |
| 64 | Jira | atlassian.net/jira | API + MCP (available) | Issue tracking, sprint management |
| 65 | Asana | asana.com | API + MCP (available) | Task management, project planning |
| 66 | Notion | notion.so | API | Knowledge management, documentation |
| 67 | Trello | trello.com | API | Kanban project management |

**Priority packs:** HubSpot (API), Salesforce (MCP), Jira (MCP), Asana (MCP).

---

## CATEGORY 7: RECRUITMENT & JOB PLATFORMS

*Critical for the Talent Discovery & Recruitment mission template.*

| # | Service | URL | Interaction | Country | Notes |
|---|---------|-----|-------------|---------|-------|
| 68 | LinkedIn Jobs | linkedin.com/jobs | API + Browser | Global | Primary professional recruitment |
| 69 | Indeed | indeed.com | Browser + API | Global | #1 job aggregator |
| 70 | Glassdoor | glassdoor.com | Browser | Global | Employer reviews, salary data |
| 71 | Arbetsförmedlingen | arbetsformedlingen.se | Browser | SE | Swedish public employment service |
| 72 | Jobbsafari | jobbsafari.se | Browser | SE | Swedish job board |
| 73 | Pôle Emploi / France Travail | francetravail.fr | Browser | FR | French public employment service |
| 74 | StepStone | stepstone.de | Browser | DE | Germany's leading job board |
| 75 | InfoJobs | infojobs.it / infojobs.net | Browser | IT/ES | Italy and Spain job boards |
| 76 | Reed | reed.co.uk | Browser | GB | UK job board |
| 77 | Naukri | naukri.com | Browser | IN | India's #1 job portal |
| 78 | Rikunabi / MyNavi | rikunabi.com / mynavi.jp | Browser | JP | Japan's major job platforms |

**Priority packs:** LinkedIn Jobs (extends LinkedIn pack), Indeed, country-specific public employment services.

---

## CATEGORY 8: GOVERNMENT & REGULATORY PORTALS

*Critical for Compliance, Regulatory Monitoring, and Civic missions. These almost never have APIs — Browser packs essential.*

| # | Service | Country | URL | Use Cases |
|---|---------|---------|-----|-----------|
| 79 | EUR-Lex | EU | eur-lex.europa.eu | EU legislation, regulatory texts (has SPARQL API) |
| 80 | EBA | EU | eba.europa.eu | Banking authority consultations, guidelines |
| 81 | ESMA | EU | esma.europa.eu | Securities authority, MiFID, DORA |
| 82 | AMLA | EU | amla.europa.eu | AML authority (new, monitoring needed) |
| 83 | Bolagsverket | SE | bolagsverket.se | Swedish company registry |
| 84 | Finansinspektionen | SE | fi.se | Swedish financial supervisory authority |
| 85 | Skatteverket | SE | skatteverket.se | Swedish tax authority |
| 86 | INPI / Légifrance | FR | legifrance.gouv.fr | French law database |
| 87 | AMF (Autorité des Marchés Financiers) | FR | amf-france.org | French financial regulator |
| 88 | BaFin | DE | bafin.de | German financial supervisory authority |
| 89 | Handelsregister | DE | handelsregister.de | German company registry |
| 90 | Banca d'Italia / CONSOB | IT | bancaditalia.it / consob.it | Italian financial regulators |
| 91 | Companies House | GB | companieshouse.gov.uk | UK company registry (has API) |
| 92 | FCA | GB | fca.org.uk | UK financial conduct authority |
| 93 | GOV.UK | GB | gov.uk | UK government services hub |
| 94 | FSA Japan | JP | fsa.go.jp | Japanese financial services agency |
| 95 | CNMV | ES | cnmv.es | Spanish securities regulator |
| 96 | Agencia Tributaria | ES | agenciatributaria.es | Spanish tax authority |
| 97 | KVK (Kamer van Koophandel) | NL | kvk.nl | Dutch chamber of commerce |
| 98 | DNB (De Nederlandsche Bank) | NL | dnb.nl | Dutch central bank / regulator |
| 99 | AFM | NL | afm.nl | Dutch financial markets authority |
| 100 | RBI (Reserve Bank of India) | IN | rbi.org.in | Indian central bank |
| 101 | MCA (Ministry of Corporate Affairs) | IN | mca.gov.in | Indian company registry |
| 102 | SEBI | IN | sebi.gov.in | Indian securities regulator |

**Priority packs:** EUR-Lex (API + Browser), Companies House (API), Bolagsverket, EBA, BaFin, FCA.

---

## CATEGORY 9: NEWS & MEDIA

*For News Intelligence, Competitor Monitoring, and Media Tracking missions.*

| # | Service | URL | Interaction | Country | Notes |
|---|---------|-----|-------------|---------|-------|
| 103 | Wikipedia | wikipedia.org | API (MediaWiki API) | Global | Research, fact-checking |
| 104 | Reuters | reuters.com | Browser | Global | Business news |
| 105 | Bloomberg | bloomberg.com | Browser + API (Terminal) | Global | Financial news and data |
| 106 | Aftonbladet | aftonbladet.se | Browser | SE | Sweden's #1 news site (#3 in SE, 57.7M visits) |
| 107 | Expressen | expressen.se | Browser | SE | Sweden's #2 tabloid |
| 108 | SVT | svt.se | Browser | SE | Swedish public broadcaster |
| 109 | DN (Dagens Nyheter) | dn.se | Browser | SE | Sweden's leading quality daily |
| 110 | Le Monde | lemonde.fr | Browser | FR | France's leading newspaper |
| 111 | Le Figaro | lefigaro.fr | Browser | FR | French conservative daily |
| 112 | Spiegel | spiegel.de | Browser | DE | Germany's leading news magazine |
| 113 | Bild | bild.de | Browser | DE | Germany's highest-circulation newspaper |
| 114 | Corriere della Sera | corriere.it | Browser | IT | Italy's leading newspaper |
| 115 | La Repubblica | repubblica.it | Browser | IT | Italy's #2 newspaper |
| 116 | BBC | bbc.co.uk | Browser | GB | UK's dominant news source |
| 117 | The Guardian | theguardian.com | Browser | GB | UK quality broadsheet |
| 118 | NHK | nhk.or.jp | Browser | JP | Japan's public broadcaster |
| 119 | El País | elpais.com | Browser | ES | Spain's leading newspaper |
| 120 | NOS | nos.nl | Browser | NL | Dutch public broadcaster |
| 121 | De Telegraaf | telegraaf.nl | Browser | NL | Netherlands' largest newspaper |
| 122 | NDTV | ndtv.com | Browser | IN | India's leading English news |
| 123 | Times of India | timesofindia.indiatimes.com | Browser | IN | India's largest English newspaper |

**Priority packs:** Reuters, BBC, plus top news site per target country.

---

## CATEGORY 10: FINANCE & BANKING

*For Finance missions, market monitoring, and personal finance management.*

| # | Service | URL | Interaction | Country | Notes |
|---|---------|-----|-------------|---------|-------|
| 124 | Klarna | klarna.com | Browser | SE/Global | BNPL, payments (#1 finance site in SE) |
| 125 | Nordea | nordea.com | Browser | SE/Nordics | Major Nordic bank |
| 126 | SEB | seb.se | Browser | SE | Major Swedish bank |
| 127 | Swedbank | swedbank.se | Browser | SE | Major Swedish bank |
| 128 | Avanza | avanza.se | Browser + API | SE | Sweden's leading investment platform |
| 129 | Nordnet | nordnet.se | Browser | SE/Nordics | Nordic investment platform |
| 130 | BNP Paribas | bnpparibas.com | Browser | FR | France's largest bank |
| 131 | Deutsche Bank | db.com | Browser | DE | Germany's largest bank |
| 132 | UniCredit | unicredit.it | Browser | IT | Italy's largest bank |
| 133 | Barclays / HSBC | barclays.co.uk / hsbc.co.uk | Browser | GB | UK major banks |
| 134 | MUFG / Mizuho | mufg.jp / mizuhobank.co.jp | Browser | JP | Japan's megabanks |
| 135 | BBVA / Santander | bbva.es / santander.es | Browser | ES | Spain's major banks |
| 136 | ING / ABN AMRO | ing.nl / abnamro.nl | Browser | NL | Dutch major banks |
| 137 | SBI / HDFC | sbi.co.in / hdfcbank.com | Browser | IN | India's largest banks |
| 138 | PhonePe | phonepe.com | App only | IN | India's #1 finance app (95M downloads) |
| 139 | PayPal | paypal.com | API (PayPal API) | Global | Payment processing |
| 140 | Wise (TransferWise) | wise.com | API (Wise API) | Global | International transfers |
| 141 | Stripe | stripe.com | API (Stripe API) | Global | Payment infrastructure |

**Priority packs:** Avanza (SE investor tool), PayPal (API), Stripe (API), Klarna.

---

## CATEGORY 11: TRAVEL & BOOKING

| # | Service | URL | Interaction | Notes |
|---|---------|-----|-------------|-------|
| 142 | Booking.com | booking.com | API (Affiliate API) + Browser | #1 hotel booking globally |
| 143 | Airbnb | airbnb.com | Browser | Accommodation (66M app downloads) |
| 144 | Google Flights | google.com/flights | Browser | Flight search and comparison |
| 145 | Skyscanner | skyscanner.com | API + Browser | Flight aggregator |
| 146 | Uber | uber.com | API (Uber API) | Ride-hailing (#1 travel app, 137M downloads) |
| 147 | Google Maps | google.com/maps | API (Maps/Places API) | Location services, directions, reviews |
| 148 | Tripadvisor | tripadvisor.com | API + Browser | Reviews, restaurant/hotel research |
| 149 | SJ | sj.se | Browser | SE: Swedish rail |
| 150 | SNCF | sncf-connect.com | Browser + App | FR: French rail |
| 151 | Deutsche Bahn | bahn.de | Browser + App | DE: German rail |
| 152 | Trenitalia | trenitalia.com | Browser + App | IT: Italian rail |
| 153 | National Rail | nationalrail.co.uk | Browser | GB: UK rail |
| 154 | JR (Japan Railways) | jreast.co.jp | Browser | JP: Japanese rail |
| 155 | Renfe | renfe.com | Browser | ES: Spanish rail |
| 156 | NS (Nederlandse Spoorwegen) | ns.nl | Browser | NL: Dutch rail |
| 157 | IRCTC | irctc.co.in | Browser | IN: Indian rail (massive scale) |

**Priority packs:** Booking.com, Google Flights, country-specific rail services.

---

## CATEGORY 12: PRODUCTIVITY & AI TOOLS

| # | Service | URL | Interaction | Notes |
|---|---------|-----|-------------|-------|
| 158 | ChatGPT | chatgpt.com | API (OpenAI API) | #5 globally (6.2B visits). Competitor monitoring. |
| 159 | Google Workspace | workspace.google.com | API (Google Workspace APIs) + MCP | Docs, Sheets, Slides, Drive, Calendar |
| 160 | Microsoft 365 | office.com | API (Microsoft Graph) | Word, Excel, PowerPoint, OneDrive |
| 161 | Canva | canva.com | API (Canva API) + Browser | Design, presentations, social media graphics |
| 162 | Notion | notion.so | API (Notion API) | Knowledge management, wikis |
| 163 | Google Drive | drive.google.com | API + MCP (available) | File storage, document management |
| 164 | Dropbox | dropbox.com | API (Dropbox API) | File storage and sharing |
| 165 | GitHub | github.com | API (GitHub API) + MCP (available) | Code hosting, CI/CD, issue tracking |

**Priority packs:** Google Workspace (MCP), Microsoft 365 (API), GitHub (MCP), Canva.

---

## CATEGORY 13: CONTENT & STREAMING

| # | Service | URL | Interaction | Notes |
|---|---------|-----|-------------|-------|
| 166 | YouTube | youtube.com | API (YouTube Data API) | #2 globally. Content posting, analytics, research |
| 167 | Spotify | spotify.com | API (Spotify Web API) | Music/podcast analytics (#1 entertainment app) |
| 168 | Netflix | netflix.com | Browser | #20 globally. Competitor/content monitoring |
| 169 | WordPress | wordpress.com / wp-admin | API (WordPress REST API) + Browser | Blog/website management |
| 170 | Medium | medium.com | Browser | Content publishing |

**Priority packs:** YouTube (API — essential for Marketing missions), WordPress (API), Spotify (API for podcast analytics).

---

## CATEGORY 14: EDUCATION

| # | Service | URL | Interaction | Notes |
|---|---------|-----|-------------|-------|
| 171 | Duolingo | duolingo.com | App + Browser | #1 education app (921M downloads) |
| 172 | Khan Academy | khanacademy.org | Browser | Free education platform |
| 173 | Coursera | coursera.org | Browser + API | Online courses, certifications |
| 174 | 1177 Vårdguiden | 1177.se | Browser | SE: Swedish healthcare information (top 5 news in SE) |

---

## CATEGORY 15: HEALTH & WELLBEING

| # | Service | URL | Interaction | Notes |
|---|---------|-----|-------------|-------|
| 175 | Flo | flo.health | App | #1 health app (52M downloads) |
| 176 | Strava | strava.com | API (Strava API) | Fitness tracking (50M downloads) |
| 177 | MyFitnessPal | myfitnesspal.com | API | Nutrition tracking |

---

## CATEGORY 16: DATA PROVIDERS & BUSINESS INTELLIGENCE

*For Competitor Intelligence, Due Diligence, and Research missions.*

| # | Service | URL | Interaction | Notes |
|---|---------|-----|-------------|-------|
| 178 | Dow Jones / Factiva | dowjones.com | API (partnership target) | Risk data, news intelligence |
| 179 | Roaring | roaring.io | API (partnership target) | Nordic company data |
| 180 | Crunchbase | crunchbase.com | API | Startup/company intelligence |
| 181 | Statista | statista.com | Browser | Statistics and market data |
| 182 | Similarweb | similarweb.com | API (Similarweb API) | Website traffic analytics |

---

## SUMMARY: SERVICE PACK BUILD PRIORITY

### Wave 1 — Ship with Missions v0.7.0 (5 packs)

| Pack | Category | Interaction | Rationale |
|------|----------|-------------|-----------|
| LinkedIn | Social/Recruitment | Browser + API | Recruitment + Marketing missions |
| EUR-Lex | Government/Regulatory | API + Browser | Compliance missions |
| Google Search | Search | API | Every research task |
| Google Ads | Advertising | API + Browser | Marketing missions |
| HubSpot | CRM | API | Sales/marketing missions |

### Wave 2 — Ship with v0.7.5 (10 packs)

| Pack | Category | Interaction | Rationale |
|------|----------|-------------|-----------|
| Instagram | Social | API + Browser | Marketing missions |
| X (Twitter) | Social | API | Monitoring missions |
| Meta Business Suite | Advertising | API + Browser | Advertising missions |
| Indeed | Recruitment | Browser | Recruitment missions |
| Booking.com | Travel | Browser | Travel planning missions |
| Wikipedia | Research | API | Knowledge retrieval |
| YouTube | Content | API | Marketing + research |
| Gmail | Communication | MCP | Email automation |
| Slack | Communication | MCP | Team notifications |
| Companies House (UK) | Government | API | Due diligence |

### Wave 3 — Country-Specific (15 packs, community-driven)

| Pack | Country | Category | Rationale |
|------|---------|----------|-----------|
| Bolagsverket | SE | Government | Swedish company registry |
| Aftonbladet | SE | News | Swedish news monitoring |
| Blocket | SE | E-commerce | Swedish classifieds |
| Avanza | SE | Finance | Swedish investment platform |
| Leboncoin | FR | E-commerce | French classifieds |
| Kleinanzeigen | DE | E-commerce | German classifieds |
| BaFin | DE | Government | German regulator |
| Subito | IT | E-commerce | Italian classifieds |
| FCA | GB | Government | UK regulator |
| EBA | EU | Government | EU banking authority |
| Marktplaats | NL | E-commerce | Dutch classifieds |
| Bol.com | NL | E-commerce | Dutch marketplace |
| Flipkart | IN | E-commerce | Indian marketplace |
| Rakuten | JP | E-commerce | Japanese marketplace |
| Wallapop | ES | E-commerce | Spanish classifieds |

### Wave 4+ — Community Expansion (ongoing)

Country-specific rail services, national news sites, banking portals, local job boards, regional advertising platforms. Community contributors maintain and update packs. Self-healing proposals keep packs fresh as sites evolve.

---

## CLAUDE CODE INSTRUCTIONS

When building Service Packs from this map:

1. **Start with API-first services** (Google, HubSpot, YouTube, GitHub) — these are most reliable and don't need Playwright
2. **Then build Browser packs** for high-value services without good APIs (LinkedIn posting, EUR-Lex navigation, Indeed job posting)
3. **For each pack, create:**
   - `service_info` block with auth type, base URLs, rate limits
   - `pages` block mapping key pages with CSS selectors
   - `workflows` block defining common multi-step interactions
   - `known_issues` block (empty initially, populated through use)
   - `fallback_hints` block giving the LLM guidance for when selectors break
4. **Test each pack** against the live service before shipping — verify all selectors work
5. **Group packs by category** in the file system: `data/service-packs/{category}/{service-id}.json`
6. **Register built-in packs** in the `service_packs` table with `is_builtin = 1`
7. **Export as `.anton` packages** (type: `service_pack`) so they can be shared via marketplace

**Total services mapped: 182 across 16 categories, covering 10 countries + EU institutions.**

---

**END OF SERVICE PACK MAP**
