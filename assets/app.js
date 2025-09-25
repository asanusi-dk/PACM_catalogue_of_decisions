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

  let items = data.map(x => ({...x, _snippet: null}));

  // If full‑text is on and we have hits for the query, merge snippets
  if(fulltextOn && textHits && qTokens.length){
    const byUrl = Object.fromEntries(textHits.map(h => [h.url, h]));
    items = items.map(it => {
      const h = byUrl[it.url];
      return h ? {...it, _snippet: h.snippet} : it;
    });
  }

  items = items.filter(it => {
    const matchMeta = matchesQuery(it, qTokens) || (fulltextOn ? !!it._snippet : false);
    const matchType = !type || it.type === type;
    const matchCat = !category || it.category === category;
    return matchMeta && matchType && matchCat;
  });

  if(sort === 'date_desc') items.sort((a,b)=> cmp(b.date, a.date));
  else if(sort === 'date_asc') items.sort((a,b)=> cmp(a.date, b.date));
  else if(sort === 'symbol') items.sort((a,b)=> cmp(a.symbol, b.symbol));

  render(items);
}

async function searchFulltext(q){
  const status = document.getElementById('status');
  if(!q.trim()) return [];
  try{
    const res = await fetch('search_index.json', {cache: 'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const idx = await res.json(); // [{url, title, text}]
    const nq = q.toLowerCase();
    const hits = [];
    for(const doc of idx){
      const i = doc.text.toLowerCase().indexOf(nq);
      if(i !== -1){
        const start = Math.max(0, i-90);
        const end = Math.min(doc.text.length, i + q.length + 90);
        let snippet = doc.text.slice(start, end);
        // simple highlight
        const safe = snippet.replace(/[&<>]/g, s=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[s]));
        const marked = safe.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), m=>`<span class="mark">${m}</span>`);
        hits.push({ url: doc.url, snippet: (start>0?'… ':'') + marked + (end<doc.text.length?' …':'') });
      }
      if(hits.length>=50) break; // cap results
    }
    status.textContent = '';
    return hits;
  }catch(e){
    status.textContent = 'Full‑text index missing or failed to load (search_index.json).';
    return [];
  }
}

(async function init(){
  const data = await loadData();
  let lastQ = '';
  let lastHits = [];

  async function run(){
    const q = document.getElementById('q').value;
    const useFull = document.getElementById('fulltextToggle').checked;
    if(useFull && q !== lastQ){
      lastHits = await searchFulltext(q);
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