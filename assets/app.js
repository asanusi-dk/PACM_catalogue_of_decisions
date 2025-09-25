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

function normalize(s){
  return (s||'')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g,' ')
    .trim();
}
function tokenize(s){ return normalize(s).split(' ').filter(Boolean); }
function haystack(it){ return normalize(`${it.title} ${it.symbol} ${it.notes}`); }
function matchesQuery(it, qTokens){ if(qTokens.length===0) return true; const hay = haystack(it); return qTokens.every(t => hay.includes(t)); }
function cmp(a,b){ return a<b ? -1 : a>b ? 1 : 0; }

// -------- Grouping logic --------
const SECTION_ORDER = [
  { key: 'CMA',  title: 'CMA related decisions and documents', match: it => (it.type||'').toLowerCase() === 'cma decision' },
  { key: 'REPORTS', title: 'Regular reports to the Supervisory Body', match: it => {
      const t = (it.title||'').toLowerCase();
      const sym = (it.symbol||'').toUpperCase();
      return t.startsWith('status of article 6.4 mechanism resource allocation plan') || sym.startsWith('A6.4-INFO-GOV-023') || sym.startsWith('A6.4-INFO-GOV-025');
    }},
  { key: 'STAN', title: 'Standards',   match: it => (it.type||'').toLowerCase() === 'standard' },
  { key: 'PROC', title: 'Procedures',  match: it => (it.type||'').toLowerCase() === 'procedure' },
  { key: 'TOOL', title: 'Tools',       match: it => (it.type||'').toLowerCase() === 'tool' },
  { key: 'INFO', title: 'Information notes', match: it => (it.type||'').toLowerCase() === 'information note' },
  { key: 'FORM', title: 'Forms',       match: it => (it.type||'').toLowerCase().startsWith('form') }
];

const SUBCAT_ORDER = ['Accreditation','Activity Cycle','Methodology','Removals','Governance','Registry','Transition','CMA','Other'];

function displaySubcatName(cat){
  if(!cat) return 'Other';
  const c = cat.toLowerCase();
  if(c.startsWith('methodolog')) return 'Methodology';
  if(c.startsWith('activity')) return 'Activity Cycle';
  if(c.startsWith('accred')) return 'Accreditation';
  if(c.startsWith('govern')) return 'Governance';
  if(c.startsWith('removal') || c.startsWith('non-perman')) return 'Removals';
  if(c.startsWith('regis')) return 'Registry';
  if(c.startsWith('transit')) return 'Transition';
  if(c==='cma') return 'CMA';
  return cat;
}

function groupItems(items){
  // Make a copy
  const pool = [...items];
  const sections = [];
  for(const sec of SECTION_ORDER){
    const take = pool.filter(it => sec.match(it));
    if(!take.length) continue;
    // remove from pool
    for(const it of take){
      const idx = pool.indexOf(it);
      if(idx>-1) pool.splice(idx,1);
    }
    // subgroup by category
    const submap = new Map();
    for(const it of take){
      const name = displaySubcatName(it.category||'');
      if(!submap.has(name)) submap.set(name, []);
      submap.get(name).push(it);
    }
    // order subcats
    const subcats = Array.from(submap.entries()).map(([name, arr])=>({name, arr}));
    subcats.sort((a,b)=>{
      const ai = SUBCAT_ORDER.indexOf(a.name); const bi = SUBCAT_ORDER.indexOf(b.name);
      const aidx = ai===-1 ? 999 : ai; const bidx = bi===-1 ? 999 : bi;
      return aidx - bidx || a.name.localeCompare(b.name);
    });
    // sort items inside each subcat
    for(const sg of subcats){
      sg.arr.sort((a,b)=> cmp(b.date||'', a.date||'') || cmp(a.symbol||'', b.symbol||''));
    }
    sections.push({title: sec.title, subcats});
  }
  return sections;
}

// -------- Rendering --------
function renderSections(sections){
  const cont = document.getElementById('list');
  cont.innerHTML = '';
  if(!sections.length){
    cont.innerHTML = '<div style="opacity:.7">No results. Try a broader term or remove filters.</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for(const sec of sections){
    const secDiv = document.createElement('section');
    secDiv.className = 'group';
    secDiv.id = 'sec-' + sec.title.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const h2 = document.createElement('h2');
    h2.textContent = sec.title;
    secDiv.appendChild(h2);

    for(const sg of sec.subcats){
      const h3 = document.createElement('div');
      h3.className = 'subhead';
      h3.textContent = sg.name;
      secDiv.appendChild(h3);

      const ul = document.createElement('ul');
      ul.className = 'cards';
      for(const it of sg.arr){
        const li = document.createElement('li');
        li.className = 'card';
        const snips = (it._snippets && it._snippets.length) ? `<div class="snip">${it._snippets[0]}</div>` : '';
        li.innerHTML = `
          <h3><a href="${it.url}" target="_blank" rel="noopener">${it.title}</a></h3>
          <div class="meta">
            <span class="badge">${it.symbol||''}</span>
            <span>v${it.version||''}</span>
            <span>• ${it.date||''}</span>
            <span>• ${it.type||''}</span>
            <span>• ${displaySubcatName(it.category||'')}</span>
          </div>
          <div class="notes">${it.notes||''}</div>
          ${snips}
        `;
        ul.appendChild(li);
      }
      secDiv.appendChild(ul);
    }
    frag.appendChild(secDiv);
  }
  cont.appendChild(frag);
}

function renderHits(occ, metaByUrl){
  const cont = document.getElementById('hits');
  const header = document.getElementById('hitsHeader');
  cont.innerHTML = '';
  header.innerHTML = `${occ.length} match${occ.length===1?'':'es'} — <span style="opacity:.8">Use ↑/↓ or j/k to navigate</span>`;
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
        ${displaySubcatName(meta.category||'') ? `<span>${displaySubcatName(meta.category||'')}</span> • ` : ''}
        ${meta.date ? `<span>${meta.date}</span>` : ''}
      </div>
      <div class="snip">${h.snippet}</div>
    `;
    frag.appendChild(div);
  });
  cont.appendChild(frag);
}

// -------- Controllers --------
function getViewMode(){ const v = document.querySelector('input[name="view"]:checked'); return v ? v.value : 'docs'; }
function setContainersForView(view){
  const list = document.getElementById('list');
  const count = document.getElementById('count');
  const hits = document.getElementById('hits');
  const hitsHeader = document.getElementById('hitsHeader');
  if(view === 'hits'){
    list.classList.add('hidden'); count.classList.add('hidden');
    hits.classList.remove('hidden'); hitsHeader.classList.remove('hidden');
  }else{
    list.classList.remove('hidden'); count.classList.remove('hidden');
    hits.classList.add('hidden'); hitsHeader.classList.add('hidden');
  }
}

function applyFiltersDocs(data, textHits){
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

  // filters
  items = items.filter(it => {
    const matchMeta = matchesQuery(it, qTokens) || (fulltextOn ? (it._count>0) : false);
    const matchType = !type || it.type === type;
    const catName = displaySubcatName(it.category||'');
    const matchCat = !category || catName === category;
    return matchMeta && matchType && matchCat;
  });

  // Group and render
  const sections = groupItems(items);
  renderSections(sections);

  // Count
  const total = items.length;
  document.getElementById('count').textContent = `${total} document${total===1?'':'s'}`;
}

function filterOccByMeta(occ, metaByUrl){
  const type = document.getElementById('type')?.value || '';
  const category = document.getElementById('category')?.value || '';
  if(!type && !category) return occ;
  return occ.filter(h => {
    const m = metaByUrl[h.url] || {};
    const catName = displaySubcatName(m.category||'');
    if(type && m.type !== type) return false;
    if(category && catName !== category) return false;
    return true;
  });
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
    const view = getViewMode();
    if(useFull && q !== lastQ){
      if(window.a64SearchFulltextMulti){ lastDocHits = await window.a64SearchFulltextMulti(q); } else { lastDocHits = []; }
      if(window.a64SearchOccurrences){ lastOccHits = await window.a64SearchOccurrences(q); } else { lastOccHits = []; }
      lastQ = q;
    }
    if(view === 'hits'){
      setContainersForView('hits');
      const filteredOcc = filterOccByMeta(lastOccHits, metaByUrl);
      renderHits(filteredOcc, metaByUrl);
    }else{
      setContainersForView('docs');
      applyFiltersDocs(data, lastDocHits);
    }
  }

  ['q','type','category','sort','fulltextToggle'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.addEventListener('input', run); el.addEventListener('change', run); }
  });
  document.querySelectorAll('input[name="view"]').forEach(r => r.addEventListener('change', run));

  const resetBtn = document.getElementById('reset');
  if(resetBtn){
    resetBtn.addEventListener('click', ()=>{
      const qEl = document.getElementById('q'); if(qEl) qEl.value='';
      const tEl = document.getElementById('type'); if(tEl) tEl.value='';
      const cEl = document.getElementById('category'); if(cEl) cEl.value='';
      const sEl = document.getElementById('sort'); if(sEl) sEl.value='date_desc';
      const ftEl = document.getElementById('fulltextToggle'); if(ftEl) ftEl.checked=false;
      const viewDocs = document.querySelector('input[name="view"][value="docs"]'); if(viewDocs) viewDocs.checked = true;
      lastQ=''; lastDocHits=[]; lastOccHits=[];
      run();
    });
  }
  run();
})();