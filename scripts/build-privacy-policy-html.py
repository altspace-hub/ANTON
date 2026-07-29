# Generate docs/legal/privacy-policy.html FROM privacy-policy.md, so the hosted page
# cannot drift from the canonical text. Deliberately a small, explicit converter rather
# than a dependency: this runs once in a while on one known document, and a markdown
# library would be a new prod dependency for a build step nobody watches.
import io, re, html

src = io.open('docs/legal/privacy-policy.md', encoding='utf-8').read()
src = re.sub(r'<!--.*?-->\s*', '', src, flags=re.S)          # drop the editor-facing header

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<em>\1</em>', t)
    t = re.sub(r'`(.+?)`', r'<code>\1</code>', t)
    # Auto-link bare email addresses. A privacy policy whose contact address is not
    # clickable is a policy people do not write to, and the in-product copy links it —
    # leaving this one as plain text would be a gratuitous difference between the two.
    t = re.sub(r'(?<!:)\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b',
               r'<a href="mailto:\1">\1</a>', t)
    return t

out, lines = [], src.split('\n')
i, in_ul, in_quote, in_tbl = 0, False, False, False

def close_blocks():
    global in_ul, in_quote, in_tbl
    if in_ul:    out.append('</ul>');           in_ul = False
    if in_quote: out.append('</blockquote>');   in_quote = False
    if in_tbl:   out.append('</tbody></table>'); in_tbl = False

while i < len(lines):
    ln = lines[i]
    s = ln.strip()

    if not s:
        if in_ul or in_tbl: close_blocks()
        i += 1; continue

    if s == '---':
        close_blocks(); out.append('<hr>'); i += 1; continue

    m = re.match(r'^(#{1,4})\s+(.*)$', s)
    if m:
        close_blocks()
        lvl = len(m.group(1))
        out.append('<h%d>%s</h%d>' % (lvl, inline(m.group(2)), lvl))
        i += 1; continue

    if s.startswith('>'):
        # Consume the whole blockquote at once. Markdown hard-wraps inside a quote, so
        # emitting one <p> per LINE would shatter a single paragraph into five — which
        # is exactly what the first version did. Consecutive non-empty '>' lines join
        # into one paragraph; a bare '>' separates paragraphs.
        close_blocks(); out.append('<blockquote>')
        para = []
        while i < len(lines) and lines[i].strip().startswith('>'):
            body = lines[i].strip().lstrip('>').strip()
            if body:
                para.append(body)
            elif para:
                out.append('<p>%s</p>' % inline(' '.join(para))); para = []
            i += 1
        if para:
            out.append('<p>%s</p>' % inline(' '.join(para)))
        out.append('</blockquote>')
        continue

    if s.startswith('|'):
        cells = [c.strip() for c in s.strip('|').split('|')]
        if not in_tbl:
            close_blocks()
            out.append('<table><thead><tr>' +
                       ''.join('<th>%s</th>' % inline(c) for c in cells) +
                       '</tr></thead><tbody>')
            in_tbl = True
            i += 1
            if i < len(lines) and re.match(r'^\|[\s:-]+\|', lines[i].strip()):
                i += 1            # skip the |---|---| separator
            continue
        out.append('<tr>' + ''.join('<td>%s</td>' % inline(c) for c in cells) + '</tr>')
        i += 1; continue

    if s.startswith('- '):
        if not in_ul:
            close_blocks(); out.append('<ul>'); in_ul = True
        item = s[2:]
        while i + 1 < len(lines) and lines[i + 1].startswith('  ') and lines[i + 1].strip() \
                and not lines[i + 1].strip().startswith('- '):
            i += 1; item += ' ' + lines[i].strip()
        out.append('<li>%s</li>' % inline(item))
        i += 1; continue

    close_blocks()
    para = [s]
    while i + 1 < len(lines) and lines[i + 1].strip() and not re.match(
            r'^\s*(#|-\s|\||>|---)', lines[i + 1]):
        i += 1; para.append(lines[i].strip())
    out.append('<p>%s</p>' % inline(' '.join(para)))
    i += 1

close_blocks()
body_html = '\n'.join(out)

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy &mdash; ANTON</title>
<meta name="description" content="Privacy policy for ANTON and the ANTON apps: Companion, Comm, Pay, Business and Agent.">
<style>
  :root{--bg:#fff;--fg:#1c2430;--muted:#5b6672;--line:#e2e6ea;--accent:#0D7D6C;--card:#f6f8f9}
  @media (prefers-color-scheme:dark){
    :root{--bg:#0B1426;--fg:#E0E0E0;--muted:#B0B0B0;--line:#223047;--accent:#2DD4A8;--card:#152238}
  }
  *{box-sizing:border-box}
  body{margin:0;padding:2.5rem 1.25rem 5rem;background:var(--bg);color:var(--fg);
    font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{max-width:46rem;margin:0 auto}
  h1{font-size:2rem;line-height:1.2;margin:0 0 1rem}
  h2{font-size:1.3rem;margin:2.5rem 0 .6rem;padding-top:1.2rem;border-top:1px solid var(--line)}
  h3{font-size:1.05rem;margin:1.8rem 0 .4rem}
  a{color:var(--accent)}
  code{background:var(--card);padding:.1em .35em;border-radius:3px;font-size:.9em}
  hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
  blockquote{margin:1.2rem 0;padding:.9rem 1.1rem;background:var(--card);
    border-left:3px solid var(--accent);border-radius:0 6px 6px 0}
  blockquote p{margin:.4rem 0}
  table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.94rem}
  th,td{border:1px solid var(--line);padding:.5rem .6rem;text-align:left;vertical-align:top}
  th{background:var(--card);font-weight:600}
  ul{padding-left:1.25rem}
  li{margin:.35rem 0}
  em{color:var(--muted)}
  main > p:last-child{color:var(--muted);font-size:.92rem}
</style>
</head>
<body>
<main>
__BODY__
</main>
</body>
</html>
""".replace("__BODY__", body_html)

io.open('docs/legal/privacy-policy.html', 'w', encoding='utf-8', newline='').write(PAGE)
print('generated', len(PAGE), 'chars')
