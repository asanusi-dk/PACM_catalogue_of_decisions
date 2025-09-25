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

// Preferred display order for known sections; unknowns appended alphabetically.
const SECTION_ORDER = [
  "CMA related decisions and documents",
  "Regular reports to the Supervisory Body",
  "Standards",
  "Procedures",
  "Tools",
  "Information notes",
  "Forms"
];

function groupByHeadings(items){
  // Build map: section -> subsection -> items
  const map = new Map();
  for(const it of items){
    const sec = (it.section || it.type || 'Other').trim();
    const sub = (it.subsection || it.category || '').trim();
    if(!map.has(sec)) map.set(sec, new Map());
    const submap = map.get(sec);
    const key = sub || 'General';
    if(!submap.has(key)) submap.set(key, []);
    submap.get(key).push(it);
  }
  // Order sections by preferred order then case-insensitive name
  const sections = Array.from(map.entries()).map(([title, submap])=>({title, submap}));
  sections.sort((a,b)=>{
    const ai = SECTION_ORDER.indexOf(a.title);
    const bi = SECTION_ORDER.indexOf(b.title);
    const ao = ai === -1 ? 999 : ai;
    const bo = bi === -1 ? 999 : bi;
    return ao - bo || a.title.localeCompare(b.title);
  });
  // Order subsections alphabetically (but put common ones first if desired)
  for(const s of sections){
    const entries = Array.from(s.submap.entries()).map(([name, arr])=>({name, arr}));
    entries.sort((a,b)=> a.name.localeCompare(b.name));
    // Sort items inside each subgroup by date desc then symbol
    for(const e of entries){
      e.arr.sort((a,b)=> cmp(b.date||'', a.date||'') || cmp(a.symbol||'', b.symbol||''));
    }
    s.subgroups = entries;
  }
  return sections;
}

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

    for(const sg of sec.subgroups){
      const h3 = document.createElement('div');
      h3.className = 'subhead';
      h3.textContent = sg.name;
      secDiv.appendChild(h3);

      const ul = document.createElement('ul');
      ul.className = 'cards';
      for(const it of sg.arr){
        const li = document.createElement('li');
        li.className = 'card';
        const snip = (it._snippets && it._snippets.length) ? `<div class="snip">${it._snippets[0]}</div>` : '';
        li.innerHTML = `
          <h3><a href="${it.url}" target="_blank" rel="noopener">${it.title}</a></h3>
          <div class="meta">
            <span class="badge">${it.symbol||''}</span>
            <span>v${it.version||''}</span>
            <span>• ${it.date||''}</span>
            <span>• ${it.type||''}</span>
            <span>• ${(it.subsection||it.category||'').trim() || 'General'}</span>
          </div>
          <div class="notes">${it.notes||''}</div>
          ${snip}
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
        ${(meta.subsection||meta.category) ? `<span>${(meta.subsection||meta.category)}</span> • ` : ''}
        ${meta.date ? `<span>${meta.date}</span>` : ''}
      </div>
      <div class="snip">${h.snippet}</div>
    `;
    frag.appendChild(div);
  });
  cont.appendChild(frag);
}

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

  items = items.filter(it => {
    const matchMeta = matchesQuery(it, qTokens) || (fulltextOn ? (it._count>0) : false);
    const matchType = !type || it.type === type;
    const matchCat = !category || (it.subsection||it.category||'') === category;
    return matchMeta && matchType && matchCat;
  });

  const sections = groupByHeadings(items);
  renderSections(sections);

  const total = items.length;
  document.getElementById('count').textContent = `${total} document${total===1?'':'s'}`;
}

function filterOccByMeta(occ, metaByUrl){
  const type = document.getElementById('type')?.value || '';
  const category = document.getElementById('category')?.value || '';
  if(!type && !category) return occ;
  return occ.filter(h => {
    const m = metaByUrl[h.url] || {};
    if(type && m.type !== type) return false;
    if(category && (m.subsection||m.category||'') !== category) return false;
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