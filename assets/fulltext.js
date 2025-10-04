\
/* assets/fulltext.js — drop‑in full‑text search for PACM site
   Works with:
   - #q input
   - #fulltextToggle checkbox
   - radio[name="view"] = docs|hits
   - #hits and #hitsHeader containers
   - #reset button
   Loads index from one of:
   - search_index.json (site root)
   - ./search_index.json (relative)
   - data/search_index.json (fallback)
*/
(function(){
  const HITS_LIMIT = 200;
  const MAX_SNIPPET = 220;   // characters per hit
  const CONTEXT = 80;        // context chars around the match
  const SOURCES = ['search_index.json', './search_index.json', 'data/search_index.json'];

  const qEl = document.getElementById('q');
  const toggleEl = document.getElementById('fulltextToggle');
  const hitsEl = document.getElementById('hits');
  const hitsHeaderEl = document.getElementById('hitsHeader');
  const radios = document.querySelectorAll('input[name="view"]');
  const resetBtn = document.getElementById('reset');

  let INDEX = null;
  let indexLoaded = false;
  let lastSourceTried = null;

  function log(){ try{ console.debug.apply(console, ['[fulltext]'].concat([].slice.call(arguments))); }catch(e){} }

  function switchView(name){
    const r = document.querySelector(`input[name="view"][value="${name}"]`);
    if(r){ r.checked = true; r.dispatchEvent(new Event('change')); }
  }

  function setHeader(text){
    if(!hitsHeaderEl) return;
    if(!text){ hitsHeaderEl.classList.add('hidden'); hitsHeaderEl.textContent=''; }
    else { hitsHeaderEl.classList.remove('hidden'); hitsHeaderEl.textContent = text; }
  }

  function clearHits(){
    if(hitsEl) hitsEl.innerHTML='';
    setHeader('');
  }

  function normalizeRecord(r){
    // Make best effort to map arbitrary schemas
    return {
      url: r.url || r.u || r.link || '',
      title: r.title || r.ti || r.doc_title || r.name || '',
      symbol: r.symbol || r.sy || r.doc_symbol || '',
      section: r.section || r.sec || '',
      subsection: r.subsection || r.sub || '',
      // text field (big blob)
      text: r.text || r.content || r.c || r.body || ''
    };
  }

  function fetchIndex(){
    if(indexLoaded) return Promise.resolve(INDEX||[]);
    // Try sources in order
    function tryNext(i){
      if(i >= SOURCES.length){
        indexLoaded = true;
        INDEX = [];
        return Promise.resolve([]);
      }
      const src = SOURCES[i];
      lastSourceTried = src;
      return fetch(src, {cache:'no-cache'})
        .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(json => {
          indexLoaded = true;
          // allow wrapped forms: {records:[...]}, {docs:[...]}, or direct array
          let arr = Array.isArray(json) ? json : (json.records || json.docs || json.items || []);
          if(!Array.isArray(arr)) arr = [];
          INDEX = arr.map(normalizeRecord).filter(x => x.url && x.text);
          log('Loaded index:', src, 'records:', INDEX.length);
          return INDEX;
        })
        .catch(e => {
          log('Index load failed from', src, e);
          return tryNext(i+1);
        });
    }
    return tryNext(0);
  }

  function escapeHtml(s){ return (s||'').replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }

  function makeSnippet(text, q){
    const lc = text.toLowerCase();
    const idx = lc.indexOf(q.toLowerCase());
    if(idx === -1){
      // fallback: start of text
      return escapeHtml(text.slice(0, MAX_SNIPPET)) + (text.length>MAX_SNIPPET?'…':'');
    }
    const start = Math.max(0, idx - CONTEXT);
    const end = Math.min(text.length, idx + q.length + CONTEXT);
    const before = escapeHtml(text.slice(start, idx));
    const match = escapeHtml(text.slice(idx, idx + q.length));
    const after = escapeHtml(text.slice(idx + q.length, end));
    const prefix = (start>0?'…':''); const suffix = (end<text.length?'…':'');
    return prefix + before + '<mark>' + match + '</mark>' + after + suffix;
  }

  function isQuoted(q){ return q.startsWith('"') && q.endsWith('"') && q.length>2; }
  function tokenize(q){
    const parts = q.trim().match(/"[^"]+"|\\S+/g) || [];
    return parts.map(p => p.replace(/^"|"$/g,''));
  }

  function filterRecords(records, query){
    if(!query) return [];
    // phrase vs AND terms
    if(isQuoted(query)){
      const phrase = query.slice(1, -1).toLowerCase();
      return records.filter(r => (r.text||'').toLowerCase().includes(phrase));
    }
    const terms = tokenize(query).map(s => s.toLowerCase());
    return records.filter(r => {
      const t = (r.text||'').toLowerCase();
      // AND over terms
      for(let i=0;i<terms.length;i++){ if(!t.includes(terms[i])) return false; }
      return true;
    });
  }

  function toPdfUrl(url, q){
    try{
      if(!/\\.pdf(?:$|[?#])/.test(url)) return url;
      // append or merge fragment
      const u = new URL(url, location.href);
      // Keep existing hash, but add search= for native PDF find box
      const frag = u.hash ? u.hash.replace(/^#/, '') + '&' : '';
      u.hash = '#' + frag + 'search=' + encodeURIComponent(q.replace(/^"|"$/g,''));
      return u.toString();
    }catch(e){
      return url + (url.includes('#')?'&':'#') + 'search=' + encodeURIComponent(q.replace(/^"|"$/g,''));
    }
  }

  function renderHits(records, query){
    if(!hitsEl) return;
    const hits = records.slice(0, HITS_LIMIT);
    const parts = [];
    for(const r of hits){
      const url = toPdfUrl(r.url, query);
      const title = escapeHtml(r.title || '(untitled)');
      const symbol = escapeHtml(r.symbol || '');
      const section = escapeHtml([r.section, r.subsection].filter(Boolean).join(' — '));
      const snip = makeSnippet(r.text || '', query);
      parts.push(
        `<article class="hit">
          <header class="hit-h">
            <a href="${url}" target="_blank" rel="noopener">${title}</a>
            ${symbol ? ` <span class="sym">(${symbol})</span>` : ''}
            ${section ? ` <span class="sec">${section}</span>` : ''}
          </header>
          <p class="hit-s">${snip}</p>
        </article>`
      );
    }
    hitsEl.innerHTML = parts.join('\\n');
    setHeader(hits.length ? `${hits.length} match${hits.length===1?'':'es'}` : 'No matches');
  }

  function runSearch(){
    const q = (qEl && qEl.value || '').trim();
    if(!q){ clearHits(); return; }
    fetchIndex().then(records => {
      const filtered = filterRecords(records, q);
      renderHits(filtered, q);
    });
  }

  // Wire up UI
  if(qEl){
    qEl.addEventListener('input', () => {
      if(toggleEl && toggleEl.checked){
        switchView('hits');
        runSearch();
      }
    });
  }
  if(toggleEl){
    toggleEl.addEventListener('change', () => {
      if(toggleEl.checked){
        switchView('hits');
        runSearch();
      }
    });
  }
  if(radios){
    radios.forEach(r => r.addEventListener('change', (e) => {
      if(e.target.value === 'hits'){
        runSearch();
      }
    }));
  }
  if(resetBtn){
    resetBtn.addEventListener('click', () => {
      clearHits();
      if(toggleEl) toggleEl.checked = false;
    });
  }

  // Expose for debugging
  window.PACM_fulltext = { fetchIndex, runSearch };
})();