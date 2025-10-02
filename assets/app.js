(function(){
  const CATALOG_URL = 'data/a64_catalogue.json';
  const HEADERS = ['Document', 'Symbol', 'Version', 'Entry into force / Date'];

  const statusEl = document.getElementById('doc-status');
  const table = document.getElementById('doc-table');
  const thead = table && table.querySelector('thead');
  const tbody = (table && table.querySelector('tbody#doc-tbody')) || document.getElementById('doc-tbody');
  const searchBox = document.getElementById('q');

  function setStatus(msg){
    if(!statusEl) return;
    if(!msg){ statusEl.textContent=''; statusEl.style.display='none'; }
    else { statusEl.textContent = msg; statusEl.style.display=''; }
  }
  function esc(s){ return (s||'').replace(/[&<>\"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\\'':'&#39;' }[m])); }

  function normalizeSymbol(sym){
    if(!sym) return '';
    let s = String(sym).trim();
    const mCMA = s.match(/(\d+\/CMA\.\d)/i);
    const mA64 = s.match(/(A6\.4-[A-Z]+(?:-[A-Z]+)*-\d{3})/i);
    const mUN  = s.match(/(FCCC\/PA\/CMA\/\d{4}\/[\w./-]+)/i);
    if(mCMA) return mCMA[1];
    if(mA64) return mA64[1];
    if(mUN)  return mUN[1];
    return s;
  }

  function dedupeBySymbol(rows){
    const seen = new Map();
    const out = [];
    const score = (x)=>['date','version','type','section','subsection'].reduce((n,k)=>n+(x[k] && String(x[k]).trim() ? 1:0),0);
    for(const r of rows){
      const key = normalizeSymbol(r.symbol) || (r.url||'').replace(/#.*$/,''); // fallback to URL sans hash
      if(!key){ out.push(r); continue; }
      if(seen.has(key)){
        const prev = seen.get(key);
        if(score(r) > score(prev)){
          const idx = out.indexOf(prev);
          if(idx>=0) out[idx] = r;
          seen.set(key, r);
        }
      } else {
        seen.set(key, r);
        out.push(r);
      }
    }
    return out;
  }

  function groupData(rows){
    const bySection = new Map();
    for(const r of rows){
      const sec = r.section || 'Other';
      const sub = r.subsection || '';
      if(!bySection.has(sec)) bySection.set(sec, new Map());
      const inner = bySection.get(sec);
      if(!inner.has(sub)) inner.set(sub, []);
      inner.get(sub).push(r);
    }
    return bySection;
  }

  function ensureHeaders(){
    if(!thead || !table) return;
    thead.innerHTML = `<tr>${HEADERS.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  }

  function render(){
    if(!tbody){ setStatus('Table body is missing (#doc-tbody).'); return; }
    setStatus('Loading…');
    fetch(CATALOG_URL, { cache: 'no-cache' })
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(data => {
        let rows = data.map(d => ({
          title: d.title, url: d.url, symbol: d.symbol,
          version: d.version || '', date: d.date || '',
          type: d.type || '', section: d.section || '', subsection: d.subsection || ''
        }));
        rows = dedupeBySymbol(rows);

        const q = (searchBox && searchBox.value || '').trim().toLowerCase();
        if(q){
          rows = rows.filter(r => (r.title||'').toLowerCase().includes(q) || (r.symbol||'').toLowerCase().includes(q));
        }

        rows.sort((a,b)=> (a.section||'').localeCompare(b.section||'') ||
                          (a.subsection||'').localeCompare(b.subsection||'') ||
                          (a.title||'').localeCompare(b.title||''));

        const grouped = groupData(rows);
        ensureHeaders();
        const parts = [];
        const colCount = HEADERS.length;

        for(const [sec, subMap] of grouped){
          parts.push(`<tr class="group-row"><td colspan="${colCount}">${esc(sec)}</td></tr>`);
          for(const [sub, items] of subMap){
            if(sub){ parts.push(`<tr class="subgroup-row"><td colspan="${colCount}">${esc(sub)}</td></tr>`); }
            for(const r of items){
              parts.push(`<tr class="doc-row">
                <td class="cell-title"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></td>
                <td class="cell-symbol">${esc(normalizeSymbol(r.symbol))}</td>
                <td class="cell-version">${esc(r.version || '')}</td>
                <td class="cell-date">${esc(r.date || '')}</td>
              </tr>`);
            }
          }
        }
        tbody.innerHTML = parts.join('\\n');
        setStatus('');
      })
      .catch(err => {
        console.error('[PACM] render failed:', err);
        setStatus('Failed to load catalogue.');
        if(tbody) tbody.innerHTML = `<tr><td colspan="${HEADERS.length}" class="error">Could not fetch data/a64_catalogue.json</td></tr>`;
      });
  }

  if(searchBox){ searchBox.addEventListener('input', render); }
  document.addEventListener('DOMContentLoaded', render);
  window.PACM_renderTable = render;
})();