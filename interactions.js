// interactions.js
// Handles UI interactions: context menu, contact-admin, reaction clicks, view counting, jumper behavior.
// Enhanced with hover previews, smooth animations, randomized + staggered + continuous bubble & reaction pulses
// ============================================================

(function(){
  function safeLog(...args){ try{ console.log.apply(console, args); }catch(e){} }
  function el(id){ return document.getElementById(id); }
  function qs(sel, root=document){ try{ return root.querySelector(sel); }catch(e){ return null; } }
  function qsa(sel, root=document){ try{ return Array.from(root.querySelectorAll(sel)); }catch(e){ return []; } }
  function now(){ return new Date(); }
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function rand(min,max){ return Math.random()*(max-min)+min; }

  const commentsContainer = el("tg-comments-container");
  const jumpIndicator = el("tg-jump-indicator");
  const contactAdminDefault = window.CONTACT_ADMIN_LINK || "https://t.me/ph_suppp";

  // ---------- view counting ----------
  const SEEN_KEY = "abrox_seen_counts_v1";
  let seenMap = {};
  (function loadSeen(){
    try{
      const raw = localStorage.getItem(SEEN_KEY);
      if(raw) seenMap = JSON.parse(raw)||{};
    }catch(e){ seenMap = {}; }
  })();
  function saveSeen(){ try{ localStorage.setItem(SEEN_KEY, JSON.stringify(seenMap)); }catch(e){} }

  function bumpViewCount(messageId, by=1){
    if(!messageId) return;
    seenMap[messageId] = (seenMap[messageId]||0) + by;
    saveSeen();
    try{
      const elMsg = document.querySelector(`[data-id="${messageId}"]`);
      if(elMsg){
        const seenEl = elMsg.querySelector('.seen');
        if(seenEl){
          const icon = seenEl.querySelector('svg') ? seenEl.querySelector('svg').outerHTML + " " : (seenEl.innerHTML.match(/<i[^>]*>.*<\/i>/)||[""])[0];
          seenEl.innerHTML = icon + " " + (seenMap[messageId]||0);
        }
      }
    }catch(e){}
  }

  const inViewThrottleMs = 800;
  let lastInView = 0;
  function checkMessagesInView(){
    if(!commentsContainer) return;
    try{
      const nowMs = Date.now();
      if(nowMs - lastInView < inViewThrottleMs) return;
      lastInView = nowMs;
      const nodes = qsa('.tg-bubble');
      const rect = commentsContainer.getBoundingClientRect();
      const viewTop = rect.top, viewBottom = rect.bottom;
      nodes.forEach(n=>{
        try{
          const r = n.getBoundingClientRect();
          const mid = (r.top+r.bottom)/2;
          if(mid>viewTop && mid<viewBottom){
            const id = n.dataset.id;
            if(id) bumpViewCount(id,0);
            if(id && (!seenMap[id] || seenMap[id]<1)) bumpViewCount(id,1);
          }
        }catch(e){}
      });
    }catch(e){}
  }

  if(commentsContainer){
    commentsContainer.addEventListener('scroll', ()=>{
      const scrollBottom = commentsContainer.scrollHeight - commentsContainer.scrollTop - commentsContainer.clientHeight;
      if(scrollBottom > 120){ if(jumpIndicator) jumpIndicator.classList.remove('hidden'); }
      else { if(jumpIndicator) jumpIndicator.classList.add('hidden'); }
      checkMessagesInView();
    });
    setTimeout(checkMessagesInView,900);
  }

  // ---------- context menu ----------
  let ctxMenuEl = el('tg-msg-context');
  if(!ctxMenuEl){
    ctxMenuEl = document.createElement('div');
    ctxMenuEl.id = 'tg-msg-context';
    ctxMenuEl.style.position = 'fixed';
    ctxMenuEl.style.zIndex = 9999;
    ctxMenuEl.style.display = 'none';
    ctxMenuEl.style.background = 'rgba(8,12,14,0.98)';
    ctxMenuEl.style.padding = '8px';
    ctxMenuEl.style.borderRadius = '10px';
    ctxMenuEl.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';
    ctxMenuEl.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
    document.body.appendChild(ctxMenuEl);
  }
  function hideContext(){ try{ ctxMenuEl.style.opacity='0'; ctxMenuEl.style.transform='translateY(-4px)'; setTimeout(()=>ctxMenuEl.style.display='none',180); ctxMenuEl.dataset.for=''; }catch(e){} }
  function showContextFor(elMsg,x,y,messageId,personaName,messageText){
    try{
      ctxMenuEl.innerHTML=''; ctxMenuEl.dataset.for = messageId||'';
      const actions = [ {k:'reply',t:'Reply'}, {k:'copy',t:'Copy text'}, {k:'pin',t:'Pin message'}, {k:'contact',t:'Contact Admin'} ];
      actions.forEach(a=>{
        const b=document.createElement('div');
        b.className='ctx-item';
        b.textContent=a.t;
        b.style.padding='8px 10px';
        b.style.color='var(--tg-text)';
        b.style.cursor='pointer';
        b.style.whiteSpace='nowrap';
        b.style.transition='background 0.12s ease';
        b.addEventListener('mouseenter',()=>b.style.background='rgba(255,255,255,0.06)');
        b.addEventListener('mouseleave',()=>b.style.background='transparent');
        b.addEventListener('click', ev=>{ ev.stopPropagation(); handleContextAction(a.k,messageId,personaName,messageText); hideContext(); });
        ctxMenuEl.appendChild(b);
      });
      const winW = window.innerWidth, winH = window.innerHeight;
      let left=x, top=y;
      if(left+220>winW) left=winW-240;
      if(top+ctxMenuEl.offsetHeight>winH) top=winH-(ctxMenuEl.offsetHeight+20);
      ctxMenuEl.style.left=(left|0)+'px';
      ctxMenuEl.style.top=(top|0)+'px';
      ctxMenuEl.style.display='block';
      ctxMenuEl.style.opacity='0';
      ctxMenuEl.style.transform='translateY(-4px)';
      requestAnimationFrame(()=>{ ctxMenuEl.style.opacity='1'; ctxMenuEl.style.transform='translateY(0)'; });
    }catch(e){ safeLog('showContextFor error',e); }
  }
  document.addEventListener('click', ()=> hideContext());
  document.addEventListener('contextmenu', e=>{
    try{
      const target = e.target.closest && e.target.closest('.tg-bubble');
      if(!target) return;
      e.preventDefault(); e.stopPropagation();
      const mid = target.dataset.id||'';
      const persona = target.querySelector('.tg-bubble-sender') ? target.querySelector('.tg-bubble-sender').textContent : '';
      const text = target.querySelector('.tg-bubble-text') ? target.querySelector('.tg-bubble-text').textContent : '';
      showContextFor(target,e.clientX,e.clientY,mid,persona,text);
    }catch(err){}
  });

  function handleContextAction(actionKey,messageId,personaName,messageText){
    try{
      if(actionKey==='reply'){
        const input = el('tg-comment-input');
        if(input){ input.focus(); input.value=`@${personaName.split(" ")[0]} `; input.dispatchEvent(new Event('input')); }
      } else if(actionKey==='copy'){
        try{ navigator.clipboard?.writeText(messageText); }catch(e){ safeLog('copy failed',e); }
      } else if(actionKey==='pin'){
        try{
          if(window.PinBanner?.highlightId) window.PinBanner.highlightId(messageId);
          else {
            const elMsg=document.querySelector(`[data-id="${messageId}"]`);
            if(elMsg){ elMsg.scrollIntoView({behavior:'smooth',block:'center'}); elMsg.classList.add('tg-highlight'); setTimeout(()=>elMsg.classList.remove('tg-highlight'),2600); }
          }
        }catch(e){}
      } else if(actionKey==='contact'){
        window.open(window.CONTACT_ADMIN_LINK||contactAdminDefault,'_blank');
      }
    }catch(e){ safeLog('handleContextAction error',e); }
  }

  // ---------- reactions ----------
  function ensureReactionUI(){
    if(!commentsContainer) return;
    commentsContainer.addEventListener('click', ev=>{
      const pill = ev.target.closest && ev.target.closest('.reaction-pill');
      if(pill){
        pill.classList.toggle('selected');
        pill.style.transform = pill.classList.contains('selected') ? `translateY(${rand(-1.5,-3)}px)` : '';
      }
      if(ev.target.closest && ev.target.closest('.tg-bubble') && (ev.ctrlKey || ev.metaKey)){
        const bubble = ev.target.closest('.tg-bubble');
        const reactions = bubble.querySelector('.tg-reactions');
        if(reactions){
          const rp = document.createElement('div');
          rp.className='reaction-pill';
          rp.textContent='👍 1';
          const delay = rand(0,0.15)*1000; // staggered delay
          rp.style.transition=`all ${rand(0.18,0.28).toFixed(2)}s ease ${delay}ms, opacity ${rand(0.18,0.28).toFixed(2)}s ease ${delay}ms, transform ${rand(0.18,0.28).toFixed(2)}s ease ${delay}ms`;
          rp.style.opacity='0';
          rp.style.transform=`scale(${rand(0.75,0.95)})`;
          rp.addEventListener('mouseenter',()=>rp.title='You reacted 👍');
          rp.addEventListener('mouseleave',()=>rp.title='');
          reactions.appendChild(rp);
          requestAnimationFrame(()=>{
            rp.style.opacity='1';
            rp.style.transform=`scale(${rand(0.98,1.05)})`;
          });
        }
      }
    });
  }
  ensureReactionUI();

  // ---------- jumper ----------
  if(jumpIndicator){
    jumpIndicator.addEventListener('click', ()=>{
      try{ if(commentsContainer){ commentsContainer.scrollTop=commentsContainer.scrollHeight; jumpIndicator.classList.add('hidden'); } }catch(e){}
    });
  }

  // ---------- contact-admin buttons ----------
  function bindContactAdminButtons(){
    document.addEventListener('click', ev=>{
      const btn = ev.target.closest && ev.target.closest('.contact-admin-btn');
      if(!btn) return;
      ev.preventDefault(); ev.stopPropagation();
      const href = window.CONTACT_ADMIN_LINK||contactAdminDefault;
      window.open(href,'_blank');
    });
  }
  bindContactAdminButtons();

  // ---------- dev toolbar ----------
  (function addDevToolbar(){
    try{
      if(!window.location.search.includes('abrox-dev')) return;
      if(el('abrox-dev-toolbar')) return;
      const t=document.createElement('div');
      t.id='abrox-dev-toolbar';
      t.style.position='fixed'; t.style.right='12px'; t.style.bottom='12px'; t.style.zIndex=99999;
      t.style.background='rgba(0,0,0,0.6)'; t.style.color='#fff'; t.style.padding='8px'; t.style.borderRadius='8px'; t.style.fontSize='13px';
      t.innerHTML='<button id="abrox-dev-seed">seedNow(30)</button> <button id="abrox-dev-real">realism.start</button>';
      document.body.appendChild(t);
      el('abrox-dev-seed')?.addEventListener('click', ()=>{ if(window.realism?.seedNow) window.realism.seedNow(30); });
      el('abrox-dev-real')?.addEventListener('click', ()=>{ if(window.realism?.start) window.realism.start(); });
    }catch(e){}
  })();

  // ---------- continuous bubble pulse ----------
  function pulseAllBubbles(){
    if(!commentsContainer) return;
    const bubbles = qsa('.tg-bubble', commentsContainer);
    bubbles.forEach((b,i)=>{
      const duration = rand(0.6,1.2);
      const scaleUp = rand(1.01,1.03);
      const scaleDown = rand(0.995,1.005);
      const delay = i * rand(50,100);

      const animate = ()=>{
        b.style.transition = `transform ${duration}s ease-in-out, box-shadow ${duration}s ease-in-out`;
        b.style.transform = `scale(${scaleUp})`;
        b.style.boxShadow = `0 ${rand(3,6).toFixed(0)}px ${rand(8,14).toFixed(0)}px rgba(0,0,0,0.2)`;
        setTimeout(()=>{
          b.style.transform = `scale(${scaleDown})`;
          b.style.boxShadow = '';
          setTimeout(animate, duration*1000 + rand(500,1000)); // loop
        }, duration*1000);
      };
      setTimeout(animate, delay);
    });
  }
  setTimeout(pulseAllBubbles,500);

  // ---------- expose API ----------
  window.Interactions = window.Interactions||{};
  Object.assign(window.Interactions,{
    bumpViewCount,
    hideContext,
    showContextFor,
    ensureReactionUI,
    bindContactAdminButtons
  });

  setInterval(saveSeen,60*1000);
  safeLog('interactions initialized with hover previews, continuous staggered bubble + reaction pulses');
})();
