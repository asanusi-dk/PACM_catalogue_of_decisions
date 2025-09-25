async function loadData(){
  try {
    const res = await fetch('data/a64_catalogue.json', {cache: 'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  } catch (e) {
    document.getElementById('status').textContent = 'Could not load data/a64_catalogue.json (' + e.message + ').';
    return [];
  }
}

function normalize(s){return (s||'').toLowerCase().normalize('NFKD').replace(/[^\w\s.-]/g,' ').replace(/\s+/g,' ').trim();}
function tokenize(s){ return normalize(s).split(' ').filter(Boolean); }
function haystack(it){ return normalize(`${it.title} ${it.symbol} ${it.notes}`); }
function matchesQuery(it, qTokens){ if(qTokens.length===0) return true; const hay = haystack(it); return qTokens.every(t => hay.includes(t)); }
function cmp(a,b){ return a<b ? -1 : a>b ? 1 : 0; }

const SECTION_ORDER = [
  "CMA related decisions and documents",
  "Regular reports to the Supervisory Body",
  "Standards",
  "Procedures",
  "Tools",
  "Information notes",
  "Forms"
];

function sectionIndex(name){
  const i = SECTION_ORDER.indexOf(name||'');
  return i === -1 ? 999 : i;
}

function getView(){ const v=document.querySelector('input[name="view"]:checked'); return v?v.value:'docs'; }
function getLayout(){ const v=document.querySelector('input[name="layout"]:checked'); return v?v.value:'list'; }

function renderCardsGrouped(items){
  // Group by section->subsection
  const map = new Map();
  for(const it of items){
    const sec = (it.section || it.type || 'Other').trim();
    const sub = (it.subsection || it.category || 'General').trim();
    if(!map.has(sec)) map.set(sec, new Map());
    const submap = map.get(sec);
    if(!submap.has(sub)) submap.set(sub, []);
    submap.get(sub).push(it);
  }
  const cont = document.getElementById('list');
  cont.innerHTML = '';
  const sections = Array.from(map.entries()).map(([title, submap])=>({title, submap}));
  sections.sort((a,b)=> sectionIndex(a.title)-sectionIndex(b.title) || a.title.localeCompare(b.title));
  for(const sec of sections){
    const secDiv = document.createElement('section');
    secDiv.className = 'group';
    const h2 = document.createElement('h2'); h2.textContent = sec.title; secDiv.appendChild(h2);
    const subs = Array.from(sec.submap.entries()).map(([name, arr])=>({name, arr})).sort((a,b)=> a.name.localeCompare(b.name));
    for(const sg of subs){
      const h3 = document.createElement('div'); h3.className = 'subhead'; h3.textContent = sg.name; secDiv.appendChild(h3);
      const ul = document.createElement('ul'); ul.className = 'cards';
      sg.arr.sort((a,b)=> cmp(b.date||'', a.date||'') || cmp(a.symbol||'', b.symbol||''));
      for(const it of sg.arr){
        const li = document.createElement('li'); li.className = 'card';
        li.innerHTML = `
          <h3><a href="${it.url}" target="_blank" rel="noopener">${it.title}</a></h3>
          <div class="meta">
            <span class="badge">${it.symbol||''}</span>
            <span>v${it.version||''}</span>
            <span>• ${it.date||''}</span>
            <span>• ${it.type||''}</span>
            <span>• ${(it.subsection||it.category||'').trim()||'General'}</span>
          </div>
        `;
        ul.appendChild(li);
      }
      secDiv.appendChild(ul);
    }
    cont.appendChild(secDiv);
  }
}

function renderListFlat(items){
  // Single table for all items, sorted Section > Subsection > Title
  const cont = document.getElementById('list');
  cont.innerHTML = '';
  if(!items.length){
    cont.innerHTML = '<div style="opacity:.7">No results. Remove filters or try a broader term.</div>';
    return;
  }
  // sort
  items.sort((a,b)=> sectionIndex(a.section||a.type)-sectionIndex(b.section||b.type)
                  || (a.section||'').localeCompare(b.section||'')
                  || (a.subsection||'').localeCompare(b.subsection||'')
                  || (a.symbol||'').localeCompare(b.symbol||'')
                  || (a.title||'').localeCompare(b.title||''));

  const wrap = document.createElement('div'); wrap.className = 'table-wrap';
  const table = document.createElement('table'); table.className = 'table';
  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-title">Title</th>
        <th class="col-symbol">Symbol</th>
        <th>Version</th>
        <th class="col-date">Entry into force / Date</th>
        <th>Type</th>
        <th class="col-section">Section</th>
        <th class="col-subsection">Subsection</th>
        <th class="pdf">PDF</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  const frag = document.createDocumentFragment();
  for(const it of items){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-title"><a href="${it.url}" target="_blank" rel="noopener">${it.title||''}</a></td>
      <td class="col-symbol">${it.symbol||''}</td>
      <td>${it.version||''}</td>
      <td class="col-date">${it.date||''}</td>
      <td>${it.type||''}</td>
      <td class="col-section">${it.section||it.type||''}</td>
      <td class="col-subsection">${it.subsection||it.category||''}</td>
      <td class="pdf"><a href="${it.url}" target="_blank" rel="noopener">Open</a></td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
  wrap.appendChild(table);
  cont.appendChild(wrap);
}

function renderHits(occ, metaByUrl){
  const cont = document.getElementById('hits');
  const header = document.getElementById('hitsHeader');
  cont.innerHTML = '';
  header.innerHTML = `${occ.length} match${occ.length===1?'':'es'} — <span class="kbd">↑</span>/<span class="kbd">↓</span> or <span class="kbd">j</span>/<span class="kbd">k</span>`;
  if(!occ.length){
    cont.innerHTML = '<div style="opacity:.7">No matches found.</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  occ.forEach((h, i) => {
    const meta = metaByUrl[h.url] || {};
    const div = document.createElement('div');
    div.className = 'hit';
    div.setAttribute('data-index', i.toString());
    div.innerHTML = `
      <div class="hit-title"><a href="${h.url}" target="_blank" rel="noopener">${meta.title || h.title || h.url}</a></div>
      <div class="meta">
        ${meta.symbol ? `<span>${meta.symbol}</span> • ` : ''}
        ${meta.type ? `<span>${meta.type}</span> • ` : ''}
        ${(meta.subsection||meta.category) ? `<span>${(meta.subsection||meta.category)}</span> • ` : ''}
        ${meta.date ? `<span>${meta.date}</span>` : ''}
      </div>
      <div class="snip">${h.snippet}</div>
    `;
    frag.appendChild(div);
  });
  cont.appendChild(frag);
}

function getFiltered(data, textHits){
  const fulltextOn = document.getElementById('fulltextToggle')?.checked;
  const qRaw = document.getElementById('q')?.value || '';
  const qTokens = tokenize(qRaw);
  const type = document.getElementById('type')?.value || '';
  const category = document.getElementById('category')?.value || '';

  const byUrl = {};
  if(fulltextOn && textHits && textHits.length){
    for(const h of textHits){ byUrl[h.url] = h; }
  }

  let items = data.map(it => {
    const hit = byUrl[it.url];
    return hit ? {...it, _snippets: hit.snippets, _score: hit.score, _count: hit.count} : {...it, _snippets: null, _score: 0, _count: 0};
  });

  items = items.filter(it => {
    const matchMeta = matchesQuery(it, qTokens) || (fulltextOn ? (it._count>0) : false);
    const matchType = !type || it.type === type;
    const matchCat = !category || (it.subsection||it.category||'').toLowerCase() === category.toLowerCase();
    return matchMeta && matchType && matchCat;
  });

  return items;
}

(async function init(){
  const data = await loadData();
  const metaByUrl = Object.fromEntries(data.map(d => [d.url, d]));

  let lastQ = '';
  let lastDocHits = [];
  let lastOccHits = [];

  async function run(){
    const q = document.getElementById('q')?.value || '';
    const useFull = document.getElementById('fulltextToggle')?.checked;
    const view = getView();
    const layout = getLayout();

    if(useFull && q !== lastQ){
      if(window.a64SearchFulltextMulti){ lastDocHits = await window.a64SearchFulltextMulti(q); } else { lastDocHits = []; }
      if(window.a64SearchOccurrences){ lastOccHits = await window.a64SearchOccurrences(q); } else { lastOccHits = []; }
      lastQ = q;
    }

    if(view === 'hits'){
      document.getElementById('list').classList.add('hidden');
      document.getElementById('count').classList.add('hidden');
      document.getElementById('hits').classList.remove('hidden');
      document.getElementById('hitsHeader').classList.remove('hidden');
      const occ = lastOccHits || [];
      renderHits(occ, metaByUrl);
    }else{
      document.getElementById('list').classList.remove('hidden');
      document.getElementById('count').classList.remove('hidden');
      document.getElementById('hits').classList.add('hidden');
      document.getElementById('hitsHeader').classList.add('hidden');

      const items = getFiltered(data, lastDocHits);
      document.getElementById('count').textContent = `${items.length} document${items.length===1?'':'s'}`;
      if(layout === 'cards'){
        renderCardsGrouped(items);
      }else{
        renderListFlat(items);
      }
    }
  }

  ['q','type','category','sort','fulltextToggle'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.addEventListener('input', run); el.addEventListener('change', run); }
  });
  document.querySelectorAll('input[name="view"]').forEach(r => r.addEventListener('change', run));
  document.querySelectorAll('input[name="layout"]').forEach(r => r.addEventListener('change', run));

  const resetBtn = document.getElementById('reset');
  if(resetBtn){
    resetBtn.addEventListener('click', ()=>{
      const qEl = document.getElementById('q'); if(qEl) qEl.value='';
      const tEl = document.getElementById('type'); if(tEl) tEl.value='';
      const cEl = document.getElementById('category'); if(cEl) cEl.value='';
      const sEl = document.getElementById('sort'); if(sEl) sEl.value='date_desc';
      const ftEl = document.getElementById('fulltextToggle'); if(ftEl) ftEl.checked=false;
      const viewDocs = document.querySelector('input[name="view"][value="docs"]'); if(viewDocs) viewDocs.checked = true;
      const layoutList = document.querySelector('input[name="layout"][value="list"]'); if(layoutList) layoutList.checked = true;
      lastQ=''; lastDocHits=[]; lastOccHits=[];
      run();
    });
  }

  run();
})();