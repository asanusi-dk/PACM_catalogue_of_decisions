(function(){
  const root = document.documentElement, KEY='a64-theme';
  function setTheme(mode){
    if(mode==='light'||mode==='dark'){ root.setAttribute('data-theme',mode); localStorage.setItem(KEY,mode); }
    else{ root.removeAttribute('data-theme'); localStorage.removeItem(KEY); }
  }
  try{ const saved=localStorage.getItem(KEY); if(saved) setTheme(saved); }catch(e){}
  const btn=document.getElementById('themeToggle');
  if(btn){ btn.addEventListener('click', ()=>{ const cur=root.getAttribute('data-theme')||''; setTheme(cur==='light'?'dark':'light'); }); }
})();