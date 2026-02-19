// joiner-simulator.js
// Responsible for joiner simulation, join stickers, seeding historical joiners,
// per-join system messages, sticker bursts, member-count bumps.
// Idempotent: augments existing window.joiner if present.
// Visual & persistence fixes applied.
// ============================================================
(function(){
  const existing = window.joiner || null;

  function safeLog(...args){ try{ console.log.apply(console, args); }catch(e){} }
  function now(){ return new Date(); }
  function rand(max){ return Math.floor(Math.random()*max); }
  function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

  const CONFIG = {
    minJoinIntervalMs: 4500,
    maxJoinIntervalMs: 22000,
    burstChance: 0.16,
    burstMin: 2,
    burstMax: 6,
    stickerBurstThreshold: 3,
    stickerImage: "assets/join-sticker.png",
    persistKey: "abrox_join_history_v1",
    maxHistoryKeep: 2000
  };

  const JOIN_HISTORY = [];
  (function loadJoinHistory(){
    try{
      const raw = localStorage.getItem(CONFIG.persistKey);
      if(raw){
        const arr = JSON.parse(raw);
        if(Array.isArray(arr)) arr.slice(-CONFIG.maxHistoryKeep).forEach(x => JOIN_HISTORY.push(x));
      }
    }catch(e){}
  })();
  function saveJoinHistory(){
    try{ localStorage.setItem(CONFIG.persistKey, JSON.stringify(JOIN_HISTORY.slice(-CONFIG.maxHistoryKeep))); }catch(e){}
  }
  window.addEventListener("beforeunload", saveJoinHistory);

  const LONG_TERM_POOL = []; // placeholder if needed by future features

  function postJoinPersona(persona){
    try{
      const sysText = `${persona.name} joined the group`;
      if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
        window.TGRenderer.appendMessage({ name: "System" }, sysText, { timestamp: new Date(), type: "system" });
      } else {
        safeLog("[joiner] sys:", sysText);
      }

      setTimeout(()=> {
        const adminPersona = { name: "Profit Hunter 🌐", avatar: "assets/admin.jpg" };
        const welcome = `Welcome @${persona.name.split(" ")[0]} — please verify using the Contact Admin button`;
        if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
          window.TGRenderer.appendMessage(adminPersona, welcome, { timestamp: new Date(), type: "incoming" });
        } else safeLog("[joiner] welcome:", welcome);
      }, 600 + rand(900));

      try{
        window.MEMBER_COUNT = (window.MEMBER_COUNT || 0) + 1;
        if(window.App && typeof window.App.updateMetaLine === "function") window.App.updateMetaLine();
        else if(typeof window.updateMetaLine === "function") updateMetaLine();
      }catch(e){}
    }catch(e){ safeLog("postJoinPersona error", e); }
  }

  function showJoinSticker(persona, opts = { inline: true, stickerImage: CONFIG.stickerImage }){
    try{
      const container = document.getElementById("tg-comments-container");
      if(!container) return;
      const stickerWrap = document.createElement("div");
      stickerWrap.className = "tg-join-sticker-wrapper";
      stickerWrap.style.display = 'flex';
      stickerWrap.style.justifyContent = 'center';
      stickerWrap.style.padding = '8px 0';

      const sticker = document.createElement("div");
      sticker.className = "tg-join-sticker";
      sticker.style.display = 'flex';
      sticker.style.alignItems = 'center';
      sticker.style.gap = '10px';
      sticker.style.background = 'rgba(255,255,255,0.02)';
      sticker.style.padding = '8px 12px';
      sticker.style.borderRadius = '10px';
      sticker.style.maxWidth = '86%';

      const avatar = document.createElement("img");
      avatar.className = "tg-join-sticker-avatar";
      avatar.src = persona.avatar || (`https://ui-avatars.com/api/?name=${encodeURIComponent(persona.name||"U")}&background=random`);
      avatar.style.width = '40px';
      avatar.style.height = '40px';
      avatar.style.borderRadius = '50%';
      avatar.onerror = function(){ this.onerror = null; try{ this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent((persona.name||"U").split(" ").slice(0,2).join(" "))}&background=random`; }catch(e){ this.src = "https://picsum.photos/seed/j/48/48"; } };

      const content = document.createElement("div");
      content.style.display = 'flex';
      content.style.flexDirection = 'column';

      const title = document.createElement("div"); title.className = "tg-join-sticker-title"; title.textContent = persona.name + " joined";
      const sub = document.createElement("div"); sub.className = "tg-join-sticker-sub"; sub.textContent = "Welcome to the group — check the pinned message for rules";
      title.style.fontWeight = '600';
      sub.style.fontSize = '13px';
      sub.style.opacity = '0.85';

      content.appendChild(title); content.appendChild(sub);
      sticker.appendChild(avatar); sticker.appendChild(content);

      if(opts.stickerImage){
        const side = document.createElement("img");
        side.className = "tg-join-sticker-image";
        side.src = opts.stickerImage;
        side.style.width = '60px';
        side.style.height = '60px';
        side.style.objectFit = 'cover';
        side.style.borderRadius = '8px';
        side.onerror = function(){ this.style.display = 'none'; };
        sticker.appendChild(side);
      }

      stickerWrap.appendChild(sticker);
      container.appendChild(stickerWrap);
      container.scrollTop = container.scrollHeight;

      // subtle entrance (CSS-friendly)
      stickerWrap.style.opacity = 0;
      stickerWrap.style.transform = "translateY(6px)";
      requestAnimationFrame(()=>{ stickerWrap.style.transition = "all 260ms ease"; stickerWrap.style.opacity = 1; stickerWrap.style.transform = "translateY(0)"; });

      // remove sticker after a while
      setTimeout(()=>{ try{ if(stickerWrap && stickerWrap.parentNode) stickerWrap.parentNode.removeChild(stickerWrap); }catch(e){} }, 5200 + rand(2200));
    }catch(e){ safeLog("showJoinSticker error", e); }
  }

  function genPersona(){
    try{
      if(window.identity && typeof window.identity.getRandomPersona === "function"){
        const p = window.identity.getRandomPersona();
        if(!p.name) p.name = "User" + rand(9999);
        return p;
      }
      const n = "User" + rand(99999);
      return { name: n, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=random` };
    }catch(e){
      return { name: "User" + rand(9999), avatar: `https://ui-avatars.com/api/?name=U${rand(99)}` };
    }
  }

  function joinNow(count = 1, opts = { showSticker: true }){
    try{
      const perDelay = 420 + rand(900);
      for(let i=0;i<count;i++){
        (function(i){
          setTimeout(()=>{
            const persona = genPersona();
            try{
              JOIN_HISTORY.push({ id: "j_"+Date.now()+"_"+rand(99999), name: persona.name, time: new Date().toISOString() });
              if(JOIN_HISTORY.length > CONFIG.maxHistoryKeep) JOIN_HISTORY.shift();
              saveJoinHistory();
            }catch(e){}
            postJoinPersona(persona);
            if(opts.showSticker && (count >= CONFIG.stickerBurstThreshold || i === Math.floor(count/2))){
              showJoinSticker(persona, { stickerImage: CONFIG.stickerImage });
            }
          }, i * perDelay);
        })(i);
      }
    }catch(e){ safeLog("joinNow failed", e); }
  }

  async function seedJoinersBetween(startDate, endDate, opts = { minPerDay:1, maxPerDay:4, chunkSize: 120 }){
    try{
      const start = new Date(startDate);
      const end = new Date(endDate);
      if(isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) throw new Error("invalid dates");
      const days = Math.ceil((end - start) / (1000*60*60*24));
      let posted = 0;
      let batch = 0;
      for(let d=0; d<days; d++){
        const day = new Date(start.getTime() + d*24*60*60*1000);
        const perDay = randInt(opts.minPerDay, opts.maxPerDay);
        for(let i=0;i<perDay;i++){
          const ts = new Date(day.getTime() + Math.floor(Math.random()*24*60*60*1000));
          const persona = genPersona();
          if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
            window.TGRenderer.appendMessage({ name: "System" }, `${persona.name} joined the group`, { timestamp: ts, type: "system" });
            window.TGRenderer.appendMessage({ name: "Profit Hunter 🌐", avatar: "assets/admin.jpg" }, `Welcome @${persona.name.split(" ")[0]} — verify using Contact Admin`, { timestamp: new Date(ts.getTime() + 60000), type: "incoming" });
          }
          try{ JOIN_HISTORY.push({ id: "h_j_"+Date.now()+"_"+rand(99999), name: persona.name, time: ts.toISOString() }); if(JOIN_HISTORY.length > CONFIG.maxHistoryKeep) JOIN_HISTORY.shift(); }catch(e){}
          posted++; batch++;
          if(batch >= opts.chunkSize){ await new Promise(r => setTimeout(r, 120)); batch = 0; }
        }
      }
      saveJoinHistory();
      safeLog("seedJoinersBetween posted", posted);
      return posted;
    }catch(e){ safeLog("seedJoinersBetween failed", e); return 0; }
  }

  // background tick
  let running = false;
  let joinTimer = null;
  let joinBurstCooldown = false;
  function _tick(){
    if(!running) return;
    try{
      if(Math.random() < CONFIG.burstChance && !joinBurstCooldown){
        const c = randInt(CONFIG.burstMin, CONFIG.burstMax);
        joinNow(c);
        joinBurstCooldown = true;
        setTimeout(()=> joinBurstCooldown = false, 18000 + rand(12000));
      } else {
        if(Math.random() < 0.22) joinNow(1);
      }
    }catch(e){}
    const next = CONFIG.minJoinIntervalMs + Math.floor(Math.random()*(CONFIG.maxJoinIntervalMs - CONFIG.minJoinIntervalMs));
    joinTimer = setTimeout(_tick, next);
  }

  function start(){
    if(running) return;
    running = true; _tick(); safeLog('joiner started');
  }
  function stop(){
    running = false; if(joinTimer) clearTimeout(joinTimer); joinTimer = null; safeLog('joiner stopped');
  }
  function isRunning(){ return running; }

  const api = {
    start, stop, joinNow, isRunning,
    seedJoinersBetween,
    seedMarch14_2025: function(opts = { minPerDay: 1, maxPerDay: 4, chunkSize: 120 }){
      try{
        const s = new Date("2025-03-14T00:00:00Z");
        return seedJoinersBetween(s, new Date(), opts);
      }catch(e){ safeLog("seedMarch14_2025 failed", e); return Promise.resolve(0); }
    },
    getHistorySnapshot: function(){ return JOIN_HISTORY.slice().reverse().slice(0,200); },
    config: CONFIG
  };

  if(existing){
    Object.keys(api).forEach(k => { if(!existing[k]) existing[k] = api[k]; });
    window.joiner = existing;
    safeLog("joiner-simulator augmented existing joiner");
  } else {
    window.joiner = api;
    safeLog("joiner-simulator initialized");
  }

  window.joiner._debugSticker = function(){
    const p = genPersona();
    showJoinSticker(p, { stickerImage: CONFIG.stickerImage });
    return p;
  };

})();
