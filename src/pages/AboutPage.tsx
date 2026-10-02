/**
 * AboutPage — /about, readable signed in and signed out (App.tsx renders it
 * before the sign-in check, as it does /privacy and /terms).
 *
 * Says what ANTON is, who made it, which AI models the server reports, the
 * version the server reports, and that answers must be checked by a
 * qualified person. The models are named only from what /api/config says: a
 * demo publishes its offered models and its default; any other server
 * publishes no model before sign-in, so the text there speaks generally.
 *
 * It calls nothing but the public /api/config (useDemoStore), so a demo
 * visitor, who is not an admin, never reaches a route the demo allowlist
 * closes (server/middleware/demo-mode.ts). It uses the app's theme tokens,
 * so it follows the light, dark and corporate themes.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AntonMark from '@/components/shared/AntonMark';
import { useDemoStore } from '@/stores/useDemoStore';
import { demoModelLineup, sharedModelRoute } from '@/lib/demo-model-names';

const LINK = 'text-adv-teal underline hover:text-adv-teal-dark';

export default function AboutPage() {
  const config = useDemoStore((s) => s.config);
  const version = useDemoStore((s) => s.version);
  const load = useDemoStore((s) => s.load);
  useEffect(() => { void load(); }, [load]);

  const lineup = config.demoMode ? demoModelLineup(config) : [];
  const route = sharedModelRoute(lineup.map((m) => m.id));

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <header className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-teal">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to ANTON
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-10 pt-8 text-[15px] leading-relaxed sm:px-6">
        <div className="flex items-center gap-4">
          <AntonMark size={56} className="shrink-0 rounded-xl" />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">About ANTON</h1>
            <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-adv-teal">by openEXPERT</p>
          </div>
        </div>

        <p className="mt-6 text-xl font-semibold">Created by Daniel Bardun.</p>
        {config.demoMode && config.operatorName && (
          <p className="mt-1 text-adv-gray">This demo is operated by {config.operatorName}.</p>
        )}

        <section aria-labelledby="about-what" className="mt-8">
          <h2 id="about-what" className="text-lg font-semibold">What ANTON is</h2>
          <p className="mt-2">
            ANTON is a workspace for professional work with AI. You pick a module set up for one kind of task, such as
            a compliance gap assessment, a contract review or a policy draft, add your own documents and sources, and
            get a structured answer you can check, edit and export to Word, Excel, PDF or PowerPoint. ANTON runs on a
            computer or server its owner controls: the documents stay there, and only what a run needs is sent to the
            AI model.
          </p>
        </section>

        <section aria-labelledby="about-models" className="mt-8">
          <h2 id="about-models" className="text-lg font-semibold">AI models</h2>
          {lineup.length > 0 ? (
            <>
              <p className="mt-2">
                On this demo, answers come from {lineup.length === 1 ? 'this model' : 'these models'}
                {route ? `, reached through ${route}` : ''}.
                {lineup.length > 1 && ' You can choose one in the model list before a run.'}
              </p>
              <ul className="mt-3 space-y-2">
                {lineup.map((m) => (
                  <li key={m.id} className="rounded-lg border border-border bg-adv-card px-4 py-2.5">
                    <span className="block break-words font-semibold">
                      {m.name}
                      {m.isDefault && <span className="font-normal text-adv-gray"> · default</span>}
                    </span>
                    {m.maker && <span className="block break-words text-sm text-adv-gray">Made by {m.maker}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                Where your input is processed and how long it is kept is set out in
                the <Link to={config.privacyPath} className={LINK}>privacy notice</Link>.
              </p>
            </>
          ) : (
            <p className="mt-2">
              ANTON is built around Anthropic&rsquo;s Claude models and can also use models from OpenAI, Azure OpenAI,
              Google (Gemini) and Mistral, local models through Ollama, and other OpenAI-compatible services. Whoever
              runs this server chooses which models it offers, and you can pick one for each run.
              {config.demoMode && ' The privacy notice names the models this demo uses.'}
            </p>
          )}
        </section>

        <div role="note" className="mt-8 rounded-xl border-2 border-adv-gold/60 bg-adv-gold/10 px-4 py-3 font-medium">
          Answers are AI-generated and must be checked by a qualified person. They are not legal advice.
        </div>

        {version && (
          <section aria-labelledby="about-version" className="mt-8">
            <h2 id="about-version" className="text-lg font-semibold">Version</h2>
            <p className="mt-2">ANTON {version}</p>
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-2xl border-t border-border px-4 py-6 text-sm sm:px-6">
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link to={config.privacyPath} className={LINK}>Privacy notice</Link>
          {config.demoMode && <Link to={config.termsPath} className={LINK}>Demo terms</Link>}
        </nav>
      </footer>
    </div>
  );
}
