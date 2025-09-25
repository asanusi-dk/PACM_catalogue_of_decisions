async function loadData(){
  const res = await fetch('data/a64_catalogue.json');
  return await res.json();
}

function normalize(s){ return (s||'').toLowerCase(); }
function cmp(a,b){ return a<b? -1 : a>b? 1 : 0; }

function render(items){
  const list = document.getElementById('list');
  list.innerHTML = '';
  if(!items.length){
    list.innerHTML = '<li style="opacity:.7">No results.</li>';
    return;
  }
  for(const it of items){
    const li = document.createElement('li');
    li.className = 'card';
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
    `;
    list.appendChild(li);
  }
}

function applyFilters(data){
  const q = normalize(document.getElementById('q').value);
  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value;
  const sort = document.getElementById('sort').value;

  let items = data.filter(it => {
    const hay = `${it.title} ${it.symbol} ${it.notes}`.toLowerCase();
    const matchQ = !q || hay.includes(q);
    const matchType = !type || it.type === type;
    const matchCat = !category || it.category === category;
    return matchQ && matchType && matchCat;
  });

  if(sort === 'date_desc') items.sort((a,b)=> cmp(b.date, a.date));
  else if(sort === 'date_asc') items.sort((a,b)=> cmp(a.date, b.date));
  else if(sort === 'symbol') items.sort((a,b)=> cmp(a.symbol, b.symbol));

  render(items);
}

(async function init(){
  const data = await loadData();
  ['q','type','category','sort'].forEach(id => {
    document.getElementById(id).addEventListener('input', ()=> applyFilters(data));
    document.getElementById(id).addEventListener('change', ()=> applyFilters(data));
  });
  applyFilters(data);
})();
