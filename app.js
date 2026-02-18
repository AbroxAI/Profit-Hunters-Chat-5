// app.js
// Main application glue: history loader / seeder, joiner simulator, online count,
// input handling, pin banner integration, contact admin link.
// Defensive: checks for window.BubbleRenderer, window.TGRenderer, window.identity, window.realism.
// ============================================================

(function(){
  // ---------- CONFIG ----------
  window.CONTACT_ADMIN_LINK = window.CONTACT_ADMIN_LINK || "https://t.me/ph_suppp";
  const HISTORY_PATH = window.HISTORY_PATH || "/history.json"; // adjust if site in subfolder
  const SEED_FLAG_KEY = "abrox_seeded_history_v1";
  const SEED_START_DATE = new Date("2025-03-14T00:00:00Z");
  const SEED_MIN_PER_DAY = 3;
  const SEED_MAX_PER_DAY = 6;
  const SEED_CHUNK_SIZE = 160; // yield after this many messages to keep UI responsive
  const HEADER_META_EL = "tg-meta-line";
  const COMMENTS_CONTAINER_ID = "tg-comments-container";

  // ---------- Utility helpers ----------
  function safeLog(...args){ try{ console.log.apply(console, args); }catch(e){} }
  function el(id){ return document.getElementById(id); }
  function now(){ return new Date(); }
  function randInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
  function rand(max){ return Math.floor(Math.random()*max); }
  function pad(n){ return n < 10 ? "0"+n : String(n); }

  // ---------- Online count simulator ----------
  window.MEMBER_COUNT = window.MEMBER_COUNT || 864; // baseline members (configurable)
  window.ONLINE_COUNT = window.ONLINE_COUNT || 86;  // baseline online
  let onlineTimer = null;

  function updateMetaLine(){
    const meta = el(HEADER_META_EL);
    if(!meta) return;
    try{
      meta.textContent = `${(window.MEMBER_COUNT||0).toLocaleString()} members, ${(window.ONLINE_COUNT||0).toLocaleString()} online`;
    }catch(e){}
  }

  function simulateOnlineCount(min=60, max=340, baseMs=11000){
    if(onlineTimer) clearTimeout(onlineTimer);
    // random walk-ish update
    const next = Math.max(min, Math.min(max, Math.round((window.ONLINE_COUNT || ((min+max)/2)) * (0.88 + Math.random()*0.26))));
    window.ONLINE_COUNT = next;
    updateMetaLine();
    const jitter = Math.floor(Math.random()*baseMs);
    onlineTimer = setTimeout(()=> simulateOnlineCount(min, max, baseMs), baseMs + jitter);
  }

  // ---------- Server history loader ----------
  async function loadServerHistory(url = HISTORY_PATH){
    try{
      if(!window.BubbleRenderer && !window.TGRenderer){
        safeLog("loadServerHistory: renderer missing, abort");
        return false;
      }
      const res = await fetch(url, { cache: "no-store" });
      if(!res.ok) throw new Error("history fetch failed: " + res.status);
      const msgs = await res.json();
      if(!Array.isArray(msgs)) throw new Error("history format invalid");
      // clear container
      const c = el(COMMENTS_CONTAINER_ID); if(c) c.innerHTML = "";
      // render chronologically
      for(let i=0;i<msgs.length;i++){
        const m = msgs[i];
        try{
          const persona = { name: m.name, avatar: m.avatar };
          const opts = { timestamp: new Date(m.time || m.time || Date.now()), type: m.isOwn ? "outgoing" : (m.type === "system" ? "system" : "incoming"), image: m.image, caption: m.caption, id: m.id };
          if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
            // BubbleRenderer expects an array -> use renderMessages with single item for consistent behavior
            window.BubbleRenderer.renderMessages([ { id: m.id, name: m.name, avatar: m.avatar, text: m.text, time: m.time, isOwn: m.isOwn, image: m.image, caption: m.caption } ]);
          } else if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
            window.TGRenderer.appendMessage(persona, m.text, opts);
          }
        }catch(e){ /* continue */ }
      }
      safeLog("loadServerHistory: loaded messages:", msgs.length);
      // if there are pinned messages in the history, find them and set pin banner
      try{
        const pinned = msgs.filter(x => x.isPinned || x.type === "broadcast" || x.id === "broadcast_20250314");
        if(pinned && pinned.length){
          const pins = pinned.map(p => ({ id: p.id, name: p.name, text: p.text, image: p.image || p.avatar, caption: p.caption, isAdmin: (p.name && p.name.toLowerCase().includes("profit hunter")) }));
          if(window.PinBanner && typeof window.PinBanner.setPinned === "function") window.PinBanner.setPinned(pins);
        }
      }catch(e){}
      // mark that this browser has history seeded (so it doesn't re-seed client-side)
      try{ localStorage.setItem(SEED_FLAG_KEY, "1"); }catch(e){}
      return true;
    }catch(err){
      safeLog("loadServerHistory failed:", err);
      return false;
    }
  }

  // ---------- Client-side chunked seeder: seedFullHistory ----------
  async function seedFullHistory(opts = {}){
    const startDate = opts.startDate ? new Date(opts.startDate) : SEED_START_DATE;
    const endDate = opts.endDate ? new Date(opts.endDate) : new Date();
    const minPerDay = typeof opts.minPerDay === "number" ? opts.minPerDay : SEED_MIN_PER_DAY;
    const maxPerDay = typeof opts.maxPerDay === "number" ? opts.maxPerDay : SEED_MAX_PER_DAY;
    const chunkSize = typeof opts.chunkSize === "number" ? opts.chunkSize : SEED_CHUNK_SIZE;

    try{
      // check heavy op guard
      const days = Math.max(1, Math.ceil((endDate - startDate) / (1000*60*60*24)));
      let posted = 0;
      let batchCount = 0;
      for(let d=0; d<days; d++){
        const day = new Date(startDate.getTime() + d*24*60*60*1000);
        const messagesThisDay = randInt(minPerDay, maxPerDay);
        for(let m=0;m<messagesThisDay;m++){
          const persona = (window.identity && typeof window.identity.getRandomPersona === "function") ? window.identity.getRandomPersona() : { name: "User"+rand(9999), avatar: `https://ui-avatars.com/api/?name=U${rand(99)}` };
          // try to re-use realism.composeMessage if available
          let text = "";
          try{
            if(window.realism && typeof window.realism._poolSnapshot === "function"){
              // generate a small instant comment
              text = (window.realism._poolSnapshot()[Math.floor(Math.random()*Math.min(10, window.realism._poolSnapshot().length))] || {}).text || (`Seeded chat ${d}-${m} ${rand(999)}`);
            }
          }catch(e){}
          if(!text) text = `Seed message ${d+1}/${messagesThisDay} — ${rand(9999)}`;
          // timestamp randomized in day
          const ts = new Date(day.getTime() + Math.floor(Math.random()*24*60*60*1000));
          const opts = { timestamp: ts, type: "incoming", id: `seed_${d}_${m}_${Date.now().toString(36)}${rand(9999)}` };
          try{
            if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
              window.TGRenderer.appendMessage(persona, text, opts);
            } else if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
              window.BubbleRenderer.renderMessages([ { id: opts.id, name: persona.name, avatar: persona.avatar, text, time: ts.toISOString(), isOwn:false } ]);
            }
          }catch(e){ /* ignore individual failures */ }

          posted++; batchCount++;
          if(batchCount >= chunkSize){
            // yield to the UI
            await new Promise(r => setTimeout(r, 110));
            batchCount = 0;
          }
        }
      }
      safeLog("seedFullHistory: posted messages:", posted);
      // mark seed flag
      try{ localStorage.setItem(SEED_FLAG_KEY, "1"); }catch(e){}
      return posted;
    }catch(e){
      safeLog("seedFullHistory failed", e);
      return 0;
    }
  }

  // Expose seedFullHistory
  window.seedFullHistory = window.seedFullHistory || function(opts){ return seedFullHistory(opts); };

  // ---------- Joiner simulator ----------
  const joiner = (function(){
    let running = false;
    let joinTimer = null;
    function joinNow(count = 1){
      try{
        for(let i=0;i<count;i++){
          const persona = (window.identity && typeof window.identity.getRandomPersona === "function") ? window.identity.getRandomPersona() : { name: "New" + rand(9999), avatar: `https://ui-avatars.com/api/?name=N${rand(99)}` };
          // system join message
          const sysText = `${persona.name} joined the group`;
          if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
            window.TGRenderer.appendMessage({ name: "System" }, sysText, { timestamp: new Date(), type: "system" });
          }
          // small welcome message from admin or bot
          setTimeout(()=> {
            if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
              window.TGRenderer.appendMessage({ name: "Profit Hunter 🌐", avatar: "assets/admin.jpg" }, `Welcome @${persona.name.split(" ")[0]} — please verify using Contact Admin`, { timestamp: new Date(), type: "incoming" });
            }
          }, 600 + rand(800));
          // bump member count
          window.MEMBER_COUNT = (window.MEMBER_COUNT || 0) + 1;
          updateMetaLine();
        }
      }catch(e){ safeLog("joinNow error", e); }
    }
    function _tick(){
      if(!running) return;
      // simulate 0..2 joiners occasionally
      if(Math.random() < 0.14){
        joinNow(randInt(1,2));
      }
      const next = 6000 + Math.floor(Math.random()*15000);
      joinTimer = setTimeout(_tick, next);
    }
    function start(){
      if(running) return; running = true; _tick();
    }
    function stop(){
      running = false; if(joinTimer) clearTimeout(joinTimer); joinTimer = null;
    }
    function isRunning(){ return running; }
    return { start, stop, joinNow, isRunning };
  })();
  window.joiner = window.joiner || joiner;

  // ---------- Input & UI interactions ----------
  function setupInputHandlers(){
    try{
      const input = el("tg-comment-input");
      const sendBtn = el("tg-send-btn");
      const camBtn = el("tg-camera-btn");
      if(!input) { safeLog("setupInputHandlers: input not found"); return; }

      function toggleSendCam(){
        const hasText = input.value && input.value.trim().length > 0;
        if(sendBtn) sendBtn.classList.toggle("hidden", !hasText);
        if(camBtn) camBtn.classList.toggle("hidden", hasText); // hide camera when typing
      }
      input.addEventListener("input", toggleSendCam);
      // Enter to send
      input.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" && !e.shiftKey){
          e.preventDefault();
          if(input.value && input.value.trim()){
            const text = input.value.trim();
            input.value = "";
            toggleSendCam();
            // append outgoing message
            const persona = { name: "You", avatar: null };
            if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
              window.TGRenderer.appendMessage(persona, text, { timestamp: new Date(), type: "outgoing" });
            } else if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
              window.BubbleRenderer.renderMessages([ { id: "manual_"+Date.now(), name: persona.name, avatar: persona.avatar, text, time: new Date().toISOString(), isOwn:true } ]);
            }
            // optional: notify realism engine to trigger reactions
            try{ if(window.realism && typeof window.realism.triggerTrendingReaction === "function") window.realism.triggerTrendingReaction(null, text); }catch(e){}
          }
        }
      });
      if(sendBtn){
        sendBtn.addEventListener("click", ()=>{
          const text = input.value && input.value.trim();
          if(!text) return;
          input.value = ""; toggleSendCam();
          const persona = { name: "You", avatar: null };
          if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
            window.TGRenderer.appendMessage(persona, text, { timestamp: new Date(), type: "outgoing" });
          } else if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
            window.BubbleRenderer.renderMessages([ { id: "manual_"+Date.now(), name: persona.name, avatar: persona.avatar, text, time: new Date().toISOString(), isOwn:true } ]);
          }
          try{ if(window.realism && typeof window.realism.triggerTrendingReaction === "function") window.realism.triggerTrendingReaction(null, text); }catch(e){}
        });
      }
      toggleSendCam();
    }catch(e){ safeLog("setupInputHandlers failed", e); }
  }

  // ---------- Pin broadcast helper: append admin broadcast and set pin banner ----------
  function postAdminBroadcast({ image = "assets/broadcast.jpg", caption = null, time = new Date() } = {}){
    try{
      const persona = { name: "Profit Hunter 🌐", avatar: "assets/admin.jpg", isAdmin: true };
      const text = caption && caption.split("\n")[0] ? caption.split("\n")[0] : "Broadcast";
      const id = "broadcast_" + Date.now().toString(36);
      if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
        window.TGRenderer.appendMessage(persona, text, { timestamp: time, type: "outgoing", id, image, caption });
      } else if(window.BubbleRenderer && typeof window.BubbleRenderer.renderMessages === "function"){
        window.BubbleRenderer.renderMessages([ { id, name: persona.name, avatar: persona.avatar, text, time: time.toISOString(), isOwn:true, image, caption } ]);
      }
      // set pin banner
      try{
        if(window.PinBanner && typeof window.PinBanner.setPinned === "function"){
          window.PinBanner.setPinned([{ id, name: persona.name, text, image, caption, isAdmin:true }]);
        }
      }catch(e){}
      return id;
    }catch(e){ safeLog("postAdminBroadcast failed", e); return null; }
  }

  // ---------- Startup sequence ----------
  async function startApp(){
    // update header immediately
    updateMetaLine();
    // setup input handlers right away
    setupInputHandlers();

    // try server history first
    let loaded = false;
    try{
      loaded = await loadServerHistory(HISTORY_PATH);
    }catch(e){ loaded = false; }

    // if server history not available and not previously seeded in this browser, run client seeder
    if(!loaded){
      const seededFlag = (function(){ try{ return !!localStorage.getItem(SEED_FLAG_KEY); }catch(e){ return false; } })();
      if(!seededFlag){
        safeLog("No server history — seeding client history from", SEED_START_DATE.toISOString());
        // run seeder but don't block UI; we seed in the background
        window.seedFullHistory({ startDate: SEED_START_DATE, endDate: new Date(), minPerDay: SEED_MIN_PER_DAY, maxPerDay: SEED_MAX_PER_DAY, chunkSize: SEED_CHUNK_SIZE })
          .then(count => safeLog("client seed finished, messages:", count))
          .catch(e => safeLog("seedFullHistory failed", e));
      } else {
        safeLog("client previously seeded; skipping seeder");
      }
    }

    // start realism engine if available
    try{
      if(window.realism && typeof window.realism.start === "function"){
        window.realism.start();
      }
    }catch(e){ safeLog("starting realism failed", e); }

    // start joiner simulator
    try{ if(window.joiner && typeof window.joiner.start === "function") window.joiner.start(); }catch(e){}

    // start online count simulation
    try{ simulateOnlineCount(86, 320, 11000); }catch(e){}

    // final lucide call if present to render icons
    try{ if(window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons(); }catch(e){}
    safeLog("app started");
  }

  // Run startup on DOM ready
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", startApp);
  else setTimeout(startApp, 0);

  // ---------- Expose utilities for console/debugging ----------
  window.App = window.App || {};
  Object.assign(window.App, {
    loadServerHistory,
    seedFullHistory,
    simulateOnlineCount,
    postAdminBroadcast,
    updateMetaLine,
    CONTACT_ADMIN_LINK: window.CONTACT_ADMIN_LINK
  });

  // ---------- Small dev convenience: seed march14 2025 ----------
  window.App.seedMarch14_2025 = function(){
    try{
      const s = new Date("2025-03-14T00:00:00Z");
      return window.seedFullHistory({ startDate: s, endDate: new Date(), minPerDay: SEED_MIN_PER_DAY, maxPerDay: SEED_MAX_PER_DAY, chunkSize: SEED_CHUNK_SIZE });
    }catch(e){ safeLog("seedMarch14_2025 failed", e); return Promise.resolve(0); }
  };

})();
