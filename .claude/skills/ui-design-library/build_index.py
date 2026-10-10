import json, sys
R = '.claude/skills/ui-design-library/references/'
designs = [
  ('neumorphic-login', 'Login neumorphique', 'login.html'),
  ('flow-login', 'Login Flow', R + 'flow-login-dark.html'),
  ('liquid-navbar', 'Navbar liquide', R + 'liquid-navbar-dark.html'),
  ('glass-nav', 'Navbar en verre', R + 'glass-nav-light-dark.html'),
  ('carousel-3d', 'Carrousel 3D', R + 'carousel-3d-vanilla.html'),
  ('sidebar', 'Barre latérale', R + 'responsive-sidebar.html'),
]
data = [{'id': i, 'label': l, 'html': open(f, encoding='utf-8').read()} for i, l, f in designs]
blob = json.dumps(data).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
page = '''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galerie de designs</title>
<style>
  :root { color-scheme: light dark; --bg: #f4f5f9; --bar: #ffffff; --fg: #1d2240; --muted: #646b8a; --line: #dfe2ee; --accent: #3b4fd8; --accent-fg: #ffffff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0e1020; --bar: #171a2e; --fg: #eceefc; --muted: #98a0c4; --line: #262a45; --accent: #8da0ff; --accent-fg: #0c1030; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 16px; background: var(--bar); border-bottom: 1px solid var(--line); }
  h1 { margin: 0; font-size: 1rem; font-weight: 600; }
  nav { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; min-width: 0; }
  nav button, .open { padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--fg); font: inherit; font-size: .88rem; cursor: pointer; }
  nav button:hover, .open:hover { border-color: var(--accent); }
  nav button[aria-selected="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  nav button:focus-visible, .open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .hint { width: 100%; margin: 0; font-size: .78rem; color: var(--muted); }
  main { flex: 1; min-height: 0; }
  iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
  noscript { display: block; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>Galerie de designs</h1>
  <nav id="tabs" role="tablist" aria-label="Designs"></nav>
  <button type="button" class="open" id="open">Ouvrir dans un nouvel onglet</button>
  <p class="hint">Chaque design est interactif. Changez de design avec les boutons ou les flèches gauche et droite.</p>
</header>
<main><iframe id="frame" title="Aperçu du design" sandbox="allow-scripts allow-popups"></iframe></main>
<noscript>JavaScript est nécessaire pour afficher la galerie.</noscript>
<script id="data" type="application/json">__DATA__</script>
<script>
  var designs = JSON.parse(document.getElementById('data').textContent);
  var tabs = document.getElementById('tabs'), frame = document.getElementById('frame'), current = 0, buttons = [];
  designs.forEach(function (d, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = d.label;
    b.addEventListener('click', function () { select(i); });
    tabs.appendChild(b); buttons.push(b);
  });
  function select(i) {
    current = i;
    buttons.forEach(function (b, k) { b.setAttribute('aria-selected', k === i); b.tabIndex = k === i ? 0 : -1; });
    frame.srcdoc = designs[i].html;
    frame.title = 'Aperçu : ' + designs[i].label;
    try { history.replaceState(null, '', '#' + designs[i].id); } catch (e) {}
  }
  tabs.addEventListener('keydown', function (e) {
    var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!n) return;
    e.preventDefault();
    select((current + n + designs.length) % designs.length);
    buttons[current].focus();
  });
  document.getElementById('open').addEventListener('click', function () {
    var url = URL.createObjectURL(new Blob([designs[current].html], { type: 'text/html' }));
    window.open(url, '_blank');
  });
  var start = designs.findIndex(function (d) { return '#' + d.id === location.hash; });
  select(start > -1 ? start : 0);
</script>
</body>
</html>
'''
open('index.html', 'w', encoding='utf-8').write(page.replace('__DATA__', blob))
