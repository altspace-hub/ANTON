/**
 * PrivacyNoticePage — /privacy, reachable without signing in.
 *
 * A DRAFT for the public demo (DEMO_MODE=true). It is not legal advice and
 * must be reviewed by a lawyer before the demo opens: the controller, the
 * contact details, the legal bases and the transfer safeguards are
 * placeholders in [brackets]. The retention period is read from the server.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDemoStore } from '@/stores/useDemoStore';

/** An owner-supplied value the notice still lacks. */
function Placeholder({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-amber-100 px-1 text-amber-900">[{children}]</mark>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function PrivacyNoticePage() {
  const { config, load } = useDemoStore();
  useEffect(() => { void load(); }, [load]);
  const days = config.demoMode ? config.retentionDays : 30;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0D7D6C]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to ANTON
        </Link>

        <div role="alert" className="mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-[15px] text-red-800">
          <p className="font-bold">DRAFT — not yet reviewed by a lawyer.</p>
          <p className="mt-1">
            This notice must be reviewed and completed before the demo is opened to the public. Everything
            shown as <Placeholder>like this</Placeholder> is still to be filled in by the operator.
          </p>
        </div>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-gray-900">Privacy notice — ANTON public demo</h1>
        <p className="mt-2 text-sm text-gray-500">Version <Placeholder>date</Placeholder></p>

        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[15px] text-amber-900">
          <strong>Please do not enter personal data or client data.</strong> This is a demonstration. Use made-up
          or public information only.
        </div>

        <Section title="Who is responsible">
          <p>
            The controller for the personal data processed in this demo is <Placeholder>controller&apos;s legal name</Placeholder>,{' '}
            <Placeholder>postal address</Placeholder>. Contact: <Placeholder>privacy contact email</Placeholder>.
          </p>
        </Section>

        <Section title="What we process">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Your account:</strong> the username you chose, your password (stored only as a one-way hash), when the account was created and when it expires. We do not ask for your email address.</li>
            <li><strong>What you enter and receive:</strong> your prompts and module inputs, documents you upload and the text taken from them, the AI&apos;s answers, your ratings, and documents you export.</li>
            <li><strong>Security records:</strong> your IP address and technical details of requests in our security and audit logs (sign-in attempts and requests that change data).</li>
            <li><strong>Usage and cost records:</strong> how many tokens each AI call used and what it cost, linked to your account.</li>
          </ul>
        </Section>

        <Section title="Why, and on what legal basis">
          <ul className="list-disc space-y-2 pl-5">
            <li>To provide the demo you signed up for — <Placeholder>legal basis, e.g. GDPR Art. 6(1)(b) or 6(1)(f)</Placeholder>.</li>
            <li>To keep the service secure and prevent abuse — <Placeholder>legal basis, e.g. Art. 6(1)(f), legitimate interest</Placeholder>.</li>
            <li>To keep the cost of the demo under control — <Placeholder>legal basis</Placeholder>.</li>
          </ul>
          <p>
            We do not use your content to train AI models. ANTON&apos;s own learning from past answers is switched off
            on this demo.
          </p>
        </Section>

        <Section title="Who receives it">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Hosting:</strong> <Placeholder>hosting provider, e.g. Bahnhof AB</Placeholder>, with servers in <Placeholder>country</Placeholder>.</li>
            <li>
              <strong>AI processing:</strong> your prompts, module inputs and document text are sent to OpenRouter, Inc.
              (United States), which passes them to the provider of the AI model. On this demo the model is{' '}
              <Placeholder>model name and maker</Placeholder>, served by <Placeholder>model provider(s) and their countries</Placeholder>.{' '}
              <Placeholder>Confirm the zero-data-retention and data-collection settings of the OpenRouter account</Placeholder>.
            </li>
            <li>We use no advertising or analytics services.</li>
            <li><Placeholder>Web fonts: if they are still loaded from Google Fonts, Google receives your IP address — state it here, or remove this line once the fonts are served from the demo server</Placeholder></li>
          </ul>
        </Section>

        <Section title="Transfers outside the EU/EEA">
          <p>
            OpenRouter, Inc. is in the United States, so your content is transferred outside the EU/EEA.{' '}
            <Placeholder>safeguard, e.g. the EU–US Data Privacy Framework or Standard Contractual Clauses</Placeholder>.
          </p>
        </Section>

        <Section title="How long we keep it">
          <ul className="list-disc space-y-2 pl-5">
            <li>Your account, and everything in it — sessions, answers, uploads, ratings — is deleted automatically <strong>{days} days</strong> after you sign up.</li>
            <li>Security, sign-in and audit logs, and exported documents, are deleted after {days} days.</li>
            <li>Cost records are kept without anything that identifies you.</li>
            <li>Backups: <Placeholder>backup retention period</Placeholder>.</li>
          </ul>
        </Section>

        <Section title="Cookies">
          <p>
            Only the cookies the service needs: your sign-in session and protection against cross-site request
            forgery. No tracking cookies.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can ask for access to your data, correction, erasure, restriction, portability, or object to
            processing, and ask us to delete your account before it expires: write to{' '}
            <Placeholder>privacy contact email</Placeholder> and give your username. You may complain to the
            Swedish Authority for Privacy Protection (IMY, imy.se) or the data protection authority where you live.
          </p>
        </Section>

        <Section title="AI answers">
          <p>
            Answers are generated by an AI model and can be wrong. They are not legal, financial or other
            professional advice. No decision with legal effect is made about you automatically.
          </p>
        </Section>
      </div>
    </div>
  );
}
