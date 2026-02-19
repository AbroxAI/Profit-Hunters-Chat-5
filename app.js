// app.js – full merged: chat + sticky pin banner + admin broadcast
(function(){
  // ---------- CONFIG ----------
  window.CONTACT_ADMIN_LINK ||= "https://t.me/ph_suppp";
  const HISTORY_PATH = window.HISTORY_PATH || "/history.json";
  const SEED_FLAG_KEY = "abrox_seeded_history_v1";
  const SEED_START_DATE = new Date("2025-03-14T00:00:00Z");
  const SEED_MIN_PER_DAY = 3;
  const SEED_MAX_PER_DAY = 6;
  const SEED_CHUNK_SIZE = 160;
  const COMMENTS_CONTAINER_ID = "tg-comments-container";
  const HEADER_META_EL = "tg-meta-line";

  // ---------- UTILS ----------
  const safeLog = (...args)=>{ try{ console.log(...args); }catch(e){} };
  const el = id => document.getElementById(id);
  const randInt = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;
  const rand = max=>Math.floor(Math.random()*max);
  const container = el(COMMENTS_CONTAINER_ID);
  const pinBanner = el("tg-pin-banner");

  // ---------- STATE ----------
  let pinnedMessage = null;
  window.MEMBER_COUNT ||= 864;
  window.ONLINE_COUNT ||= 86;
  let onlineTimer = null;

  // ---------- ONLINE COUNT ----------
  function updateMetaLine(){
    const meta = el(HEADER_META_EL);
    if(meta) meta.textContent = `${window.MEMBER_COUNT.toLocaleString()} members, ${window.ONLINE_COUNT.toLocaleString()} online`;
  }

  function simulateOnlineCount(min=60,max=340,baseMs=11000){
    if(onlineTimer) clearTimeout(onlineTimer);
    const next = Math.max(min, Math.min(max, Math.round((window.ONLINE_COUNT||((min+max)/2))*(0.88+Math.random()*0.26))));
    window.ONLINE_COUNT = next;
    updateMetaLine();
    onlineTimer = setTimeout(()=>simulateOnlineCount(min,max,baseMs), baseMs+Math.floor(Math.random()*baseMs));
  }

  // ---------- SERVER HISTORY ----------
  async function loadServerHistory(url=HISTORY_PATH){
    if(!window.BubbleRenderer && !window.TGRenderer) return safeLog("Renderer missing"), false;
    try{
      const res = await fetch(url,{cache:"no-store"});
      if(!res.ok) throw new Error(res.status);
      const msgs = await res.json();
      if(!Array.isArray(msgs)) throw new Error("invalid format");
      if(container) container.innerHTML = "";

      for(const m of msgs){
        const persona = { name:m.name, avatar:m.avatar };
        const opts = { timestamp:new Date(m.time||Date.now()), type:m.isOwn?"outgoing":(m.type==="system"?"system":"incoming"), image:m.image, caption:m.caption, id:m.id };
        try{
          if(window.BubbleRenderer?.renderMessages) window.BubbleRenderer.renderMessages([{ id:m.id, name:m.name, avatar:m.avatar, text:m.text, time:m.time, isOwn:m.isOwn, image:m.image, caption:m.caption }]);
          else if(window.TGRenderer?.appendMessage) window.TGRenderer.appendMessage(persona,m.text,opts);
        }catch(e){}
      }
      safeLog("loadServerHistory: loaded", msgs.length, "messages");

      // pinned messages
      const pinned = msgs.filter(x=>x.isPinned || x.type==="broadcast" || x.id==="broadcast_20250314");
      if(pinned?.length && window.PinBanner?.setPinned){
        const pins = pinned.map(p=>({ id:p.id, name:p.name, text:p.text, image:p.image||p.avatar, caption:p.caption, isAdmin:p.name?.toLowerCase().includes("profit hunter") }));
        window.PinBanner.setPinned(pins);
        pinnedMessage = pins[0]; // track first pinned
      }

      localStorage.setItem(SEED_FLAG_KEY,"1");
      return true;
    }catch(err){ safeLog("loadServerHistory failed", err); return false; }
  }

  // ---------- CLIENT SEEDER ----------
  async function seedFullHistory(opts={}){
    const startDate = opts.startDate?new Date(opts.startDate):SEED_START_DATE;
    const endDate = opts.endDate?new Date(opts.endDate):new Date();
    const minPerDay = typeof opts.minPerDay==="number"?opts.minPerDay:SEED_MIN_PER_DAY;
    const maxPerDay = typeof opts.maxPerDay==="number"?opts.maxPerDay:SEED_MAX_PER_DAY;
    const chunkSize = typeof opts.chunkSize==="number"?opts.chunkSize:SEED_CHUNK_SIZE;
    try{
      const days = Math.max(1, Math.ceil((endDate-startDate)/(1000*60*60*24)));
      let posted=0, batchCount=0;
      for(let d=0; d<days; d++){
        const day = new Date(startDate.getTime() + d*24*60*60*1000);
        const messagesThisDay = randInt(minPerDay,maxPerDay);
        for(let m=0; m<messagesThisDay; m++){
          const persona = window.identity?.getRandomPersona?.() || { name:"User"+rand(9999), avatar:`https://ui-avatars.com/api/?name=U${rand(99)}` };
          let text = "";
          try{ if(window.realism?._poolSnapshot) text = window.realism._poolSnapshot()[rand(Math.min(10, window.realism._poolSnapshot().length))]?.text || `Seeded chat ${d}-${m} ${rand(999)}`; }catch(e){}
          if(!text) text = `Seed message ${d+1}/${messagesThisDay} — ${rand(9999)}`;
          const ts = new Date(day.getTime() + Math.floor(Math.random()*24*60*60*1000));
          const optsMsg = { timestamp:ts, type:"incoming", id:`seed_${d}_${m}_${Date.now().toString(36)}${rand(9999)}` };
          try{
            if(window.TGRenderer?.appendMessage) window.TGRenderer.appendMessage(persona,text,optsMsg);
            else if(window.BubbleRenderer?.renderMessages) window.BubbleRenderer.renderMessages([{ id:optsMsg.id,name:persona.name,avatar:persona.avatar,text,time:ts.toISOString(),isOwn:false }]);
          }catch(e){}
          posted++; batchCount++;
          if(batchCount>=chunkSize){ await new Promise(r=>setTimeout(r,110)); batchCount=0; }
        }
      }
      localStorage.setItem(SEED_FLAG_KEY,"1");
      safeLog("seedFullHistory: posted", posted, "messages");
      return posted;
    }catch(e){ safeLog("seedFullHistory failed", e); return 0; }
  }
  window.seedFullHistory ||= seedFullHistory;

  // ---------- JOINER ----------
  const joiner = (() => {
    let running=false, joinTimer=null;
    const joinNow = (count=1)=>{
      for(let i=0;i<count;i++){
        const persona = window.identity?.getRandomPersona?.() || { name:"New"+rand(9999), avatar:`https://ui-avatars.com/api/?name=N${rand(99)}` };
        window.TGRenderer?.appendMessage({name:"System"}, `${persona.name} joined the group`, { timestamp:new Date(), type:"system" });
        setTimeout(()=> window.TGRenderer?.appendMessage(getAdminPersona(), `Welcome @${persona.name.split(" ")[0]} — verify using Contact Admin`, { timestamp:new Date(), type:"incoming" }), 600+rand(800));
        window.MEMBER_COUNT++;
        updateMetaLine();
      }
    };
    const _tick=()=>{
      if(!running) return;
      if(Math.random()<0.14) joinNow(randInt(1,2));
      joinTimer=setTimeout(_tick,6000+Math.floor(Math.random()*15000));
    };
    return { start:()=>{ if(!running){ running=true; _tick(); } }, stop:()=>{ running=false; clearTimeout(joinTimer); joinTimer=null; }, joinNow, isRunning:()=>running };
  })();
  window.joiner ||= joiner;

  // ---------- INPUT HANDLERS ----------
  function setupInputHandlers(){
    const input = el("tg-comment-input"), sendBtn=el("tg-send-btn"), camBtn=el("tg-camera-btn");
    if(!input) return safeLog("Input missing");
    const toggleSendCam = ()=>{
      const hasText = input.value?.trim()?.length>0;
      sendBtn?.classList.toggle("hidden",!hasText);
      camBtn?.classList.toggle("hidden",hasText);
    };
    input.addEventListener("input", toggleSendCam);
    input.addEventListener("keydown", e=>{
      if(e.key==="Enter"&&!e.shiftKey){
        e.preventDefault();
        if(input.value?.trim()){
          const text=input.value.trim(); input.value="";
          toggleSendCam();
          const persona={name:"You",avatar:null};
          window.TGRenderer?.appendMessage(persona,text,{timestamp:new Date(),type:"outgoing"});
          window.BubbleRenderer?.renderMessages?.([{ id:"manual_"+Date.now(), name:persona.name, avatar:persona.avatar, text, time:new Date().toISOString(), isOwn:true }]);
        }
      }
    });
    sendBtn?.addEventListener("click", ()=>{
      const text = input.value?.trim(); if(!text) return;
      input.value=""; toggleSendCam();
      const persona={name:"You",avatar:null};
      window.TGRenderer?.appendMessage(persona,text,{timestamp:new Date(),type:"outgoing"});
      window.BubbleRenderer?.renderMessages?.([{ id:"manual_"+Date.now(), name:persona.name, avatar:persona.avatar, text, time:new Date().toISOString(), isOwn:true }]);
    });
    toggleSendCam();
  }

  // ---------- PIN & BROADCAST ----------
  function getAdminPersona(){ return { name:"Profit Hunter 🌐", avatar:"assets/admin.jpg", isAdmin:true }; }

  function postAdminBroadcast(){
    const admin = getAdminPersona();
    const caption = `📌 Group Rules

- New members are read-only until verified
- Admins do NOT DM directly
- No screenshots in chat
- Ignore unsolicited messages

✅ To verify or contact admin, use the “Contact Admin” button below.`;
    const image = "assets/broadcast.jpg";
    const timestamp = new Date();
    const id = window.TGRenderer?.appendMessage(admin, caption.split("\n")[0], { timestamp, type:"incoming", image, caption }) || ("broadcast_"+Date.now().toString(36));
    pinnedMessage = { id, caption, image };
    setTimeout(()=>{
      const bubbleEl = container.querySelector(`[data-id="${id}"]`);
      if(bubbleEl){
        const content = bubbleEl.querySelector('.tg-bubble-content');
        const btn = document.createElement('button');
        btn.className='tg-glass-cta';
        btn.textContent='Contact Admin';
        btn.addEventListener('click',()=> window.open(CONTACT_ADMIN_LINK,'_blank'));
        content.appendChild(btn);
      }
    },120);
    return pinnedMessage;
  }

  function showPinBanner(){
    if(!pinBanner||!pinnedMessage) return;

    // ✅ sticky banner styling
    pinBanner.style.position = "sticky";
    pinBanner.style.top = "0";
    pinBanner.style.zIndex = "999";
    pinBanner.style.backgroundColor = "#fff";
    pinBanner.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
    pinBanner.style.display = "flex";
    pinBanner.style.alignItems = "center";
    pinBanner.style.padding = "10px";

    pinBanner.innerHTML="";
    const img=document.createElement("img");
    img.src=pinnedMessage.image||"assets/broadcast.jpg";
    img.style.height="36px";
    img.style.width="36px";
    img.style.borderRadius="50%";
    img.style.marginRight="8px";

    const txt=document.createElement("div");
    txt.className="pin-text"; 
    txt.textContent=pinnedMessage.caption.split("\n")[0]||"Pinned message";
    txt.style.flex="1";
    txt.style.fontWeight="600";

    const btn=document.createElement("button");
    btn.className="contact-admin-btn";
    btn.dataset.href=CONTACT_ADMIN_LINK;
    btn.innerHTML=`<i data-lucide="pin"></i><span style="margin-left:6px">Contact Admin</span>`;
    btn.addEventListener('click',e=>{ e.preventDefault(); window.open(CONTACT_ADMIN_LINK,'_blank'); });

    pinBanner.append(img,txt,btn);
    pinBanner.classList.remove('hide','hidden'); 
    void pinBanner.offsetWidth; 
    pinBanner.classList.add('show');
    if(window.lucide?.createIcons) window.lucide.createIcons();

    pinBanner.onclick = e => {
      e.stopPropagation();
      const target = container.querySelector(`[data-id="${pinnedMessage.id}"]`);
      if(target){ 
        target.scrollIntoView({behavior:'smooth',block:'center'}); 
        target.style.outline='3px solid rgba(255,215,0,0.85)'; 
        setTimeout(()=>target.style.outline='',2800); 
      } else container.scrollTo({top:container.scrollHeight,behavior:'smooth'});
    };
    // ✅ banner stays visible permanently — no auto-hide
  }

  function postPinNotice(){
    const systemPersona={name:"System",avatar:"assets/admin.jpg"};
    window.TGRenderer?.appendMessage(systemPersona,"Admin pinned a message",{ timestamp:new Date(), type:"incoming" });
  }

  // ---------- STARTUP ----------
  async function startApp(){
    updateMetaLine();
    setupInputHandlers();
    let loaded = false;
    try{ loaded = await loadServerHistory(HISTORY_PATH); }catch(e){ loaded=false; }
    if(!loaded && !localStorage.getItem(SEED_FLAG_KEY)){
      safeLog("No server history — seeding client history");
      window.seedFullHistory({ startDate:SEED_START_DATE, endDate:new Date(), minPerDay:SEED_MIN_PER_DAY, maxPerDay:SEED_MAX_PER_DAY, chunkSize:SEED_CHUNK_SIZE })
        .then(count=>safeLog("client seed finished:",count))
        .catch(e=>safeLog("seedFullHistory failed", e));
    }
    const broadcast = postAdminBroadcast();
    setTimeout(()=>{ postPinNotice(); showPinBanner(); }, 2200);
    try{ window.realism?.start?.(); }catch(e){}
    try{ window.joiner?.start?.(); }catch(e){}
    try{ simulateOnlineCount(86,320,11000); }catch(e){}
    safeLog("app started with pinned message:", broadcast.caption.split("\n")[0]);
  }

  document.addEventListener("DOMContentLoaded", startApp);
})();
