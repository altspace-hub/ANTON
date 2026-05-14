import{a as c,j as e}from"./index-kfLimug0.js";import{f as k,a as E,b as C,i as S}from"./portals-C2mpPPR0.js";const P="Portal page",F=`
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
`.trim();function A(t){return t.replace(/[<>"&]/g,o=>({"<":"&lt;",">":"&gt;",'"':"&quot;","&":"&amp;"})[o]??o)}function D(t,o={}){const r=A(o.title??P),s=o.baseCss??F;return`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${r}</title>
<style>${s}</style>
</head>
<body>${t}</body>
</html>`}function B({descriptor:t,onSelectCapability:o}){const[r,s]=c.useState(null),[d,u]=c.useState("/"),[i,x]=c.useState(null),[l,m]=c.useState(!0),[b,h]=c.useState(null),[g,a]=c.useState(!1),[v,p]=c.useState(!1);c.useEffect(()=>{let n=!1;return p(!1),k(t,()=>{n||p(!0)}).then(f=>{n||s(f??[])}).catch(()=>{n||s([])}),()=>{n=!0}},[t]),c.useEffect(()=>{let n=!1;return m(!0),h(null),a(!1),E(t,d,()=>{n||a(!0)}).then(f=>{n||(x(f),m(!1))}).catch(f=>{n||(h(f instanceof Error?f.message:"Publisher offline"),m(!1))}),()=>{n=!0}},[t,d]);const j=g||v,y=t.capabilities??[],w=((r==null?void 0:r.length)??0)>1,N=i?D(i.html,{title:i.title??t.portal.displayTitle}):null;return e.jsxs("div",{className:"flex flex-col h-full bg-[var(--color-bg)]",children:[w&&r&&e.jsx("nav",{"aria-label":"Portal pages",className:"flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]",children:r.map(n=>{const f=n.path===d;return e.jsx("button",{onClick:()=>u(n.path),className:`flex-shrink-0 px-3 py-1.5 text-sm rounded-full transition-colors ${f?"bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium":"bg-[var(--color-surface-alt)] text-[var(--color-text-body)]"}`,children:n.title??n.path},n.path)})}),j&&!l&&!b&&e.jsxs("div",{role:"status","aria-live":"polite",className:"flex items-center gap-2 px-4 py-1.5 text-[11px] font-medium border-b border-[#E5B07A]/40 bg-[#FDF4E7] text-[#8A5A1E]",children:[e.jsx("span",{"aria-hidden":"true",children:"●"}),e.jsx("span",{children:"Offline — showing the last cached copy. Publisher is unreachable."})]}),e.jsx("div",{className:"flex-1 min-h-0 bg-[var(--color-bg)]",children:l?e.jsx("div",{className:"px-5 py-10 text-center text-sm text-[var(--color-text-faint)]",children:"Loading page…"}):b?e.jsxs("div",{className:"mx-5 mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center",children:[e.jsx("p",{className:"text-sm font-medium text-[var(--color-text)]",children:"Publisher offline"}),e.jsx("p",{className:"mt-1 text-xs text-[var(--color-text-faint)]",children:b}),e.jsx("p",{className:"mt-3 text-xs text-[var(--color-text-muted)]",children:"You can still use the actions below."})]}):N?e.jsx("iframe",{title:(i==null?void 0:i.title)??t.portal.displayTitle,sandbox:"",srcDoc:N,className:"w-full h-full border-0 bg-[var(--color-bg)]"},d):e.jsxs("div",{className:"mx-5 mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center",children:[e.jsx("p",{className:"text-sm text-[var(--color-text-body)]",children:"No page published yet."}),e.jsx("p",{className:"mt-1 text-xs text-[var(--color-text-faint)]",children:d})]})}),y.length>0&&e.jsx("nav",{"aria-label":"Portal actions",className:"flex gap-2 px-3 py-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)] overflow-x-auto safe-bottom",children:y.map(n=>e.jsxs("button",{onClick:()=>o(n),className:"flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-medium",style:{backgroundColor:"var(--color-accent)",color:"var(--color-accent-fg)"},children:[e.jsx("span",{className:"text-[10px] uppercase tracking-wide opacity-80",children:n.verb}),e.jsx("span",{children:n.title})]},n.id))})]})}function $({portalAddress:t,onBack:o}){const[r,s]=c.useState(null),[d,u]=c.useState(!0),[i,x]=c.useState(null),[l,m]=c.useState(null);c.useEffect(()=>{let g=!1;return C(t).then(a=>{g||(s(a),u(!1))}).catch(a=>{g||(x(a instanceof Error?a.message:"Failed to load"),u(!1))}),()=>{g=!0}},[t]);const h=!!(r!=null&&r.portal.originEndpoint)&&!l?"flex-1 min-h-0 overflow-hidden":"flex-1 overflow-y-auto";return e.jsxs("section",{className:"flex flex-col h-dvh safe-top safe-bottom bg-[var(--color-bg)]",children:[e.jsxs("header",{className:"flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] flex-shrink-0",children:[e.jsx("button",{onClick:l?()=>m(null):o,className:"text-sm text-[var(--color-text-muted)]",children:"← Back"}),e.jsx("h1",{className:"text-base font-semibold text-[var(--color-text)] truncate px-2",children:l?l.title:(r==null?void 0:r.portal.displayTitle)??"Portal"}),e.jsx("span",{className:"w-12"})]}),e.jsx("div",{className:h,children:d?e.jsx("div",{className:"px-5 py-10 text-center text-sm text-[var(--color-text-faint)]",children:"Loading…"}):i?e.jsx("div",{className:"mx-5 mt-6 rounded-xl bg-[var(--color-red-dim)] px-4 py-3 text-sm text-[var(--color-red)]",children:i}):r?l?e.jsx(L,{descriptor:r,capability:l,onClose:()=>m(null)}):r.portal.originEndpoint?e.jsx(B,{descriptor:r,onSelectCapability:m}):e.jsx(z,{descriptor:r,portalAddress:t,onSelectCapability:m}):e.jsx("div",{className:"px-5 mt-6",children:e.jsxs("div",{className:"rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center",children:[e.jsx("p",{className:"text-sm text-[var(--color-text-body)]",children:"Portal not available."}),e.jsx("p",{className:"mt-1 text-xs text-[var(--color-text-faint)]",children:t})]})})})]})}function z({descriptor:t,portalAddress:o,onSelectCapability:r}){return e.jsxs("div",{className:"pb-8",children:[e.jsxs("div",{className:"px-6 py-6 text-center",style:{backgroundColor:"var(--color-accent-soft)"},children:[e.jsx("div",{className:"w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl font-semibold",style:{backgroundColor:"var(--color-accent)",color:"var(--color-accent-fg)"},children:t.portal.displayTitle.slice(0,1).toUpperCase()}),e.jsx("h2",{className:"mt-3 text-xl font-semibold text-[var(--color-text)]",children:t.portal.displayTitle}),t.portal.category&&e.jsx("p",{className:"text-xs uppercase tracking-wide text-[var(--color-text-muted)]",children:t.portal.category}),t.portal.description&&e.jsx("p",{className:"mt-3 text-sm text-[var(--color-text-body)] max-w-prose mx-auto",children:t.portal.description}),e.jsx("p",{className:"mt-3 text-[10px] font-mono text-[var(--color-text-faint)] break-all",children:o})]}),e.jsxs("div",{className:"px-5 py-5",children:[e.jsx("h3",{className:"text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3",children:"Actions"}),!t.capabilities||t.capabilities.length===0?e.jsx("p",{className:"text-sm text-[var(--color-text-muted)]",children:"No capabilities advertised."}):e.jsx("ul",{className:"space-y-2",children:t.capabilities.map(s=>e.jsx("li",{children:e.jsxs("button",{onClick:()=>r(s),className:"w-full text-left p-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] active:bg-[var(--color-surface-muted)]",children:[e.jsxs("div",{className:"flex items-center justify-between gap-2",children:[e.jsx("span",{className:"text-base font-medium text-[var(--color-text)] truncate",children:s.title}),e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-2 py-0.5 rounded flex-shrink-0",style:{backgroundColor:"var(--color-accent-dim)",color:"var(--color-accent-dark)"},children:s.verb})]}),s.description&&e.jsx("p",{className:"mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2",children:s.description})]})},s.id))})]})]})}function L({descriptor:t,capability:o,onClose:r}){const s=T(o.inputSchema),[d,u]=c.useState({}),[i,x]=c.useState(!1),[l,m]=c.useState(null),[b,h]=c.useState(null);async function g(){x(!0),h(null),m(null);try{const a={};for(const p of s){const j=d[p.name];j!==void 0&&j!==""&&(a[p.name]=j)}const v=await S(t,o.id,a);m(v)}catch(a){h(a instanceof Error?a.message:"Invoke failed")}finally{x(!1)}}return e.jsxs("div",{className:"px-5 py-5",children:[e.jsx("p",{className:"text-xs uppercase tracking-wide text-[var(--color-text-muted)]",children:o.verb}),e.jsx("h2",{className:"text-xl font-semibold text-[var(--color-text)] mt-1",children:o.title}),o.description&&e.jsx("p",{className:"mt-2 text-sm text-[var(--color-text-body)]",children:o.description}),e.jsx("div",{className:"mt-6 space-y-4",children:s.length===0?e.jsx("p",{className:"text-sm text-[var(--color-text-muted)]",children:"No input required."}):s.map(a=>e.jsxs("div",{children:[e.jsxs("label",{className:"block text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5",children:[a.label,a.required&&e.jsx("span",{className:"text-[var(--color-red)] ml-0.5",children:"*"})]}),a.kind==="long"?e.jsx("textarea",{value:d[a.name]??"",onChange:v=>u(p=>({...p,[a.name]:v.target.value})),rows:3,className:"w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)] resize-none"}):e.jsx("input",{type:a.kind==="email"?"email":a.kind==="url"?"url":a.kind==="tel"?"tel":"text",value:d[a.name]??"",onChange:v=>u(p=>({...p,[a.name]:v.target.value})),className:"w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)]"})]},a.name))}),b&&e.jsx("p",{className:"mt-3 text-xs text-[var(--color-red)]",children:b}),l&&e.jsx("div",{className:"mt-5 p-4 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)]",children:l.kind==="invoke_response"?e.jsxs(e.Fragment,{children:[e.jsx("p",{className:"text-sm font-medium text-[var(--color-green)]",children:"Submitted ✓"}),l.inboxId&&e.jsx("p",{className:"mt-1 text-xs font-mono text-[var(--color-text-faint)] break-all",children:l.inboxId}),l.output&&e.jsx("pre",{className:"mt-2 text-[11px] font-mono text-[var(--color-text-body)] whitespace-pre-wrap break-words",children:JSON.stringify(l.output,null,2)})]}):e.jsx("p",{className:"text-sm text-[var(--color-text-body)]",children:l.kind==="capability_not_found"?"Capability not found.":l.kind==="portal_offline"?"Portal offline — try again later.":l.kind==="invalid_input"?`Invalid input. ${l.message??""}`:l.kind==="rate_limited"?"Too many requests. Try again later.":`Response: ${l.kind}`})}),e.jsxs("div",{className:"mt-6 flex gap-2",children:[e.jsx("button",{onClick:r,className:"flex-1 py-3 rounded-2xl text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-body)]",children:"Close"}),e.jsx("button",{onClick:()=>void g(),disabled:i,className:"flex-1 py-3 rounded-2xl text-sm font-medium disabled:opacity-50",style:{backgroundColor:"var(--color-accent)",color:"var(--color-accent-fg)"},children:i?"Sending…":"Send"})]})]})}function T(t){if(!t||typeof t!="object")return[{name:"message",label:"Message",kind:"long",required:!1}];const o=t.properties,r=t.required??[];if(!o||typeof o!="object")return[{name:"message",label:"Message",kind:"long",required:!1}];const s=[];for(const[d,u]of Object.entries(o)){const i=u;let x="short";i.format==="email"?x="email":i.format==="uri"||i.format==="url"?x="url":i.format==="tel"?x="tel":(d.toLowerCase().includes("message")||d.toLowerCase().includes("description"))&&(x="long"),s.push({name:d,label:i.title??q(d),kind:x,required:r.includes(d)})}return s.length>0?s:[{name:"message",label:"Message",kind:"long",required:!1}]}function q(t){return t.replace(/[_-]/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,o=>o.toUpperCase())}export{$ as default};
