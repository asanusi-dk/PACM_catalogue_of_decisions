// assets/app.js — ft5: don't render subgroup rows for Meeting reports
(function(){ 'use strict';
  const Q_URL='data/a64_catalogue.json?v=ft5', Q_IDX='data/search_index.json?v=ft5';
  const qEl=document.getElementById('q'), fulltextEl=document.getElementById('fulltextToggle');
  const hitsEl=document.getElementById('hits'), hitsHeaderEl=document.getElementById('hitsHeader');
  const tbodyEl=document.getElementById('doc-tbody');
  (function(){ const s=document.createElement('style'); s.textContent='.hitlist{display:grid;grid-template-columns:1fr;row-gap:16px;margin-top:8px}.hitlist .hit{padding:14px 16px;border-radius:10px}'; document.head.appendChild(s); })();
  const state={CATALOG:[],INDEX:[],ready:false};
  const esc=s=>(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])), norm=s=>(s||'').toString().toLowerCase();
  const toPdfUrl=(u,q)=>u+(q?'#search='+encodeURIComponent(q.replace(/"/g,'')):'');
  function group(rows){const g=new Map(); for(const r of rows){const sec=(r.section||'Other').trim(); const sub=(r.subsection||'').trim(); if(!g.has(sec)) g.set(sec,new Map()); const m=g.get(sec); if(!m.has(sub)) m.set(sub,[]); m.get(sub).push(r);} return g;}
  function terms(q){const t=[]; const re=/"([^"]+)"|(\S+)/g; let a; while((a=re.exec(q))) t.push((a[1]||a[2]).toLowerCase()); return t;}
  const hayMeta=r=>norm([r.title,r.symbol,r.section,r.notes].filter(Boolean).join(' • ')), hayFull=r=>norm(r.text||''); const andIn=(h,tt)=>tt.every(t=>h.includes(t));
  function searchDocs(cat,q,full){const tt=terms(q); if(!tt.length) return cat.slice(); if(!full) return cat.filter(r=>andIn(hayMeta(r),tt)); const urls=new Set(); for(const rec of state.INDEX){const h=hayFull(rec); if(h&&andIn(h,tt)) urls.add(rec.url);} return cat.filter(r=>urls.has(r.url)||andIn(hayMeta(r),tt));}
  function rowHtml(r){const title=esc(r.title||'(untitled)'), url=esc(r.url||'#'), sym=esc(r.symbol||''), ver=esc(r.version||''), date=esc(r.date||''); return `<tr class="doc-row"><td class="cell-title"><a href="${url}" target="_blank" rel="noopener">${title}</a></td><td class="cell-symbol">${sym}</td><td class="cell-version">${ver}</td><td class="cell-date">${date}</td></tr>`;}
  function renderDocs(rows){const g=group(rows); const parts=[]; const secs=Array.from(g.keys()).sort((a,b)=>a.localeCompare(b)); for(const sec of secs){parts.push(`<tr class="group-row"><td colspan="4">${esc(sec)}</td></tr>`); const bySub=g.get(sec); const isMeet=sec==="Meeting reports of the Supervisory Body"; if(isMeet){ let items=[]; for(const arr of bySub.values()) items=items.concat(arr); items.sort((a,b)=>(a.title||'').localeCompare(b.title||'')); for(const r of items) parts.push(rowHtml(r)); continue; } const subs=Array.from(bySub.keys()).sort((a,b)=>(a||'').localeCompare(b||'')); for(const ss of subs){ if(ss) parts.push(`<tr class="subgroup-row"><td colspan="4">${esc(ss)}</td></tr>`); const items=bySub.get(ss).slice().sort((a,b)=>(a.title||'').localeCompare(b.title||'')); for(const r of items) parts.push(rowHtml(r)); } } tbodyEl.innerHTML=parts.join('\n'); }
  function setHeader(t){ if(hitsHeaderEl) hitsHeaderEl.textContent=t||''; }
  function view(){ const r=document.querySelector('input[name="view"]:checked'); return r? r.value : 'docs'; }
  function run(){ if(!state.ready) return; const q=qEl? qEl.value : ''; const full=!!(fulltextEl&&fulltextEl.checked); const v=view(); const t=document.getElementById('doc-table'); if(v==='docs'){ renderDocs(searchDocs(state.CATALOG,q,full)); if(t) t.style.display=''; } }
  async function init(){ try{ const [c,i]=await Promise.all([fetch(Q_URL).then(r=>r.json()), fetch(Q_IDX).then(r=>r.json()).catch(_=>[])]); state.CATALOG=Array.isArray(c)?c:[]; state.INDEX=Array.isArray(i)?i:[]; state.ready=true; renderDocs(state.CATALOG); if(qEl) qEl.addEventListener('input', run); if(fulltextEl) fulltextEl.addEventListener('change', run); document.querySelectorAll('input[name="view"]').forEach(r=>r.addEventListener('change', run)); } catch(e){ if(tbodyEl) tbodyEl.innerHTML='<tr><td colspan="4">Could not load data.</td></tr>'; } }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})(); 
