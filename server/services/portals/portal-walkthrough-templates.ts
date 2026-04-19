/**
 * portal-walkthrough-templates.ts — the 7 v0.7.x starter templates.
 *
 * Per Spec v0.2 §E.2 + §A.3 (locked decision: 7-template ship set).
 * Each template is a structured walkthrough configuration: which template
 * the user picked seeds the recommended category, the starter pages, the
 * default capability set, and per-phase guidance hints the engine folds
 * into the LLM system prompt.
 *
 * Templates are deliberately data-only (no logic). The walkthrough engine
 * consumes them.
 */

import type { CapabilityVerb, PORTAL_CATEGORIES } from '../capability-descriptor/schema.js';

export type PortalCategory = (typeof PORTAL_CATEGORIES)[number];

// ── Shape ───────────────────────────────────────────────────────────────────

export interface PortalTemplate {
  id: string;
  label: string;
  description: string;
  recommendedCategory: PortalCategory;
  /** Pages seeded into portal_pages on finalize (interpolation-ready HTML). */
  seedPages: SeedPage[];
  /** Default capabilities offered (user can add/remove in Phase 5). */
  defaultCapabilities: SeedCapability[];
  /** Per-phase guidance hints folded into the LLM system prompt. */
  phaseHints: Partial<Record<PhaseId, string>>;
}

export interface SeedPage {
  path: string;
  title: string;
  html: string;
  sortOrder: number;
}

export interface SeedCapability {
  id: string;
  verb: CapabilityVerb;
  title: string;
  description: string;
  aapEndpoint: string;
  paymentDefault?: 'free' | 'paid';
}

export type PhaseId =
  | 'intent'
  | 'identity'
  | 'content_structure'
  | 'content_generation'
  | 'capabilities'
  | 'aesthetics'
  | 'review'
  | 'publish';

// ── 1. Personal ─────────────────────────────────────────────────────────────

const PERSONAL: PortalTemplate = {
  id: 'personal',
  label: 'Personal',
  description: '"This is me" portal: about, contact, links, optional blog.',
  recommendedCategory: 'personal',
  seedPages: [
    {
      path: '/',
      title: 'Home',
      sortOrder: 0,
      html: `<header><h1>{{portal.displayTitle}}</h1></header>
<main>
  <p>{{data.intro.tagline}}</p>
  <p>{{data.intro.about}}</p>
  <p><a href="/contact">Get in touch</a> · <a href="/links">My links</a></p>
</main>`,
    },
    {
      path: '/contact',
      title: 'Contact',
      sortOrder: 1,
      html: `<h1>Contact me</h1>
<p>Use the message capability on this portal, or reach me at <code>{{data.contact.address}}</code>.</p>`,
    },
    {
      path: '/links',
      title: 'Links',
      sortOrder: 2,
      html: `<h1>Links</h1>
<ul>{{#each link}}<li><a href="{{url}}">{{label}}</a></li>{{/each}}</ul>`,
    },
  ],
  defaultCapabilities: [
    { id: 'contact-me', verb: 'contact', title: 'Send me a message', description: 'Free-form message via my ANTON.', aapEndpoint: 'messages', paymentDefault: 'free' },
  ],
  phaseHints: {
    intent: 'Personal portal: emphasise authenticity. Ask the user what they want visitors to take away in one sentence.',
    capabilities: 'Default to messaging-only. Suggest `subscribe` if the user mentions a blog or updates.',
  },
};

// ── 2. Business ─────────────────────────────────────────────────────────────

const BUSINESS: PortalTemplate = {
  id: 'business',
  label: 'Business',
  description: 'Small business homepage: services, hours, location, contact, optional listings.',
  recommendedCategory: 'business',
  seedPages: [
    {
      path: '/',
      title: 'Home',
      sortOrder: 0,
      html: `<header><h1>{{portal.displayTitle}}</h1><p>{{data.business.tagline}}</p></header>
<main>
  <section><h2>What we do</h2><p>{{data.business.about}}</p></section>
  <section><h2>Services</h2><ul>{{#each service}}<li><strong>{{title}}</strong> — {{summary}}</li>{{/each}}</ul></section>
  <section><h2>Get in touch</h2><p><a href="/contact">Send an enquiry</a> for availability and pricing.</p></section>
</main>`,
    },
    {
      path: '/services',
      title: 'Services',
      sortOrder: 1,
      html: `<h1>Services</h1>
<ul>{{#each service}}<li><h3>{{title}}</h3><p>{{description}}</p></li>{{/each}}</ul>`,
    },
    {
      path: '/contact',
      title: 'Contact',
      sortOrder: 2,
      html: `<h1>Contact us</h1>
<p>Hours: {{data.business.hours}}</p>
<p>Location: {{data.business.location}}</p>
<p>Use the inquiry capability to ask about pricing or scheduling.</p>`,
    },
  ],
  defaultCapabilities: [
    { id: 'contact-business', verb: 'contact', title: 'Send a message', description: 'General message.', aapEndpoint: 'messages', paymentDefault: 'free' },
    { id: 'service-inquiry', verb: 'inquire', title: 'Ask about a service', description: 'Get availability, lead time, pricing.', aapEndpoint: 'inquiries', paymentDefault: 'free' },
  ],
  phaseHints: {
    intent: 'Small business portal: ask about ICP (ideal customer profile), what visitors most often need to know, regulatory disclosures applicable.',
    capabilities: 'Default to messaging + inquiry. Suggest `request` for engagement-style sales; `book` if appointments are involved.',
  },
};

// ── 3. Community / Group ────────────────────────────────────────────────────

const COMMUNITY: PortalTemplate = {
  id: 'community',
  label: 'Community',
  description: 'Group of people with shared interest: about, members, events, discussions.',
  recommendedCategory: 'community',
  seedPages: [
    {
      path: '/',
      title: 'Home',
      sortOrder: 0,
      html: `<header><h1>{{portal.displayTitle}}</h1></header>
<main>
  <p>{{data.community.purpose}}</p>
  <p><strong>Members:</strong> {{data.community.member_count}} · <strong>Founded:</strong> {{data.community.founded}}</p>
  <p><a href="/events">Upcoming events</a> · <a href="/join">Apply to join</a></p>
</main>`,
    },
    {
      path: '/events',
      title: 'Events',
      sortOrder: 1,
      html: `<h1>Events</h1>
<ul>{{#each event}}<li><strong>{{title}}</strong> — {{date}} ({{location}})<br>{{summary}}</li>{{/each}}</ul>`,
    },
    {
      path: '/join',
      title: 'Join',
      sortOrder: 2,
      html: `<h1>Apply to join</h1>
<p>{{data.community.join_intro}}</p>
<p>Use the join capability to apply.</p>`,
    },
  ],
  defaultCapabilities: [
    { id: 'contact-community', verb: 'contact', title: 'Message the organisers', description: 'Get a human to respond.', aapEndpoint: 'messages', paymentDefault: 'free' },
    { id: 'apply-to-join', verb: 'join', title: 'Apply to join', description: 'Submit a membership application.', aapEndpoint: 'applications', paymentDefault: 'free' },
    { id: 'subscribe-events', verb: 'subscribe', title: 'Get event updates', description: 'Receive notifications about upcoming events.', aapEndpoint: 'subscriptions', paymentDefault: 'free' },
  ],
  phaseHints: {
    intent: 'Community portal: emphasise inclusion and clarity of membership criteria. Ask about charter, governance, dues.',
    capabilities: 'Defaults: messaging + join + subscribe. Suggest `book` if member events are bookable resources.',
  },
};

// ── 4. Commerce ─────────────────────────────────────────────────────────────

const COMMERCE: PortalTemplate = {
  id: 'commerce',
  label: 'Commerce',
  description: 'Product or service sales: catalog, pricing, ordering, FutureChain payment.',
  recommendedCategory: 'commerce',
  seedPages: [
    {
      path: '/',
      title: 'Home',
      sortOrder: 0,
      html: `<header><h1>{{portal.displayTitle}}</h1><p>{{data.commerce.tagline}}</p></header>
<main>
  <section><h2>What we sell</h2><p>{{data.commerce.about}}</p></section>
  <p><a href="/catalog">View catalog</a> · <a href="/contact">Contact us</a></p>
</main>`,
    },
    {
      path: '/catalog',
      title: 'Catalog',
      sortOrder: 1,
      html: `<h1>Catalog</h1>
<ul>{{#each product}}<li><h3>{{name}}</h3><p>{{description}}</p><p><strong>Price:</strong> {{price}} {{currency}}</p></li>{{/each}}</ul>
<p>Use the order capability to place an order.</p>`,
    },
    {
      path: '/contact',
      title: 'Contact',
      sortOrder: 2,
      html: `<h1>Contact us</h1>
<p>Send a message with any pre-purchase question.</p>`,
    },
  ],
  defaultCapabilities: [
    { id: 'contact-shop', verb: 'contact', title: 'Send a message', description: 'Pre-purchase questions.', aapEndpoint: 'messages', paymentDefault: 'free' },
    { id: 'order-product', verb: 'order', title: 'Place an order', description: 'Order a product from the catalog.', aapEndpoint: 'orders', paymentDefault: 'paid' },
    { id: 'pay-invoice', verb: 'pay', title: 'Settle an invoice', description: 'Pay a previously-issued invoice.', aapEndpoint: 'payments', paymentDefault: 'paid' },
  ],
  phaseHints: {
    intent: 'Commerce portal: ask about regulatory needs (consumer-protection disclosures, VAT, refund policy).',
    capabilities: 'Defaults: messaging + order + pay. Always set paymentCoupling.required for `order`. Confirm the FutureChain payment method ids.',
  },
};

// ── 5. Team ────────────────────────────────────────────────────────────────

const TEAM: PortalTemplate = {
  id: 'team',
  label: 'Team',
  description: 'Sports/project/any team: roster, schedule, results, announcements.',
  recommendedCategory: 'team',
  seedPages: [
    {
      path: '/',
      title: 'Home',
      sortOrder: 0,
      html: `<header><h1>{{portal.displayTitle}}</h1></header>
<main>
  <p>{{data.team.about}}</p>
  <p><a href="/roster">Roster</a> · <a href="/schedule">Schedule</a> · <a href="/results">Results</a></p>
</main>`,
    },
    {
      path: '/roster',
      title: 'Roster',
      sortOrder: 1,
      html: `<h1>Roster</h1>
<ul>{{#each member}}<li><strong>{{name}}</strong> — {{role}}</li>{{/each}}</ul>`,
    },
    {
      path: '/schedule',
      title: 'Schedule',
      sortOrder: 2,
      html: `<h1>Schedule</h1>
<ul>{{#each match}}<li>{{date}} — {{opponent}} ({{location}})</li>{{/each}}</ul>`,
    },
    {
      path: '/results',
      title: 'Results',
      sortOrder: 3,
      html: `<h1>Results</h1>
<ul>{{#each result}}<li>{{date}} vs {{opponent}}: {{score}}</li>{{/each}}</ul>`,
    },
  ],
  defaultCapabilities: [
    { id: 'contact-team', verb: 'contact', title: 'Message the team', description: 'Goes to the coach.', aapEndpoint: 'messages', paymentDefault: 'free' },
    { id: 'subscribe-results', verb: 'subscribe', title: 'Get result updates', description: 'Notified after each match.', aapEndpoint: 'subscriptions', paymentDefault: 'free' },
    { id: 'team-query', verb: 'query', title: 'Quick query', description: 'Ask "next match", "last result", etc.', aapEndpoint: 'queries', paymentDefault: 'free' },
  ],
  phaseHints: {
    intent: 'Team portal: clarify the team kind (sports / project / volunteer / esports) — content shape varies a lot.',
    capabilities: 'Defaults: messaging + subscribe + query. Suggest `book` for venue bookings; `join` for try-outs.',
  },
};

// ── 6. Creator ─────────────────────────────────────────────────────────────

const CREATOR: PortalTemplate = {
  id: 'creator',
  label: 'Creator',
  description: 'Artist/writer/musician showcase: portfolio, works, news, booking.',
  recommendedCategory: 'creator',
  seedPages: [
    {
      path: '/',
      title: 'Home',
      sortOrder: 0,
      html: `<header><h1>{{portal.displayTitle}}</h1><p>{{data.creator.tagline}}</p></header>
<main>
  <p>{{data.creator.bio}}</p>
  <p><a href="/works">Works</a> · <a href="/booking">Booking</a></p>
</main>`,
    },
    {
      path: '/works',
      title: 'Works',
      sortOrder: 1,
      html: `<h1>Works</h1>
<ul>{{#each work}}<li><h3>{{title}}</h3><p>{{description}}</p></li>{{/each}}</ul>`,
    },
    {
      path: '/booking',
      title: 'Booking',
      sortOrder: 2,
      html: `<h1>Booking enquiries</h1>
<p>Use the booking capability for collaborations, commissions, or appearances.</p>`,
    },
  ],
  defaultCapabilities: [
    { id: 'contact-creator', verb: 'contact', title: 'Send a message', description: 'General messages.', aapEndpoint: 'messages', paymentDefault: 'free' },
    { id: 'booking-inquiry', verb: 'inquire', title: 'Booking enquiry', description: 'Collaborations, commissions, appearances.', aapEndpoint: 'inquiries', paymentDefault: 'free' },
    { id: 'subscribe-news', verb: 'subscribe', title: 'Get news', description: 'New work + tour updates.', aapEndpoint: 'subscriptions', paymentDefault: 'free' },
  ],
  phaseHints: {
    intent: 'Creator portal: ask whether commissions are open, what genres/media, what the booking workflow looks like.',
    capabilities: 'Defaults: messaging + inquiry + subscribe. Suggest `order` if the creator sells direct.',
  },
};

// ── 7. Bulletin ────────────────────────────────────────────────────────────

const BULLETIN: PortalTemplate = {
  id: 'bulletin',
  label: 'Bulletin',
  description: 'Lightweight single-page announcement or event page.',
  recommendedCategory: 'bulletin',
  seedPages: [
    {
      path: '/',
      title: 'Notice',
      sortOrder: 0,
      html: `<header><h1>{{data.bulletin.headline}}</h1></header>
<main>
  <p>{{data.bulletin.body}}</p>
  <p><strong>When:</strong> {{data.bulletin.when}}</p>
  <p><strong>Where:</strong> {{data.bulletin.where}}</p>
  <p><strong>Contact:</strong> {{data.bulletin.contact}}</p>
</main>`,
    },
  ],
  defaultCapabilities: [
    { id: 'contact-bulletin', verb: 'contact', title: 'Reply', description: 'Reach the publisher.', aapEndpoint: 'messages', paymentDefault: 'free' },
  ],
  phaseHints: {
    intent: 'Bulletin: keep it to one page. Clarify the deadline / event date and the desired reply path.',
    capabilities: 'Default to messaging only. Resist scope creep — bulletins are deliberately small.',
  },
};

// ── Registry ────────────────────────────────────────────────────────────────

export const PORTAL_TEMPLATES: Record<string, PortalTemplate> = {
  personal: PERSONAL,
  business: BUSINESS,
  community: COMMUNITY,
  commerce: COMMERCE,
  team: TEAM,
  creator: CREATOR,
  bulletin: BULLETIN,
};

export function getTemplate(id: string): PortalTemplate | undefined {
  return PORTAL_TEMPLATES[id];
}

export function listTemplates(): PortalTemplate[] {
  return Object.values(PORTAL_TEMPLATES);
}
