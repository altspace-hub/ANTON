# ADDENDUM: "My Way of Working" — Personal Business Pattern Learning

> **Audience:** Claude Code
> **Parent Spec:** `TRADES_SERVICE_WORKERS_AREA_SPEC.md`
> **Purpose:** Specification for a capability that lets trade workers teach ANTON how THEY do things — their invoice layout, their quoting process, their ordering habits, their communication style — so that every output feels like "mine, but faster" rather than "some AI thing."
> **Priority:** CRITICAL — this is the adoption gate. Without this, the Trades area is just another AI tool that produces generic output. With this, it's the first AI tool that actually works the way they already work.
> **Architecture note:** This builds on top of the existing Apprentice Model (Section 14) and Knowledge Source system (Section 6), but it's fundamentally different from both. The Apprentice learns *platform preferences* (model, thinking level). Knowledge Sources provide *reference material*. This new capability learns *business identity and process patterns* — how the user runs their specific business.

---

## 1. The Core Insight

### Why Generic Output Kills Adoption

A plumber named Erik has been running his business for 12 years. His invoices have:
- His logo and business name at the top left
- "Faktura" in bold, not "Invoice"
- A job reference number he assigns himself (always "E-" followed by year and sequence: E-2026-047)
- Line items grouped as "Arbete" (labour) and "Material" separately
- His hourly rate listed explicitly (not hidden in a lump sum)
- Travel time as a separate line item at a lower rate
- A note at the bottom: "Betalning inom 20 dagar. Vid försenad betalning tillkommer dröjsmålsränta enligt räntelagen."
- His Bankgiro number, not Swish

When an AI generates an invoice that says "Invoice" instead of "Faktura," uses a different layout, lumps labour and materials together, and shows Swish payment details — Erik's immediate reaction is: **"This isn't how I do it."** And he closes the tool and goes back to his Excel template.

It doesn't matter that the AI's version is technically correct. It doesn't matter that it's faster. **It doesn't feel like his.** And for someone who's built their professional identity around being reliable and consistent, that matters enormously.

### The Goal

After a one-time setup (15-30 minutes), every output ANTON produces for Erik should look like Erik produced it. Same layout. Same language. Same quirks. Same numbering. Same payment terms. Same tone in customer messages. Erik should look at the output and think: "Yeah, that's exactly how I'd have done it — it just took 30 seconds instead of 30 minutes."

**"My way, but faster"** is the entire product promise for the Trades area.

---

## 2. Architecture: The Business Identity Profile

### What Gets Captured

The system captures three distinct layers of "how I work":

#### Layer 1: Business Identity (Static — set once, update occasionally)

Things that are the same across every job:

```typescript
interface BusinessIdentity {
  // Basics
  businessName: string;           // "Erik Lindström VVS"
  ownerName: string;              // "Erik Lindström"
  businessType: string;           // "Enskild firma" | "AB" | "HB"
  orgNumber: string;              // "XXXXXX-XXXX"
  fSkattNumber: string;           // F-skatt registration
  vatRegistered: boolean;         // true
  vatNumber?: string;             // SE + orgNumber + "01"
  
  // Contact
  address: string;
  phone: string;
  email: string;
  website?: string;
  
  // Payment
  preferredPaymentMethods: {      // Ordered by preference
    type: "bankgiro" | "plusgiro" | "swish" | "bank_transfer" | "invoice_service";
    details: string;              // "Bankgiro: 123-4567"
  }[];
  defaultPaymentTerms: number;    // 20 (days)
  latePaymentText: string;        // "Vid försenad betalning..."
  
  // Branding
  logo?: string;                  // File reference
  preferredLanguage: string;      // "sv" (but some customers get "en")
  documentLanguage: string;       // "sv" for invoices, may differ for comms
  
  // Rates
  hourlyRate: number;             // 650 (SEK)
  travelRate?: number;            // 450 (SEK/hour, lower than work rate)
  calloutFee?: number;            // 500 (SEK, for emergency calls)
  materialMarkup?: number;        // 15 (percent — Erik adds 15% on materials)
  
  // Numbering
  invoicePrefix: string;          // "E-"
  invoiceNumberFormat: string;    // "{prefix}{year}-{seq:3}" → "E-2026-047"
  quotePrefix: string;            // "O-" (offert)
  quoteNumberFormat: string;      // "{prefix}{year}-{seq:3}" → "O-2026-012"
  
  // Jurisdiction
  country: string;                // "SE"
  municipality?: string;          // "Stockholm"
  
  // Trade-specific
  tradeType: string;              // "Plumbing/VVS"
  certifications: string[];       // ["Auktoriserad VVS-installatör", "Safe Water"]
  insuranceProvider?: string;     // "Trygg-Hansa"
  insuranceNumber?: string;       // Reference number
}
```

#### Layer 2: Document Templates (Learned from examples)

The user's actual document patterns, extracted from examples they provide:

```typescript
interface DocumentTemplate {
  templateId: string;             // "invoice-standard"
  documentType: string;           // "invoice" | "quote" | "contract" | "message"
  name: string;                   // "My standard invoice"
  
  // Learned structure
  structure: {
    sections: {
      id: string;                 // "header" | "line-items" | "summary" | "footer"
      label: string;              // What Erik calls it: "Arbete" not "Labour"
      position: number;           // Order in document
      content: string;            // Template content with variables
    }[];
  };
  
  // Learned vocabulary
  vocabulary: {
    invoiceTitle: string;         // "Faktura" not "Invoice"
    quoteTitle: string;           // "Offert" not "Quote"
    labourLabel: string;          // "Arbete" or "Arbetskostnad"
    materialsLabel: string;       // "Material"
    travelLabel: string;          // "Resekostnad"
    vatLabel: string;             // "Moms (25%)"
    totalLabel: string;           // "Att betala"
    dueLabel: string;             // "Förfallodatum"
    referenceLabel: string;       // "Er referens" / "Vår referens"
    // ... extracted from examples
  };
  
  // Learned formatting preferences
  formatting: {
    currencyFormat: string;       // "1 234,50 kr" vs "SEK 1,234.50"
    dateFormat: string;           // "2026-02-28" vs "28 feb 2026"  
    lineItemStyle: string;        // "grouped" (labour + materials separate) vs "mixed"
    showHourlyRate: boolean;      // true (Erik shows rate × hours)
    showTravelSeparately: boolean; // true
    includeVatBreakdown: boolean; // true
    roundToNearest: number;       // 10 (rounds totals to nearest 10 SEK)
  };
  
  // Learned tone and style (for communications)
  tone?: {
    formality: "casual" | "warm-professional" | "formal";
    signOff: string;              // "Mvh, Erik" or "Med vänliga hälsningar"
    greeting: string;             // "Hej {name}!" or "Bästa {name},"
    usesEmoji: boolean;           // some tradespeople do 😊
    messageLength: "brief" | "medium" | "detailed";
  };
  
  // Source examples (what the user provided)
  sourceExamples: {
    rawText?: string;             // Pasted example
    fileRef?: string;             // Uploaded PDF/image
    extractedAt: string;          // When we learned from this
  }[];
}
```

#### Layer 3: Process Patterns (How they do things, step by step)

```typescript
interface ProcessPattern {
  patternId: string;              // "how-i-invoice"
  processType: string;            // "invoicing" | "quoting" | "ordering" | "scheduling" | "communicating"
  name: string;                   // "How I do invoicing"
  
  // What information is needed for this process
  requiredInputs: {
    id: string;                   // "customer_name"
    label: string;                // "Kund" (what the user calls it)
    type: string;                 // "text" | "number" | "select" | "date"
    alwaysNeeded: boolean;        // true = ask every time
    defaultValue?: string;        // pre-fill if known
    derivedFrom?: string;         // "calculate from hours × rate"
    promptQuestion: string;       // "Vilken kund?" — the actual words to ask
  }[];
  
  // The order things happen
  steps: {
    order: number;
    action: string;               // "Calculate total" | "Add travel" | "Apply ROT"
    description: string;          // User's description of what happens
    conditional?: string;         // "Only if customer is private (not company)"
  }[];
  
  // Business rules the user follows
  rules: {
    id: string;
    rule: string;                 // "Always charge travel for jobs outside Stockholm"
    applies: string;              // "quoting" | "invoicing" | "both"
  }[];
  
  // What questions to ask for this process
  smartQuestions: {
    question: string;             // "Hur många timmar tog jobbet?"
    askWhen: string;              // "always" | "if trade_type = plumbing"
    fieldId: string;              // Maps to requiredInputs
    followUp?: string;            // "Blev det övertid?" (if hours > 8)
  }[];
}
```

### Storage

**All three layers stored locally** in the existing SQLite database:

```sql
-- New tables for Business Identity Profile
CREATE TABLE business_identity (
  id TEXT PRIMARY KEY DEFAULT 'default',
  profile_data JSON NOT NULL,     -- BusinessIdentity object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_templates (
  id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL,     -- 'invoice', 'quote', 'contract', 'message'
  name TEXT NOT NULL,
  template_data JSON NOT NULL,     -- DocumentTemplate object
  is_default BOOLEAN DEFAULT FALSE,
  source_examples JSON,            -- Original examples provided
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE process_patterns (
  id TEXT PRIMARY KEY,
  process_type TEXT NOT NULL,      -- 'invoicing', 'quoting', 'ordering', etc.
  name TEXT NOT NULL,
  pattern_data JSON NOT NULL,      -- ProcessPattern object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Learning log — tracks what was learned from each example
CREATE TABLE pattern_learning_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,       -- 'uploaded_example', 'pasted_text', 'conversation', 'correction'
  source_ref TEXT,                 -- File reference or session ID
  patterns_extracted JSON,         -- What was learned
  user_confirmed BOOLEAN DEFAULT FALSE,  -- Did user verify the extraction?
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. The Setup Experience: "Teach ANTON Your Way"

### First-Time Flow

When a user opens the Trades area for the first time, BEFORE any module, they see a setup wizard. This is NOT a form — it's a conversation.

#### Phase 1: "Tell me about your business" (2-3 minutes)

ANTON asks plain-language questions to populate Layer 1 (Business Identity):

```
ANTON: "Hej! Innan vi kör igång vill jag lära mig lite om ditt företag 
        så att allt jag hjälper dig med ser ut som det kommer från dig. 
        Vad heter ditt företag?"

User:  "Erik Lindström VVS"

ANTON: "Snyggt. Enskild firma, AB, eller handelsbolag?"

User:  "Enskild firma"

ANTON: "Vad tar du i timmen?"

User:  "650 kr"

ANTON: "Tar du betalt för resan separat?"

User:  "Ja, 450 kr/timme för restid"

ANTON: "Hur vill du att kunderna betalar — Bankgiro, Swish, eller annat?"

User:  "Bankgiro, 123-4567"

ANTON: "Hur lång betalningstid brukar du ge?"

User:  "20 dagar"

ANTON: "Sista frågan: har du moms?"

User:  "Ja"

ANTON: "Perfekt. Nu vet jag grunderna. Vill du visa mig hur en av 
        dina fakturor brukar se ut? Det hjälper mig göra dem 
        precis som du vill ha dem."
```

Total time: 2-3 minutes. Feels like a conversation, not a registration form. All answers stored in `business_identity`.

#### Phase 2: "Show me an example" (5-10 minutes, optional but recommended)

The user can provide examples in THREE ways (support all three — different users have different comfort levels):

**Option A: Upload a file**
- PDF of a previous invoice, quote, or contract
- Photo/screenshot from their phone (extremely common — many tradespeople have photos of their invoices on their phone)
- Excel/Word file
- ANTON extracts structure, vocabulary, formatting, and style

**Option B: Paste text**
- Copy-paste from an email, a note, or a message
- Works for customer communications, order templates, etc.

**Option C: Describe it**
- "My invoices have the company name at the top, then customer info, then I list the work and materials separately, then travel, then moms, then total"
- ANTON asks follow-up questions to fill in gaps

**The extraction process:**

When the user provides an example (say, an uploaded invoice PDF), ANTON:

1. **Reads the document** using the existing document processing pipeline
2. **Extracts structure:** What sections exist? In what order? What are they called?
3. **Extracts vocabulary:** "Faktura" vs "Invoice"? "Arbete" vs "Labour"? "Att betala" vs "Total"?
4. **Extracts formatting:** Currency format? Date format? Grouped or mixed line items? Rounding?
5. **Extracts business rules:** Does travel appear separately? Is VAT broken out? Is hourly rate shown?
6. **Presents back to the user for confirmation:**

```
ANTON: "Jag har studerat din faktura. Så här förstår jag det:

        ✅ Du skriver 'Faktura' som rubrik
        ✅ Du grupperar 'Arbete' och 'Material' separat
        ✅ Restid är en egen rad till lägre pris
        ✅ Du visar timpris × antal timmar
        ✅ Moms redovisas separat (25%)
        ✅ Du avrundar totalen till närmaste 10-tal
        ✅ Betalningsvillkor: 20 dagar
        ✅ Bankgiro längst ner
        ✅ Dina fakturanummer ser ut som 'E-2026-047'
        
        Stämmer det? Något jag missade?"

User:  "Ja det stämmer. Men jag brukar också ha med 'Er referens' 
        överst — kundens namn eller referensperson."

ANTON: "Noterat! Jag lägger till 'Er referens' som ett fält jag 
        alltid frågar efter. Vill du visa mig fler exempel, 
        eller kör vi med detta?"
```

The confirmation step is essential. The user must verify that ANTON understood correctly. This builds trust AND catches extraction errors.

**Multiple examples make it better:** If the user provides 2-3 invoices, ANTON can identify which parts are consistent (the template) vs. which parts vary (the job-specific content). This makes the template more robust.

#### Phase 3: "How do you usually do this?" (5-10 minutes per process, optional)

For users who want to go deeper, ANTON can learn entire processes:

```
ANTON: "Vill du visa mig hur du brukar göra när du fakturerar? 
        Jag kan lära mig ditt sätt så att jag vet exakt vad 
        jag ska fråga dig varje gång."

User:  "Ja, okej. Vanligtvis när jag är klar med ett jobb så 
        skriver jag ner vad jag gjort, hur många timmar, och 
        vad materialet kostade. Sen räknar jag ut resan — 
        det brukar vara en timme dit och tillbaka om det inte 
        är i stan. Privatkunder som vill ha ROT-avdrag behöver 
        jag räkna ut det separat."

ANTON: "Bra, jag förstår. Så varje gång du vill fakturera 
        behöver jag veta:
        
        1. Vilken kund (namn, adress)
        2. Vad du gjort (kort beskrivning räcker)
        3. Antal arbetstimmar
        4. Materialkostnad
        5. Restid (eller 'i stan' = ingen restid)
        6. Privat eller företag? (för ROT-avdrag)
        
        Är det allt, eller brukar du behöva mer?"

User:  "Ibland har jag en lärling med mig, då tar jag 
        halvt pris för hans tid."

ANTON: "Noterat: ibland extra person, halva timpriset. 
        Jag frågar om det varje gång. 
        
        Något annat? Hur gör du med garantier — 
        skriver du något om garanti på fakturan?"

User:  "Ja, 2 års garanti på arbetet, inte på materialet."

ANTON: "Perfekt. Det lägger jag in som standard på alla 
        fakturor. Du behöver aldrig skriva det igen."
```

**What ANTON captured from this conversation:**

```json
{
  "patternId": "how-erik-invoices",
  "processType": "invoicing",
  "requiredInputs": [
    {"id": "customer_name", "label": "Kund", "alwaysNeeded": true, 
     "promptQuestion": "Vilken kund?"},
    {"id": "customer_address", "label": "Adress", "alwaysNeeded": true,
     "promptQuestion": "Adress?"},
    {"id": "job_description", "label": "Vad gjordes", "alwaysNeeded": true,
     "promptQuestion": "Vad har du gjort? (kort räcker)"},
    {"id": "hours_worked", "label": "Timmar", "alwaysNeeded": true,
     "promptQuestion": "Hur många timmar tog det?"},
    {"id": "materials_cost", "label": "Material", "alwaysNeeded": true,
     "promptQuestion": "Vad kostade materialet? (0 om inget)"},
    {"id": "travel_time", "label": "Restid", "alwaysNeeded": true,
     "promptQuestion": "Restid? (skriv 'i stan' om ingen)"},
    {"id": "customer_type", "label": "Kundtyp", "alwaysNeeded": true,
     "promptQuestion": "Privat eller företag?",
     "options": ["Privat", "Företag"]},
    {"id": "apprentice_hours", "label": "Lärling", "alwaysNeeded": false,
     "promptQuestion": "Hade du lärlingen med dig? Hur många timmar?",
     "conditional": "ask every time — user said 'ibland'"},
    {"id": "rot_deduction", "label": "ROT-avdrag", "alwaysNeeded": false,
     "derivedFrom": "if customer_type == 'Privat', calculate ROT automatically"}
  ],
  "rules": [
    {"rule": "Travel rate is 450 SEK/hour, not the full 650", "applies": "invoicing"},
    {"rule": "Apprentice rate is half: 325 SEK/hour", "applies": "invoicing"},
    {"rule": "ROT deduction applies only to private customers, only to labour", "applies": "invoicing"},
    {"rule": "Always include '2 års garanti på arbetet' on invoice", "applies": "invoicing"},
    {"rule": "Round total to nearest 10 SEK", "applies": "invoicing"},
    {"rule": "Material has no warranty from Erik — manufacturer warranty applies", "applies": "invoicing"}
  ]
}
```

---

## 4. How It Works in Daily Use

### The "Fast Path" — After Setup

Once ANTON knows Erik's way, the invoicing experience is radically different from a generic module:

**Without "My Way of Working" (generic module):**
```
Module: Invoice Generator
[Large form with 10+ fields]
[User fills everything in]
[Output comes back in generic format]
[User manually adjusts layout, vocabulary, terms]
[20 minutes saved, maybe]
```

**With "My Way of Working" (Erik's module):**
```
Erik opens Quick Admin, types: "Fakturera Svensson badrumsrenoveringen"

ANTON: "Badrummet hos Svensson. Några snabba frågor:
        
        Hur många timmar?         [___]
        Materialkostnad?          [___] kr
        Restid dit och tillbaka?  [___] timmar (eller 'i stan')
        Lärlingen med?            [Ja ▼] Hur många tim? [___]
        Privat eller företag?     [Privat ▼]"

Erik: "16 timmar, material 8400 kr, 1.5 timmar resa, 
       ja lärlingen 12 timmar, privat"

ANTON generates invoice that looks EXACTLY like Erik's invoices always look:
```

```
═══════════════════════════════════════════════════
   Erik Lindström VVS
   Kungsgatan 12, 111 35 Stockholm
   Tel: 070-123 45 67 | erik@lindstromvvs.se
   Org.nr: 880515-1234 | F-skattsedel
   Momsreg.nr: SE880515123401
═══════════════════════════════════════════════════

   FAKTURA                        Fakturanr: E-2026-048
                                  Datum: 2026-02-28
                                  Förfallodatum: 2026-03-20

   Kund: Lars Svensson
   Adress: Björkvägen 7, 171 54 Solna
   Er referens: Lars Svensson

───────────────────────────────────────────────────
   ARBETE
───────────────────────────────────────────────────
   Badrumsrenovering —            16 tim × 650 kr    10 400,00 kr
   VVS-installation och
   rördragning, anslutning
   av handfat, dusch och
   toalettstol

   Lärling, medhjälpare           12 tim × 325 kr     3 900,00 kr

───────────────────────────────────────────────────
   MATERIAL
───────────────────────────────────────────────────
   Material enligt kvitton                             8 400,00 kr
   (specifikation bifogas
   på begäran)

───────────────────────────────────────────────────
   RESEKOSTNAD
───────────────────────────────────────────────────
   Resa Stockholm–Solna           1,5 tim × 450 kr      675,00 kr
   (tur och retur)

───────────────────────────────────────────────────
   SAMMANSTÄLLNING
───────────────────────────────────────────────────
   Arbete                                             14 300,00 kr
   Material                                            8 400,00 kr
   Resa                                                  675,00 kr
   ─────────────────────────────────────────
   Summa exkl. moms                                   23 375,00 kr
   Moms (25%)                                          5 843,75 kr
   ─────────────────────────────────────────
   
   ROT-avdrag (30% på arbete)                         -4 290,00 kr
   
   ═════════════════════════════════════════
   ATT BETALA                                         24 930,00 kr
   ═════════════════════════════════════════

   2 års garanti på arbetet. Garanti på material
   enligt respektive tillverkares villkor.

───────────────────────────────────────────────────
   Betalning: Bankgiro 123-4567
   Ange fakturanummer E-2026-048 som referens
   
   Vid försenad betalning tillkommer dröjsmålsränta
   enligt räntelagen.
───────────────────────────────────────────────────
   Auktoriserad VVS-installatör | Safe Water-certifierad
═══════════════════════════════════════════════════
```

**Erik looks at this and thinks:** "Yeah, that's my invoice. That's exactly how I do it." Because it IS how he does it — ANTON learned from his examples.

**Time spent:** 45 seconds to answer the questions. The invoice Erik would have spent 20-30 minutes creating in Excel. And the ROT deduction was calculated automatically because ANTON knows the rules.

---

## 5. Learning Beyond Invoices — All Process Types

### Quoting

Same principle. Erik shows ANTON an example quote, ANTON learns:
- His quote layout (different from invoice — includes validity period, scope description)
- His pricing approach (does he quote fixed price or estimate? how does he handle uncertainty?)
- His standard exclusions ("Priset inkluderar inte eventuella fuktskador som upptäcks vid rivning")
- His follow-up pattern ("Offerten gäller i 30 dagar")

**Smart questions for quoting are different from invoicing:**
```
ANTON: "Ny offert. Vad behöver jag veta?
        
        Kund?                     [___]
        Vad ska göras?            [___]
        Ungefär hur stort jobb?   [Litet (1-2 dagar) ▼]
        Har du tittat på det?     [Ja, hembesök gjort ▼]
        Fast pris eller uppskattning?  [Uppskattning ▼]"
```

### Ordering Materials

Capture how the user typically orders:
- Which suppliers do they use? (Ahlsell, Dahl, Bauhaus, local supplier?)
- Do they order per job or keep stock?
- How do they track what's been ordered vs. delivered?
- Do they add markup to materials when invoicing?

```
ANTON learns: "Erik orders from Ahlsell for VVS-material and 
Bauhaus for general supplies. He adds 15% markup on materials. 
He keeps a running list per job and reconciles against invoices."

Smart question when Erik starts a job:
"Behöver du beställa material för det här jobbet? 
 Ska jag göra en materiallista baserat på jobbeskrivningen?"
```

### Customer Communication

Capture tone, greeting style, sign-off, typical message length:

```
From 3 example emails, ANTON learns:
- Erik writes "Hej {name}!" (casual, exclamation mark)
- Messages are 2-4 sentences, never long
- He signs off "Mvh Erik" (not full name, not company)
- For bad news (delay, price increase): slightly longer, more careful phrasing
- For confirmations: very brief, almost SMS-style
```

Then when Erik asks for a customer message:
```
Erik: "Skriv till Svensson att vi kommer på torsdag istället, 
       röret jag behövde var slut"

ANTON: "Hej Lars! Tyvärr behöver vi flytta till torsdag — 
        röret som behövs till badrumsanslutningen var tillfälligt 
        slut hos leverantören. Jag har beställt och det kommer 
        onsdag, så torsdag morgon kör vi vidare. Mvh Erik"
```

This sounds like Erik. Because it IS how Erik writes. Not corporate. Not AI. Erik.

### Scheduling / Organisation

Capture how the user manages their calendar and jobs:
- Do they use a paper diary, phone calendar, or app?
- How far ahead do they book?
- Do they keep a waiting list?
- How do they handle emergency calls?

This doesn't generate a document — it informs how ANTON asks about availability and suggests scheduling.

---

## 6. The Learning Loop — Getting Smarter Over Time

### Corrections Are Gold

Every time Erik corrects an output, ANTON learns:

```
ANTON generates invoice → Erik edits "Badrumsrenovering" to 
"Badrumsrenovering inkl. ny golvbrunn"

ANTON notes: "Erik prefers more detailed job descriptions 
on invoices than what he provides in his brief input. 
Next time, ask: 'Vill du lägga till mer detaljer i 
jobbeskrivningen?'"
```

Or:

```
ANTON generates quote with 30-day validity → Erik changes to 14 days

ANTON: "Jag ser att du ändrade giltighetstiden till 14 dagar. 
        Vill du att jag alltid ska sätta 14 dagar som standard?"

Erik: "Ja, 14 dagar på offerter."

ANTON updates process pattern: quoteValidityDays = 14
```

### Passive Learning (Apprentice Integration)

The existing Apprentice Model (Section 14 of the whitepaper) tracks configuration preferences. The "My Way of Working" system extends this to content and process patterns:

```
Apprentice observes:
- Erik always runs invoices on Sonnet (never switches to Opus) → lock default
- Erik generates 3-4 invoices every Friday afternoon → suggest batch mode
- Erik's quote-to-invoice conversion rate is 70% → surface this metric
- Erik always adds the certification note → make it template-permanent
```

### Active Learning (Ask and Confirm)

Periodically, ANTON can ask:

```
ANTON: "Jag har märkt att du de senaste 5 fakturorna alltid 
        lagt till 'Återställning av arbetsyta' som en rad. 
        Vill du att det ska vara standard?"
        
        [Ja, lägg till som standard]  [Nej, bara ibland]
```

This is the Apprentice Model's "Guided Practitioner" stage applied to business patterns rather than platform settings.

---

## 7. Implementation: How This Connects to the Platform

### Injection Into the Prompt Builder

The "My Way of Working" data feeds into the existing seven-layer prompt builder as a new enrichment:

```
Layer 1: Base System Prompt (ANTON's core identity)
Layer 2: Area Context (Trades & Service Workers)
Layer 3: Module Prompt (Invoice Generator)
Layer 4: Persona (Trade Business Advisor)
Layer 5: Skills (Tax rules, consumer law)
Layer 6: Knowledge Sources (uploaded docs, web)
Layer 7: User Context (user profile)
  └── NEW: Business Identity Profile
  └── NEW: Document Template (matched to task)
  └── NEW: Process Pattern (matched to task)
```

The Business Identity, relevant Document Template, and relevant Process Pattern are injected into the prompt as structured context. The system prompt then says:

```markdown
## User's Business Identity
{businessIdentity as structured text}

## User's Invoice Template
The user's invoices follow this exact structure:
{documentTemplate as structured text}

## User's Invoicing Process
When creating invoices, the user needs these inputs and follows these rules:
{processPattern as structured text}

## YOUR JOB
Generate an invoice that matches the user's template EXACTLY. 
Use their vocabulary, their formatting, their structure. 
Do not improve, modernise, or standardise. 
The goal is that the user cannot tell whether they or ANTON created it.
```

### Module Adaptation

When a Document Template exists for a module's output type, the module adapts:

1. **Guided inputs change** — Instead of generic "Job description, Customer name, Amount" fields, the module shows the user's own fields from their Process Pattern. Erik sees "Timmar? Material? Restid? Lärlingen?" — because that's what HE needs for an invoice.

2. **Smart questions change** — Based on the Process Pattern's `smartQuestions`, ANTON asks follow-ups that match the user's process. If Erik always invoices travel separately, ANTON always asks about travel.

3. **Output changes** — The generated document uses the Document Template's structure, vocabulary, and formatting instead of a generic template.

4. **Calculations change** — Business rules from the Process Pattern are applied automatically (apprentice half-rate, material markup, ROT deduction logic).

### The "No Template" Fallback

If the user hasn't set up "My Way of Working" (or for a document type they haven't provided an example for), the module falls back to a sensible, clean default template. The system should STILL encourage template learning:

```
ANTON: "Här är en faktura med standardlayout. Om du vill att 
        fakturorna ska se ut som dina vanliga, visa mig ett 
        exempel så lär jag mig ditt format. Det tar 5 minuter 
        och sen blir alla fakturor dina."
```

---

## 8. Platform-Level Applicability

### This Is Not Just for Trades

While this capability is *essential* for the Trades area (it's the adoption gate), it's valuable across the platform:

**Consulting (Area 4):** "This is how our firm formats deliverables" — learn report structure, terminology, branding
**Legal (Area 2):** "This is how I write contract clauses" — learn the lawyer's drafting style
**Communication (Area 18):** "This is my company's tone of voice" — learn brand voice from examples
**Academic (Area 20):** "This is how my department formats citations" — learn citation style preferences

**The pattern is universal:** user provides examples → ANTON extracts the template → future outputs match the user's style. The Trades area just makes it explicit and mandatory because the adoption stakes are highest.

### Suggested Platform Implementation

```
New settings area: "My Way of Working" (or "Mitt Sätt" in Swedish)
  ├── Business Identity (global, applies everywhere)
  ├── Document Templates (per document type)
  │     ├── Invoice template
  │     ├── Quote template  
  │     ├── Contract template
  │     ├── Email style
  │     └── + Add template...
  ├── Process Patterns (per process)
  │     ├── How I invoice
  │     ├── How I quote
  │     ├── How I order materials
  │     └── + Add process...
  └── Learning Log (what ANTON has learned, user can review/edit/delete)
```

For non-Trades areas, this is accessible but optional. For the Trades area, the setup wizard makes it the recommended first step.

---

## 9. Privacy and Data Sensitivity

**All "My Way of Working" data is stored locally.** This is non-negotiable for two reasons:

1. **Business-sensitive information:** Business rates, customer names, pricing strategies — this data must never leave the user's machine.

2. **Trust:** These users are already sceptical of technology. "Your business data stays on your computer and is never sent anywhere" is a trust-building statement.

The only data that leaves the machine is the prompt sent to the LLM API — and that prompt contains the template structure and business rules, NOT customer lists or financial data. The LLM needs to know "format invoices with Arbete and Material as separate sections, round to nearest 10 SEK" but does NOT need to know "Erik's customer list" or "Erik's annual revenue."

---

## 10. Implementation Priority Within the Trades Area

The original spec listed module implementation priority. This addendum changes the order:

```
Phase 0 (BUILD FIRST — before any modules):
  → Business Identity setup wizard
  → Document Template extraction engine  
  → Process Pattern capture system
  → Prompt builder integration (Layer 7 enrichment)

Phase 1 (First modules — now with "My Way" support):
  → Invoice Generator (with template learning)
  → Job Quote Builder (with template learning)
  → Customer Comms (with tone learning)

Phase 2 onwards: as per original spec
```

**Phase 0 is non-negotiable.** Without "My Way of Working," the Trades modules are just another generic AI tool. With it, they're the first AI tool that actually works like the user already works.

---

## 11. Success Metric

**The single metric that tells us whether this capability works:**

> After setup, does the user need to edit the output before sending it to their customer?

If the answer is "no, I just sent it as-is" — we've succeeded. The output was indistinguishable from what the user would have produced themselves.

If the answer is "I had to change a few things" — we capture those changes, learn from them, and get closer to "no edits needed" next time.

**Target: 80% of outputs sent without edits within 2 weeks of setup.**

---

**End of addendum. This capability is what makes the Trades area transformative rather than incremental. Build it first, build it well, and build it in a way that respects these users' expertise and identity.**
