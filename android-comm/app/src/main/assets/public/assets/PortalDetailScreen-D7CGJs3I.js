import{u as N,a as d,j as e}from"./index-hWUVN_w6.js";import{f as C,a as S,b as F,i as P}from"./portals-pkjUlqlX.js";const A="Portal page",D=`
  :root { color-scheme: light; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: #F5F3EF;
    color: #1A1B2E;
    font-family: 'Inter', 'Helvetica Neue', system-ui, -apple-system, sans-serif;
    -webkit-text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  body {
    padding: 1rem 1.125rem 2rem;
    font-size: 17px;
    line-height: 1.55;
    max-width: 100%;
    overflow-x: hidden;
    word-wrap: break-word;
  }
  h1, h2, h3, h4 { color: #1A1B2E; line-height: 1.25; margin: 1.25rem 0 0.5rem; font-weight: 600; }
  h1 { font-size: 1.55rem; margin-top: 0.25rem; padding-bottom: 0.4rem; border-bottom: 1px solid #EAE7E0; }
  h2 { font-size: 1.3rem; }
  h3 { font-size: 1.1rem; }
  h4 { font-size: 1rem; }
  p { margin: 0.6rem 0; color: #3B3D50; }
  a { color: #0D7D6C; text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 2px; }
  a:active { color: #06655A; }
  strong, b { color: #1A1B2E; font-weight: 600; }
  em, i { color: #3B3D50; }
  ul, ol { margin: 0.6rem 0; padding-left: 1.25rem; color: #3B3D50; }
  li { margin: 0.3rem 0; }
  li::marker { color: #686A7C; }
  blockquote {
    margin: 0.8rem 0;
    padding: 0.25rem 0 0.25rem 0.9rem;
    border-left: 3px solid #0D7D6C;
    color: #4F5267;
  }
  hr { border: 0; border-top: 1px solid #EAE7E0; margin: 1.25rem 0; }
  img, picture, video {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 0.5rem 0;
  }
  code {
    background: #EFECE5;
    color: #1A1B2E;
    padding: 0.1rem 0.35rem;
    border-radius: 0.3rem;
    font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.9em;
    word-break: break-word;
  }
  pre {
    background: #EFECE5;
    color: #1A1B2E;
    padding: 0.75rem 0.9rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.75rem 0;
    font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.9em;
    line-height: 1.45;
  }
  pre code { background: transparent; padding: 0; border-radius: 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.95em;
    display: block;
    overflow-x: auto;
  }
  th, td {
    padding: 0.5rem 0.65rem;
    text-align: left;
    border-bottom: 1px solid #EAE7E0;
  }
  th { background: #FAFAF8; color: #1A1B2E; font-weight: 600; }
  button, input, select, textarea { font: inherit; }
  /* Form controls are blocked by sandbox="" anyway, but keep them visually
     consistent for the rare case where a portal renders a form preview. */
  input, select, textarea {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid #DDD9D2;
    border-radius: 0.5rem;
    background: #FFFFFF;
    color: #1A1B2E;
  }
  /* Very long single-word strings (URLs, hashes) shouldn't blow out the
     viewport on a narrow phone screen. */
  p, li, td, th, h1, h2, h3, h4 { overflow-wrap: anywhere; }
`.trim();function B(r){return r.replace(/[<>"&]/g,o=>({"<":"&lt;",">":"&gt;",'"':"&quot;","&":"&amp;"})[o]??o)}function z(r,o={}){const l=B(o.title??A),t=o.baseCss??D;return`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${l}</title>
<style>${t}</style>
</head>
<body>${r}</body>
</html>`}function L({descriptor:r,onSelectCapability:o}){const{t:l}=N(),[t,n]=d.useState(null),[x,m]=d.useState("/"),[c,j]=d.useState(null),[s,p]=d.useState(!0),[b,h]=d.useState(null),[g,a]=d.useState(!1),[v,u]=d.useState(!1);d.useEffect(()=>{let i=!1;return u(!1),C(r,()=>{i||u(!0)}).then(f=>{i||n(f??[])}).catch(()=>{i||n([])}),()=>{i=!0}},[r]),d.useEffect(()=>{let i=!1;return p(!0),h(null),a(!1),S(r,x,()=>{i||a(!0)}).then(f=>{i||(j(f),p(!1))}).catch(f=>{i||(h(f instanceof Error?f.message:l("portals.publisherOffline")),p(!1))}),()=>{i=!0}},[r,x]);const y=g||v,k=r.capabilities??[],E=((t==null?void 0:t.length)??0)>1,w=c?z(c.html,{title:c.title??r.portal.displayTitle}):null;return e.jsxs("div",{className:"flex flex-col h-full bg-[var(--color-bg)]",children:[E&&t&&e.jsx("nav",{"aria-label":l("portals.pagesNav"),className:"flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]",children:t.map(i=>{const f=i.path===x;return e.jsx("button",{onClick:()=>m(i.path),className:`flex-shrink-0 px-3 py-1.5 text-sm rounded-full transition-colors ${f?"bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium":"bg-[var(--color-surface-alt)] text-[var(--color-text-body)]"}`,children:i.title??i.path},i.path)})}),y&&!s&&!b&&e.jsxs("div",{role:"status","aria-live":"polite",className:"flex items-center gap-2 px-4 py-1.5 text-[11px] font-medium border-b border-[#E5B07A]/40 bg-[#FDF4E7] text-[#8A5A1E]",children:[e.jsx("span",{"aria-hidden":"true",children:"●"}),e.jsx("span",{children:l("portals.offlineCached")})]}),e.jsx("div",{className:"flex-1 min-h-0 bg-[var(--color-bg)]",children:s?e.jsx("div",{className:"px-5 py-10 text-center text-sm text-[var(--color-text-faint)]",children:l("portals.loadingPage")}):b?e.jsxs("div",{className:"mx-5 mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center",children:[e.jsx("p",{className:"text-sm font-medium text-[var(--color-text)]",children:l("portals.publisherOffline")}),e.jsx("p",{className:"mt-1 text-xs text-[var(--color-text-faint)]",children:b}),e.jsx("p",{className:"mt-3 text-xs text-[var(--color-text-muted)]",children:l("portals.useActionsBelow")})]}):w?e.jsx("iframe",{title:(c==null?void 0:c.title)??r.portal.displayTitle,sandbox:"",srcDoc:w,className:"w-full h-full border-0 bg-[var(--color-bg)]"},x):e.jsxs("div",{className:"mx-5 mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center",children:[e.jsx("p",{className:"text-sm text-[var(--color-text-body)]",children:l("portals.noPagePublished")}),e.jsx("p",{className:"mt-1 text-xs text-[var(--color-text-faint)]",children:x})]})}),k.length>0&&e.jsx("nav",{"aria-label":l("portals.actionsNav"),className:"flex gap-2 px-3 py-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)] overflow-x-auto safe-bottom",children:k.map(i=>e.jsxs("button",{onClick:()=>o(i),className:"flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-medium",style:{backgroundColor:"var(--color-accent)",color:"var(--color-accent-fg)"},children:[e.jsx("span",{className:"text-[10px] uppercase tracking-wide opacity-80",children:i.verb}),e.jsx("span",{children:i.title})]},i.id))})]})}function $({portalAddress:r,onBack:o}){const{t:l}=N(),[t,n]=d.useState(null),[x,m]=d.useState(!0),[c,j]=d.useState(null),[s,p]=d.useState(null);d.useEffect(()=>{let g=!1;return F(r).then(a=>{g||(n(a),m(!1))}).catch(a=>{g||(j(a instanceof Error?a.message:l("portals.errLoadFailed")),m(!1))}),()=>{g=!0}},[r]);const h=!!(t!=null&&t.portal.originEndpoint)&&!s?"flex-1 min-h-0 overflow-hidden":"flex-1 overflow-y-auto";return e.jsxs("section",{className:"flex flex-col h-dvh safe-top safe-bottom bg-[var(--color-bg)]",children:[e.jsxs("header",{className:"flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] flex-shrink-0",children:[e.jsxs("button",{onClick:s?()=>p(null):o,className:"text-sm text-[var(--color-text-muted)]",children:["← ",l("common.back")]}),e.jsx("h1",{className:"text-base font-semibold text-[var(--color-text)] truncate px-2",children:s?s.title:(t==null?void 0:t.portal.displayTitle)??l("portals.portal")}),e.jsx("span",{className:"w-12"})]}),e.jsx("div",{className:h,children:x?e.jsx("div",{className:"px-5 py-10 text-center text-sm text-[var(--color-text-faint)]",children:l("common.loading")}):c?e.jsx("div",{className:"mx-5 mt-6 rounded-xl bg-[var(--color-red-dim)] px-4 py-3 text-sm text-[var(--color-red)]",children:c}):t?s?e.jsx(q,{descriptor:t,capability:s,onClose:()=>p(null)}):t.portal.originEndpoint?e.jsx(L,{descriptor:t,onSelectCapability:p}):e.jsx(T,{descriptor:t,portalAddress:r,onSelectCapability:p}):e.jsx("div",{className:"px-5 mt-6",children:e.jsxs("div",{className:"rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center",children:[e.jsx("p",{className:"text-sm text-[var(--color-text-body)]",children:l("portals.portalNotAvailable")}),e.jsx("p",{className:"mt-1 text-xs text-[var(--color-text-faint)]",children:r})]})})})]})}function T({descriptor:r,portalAddress:o,onSelectCapability:l}){const{t}=N();return e.jsxs("div",{className:"pb-8",children:[e.jsxs("div",{className:"px-6 py-6 text-center",style:{backgroundColor:"var(--color-accent-soft)"},children:[e.jsx("div",{className:"w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl font-semibold",style:{backgroundColor:"var(--color-accent)",color:"var(--color-accent-fg)"},children:r.portal.displayTitle.slice(0,1).toUpperCase()}),e.jsx("h2",{className:"mt-3 text-xl font-semibold text-[var(--color-text)]",children:r.portal.displayTitle}),r.portal.category&&e.jsx("p",{className:"text-xs uppercase tracking-wide text-[var(--color-text-muted)]",children:r.portal.category}),r.portal.description&&e.jsx("p",{className:"mt-3 text-sm text-[var(--color-text-body)] max-w-prose mx-auto",children:r.portal.description}),e.jsx("p",{className:"mt-3 text-[10px] font-mono text-[var(--color-text-faint)] break-all",children:o})]}),e.jsxs("div",{className:"px-5 py-5",children:[e.jsx("h3",{className:"text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3",children:t("portals.actions")}),!r.capabilities||r.capabilities.length===0?e.jsx("p",{className:"text-sm text-[var(--color-text-muted)]",children:t("portals.noCapabilities")}):e.jsx("ul",{className:"space-y-2",children:r.capabilities.map(n=>e.jsx("li",{children:e.jsxs("button",{onClick:()=>l(n),className:"w-full text-left p-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] active:bg-[var(--color-surface-muted)]",children:[e.jsxs("div",{className:"flex items-center justify-between gap-2",children:[e.jsx("span",{className:"text-base font-medium text-[var(--color-text)] truncate",children:n.title}),e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-2 py-0.5 rounded flex-shrink-0",style:{backgroundColor:"var(--color-accent-dim)",color:"var(--color-accent-dark)"},children:n.verb})]}),n.description&&e.jsx("p",{className:"mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2",children:n.description})]})},n.id))})]})]})}function q({descriptor:r,capability:o,onClose:l}){const{t}=N(),n=_(o.inputSchema),[x,m]=d.useState({}),[c,j]=d.useState(!1),[s,p]=d.useState(null),[b,h]=d.useState(null);async function g(){j(!0),h(null),p(null);try{const a={};for(const u of n){const y=x[u.name];y!==void 0&&y!==""&&(a[u.name]=y)}const v=await P(r,o.id,a);p(v)}catch(a){h(a instanceof Error?a.message:t("portals.errInvokeFailed"))}finally{j(!1)}}return e.jsxs("div",{className:"px-5 py-5",children:[e.jsx("p",{className:"text-xs uppercase tracking-wide text-[var(--color-text-muted)]",children:o.verb}),e.jsx("h2",{className:"text-xl font-semibold text-[var(--color-text)] mt-1",children:o.title}),o.description&&e.jsx("p",{className:"mt-2 text-sm text-[var(--color-text-body)]",children:o.description}),e.jsx("div",{className:"mt-6 space-y-4",children:n.length===0?e.jsx("p",{className:"text-sm text-[var(--color-text-muted)]",children:t("portals.noInputRequired")}):n.map(a=>e.jsxs("div",{children:[e.jsxs("label",{className:"block text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5",children:[a.label,a.required&&e.jsx("span",{className:"text-[var(--color-red)] ml-0.5",children:"*"})]}),a.kind==="long"?e.jsx("textarea",{value:x[a.name]??"",onChange:v=>m(u=>({...u,[a.name]:v.target.value})),rows:3,className:"w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)] resize-none"}):e.jsx("input",{type:a.kind==="email"?"email":a.kind==="url"?"url":a.kind==="tel"?"tel":"text",value:x[a.name]??"",onChange:v=>m(u=>({...u,[a.name]:v.target.value})),className:"w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)]"})]},a.name))}),b&&e.jsx("p",{className:"mt-3 text-xs text-[var(--color-red)]",children:b}),s&&e.jsx("div",{className:"mt-5 p-4 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)]",children:s.kind==="invoke_response"?e.jsxs(e.Fragment,{children:[e.jsx("p",{className:"text-sm font-medium text-[var(--color-green)]",children:t("portals.submitted")}),s.inboxId&&e.jsx("p",{className:"mt-1 text-xs font-mono text-[var(--color-text-faint)] break-all",children:s.inboxId}),s.output&&e.jsx("pre",{className:"mt-2 text-[11px] font-mono text-[var(--color-text-body)] whitespace-pre-wrap break-words",children:JSON.stringify(s.output,null,2)})]}):e.jsx("p",{className:"text-sm text-[var(--color-text-body)]",children:s.kind==="capability_not_found"?t("portals.capabilityNotFound"):s.kind==="portal_offline"?t("portals.portalOffline"):s.kind==="invalid_input"?t("portals.invalidInput",{message:s.message??""}):s.kind==="rate_limited"?t("portals.rateLimited"):t("portals.responseKind",{kind:s.kind})})}),e.jsxs("div",{className:"mt-6 flex gap-2",children:[e.jsx("button",{onClick:l,className:"flex-1 py-3 rounded-2xl text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-body)]",children:t("common.close")}),e.jsx("button",{onClick:()=>void g(),disabled:c,className:"flex-1 py-3 rounded-2xl text-sm font-medium disabled:opacity-50",style:{backgroundColor:"var(--color-accent)",color:"var(--color-accent-fg)"},children:t(c?"portals.sending":"portals.send")})]})]})}function _(r){if(!r||typeof r!="object")return[{name:"message",label:"Message",kind:"long",required:!1}];const o=r.properties,l=r.required??[];if(!o||typeof o!="object")return[{name:"message",label:"Message",kind:"long",required:!1}];const t=[];for(const[n,x]of Object.entries(o)){const m=x;let c="short";m.format==="email"?c="email":m.format==="uri"||m.format==="url"?c="url":m.format==="tel"?c="tel":(n.toLowerCase().includes("message")||n.toLowerCase().includes("description"))&&(c="long"),t.push({name:n,label:m.title??M(n),kind:c,required:l.includes(n)})}return t.length>0?t:[{name:"message",label:"Message",kind:"long",required:!1}]}function M(r){return r.replace(/[_-]/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,o=>o.toUpperCase())}export{$ as default};
