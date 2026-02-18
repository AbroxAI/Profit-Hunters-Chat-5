// interactions.js
// Handles UI interactions: context menu, contact-admin, reaction clicks, view counting, jumper behavior.
// Defensive: tolerant to missing DOM, missing other modules, idempotent.
// ============================================================

(function(){
  // ---------- small utilities ----------
  function safeLog(...args){ try{ console.log.apply(console, args); }catch(e){} }
  function el(id){ return document.getElementById(id); }
  function qs(sel, root=document){ try{ return root.querySelector(sel); }catch(e){ return null; } }
  function qsa(sel, root=document){ try{ return Array.from(root.querySelectorAll(sel)); }catch(e){ return []; } }
  function now(){ return new Date(); }
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function rand(max){ return Math.floor(Math.random()*max); }

  // ---------- defensive DOM refs ----------
  const commentsContainer = el("tg-comments-container");
  const jumpIndicator = el("tg-jump-indicator");
  const jumpText = el("tg-jump-text"); // optional inside jumpIndicator
  const contactAdminDefault = window.CONTACT_ADMIN_LINK || "https://t.me/ph_suppp";

  // ---------- message view counting (eye) ----------
  // Maintains a small in-memory map of seen counts; persisted optional to localStorage.
  const SEEN_KEY = "abrox_seen_counts_v1";
  let seenMap = {};
  (function loadSeen(){
    try{
      const raw = localStorage.getItem(SEEN_KEY);
      if(raw) seenMap = JSON.parse(raw) || {};
    }catch(e){ seenMap = {}; }
  })();
  function saveSeen(){ try{ localStorage.setItem(SEEN_KEY, JSON.stringify(seenMap)); }catch(e){} }

  // increment view count for a message id and update DOM if present
  function bumpViewCount(messageId, by=1){
    if(!messageId) return;
    seenMap[messageId] = (seenMap[messageId] || 0) + by;
    saveSeen();
    // update DOM: find element data-id
    try{
      const elMsg = document.querySelector(`[data-id="${messageId}"]`);
      if(elMsg){
        const seenEl = elMsg.querySelector('.seen');
        if(seenEl){
          // update numeric part after icon
          // keep the icon intact (svg) — replace trailing number or append
          const icon = seenEl.querySelector('svg') ? seenEl.querySelector('svg').outerHTML + " " : (seenEl.innerHTML.match(/<i[^>]*>.*<\/i>/) || [""])[0];
          seenEl.innerHTML = icon + " " + (seenMap[messageId] || 0);
        }
      }
    }catch(e){}
  }

  // when a message enters viewport near center, mark it seen (throttled)
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
      const viewTop = rect.top;
      const viewBottom = rect.bottom;
      nodes.forEach(n=>{
        try{
          const r = n.getBoundingClientRect();
          // consider 'seen' if its center is within container viewport
          const mid = (r.top + r.bottom)/2;
          if(mid > viewTop && mid < viewBottom){
            const id = n.dataset.id;
            if(id) bumpViewCount(id, 0); // ensure present in seenMap
            // if not previously >0, bump by 1
            if(id && (!seenMap[id] || seenMap[id] < 1)){
              bumpViewCount(id, 1);
            }
          }
        }catch(e){}
      });
    }catch(e){}
  }

  // attach scroll observer if container available
  if(commentsContainer){
    commentsContainer.addEventListener('scroll', ()=> {
      // show jump indicator if scrolled away from bottom
      const scrollBottom = commentsContainer.scrollHeight - commentsContainer.scrollTop - commentsContainer.clientHeight;
      if(scrollBottom > 120){
        if(jumpIndicator) jumpIndicator.classList.remove('hidden');
      } else {
        if(jumpIndicator) jumpIndicator.classList.add('hidden');
      }
      checkMessagesInView();
    });
    // initial check
    setTimeout(checkMessagesInView, 900);
  }

  // ---------- context menu for message actions ----------
  // build a single floating context menu element (idempotent)
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
    document.body.appendChild(ctxMenuEl);
  }
  function hideContext(){ try{ ctxMenuEl.style.display='none'; ctxMenuEl.dataset.for = ''; }catch(e){} }
  function showContextFor(elMsg, x, y, messageId, personaName, messageText){
    try{
      ctxMenuEl.innerHTML = '';
      ctxMenuEl.dataset.for = messageId || '';
      const actions = [
        { k: 'reply', t: 'Reply' },
        { k: 'copy', t: 'Copy text' },
        { k: 'pin', t: 'Pin message' },
        { k: 'contact', t: 'Contact Admin' }
      ];
      actions.forEach(a=>{
        const b = document.createElement('div');
        b.className = 'ctx-item';
        b.textContent = a.t;
        b.style.padding = '8px 10px';
        b.style.color = 'var(--tg-text)';
        b.style.cursor = 'pointer';
        b.style.whiteSpace = 'nowrap';
        b.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          handleContextAction(a.k, messageId, personaName, messageText);
          hideContext();
        });
        ctxMenuEl.appendChild(b);
      });
      // position smartly
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      let left = x;
      let top = y;
      if(left + 220 > winW) left = winW - 240;
      if(top + ctxMenuEl.offsetHeight > winH) top = winH - (ctxMenuEl.offsetHeight + 20);
      ctxMenuEl.style.left = (left|0) + 'px';
      ctxMenuEl.style.top = (top|0) + 'px';
      ctxMenuEl.style.display = 'block';
    }catch(e){ safeLog('showContextFor error', e); }
  }
  document.addEventListener('click', ()=> hideContext());
  document.addEventListener('contextmenu', (e)=> {
    try{
      const target = e.target.closest && e.target.closest('.tg-bubble');
      if(!target) return;
      e.preventDefault();
      e.stopPropagation();
      const mid = target.dataset.id || '';
      const persona = target.querySelector('.tg-bubble-sender') ? target.querySelector('.tg-bubble-sender').textContent : '';
      const text = (target.querySelector('.tg-bubble-text') && target.querySelector('.tg-bubble-text').textContent) || '';
      showContextFor(target, e.clientX, e.clientY, mid, persona, text);
    }catch(err){}
  });

  // handle context menu actions
  function handleContextAction(actionKey, messageId, personaName, messageText){
    try{
      if(actionKey === 'reply'){
        // open input and prefill reply preview (uses BubbleRenderer/TGRenderer showTyping as proxy)
        const input = el('tg-comment-input');
        if(input){
          input.focus();
          input.value = `@${personaName.split(" ")[0]} `;
          // trigger send-button toggle
          const ev = new Event('input'); input.dispatchEvent(ev);
        }
      } else if(actionKey === 'copy'){
        try{ navigator.clipboard && navigator.clipboard.writeText(messageText); }catch(e){ safeLog('copy failed', e); }
      } else if(actionKey === 'pin'){
        // if PinBanner available, highlight and set
        try{
          if(window.PinBanner && typeof window.PinBanner.highlightId === 'function'){
            window.PinBanner.highlightId(messageId);
          } else {
            // fallback: scroll and highlight
            const elMsg = document.querySelector(`[data-id="${messageId}"]`);
            if(elMsg){ elMsg.scrollIntoView({behavior:'smooth', block:'center'}); elMsg.classList.add('tg-highlight'); setTimeout(()=> elMsg.classList.remove('tg-highlight'), 2600); }
          }
        }catch(e){}
      } else if(actionKey === 'contact'){
        window.open(window.CONTACT_ADMIN_LINK || contactAdminDefault, '_blank');
      }
    }catch(e){ safeLog('handleContextAction error', e); }
  }

  // ---------- reaction clicks (adds local reaction pill) ----------
  function ensureReactionUI(){
    // attach delegated click on reaction pills or create reaction area on outgoing messages if missing
    if(!commentsContainer) return;
    commentsContainer.addEventListener('click', function(ev){
      const pill = ev.target.closest && ev.target.closest('.reaction-pill');
      if(pill){
        // toggle reaction selected
        pill.classList.toggle('selected');
        pill.style.transform = pill.classList.contains('selected') ? 'translateY(-2px)' : '';
      }
      // reaction quick add: if user clicks a bubble with ctrl/cmd, add a 👍 pill
      if(ev.target.closest && ev.target.closest('.tg-bubble') && (ev.ctrlKey || ev.metaKey)){
        const bubble = ev.target.closest('.tg-bubble');
        const reactions = bubble.querySelector('.tg-reactions');
        if(reactions){
          const rp = document.createElement('div'); rp.className = 'reaction-pill'; rp.textContent = '👍 1';
          reactions.appendChild(rp);
        }
      }
    });
  }
  ensureReactionUI();

  // ---------- jumper behavior: New messages · X click scroll to bottom ----------
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

  // ---------- quick Contact Admin buttons binding (global) ----------
  function bindContactAdminButtons(){
    // delegate click on elements with .contact-admin-btn class
    document.addEventListener('click', function(ev){
      const btn = ev.target.closest && ev.target.closest('.contact-admin-btn');
      if(!btn) return;
      ev.preventDefault(); ev.stopPropagation();
      const href = window.CONTACT_ADMIN_LINK || contactAdminDefault;
      window.open(href, '_blank');
    });
  }
  bindContactAdminButtons();

  // ---------- small dev toolbar (only in dev mode) ----------
  (function addDevToolbar(){
    try{
      if(!window.location.search.includes('abrox-dev')) return;
      let t = document.getElementById('abrox-dev-toolbar');
      if(t) return;
      t = document.createElement('div');
      t.id = 'abrox-dev-toolbar';
      t.style.position = 'fixed';
      t.style.right = '12px';
      t.style.bottom = '12px';
      t.style.zIndex = 99999;
      t.style.background = 'rgba(0,0,0,0.6)';
      t.style.color = '#fff';
      t.style.padding = '8px';
      t.style.borderRadius = '8px';
      t.style.fontSize = '13px';
      t.innerHTML = '<button id="abrox-dev-seed">seedNow(30)</button> <button id="abrox-dev-real">realism.start</button>';
      document.body.appendChild(t);
      document.getElementById('abrox-dev-seed').addEventListener('click', ()=>{ if(window.realism) window.realism.seedNow(30); });
      document.getElementById('abrox-dev-real').addEventListener('click', ()=>{ if(window.realism) window.realism.start(); });
    }catch(e){}
  })();

  // ---------- expose API ----------
  window.Interactions = window.Interactions || {};
  Object.assign(window.Interactions, {
    bumpViewCount,
    hideContext,
    showContextFor,
    ensureReactionUI,
    bindContactAdminButtons
  });

  // final nicety: periodically persist seenMap
  setInterval(saveSeen, 60*1000);

  safeLog('interactions initialized');
})();
