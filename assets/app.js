// PACM app.js — plug-and-play replacement with multi-hit full‑text search
(function(){
  'use strict';
  const Q_URL = 'data/a64_catalogue.json?v=ft2';
  const Q_IDX = 'data/search_index.json?v=ft2';

  const qEl = document.getElementById('q');
  const fulltextEl = document.getElementById('fulltextToggle');
  const hitsEl = document.getElementById('hits');
  const hitsHeaderEl = document.getElementById('hitsHeader');
  const tbodyEl = document.getElementById('doc-tbody');

  (function injectCSS(){
    const css = `.hitlist{display:grid;grid-template-columns:1fr;row-gap:16px;margin-top:8px}` +
                `.hitlist .hit{padding:14px 16px;border-radius:10px}`;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  })();

  const state = { CATALOG: [], INDEX: [], ready: false };

  function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
  function toPdfUrl(url, qraw){
    try{ const hash = qraw ? '#search=' + encodeURIComponent(qraw.replace(/"/g,'')) : ''; return url + hash; }
    catch(e){ return url; }
  }
  function norm(s){ return (s||'').toString().toLowerCase(); }

  function groupCatalogue(rows){
    const m = new Map();
    for(const r of rows){
      const sec = (r.section||'Other').trim();
      const sub = (r.subsection||'').trim();
      if(!m.has(sec)) m.set(sec, new Map());
      const inner = m.get(sec);
      if(!inner.has(sub)) inner.set(sub, []);
      inner.get(sub).push(r);
    }
    return m;
  }

  const MAX_PER_DOC = 200, MAX_TOTAL = 2000, SNIPPET_CHARS = 110;
  const softClean = s => (s||"").replace(/\u00AD/g,"").replace(/-\s*\n\s*/g,"").replace(/\s*\n\s*/g," ").replace(/\s+/g," ");
  function smartPhraseQuery(raw){
    const q = raw.trim(); const quoted = q.startsWith('"') && q.endsWith('"') && q.length>1;
    const core = quoted ? q.slice(1,-1) : q; const hasSpace = /\s/.test(core);
    return { core, phrase: quoted || hasSpace };
  }
  function buildRegexList(qraw){
    const { core, phrase } = smartPhraseQuery(qraw);
    if(!core.trim()) return [];
    if(phrase){ const pat = core.trim().replace(/\s+/g,'\\s+'); return [new RegExp(pat,'gi')]; }
    return core.split(/\s+/).filter(Boolean).map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'));
  }
  function findAllRanges(text, regex){
    const ranges=[]; let m;
    while((m = regex.exec(text)) && ranges.length<MAX_TOTAL){
      const start = m.index, end = start + (m[0]||'').length;
      if(end>start) ranges.push({start,end});
      if(regex.lastIndex===start) regex.lastIndex++;
    }
    return ranges;
  }
  function dedupeRanges(ranges, minGap=20){
    if(!ranges.length) return [];
    ranges.sort((a,b)=>a.start-b.start);
    const out=[ranges[0]];
    for(let i=1;i<ranges.length;i++){
      const prev = out[out.length-1], cur = ranges[i];
      if(cur.start <= prev.end + minGap){ prev.end = Math.max(prev.end, cur.end); }
      else out.push(cur);
    }
    return out;
  }
  function sliceWithMark(text, range, qraw){
    const start = Math.max(0, range.start - SNIPPET_CHARS);
    const end   = Math.min(text.length, range.end + SNIPPET_CHARS);
    let snip = text.slice(start, end);
    const { core, phrase } = smartPhraseQuery(qraw);
    const re = phrase
      ? new RegExp(core.trim().replace(/\s+/g,'\\s+'),'gi')
      : new RegExp(core.split(/\s+/).filter(Boolean).map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gi');
    snip = escapeHtml(snip).replace(re, m=>`<mark>${escapeHtml(m)}</mark>`);
    if(start>0) snip = '… ' + snip;
    if(end<text.length) snip = snip + ' …';
    return snip;
  }
  function parseTerms(q){ const out=[]; const re=/"([^"]+)"|(\S+)/g; let a; while((a=re.exec(q))) out.push((a[1]||a[2]).toLowerCase()); return out; }
  function recordHaystackMeta(rec){ return norm([rec.title,rec.symbol,rec.section,rec.subsection,rec.notes].filter(Boolean).join(' • ')); }
  function recordHaystackFull(rec){ return norm(rec.text||''); }
  function includesAll(hay, terms){ for(const t of terms) if(!hay.includes(t)) return false; return true; }

  function searchDocs(catalog, q, useFull){
    const terms = parseTerms(q);
    if(!terms.length) return catalog.slice();
    if(!useFull){ return catalog.filter(r => includesAll(recordHaystackMeta(r), terms)); }
    const set = new Set();
    for(const rec of state.INDEX){ const hay = recordHaystackFull(rec); if(hay && includesAll(hay, terms)) set.add(rec.url); }
    return catalog.filter(r => set.has(r.url) || includesAll(recordHaystackMeta(r), terms));
  }

  function searchHits(index, qraw, useFull){
    const raw = (qraw||'').trim(); if(!raw) return [];
    const out=[]; let total=0;
    for(const rec of index){
      const base = useFull ? recordHaystackFull(rec) : recordHaystackMeta(rec);
      if(!base) continue;
      const text = softClean(base);
      let ranges=[];
      const searchers = buildRegexList(raw);
      if(!searchers.length) continue;
      if(searchers.length===1){ ranges = findAllRanges(text, new RegExp(searchers[0], searchers[0].flags)); }
      else { for(const re of searchers){ const sub = findAllRanges(text, new RegExp(re, re.flags)); ranges = ranges.concat(sub); } }
      if(!ranges.length) continue;
      ranges = dedupeRanges(ranges).slice(0, MAX_PER_DOC);
      for(const r of ranges){
        out.push({ url: toPdfUrl(rec.url, raw), title: rec.title||'(untitled)', symbol: rec.symbol||'', section: rec.section||'', subsection: rec.subsection||'', snippet: sliceWithMark(text, r, raw) });
        total++; if(total>=MAX_TOTAL) break;
      }
      if(total>=MAX_TOTAL) break;
    }
    return out;
  }

  function renderDocs(rows){
    const grouped = groupCatalogue(rows);
    const parts=[];
    const sections = Array.from(grouped.keys()).sort((a,b)=>a.localeCompare(b));
    for(const sec of sections){
      parts.push(`<tr class="group-row"><td colspan="4">${escapeHtml(sec)}</td></tr>`);
      const sub = grouped.get(sec);
      const subs = Array.from(sub.keys()).sort((a,b)=>(a||'').localeCompare(b||''));
      for(const ss of subs){
        if(ss) parts.push(`<tr class="subgroup-row"><td colspan="4">${escapeHtml(ss)}</td></tr>`);
        const items = sub.get(ss).slice().sort((a,b)=>(a.title||'').localeCompare(b.title||''));
        for(const r of items){
          const title = escapeHtml(r.title||'(untitled)');
          const url = escapeHtml(r.url||'#');
          const sym = escapeHtml(r.symbol||'');
          const ver = escapeHtml(r.version||'');
          const date = escapeHtml(r.date||'');
          parts.push(`<tr class="doc-row">
            <td class="cell-title"><a href="${url}" target="_blank" rel="noopener">${title}</a></td>
            <td class="cell-symbol">${sym}</td>
            <td class="cell-version">${ver}</td>
            <td class="cell-date">${date}</td>
          </tr>`);
        }
      }
    }
    tbodyEl.innerHTML = parts.join('\n');
  }

  function setHeader(text){ if(hitsHeaderEl) hitsHeaderEl.textContent = text||''; }

  function renderHits(results, qraw, useFull){
    if(!results.length){
      hitsEl.innerHTML = `<p class="error">No matches${useFull?' in document text':''}.</p>`;
      setHeader('No matches');
      hitsEl.classList.remove('hidden'); hitsHeaderEl.classList.remove('hidden'); return;
    }
    hitsEl.innerHTML = results.map(r => `
      <article class="hit">
        <header class="hit-h">
          <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
          ${r.symbol ? ` <span class="sym">(${escapeHtml(r.symbol)})</span>` : ''}
          ${r.section ? ` <span class="sec">— ${escapeHtml(r.section)}${r.subsection ? ' — ' + escapeHtml(r.subsection) : ''}</span>` : ''}
        </header>
        <p class="hit-s">${r.snippet}</p>
      </article>`).join('\n');
    setHeader(`${results.length} match${results.length===1?'':'es'}${useFull?' · Full-text':''}`);
    hitsEl.classList.remove('hidden'); hitsHeaderEl.classList.remove('hidden');
  }

  function currentView(){ const r = document.querySelector('input[name="view"]:checked'); return r ? r.value : 'docs'; }

  function runSearch(){
    if(!state.ready) return;
    const qraw = qEl ? qEl.value : '';
    const useFull = !!(fulltextEl && fulltextEl.checked);
    const view = currentView();
    const docTable = document.getElementById('doc-table');

    if(view === 'hits'){
      const results = searchHits(state.INDEX, qraw, useFull);
      renderHits(results, qraw, useFull);
      if(docTable) docTable.style.display = 'none';
    }else{
      const docs = searchDocs(state.CATALOG, qraw, useFull);
      renderDocs(docs);
      hitsEl.classList.add('hidden'); hitsHeaderEl.classList.add('hidden');
      if(docTable) docTable.style.display = '';
    }
  }

  async function init(){
    try{
      const [c, i] = await Promise.all([ fetch(Q_URL).then(r=>r.json()), fetch(Q_IDX).then(r=>r.json()).catch(_=>[]) ]);
      state.CATALOG = Array.isArray(c)?c:[]; state.INDEX = Array.isArray(i)?i:[]; state.ready = true;
      renderDocs(state.CATALOG);
      if(qEl) qEl.addEventListener('input', runSearch);
      if(fulltextEl) fulltextEl.addEventListener('change', runSearch);
      document.querySelectorAll('input[name="view"]').forEach(r => r.addEventListener('change', runSearch));
    }catch(e){
      console.error('Init error', e);
      if(tbodyEl) tbodyEl.innerHTML = '<tr><td colspan="4">Could not load data.</td></tr>';
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
