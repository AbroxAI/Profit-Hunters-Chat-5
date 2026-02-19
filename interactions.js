// interactions.js
// Handles UI interactions: context menu, contact-admin, reaction clicks, view counting, jumper behavior.
// Defensive, idempotent, no automatic bubble pulse (cleaned per request).
// ============================================================

(function(){
  // ---------- Utilities ----------
  const safeLog = (...args) => { try { console.log(...args); } catch(_){} };
  const el = id => document.getElementById(id);
  const qs = (sel, root = document) => { try { return root.querySelector(sel); } catch(_) { return null; } };
  const qsa = (sel, root = document) => { try { return Array.from(root.querySelectorAll(sel)); } catch(_) { return []; } };
  const now = () => new Date();
  const randInt = (min, max) => Math.floor(Math.random()*(max-min+1)) + min;

  // ---------- Defensive DOM refs ----------
  const COMMENTS_ID = "tg-comments-container";
  const commentsContainer = el(COMMENTS_ID);
  const jumpIndicator = el("tg-jump-indicator");
  const contactAdminDefault = window.CONTACT_ADMIN_LINK || "https://t.me/ph_suppp";

  // ---------- Seen / view counting ----------
  const SEEN_KEY = "abrox_seen_counts_v1";
  let seenMap = {};
  (function loadSeen(){
    try{
      const raw = localStorage.getItem(SEEN_KEY);
      if(raw) seenMap = JSON.parse(raw) || {};
    }catch(e){ seenMap = {}; }
  })();

  function saveSeen(){
    try{ localStorage.setItem(SEEN_KEY, JSON.stringify(seenMap)); }catch(e){}
  }

  // Safely update seen count element for a message node
  function updateSeenElementForNode(node, count){
    try{
      if(!node) return;
      const seenEl = node.querySelector('.seen');
      if(!seenEl) return;
      // Preserve any leading icon markup (svg or i) when replacing the number
      const iconNode = seenEl.querySelector('svg') || seenEl.querySelector('i');
      let iconHtml = '';
      if(iconNode) iconHtml = iconNode.outerHTML + ' ';
      seenEl.innerHTML = iconHtml + String(count);
    }catch(e){ /* ignore DOM errors */ }
  }

  // Increment view count and update DOM (idempotent)
  function bumpViewCount(messageId, by = 1){
    if(!messageId) return;
    try{
      seenMap[messageId] = (seenMap[messageId] || 0) + by;
      updateSeenElementForNode(document.querySelector(`[data-id="${messageId}"]`), seenMap[messageId]);
      // persist is deferred to interval, but update now to reduce risk
      try{ localStorage.setItem(SEEN_KEY, JSON.stringify(seenMap)); }catch(e){}
    }catch(e){ safeLog("bumpViewCount failed", e); }
  }

  // ---------- In-view detection (throttled) ----------
  const INVIEW_THROTTLE_MS = 800;
  let lastInViewTs = 0;

  function checkMessagesInView(){
    if(!commentsContainer) return;
    try{
      const nowTs = Date.now();
      if(nowTs - lastInViewTs < INVIEW_THROTTLE_MS) return;
      lastInViewTs = nowTs;

      const bubbles = qsa('.tg-bubble', commentsContainer);
      const rect = commentsContainer.getBoundingClientRect();
      const viewTop = rect.top;
      const viewBottom = rect.bottom;

      for(const b of bubbles){
        try{
          const r = b.getBoundingClientRect();
          const mid = (r.top + r.bottom) / 2;
          if(mid > viewTop && mid < viewBottom){
            const id = b.dataset.id;
            if(id){
              // ensure present with 0
              if(!seenMap[id]) bumpViewCount(id, 0);
              // first time seen
              if(!seenMap[id] || seenMap[id] < 1){
                bumpViewCount(id, 1);
              }
            }
          }
        }catch(e){ /* continue */ }
      }
    }catch(e){ safeLog("checkMessagesInView error", e); }
  }

  // Attach scroll listener if container present
  if(commentsContainer){
    commentsContainer.addEventListener('scroll', () => {
      try{
        // show jump indicator when scrolled away from bottom
        const scrollBottom = commentsContainer.scrollHeight - commentsContainer.scrollTop - commentsContainer.clientHeight;
        if(jumpIndicator){
          if(scrollBottom > 120) jumpIndicator.classList.remove('hidden');
          else jumpIndicator.classList.add('hidden');
        }
        checkMessagesInView();
      }catch(e){ safeLog("scroll handler error", e); }
    });
    // initial check (defer slightly to allow initial render)
    setTimeout(checkMessagesInView, 700);
  }

  // ---------- Context menu (idempotent) ----------
  let ctxMenuEl = el('tg-msg-context');
  if(!ctxMenuEl){
    ctxMenuEl = document.createElement('div');
    ctxMenuEl.id = 'tg-msg-context';
    ctxMenuEl.className = 'tg-msg-context hidden';
    ctxMenuEl.setAttribute('role','menu');
    document.body.appendChild(ctxMenuEl);
  }

  function hideContext(){
    try{
      ctxMenuEl.classList.add('hidden');
      ctxMenuEl.innerHTML = '';
      ctxMenuEl.dataset.for = '';
    }catch(e){}
  }

  function showContextFor(targetElement, x, y, messageId, personaName, messageText){
    try{
      ctxMenuEl.innerHTML = '';
      ctxMenuEl.dataset.for = messageId || '';

      const actions = [
        { k: 'reply', t: 'Reply' },
        { k: 'copy', t: 'Copy text' },
        { k: 'pin', t: 'Pin message' },
        { k: 'contact', t: 'Contact Admin' }
      ];

      for(const a of actions){
        const item = document.createElement('div');
        item.className = 'ctx-item';
        item.textContent = a.t;
        item.tabIndex = 0;
        item.addEventListener('click', ev => { ev.stopPropagation(); handleContextAction(a.k, messageId, personaName, messageText); hideContext(); });
        item.addEventListener('keydown', ev => { if(ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); handleContextAction(a.k, messageId, personaName, messageText); hideContext(); } });
        ctxMenuEl.appendChild(item);
      }

      // Position the menu with simple overflow handling
      const winW = window.innerWidth, winH = window.innerHeight;
      let left = x, top = y;
      // small margin
      const margin = 12;
      // estimate width after adding (but keep safe fallback)
      const estW = 220;
      const estH = Math.min(44 * actions.length, 220);
      if(left + estW + margin > winW) left = Math.max(margin, winW - estW - margin);
      if(top + estH + margin > winH) top = Math.max(margin, winH - estH - margin);
      ctxMenuEl.style.left = (left|0) + 'px';
      ctxMenuEl.style.top = (top|0) + 'px';
      ctxMenuEl.classList.remove('hidden');
    }catch(e){ safeLog('showContextFor error', e); }
  }

  // Hide on any document click / Esc
  document.addEventListener('click', hideContext);
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape') hideContext(); });

  document.addEventListener('contextmenu', (e) => {
    try{
      const target = e.target.closest && e.target.closest('.tg-bubble');
      if(!target) return;
      e.preventDefault();
      e.stopPropagation();
      const mid = target.dataset.id || '';
      const persona = target.querySelector('.tg-bubble-sender') ? target.querySelector('.tg-bubble-sender').textContent : '';
      const text = (target.querySelector('.tg-bubble-text') && target.querySelector('.tg-bubble-text').textContent) || '';
      showContextFor(target, e.clientX, e.clientY, mid, persona, text);
    }catch(err){ safeLog('contextmenu handler error', err); }
  });

  // ---------- Context menu actions ----------
  function handleContextAction(actionKey, messageId, personaName, messageText){
    try{
      if(actionKey === 'reply'){
        const input = el('tg-comment-input');
        if(input){
          input.focus();
          input.value = `@${(personaName || 'user').split(" ")[0]} `;
          input.dispatchEvent(new Event('input'));
          // optionally place a visual reply preview — left to TGRenderer if present
          try{ if(window.TGRenderer && typeof window.TGRenderer.showReplyPreview === 'function') window.TGRenderer.showReplyPreview(messageId, messageText); }catch(e){}
        }
      } else if(actionKey === 'copy'){
        try{ navigator.clipboard && navigator.clipboard.writeText(messageText || ''); }catch(e){ safeLog('copy failed', e); }
      } else if(actionKey === 'pin'){
        try{
          if(window.PinBanner && typeof window.PinBanner.highlightId === 'function'){
            window.PinBanner.highlightId(messageId);
          } else {
            const elMsg = document.querySelector(`[data-id="${messageId}"]`);
            if(elMsg){ elMsg.scrollIntoView({ behavior: 'smooth', block: 'center' }); elMsg.classList.add('tg-highlight'); setTimeout(()=> elMsg.classList.remove('tg-highlight'), 2600); }
          }
        }catch(e){ safeLog('pin action error', e); }
      } else if(actionKey === 'contact'){
        try{ window.open(window.CONTACT_ADMIN_LINK || contactAdminDefault, '_blank'); }catch(e){}
      }
    }catch(err){ safeLog('handleContextAction error', err); }
  }

  // ---------- Reactions (delegated) ----------
  function ensureReactionUI(){
    if(!commentsContainer) return;
    // Add a delegated click handler
    commentsContainer.addEventListener('click', (ev) => {
      try{
        const pill = ev.target.closest && ev.target.closest('.reaction-pill');
        if(pill){
          // toggle selected class
          if(pill.classList.contains('selected')) pill.classList.remove('selected');
          else pill.classList.add('selected');
          // small transform for immediate feedback (no forced layout heavy ops)
          pill.style.transform = pill.classList.contains('selected') ? 'translateY(-2px)' : '';
          return;
        }

        // Quick-add on ctrl/cmd + bubble click
        if(ev.target.closest && ev.target.closest('.tg-bubble') && (ev.ctrlKey || ev.metaKey)){
          const bubble = ev.target.closest('.tg-bubble');
          const reactions = bubble.querySelector('.tg-reactions');
          if(reactions){
            const rp = document.createElement('div');
            rp.className = 'reaction-pill';
            rp.textContent = '👍 1';
            rp.title = 'You reacted 👍';
            reactions.appendChild(rp);
            // small fade-in
            rp.style.opacity = '0';
            rp.style.transition = 'opacity 180ms ease, transform 180ms ease';
            requestAnimationFrame(()=>{ rp.style.opacity = '1'; rp.style.transform = 'translateY(0)'; });
          }
        }
      }catch(e){ safeLog('reaction handler error', e); }
    });
  }
  ensureReactionUI();

  // ---------- Jump indicator (scroll-to-bottom) ----------
  if(jumpIndicator && commentsContainer){
    jumpIndicator.addEventListener('click', () => {
      try{
        commentsContainer.scrollTo({ top: commentsContainer.scrollHeight, behavior: 'smooth' });
        jumpIndicator.classList.add('hidden');
      }catch(e){ safeLog('jump click failed', e); }
    });
  }

  // ---------- Contact admin button binding ----------
  function bindContactAdminButtons(){
    document.addEventListener('click', (ev) => {
      try{
        const btn = ev.target.closest && ev.target.closest('.contact-admin-btn');
        if(!btn) return;
        ev.preventDefault(); ev.stopPropagation();
        const href = window.CONTACT_ADMIN_LINK || contactAdminDefault;
        // prefer ticket API if available
        if(typeof window.sendAdminTicket === 'function'){
          // if there's a pinned message context, pass its id; otherwise null
          const pinnedId = (document.getElementById('tg-pin-banner') && document.getElementById('tg-pin-banner').dataset.pinnedId) || null;
          try{ window.sendAdminTicket('Guest', 'Contact requested from UI', pinnedId); return; }catch(e){ /* fallback to open link */ }
        }
        window.open(href, '_blank');
      }catch(e){ safeLog('bindContactAdminButtons error', e); }
    });
  }
  bindContactAdminButtons();

  // ---------- Dev toolbar (idempotent) ----------
  (function addDevToolbar(){
    try{
      if(!window.location.search.includes('abrox-dev')) return;
      if(el('abrox-dev-toolbar')) return;
      const t = document.createElement('div');
      t.id = 'abrox-dev-toolbar';
      t.style.position = 'fixed';
      t.style.right = '12px';
      t.style.bottom = '12px';
      t.style.zIndex = '99999';
      t.style.background = 'rgba(0,0,0,0.6)';
      t.style.color = '#fff';
      t.style.padding = '8px';
      t.style.borderRadius = '8px';
      t.style.fontSize = '13px';
      t.innerHTML = '<button id="abrox-dev-seed">seedNow(30)</button> <button id="abrox-dev-real">realism.start</button>';
      document.body.appendChild(t);
      el('abrox-dev-seed')?.addEventListener('click', ()=>{ if(window.realism?.seedNow) window.realism.seedNow(30); });
      el('abrox-dev-real')?.addEventListener('click', ()=>{ if(window.realism?.start) window.realism.start(); });
    }catch(e){ safeLog('addDevToolbar error', e); }
  })();

  // ---------- Expose API ----------
  window.Interactions = window.Interactions || {};
  Object.assign(window.Interactions, {
    bumpViewCount,
    hideContext,
    showContextFor,
    ensureReactionUI,
    bindContactAdminButtons,
    checkMessagesInView
  });

  // periodic persistence of seenMap
  setInterval(saveSeen, 60 * 1000);

  safeLog('interactions initialized (clean, no pulse)');
})();
