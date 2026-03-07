/**
 * Roaring API Connector — Swedish company registry, UBO, PEP/sanctions screening
 * Docs: https://www.roaring.io/developer
 *
 * Mock layer: if ROARING_API_KEY is not set, returns structured mock data labelled
 * "source": "mock_demo_data". Structurally identical to real API responses.
 */

const ROARING_BASE = 'https://api.roaring.io/v2';
const MAX_RETRIES = 3;

// ── TypeScript Interfaces ──────────────────────────────────────────────────────

export interface RoaringCompany {
  orgNumber: string;
  name: string;
  registrationDate: string;
  status: 'ACTIVE' | 'DISSOLVED' | 'LIQUIDATION' | 'SUSPENDED';
  legalForm: string;
  address: { street: string; postalCode: string; city: string; country: string };
  county: string;
  municipality: string;
  sniCode?: string;
  sniDescription?: string;
}

export interface UBONode {
  name: string;
  personalIdMasked?: string;
  ownershipPct: number;
  controlType: 'DIRECT_OWNERSHIP' | 'INDIRECT_OWNERSHIP' | 'CONTROL_OTHER';
  isDirectOwner: boolean;
  nationality?: string;
  isPEP?: boolean;
  children: UBONode[];
}

export interface UBOChain {
  rootEntity: string;
  totalUBOs: number;
  highRiskFlags: string[];
  chain: UBONode[];
  complexityScore: number; // 1-5, higher = more complex/opaque
}

export interface BoardMember {
  name: string;
  role: string;
  appointedDate: string;
  personalIdMasked?: string;
  pepFlag: boolean;
  sanctionsFlag: boolean;
}

export interface SanctionsHit {
  listName: string;
  listType: 'EU' | 'UN' | 'OFAC' | 'NATIONAL';
  entityName: string;
  matchStrength: 'EXACT' | 'STRONG' | 'PARTIAL';
  listEntry: string;
  dateAdded: string;
}

export interface SanctionsScreenResult {
  screened: string[];
  hits: SanctionsHit[];
  clearCount: number;
  hitCount: number;
  screenedAt: string;
}

export interface FinancialRisk {
  revenueband: string;
  creditRating: 'A' | 'B' | 'C' | 'D';
  paymentRemarks: number;
  revenueChange2y: number; // percentage
  employeeCount?: number;
  lastReportDate: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RoaringEntityProfile {
  company: RoaringCompany;
  uboChain: UBOChain;
  boardMembers: BoardMember[];
  sanctions: SanctionsScreenResult;
  financialRisk: FinancialRisk;
  riskScore: number; // 0-100
  riskRationale: string;
  source: 'live' | 'mock_demo_data';
  fetchedAt: string;
}

export interface BatchScreenResult {
  totalEntities: number;
  completed: number;
  results: Array<{ orgNumber: string; entityName: string; riskScore: number; hitCount: number }>;
  processedAt: string;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

function getMockCompany(query: string): RoaringCompany {
  return {
    orgNumber: query.match(/^\d{6}-\d{4}$/) ? query : '556123-4567',
    name: query.match(/^\d{6}-\d{4}$/) ? 'Acme Holdings AB' : query,
    registrationDate: '2015-03-12',
    status: 'ACTIVE',
    legalForm: 'Aktiebolag (AB)',
    address: { street: 'Strandvägen 7B', postalCode: '114 56', city: 'Stockholm', country: 'SE' },
    county: 'Stockholms län',
    municipality: 'Stockholms kommun',
    sniCode: '64190',
    sniDescription: 'Other monetary intermediation',
  };
}

function getMockUBOChain(rootEntity: string): UBOChain {
  return {
    rootEntity,
    totalUBOs: 2,
    highRiskFlags: ['UBO_IS_PEP', 'INDIRECT_OWNERSHIP_STRUCTURE'],
    chain: [
      {
        name: 'Panama Holdings Ltd',
        ownershipPct: 67,
        controlType: 'INDIRECT_OWNERSHIP',
        isDirectOwner: true,
        isPEP: false,
        children: [
          {
            name: 'John Smith',
            personalIdMasked: '197X-XX-XXXX',
            ownershipPct: 100,
            controlType: 'DIRECT_OWNERSHIP',
            isDirectOwner: false,
            nationality: 'SE',
            isPEP: true,
            children: [],
          },
        ],
      },
      {
        name: 'Nordic Capital Fund III',
        ownershipPct: 33,
        controlType: 'DIRECT_OWNERSHIP',
        isDirectOwner: true,
        isPEP: false,
        children: [],
      },
    ],
    complexityScore: 3,
  };
}

function getMockBoardMembers(): BoardMember[] {
  return [
    { name: 'John Smith', role: 'Chairman', appointedDate: '2019-05-01', personalIdMasked: '197X-XX-XXXX', pepFlag: true, sanctionsFlag: false },
    { name: 'Maria Lindqvist', role: 'CEO', appointedDate: '2020-01-15', pepFlag: false, sanctionsFlag: false },
    { name: 'Anders Bergström', role: 'Board Member', appointedDate: '2021-03-10', pepFlag: false, sanctionsFlag: false },
  ];
}

function getMockSanctionsScreen(): SanctionsScreenResult {
  return {
    screened: ['EU_CONSOLIDATED', 'UN_CONSOLIDATED', 'OFAC_SDN', 'SE_FI_SANCTIONS'],
    hits: [],
    clearCount: 4,
    hitCount: 0,
    screenedAt: new Date().toISOString(),
  };
}

function getMockFinancialRisk(): FinancialRisk {
  return {
    revenueband: '10M-50M SEK',
    creditRating: 'B',
    paymentRemarks: 0,
    revenueChange2y: -12.4,
    employeeCount: 28,
    lastReportDate: '2024-06-30',
    riskLevel: 'MEDIUM',
  };
}

function buildMockEntityProfile(query: string): RoaringEntityProfile {
  const company = getMockCompany(query);
  const uboChain = getMockUBOChain(company.name);
  const boardMembers = getMockBoardMembers();
  const sanctions = getMockSanctionsScreen();
  const financialRisk = getMockFinancialRisk();

  // Risk score calculation
  let score = 25; // baseline
  if (uboChain.highRiskFlags.includes('UBO_IS_PEP')) score += 30;
  if (uboChain.complexityScore > 2) score += 15;
  if (financialRisk.riskLevel === 'MEDIUM') score += 10;
  if (financialRisk.revenueChange2y < -10) score += 8;

  return {
    company,
    uboChain,
    boardMembers,
    sanctions,
    financialRisk,
    riskScore: Math.min(score, 100),
    riskRationale: 'UBO John Smith is classified as a T2 PEP (former Municipal Councillor). Indirect ownership structure via offshore entity adds complexity. Revenue declining two consecutive years elevates financial risk.',
    source: 'mock_demo_data',
    fetchedAt: new Date().toISOString(),
  };
}

// ── API Helpers ────────────────────────────────────────────────────────────────

async function roaringFetch(path: string, attempt = 1): Promise<unknown> {
  const apiKey = process.env.ROARING_API_KEY;
  if (!apiKey) throw new Error('ROARING_API_KEY not set');

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    const res = await fetch(`${ROARING_BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await delay(Math.pow(2, attempt) * 1000);
        return roaringFetch(path, attempt + 1);
      }
      throw new Error(`Roaring API ${res.status}: ${res.statusText}`);
    }
    return res.json();
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await delay(Math.pow(2, attempt) * 500);
      return roaringFetch(path, attempt + 1);
    }
    throw err;
  }
}

function isMockMode(): boolean {
  return !process.env.ROARING_API_KEY;
}

// ── Public API Functions ───────────────────────────────────────────────────────

export async function lookupCompany(query: string, type: 'orgNumber' | 'name'): Promise<RoaringCompany> {
  if (isMockMode()) return getMockCompany(query);

  const endpoint = type === 'orgNumber'
    ? `/company/${encodeURIComponent(query)}`
    : `/company/search?name=${encodeURIComponent(query)}&limit=1`;

  const data = await roaringFetch(endpoint) as { company?: RoaringCompany; results?: RoaringCompany[] };
  return data.company ?? (data.results?.[0]) ?? getMockCompany(query);
}

export async function getBeneficialOwners(orgNumber: string): Promise<UBOChain> {
  if (isMockMode()) return getMockUBOChain(orgNumber);

  const data = await roaringFetch(`/company/${encodeURIComponent(orgNumber)}/beneficial-owners`) as UBOChain;
  return data;
}

export async function getBoardMembers(orgNumber: string): Promise<BoardMember[]> {
  if (isMockMode()) return getMockBoardMembers();

  const data = await roaringFetch(`/company/${encodeURIComponent(orgNumber)}/board`) as { members: BoardMember[] };
  return data.members ?? [];
}

export async function screenEntity(orgNumber: string): Promise<SanctionsScreenResult> {
  if (isMockMode()) return getMockSanctionsScreen();

  const data = await roaringFetch(`/company/${encodeURIComponent(orgNumber)}/sanctions-screen`) as SanctionsScreenResult;
  return data;
}

export async function batchScreen(orgNumbers: string[]): Promise<BatchScreenResult> {
  if (isMockMode()) {
    return {
      totalEntities: orgNumbers.length,
      completed: orgNumbers.length,
      results: orgNumbers.map(n => ({ orgNumber: n, entityName: `Mock Entity ${n}`, riskScore: Math.floor(Math.random() * 60), hitCount: 0 })),
      processedAt: new Date().toISOString(),
    };
  }

  const data = await roaringFetch('/company/batch-screen') as BatchScreenResult;
  return data;
}

export async function getFinancialSummary(orgNumber: string): Promise<FinancialRisk> {
  if (isMockMode()) return getMockFinancialRisk();

  const data = await roaringFetch(`/company/${encodeURIComponent(orgNumber)}/financial-risk`) as FinancialRisk;
  return data;
}

export async function buildEntityProfile(orgNumber: string): Promise<RoaringEntityProfile> {
  if (isMockMode()) return buildMockEntityProfile(orgNumber);

  const [company, uboChain, boardMembers, sanctions, financialRisk] = await Promise.all([
    lookupCompany(orgNumber, 'orgNumber'),
    getBeneficialOwners(orgNumber),
    getBoardMembers(orgNumber),
    screenEntity(orgNumber),
    getFinancialSummary(orgNumber),
  ]);

  let score = 20;
  if (uboChain.highRiskFlags.length > 0) score += uboChain.highRiskFlags.length * 15;
  if (sanctions.hitCount > 0) score += 40;
  if (boardMembers.some(m => m.pepFlag)) score += 20;
  if (financialRisk.riskLevel === 'HIGH') score += 15;

  const rationale = [
    sanctions.hitCount > 0 ? `${sanctions.hitCount} sanctions hit(s) found.` : null,
    uboChain.highRiskFlags.includes('UBO_IS_PEP') ? 'UBO classified as PEP.' : null,
    uboChain.complexityScore > 3 ? 'Complex ownership structure.' : null,
    financialRisk.riskLevel !== 'LOW' ? `Financial risk: ${financialRisk.riskLevel}.` : null,
  ].filter(Boolean).join(' ') || 'No significant risk flags identified.';

  return { company, uboChain, boardMembers, sanctions, financialRisk, riskScore: Math.min(score, 100), riskRationale: rationale, source: 'live', fetchedAt: new Date().toISOString() };
}

export function getConnectorStatus(): { mode: 'live' | 'mock'; apiKeySet: boolean } {
  return { mode: isMockMode() ? 'mock' : 'live', apiKeySet: !isMockMode() };
}

/** Build a prompt layer string for injection into FCP module system prompts */
export function buildRoaringLayer(profile: RoaringEntityProfile): string {
  const mode = profile.source === 'mock_demo_data' ? 'MOCK DEMO DATA' : 'Live';
  const lines = [
    `## ROARING ENTITY DATA [${mode}]`,
    `**Entity:** ${profile.company.name} (${profile.company.orgNumber})`,
    `**Status:** ${profile.company.status} | Registered: ${profile.company.registrationDate}`,
    `**Legal form:** ${profile.company.legalForm} | ${profile.company.municipality}`,
    '',
    `**Beneficial Ownership:** ${profile.uboChain.totalUBOs} UBO(s) | Complexity: ${profile.uboChain.complexityScore}/5`,
    profile.uboChain.highRiskFlags.length > 0 ? `**UBO Risk Flags:** ${profile.uboChain.highRiskFlags.join(', ')}` : '**UBO Risk Flags:** None',
    '',
    `**Sanctions Screening:** ${profile.sanctions.hitCount} hit(s) across ${profile.sanctions.screened.length} lists`,
    `**Board PEP flags:** ${profile.boardMembers.filter(m => m.pepFlag).length} of ${profile.boardMembers.length} members`,
    '',
    `**Financial Risk:** ${profile.financialRisk.riskLevel} | Credit rating: ${profile.financialRisk.creditRating}`,
    `**Revenue change (2y):** ${profile.financialRisk.revenueChange2y > 0 ? '+' : ''}${profile.financialRisk.revenueChange2y}%`,
    '',
    `**ANTON Risk Score:** ${profile.riskScore}/100`,
    `**Rationale:** ${profile.riskRationale}`,
  ];
  return lines.join('\n');
}
