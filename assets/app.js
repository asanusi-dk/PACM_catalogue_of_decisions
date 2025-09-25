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

function tokenize(s){
  return normalize(s).split(' ').filter(Boolean);
}

function haystack(it){
  return normalize(`${it.title} ${it.symbol} ${it.notes}`);
}

function matchesQuery(it, qTokens){
  if(qTokens.length === 0) return true;
  const hay = haystack(it);
  return qTokens.every(t => hay.includes(t));
}

function cmp(a,b){ return a<b? -1 : a>b? 1 : 0; }

function render(items){
  const list = document.getElementById('list');
  const count = document.getElementById('count');
  list.innerHTML = '';
  count.textContent = `${items.length} document${items.length===1?'':'s'}`;
  if(!items.length){
    list.innerHTML = '<li style="opacity:.7">No results. Try a broader term (e.g., "standard", "removals", or a symbol like "A6.4").</li>';
    return;
  }
  for(const it of items){
    const li = document.createElement('li');
    li.className = 'card';
    const snipBlock = (()=>{
      if(!it._snippets || !it._snippets.length) return '';
      const collapsed = 'collapsed';
      const btn = `<button class="toggle-snips" data-url="${it.url}" aria-expanded="false">Show all ${it._snippets.length} match${it._snippets.length===1?'':'es'}</button>`;
      const lines = it._snippets.map(s=>`<div class="snip">${s}</div>`).join('');
      return `<div class="snips ${collapsed}" id="snips-${btoa(it.url).replace(/=+/g,'')}">${lines}</div>${btn}`;
    })();
    li.innerHTML = `
      <h3><a href="${it.url}" target="_blank" rel="noopener">${it.title}</a></h3>
      <div class="meta">
        <span class="badge">${it.symbol||''}</span>
        <span>v${it.version||''}</span>
        <span>• ${it.date||''}</span>
        <span>• ${it.type||''}</span>
        <span>• ${it.category||''}</span>
      </div>
      <div class="notes">${it.notes||''}</div>
      ${snipBlock}
    `;
    list.appendChild(li);
  }

  // Hook up toggles
  list.querySelectorAll('.toggle-snips').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      const id = 'snips-' + btoa(url).replace(/=+/g,'');
      const block = document.getElementById(id);
      const expanded = block && block.classList.contains('collapsed') ? false : true;
      if(block){
        if(expanded){
          block.classList.add('collapsed');
          btn.textContent = btn.textContent.replace('Show fewer','Show all');
          btn.setAttribute('aria-expanded','false');
        }else{
          block.classList.remove('collapsed');
          btn.textContent = btn.textContent.replace('Show all','Show fewer');
          btn.setAttribute('aria-expanded','true');
        }
      }
    });
  });
}

function applyFilters(data, textHits){
  const fulltextOn = document.getElementById('fulltextToggle')?.checked;
  const qRaw = document.getElementById('q')?.value || '';
  const qTokens = tokenize(qRaw);
  const type = document.getElementById('type')?.value || '';
  const category = document.getElementById('category')?.value || '';
  const sort = document.getElementById('sort')?.value || 'date_desc';

  const byUrl = {};
  if(fulltextOn && textHits && textHits.length){
    for(const h of textHits){
      byUrl[h.url] = h; // {url, snippets:[], score, count}
    }
  }

  let items = data.map(it => {
    const hit = byUrl[it.url];
    return hit ? {...it, _snippets: hit.snippets, _score: hit.score, _count: hit.count} : {...it, _snippets: null, _score: 0, _count: 0};
  });

  items = items.filter(it => {
    const matchMeta = matchesQuery(it, qTokens) || (fulltextOn ? (it._count>0) : false);
    const matchType = !type || it.type === type;
    const matchCat = !category || it.category === category;
    return matchMeta && matchType && matchCat;
  });

  if(fulltextOn){
    items.sort((a,b)=> b._count - a._count || b._score - a._score || cmp(b.date||'', a.date||''));
  }else{
    if(sort === 'date_desc') items.sort((a,b)=> cmp(b.date||'', a.date||''));
    else if(sort === 'date_asc') items.sort((a,b)=> cmp(a.date||'', b.date||''));
    else if(sort === 'symbol') items.sort((a,b)=> cmp(a.symbol||'', b.symbol||''));
  }

  render(items);
}

(async function init(){
  const data = await loadData();
  let lastQ = '';
  let lastHits = [];

  async function run(){
    const q = document.getElementById('q')?.value || '';
    const useFull = document.getElementById('fulltextToggle')?.checked;
    if(useFull && q !== lastQ){
      if(window.a64SearchFulltextMulti){
        lastHits = await window.a64SearchFulltextMulti(q);
      }else{
        lastHits = [];
      }
      lastQ = q;
    }
    applyFilters(data, lastHits);
  }

  ['q','type','category','sort','fulltextToggle'].forEach(id => {
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    }
  });
  const resetBtn = document.getElementById('reset');
  if(resetBtn){
    resetBtn.addEventListener('click', ()=>{
      const qEl = document.getElementById('q'); if(qEl) qEl.value='';
      const tEl = document.getElementById('type'); if(tEl) tEl.value='';
      const cEl = document.getElementById('category'); if(cEl) cEl.value='';
      const sEl = document.getElementById('sort'); if(sEl) sEl.value='date_desc';
      const ftEl = document.getElementById('fulltextToggle'); if(ftEl) ftEl.checked=false;
      lastQ=''; lastHits=[];
      run();
    });
  }
  run();
})();