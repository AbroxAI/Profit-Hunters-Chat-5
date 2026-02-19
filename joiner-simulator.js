// joiner-simulator.js
// Responsible for joiner simulation, join stickers, seeding historical joiners,
// per-join system messages, sticker bursts, member-count bumps.
// Idempotent: augments existing window.joiner if present.
// Defensive + persistent join history (localStorage).
// ============================================================

(function(){
  // if already present, keep a reference to augment
  const existing = window.joiner || null;

  // ---------- Utils ----------
  const safeLog = (...args) => { try { console.log(...args); } catch(e){} };
  const now = () => new Date();
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const rand = max => Math.floor(Math.random() * max);
  const el = id => document.getElementById(id);
  const safeJSONParse = (s, fallback) => { try { return JSON.parse(s); } catch(e){ return fallback; } };

  // ---------- CONFIG ----------
  const CONFIG = {
    minJoinIntervalMs: 4500,
    maxJoinIntervalMs: 22000,
    burstChance: 0.16,
    burstMin: 2,
    burstMax: 6,
    stickerBurstThreshold: 3,
    stickerImage: "assets/join-sticker.png",
    persistKey: "abrox_join_history_v1",
    maxHistoryKeep: 2000,
    defaultAvatarSeedCount: 300
  };

  // ---------- Persistence: load/save JOIN_HISTORY ----------
  const JOIN_HISTORY = (function load(){
    try{
      const raw = localStorage.getItem(CONFIG.persistKey);
      const arr = safeJSONParse(raw, []);
      if(Array.isArray(arr)) return arr.slice(-CONFIG.maxHistoryKeep);
    }catch(e){}
    return [];
  })();

  function saveJoinHistory(){
    try{
      localStorage.setItem(CONFIG.persistKey, JSON.stringify(JOIN_HISTORY.slice(-CONFIG.maxHistoryKeep)));
    }catch(e){}
  }
  window.addEventListener('beforeunload', saveJoinHistory);

  // ---------- DOM helpers ----------
  const COMMENTS_CONTAINER_ID = "tg-comments-container";
  function getCommentsContainer(){ return el(COMMENTS_CONTAINER_ID) || document.querySelector('.tg-comments-container'); }

  // ---------- Render helpers ----------
  function appendSystemMessage(text, ts = new Date()){
    try{
      if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
        window.TGRenderer.appendMessage({ name: "System" }, text, { timestamp: ts, type: "system" });
        return;
      }
      if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
        window.BubbleRenderer.renderMessages([ { id: "sys_"+Date.now()+"_"+rand(9999), name: "System", avatar: null, text, time: ts.toISOString(), isOwn: false, type: "system" } ]);
        return;
      }
      safeLog("[joiner] system:", text);
    }catch(e){ safeLog("appendSystemMessage error", e); }
  }

  function appendIncomingMessage(persona, text, opts = {}){
    try{
      if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
        window.TGRenderer.appendMessage(persona, text, Object.assign({ timestamp: new Date(), type: "incoming" }, opts));
        return;
      }
      if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
        const msg = { id: opts.id || "j_"+Date.now()+"_"+rand(9999), name: persona.name, avatar: persona.avatar, text, time: (opts.timestamp || new Date()).toISOString(), isOwn: false };
        window.BubbleRenderer.renderMessages([ msg ]);
        return;
      }
      safeLog("[joiner] incoming:", persona.name, text);
    }catch(e){ safeLog("appendIncomingMessage error", e); }
  }

  // show visual join sticker inside the comments container (non-blocking)
  function showJoinSticker(persona, opts = { stickerImage: CONFIG.stickerImage }){
    try{
      const container = getCommentsContainer();
      if(!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'tg-join-sticker-wrapper';
      wrapper.setAttribute('role','status');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '10px';
      wrapper.style.margin = '8px 12px';

      const avatar = document.createElement('img');
      avatar.src = persona.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(persona.name)}&background=random`;
      avatar.alt = persona.name;
      avatar.style.width = '44px';
      avatar.style.height = '44px';
      avatar.style.borderRadius = '50%';
      avatar.style.objectFit = 'cover';
      avatar.onerror = function(){ this.onerror = null; this.src = `https://picsum.photos/seed/j${rand(9999)}/48/48`; };

      const txtWrap = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = `${persona.name} joined`;
      title.style.fontWeight = '600';
      title.style.fontSize = '13px';
      const sub = document.createElement('div');
      sub.textContent = 'Welcome to the group — check the pinned message for rules';
      sub.style.fontSize = '12px';
      sub.style.opacity = '0.85';
      txtWrap.appendChild(title);
      txtWrap.appendChild(sub);

      // optional sticker image on right
      if(opts.stickerImage){
        const sticker = document.createElement('img');
        sticker.src = opts.stickerImage;
        sticker.alt = 'joined';
        sticker.style.width = '56px';
        sticker.style.height = '56px';
        sticker.style.objectFit = 'contain';
        sticker.onerror = function(){ this.style.display = 'none'; };
        wrapper.appendChild(avatar);
        wrapper.appendChild(txtWrap);
        wrapper.appendChild(sticker);
      } else {
        wrapper.appendChild(avatar);
        wrapper.appendChild(txtWrap);
      }

      container.appendChild(wrapper);
      container.scrollTop = container.scrollHeight;
      wrapper.style.opacity = '0';
      wrapper.style.transform = 'translateY(6px)';
      requestAnimationFrame(()=>{ wrapper.style.transition = 'all 260ms ease'; wrapper.style.opacity = '1'; wrapper.style.transform = 'translateY(0)'; });

      // remove after some time
      setTimeout(()=>{ try{ if(wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper); }catch(e){} }, 6500 + randInt(0,2200));
    }catch(e){ safeLog("showJoinSticker error", e); }
  }

  // ---------- Persona generation ----------
  function genPersona(){
    try{
      if(window.identity && typeof window.identity.getRandomPersona === 'function'){
        const p = window.identity.getRandomPersona();
        p.name = p.name || ("User" + rand(99999));
        p.avatar = p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random`;
        return p;
      }
      const n = "User" + rand(99999);
      return { name: n, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=random` };
    }catch(e){
      return { name: "User" + rand(9999), avatar: `https://ui-avatars.com/api/?name=U${rand(99)}` };
    }
  }

  // ---------- Main join logic ----------
  let running = false;
  let joinTimer = null;
  let joinBurstCooldown = false;

  function recordJoinHistory(entry){
    try{
      JOIN_HISTORY.push(entry);
      if(JOIN_HISTORY.length > CONFIG.maxHistoryKeep) JOIN_HISTORY.shift();
      // persist immediately to reduce lost state
      saveJoinHistory();
    }catch(e){ safeLog("recordJoinHistory error", e); }
  }

  function postJoinPersona(persona){
    try{
      // system message
      appendSystemMessage(`${persona.name} joined the group`, new Date());

      // small welcome from admin/bot
      setTimeout(()=> {
        appendIncomingMessage({ name: "Profit Hunter 🌐", avatar: "assets/admin.jpg" }, `Welcome @${persona.name.split(" ")[0]} — please verify using the Contact Admin button`, { timestamp: new Date() });
      }, 600 + randInt(0,900));

      // bump member count if present
      try{
        window.MEMBER_COUNT = (window.MEMBER_COUNT || 0) + 1;
        if(typeof window.App === 'object' && typeof window.App.updateMetaLine === 'function') window.App.updateMetaLine();
        else if(typeof window.updateMetaLine === 'function') window.updateMetaLine();
      }catch(e){}
    }catch(e){ safeLog("postJoinPersona error", e); }
  }

  function joinNow(count = 1, opts = { showSticker: true }){
    try{
      const perDelay = 420 + randInt(0,900);
      for(let i=0;i<count;i++){
        (function(i){
          setTimeout(()=>{
            try{
              const persona = genPersona();
              const id = "j_"+Date.now()+"_"+rand(99999);
              const timeISO = new Date().toISOString();
              // record history
              try{ recordJoinHistory({ id, name: persona.name, avatar: persona.avatar, time: timeISO }); }catch(e){}
              // system and welcome messages
              postJoinPersona(persona);
              // show sticker when burst or explicitly requested
              if(opts.showSticker && (count >= CONFIG.stickerBurstThreshold || i === Math.floor(count/2))){
                showJoinSticker(persona, { stickerImage: CONFIG.stickerImage });
              }
            }catch(e){ safeLog("joinNow inner error", e); }
          }, i * perDelay);
        })(i);
      }
    }catch(e){ safeLog("joinNow failed", e); }
  }

  // seed historical joiners between dates (chronological seeding)
  async function seedJoinersBetween(startDate, endDate, opts = { minPerDay: 1, maxPerDay: 4, chunkSize: 120 }){
    try{
      const start = new Date(startDate);
      const end = new Date(endDate);
      if(isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) throw new Error("invalid dates");
      const days = Math.ceil((end - start) / (1000*60*60*24));
      let posted = 0;
      let batch = 0;
      for(let d=0; d<days; d++){
        const day = new Date(start.getTime() + d * 24*60*60*1000);
        const perDay = randInt(opts.minPerDay, opts.maxPerDay);
        for(let i=0;i<perDay;i++){
          const ts = new Date(day.getTime() + Math.floor(Math.random() * 24*60*60*1000));
          const persona = genPersona();
          // append system + welcome at timestamp
          try{
            if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
              window.TGRenderer.appendMessage({ name: "System" }, `${persona.name} joined the group`, { timestamp: ts, type: "system" });
              window.TGRenderer.appendMessage({ name: "Profit Hunter 🌐", avatar: "assets/admin.jpg" }, `Welcome @${persona.name.split(" ")[0]} — verify using Contact Admin`, { timestamp: new Date(ts.getTime() + 60000), type: "incoming" });
            } else if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
              window.BubbleRenderer.renderMessages([ { id: "seedjoin_"+d+"_"+i, name: "System", avatar: null, text: `${persona.name} joined the group`, time: ts.toISOString(), isOwn: false, type: "system" } ]);
              window.BubbleRenderer.renderMessages([ { id: "seedjoinadmin_"+d+"_"+i, name: "Profit Hunter 🌐", avatar: "assets/admin.jpg", text: `Welcome @${persona.name.split(" ")[0]} — verify using Contact Admin`, time: new Date(ts.getTime()+60000).toISOString(), isOwn:false } ]);
            } else {
              // fallback logging
              safeLog("[seedJoin] system", persona.name, ts.toISOString());
            }
            // record to history
            JOIN_HISTORY.push({ id: "h_j_"+Date.now()+"_"+rand(99999), name: persona.name, time: ts.toISOString() });
            if(JOIN_HISTORY.length > CONFIG.maxHistoryKeep) JOIN_HISTORY.shift();
          }catch(e){ safeLog("seedJoin append error", e); }
          posted++; batch++;
          if(batch >= (opts.chunkSize || 120)){
            await new Promise(r => setTimeout(r, 120));
            batch = 0;
          }
        }
      }
      saveJoinHistory();
      safeLog("seedJoinersBetween posted", posted);
      return posted;
    }catch(e){ safeLog("seedJoinersBetween failed", e); return 0; }
  }

  // ---------- Background tick (auto joins) ----------
  function _tick(){
    if(!running) return;
    try{
      if(Math.random() < CONFIG.burstChance && !joinBurstCooldown){
        const c = randInt(CONFIG.burstMin, CONFIG.burstMax);
        joinNow(c, { showSticker: true });
        joinBurstCooldown = true;
        setTimeout(()=> joinBurstCooldown = false, 18000 + randInt(0,12000));
      } else {
        if(Math.random() < 0.22) joinNow(1, { showSticker: false });
      }
      const next = CONFIG.minJoinIntervalMs + Math.floor(Math.random() * (CONFIG.maxJoinIntervalMs - CONFIG.minJoinIntervalMs));
      joinTimer = setTimeout(_tick, next);
    }catch(e){ safeLog("_tick error", e); joinTimer = setTimeout(_tick, CONFIG.maxJoinIntervalMs); }
  }

  function start(){
    if(running) return;
    running = true;
    // warm up: small initial activity
    setTimeout(()=> { try{ _tick(); }catch(e){ safeLog("start tick error", e); } }, 600 + randInt(0,800));
    safeLog("joiner started");
  }

  function stop(){
    running = false;
    if(joinTimer) clearTimeout(joinTimer);
    joinTimer = null;
    safeLog("joiner stopped");
  }

  // ---------- Public API ----------
  const api = {
    start,
    stop,
    joinNow,
    isRunning: () => running,
    seedJoinersBetween,
    getHistorySnapshot: function(){ return JOIN_HISTORY.slice().reverse().slice(0, 200); },
    _debugSticker: function(){ const p = genPersona(); showJoinSticker(p, { stickerImage: CONFIG.stickerImage }); return p; },
    config: Object.assign({}, CONFIG)
  };

  // ---------- Merge with existing joiner if present ----------
  if(existing && typeof existing === 'object'){
    // copy missing methods only
    Object.keys(api).forEach(k => { if(!existing[k]) existing[k] = api[k]; });
    // keep global pointing to existing
    window.joiner = existing;
    safeLog("joiner-simulator augmented existing joiner");
  } else {
    window.joiner = api;
    safeLog("joiner-simulator initialized");
  }

  // expose save/load helpers for debugging
  window.joiner._saveHistory = saveJoinHistory;
  window.joiner._getRawHistory = () => JOIN_HISTORY.slice();

})();
