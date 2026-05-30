// Patch for Phase 4 BOP (Base-of-Pyramid) areas
// Areas: trades, government-services, smallholder-farming, micro-business, workers-rights,
//        personal-finance-bop, credit-navigator, land-rights, consumer-rights,
//        community-health, education-literacy, food-business, artisan-craft, livestock-poultry
// Generated: 2026-02-23

import type { ModuleDefinition } from "../types";

// Government Services Navigator

export const GOVERNMENT_SERVICES_MODULES: ModuleDefinition[] = [
  {
    id: "complaint-against-official",
    label: "Complaint Against Government Official",
    shortLabel: "File Complaint",
    icon: "AlertCircle",
    description: "Report corrupt or abusive government officials. Safe ways to complain and protect yourself.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Official complaint channels by country: Kenya EACC, Nigeria ICPC/EFCC, Ghana CHRAJ, South Africa PSC/Public Protector, India CVC/Lokayukta, Philippines Ombudsman. Documentation guidance, safety considerations, whistleblower protection, NGO support options." },
      },
    },
  },
  {
    id: "corruption-reporting-guide",
    label: "Corruption Reporting Guide",
    shortLabel: "Report Corruption",
    icon: "Flag",
    description: "Where and how to report corruption safely. Report bribery, fraud, and abuse of power.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Corruption reporting channels by country: anti-corruption hotlines, anonymous online reporting, NGO intermediaries (Transparency International chapters), whistle-blower protection laws, evidence documentation guidance, media as last resort, international reporting for aid fraud (Global Fund, World Bank Integrity hotline)." },
      },
    },
  },
  {
    id: "court-process-demystifier",
    label: "Court Process Demystifier",
    shortLabel: "Court Guide",
    icon: "Scale",
    description: "Understand how courts work. What to expect when you have a court case — as plaintiff, defendant, or witness.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Court hierarchy and processes by country, magistrate court procedures, summons response, what to bring to court, legal aid access (Kenya Legal Aid Service, South Africa Legal Aid SA, India NALSA, Philippines PAO), statute of limitations, court etiquette and process demystified for non-lawyers." },
      },
    },
  },
  {
    id: "document-id-application",
    label: "Document & ID Application Helper",
    shortLabel: "Get Your ID",
    icon: "CreditCard",
    description: "How to get a birth certificate, national ID, or passport. Step-by-step by country.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Civil registration processes by country: birth certificates, national IDs, passports, voter registration, marriage certificates — Kenya, Nigeria, Ghana, Tanzania, Uganda, Ethiopia, South Africa, India, Bangladesh, Pakistan, Philippines. Required documents, official fees, processing times, late registration procedures." },
      },
    },
  },
  {
    id: "government-subsidy-finder",
    label: "Government Subsidy Finder",
    shortLabel: "Find Subsidies",
    icon: "Gift",
    description: "Find government support programs you qualify for. Cash transfers, food programs, housing support, and more.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Government social protection programs by country: Kenya HSNP, Inua Jamii, NGAAF; Nigeria CCT, TraderMoni, FarmerMoni; Ghana LEAP; South Africa SASSA grants; India PM Kisan, Ujjwala, Jan Dhan, MGNREGA; Bangladesh social safety net; Philippines 4Ps, TUPAD. Eligibility, registration, anti-fraud warnings." },
      },
    },
  },
  {
    id: "permit-license-guide",
    label: "Permit & License Application Guide",
    shortLabel: "Permits",
    icon: "FileText",
    description: "Apply for permits and licenses correctly. From business permits to construction to event licenses.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Permit and license application processes by country: business operating permits, construction permits, driving licences, event permits. Official fees, required documents, processing times, anti-bribery guidance. Kenya, Nigeria, Ghana, South Africa, India, Bangladesh, Pakistan, Philippines." },
      },
    },
  },
  {
    id: "social-protection-navigator",
    label: "Social Protection Navigator",
    shortLabel: "Social Protection",
    icon: "Heart",
    description: "Access social safety net programs. Emergency support, unemployment benefits, disability grants, and more.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Social protection programs by country and need: unemployment support (Kenya NITA, South Africa UIF, India MGNREGA), disability grants, elderly grants, child support programs, emergency food programs, NGO backup resources, appeal processes for rejected applications." },
      },
    },
  },
  {
    id: "voting-rights-process",
    label: "Voting Rights & Process Guide",
    shortLabel: "Voting Rights",
    icon: "CheckSquare",
    description: "Register to vote and exercise your voting rights. What you need, where to go, and how to vote.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Voter registration and voting processes by country: Kenya IEBC, Nigeria INEC, Ghana Electoral Commission, South Africa IEC, India ECI, Philippines COMELEC. Registration requirements, polling day process, voter rights, illegal activities, complaint mechanisms." },
      },
    },
  },
];

// Smallholder Farming

export const SMALLHOLDER_FARMING_MODULES: ModuleDefinition[] = [
  {
    id: "crop-planning-advisor",
    label: "Crop Planning & Rotation Advisor",
    shortLabel: "Crop Planning",
    icon: "Calendar",
    description: "What should I plant this season? Get advice on which crops suit your soil, climate and season — and how to rotate for soil health.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Seasonal crop calendars, rotation principles, intercropping, soil-crop matching for smallholder farming" },
      },
    },
  },
  {
    id: "market-price-guide",
    label: "Market Price & Negotiation Guide",
    shortLabel: "Market Prices",
    icon: "TrendingUp",
    description: "Am I getting a fair price? Learn how to check market prices, negotiate with traders, and decide when and where to sell for the best return.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Agricultural market pricing, seasonal price patterns, cooperative selling, negotiation strategies for smallholder farmers in developing regions" },
      },
    },
  },
  {
    id: "pest-disease-guide",
    label: "Pest & Disease Identification Guide",
    shortLabel: "Pest & Disease",
    icon: "Bug",
    description: "My plants look sick — what's wrong and how do I fix it? Identify pests and diseases from symptoms, and get affordable treatment options.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Crop pest and disease identification, symptoms, affordable treatments, prevention strategies for smallholder farming in developing regions" },
      },
    },
  },
  {
    id: "post-harvest-loss",
    label: "Post-Harvest Loss Prevention",
    shortLabel: "Post-Harvest",
    icon: "Package",
    description: "How do I store my harvest properly? Prevent losses from pests, mould, and bad storage — and keep produce fresh longer.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Post-harvest storage solutions, grain storage, PICS bags, hermetic storage, solar drying, food safety for smallholder farmers" },
      },
    },
  },
  {
    id: "soil-health-assessment",
    label: "Soil Health Assessment",
    shortLabel: "Soil Health",
    icon: "Layers",
    description: "Is my soil healthy? Simple tests you can do yourself to understand your soil and improve it without expensive lab tests.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Soil health assessment, simple field tests, composting, organic soil improvement, soil types and structure for smallholder farming" },
      },
    },
  },
  {
    id: "subsidy-navigator",
    label: "Government Subsidy Navigator",
    shortLabel: "Subsidies",
    icon: "BadgeDollarSign",
    description: "What government support is available for my farm? Find subsidies, input vouchers, loans, and training programs you may qualify for.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Government agricultural subsidies, input vouchers, farm loans, extension services by country including Kenya, Nigeria, Ghana, Tanzania, Uganda, Ethiopia, India, Bangladesh, Pakistan, Philippines" },
      },
    },
  },
  {
    id: "water-irrigation-management",
    label: "Water Management & Irrigation",
    shortLabel: "Water & Irrigation",
    icon: "Droplets",
    description: "How do I use water better? Get advice on irrigation methods, water conservation, and drought strategies for your farm size and water source.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Water conservation, low-cost irrigation, rainwater harvesting, drought management for smallholder farms in developing regions" },
      },
    },
  },
  {
    id: "weather-farming-decisions",
    label: "Weather-Based Farming Decisions",
    shortLabel: "Weather Decisions",
    icon: "Cloud",
    description: "How do I use weather forecasts to make better farming decisions? Understand weather information and adjust planting, irrigation, and harvesting accordingly.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Weather interpretation for farmers, seasonal forecasts, El Nino La Nina effects, critical crop growth stages, emergency weather responses for smallholder farming" },
      },
    },
  },
];

// Micro-Business

export const MICRO_BUSINESS_MODULES: ModuleDefinition[] = [
  {
    id: "business-growth-guide",
    label: "Business Growth & Scaling Guide",
    shortLabel: "Growth Planning",
    icon: "TrendingUp",
    description: "When and how should I expand my business? Get honest advice on whether your business is ready to grow — and what the first steps should be.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Business growth and scaling strategies for micro-businesses and informal entrepreneurs in developing economies" },
      },
    },
  },
  {
    id: "business-registration-guide",
    label: "Business Registration & Licensing Guide",
    shortLabel: "Registration",
    icon: "FileText",
    description: "Do I need to register my business? Get step-by-step guidance on registration, permits, and what you actually need vs. what you don't need yet.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Business registration requirements for micro-businesses in Kenya, Nigeria, Ghana, Tanzania, Uganda, India, Bangladesh, Pakistan, Philippines" },
      },
    },
  },
  {
    id: "customer-relationship-basics",
    label: "Customer Relationship Basics",
    shortLabel: "Customers",
    icon: "Users",
    description: "How do I keep customers coming back? Simple, proven ways to build loyal customers for your small business.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Customer retention and loyalty strategies for micro-businesses and informal traders in developing economies" },
      },
    },
  },
  {
    id: "inventory-management",
    label: "Inventory Management",
    shortLabel: "Stock Control",
    icon: "Package",
    description: "How do I manage my stock better? Simple systems to track what you have, avoid running out, and reduce waste.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Simple inventory and stock control methods for informal micro-businesses and market traders" },
      },
    },
  },
  {
    id: "pricing-profit-calculator",
    label: "Pricing & Profit Calculator",
    shortLabel: "Pricing Help",
    icon: "Calculator",
    description: "Am I charging the right price? Calculate your real costs (including your own time) and set a price that makes a profit.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Pricing strategies and cost calculation for informal micro-businesses" },
      },
    },
  },
  {
    id: "simple-bookkeeping",
    label: "Simple Bookkeeping & Record Keeping",
    shortLabel: "Bookkeeping",
    icon: "BookOpen",
    description: "Learn to track your income and expenses simply — using a notebook or phone. Know your daily profit without an accountant.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Simple bookkeeping methods for informal micro-businesses in developing economies" },
      },
    },
  },
  {
    id: "supplier-negotiation",
    label: "Supplier Negotiation Helper",
    shortLabel: "Supplier Deals",
    icon: "Handshake",
    description: "How do I get better deals from my suppliers? Practical negotiation tips for small traders dealing with wholesalers.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Supplier negotiation tactics for informal market traders and micro-businesses in developing economies" },
      },
    },
  },
  {
    id: "tax-compliance-simplified",
    label: "Tax Compliance Simplified",
    shortLabel: "Tax Help",
    icon: "Receipt",
    description: "What taxes do I owe? Get simple, honest guidance on your tax obligations as a small business — in plain language, by country.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Simplified tax regimes for micro-businesses and informal sector in Kenya, Nigeria, Ghana, India, Bangladesh, Pakistan, Philippines" },
      },
    },
  },
];

// Workers Rights

export const WORKERS_RIGHTS_MODULES: ModuleDefinition[] = [
  {
    id: "domestic-worker-rights",
    label: "Domestic Worker Protection",
    shortLabel: "Domestic Workers",
    icon: "Home",
    description: "Rights for household workers — cleaners, cooks, nannies, and caregivers — including on hours, leave, pay, and living conditions.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Domestic worker rights by country, ILO Convention 189, hours, rest days, live-in conditions, termination, sexual harassment protections" },
      },
    },
  },
  {
    id: "employment-rights-checker",
    label: "Employment Rights Checker",
    shortLabel: "My Rights",
    icon: "Shield",
    description: "What are my basic rights at work? Find out your rights on pay, hours, leave, and contracts — by country and employment type.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Basic employment rights by country: minimum wage, working hours, leave entitlement, contract rights, right to organise" },
      },
    },
  },
  {
    id: "gig-economy-rights",
    label: "Gig Economy Worker Rights",
    shortLabel: "Gig Rights",
    icon: "Smartphone",
    description: "I work for Uber, Bolt, a food delivery app, or other platform — what are my rights? How to know if you are an employee or contractor, and what protections apply.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Gig economy rights, employee vs contractor tests, platform accountability, algorithmic deactivation rights, accident compensation for gig workers" },
      },
    },
  },
  {
    id: "migrant-worker-rights",
    label: "Migrant Worker Rights",
    shortLabel: "Migrant Rights",
    icon: "Globe",
    description: "I am working in another country — what are my rights? Guidance for foreign workers including on the kafala system, passport retention, and what to do if you have a problem.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Migrant worker rights in GCC and Southeast Asia, kafala system, passport retention laws, embassy contacts, IOM helplines" },
      },
    },
  },
  {
    id: "minimum-wage-calculator",
    label: "Minimum Wage Calculator",
    shortLabel: "Minimum Wage",
    icon: "DollarSign",
    description: "What is the minimum wage in my country? Check if you are being paid correctly and what to do if you are underpaid.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Minimum wage rates by country and sector, lawful vs. unlawful wage deductions, in-kind payment rules" },
      },
    },
  },
  {
    id: "union-collective-bargaining",
    label: "Union & Collective Bargaining Basics",
    shortLabel: "Unions",
    icon: "Users",
    description: "What is a union and how does it help? How to join a union, your right to organise, and what collective bargaining means for your pay and conditions.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Trade union rights, ILO conventions 87 and 98, collective bargaining, union formation, shop steward role, employer intimidation" },
      },
    },
  },
  {
    id: "workplace-safety-rights",
    label: "Workplace Safety Know-Your-Rights",
    shortLabel: "Safety Rights",
    icon: "ShieldAlert",
    description: "Is my workplace safe? Know your rights to a safe working environment and what to do if it is dangerous.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Workplace safety rights by country and industry, right to refuse dangerous work, PPE requirements, accident reporting, workers compensation" },
      },
    },
  },
  {
    id: "wrongful-dismissal",
    label: "Wrongful Dismissal Response",
    shortLabel: "Unfair Dismissal",
    icon: "XCircle",
    description: "I was fired — was it legal? Steps to take if you believe you were unfairly dismissed or retrenched.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Unfair dismissal rights by country, notice periods, severance pay, complaint time limits, retrenchment rules" },
      },
    },
  },
];

// Personal Finance (BOP)

export const PERSONAL_FINANCE_BOP_MODULES: ModuleDefinition[] = [
  {
    id: "budget-builder",
    label: "Budget Builder",
    shortLabel: "My Budget",
    icon: "Calculator",
    description: "Track what you earn and what you spend. Make sure your money lasts until the next payday.",
    color: "adv-teal",
    defaults: {
      thinking: "quick",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Practical budgeting methods for low-income households with irregular income in developing economies" },
      },
    },
  },
  {
    id: "debt-trap-warning",
    label: "Debt Trap Warning System",
    shortLabel: "Loan Safety",
    icon: "AlertTriangle",
    description: "Is this loan safe? Understand if a loan will help or hurt you — and spot dangerous lending before you sign.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Predatory lending, debt spirals, mobile loan app risks, moneylender practices, cost of credit in developing economies" },
      },
    },
  },
  {
    id: "micro-insurance-guide",
    label: "Micro-Insurance Guide",
    shortLabel: "Basic Insurance",
    icon: "Umbrella",
    description: "What insurance do I need? Simple guide to affordable insurance options — for health, crop, life, and mobile phone.",
    color: "adv-teal",
    defaults: {
      thinking: "quick",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Micro-insurance products in developing economies — NHIF Kenya, NHIS Ghana, PMJAY India, burial societies, crop insurance" },
      },
    },
  },
  {
    id: "mobile-money-safety",
    label: "Mobile Money Safety Guide",
    shortLabel: "Mobile Money Safety",
    icon: "Smartphone",
    description: "Keep your mobile money safe. Protect yourself from SIM swap, phishing, and other scams that steal mobile money.",
    color: "adv-teal",
    defaults: {
      thinking: "quick",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Mobile money fraud, SIM swap attacks, scam patterns on M-Pesa, MTN MoMo, bKash, GCash, Easypaisa" },
      },
    },
  },
  {
    id: "pension-retirement-basics",
    label: "Pension & Retirement Basics",
    shortLabel: "Retirement Planning",
    icon: "Clock",
    description: "How do I prepare for old age when I don't have much? Simple retirement planning for informal workers and low-income earners.",
    color: "adv-teal",
    defaults: {
      thinking: "quick",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Government pension schemes in developing economies — NSSF Kenya, SSNIT Ghana, EPFO India, SSS Philippines, EOBI Pakistan — voluntary contributions, informal worker retirement planning" },
      },
    },
  },
  {
    id: "remittance-cost-comparison",
    label: "Remittance Cost Comparison",
    shortLabel: "Send Money Cheaper",
    icon: "ArrowRightLeft",
    description: "Find the cheapest way to send money home. Compare transfer services to save money on every transfer.",
    color: "adv-teal",
    defaults: {
      thinking: "quick",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Remittance corridors, transfer fee comparisons, exchange rate markups, mobile money transfers internationally" },
      },
    },
  },
  {
    id: "savings-goal-planner",
    label: "Savings Goal Planner",
    shortLabel: "Save for Goals",
    icon: "Target",
    description: "Save up for something important — school fees, a business, a home. Set a realistic goal and plan how to reach it.",
    color: "adv-teal",
    defaults: {
      thinking: "quick",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Savings strategies for low-income households including ROSCAs, SACCOs, and mobile money savings in developing economies" },
      },
    },
  },
  {
    id: "zakat-calculator",
    label: "Zakat & Religious Giving Guide",
    shortLabel: "Zakat & Giving",
    icon: "Star",
    description: "Calculate your zakat obligation. Guidance on religious giving requirements including zakat, tithe, and other faith-based financial obligations.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Zakat calculation rules, nisab thresholds, hawl year, zakat al-fitr, Christian tithing, Islamic finance obligations" },
      },
    },
  },
];

// Credit Navigator

export const CREDIT_NAVIGATOR_MODULES: ModuleDefinition[] = [
  {
    id: "business-plan-for-loan",
    label: "Business Plan for Loan Application",
    shortLabel: "Business Plan",
    icon: "FileEdit",
    description: "Write a simple business plan to support your loan application. Show the lender your business makes sense.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Simple business plans for microenterprise loan applications, cash flow for informal businesses, loan justification in developing economies" },
      },
    },
  },
  {
    id: "collateral-explainer",
    label: "Collateral & Security Explainer",
    shortLabel: "What I'm Pledging",
    icon: "Home",
    description: "What happens to my property if I can't repay? Understand what you're pledging as security and the real risk.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Collateral requirements in microfinance, asset seizure laws in developing economies, guarantor liability, land and property as loan security" },
      },
    },
  },
  {
    id: "credit-score-builder",
    label: "Credit Score Builder",
    shortLabel: "Build Credit",
    icon: "TrendingUp",
    description: "How do I build a credit history? Steps to become creditworthy over 6-24 months, even starting with nothing.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Credit bureau systems in developing economies, mobile money credit scoring, creditworthiness building for unbanked individuals" },
      },
    },
  },
  {
    id: "group-lending-guide",
    label: "Group Lending Guide",
    shortLabel: "Group Loans",
    icon: "Users",
    description: "How do group loans work? Understand your responsibilities in a group loan, and how to protect yourself from other members' problems.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Group lending models — Grameen, village banking, SHG, VSLA — joint liability, group dynamics, member default management" },
      },
    },
  },
  {
    id: "loan-comparison",
    label: "Loan Comparison Tool",
    shortLabel: "Compare Loans",
    icon: "GitCompare",
    description: "Compare loan options side by side. Find out the true cost including all fees — not just the interest rate.",
    color: "adv-teal",
    defaults: {
      thinking: "quick",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Loan cost comparison, APR calculation, total cost of credit, microfinance loan types in developing economies" },
      },
    },
  },
  {
    id: "loan-default-rights",
    label: "Loan Default — Know Your Rights",
    shortLabel: "Can't Repay",
    icon: "LifeBuoy",
    description: "I can't repay my loan — what are my rights? Steps to take when you're struggling to repay, and protection from illegal collection.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Borrower rights on loan default, debt collection laws in developing economies, loan restructuring, credit bureau rehabilitation, illegal collection practices" },
      },
    },
  },
  {
    id: "microfinance-application",
    label: "Microfinance Application Helper",
    shortLabel: "MFI Application",
    icon: "FileText",
    description: "How to apply for a microfinance loan. Prepare your application, understand requirements, and improve your chances of approval.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Microfinance loan application requirements, cash flow preparation, group loans, creditworthiness building for informal businesses" },
      },
    },
  },
  {
    id: "predatory-lending-checker",
    label: "Predatory Lending Red Flag Checker",
    shortLabel: "Loan Red Flags",
    icon: "AlertOctagon",
    description: "Is this lender dangerous? Check for red flags of predatory lending before you sign anything.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Predatory lending patterns, advance-fee fraud, Ponzi schemes dressed as investment loans, illegal debt collection, mobile loan app abuses" },
      },
    },
  },
];

// Land Rights

export const LAND_RIGHTS_MODULES: ModuleDefinition[] = [
  {
    id: "boundary-dispute",
    label: "Boundary Dispute Resolution",
    shortLabel: "Boundary Dispute",
    icon: "Ruler",
    description: "Neighbour dispute about land boundaries. Steps to resolve disagreements over where your land ends and theirs begins.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Land boundary dispute resolution: surveyor role, survey beacons, land registry maps, mediation and land tribunals, boundary realignment agreements, cost of court vs survey, criminal protection of survey beacons." },
      },
    },
  },
  {
    id: "community-land-registration",
    label: "Community Land Registration",
    shortLabel: "Community Land",
    icon: "Map",
    description: "How to register communal or ancestral land. Protect community land rights through formal registration.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Community land registration by country: Kenya Community Land Act 2016, Tanzania Village Land Act, Ghana customary area secretariats, India Forest Rights Act 2006, South Africa communal land rights. Participatory mapping, VGGT guidelines, land governance structures." },
      },
    },
  },
  {
    id: "government-land-scheme",
    label: "Government Land Scheme Navigator",
    shortLabel: "Land Schemes",
    icon: "Building",
    description: "Find government land allocation programs. Learn about housing schemes, agricultural land grants, and resettlement programs you may qualify for.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Government land and housing schemes by country: Kenya NLC Settlement Schemes, Nigeria FHA, Ghana SSNIT housing, India PM Awas Yojana, South Africa RDP and land redistribution, Tanzania village land allocation. Eligibility, application, waiting lists, common problems." },
      },
    },
  },
  {
    id: "inheritance-rights",
    label: "Inheritance Rights Advisor",
    shortLabel: "Inheritance",
    icon: "Users",
    description: "Who inherits land and property? Understand inheritance laws including Islamic, customary, and statutory rules — especially for women and surviving spouses.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Inheritance law by country: statutory civil law, Islamic inheritance (Quranic shares), customary law (patrilineal/matrilineal), writing a will, widow protection, daughters' rights, conflict between legal systems in Africa and South Asia." },
      },
    },
  },
  {
    id: "land-grab-eviction-response",
    label: "Land Grab & Forced Eviction Response",
    shortLabel: "Fight Eviction",
    icon: "AlertTriangle",
    description: "Someone is trying to take my land. Emergency steps when facing forced eviction or land grabbing.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Forced eviction response: documentation steps, legal notice requirements, FPIC rights, UN Basic Principles on Business and Human Rights, land rights NGOs by country, emergency legal hotlines, proof of occupancy strategies." },
      },
    },
  },
  {
    id: "land-title-verification",
    label: "Land Title Verification Guide",
    shortLabel: "Check Title",
    icon: "FileSearch",
    description: "How do I check if land has a valid title? Steps to verify ownership before buying, renting, or using land.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Land title verification procedures by country: Kenya Ardhisasa portal, Nigeria State Land Registry, Ghana Lands Commission, India state land records, South Africa Deeds Registry, Tanzania Land Registry. Red flags, due diligence steps, customary vs formal title." },
      },
    },
  },
  {
    id: "tenant-rights",
    label: "Tenant Rights & Fair Rent",
    shortLabel: "Tenant Rights",
    icon: "Home",
    description: "My rights as a renter. Know your rights on fair rent, eviction notice, repairs, deposits, and what landlords can and cannot do.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Tenant rights by country: eviction notice periods, deposit rules, landlord obligations, illegal self-help eviction, rent control laws, verbal tenancy agreements. Kenya, Nigeria, South Africa PIE Act, India Rent Control Acts, Ghana." },
      },
    },
  },
  {
    id: "womens-land-rights",
    label: "Women's Land Rights Advisor",
    shortLabel: "Women's Rights",
    icon: "Heart",
    description: "Rights for women regarding land — including on inheritance, marital property, divorce, widowhood, and customary law challenges.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Women's land rights by country: Kenya Land Act, Uganda co-ownership, South Africa protections, India Hindu Succession Amendment 2005, Bangladesh challenges. Gap between statutory and customary law. Practical protection steps: joint registration, documentation, NGO support." },
      },
    },
  },
];

// Consumer Protection

export const CONSUMER_PROTECTION_MODULES: ModuleDefinition[] = [
  {
    id: "banking-rights",
    label: "Banking Rights & Fee Transparency",
    shortLabel: "Banking Rights",
    icon: "Landmark",
    description: "What fees can my bank charge? Know your rights on bank charges, account closure, and what to do when your bank treats you unfairly.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Banking consumer rights by country: fee disclosure, right to statement, account closure rights, central bank consumer divisions (CBK Kenya, CBN Nigeria, Bank of Ghana, RBI India), financial services ombudsman, illegal charges, account freezing rules." },
      },
    },
  },
  {
    id: "consumer-court-guide",
    label: "Consumer Court & Tribunal Guide",
    shortLabel: "Consumer Court",
    icon: "Scale",
    description: "How to take a consumer complaint to court or tribunal. When to go to consumer court, how to file, and what to expect.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Consumer courts and tribunals by country: Kenya Magistrate's Court, Nigeria Consumer Protection Tribunal, South Africa Small Claims Court and National Consumer Tribunal, India Consumer Disputes Redressal Commissions (district/state/national), Philippines Consumer Arbitration Office. Filing process, costs, timelines, self-representation, remedies available." },
      },
    },
  },
  {
    id: "digital-privacy-rights",
    label: "Digital Privacy & Data Rights",
    shortLabel: "Privacy Rights",
    icon: "Lock",
    description: "Protect your personal information online and on your phone. Know your rights when apps, companies, and governments collect your data.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Digital privacy rights for BoP users: what personal data is, app permissions on Android, right to delete data, data protection laws (Kenya DPA 2019, Nigeria NDPA 2023, South Africa POPIA, India DPDPA 2023), reporting data violations, SIM registration data, phishing protection, mobile banking safety." },
      },
    },
  },
  {
    id: "government-service-complaint",
    label: "Government Service Complaint",
    shortLabel: "Gov. Complaint",
    icon: "Building2",
    description: "How to complain about bad government service. What to do when government officials treat you poorly, delay your service, or ask for a bribe.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Government service complaints by country: internal complaint process, ombudsman offices, anti-corruption bodies (EACC Kenya, ICPC Nigeria, CHRAJ Ghana, CVC India, Ombudsman Philippines), service charters, bribe reporting, police oversight mechanisms." },
      },
    },
  },
  {
    id: "mobile-money-dispute",
    label: "Mobile Money Dispute Resolution",
    shortLabel: "Mobile Money",
    icon: "Smartphone",
    description: "Problem with mobile money — wrong transfer, money missing, or account issues. Steps to get your money back.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Mobile money dispute resolution: M-Pesa, MTN MoMo, Airtel Money, bKash, GCash, Easypaisa. Wrong transfer recall process, failed transaction dispute, SIM swap response, agent disputes, customer care numbers, telecoms regulator escalation, 48-hour rule." },
      },
    },
  },
  {
    id: "product-complaint",
    label: "Product Quality Complaint Helper",
    shortLabel: "Product Complaint",
    icon: "Package",
    description: "I bought something defective — what can I do? Steps to complain about defective products and get a refund or replacement.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Consumer product complaint rights by country: implied warranty, refund and replacement rules, consumer protection authorities (FCCCPA Nigeria, Consumer Federation Kenya, NCC South Africa, Consumer Affairs India), small claims courts, time limits for complaints." },
      },
    },
  },
  {
    id: "scam-fraud-warning",
    label: "Scam & Fraud Warning System",
    shortLabel: "Scam Warning",
    icon: "AlertOctagon",
    description: "Is this a scam? Identify common fraud types and know what to do if you've been scammed.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Common scam types by region: advance-fee fraud, mobile money scams, prize scams, investment pyramid schemes, romance scams, job offer scams, SIM swap fraud. Universal red flags, reporting channels by country, realistic recovery expectations." },
      },
    },
  },
  {
    id: "utility-bill-dispute",
    label: "Utility Bill Dispute Helper",
    shortLabel: "Utility Bills",
    icon: "Zap",
    description: "My electricity or water bill seems wrong. Steps to challenge incorrect utility bills and get an accurate reading.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Utility bill disputes: electricity, water, gas, telecoms. Meter reading, estimated billing, meter test rights, disconnection process, reconnection rights, low-income tariffs. Utility regulators by country: EPRA Kenya, NERC Nigeria, Energy Commission Ghana, CERC India." },
      },
    },
  },
];

// Community Health

export const COMMUNITY_HEALTH_MODULES: ModuleDefinition[] = [
  {
    id: "disease-prevention-first-aid",
    label: "Disease Prevention & First Aid",
    shortLabel: "First Aid",
    icon: "Shield",
    description: "Prevent common diseases and respond to health emergencies. Basic first aid and prevention for malaria, cholera, TB, and injury.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Basic first aid, malaria prevention, wound care, burn management, snakebite, TB recognition, community disease prevention" },
      },
    },
  },
  {
    id: "maternal-child-health",
    label: "Maternal & Child Health Advisor",
    shortLabel: "Maternal & Child",
    icon: "Baby",
    description: "Pregnancy and infant care guidance. What to expect, danger signs, antenatal visits, and keeping your baby healthy in the first years.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "WHO antenatal care guidelines, IMCI, breastfeeding, maternal danger signs, child development milestones" },
      },
    },
  },
  {
    id: "medicine-dosage-safety",
    label: "Medicine Safety & Dosage Guide",
    shortLabel: "Medicine Safety",
    icon: "Pill",
    description: "How to take medicines safely. Understand prescriptions, avoid dangerous combinations, and know when to stop.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Medicine safety, prescription reading, common medicine interactions, antibiotic adherence, safe storage, paracetamol safety" },
      },
    },
  },
  {
    id: "mental-health-referral",
    label: "Mental Health Awareness & Referral",
    shortLabel: "Mental Health",
    icon: "Brain",
    description: "Recognise signs of mental health challenges and find help. Information about depression, anxiety, grief, and where to get support.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "mhGAP guidelines, mental health in low-resource settings, community mental health, crisis referral, destigmatisation" },
      },
    },
  },
  {
    id: "nutrition-feeding-guide",
    label: "Nutrition & Feeding Guide",
    shortLabel: "Nutrition",
    icon: "Utensils",
    description: "What should my child eat at different ages? Affordable, nutritious feeding advice using local foods.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "IYCF guidelines, WHO child nutrition, malnutrition recognition, local food nutrition for Sub-Saharan Africa and South Asia" },
      },
    },
  },
  {
    id: "symptom-assessment",
    label: "Symptom Checker & Referral Guide",
    shortLabel: "Symptom Checker",
    icon: "Stethoscope",
    description: "Understand how serious symptoms might be and whether to go to hospital now, soon, or wait and watch.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Community health triage, WHO IMCI guidelines, danger signs, referral criteria for low-resource settings" },
      },
    },
  },
  {
    id: "vaccination-tracker",
    label: "Vaccination Schedule & Tracker",
    shortLabel: "Vaccination",
    icon: "Syringe",
    description: "Which vaccines does my child need? Country vaccination schedule and how to track what vaccines have been given.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "EPI schedules, national immunisation programmes, WHO vaccination recommendations for sub-Saharan Africa and South Asia" },
      },
    },
  },
  {
    id: "wash-advisor",
    label: "WASH Advisor",
    shortLabel: "WASH",
    icon: "Droplets",
    description: "Water, Sanitation and Hygiene guidance. Simple practices that prevent most diarrhea, cholera, and waterborne diseases.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "WASH in low-resource settings, water treatment methods, ORS preparation, latrine construction, handwashing behaviour change" },
      },
    },
  },
];

// Education & Literacy

export const EDUCATION_LITERACY_MODULES: ModuleDefinition[] = [
  {
    id: "adult-literacy-tutor",
    label: "Adult Literacy Tutor",
    shortLabel: "Literacy Tutor",
    icon: "BookOpen",
    description: "Practice reading and writing with patient guidance. Learn at your own pace in your own language.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Adult literacy teaching methods, phonics, whole-language approach, functional literacy, aspirational literacy for adults in developing countries" },
      },
    },
  },
  {
    id: "digital-literacy-basics",
    label: "Digital Literacy Basics",
    shortLabel: "Digital Skills",
    icon: "Monitor",
    description: "Learn to use technology confidently. Smartphones, internet, email, WhatsApp, and online government services — explained step by step.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Basic smartphone use, WhatsApp, internet browsing, email, online government services in Kenya, India, Philippines, mobile money, digital safety basics" },
      },
    },
  },
  {
    id: "exam-preparation-guide",
    label: "Exam Preparation Guide",
    shortLabel: "Exam Prep",
    icon: "ClipboardList",
    description: "Prepare for important exams. Study strategies, past paper practice, and subject-specific tips for national exams.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "KCSE, WAEC, NECO exam formats, spaced repetition, active recall, exam strategy, study planning, stress management for students" },
      },
    },
  },
  {
    id: "homework-helper",
    label: "Children's Homework Helper",
    shortLabel: "Homework Help",
    icon: "Pencil",
    description: "Help your child with school homework. Patient explanations in simple English or local language.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Primary and junior secondary curriculum in Kenya, Nigeria, Ghana, Tanzania, India, Bangladesh, age-appropriate pedagogy" },
      },
    },
  },
  {
    id: "language-learning-helper",
    label: "Language Learning Helper",
    shortLabel: "Language Learning",
    icon: "MessageSquare",
    description: "Learn a new language for work, travel, or education. Practical vocabulary and conversation practice.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Communicative language teaching, functional vocabulary for work and daily life, English as second language, beginner to intermediate language learning" },
      },
    },
  },
  {
    id: "numeracy-maths-helper",
    label: "Numeracy & Basic Maths Helper",
    shortLabel: "Numeracy",
    icon: "Hash",
    description: "Learn practical maths — counting, addition, subtraction, percentages, and the maths you need for business and daily life.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Adult numeracy, functional maths, market maths, financial literacy maths, mental arithmetic for business" },
      },
    },
  },
  {
    id: "scholarship-funding-finder",
    label: "Scholarship & Funding Finder",
    shortLabel: "Scholarships",
    icon: "Award",
    description: "Find money to pay for education. Government scholarships, NGO grants, community bursaries — by country and level.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Government scholarships and bursaries in Kenya, Nigeria, Ghana, South Africa, India, Bangladesh, Pakistan, Philippines, international NGO scholarships, Mastercard Foundation, scholarship application process" },
      },
    },
  },
  {
    id: "skills-training-navigator",
    label: "Skills Training Navigator",
    shortLabel: "Skills Training",
    icon: "Wrench",
    description: "Find vocational and skills training programs. Certificates and trade skills that lead to jobs or self-employment.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "TVET systems in Kenya, Nigeria, Ghana, South Africa, India, Bangladesh, Philippines, vocational training providers, apprenticeship programmes, government-funded skills training" },
      },
    },
  },
];

// Food Business

export const FOOD_BUSINESS_MODULES: ModuleDefinition[] = [
  {
    id: "bulk-buying-supply-chain",
    label: "Bulk Buying & Supply Chain",
    shortLabel: "Bulk Buying",
    icon: "Truck",
    description: "Source ingredients cheaper. Bulk buying, supplier relationships, and avoiding shortages.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Bulk buying strategies, wholesale sourcing, and supply chain management for micro-food-businesses in developing countries" },
      },
    },
  },
  {
    id: "catering-business-expansion",
    label: "Catering Business Expansion",
    shortLabel: "Start Catering",
    icon: "TrendingUp",
    description: "Grow your food business into catering for events, offices, and schools. What you need and how to start.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Catering business development, event catering pricing and contracts, institutional catering for micro-food-businesses in developing countries" },
      },
    },
  },
  {
    id: "food-licensing-permits",
    label: "Food Licensing & Health Permits",
    shortLabel: "Licensing Help",
    icon: "FileText",
    description: "What permits do I need to sell food legally? Step-by-step guide to food business licensing by country.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Food business licensing, health permits, and registration requirements by country for micro-food-businesses in Kenya, Nigeria, Ghana, Tanzania, India, Bangladesh, Pakistan, Philippines" },
      },
    },
  },
  {
    id: "food-preservation-storage",
    label: "Food Preservation & Storage",
    shortLabel: "Preservation",
    icon: "Package",
    description: "Preserve food safely without expensive equipment. Extend shelf life and reduce waste using practical methods.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Food preservation methods, safe storage for tropical climates, traditional preservation techniques for micro-food-businesses in developing countries" },
      },
    },
  },
  {
    id: "food-safety-hygiene",
    label: "Food Safety & Hygiene Compliance",
    shortLabel: "Food Safety",
    icon: "ShieldCheck",
    description: "Basic food safety rules to keep customers safe and avoid being shut down by health inspectors.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Food safety basics, hygiene rules, and health inspection requirements for micro-food-businesses in Kenya, Nigeria, Ghana, Tanzania, India, Bangladesh, Pakistan, Philippines" },
      },
    },
  },
  {
    id: "food-waste-portion-control",
    label: "Waste Reduction & Portion Control",
    shortLabel: "Reduce Waste",
    icon: "Recycle",
    description: "Stop throwing away profits. Control portions and reduce food waste to increase your margins.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Food waste reduction, portion control, and batch cooking strategies for micro-food-businesses in developing countries" },
      },
    },
  },
  {
    id: "halal-kosher-dietary",
    label: "Halal / Kosher / Dietary Compliance",
    shortLabel: "Dietary Standards",
    icon: "Star",
    description: "Meet religious and dietary requirements for customers. Halal certification, vegetarian/vegan, and allergen management.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Halal certification, kosher requirements, vegetarian and vegan food standards, allergen management for micro-food-businesses globally" },
      },
    },
  },
  {
    id: "menu-pricing-cost-control",
    label: "Menu Pricing & Cost Control",
    shortLabel: "Pricing & Costs",
    icon: "Calculator",
    description: "Price your food correctly. Calculate the true cost of each dish including ingredients, fuel, time, and packaging.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Food business cost calculation, menu pricing strategies, and profit margins for micro-food-businesses in developing countries" },
      },
    },
  },
];

// Artisan & Craft

export const ARTISAN_CRAFT_MODULES: ModuleDefinition[] = [
  {
    id: "branding-storytelling",
    label: "Branding & Storytelling for Artisans",
    shortLabel: "Tell Your Story",
    icon: "Star",
    description: "Tell your story to sell more. How your background, tradition, and technique become your most powerful marketing tool.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Artisan branding, provenance storytelling, marketing for handmade crafts, artisan identity and cultural heritage as competitive advantage" },
      },
    },
  },
  {
    id: "cooperative-formation",
    label: "Cooperative Formation Guide",
    shortLabel: "Form a Cooperative",
    icon: "Users",
    description: "Form an artisan cooperative. How groups of artisans can work together to access better markets and prices.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Artisan cooperative formation, cooperative governance, registration processes by country, collective marketing and purchasing for artisan groups" },
      },
    },
  },
  {
    id: "fair-trade-certification",
    label: "Fair Trade & Certification Navigator",
    shortLabel: "Fair Trade",
    icon: "Award",
    description: "Get fair trade certified. Understand the process, costs, and benefits of fair trade and ethical trade certification.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Fair trade certification for artisans — WFTO, Fairtrade International, Fair Trade USA, certification process, costs, and benefits for craft cooperatives in developing countries" },
      },
    },
  },
  {
    id: "ip-traditional-crafts",
    label: "Intellectual Property for Traditional Crafts",
    shortLabel: "Protect Your Designs",
    icon: "Shield",
    description: "Protect your traditional designs. Know your rights when your patterns, designs, or craft techniques are copied.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Intellectual property protection for artisans — copyright, trade marks, geographical indications, traditional knowledge protection, WIPO resources for developing country artisans" },
      },
    },
  },
  {
    id: "market-access-ecommerce",
    label: "Market Access & E-Commerce Setup",
    shortLabel: "Sell Online",
    icon: "ShoppingBag",
    description: "Sell your crafts online and to new markets. How to set up on WhatsApp, Instagram, and online marketplaces.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Digital market access for artisans — WhatsApp Business, Instagram, Etsy, regional e-commerce platforms for handmade crafts in developing countries" },
      },
    },
  },
  {
    id: "packaging-shipping-basics",
    label: "Packaging & Shipping Basics",
    shortLabel: "Packaging & Shipping",
    icon: "Package",
    description: "Pack and ship your crafts safely and affordably. Protect fragile items and calculate shipping costs correctly.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Craft packaging and shipping for artisans — protective packaging methods, international shipping costs, customs documentation, fragile item protection" },
      },
    },
  },
  {
    id: "product-costing-pricing",
    label: "Product Costing & Pricing",
    shortLabel: "Pricing Help",
    icon: "Calculator",
    description: "What should I charge? Calculate your true cost including materials AND your time, then set a fair price.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Artisan product costing, craft pricing strategies, tourist and export pricing for handmade goods in developing countries" },
      },
    },
  },
  {
    id: "quality-standards-export",
    label: "Quality Standards for Export",
    shortLabel: "Export Quality",
    icon: "CheckCircle",
    description: "Meet export quality requirements. What international buyers expect and how to consistently deliver it.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Export quality standards for handmade crafts, EU/UK/US import requirements, CITES regulations, quality control processes for artisan businesses" },
      },
    },
  },
];

// Livestock & Poultry

export const LIVESTOCK_POULTRY_MODULES: ModuleDefinition[] = [
  {
    id: "animal-health-disease",
    label: "Animal Health & Disease Guide",
    shortLabel: "Animal Health",
    icon: "Stethoscope",
    description: "My animal seems sick. Identify symptoms and know when to call the vet immediately.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Animal disease symptoms, triage guidance, common livestock diseases by region and species, biosecurity, zoonotic disease warnings, vaccination schedules" },
      },
    },
  },
  {
    id: "breeding-herd-management",
    label: "Breeding & Herd Management",
    shortLabel: "Breeding",
    icon: "Dna",
    description: "Improve your herd through better breeding selection. Keep records to know which animals are most productive.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Livestock breeding selection, culling principles, record keeping, artificial insemination, crossbreeding local and exotic breeds, breeding age and seasonality by species" },
      },
    },
  },
  {
    id: "dairy-production-optimizer",
    label: "Dairy Production Optimizer",
    shortLabel: "Dairy",
    icon: "Milk",
    description: "Get more milk from your cows. Simple improvements to feeding, milking practice, and health that increase production.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Dairy cow nutrition, milking management, mastitis prevention and detection, heat stress management, calf management, milk hygiene, marketing options for small-scale dairy in Africa and South Asia" },
      },
    },
  },
  {
    id: "feeding-nutrition-planner",
    label: "Feeding & Nutrition Planner",
    shortLabel: "Feeding Plan",
    icon: "Utensils",
    description: "What should my animals eat? Affordable feeding plans using local feed sources to keep animals healthy and productive.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Livestock nutrition by species, local feed sources in Africa and South Asia, deficiency signs, feed cost reduction strategies, dry season feed planning" },
      },
    },
  },
  {
    id: "grazing-pasture-management",
    label: "Grazing & Pasture Management",
    shortLabel: "Pasture",
    icon: "Sprout",
    description: "Manage your grazing land sustainably. Rotational grazing, pasture improvement, and dry-season strategies.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Rotational grazing, stocking rates, improved pasture grasses (Napier, Brachiaria), hay making, silage basics, water point management, zero-grazing cut-and-carry, communal grazing challenges in Africa and South Asia" },
      },
    },
  },
  {
    id: "livestock-market-timing",
    label: "Livestock Market Timing & Pricing",
    shortLabel: "Market Timing",
    icon: "TrendingUp",
    description: "When and where to sell your animals for the best price. Seasonal price patterns and negotiation basics.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Livestock seasonal price patterns, religious festival timing (Eid al-Adha, Christmas, Easter), dry season cattle price cycles, market comparison, pre-sale conditioning, negotiation basics, mobile phone price information for Africa and South Asia" },
      },
    },
  },
  {
    id: "poultry-business-starter",
    label: "Poultry Business Starter Kit",
    shortLabel: "Poultry Business",
    icon: "ShoppingBag",
    description: "Start a poultry business. How to begin with chickens, ducks, or turkeys as a profitable small business.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Poultry business setup: housing, chick sourcing, vaccination schedules, financial viability calculation, mortality budgeting, market options for small-scale poultry in Africa and South Asia" },
      },
    },
  },
  {
    id: "veterinary-emergency-first-response",
    label: "Veterinary Emergency First Response",
    shortLabel: "Vet Emergency",
    icon: "AlertTriangle",
    description: "Emergency animal health response. What to do while waiting for the vet in critical situations.",
    color: "adv-teal",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Veterinary first response: bloat, dystocia, wounds, newborn resuscitation, heat stroke, fractures, first aid while waiting for vet — cattle, goats, sheep, pigs, poultry" },
      },
    },
  },
];

// Trades & Service Workers — micro-business tooling for independent tradespeople
export const TRADES_MODULES: ModuleDefinition[] = [
  {
    id: "invoice-generator",
    label: "Invoice Generator",
    shortLabel: "Invoice",
    icon: "Receipt",
    description: "Turn a finished job into a clear, professional invoice — line items, labour, materials, VAT, and payment terms.",
    color: "adv-gold",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Small-trade invoicing essentials: required fields (business name, customer, invoice number/date, due date), itemised labour + materials, VAT/sales-tax handling and registration thresholds by country, payment terms and late-payment wording, bank/mobile-money payment details, and record-keeping for tax. Plain reusable templates for a sole trader." },
      },
    },
  },
  {
    id: "job-quote-builder",
    label: "Job Quote Builder",
    shortLabel: "Quote",
    icon: "Calculator",
    description: "Build an accurate, itemised quote or estimate for a job so you win the work without underpricing it.",
    color: "adv-gold",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Pricing a trade job: estimating labour hours, marking up materials, allowing for waste/contingency, overhead and target margin, fixed-price vs time-and-materials, deposit and milestone staging, quote validity period, and clear scope/exclusions wording to avoid disputes. Helps avoid the common mistake of underpricing." },
      },
    },
  },
  {
    id: "customer-comms",
    label: "Customer Communications",
    shortLabel: "Customer Msg",
    icon: "MessageSquare",
    description: "Draft clear, friendly messages to customers — booking confirmations, running-late notices, follow-ups, and payment reminders.",
    color: "adv-gold",
    defaults: {
      thinking: "quick",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Customer-facing message templates for tradespeople: appointment confirmation and reminders, arrival-window and running-late notes, job-complete and feedback requests, polite payment reminders and overdue follow-ups, and handling complaints professionally. Short, courteous, SMS/WhatsApp-ready tone." },
      },
    },
  },
  {
    id: "tax-rot-rut-guide",
    label: "ROT/RUT Tax Deduction Guide",
    shortLabel: "ROT/RUT",
    icon: "Percent",
    description: "Understand Sweden's ROT and RUT tax deductions — what work qualifies, how to apply them on an invoice, and how to claim from Skatteverket.",
    color: "adv-gold",
    defaults: {
      thinking: "think",
      creativity: "strict",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Swedish ROT (renovation/repair/extension) and RUT (household services) tax deductions: which services qualify, the labour-cost-only rule, current deduction rates and annual caps, the customer's remaining allowance, how the tradesperson applies the deduction on the invoice and requests the remainder from Skatteverket (begäran om utbetalning), required customer details (personnummer, property), and common rejection reasons. Rates change — verify current figures at skatteverket.se." },
      },
    },
  },
  {
    id: "material-order-list",
    label: "Material Order List",
    shortLabel: "Materials",
    icon: "ClipboardList",
    description: "Turn a job description into a complete materials and tools shopping list with quantities, so you buy everything in one trip.",
    color: "adv-gold",
    defaults: {
      thinking: "think",
      creativity: "balanced",
      outputFormats: ["quick-briefing"],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: "Building a job material list: breaking a task into materials + consumables + tools, estimating quantities with a sensible waste allowance, grouping by supplier/aisle, flagging long-lead or special-order items, and a quick budget total. Trade-aware (electrical, plumbing, carpentry, painting, tiling) so nothing critical is forgotten." },
      },
    },
  },
];

export const PHASE4_BOP_MODULES: ModuleDefinition[] = [
  ...TRADES_MODULES,
  ...GOVERNMENT_SERVICES_MODULES,
  ...SMALLHOLDER_FARMING_MODULES,
  ...MICRO_BUSINESS_MODULES,
  ...WORKERS_RIGHTS_MODULES,
  ...PERSONAL_FINANCE_BOP_MODULES,
  ...CREDIT_NAVIGATOR_MODULES,
  ...LAND_RIGHTS_MODULES,
  ...CONSUMER_PROTECTION_MODULES,
  ...COMMUNITY_HEALTH_MODULES,
  ...EDUCATION_LITERACY_MODULES,
  ...FOOD_BUSINESS_MODULES,
  ...ARTISAN_CRAFT_MODULES,
  ...LIVESTOCK_POULTRY_MODULES,
];
