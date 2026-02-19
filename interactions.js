// interactions.js
// Handles UI interactions: context menu, contact-admin, reaction clicks, view counting, jumper behavior.
// Defensive: tolerant to missing DOM, missing other modules, idempotent.
// Visual fixes applied: removed JS pulse effects, IntersectionObserver for view-count, simplified reactions.
// ============================================================

(function(){
  // small utilities
  function safeLog(...args){ try{ console.log.apply(console, args); }catch(e){} }
  function el(id){ return document.getElementById(id); }
  function qs(sel, root=document){ try{ return root.querySelector(sel); }catch(e){ return null; } }
  function qsa(sel, root=document){ try{ return Array.from(root.querySelectorAll(sel)); }catch(e){ return []; } }
  function now(){ return new Date(); }
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function rand(max){ return Math.floor(Math.random()*max); }

  // DOM refs
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

  // Update seen count UI for a message id (best-effort)
  function bumpViewCount(messageId, by=1){
    if(!messageId) return;
    seenMap[messageId] = (seenMap[messageId]||0) + by;
    saveSeen();
    try{
      const elMsg = document.querySelector(`[data-id="${messageId}"]`);
      if(elMsg){
        let seenEl = elMsg.querySelector('.seen');
        if(!seenEl){
          // create light-weight seen element
          seenEl = document.createElement('div');
          seenEl.className = 'seen';
          seenEl.style.fontSize = '12px';
          seenEl.style.opacity = '0.9';
          if(elMsg.querySelector('.tg-bubble-meta')) elMsg.querySelector('.tg-bubble-meta').appendChild(seenEl);
          else elMsg.appendChild(seenEl);
        }
        // keep icon if present
        const icon = seenEl.querySelector('svg') ? seenEl.querySelector('svg').outerHTML + " " : "";
        seenEl.innerHTML = icon + (seenMap[messageId]||0);
      }
    }catch(e){ safeLog('bumpViewCount DOM update failed', e); }
  }

  // IntersectionObserver for marking seen messages at center-of-container
  let observer = null;
  function createObserver(){
    if(!commentsContainer || typeof IntersectionObserver === 'undefined') return null;
    try{
      const rootRect = commentsContainer.getBoundingClientRect();
      // We'll use an observer with bounding root = commentsContainer
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          try{
            const node = en.target;
            if(en.isIntersecting && en.intersectionRatio > 0.5){
              const id = node.dataset.id;
              if(id && (!seenMap[id] || seenMap[id] < 1)){
                bumpViewCount(id, 1);
              } else if(id && !seenMap[id]){
                bumpViewCount(id, 0);
              }
            }
          }catch(e){}
        });
      }, {
        root: commentsContainer,
        threshold: [0.5] // center visibility
      });
      return obs;
    }catch(e){
      safeLog('createObserver failed', e);
      return null;
    }
  }

  function observeBubbles(){
    if(!commentsContainer) return;
    if(observer) observer.disconnect();
    observer = createObserver();
    if(!observer){
      // fallback: throttled scan
      setInterval(() => {
        try{
          const nodes = qsa('.tg-bubble', commentsContainer);
          const rect = commentsContainer.getBoundingClientRect();
          const viewTop = rect.top, viewBottom = rect.bottom;
          nodes.forEach(n => {
            try{
              const r = n.getBoundingClientRect();
              const mid = (r.top + r.bottom) / 2;
              if(mid > viewTop && mid < viewBottom){
                const id = n.dataset.id;
                if(id && (!seenMap[id] || seenMap[id] < 1)) bumpViewCount(id, 1);
              }
            }catch(e){}
          });
        }catch(e){}
      }, 900);
      return;
    }
    // observe existing bubbles
    qsa('.tg-bubble', commentsContainer).forEach(b => {
      try{ observer.observe(b); }catch(e){}
    });
    // Observe container for new bubbles (mutation observer)
    if(window.MutationObserver){
      const mo = new MutationObserver(muts => {
        muts.forEach(m => {
          try{
            m.addedNodes && m.addedNodes.forEach(n => { if(n.nodeType===1 && n.classList && n.classList.contains('tg-bubble')) { try{ observer.observe(n); }catch(e){} } });
          }catch(e){}
        });
      });
      mo.observe(commentsContainer, { childList: true, subtree: true });
    }
  }

  // Kick off observer after a tick
  setTimeout(observeBubbles, 600);
  // periodically persist seenMap
  setInterval(saveSeen, 60*1000);

  // ---------- context menu (animated, simple) ----------
  let ctxMenuEl = document.getElementById('tg-msg-context');
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
  function showContextFor(elMsg, x, y, messageId, personaName, messageText){
    try{
      ctxMenuEl.innerHTML=''; ctxMenuEl.dataset.for = messageId||'';
      const actions = [ {k:'reply',t:'Reply'}, {k:'copy',t:'Copy text'}, {k:'pin',t:'Pin message'}, {k:'contact',t:'Contact Admin'} ];
      actions.forEach(a=>{
        const b=document.createElement('div');
        b.className='ctx-item';
        b.textContent=a.t;
        b.style.padding='8px 10px';
        b.style.color='var(--tg-text, #fff)';
        b.style.cursor='pointer';
        b.style.whiteSpace='nowrap';
        b.style.transition='background 0.12s ease';
        b.addEventListener('mouseenter',()=>b.style.background='rgba(255,255,255,0.06)');
        b.addEventListener('mouseleave',()=>b.style.background='transparent');
        b.addEventListener('click', ev=>{ ev.stopPropagation(); handleContextAction(a.k, messageId, personaName, messageText); hideContext(); });
        ctxMenuEl.appendChild(b);
      });
      const winW = window.innerWidth, winH = window.innerHeight;
      let left = x, top = y;
      // small safe offsets
      if(left + 220 > winW) left = winW - 240;
      if(top + ctxMenuEl.offsetHeight > winH) top = winH - (ctxMenuEl.offsetHeight + 20);
      ctxMenuEl.style.left = (left|0) + 'px';
      ctxMenuEl.style.top = (top|0) + 'px';
      ctxMenuEl.style.display = 'block';
      ctxMenuEl.style.opacity = '0';
      ctxMenuEl.style.transform = 'translateY(-4px)';
      requestAnimationFrame(()=>{ ctxMenuEl.style.opacity = '1'; ctxMenuEl.style.transform = 'translateY(0)'; });
    }catch(e){ safeLog('showContextFor error', e); }
  }
  document.addEventListener('click', ()=> hideContext());
  document.addEventListener('contextmenu', (e)=>{
    try{
      const target = e.target.closest && e.target.closest('.tg-bubble');
      if(!target) return;
      e.preventDefault(); e.stopPropagation();
      const mid = target.dataset.id || '';
      const persona = target.querySelector('.tg-bubble-sender') ? target.querySelector('.tg-bubble-sender').textContent : '';
      const text = (target.querySelector('.tg-bubble-text') && target.querySelector('.tg-bubble-text').textContent) || '';
      showContextFor(target, e.clientX, e.clientY, mid, persona, text);
    }catch(err){}
  });

  function handleContextAction(actionKey, messageId, personaName, messageText){
    try{
      if(actionKey === 'reply'){
        const input = el('tg-comment-input');
        if(input){
          input.focus();
          input.value = `@${personaName.split(" ")[0]} `;
          input.dispatchEvent(new Event('input'));
        }
      } else if(actionKey === 'copy'){
        try{ navigator.clipboard && navigator.clipboard.writeText(messageText); }catch(e){ safeLog('copy failed', e); }
      } else if(actionKey === 'pin'){
        try{
          if(window.PinBanner && typeof window.PinBanner.highlightId === 'function'){
            window.PinBanner.highlightId(messageId);
          } else {
            const elMsg = document.querySelector(`[data-id="${messageId}"]`);
            if(elMsg){ elMsg.scrollIntoView({behavior:'smooth', block:'center'}); elMsg.classList.add('tg-highlight'); setTimeout(()=> elMsg.classList.remove('tg-highlight'), 2600); }
          }
        }catch(e){}
      } else if(actionKey === 'contact'){
        window.open(window.CONTACT_ADMIN_LINK || contactAdminDefault, '_blank');
      }
    }catch(e){ safeLog('handleContextAction error', e); }
  }

  // ---------- reactions: simple toggle, hover title ----------
  function ensureReactionUI(){
    if(!commentsContainer) return;
    // delegated click
    commentsContainer.addEventListener('click', function(ev){
      const pill = ev.target.closest && ev.target.closest('.reaction-pill');
      if(pill){
        pill.classList.toggle('selected');
        pill.setAttribute('aria-pressed', pill.classList.contains('selected') ? 'true' : 'false');
      }
      // ctrl/meta click quick-add
      if(ev.target.closest && ev.target.closest('.tg-bubble') && (ev.ctrlKey || ev.metaKey)){
        const bubble = ev.target.closest('.tg-bubble');
        const reactions = bubble.querySelector('.tg-reactions');
        if(reactions){
          const rp = document.createElement('div');
          rp.className = 'reaction-pill';
          rp.textContent = '👍 1';
          rp.title = 'You reacted 👍';
          reactions.appendChild(rp);
        }
      }
    });
    // hover previews: purely CSS is preferred; add small attribute for styling
    commentsContainer.addEventListener('mouseover', function(ev){
      const bubble = ev.target.closest && ev.target.closest('.tg-bubble');
      if(bubble) bubble.classList.add('hover-preview');
    });
    commentsContainer.addEventListener('mouseout', function(ev){
      const bubble = ev.target.closest && ev.target.closest('.tg-bubble');
      if(bubble) bubble.classList.remove('hover-preview');
    });
  }
  ensureReactionUI();

  // ---------- jumper behavior ----------
  if(jumpIndicator){
    jumpIndicator.addEventListener('click', ()=>{
      try{
        if(commentsContainer){
          commentsContainer.scrollTop = commentsContainer.scrollHeight;
          jumpIndicator.classList.add('hidden');
        }
      }catch(e){}
    });
  }

  // ---------- contact-admin buttons ----------
  function bindContactAdminButtons(){
    document.addEventListener('click', function(ev){
      const btn = ev.target.closest && ev.target.closest('.contact-admin-btn');
      if(!btn) return;
      ev.preventDefault(); ev.stopPropagation();
      const href = window.CONTACT_ADMIN_LINK || contactAdminDefault;
      window.open(href, '_blank');
    });
  }
  bindContactAdminButtons();

  // ---------- dev toolbar (guarded) ----------
  (function addDevToolbar(){
    try{
      if(!window.location.search.includes('abrox-dev')) return;
      let t = el('abrox-dev-toolbar');
      if(t) return;
      t = document.createElement('div');
      t.id = 'abrox-dev-toolbar';
      t.style.position='fixed'; t.style.right='12px'; t.style.bottom='12px'; t.style.zIndex=99999;
      t.style.background='rgba(0,0,0,0.6)'; t.style.color='#fff'; t.style.padding='8px'; t.style.borderRadius='8px'; t.style.fontSize='13px';
      t.innerHTML = '<button id="abrox-dev-seed">seedNow(30)</button> <button id="abrox-dev-real">realism.start</button>';
      document.body.appendChild(t);
      el('abrox-dev-seed')?.addEventListener('click', ()=>{ if(window.realism?.seedNow) window.realism.seedNow(30); });
      el('abrox-dev-real')?.addEventListener('click', ()=>{ if(window.realism?.start) window.realism.start(); });
    }catch(e){}
  })();

  // expose API
  window.Interactions = window.Interactions || {};
  Object.assign(window.Interactions, {
    bumpViewCount, hideContext, showContextFor, ensureReactionUI, bindContactAdminButtons
  });

  safeLog('interactions initialized (visual fixes: no JS pulses, observer-based seen)');
})();
