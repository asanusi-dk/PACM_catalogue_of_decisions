(function(){
  function normalize(s){
    return (s||'')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s.-]/g, ' ')
      .replace(/\s+/g,' ')
      .trim();
  }
  function escapeRe(s){
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function parseQuery(q){
    const phrases = [];
    const rx = /"([^"]+)"/g;
    let m;
    while((m = rx.exec(q))){
      if(m[1].trim()) phrases.push(m[1].trim());
    }
    const rest = q.replace(rx, ' ');
    const terms = rest.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    return { phrases, terms };
  }
  async function loadIndex(){
    if(window.__a64_idx) return window.__a64_idx;
    const res = await fetch('search_index.json', {cache:'no-store'});
    if(!res.ok) throw new Error('search_index.json not found');
    const raw = await res.json();
    const idx = raw.map(d => ({
      url: d.url,
      title: d.title || '',
      text: d.text || '',
      norm: normalize(d.text || '')
    }));
    window.__a64_idx = idx;
    return idx;
  }
  function makeSnippet(text, queryParts, firstPos){
    const start = Math.max(0, firstPos - 100);
    const end = Math.min(text.length, firstPos + 100);
    const slice = text.slice(start, end);
    const safe = slice.replace(/[&<>]/g, s=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[s]));
    const re = new RegExp(queryParts.map(escapeRe).join('|'), 'ig');
    return (start>0?'… ':'') + safe.replace(re, m=>`<span class="mark">${m}</span>`) + (end<text.length?' …':'');
  }
  async function search(q){
    const idx = await loadIndex();
    q = q.trim();
    if(!q) return [];
    const { phrases, terms } = parseQuery(q);
    const normPhrases = phrases.map(p => normalize(p)).filter(Boolean);
    const normTerms = terms.map(t => normalize(t)).filter(Boolean);
    const hits = [];
    for(const doc of idx){
      let score = 0;
      let firstPos = Infinity;
      for(const p of normPhrases){
        const pos = doc.norm.indexOf(p);
        if(pos !== -1){
          score += 50 + p.length;
          if(pos < firstPos) firstPos = pos;
        }else{
          score = 0; firstPos = Infinity; break;
        }
      }
      if(score === 0 && normPhrases.length) continue;
      for(const t of normTerms){
        const pos = doc.norm.indexOf(t);
        if(pos !== -1){
          score += 10;
          if(pos < firstPos) firstPos = pos;
        }else{
          if(normTerms.length){ score = 0; firstPos = Infinity; break; }
        }
      }
      if(score <= 0) continue;
      const parts = phrases.concat(terms).filter(Boolean);
      const snippet = makeSnippet(doc.text, parts, firstPos === Infinity ? 0 : firstPos);
      hits.push({ url: doc.url, snippet, score });
      if(hits.length >= 100) break;
    }
    hits.sort((a,b)=> b.score - a.score);
    return hits;
  }
  window.a64SearchFulltext = search;
})();