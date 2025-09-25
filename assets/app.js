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
  count.textContent = `${items.length} result${items.length===1?'':'s'}`;
  if(!items.length){
    list.innerHTML = '<li style="opacity:.7">No results. Try a broader term (e.g., "standard", "removals", or a symbol like "A6.4").</li>';
    return;
  }
  for(const it of items){
    const li = document.createElement('li');
    li.className = 'card';
    const snip = it._snippet ? `<div class="snip">${it._snippet}</div>` : '';
    li.innerHTML = `
      <h3><a href="${it.url}" target="_blank" rel="noopener">${it.title}</a></h3>
      <div class="meta">
        <span class="badge">${it.symbol}</span>
        <span>v${it.version}</span>
        <span>• ${it.date}</span>
        <span>• ${it.type}</span>
        <span>• ${it.category}</span>
      </div>
      <div class="notes">${it.notes||''}</div>
      ${snip}
    `;
    list.appendChild(li);
  }
}

function applyFilters(data, textHits){
  const fulltextOn = document.getElementById('fulltextToggle').checked;
  const qRaw = document.getElementById('q').value;
  const qTokens = tokenize(qRaw);
  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value;
  const sort = document.getElementById('sort').value;

  const byUrl = {};
  if(fulltextOn && textHits && textHits.length){
    for(const h of textHits){
      byUrl[h.url] = h;
    }
  }

  let items = data.map(it => {
    const hit = byUrl[it.url];
    return hit ? {...it, _snippet: hit.snippet, _score: hit.score} : {...it, _snippet: null, _score: 0};
  });

  items = items.filter(it => {
    const matchMeta = matchesQuery(it, qTokens) || (fulltextOn ? !!it._snippet : false);
    const matchType = !type || it.type === type;
    const matchCat = !category || it.category === category;
    return matchMeta && matchType && matchCat;
  });

  if(fulltextOn){
    items.sort((a,b)=> b._score - a._score || cmp(b.date, a.date));
  }else{
    if(sort === 'date_desc') items.sort((a,b)=> cmp(b.date, a.date));
    else if(sort === 'date_asc') items.sort((a,b)=> cmp(a.date, b.date));
    else if(sort === 'symbol') items.sort((a,b)=> cmp(a.symbol, b.symbol));
  }

  render(items);
}

(async function init(){
  const data = await loadData();
  let lastQ = '';
  let lastHits = [];

  async function run(){
    const q = document.getElementById('q').value;
    const useFull = document.getElementById('fulltextToggle').checked;
    if(useFull && q !== lastQ){
      if(window.a64SearchFulltext){
        lastHits = await window.a64SearchFulltext(q);
      }else{
        lastHits = [];
      }
      lastQ = q;
    }
    applyFilters(data, lastHits);
  }

  ['q','type','category','sort','fulltextToggle'].forEach(id => {
    document.getElementById(id).addEventListener('input', run);
    document.getElementById(id).addEventListener('change', run);
  });
  document.getElementById('reset').addEventListener('click', ()=>{
    document.getElementById('q').value='';
    document.getElementById('type').value='';
    document.getElementById('category').value='';
    document.getElementById('sort').value='date_desc';
    document.getElementById('fulltextToggle').checked=false;
    lastQ=''; lastHits=[];
    run();
  });
  run();
})();