// joiner-simulator.js
// Responsible for joiner simulation, join stickers, seeding historical joiners,
// per-join system messages, sticker bursts, member-count bumps.
// Idempotent: augments existing window.joiner if present.
// ============================================================
(function(){
  // don't overwrite if exists — but augment
  const existing = window.joiner || null;

  // defensive: utilities
  function safeLog(...args){ try{ console.log.apply(console, args); }catch(e){} }
  function now(){ return new Date(); }
  function rand(max){ return Math.floor(Math.random()*max); }
  function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function el(id){ return document.getElementById(id); }

  // internal state
  let running = false;
  let joinTimer = null;
  let joinBurstCooldown = false;

  // configuration (tune these)
  const CONFIG = {
    minJoinIntervalMs: 4500,
    maxJoinIntervalMs: 22000,
    burstChance: 0.16,       // chance to create a small burst (2-6 joiners)
    burstMin: 2,
    burstMax: 6,
    stickerBurstThreshold: 3,// when join count in one event >= this show sticker burst
    stickerImage: "assets/join-sticker.png", // optional sticker asset if you host it
    persistKey: "abrox_join_history_v1",
    maxHistoryKeep: 2000
  };

  // persisted join history (IDs)
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
    try{
      localStorage.setItem(CONFIG.persistKey, JSON.stringify(JOIN_HISTORY.slice(-CONFIG.maxHistoryKeep)));
    }catch(e){}
  }
  window.addEventListener("beforeunload", saveJoinHistory);

  // helper to create a system join message and optional welcome bubble
  function postJoinPersona(persona){
    try{
      // system message
      const sysText = `${persona.name} joined the group`;
      if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
        window.TGRenderer.appendMessage({ name: "System" }, sysText, { timestamp: new Date(), type: "system" });
      } else if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
        window.BubbleRenderer.renderMessages([{ id: "sys_"+Date.now()+"_"+rand(9999), name:"System", avatar:null, text: sysText, time: new Date().toISOString(), isOwn:false, type:"system" }]);
      } else {
        safeLog("[joiner] sys:", sysText);
      }

      // small welcomed message (from admin/bot) after a short delay
      setTimeout(()=> {
        const adminPersona = { name: "Profit Hunter 🌐", avatar: "assets/admin.jpg" };
        const welcome = `Welcome @${persona.name.split(" ")[0]} — please verify using the Contact Admin button`;
        if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
          window.TGRenderer.appendMessage(adminPersona, welcome, { timestamp: new Date(), type: "incoming" });
        } else if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
          window.BubbleRenderer.renderMessages([{ id:"welcome_"+Date.now()+"_"+rand(9999), name: adminPersona.name, avatar: adminPersona.avatar, text: welcome, time: new Date().toISOString(), isOwn:false }]);
        } else safeLog("[joiner] welcome:", welcome);
      }, 600 + rand(900));

      // bump member count
      try{
        window.MEMBER_COUNT = (window.MEMBER_COUNT || 0) + 1;
        // update header meta if updateMetaLine exists
        if(window.App && typeof window.App.updateMetaLine === "function") window.App.updateMetaLine();
        else if(typeof window.updateMetaLine === "function") updateMetaLine();
      }catch(e){}

    }catch(e){
      safeLog("postJoinPersona error", e);
    }
  }

  // show a Telegram-like join sticker inside the chat (centered bubble with avatar + text)
  function showJoinSticker(persona, opts = { inline: true, stickerImage: CONFIG.stickerImage }){
    try{
      const container = document.getElementById("tg-comments-container");
      if(!container) return;
      const stickerWrap = document.createElement("div");
      stickerWrap.className = "tg-join-sticker-wrapper";
      const sticker = document.createElement("div");
      sticker.className = "tg-join-sticker";

      const left = document.createElement("div"); left.className = "tg-join-sticker-left";
      const avatar = document.createElement("img"); avatar.className = "tg-join-sticker-avatar";
      avatar.src = persona.avatar || (`https://ui-avatars.com/api/?name=${encodeURIComponent(persona.name||"U")}&background=random`);
      avatar.onerror = function(){ this.onerror = null; try{ this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent((persona.name||"U").split(" ").slice(0,2).join(" "))}&background=random`; }catch(e){ this.src = "https://picsum.photos/seed/j/48/48"; } };
      left.appendChild(avatar);

      const right = document.createElement("div"); right.className = "tg-join-sticker-right";
      const title = document.createElement("div"); title.className = "tg-join-sticker-title"; title.textContent = persona.name + " joined";
      const sub = document.createElement("div"); sub.className = "tg-join-sticker-sub"; sub.textContent = "Welcome to the group — check the pin for rules";
      right.appendChild(title); right.appendChild(sub);

      sticker.appendChild(left); sticker.appendChild(right);

      // optional sticker image on the right
      if(opts.stickerImage){
        const side = document.createElement("img"); side.className = "tg-join-sticker-image"; side.src = opts.stickerImage;
        side.onerror = function(){ this.style.display = "none"; };
        sticker.appendChild(side);
      }

      stickerWrap.appendChild(sticker);
      container.appendChild(stickerWrap);

      // scroll and fade animation
      container.scrollTop = container.scrollHeight;
      stickerWrap.style.opacity = 0;
      stickerWrap.style.transform = "translateY(6px)";
      requestAnimationFrame(()=>{ stickerWrap.style.transition = "all 280ms ease"; stickerWrap.style.opacity = 1; stickerWrap.style.transform = "translateY(0)"; });

      // remove sticker after a while
      setTimeout(()=>{ try{ if(stickerWrap && stickerWrap.parentNode) stickerWrap.parentNode.removeChild(stickerWrap); }catch(e){} }, 5200 + rand(2200));
    }catch(e){ safeLog("showJoinSticker error", e); }
  }

  // generate synthetic persona (use window.identity if available)
  function genPersona(){
    try{
      if(window.identity && typeof window.identity.getRandomPersona === "function"){
        const p = window.identity.getRandomPersona();
        // ensure name exists
        if(!p.name) p.name = "User" + rand(9999);
        return p;
      }
      // fallback
      const n = "User" + rand(99999);
      return { name: n, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=random` };
    }catch(e){
      return { name: "User" + rand(9999), avatar: `https://ui-avatars.com/api/?name=U${rand(99)}` };
    }
  }

  // main joinNow: create N joiners in sequence with slight delays (for realism)
  function joinNow(count = 1, opts = { showSticker: true }){
    try{
      const perDelay = 420 + rand(900);
      for(let i=0;i<count;i++){
        (function(i){
          setTimeout(()=>{
            const persona = genPersona();
            // record join in history
            try{ JOIN_HISTORY.push({ id: "j_"+Date.now()+"_"+rand(99999), name: persona.name, time: new Date().toISOString() }); if(JOIN_HISTORY.length > CONFIG.maxHistoryKeep) JOIN_HISTORY.shift(); saveJoinHistory(); }catch(e){}
            // post system join and welcome
            postJoinPersona(persona);
            // show join sticker only if count large enough or opts forced
            if(opts.showSticker && (count >= CONFIG.stickerBurstThreshold || i === Math.floor(count/2))){
              showJoinSticker(persona, { stickerImage: CONFIG.stickerImage });
            }
          }, i * perDelay);
        })(i);
      }
    }catch(e){ safeLog("joinNow failed", e); }
  }

  // seed historical joiners between two dates (chrono) — used to seed march14 history
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
          // append a system message with timestamp
          if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
            window.TGRenderer.appendMessage({ name: "System" }, `${persona.name} joined the group`, { timestamp: ts, type: "system" });
          } else if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
            window.BubbleRenderer.renderMessages([ { id: "seedjoin_"+d+"_"+i, name: "System", avatar: null, text: `${persona.name} joined the group`, time: ts.toISOString(), isOwn:false, type:"system" } ]);
          }
          // small welcome bubble
          if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
            window.TGRenderer.appendMessage({ name: "Profit Hunter 🌐", avatar: "assets/admin.jpg" }, `Welcome @${persona.name.split(" ")[0]} — verify using Contact Admin`, { timestamp: new Date(ts.getTime() + 60000), type: "incoming" });
          }
          // record
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

  // background tick that simulates join events
  function _tick(){
    if(!running) return;
    // occasional small burst
    if(Math.random() < CONFIG.burstChance && !joinBurstCooldown){
      const c = randInt(CONFIG.burstMin, CONFIG.burstMax);
      joinNow(c);
      joinBurstCooldown = true;
      setTimeout(()=> joinBurstCooldown = false, 18000 + rand(12000)); // cooldown
    } else {
      // normal single join sometimes
      if(Math.random() < 0.22) joinNow(1);
    }
    // schedule next tick
    const next = CONFIG.minJoinIntervalMs + Math.floor(Math.random()*(CONFIG.maxJoinIntervalMs - CONFIG.minJoinIntervalMs));
    joinTimer = setTimeout(_tick, next);
  }

  // start/stop functions
  function start(){
    if(running) return;
    running = true;
    _tick();
    safeLog("joiner started");
  }
  function stop(){
    running = false;
    if(joinTimer) clearTimeout(joinTimer);
    joinTimer = null;
    safeLog("joiner stopped");
  }
  function isRunning(){ return running; }

  // expose API (augment existing)
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

  // if an existing joiner exists, merge methods (do not overwrite start/stop if they exist)
  if(existing){
    // copy missing methods only
    Object.keys(api).forEach(k => { if(!existing[k]) existing[k] = api[k]; });
    // ensure global pointer is existing
    window.joiner = existing;
    safeLog("joiner-simulator augmented existing joiner");
  } else {
    window.joiner = api;
    safeLog("joiner-simulator initialized");
  }

  // expose a tiny debug call to show a sample sticker now
  window.joiner._debugSticker = function(){
    const p = genPersona();
    showJoinSticker(p, { stickerImage: CONFIG.stickerImage });
    return p;
  };

})();
