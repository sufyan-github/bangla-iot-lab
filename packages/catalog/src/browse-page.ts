/**
 * The catalogue browser's one page. Plain HTML, CSS and script with nothing
 * loaded from elsewhere: it runs offline on the owner's computer. Every value
 * from the data is put on the page as text, never as markup.
 */
export function browsePage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="catalog-token" content="${token.replace(/[^a-f0-9]/g, '')}">
<title>Catalogue desk</title>
<style>
  :root {
    --paper: #f6f7f4; --panel: #ffffff; --ink: #1d2320; --soft: #5c6660; --line: #d9ddd6;
    --accent: #0f6b5c; --accent-soft: #e1f0ec; --warn: #9a5b00; --warn-soft: #fbf0dc;
    --bad: #a3322a; --bad-soft: #f8e4e1;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #161a18; --panel: #1e2321; --ink: #e6ebe7; --soft: #9aa49e; --line: #333b37;
      --accent: #5cc4ac; --accent-soft: #1d3530; --warn: #e2a64a; --warn-soft: #3a2f1c;
      --bad: #ee8a80; --bad-soft: #3d2422;
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 20px;
    padding: 14px 20px 0; }
  h1 { font-size: 18px; margin: 0; }
  .note { color: var(--soft); font-size: 13px; }
  nav { display: flex; gap: 2px; padding: 10px 20px 0; border-bottom: 1px solid var(--line); }
  nav button { border: 0; background: none; color: var(--soft); padding: 8px 12px; font: inherit;
    border-bottom: 2px solid transparent; cursor: pointer; }
  nav button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
  main { padding: 16px 20px 40px; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  input[type="search"], select { font: inherit; padding: 6px 8px; border: 1px solid var(--line);
    border-radius: 6px; background: var(--panel); color: var(--ink); }
  input[type="search"] { min-width: 240px; flex: 1 1 240px; }
  button.act { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line);
    background: var(--panel); color: var(--ink); cursor: pointer; }
  button.act.primary { background: var(--accent); border-color: var(--accent); color: var(--panel); }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible, tr:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 1px; }
  .split { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
  table { width: 100%; border-collapse: collapse; background: var(--panel); }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; color: var(--soft); font-weight: 600; }
  tbody tr.pick { cursor: pointer; }
  tbody tr.pick:hover, tbody tr[aria-current="true"] { background: var(--accent-soft); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .state { display: inline-block; font-size: 12px; padding: 1px 7px; border-radius: 10px; white-space: nowrap; }
  .state.confirmed { background: var(--accent-soft); color: var(--accent); }
  .state.suggested { background: var(--warn-soft); color: var(--warn); }
  .state.rejected { background: var(--bad-soft); color: var(--bad); }
  .state.none { color: var(--soft); border: 1px solid var(--line); }
  .pager { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
  .detail { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px;
    position: sticky; top: 12px; }
  .detail h2 { font-size: 17px; margin: 0 0 4px; }
  .detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 12px 0; }
  .detail dt { color: var(--soft); }
  .detail dd { margin: 0; }
  .choices { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0; }
  .raw { font-size: 13px; }
  .raw td:first-child { color: var(--soft); white-space: nowrap; }
  .empty { color: var(--soft); padding: 16px 0; }
  .error { color: var(--bad); }
  .project { margin-bottom: 20px; }
  .project h3 { font-size: 15px; margin: 0 0 6px; }
  .problems { background: var(--bad-soft); color: var(--bad); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
</style>
</head>
<body>
<header>
  <h1>Catalogue desk</h1>
  <span class="note" id="dated"></span>
  <span class="note">Private: runs on this computer only.</span>
</header>
<nav role="tablist">
  <button role="tab" data-tab="products" aria-selected="true">Products</button>
  <button role="tab" data-tab="parts" aria-selected="false">Parts</button>
  <button role="tab" data-tab="projects" aria-selected="false">Projects</button>
  <button role="tab" data-tab="issues" aria-selected="false">Issues</button>
</nav>
<main id="main"></main>
<script>
"use strict";
const TOKEN = document.querySelector('meta[name="catalog-token"]').content;
const STATE_TEXT = { confirmed: 'linked', suggested: 'suggested', rejected: 'no lab part', none: 'no part found' };
let summary = null;
const view = { tab: 'products', text: '', group: '', category: '', state: '', part: '', available: false, offset: 0, selected: null };

function el(tag, attributes, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
const taka = (n) => n === null ? '—' : '৳' + n.toLocaleString('en-IN');
const badge = (state) => el('span', { class: 'state ' + state }, STATE_TEXT[state]);

async function api(path, init) {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body;
}

function option(value, text, selected) { return el('option', { value, selected: value === selected }, text); }

async function showProducts() {
  const main = document.getElementById('main');
  const groups = summary.groups;
  const categories = (groups.find((g) => g.group === view.group) || { categories: [] }).categories;
  const search = el('input', { type: 'search', placeholder: 'Search product names', value: view.text, 'aria-label': 'Search product names' });
  let timer = 0;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { view.text = search.value; view.offset = 0; load(); }, 200); });
  const filters = el('div', { class: 'filters' },
    search,
    el('select', { 'aria-label': 'Group', onchange: (e) => { view.group = e.target.value; view.category = ''; view.offset = 0; showProducts(); } },
      option('', 'Every group', view.group), groups.map((g) => option(g.group, g.group, view.group))),
    el('select', { 'aria-label': 'Category', disabled: !view.group, onchange: (e) => { view.category = e.target.value; view.offset = 0; load(); } },
      option('', 'Every category', view.category), categories.map((c) => option(c.category, c.category + ' (' + c.count + ')', view.category))),
    el('select', { 'aria-label': 'Link', onchange: (e) => { view.state = e.target.value; view.offset = 0; load(); } },
      option('', 'Any link', view.state), Object.entries(STATE_TEXT).map(([k, t]) => option(k, t, view.state))),
    el('select', { 'aria-label': 'Part', onchange: (e) => { view.part = e.target.value; view.offset = 0; load(); } },
      option('', 'Any part', view.part), summary.parts.map((p) => option(p.id, p.name, view.part))),
    el('label', {}, el('input', { type: 'checkbox', checked: view.available, onchange: (e) => { view.available = e.target.checked; view.offset = 0; load(); } }), ' Can be bought now'),
  );
  const list = el('div', { id: 'list' });
  const detail = el('div', { id: 'detail' });
  main.replaceChildren(filters, el('div', { class: 'split' }, list, detail));

  async function load() {
    const q = new URLSearchParams({ text: view.text, group: view.group, category: view.category, state: view.state, part: view.part, available: view.available ? '1' : '', offset: String(view.offset) });
    const page = await api('/api/products?' + q);
    const rows = page.items.map((p) => el('tr', {
      class: 'pick', tabindex: 0, 'aria-current': p.id === view.selected,
      onclick: () => select(p.id), onkeydown: (e) => { if (e.key === 'Enter') select(p.id); },
    }, el('td', {}, p.name, el('div', { class: 'note' }, p.category)), el('td', { class: 'num' }, taka(p.priceBdt)),
       el('td', {}, badge(p.state), p.partName ? el('div', { class: 'note' }, p.partName) : null)));
    const last = Math.min(page.total, view.offset + page.limit);
    list.replaceChildren(
      page.total === 0 ? el('p', { class: 'empty' }, 'No product matches. Try fewer words or another filter.') :
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Product'), el('th', { class: 'num' }, 'Price'), el('th', {}, 'Lab part'))), el('tbody', {}, rows)),
      el('div', { class: 'pager' },
        el('button', { class: 'act', disabled: view.offset === 0, onclick: () => { view.offset = Math.max(0, view.offset - page.limit); load(); } }, 'Previous'),
        el('span', { class: 'note' }, page.total ? (view.offset + 1) + '–' + last + ' of ' + page.total : ''),
        el('button', { class: 'act', disabled: last >= page.total, onclick: () => { view.offset += page.limit; load(); } }, 'Next')),
    );
  }

  async function select(id) {
    view.selected = id;
    list.querySelectorAll('tr.pick').forEach((row) => row.removeAttribute('aria-current'));
    const product = await api('/api/products/' + encodeURIComponent(id));
    renderDetail(product);
    load();
  }

  function renderDetail(product) {
    const link = product.link;
    const message = el('p', { class: 'note', role: 'status' });
    const partSelect = el('select', { 'aria-label': 'Lab part' }, option('', 'Choose a lab part', ''), summary.parts.map((p) => option(p.id, p.name, link.part || '')));
    const variantSelect = el('select', { 'aria-label': 'Variant' });
    const fillVariants = () => {
      const part = summary.parts.find((p) => p.id === partSelect.value);
      variantSelect.replaceChildren(option('', 'No particular variant', product.decision?.variant || ''), ...(part ? part.variants : []).map((v) => option(v.id, v.name, product.decision?.variant || '')));
      variantSelect.disabled = !part || part.variants.length === 0;
    };
    partSelect.addEventListener('change', fillVariants);
    fillVariants();
    async function save(method, body) {
      try {
        const result = await api('/api/products/' + encodeURIComponent(product.id) + '/link', {
          method, headers: { 'content-type': 'application/json', 'x-catalog-token': TOKEN }, body: body ? JSON.stringify(body) : undefined,
        });
        product.link = result.link; product.decision = result.decision;
        renderDetail(product);
        await refreshSummary();
        load();
      } catch (error) { message.textContent = error.message; message.className = 'error'; }
    }
    const raw = Object.entries(product.raw).map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', {}, v)));
    detail.replaceChildren(el('section', { class: 'detail', 'aria-label': 'Product' },
      el('h2', {}, product.name),
      el('div', { class: 'note' }, product.group + ' › ' + product.category),
      el('dl', {},
        el('dt', {}, 'Price'), el('dd', {}, taka(product.priceBdt), el('span', { class: 'note' }, ' on ' + summary.snapshotDate + '; may have changed')),
        el('dt', {}, 'Stock'), el('dd', {}, product.stock),
        el('dt', {}, 'Lab part'), el('dd', {}, badge(link.state), ' ', link.part ? (summary.parts.find((p) => p.id === link.part) || { name: link.part }).name : ''),
        el('dt', {}, 'Keywords point to'), el('dd', {}, link.candidates.length ? link.candidates.map((c) => c.name).join(', ') : 'no part'),
        product.decision ? [el('dt', {}, 'Decided'), el('dd', {}, new Date(product.decision.decidedAt).toLocaleString())] : null,
        el('dt', {}, 'In the store'), el('dd', {}, /^https?:\\/\\//.test(product.url) ? el('a', { href: product.url, target: '_blank', rel: 'noreferrer noopener' }, 'Open the product page') : 'no web address'),
      ),
      el('div', { class: 'choices' },
        link.state === 'suggested' ? el('button', { class: 'act primary', onclick: () => save('PUT', { part: link.suggested }) }, 'Confirm: ' + link.candidates[0].name) : null,
        el('button', { class: 'act', onclick: () => save('PUT', { part: null }) }, 'No lab part'),
        product.decision ? el('button', { class: 'act', onclick: () => save('DELETE') }, 'Forget the decision') : null,
      ),
      el('div', { class: 'choices' }, partSelect, variantSelect,
        el('button', { class: 'act', onclick: () => { if (!partSelect.value) { message.textContent = 'Choose a lab part first.'; return; } save('PUT', { part: partSelect.value, variant: variantSelect.value || undefined }); } }, 'Link to this part')),
      message,
      el('details', {}, el('summary', {}, 'The row as the store exported it'), el('table', { class: 'raw' }, el('tbody', {}, raw))),
    ));
  }

  if (view.selected) select(view.selected); else load();
}

async function showParts() {
  const parts = await api('/api/parts');
  const rows = parts.sort((a, b) => a.name.localeCompare(b.name)).map((p) => el('tr', {
    class: 'pick', tabindex: 0,
    onclick: () => openPart(p.id), onkeydown: (e) => { if (e.key === 'Enter') openPart(p.id); },
  }, el('td', {}, p.name, el('div', { class: 'note' }, p.id)), el('td', {}, p.status),
     el('td', { class: 'num' }, p.confirmed), el('td', { class: 'num' }, p.suggested), el('td', { class: 'num' }, taka(p.lowestBdt))));
  const none = parts.filter((p) => p.confirmed + p.suggested === 0).length;
  document.getElementById('main').replaceChildren(
    el('p', { class: 'note' }, parts.length + ' parts in the lab’s parts master; ' + none + ' with no product in this catalogue. Choose a part to see its products.'),
    el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Part'), el('th', {}, 'Status'), el('th', { class: 'num' }, 'Linked'), el('th', { class: 'num' }, 'Suggested'), el('th', { class: 'num' }, 'Lowest price now'))), el('tbody', {}, rows)));
}
function openPart(id) { Object.assign(view, { tab: 'products', part: id, state: '', text: '', group: '', category: '', offset: 0, selected: null }); render(); }

async function showProjects() {
  const projects = await api('/api/projects');
  document.getElementById('main').replaceChildren(
    el('p', { class: 'note' }, 'Required lines of each project, and the lab part each comes to: through its product’s link when it has one, otherwise from its words.'),
    ...projects.map((project) => {
      const real = project.lines.filter((l) => l.status !== 'not-simulated');
      const simulated = real.filter((l) => l.status === 'simulated').length;
      return el('section', { class: 'project' },
        el('h3', {}, project.id + ' ' + project.name + (project.shortlisted ? ' (shortlisted)' : '')),
        el('div', { class: 'note' }, simulated + ' of ' + real.length + ' parts simulated'),
        el('table', {}, el('tbody', {}, project.lines.map((l) => el('tr', {},
          el('td', {}, l.component), el('td', {}, l.partName || '—'), el('td', {}, l.status),
          el('td', { class: 'note' }, l.via === 'link' ? 'by link' : l.via === 'text' ? 'by words' : ''))))));
    }));
}

async function showIssues() {
  const issues = await api('/api/issues');
  document.getElementById('main').replaceChildren(
    el('p', { class: 'note' }, 'What the importer found for a person to look at. It changed nothing.'),
    ...issues.map((issue) => el('section', { class: 'project' },
      el('h3', {}, issue.message), el('div', { class: 'note' }, issue.severity + ', ' + issue.count + (issue.count === 1 ? ' row' : ' rows')),
      el('ul', {}, issue.examples.map((x) => el('li', {}, x))))));
}

async function refreshSummary() {
  summary = await api('/api/summary');
  const c = summary.counts;
  document.getElementById('dated').textContent = summary.products + ' products, snapshot of ' + summary.snapshotDate + ' · ' + c.confirmed + ' linked, ' + c.suggested + ' suggested, ' + c.rejected + ' no lab part, ' + c.none + ' no part found';
}

async function render() {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === view.tab)));
  try {
    if (view.tab === 'products') await showProducts();
    if (view.tab === 'parts') await showParts();
    if (view.tab === 'projects') await showProjects();
    if (view.tab === 'issues') await showIssues();
    if (summary.problems.length && view.tab === 'products') {
      document.getElementById('main').prepend(el('div', { class: 'problems' }, summary.problems.length + ' decisions no longer fit this snapshot: ' + summary.problems.slice(0, 3).join('; ')));
    }
  } catch (error) {
    document.getElementById('main').replaceChildren(el('p', { class: 'error' }, error.message));
  }
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => { view.tab = b.dataset.tab; render(); }));
refreshSummary().then(render);
</script>
</body>
</html>
`;
}
