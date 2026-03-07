/**
 * Dow Jones Risk & Compliance Connector
 * Global sanctions, PEP database, adverse media, SOE intelligence
 * API: https://api.dowjones.com/risk-compliance/v2/
 *
 * Mock layer: if DOWJONES_API_KEY is not set, returns structured mock data
 * labelled "source": "mock_demo_data". Structurally identical to real API responses.
 */

const DJ_BASE = 'https://api.dowjones.com/risk-compliance/v2';
const MAX_RETRIES = 3;

// ── TypeScript Interfaces ──────────────────────────────────────────────────────

export type DJListType = 'SANCTIONS' | 'PEP' | 'ADVERSE_MEDIA' | 'SOE' | 'ENFORCEMENT';
export type DJRiskScore = 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAR';
export type DJMatchStrength = 'EXACT' | 'STRONG' | 'PARTIAL';

export interface DJScreenParams {
  name: string;
  birthDate?: string;
  nationality?: string;
  orgNumber?: string;
  screeningLists?: string[];
}

export interface DJHit {
  listType: DJListType;
  matchStrength: DJMatchStrength;
  entityId: string;
  entityName: string;
  matchedName: string;
  sourceLists: string[];
  details: string;
  dateAdded: string;
  associatedEntities?: string[];
}

export interface DJScreenResult {
  entityQueried: string;
  screened: { sanctions: boolean; pep: boolean; adverseMedia: boolean; soe: boolean };
  hits: DJHit[];
  clearances: string[];
  riskScore: DJRiskScore;
  screenedAt: string;
  referenceId: string;
  source: 'live' | 'mock_demo_data';
}

export interface AdverseMediaArticle {
  headline: string;
  source: string;
  publishedAt: string;
  riskCategories: string[];
  summary: string;
  url?: string;
}

export interface AdverseMediaResult {
  entityName: string;
  totalArticles: number;
  articles: AdverseMediaArticle[];
  riskCategories: string[];
  fetchedAt: string;
  source: 'live' | 'mock_demo_data';
}

export interface PEPPosition {
  title: string;
  country: string;
  from: string;
  to?: string;
  organisation?: string;
}

export interface PEPProfile {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  positions: PEPPosition[];
  familyMembers: Array<{ name: string; relationship: string; pepFlag: boolean }>;
  associates: Array<{ name: string; relationship: string }>;
  adverseMedia: AdverseMediaResult;
  source: 'live' | 'mock_demo_data';
}

export interface SanctionsDetail {
  id: string;
  entityName: string;
  aliases: string[];
  sourceLists: string[];
  designationDate: string;
  designationReasons: string[];
  associatedEntities: string[];
  frozenAssets?: boolean;
  travelBan?: boolean;
  armsEmbargo?: boolean;
}

export interface MonitoringRegistration {
  id: string;
  entityId: string;
  entityName: string;
  connector: 'dowjones';
  registeredAt: string;
  status: 'active';
}

export interface MonitoringAlert {
  id: string;
  entityName: string;
  alertType: 'SANCTIONS_ADDED' | 'SANCTIONS_REMOVED' | 'PEP_DESIGNATION' | 'ADVERSE_MEDIA_NEW' | 'SOE_FLAG';
  details: Record<string, unknown>;
  createdAt: string;
  acknowledged: boolean;
}

export interface DJBatchResult {
  totalEntities: number;
  completed: number;
  results: Array<{
    entityName: string;
    riskScore: DJRiskScore;
    hitCount: number;
    referenceId: string;
  }>;
  processedAt: string;
  source: 'live' | 'mock_demo_data';
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

function mockReferenceId(): string {
  return `DJ-MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getMockScreenResult(entityName: string, includeHits = false): DJScreenResult {
  const hits: DJHit[] = includeHits ? [
    {
      listType: 'PEP',
      matchStrength: 'STRONG',
      entityId: 'PEP-SE-2019-0047',
      entityName: 'John Smith',
      matchedName: entityName,
      sourceLists: ['PEPDB_TIER2'],
      details: 'Former Municipal Councillor, City of Gothenburg, 2018-2022. Swedish Moderate Party.',
      dateAdded: '2019-01-15',
      associatedEntities: ['Acme Holdings AB', 'Panama Holdings Ltd'],
    },
  ] : [];

  return {
    entityQueried: entityName,
    screened: { sanctions: true, pep: true, adverseMedia: true, soe: false },
    hits,
    clearances: includeHits ? ['SANCTIONS', 'SOE'] : ['SANCTIONS', 'PEP', 'ADVERSE_MEDIA', 'SOE'],
    riskScore: includeHits ? 'HIGH' : 'CLEAR',
    screenedAt: new Date().toISOString(),
    referenceId: mockReferenceId(),
    source: 'mock_demo_data',
  };
}

function getMockAdverseMedia(entityName: string): AdverseMediaResult {
  return {
    entityName,
    totalArticles: 2,
    articles: [
      {
        headline: 'Swedish prosecutor opens fraud investigation into property developer',
        source: 'Svenska Dagbladet',
        publishedAt: '2024-11-14',
        riskCategories: ['Financial Crime', 'Fraud'],
        summary: 'Swedish prosecutors have opened a preliminary investigation into alleged fraud connected to a real estate development company in Stockholm. The company is alleged to have misrepresented asset values in investor communications.',
      },
      {
        headline: 'Nordic real estate company under scrutiny over opacity of ownership',
        source: 'Dagens Industri',
        publishedAt: '2024-09-03',
        riskCategories: ['Regulatory', 'Ownership Opacity'],
        summary: 'A series of Nordic real estate holding companies have come under scrutiny from financial intelligence units over opaque ownership structures and cross-border fund flows.',
      },
    ],
    riskCategories: ['Financial Crime', 'Fraud', 'Regulatory'],
    fetchedAt: new Date().toISOString(),
    source: 'mock_demo_data',
  };
}

function getMockPEPProfile(pepId: string): PEPProfile {
  return {
    id: pepId,
    name: 'John Smith',
    tier: 2,
    positions: [
      { title: 'Municipal Councillor', country: 'SE', from: '2018-01-01', to: '2022-12-31', organisation: 'City of Gothenburg' },
    ],
    familyMembers: [
      { name: 'Anna Smith', relationship: 'Spouse', pepFlag: false },
      { name: 'Michael Smith', relationship: 'Adult Child', pepFlag: false },
    ],
    associates: [
      { name: 'Panama Holdings Ltd', relationship: 'Corporate Interest' },
    ],
    adverseMedia: getMockAdverseMedia('John Smith'),
    source: 'mock_demo_data',
  };
}

function getMockSanctionsDetail(sanctionsId: string): SanctionsDetail {
  return {
    id: sanctionsId,
    entityName: 'Global Trade Partners LLC',
    aliases: ['GTP LLC', 'Global Trade Partners'],
    sourceLists: ['EU_CONSOLIDATED', 'OFAC_SDN'],
    designationDate: '2023-08-15',
    designationReasons: ['Circumvention of export controls', 'Support for sanctioned regime'],
    associatedEntities: ['Apex Commodities Ltd', 'TradeRoute International'],
    frozenAssets: true,
    travelBan: false,
    armsEmbargo: false,
  };
}

// ── API Helpers ────────────────────────────────────────────────────────────────

async function djFetch(path: string, method = 'GET', body?: unknown, attempt = 1): Promise<unknown> {
  const apiKey = process.env.DOWJONES_API_KEY;
  if (!apiKey) throw new Error('DOWJONES_API_KEY not set');

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    const res = await fetch(`${DJ_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await delay(Math.pow(2, attempt) * 1000);
        return djFetch(path, method, body, attempt + 1);
      }
      throw new Error(`Dow Jones API ${res.status}: ${res.statusText}`);
    }
    return res.json();
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await delay(Math.pow(2, attempt) * 500);
      return djFetch(path, method, body, attempt + 1);
    }
    throw err;
  }
}

function isMockMode(): boolean {
  return !process.env.DOWJONES_API_KEY;
}

// ── Public API Functions ───────────────────────────────────────────────────────

export async function screenEntity(params: DJScreenParams): Promise<DJScreenResult> {
  if (isMockMode()) {
    // Deterministically produce a PEP hit for "John Smith" or "Acme Holdings" to power demos
    const lowerName = params.name.toLowerCase();
    const includeHits = lowerName.includes('smith') || lowerName.includes('acme') || lowerName.includes('holdings');
    return getMockScreenResult(params.name, includeHits);
  }

  const data = await djFetch('/screen', 'POST', params) as DJScreenResult;
  return { ...data, source: 'live' };
}

export async function batchScreen(entities: DJScreenParams[]): Promise<DJBatchResult> {
  if (isMockMode()) {
    return {
      totalEntities: entities.length,
      completed: entities.length,
      results: entities.map(e => ({
        entityName: e.name,
        riskScore: 'CLEAR' as DJRiskScore,
        hitCount: 0,
        referenceId: mockReferenceId(),
      })),
      processedAt: new Date().toISOString(),
      source: 'mock_demo_data',
    };
  }

  const data = await djFetch('/batch', 'POST', { entities }) as DJBatchResult;
  return { ...data, source: 'live' };
}

export async function getEntityProfile(entityId: string): Promise<DJScreenResult> {
  if (isMockMode()) return getMockScreenResult(entityId, true);

  const data = await djFetch(`/entity/${encodeURIComponent(entityId)}`) as DJScreenResult;
  return { ...data, source: 'live' };
}

export async function searchAdverseMedia(entityName: string, dateRange?: { from: string; to: string }): Promise<AdverseMediaResult> {
  if (isMockMode()) return getMockAdverseMedia(entityName);

  const params = new URLSearchParams({ q: entityName });
  if (dateRange) { params.set('from', dateRange.from); params.set('to', dateRange.to); }
  const data = await djFetch(`/adverse-media?${params}`) as AdverseMediaResult;
  return { ...data, source: 'live' };
}

export async function getPEPProfile(pepId: string): Promise<PEPProfile> {
  if (isMockMode()) return getMockPEPProfile(pepId);

  const data = await djFetch(`/pep/${encodeURIComponent(pepId)}`) as PEPProfile;
  return { ...data, source: 'live' };
}

export async function getSanctionsDetail(sanctionsId: string): Promise<SanctionsDetail> {
  if (isMockMode()) return getMockSanctionsDetail(sanctionsId);

  const data = await djFetch(`/sanctions/${encodeURIComponent(sanctionsId)}`) as SanctionsDetail;
  return data;
}

export async function registerForMonitoring(entityId: string, _sessionId: string): Promise<MonitoringRegistration> {
  return {
    id: `mon-${Date.now()}`,
    entityId,
    entityName: entityId,
    connector: 'dowjones',
    registeredAt: new Date().toISOString(),
    status: 'active',
  };
}

export async function getMonitoringAlerts(_sessionId: string): Promise<MonitoringAlert[]> {
  if (isMockMode()) return [];

  const data = await djFetch(`/monitoring/alerts?sessionId=${encodeURIComponent(_sessionId)}`) as MonitoringAlert[];
  return data;
}

export async function getAvailableLists(): Promise<Array<{ id: string; name: string; type: DJListType; entityCount: number }>> {
  return [
    { id: 'sanctions_global', name: 'Global Consolidated Sanctions', type: 'SANCTIONS', entityCount: 92400 },
    { id: 'pep_all', name: 'Global PEP Database', type: 'PEP', entityCount: 1400000 },
    { id: 'adverse_media', name: 'Adverse Media Intelligence', type: 'ADVERSE_MEDIA', entityCount: 0 },
    { id: 'soe', name: 'State-Owned Entities', type: 'SOE', entityCount: 100000 },
    { id: 'enforcement', name: 'Regulatory Enforcement Actions', type: 'ENFORCEMENT', entityCount: 45000 },
    { id: 'ofac_sdn', name: 'OFAC SDN List', type: 'SANCTIONS', entityCount: 12300 },
    { id: 'eu_consolidated', name: 'EU Consolidated Sanctions', type: 'SANCTIONS', entityCount: 2800 },
    { id: 'un_consolidated', name: 'UN Consolidated Sanctions', type: 'SANCTIONS', entityCount: 840 },
  ];
}

export function getConnectorStatus(): { mode: 'live' | 'mock'; apiKeySet: boolean } {
  return { mode: isMockMode() ? 'mock' : 'live', apiKeySet: !isMockMode() };
}

/** Build a prompt layer string for injection into FCP module system prompts */
export function buildDJScreeningLayer(result: DJScreenResult, adverseMedia?: AdverseMediaResult): string {
  const mode = result.source === 'mock_demo_data' ? 'MOCK DEMO DATA' : 'Live';
  const riskIcon = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢', CLEAR: '✅' }[result.riskScore];

  const lines = [
    `## DOW JONES SCREENING DATA [${mode}]`,
    `**Entity:** ${result.entityQueried}`,
    `**Risk Score:** ${riskIcon} ${result.riskScore} | Reference: ${result.referenceId}`,
    `**Hits:** ${result.hits.length} | **Screened lists:** ${Object.entries(result.screened).filter(([, v]) => v).map(([k]) => k).join(', ')}`,
    '',
  ];

  if (result.hits.length > 0) {
    lines.push('**Screening Hits:**');
    for (const hit of result.hits) {
      lines.push(`- **${hit.listType}** (${hit.matchStrength} match): ${hit.entityName}`);
      lines.push(`  Sources: ${hit.sourceLists.join(', ')} | Added: ${hit.dateAdded}`);
      if (hit.details) lines.push(`  Details: ${hit.details}`);
    }
    lines.push('');
  } else {
    lines.push('**Screening Result:** No hits on any screened list.');
    lines.push('');
  }

  if (adverseMedia && adverseMedia.totalArticles > 0) {
    lines.push(`**Adverse Media:** ${adverseMedia.totalArticles} article(s) — Categories: ${adverseMedia.riskCategories.join(', ')}`);
    for (const article of adverseMedia.articles.slice(0, 3)) {
      lines.push(`- ${article.publishedAt}: "${article.headline}" (${article.source})`);
    }
    lines.push('');
  }

  lines.push(`**Regulatory context:** AMLR Art. 22 (PEP obligations), Art. 40 (EDD requirements), Art. 16 (ongoing monitoring)`);
  return lines.join('\n');
}
