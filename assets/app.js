// assets/app.js — ft6: show every occurrence (no nearby-merge)
(function(){
  'use strict';
  const Q_URL='data/a64_catalogue.json?v=ft6', Q_IDX='data/search_index.json?v=ft6';

  const qEl=document.getElementById('q');
  const fulltextEl=document.getElementById('fulltextToggle');
  const hitsEl=document.getElementById('hits');
  const hitsHeaderEl=document.getElementById('hitsHeader');
  const tbodyEl=document.getElementById('doc-tbody');

  // keep same spacing
  (function(){ const s=document.createElement('style'); s.textContent='.hitlist{display:grid;grid-template-columns:1fr;row-gap:16px;margin-top:8px}.hitlist .hit{padding:14px 16px;border-radius:10px}'; document.head.appendChild(s); })();

  const state={CATALOG:[],INDEX:[],ready:false};
  const esc=s=>(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  const norm=s=>(s||'').toString().toLowerCase();
  const toPdfUrl=(u,q)=>u+(q?'#search='+encodeURIComponent(q.replace(/"/g,'')):'');

  // ---- helpers (same as before, but minGap=0) ----
  const MAX_PER_DOC=500, MAX_TOTAL=5000, SNIP=110;
  const clean=s=>(s||'').replace(/\u00AD/g,'').replace(/-\s*\n\s*/g,'').replace(/\s*\n\s*/g,' ').replace(/\s+/g,' ');
  function pinfo(raw){const q=raw.trim(); const quoted=q.startsWith('"')&&q.endsWith('"')&&q.length>1; const core=quoted?q.slice(1,-1):q; const hasSpace=/\s/.test(core); return {core,phrase:quoted||hasSpace};}
  function regs(raw){const {core,phrase}=pinfo(raw); if(!core.trim()) return []; if(phrase) return [new RegExp(core.trim().replace(/\s+/g,'\\s+'),'gi')]; return core.split(/\s+/).filter(Boolean).map(t=>new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'));}
  function ranges(txt,re){const o=[]; let m; while((m=re.exec(txt))&&o.length<MAX_TOTAL){const a=m.index,b=a+(m[0]||'').length; if(b>a) o.push({a,b}); if(re.lastIndex===a) re.lastIndex++;} return o;}
  function merge(r,minGap=0){if(!r.length) return []; r.sort((x,y)=>x.a-y.a); const o=[r[0]]; for(let i=1;i<r.length;i++){const p=o[o.length-1], c=r[i]; if(c.a<=p.b+minGap){p.b=Math.max(p.b,c.b);} else o.push(c);} return o;}
  function snip(txt, rng, raw){const a=Math.max(0,rng.a-SNIP), b=Math.min(txt.length,rng.b+SNIP); let s=txt.slice(a,b); const {core,phrase}=pinfo(raw); const re=phrase? new RegExp(core.trim().replace(/\s+/g,'\\s+'),'gi') : new RegExp(core.split(/\s+/).filter(Boolean).map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gi'); s=esc(s).replace(re,m=>`<mark>${esc(m)}</mark>`); if(a>0) s='… '+s; if(b<txt.length) s=s+' …'; return s;}

  function parse(q){const out=[]; const re=/"([^"]+)"|(\S+)/g; let a; while((a=re.exec(q))) out.push((a[1]||a[2]).toLowerCase()); return out;}
  const hayMeta=r=>norm([r.title,r.symbol,r.section,r.subsection,r.notes].filter(Boolean).join(' • '));
  const hayFull=r=>norm(r.text||''); const andIn=(h,t)=>t.every(w=>h.includes(w));

  function searchDocs(cat,q,full){const t=parse(q); if(!t.length) return cat.slice(); if(!full) return cat.filter(r=>andIn(hayMeta(r),t)); const urls=new Set(); for(const rec of state.INDEX){const h=hayFull(rec); if(h&&andIn(h,t)) urls.add(rec.url);} return cat.filter(r=>urls.has(r.url)||andIn(hayMeta(r),t));}

  function searchHits(index,raw,full){
    const q=(raw||'').trim(); if(!q) return [];
    const out=[]; let total=0;
    for(const rec of index){
      const base = full ? hayFull(rec) : hayMeta(rec);
      if(!base) continue;
      const txt = clean(base);
      const R = regs(q); if(!R.length) continue;
      let rr=[];
      if(R.length===1){ rr = ranges(txt, new RegExp(R[0], R[0].flags)); }
      else { for(const re of R){ rr = rr.concat(ranges(txt, new RegExp(re, re.flags))); } }
      if(!rr.length) continue;
      rr = merge(rr, 0).slice(0, MAX_PER_DOC); // <- only overlap merge
      for(const r of rr){
        out.push({ url: toPdfUrl(rec.url,q), title: rec.title||'(untitled)', symbol: rec.symbol||'', section: rec.section||'', subsection: rec.subsection||'', snippet: snip(txt, r, q) });
        total++; if(total>=MAX_TOTAL) break;
      }
      if(total>=MAX_TOTAL) break;
    }
    return out;
  }

  // minimal renderers (reuse your existing DOM structure)
  function setHeader(t){ if(hitsHeaderEl) hitsHeaderEl.textContent=t||''; }
  function renderHits(rows,q,full){ if(!rows.length){ hitsEl.innerHTML=`<p class="error">No matches${full?' in document text':''}.</p>`; setHeader('No matches'); hitsEl.classList.remove('hidden'); if(hitsHeaderEl) hitsHeaderEl.classList.remove('hidden'); return; }
    hitsEl.innerHTML = rows.map(r=>`<article class="hit"><header class="hit-h"><a href="${r.url}" target="_blank" rel="noopener">${esc(r.title)}</a>${r.symbol?` <span class="sym">(${esc(r.symbol)})</span>`:''}${r.section?` <span class="sec">— ${esc(r.section)}${r.subsection?' — '+esc(r.subsection):''}</span>`:''}</header><p class="hit-s">${r.snippet}</p></article>`).join('\n');
    setHeader(`${rows.length} match${rows.length===1?'':'es'}${full?' · Full-text':''}`);
    hitsEl.classList.remove('hidden'); if(hitsHeaderEl) hitsHeaderEl.classList.remove('hidden');
  }
  function group(rows){const g=new Map(); for(const r of rows){const sec=(r.section||'Other').trim(); const sub=(r.subsection||'').trim(); if(!g.has(sec)) g.set(sec,new Map()); const m=g.get(sec); if(!m.has(sub)) m.set(sub,[]); m.get(sub).push(r);} return g;}
  function rowHtml(r){const title=esc(r.title||'(untitled)'),url=esc(r.url||'#'),sym=esc(r.symbol||''),ver=esc(r.version||''),date=esc(r.date||''); return `<tr class="doc-row"><td class="cell-title"><a href="${url}" target="_blank" rel="noopener">${title}</a></td><td class="cell-symbol">${sym}</td><td class="cell-version">${ver}</td><td class="cell-date">${date}</td></tr>`;}
  function renderDocs(rows){const g=group(rows), parts=[]; const secs=Array.from(g.keys()).sort((a,b)=>a.localeCompare(b)); for(const sec of secs){parts.push(`<tr class="group-row"><td colspan="4">${esc(sec)}</td></tr>`); const sub=g.get(sec); const subs=Array.from(sub.keys()).sort((a,b)=>(a||'').localeCompare(b||'')); for(const ss of subs){ if(ss) parts.push(`<tr class="subgroup-row"><td colspan="4">${esc(ss)}</td></tr>`); for(const r of sub.get(ss).slice().sort((a,b)=>(a.title||'').localeCompare(b.title||''))){ parts.push(rowHtml(r)); } } } tbodyEl.innerHTML=parts.join('\n'); }

  function view(){ const r=document.querySelector('input[name="view"]:checked'); return r? r.value : 'docs'; }
  function run(){ if(!state.ready) return; const q=qEl? qEl.value : ''; const full=!!(fulltextEl&&fulltextEl.checked); const v=view(); if(v==='hits'){ const rows=searchHits(state.INDEX,q,full); renderHits(rows,q,full);} else { renderDocs(searchDocs(state.CATALOG,q,full)); } }
  async function init(){ try{ const [c,i]=await Promise.all([fetch(Q_URL).then(r=>r.json()), fetch(Q_IDX).then(r=>r.json()).catch(_=>[])]); state.CATALOG=Array.isArray(c)?c:[]; state.INDEX=Array.isArray(i)?i:[]; state.ready=true; renderDocs(state.CATALOG); if(qEl) qEl.addEventListener('input', run); if(fulltextEl) fulltextEl.addEventListener('change', run); document.querySelectorAll('input[name="view"]').forEach(r=>r.addEventListener('change', run)); } catch(e){ if(tbodyEl) tbodyEl.innerHTML='<tr><td colspan="4">Could not load data.</td></tr>'; } }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})(); 
