
(function(){
  const INDEX_PATH = 'data/search_index.json';
  const HITS_LIMIT = 400, CONTEXT = 90, MAX_SNIPPET = 240;
  const qEl = document.getElementById('q');
  const hitsEl = document.getElementById('hits');
  const hitsHeaderEl = document.getElementById('hitsHeader');
  const radios = document.querySelectorAll('input[name="view"]');
  const resetBtn = document.getElementById('reset');
  const fulltextToggle = document.getElementById('fulltextToggle');
  let diag = document.getElementById('fulltext-status');
  if(!diag){ diag = document.createElement('div'); diag.id='fulltext-status'; diag.style.fontSize='12px'; diag.style.margin='6px 20px'; diag.style.color='#2b4c7e'; const controls=document.querySelector('.controls')||document.body; controls.parentNode.insertBefore(diag, controls.nextSibling); }
  function setDiag(msg){ if(diag){ diag.textContent = msg || ''; } }
  let INDEX = [], indexLoaded = false;
  function switchView(name){ const r=document.querySelector(`input[name="view"][value="${name}"]`); if(r){ r.checked=true; r.dispatchEvent(new Event('change')); } }
  function setHeader(text){ if(!hitsHeaderEl) return; if(!text){ hitsHeaderEl.classList.add('hidden'); hitsHeaderEl.textContent=''; } else { hitsHeaderEl.classList.remove('hidden'); hitsHeaderEl.textContent=text; } }
  function clearHits(){ if(hitsEl) hitsEl.innerHTML=''; setHeader(''); }
  function escapeHtml(s){ return (s||'').replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
  function normalizeText(x){ if(!x) return ''; if(Array.isArray(x)) return x.join(' '); if(typeof x==='object') return JSON.stringify(x); return String(x); }
  function pick(o, ks){ for(const k of ks){ if(o && o[k]!=null) return o[k]; } return ''; }
  function normalizeRecord(r){ return { url:pick(r,['url','link','u','href','location']), title:pick(r,['title','doc_title','ti','name']), symbol:pick(r,['symbol','sy','doc_symbol']), section:pick(r,['section','sec']), subsection:pick(r,['subsection','sub']), text:normalizeText(pick(r,['text','content','body','c','txt','doc_text','text_content'])) }; }
  async function loadIndex(){
    if(indexLoaded) return INDEX;
    try{ const res = await fetch(INDEX_PATH, {cache:'no-cache'}); if(!res.ok) throw new Error('HTTP '+res.status+' for '+INDEX_PATH);
      const json = await res.json();
      let arr = Array.isArray(json) ? json : (json.records || json.docs || json.items || []);
      if(!Array.isArray(arr)) arr = [];
      INDEX = arr.map(normalizeRecord).filter(x => x.url && x.text);
      indexLoaded = true; setDiag('Full-text index loaded from "'+INDEX_PATH+'" · '+INDEX.length+' records'); return INDEX;
    }catch(e){ indexLoaded = true; INDEX = []; setDiag('Full-text index missing at "'+INDEX_PATH+'".'); return INDEX; }
  }
  function isQuoted(q){ return q.startsWith('"') && q.endsWith('"') && q.length>2; }
  function tokenize(q){ const parts=q.trim().match(/"[^"]+"|\S+/g)||[]; return parts.map(p=>p.replace(/^"|"$/g,'')); }
  function filterRecords(records, query){
    if(!query) return [];
    if(isQuoted(query)){ const phrase=query.slice(1,-1).toLowerCase(); return records.filter(r=>(r.text||'').toLowerCase().includes(phrase)); }
    const terms=tokenize(query).map(s=>s.toLowerCase());
    return records.filter(r=>{ const t=(r.text||'').toLowerCase(); for(const term of terms){ if(!t.includes(term)) return false; } return true; });
  }
  function makeSnippet(text,q){
    const lc=text.toLowerCase(); const qn=q.replace(/^"|"$/g,'').toLowerCase();
    let idx=lc.indexOf(qn);
    if(idx===-1){ for(const term of tokenize(qn)){ const j=lc.indexOf(term); if(j!==-1){ idx=j; break; } } }
    if(idx===-1){ const s=escapeHtml(text.slice(0,MAX_SNIPPET)); return s+(text.length>MAX_SNIPPET?'…':''); }
    const start=Math.max(0,idx-CONTEXT), end=Math.min(text.length,idx+qn.length+CONTEXT);
    const before=escapeHtml(text.slice(start,idx)), match=escapeHtml(text.slice(idx,idx+qn.length)), after=escapeHtml(text.slice(idx+qn.length,end));
    return (start>0?'…':'')+before+'<mark>'+match+'</mark>'+after+(end<text.length?'…':'');
  }
  function toPdfUrl(url,q){ try{ if(!/\.pdf(?:$|[?#])/.test(url)) return url; const u=new URL(url,location.href); const frag=u.hash?u.hash.replace(/^#/,'')+'&':''; u.hash='#'+frag+'search='+encodeURIComponent(q.replace(/^"|"$/g,'')); return u.toString(); }catch(e){ return url+(url.includes('#')?'&':'#')+'search='+encodeURIComponent(q.replace(/^"|"$/g,'')); } }
  function renderHits(records,q){
    if(!hitsEl) return;
    if(!records.length){ hitsEl.innerHTML='<p class="error">No matches. '+(indexLoaded && !INDEX.length ? '(Index missing or empty at data/search_index.json)' : '')+'</p>'; setHeader('No matches'); return; }
    const hits=records.slice(0,HITS_LIMIT); const parts=[];
    for(const r of hits){
      const url=toPdfUrl(r.url,q), title=escapeHtml(r.title||'(untitled)'), symbol=escapeHtml(r.symbol||'');
      const section=escapeHtml([r.section,r.subsection].filter(Boolean).join(' — ')); const snip=makeSnippet(r.text||'',q);
      parts.push('<article class="hit"><header class="hit-h"><a href="'+url+'" target="_blank" rel="noopener">'+title+'</a>'+(symbol?' <span class="sym">('+symbol+')</span>':'')+(section?' <span class="sec">'+section+'</span>':'')+'</header><p class="hit-s">'+snip+'</p></article>');
    }
    hitsEl.innerHTML=parts.join('\n'); setHeader(hits.length+' match'+(hits.length===1?'':'es'));
  }
  function runSearch(autoSwitch=true){
    const q=(qEl&&qEl.value||'').trim(); if(!q){ clearHits(); if(autoSwitch) switchView('docs'); return; }
    loadIndex().then(records=>{ const filtered=filterRecords(records,q); renderHits(filtered,q); if(autoSwitch && filtered.length){ switchView('hits'); } });
  }
  if(qEl){ qEl.addEventListener('input', ()=>runSearch(true)); }
  if(radios){ radios.forEach(r=>r.addEventListener('change', e=>{ if(e.target.value==='hits'){ runSearch(false); } })); }
  if(resetBtn){ resetBtn.addEventListener('click', ()=>{ clearHits(); if(qEl){ qEl.value=''; } if(fulltextToggle) fulltextToggle.checked=false; switchView('docs'); }); }
  window.PACM_fulltext = { runSearch, loadIndex };
})();