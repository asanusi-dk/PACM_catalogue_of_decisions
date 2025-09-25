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
  function htmlEscape(s){ return s.replace(/[&<>]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c])); }
  function makeSnippet(text, queryParts, pos, radius=90){
    const start = Math.max(0, pos - radius);
    const end = Math.min(text.length, pos + radius);
    const slice = text.slice(start, end);
    const safe = htmlEscape(slice);
    if(!queryParts.length) return (start>0?'… ':'') + safe + (end<text.length?' …':'');
    const re = new RegExp(queryParts.map(escapeRe).join('|'), 'ig');
    return (start>0?'… ':'') + safe.replace(re, m=>`<span class="mark">${m}</span>`) + (end<text.length?' …':'');
  }
  function* findAll(text, re){
    re.lastIndex = 0;
    let m;
    while((m = re.exec(text))){
      yield { index: m.index, len: (m[0]||'').length };
      if(re.lastIndex === m.index) re.lastIndex++;
    }
  }

  async function searchMulti(q){
    const idx = await loadIndex();
    q = (q||'').trim();
    if(!q) return [];
    const { phrases, terms } = parseQuery(q);
    const normPhrases = phrases.map(s=>normalize(s)).filter(Boolean);
    const normTerms = terms.map(s=>normalize(s)).filter(Boolean);
    const parts = phrases.concat(terms).filter(Boolean);
    if(parts.length === 0) return [];

    const hits = [];
    for(const doc of idx){
      let ok = true;
      for(const p of normPhrases){ if(!doc.norm.includes(p)) { ok=false; break; } }
      if(ok){
        for(const t of normTerms){ if(!doc.norm.includes(t)) { ok=false; break; } }
      }
      if(!ok) continue;

      const extractParts = (phrases.length ? phrases : terms).filter(Boolean);
      const rex = new RegExp(extractParts.map(escapeRe).join('|'), 'ig');
      const snippets = [];
      const windows = [];
      let rawScore = 0;
      for(const m of findAll(doc.text, rex)){
        rawScore += 10;
        const near = windows.find(w => Math.abs(w - m.index) < 40);
        if(near !== undefined) continue;
        windows.push(m.index);
        snippets.push(makeSnippet(doc.text, parts, m.index));
        if(snippets.length >= 200) break;
      }
      if(snippets.length){
        rawScore += phrases.reduce((s,p)=> s + (doc.text.toLowerCase().includes(p.toLowerCase()) ? 50 + p.length : 0), 0);
        hits.push({ url: doc.url, count: snippets.length, snippets, score: rawScore });
      }
    }
    hits.sort((a,b)=> b.count - a.count || b.score - a.score);
    return hits;
  }

  async function searchOccurrences(q){
    const idx = await loadIndex();
    q = (q||'').trim();
    if(!q) return [];
    const { phrases, terms } = parseQuery(q);
    const normPhrases = phrases.map(s=>normalize(s)).filter(Boolean);
    const normTerms = terms.map(s=>normalize(s)).filter(Boolean);
    const parts = phrases.concat(terms).filter(Boolean);
    if(parts.length === 0) return [];

    const occ = [];
    for(const doc of idx){
      let ok = true;
      for(const p of normPhrases){ if(!doc.norm.includes(p)) { ok=false; break; } }
      if(ok){
        for(const t of normTerms){ if(!doc.norm.includes(t)) { ok=false; break; } }
      }
      if(!ok) continue;

      const extractParts = (phrases.length ? phrases : terms).filter(Boolean);
      const rex = new RegExp(extractParts.map(escapeRe).join('|'), 'ig');
      let count = 0;
      for(const m of findAll(doc.text, rex)){
        const snippet = makeSnippet(doc.text, parts, m.index);
        const score = (phrases.length ? 100 : 0) + 10;
        occ.push({ url: doc.url, title: doc.title, snippet, score, pos: m.index });
        count++;
        if(count >= 500) break;
      }
    }
    occ.sort((a,b)=> (b.score - a.score) || (a.title||'').localeCompare(b.title||'') || (a.pos - b.pos));
    return occ.slice(0, 2000);
  }

  window.a64SearchFulltextMulti = searchMulti;
  window.a64SearchOccurrences = searchOccurrences;
})();