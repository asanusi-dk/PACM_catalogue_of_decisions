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

function getView(){ const v=document.querySelector('input[name="view"]:checked'); return v?v.value:'docs'; }

function renderListFlat(items){
  const cont = document.getElementById('list');
  cont.innerHTML = '';
  if(!items.length){
    cont.innerHTML = '<div style="opacity:.7">No results. Try removing filters or broaden your search.</div>';
    return;
  }
  // stable sort
  items.sort((a,b)=> (a.section||'').localeCompare(b.section||'')
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

  const byUrl = {};
  if(fulltextOn && textHits && textHits.length){
    for(const h of textHits){ byUrl[h.url] = h; }
  }

  let items = data.map(it => {
    const hit = byUrl[it.url];
    return hit ? {...it, _snippets: hit.snippets, _score: hit.score, _count: hit.count} : {...it, _snippets: null, _score: 0, _count: 0};
  });

  // Only text filter (and full-text if toggled)
  items = items.filter(it => matchesQuery(it, qTokens) || (fulltextOn ? (it._count>0) : false));
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
      renderListFlat(items);
    }
  }

  ['q','fulltextToggle'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.addEventListener('input', run); el.addEventListener('change', run); }
  });
  document.querySelectorAll('input[name="view"]').forEach(r => r.addEventListener('change', run));

  const resetBtn = document.getElementById('reset');
  if(resetBtn){
    resetBtn.addEventListener('click', ()=>{
      const qEl = document.getElementById('q'); if(qEl) qEl.value='';
      const ftEl = document.getElementById('fulltextToggle'); if(ftEl) ftEl.checked=false;
      const viewDocs = document.querySelector('input[name="view"][value="docs"]'); if(viewDocs) viewDocs.checked = true;
      lastQ=''; lastDocHits=[]; lastOccHits=[];
      run();
    });
  }

  run();
})();