// identity-personas.js
// ============================================================
// ELITE HUMAN-LIKE PERSONA ENGINE v2 (drop-in, robust)
// - mixed avatar pool (local + remote)
// - unique avatar selection with persistence
// - unique name generation, de-duplicated
// - persona pool builder (chunked fill)
// - helper exports: Admin, getRandomPersona, generateHumanComment, getLastSeenStatus
// ============================================================

(function(){
  // ----------------- CONFIG & POOLS -----------------
  const Admin = {
    name: "Profit Hunter 🌐",
    avatar: "assets/admin.jpg",
    isAdmin: true,
    gender: "male",
    country: "GLOBAL",
    personality: "authority",
    tone: "direct",
    timezoneOffset: 0,
    memory: []
  };

  const COUNTRY_GROUPS = {
    US:"western", UK:"western", CA:"western", AU:"western",
    DE:"western", FR:"western", IT:"western", ES:"western",
    NL:"western", SE:"western", CH:"western", BE:"western",
    NG:"african", ZA:"african",
    IN:"asian", JP:"asian", KR:"asian",
    BR:"latin", MX:"latin",
    RU:"eastern"
  };
  const COUNTRIES = Object.keys(COUNTRY_GROUPS);

  const MALE_FIRST = ["Alex","John","Max","Leo","Sam","David","Liam","Noah","Ethan","James","Ryan","Michael","Daniel","Kevin","Oliver","William","Henry","Jack","Mason","Lucas","Elijah","Benjamin","Sebastian","Logan","Jacob","Wyatt","Carter","Julian","Luke","Isaac","Nathan","Aaron","Adrian","Victor","Caleb","Dominic","Xavier","Evan","Connor","Jason"];
  const FEMALE_FIRST = ["Maria","Lily","Emma","Zoe","Ivy","Sophia","Mia","Olivia","Ava","Charlotte","Amelia","Ella","Grace","Chloe","Hannah","Aria","Scarlett","Luna","Ruby","Sofia","Emily","Layla","Nora","Victoria","Aurora","Isabella","Madison","Penelope","Camila","Stella","Hazel","Violet","Savannah","Bella","Claire"];
  const LAST_NAMES = ["Smith","Johnson","Brown","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Garcia","Martinez","Robinson","Clark","Rodriguez","Lewis","Walker","Hall","Allen","Young","King","Wright","Scott","Green","Baker","Adams","Nelson","Hill","Campbell"];
  const CRYPTO_ALIASES = ["BlockKing","PumpMaster","CryptoWolf","FomoKing","Hodler","MoonWalker","TraderJoe","BitHunter","AltcoinAce","ChainGuru","DeFiLord","MetaWhale","CoinSniper","YieldFarmer","NFTDegen","ChartWizard","TokenShark","AirdropKing","WhaleHunter","BullRider"];
  const TITLES = ["Trader","Investor","HODLer","Analyst","Whale","Shark","Mooner","Scalper","SwingTrader","DeFi","Miner","Blockchain","NFT","Quant","Signals","Mentor"];
  
  // ----------------- Expanded Emoji Pool -----------------
  const EMOJIS = [
    "💸","🔥","💯","✨","😎","👀","📈","🚀","💰","🤑","🎯","🏆","🤖","🎉","🍀","📊","⚡","💎","👑","🦄","🧠","🔮","🪙","🥂","💡","🛸","📉","💲","📱","💬",
    "🤩","😇","😜","😏","🙌","👍","👎","🤝","🤔","😱","🥳","🤗","😤","😴","🤪","😬","😡","😭","😢","🤤","😳","🥺","🙃","😐","😶","🤐","😈","👻","💀","☠️",
    "🎃","🤡","🧩","🪄","🪅","🪆","🎁","🎀","🧸","🛡️","⚔️","🏹","🗡️","🪓","🪃","🏺","🛶","🚁","🛩️","🛰️","🚀","🛸","🛎️","🔔","🧭","🗺️","📜","📖","📚","📝","🖊️",
    "✒️","🖋️","📌","📍","🧷","📎","🖇️","🗂️","📁","🗃️","🗄️","💌","📫","📪","📬","📭","📮","🛍️","🛒","🎨","🖌️","🖍️","🩰","👑","👒","🎩","🧢","⛑️","🪖","👓","🕶️"
  ];

  // ----------------- Avatar pool & uniqueness helpers -----------------
  const MIXED_AVATAR_POOL = (function buildPool(){
    const pool = [];

    // local avatars: assets/avatars/avatar1.jpg ... avatar300.jpg
    for(let i=1;i<=300;i++){
      pool.push(`assets/avatars/avatar${i}.jpg`);
    }

    // online fallbacks
    pool.push(
      "https://i.pravatar.cc/300?img=3","https://i.pravatar.cc/300?img=5","https://i.pravatar.cc/300?img=7",
      "https://i.pravatar.cc/300?img=9","https://i.pravatar.cc/300?img=11","https://i.pravatar.cc/300?img=13",
      "https://i.pravatar.cc/300?img=15","https://i.pravatar.cc/300?img=17","https://i.pravatar.cc/300?img=19",
      "https://i.pravatar.cc/300?img=21",
      "https://randomuser.me/api/portraits/men/21.jpg","https://randomuser.me/api/portraits/women/22.jpg",
      "https://randomuser.me/api/portraits/men/30.jpg","https://randomuser.me/api/portraits/women/31.jpg",
      "https://picsum.photos/seed/alpha/300/300","https://picsum.photos/seed/bravo/300/300",
      "https://picsum.photos/seed/charlie/300/300","https://picsum.photos/seed/delta/300/300",
      "https://picsum.photos/seed/echo/300/300","https://picsum.photos/seed/foxtrot/300/300",
      "https://picsum.photos/seed/golf/300/300",
      "https://robohash.org/seed_1.png","https://robohash.org/seed_2.png","https://api.multiavatar.com/seed_one.png",
      "https://api.multiavatar.com/seed_two.png","https://api.dicebear.com/7.x/adventurer/svg?seed=ari",
      "https://api.dicebear.com/7.x/bottts/svg?seed=zek",
      "https://ui-avatars.com/api/?name=AA&background=random","https://ui-avatars.com/api/?name=BB&background=random",
      "https://ui-avatars.com/api/?name=CC&background=random",
      "https://source.unsplash.com/collection/365219/300x300?sig=1","https://source.unsplash.com/collection/365219/300x300?sig=2",
      "https://source.unsplash.com/collection/365219/300x300?sig=3","https://source.unsplash.com/collection/365219/300x300?sig=4",
      "https://picsum.photos/seed/zulu/300/300","https://picsum.photos/seed/yankee/300/300","https://picsum.photos/seed/xray/300/300"
    );

    return pool;
  })();

  const AVATAR_PERSIST_KEY = "abrox_used_avatars_v2";
  const UsedAvatarURLs = new Set();
  (function loadUsedAvs(){ 
    try{ 
      const raw = localStorage.getItem(AVATAR_PERSIST_KEY); 
      if(!raw) return; 
      const arr = JSON.parse(raw); 
      if(Array.isArray(arr)) arr.forEach(u => UsedAvatarURLs.add(u)); 
    }catch(e){ } 
  })();
  function saveUsedAvs(){ 
    try{ localStorage.setItem(AVATAR_PERSIST_KEY, JSON.stringify(Array.from(UsedAvatarURLs))); }catch(e){ } 
  }
  setInterval(saveUsedAvs, 1000*60*2);
  window.addEventListener("beforeunload", saveUsedAvs);

  function getUniqueAvatar(name){
    const pool = MIXED_AVATAR_POOL.slice();
    for(let i = pool.length - 1; i > 0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for(const url of pool){
      const sep = url.indexOf('?') === -1 ? '?' : '&';
      const candidate = `${url}${sep}v=${encodeURIComponent((name||'u').slice(0,3))}_${Math.floor(Math.random()*99999)}`;
      if(!UsedAvatarURLs.has(candidate)){
        UsedAvatarURLs.add(candidate);
        return candidate;
      }
    }
    const initials = encodeURIComponent((name||"U").split(" ").map(s=>s[0]||"").slice(0,2).join("") || "U");
    const ua = `https://ui-avatars.com/api/?name=${initials}&background=random&size=256&v=${Date.now()}`;
    UsedAvatarURLs.add(ua);
    return ua;
  }

  // ----------------- Name generator -----------------
  const UsedNames = new Set();
  function random(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function maybe(p){ return Math.random() < p; }
  function rand(max=9999){ return Math.floor(Math.random()*max); }

  function buildUniqueName(gender){
    let base;
    if(maybe(0.18)){
      base = random(CRYPTO_ALIASES) + (maybe(0.5)? " " + random(TITLES) : "");
      if(maybe(0.5)) base += " " + rand(999);
      if(maybe(0.4)) base += " " + random(EMOJIS);
    } else {
      base = (gender==="male"?random(MALE_FIRST):random(FEMALE_FIRST)) + " " + random(LAST_NAMES);
      if(maybe(0.45)) base += " " + random(TITLES);
      if(maybe(0.5)) base += " " + rand(999);
      if(maybe(0.45) && maybe(0.5)) base = base.replace(/\s+/g, "_");
      if(maybe(0.45)) base += " " + random(EMOJIS);
    }
    base = base.trim();
    let candidate = base;
    let guard = 0;
    while(UsedNames.has(candidate) && guard < 12){
      candidate = base + "_" + rand(99999);
      guard++;
    }
    UsedNames.add(candidate);
    return candidate;
  }

  // ----------------- Avatar builder -----------------
  function buildUniqueAvatar(name, gender){
    if(Math.random() < 0.4){
      const initials = encodeURIComponent((name||"U").split(" ").map(s=>s[0]||"").slice(0,2).join(""));
      return `https://ui-avatars.com/api/?name=${initials}&background=random&size=256&v=${Math.floor(Math.random()*99999)}`;
    }
    return getUniqueAvatar(name);
  }

  // ----------------- Persona pool -----------------
  const SyntheticPool = [];
  const TOTAL_PERSONAS = Math.max(400, Math.min((window.REALISM_CONFIG && window.REALISM_CONFIG.TOTAL_PERSONAS) || 2500, 20000));
  const INITIAL_SYNC = Math.min(600, Math.floor(TOTAL_PERSONAS * 0.25));

  for(let i=0;i<INITIAL_SYNC;i++){
    const gender = maybe(0.5) ? "male" : "female";
    const name = buildUniqueName(gender);
    SyntheticPool.push({
      name,
      avatar: buildUniqueAvatar(name, gender),
      isAdmin: false,
      gender,
      country: random(COUNTRIES),
      region: COUNTRY_GROUPS[random(COUNTRIES)] || "western",
      personality: random(["hype","analytical","casual","quiet","aggressive"]),
      tone: random(["short","normal","long"]),
      timezoneOffset: rand(24) - 12,
      rhythm: 0.5 + Math.random()*1.8,
      lastSeen: Date.now() - rand(6000000),
      memory: [],
      sentiment: random(["bullish","neutral","bearish"])
    });
  }

  (function fillRemaining(){
    const batch = 300;
    function batchFill(){
      const toDo = Math.min(batch, TOTAL_PERSONAS - SyntheticPool.length);
      for(let i=0;i<toDo;i++){
        const gender = maybe(0.5) ? "male" : "female";
        const name = buildUniqueName(gender);
        SyntheticPool.push({
          name,
          avatar: buildUniqueAvatar(name, gender),
          isAdmin: false,
          gender,
          country: random(COUNTRIES),
          region: COUNTRY_GROUPS[random(COUNTRIES)] || "western",
          personality: random(["hype","analytical","casual","quiet","aggressive"]),
          tone: random(["short","normal","long"]),
          timezoneOffset: rand(24) - 12,
          rhythm: 0.5 + Math.random()*1.8,
          lastSeen: Date.now() - rand(6000000),
          memory: [],
          sentiment: random(["bullish","neutral","bearish"])
        });
      }
      if(SyntheticPool.length < TOTAL_PERSONAS) setTimeout(batchFill, 120);
      else console.log("identity-personas: SyntheticPool fully built:", SyntheticPool.length);
    }
    setTimeout(batchFill, 120);
  })();

  // ----------------- Human comment engine -----------------
  function generateHumanComment(persona, baseText, targetName=null){
    let text = typeof baseText === "string" ? baseText : "Nice!";
    if(maybe(0.5)){
      const slangCount = rand(2) + 1;
      const slangWords = [];
      for(let i=0;i<slangCount;i++) slangWords.push(random((SLANG && SLANG[persona.region]) || ["nice"]));
      text = slangWords.join(" ") + " " + text;
    }
    if(persona.tone === "short") text = text.split(" ").slice(0,8).join(" ");
    if(persona.tone === "long") text += " honestly this looks strong if volume confirms.";
    if(maybe(0.18)) text += " " + random(EMOJIS);
    if(targetName && maybe(0.3)) text = "@" + targetName + " " + text;
    persona.memory = persona.memory || [];
    if(persona.memory.length > 300) persona.memory.shift();
    persona.memory.push(text);
    return text;
  }

  // ----------------- Last seen -----------------
  function getLastSeenStatus(persona){
    const diff = Date.now() - (persona && persona.lastSeen ? persona.lastSeen : Date.now());
    if(diff < 300000) return "online";
    if(diff < 3600000) return "last seen recently";
    if(diff < 86400000) return "last seen today";
    return "last seen long ago";
  }

  // ----------------- Exports -----------------
  function getRandomPersona(){ 
    return SyntheticPool.length ? SyntheticPool[Math.floor(Math.random()*SyntheticPool.length)] : { name:"Guest", avatar:"https://ui-avatars.com/api/?name=G" }; 
  }

  window.identity = window.identity || {};
  Object.assign(window.identity, {
    Admin,
    getRandomPersona,
    generateHumanComment,
    getLastSeenStatus,
    SyntheticPool,
    UsedAvatarURLs
  });

  console.log("identity-personas initialized — pool size:", SyntheticPool.length);
})();
