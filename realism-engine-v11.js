// realism-engine-v11.js
// ============================================================
// ULTRA-REALISM ENGINE V11 (expanded pools, stronger dedupe, persistence)
// - Large testimonial pool
// - Mixed result phrases + regional slang + emoji mixing
// - Persistent dedupe via localStorage
// - Pool refill, posting, reaction triggers
// - Exposes window.realism API
// ============================================================

(function(){
  // ---------- Config ----------
  const CONFIG = {
    initialSeedCount: 600,      // how many messages to generate immediately into pool
    minPoolSize: 400,          // refill when pool smaller than this
    targetPoolSize: 1200,      // refill target
    postIntervalBase: 8000,    // baseline ms between auto posts
    postIntervalJitter: 18000, // additional jitter
    reactionChance: 0.28,      // chance a post triggers replies
    repliesMax: 6,
    persistKey: "abrox_realism_v11_generated",
    persistMaxKeep: 5000,      // keep last n generated fingerprints in localStorage
  };

  // ---------- Helpers ----------
  function random(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function maybe(p){ return Math.random() < p; }
  function rand(max=9999){ return Math.floor(Math.random()*max); }

  // djb2 string hash (fast)
  function djb2Hash(str){
    let h = 5381;
    for(let i=0;i<str.length;i++){ h = ((h << 5) + h) + str.charCodeAt(i); h = h >>> 0; }
    return String(h);
  }

  // ---------- Pools & Assets ----------
  const ASSETS = ["EUR/USD","BTC/USD","ETH/USD","USD/JPY","GBP/USD","AUD/USD","US30","NAS100","GOLD","SILVER","NZD/USD","USD/CAD","EUR/JPY","SPX500","DOGE/USD"];
  const BROKERS = ["IQ Option","Binomo","Pocket Option","Deriv","Olymp Trade","Quotex","Spectre","Binary.com","OlympTrade VN"];
  const TIMEFRAMES = ["M1","M5","M15","M30","H1","H4","D1"];
  const RESULT_WORDS = [
    "green","red","profit","loss","win","missed entry","recovered","swing trade success","scalped nicely",
    "small win","big win","moderate loss","loss recovered","double profit","consistent profit","partial win",
    "micro win","entry late but profitable","stopped loss","hedged correctly","full green streak","partial loss",
    "tp hit","slipped to be late","closed in loss","nice scalp","good hedge","stopped out","missed TP","took profit",
    "broke even","perfect exit","swing winner","overnight hold profit","small dip but recovered","clean entry"
  ];

  // Large emoji pool (mix)
  const EMOJIS = ["💸","🔥","💯","✨","😎","👀","📈","🚀","💰","🤑","🎯","🏆","🤖","🎉","🍀","📊","⚡","💎","👑","🦄","🥂","💡","📉","🧠","🙏","🙌","😅","🤦","😬","🤝","✅","❌","🔒","🔓","📣","📢","📌","📎","🔔","⚠️","🟢","🔴"];

  // Expanded testimonial pool (diverse, many variants)
  const TESTIMONIALS = [
    "Made $450 in 2 hours using Abrox",
    "Closed 3 trades, all green today ✅",
    "Recovered a losing trade thanks to Abrox",
    "7 days straight of consistent profit 💹",
    "Abrox saved me from a $200 loss",
    "50% ROI in a single trading session 🚀",
    "Signal timing was perfect today",
    "Never had such accurate entries before",
    "My manual losses turned into profits using Abrox",
    "Day trading USD/JPY with this bot has been a game-changer",
    "Abrox alerts helped me scalp nicely this morning ✨",
    "Recovered yesterday’s loss in one trade",
    "Made $120 in micro trades this session",
    "Entry was late but still profitable 💹",
    "Hedged correctly thanks to bot signals",
    "Altcoin signals were on point today",
    "This bot reduces stress, makes trading predictable 😌",
    "Small wins add up over time, Abrox is legit",
    "Profitable even on low volume days",
    "Consistency over randomness, love it! ❤️",
    "Scalped 5 trades successfully today 🚀",
    "Stopped losing streak thanks to Abrox 🙏",
    "Abrox helped me avoid a $150 loss",
    "Signals were accurate 4/5 trades today",
    "Big green on EUR/USD thanks to bot 💰",
    "My trading confidence increased a lot",
    "Made $300 in under 3 hours",
    "Bot suggested perfect exit on USD/JPY",
    "Recovered losses from yesterday in one trade",
    "Abrox alerts saved me from market volatility 🌊",
    "Entry timing for BTC/USD was perfect",
    "Day trading made predictable thanks to Abrox",
    "Partial loss turned into full profit",
    "Consistent signals for 7 days straight",
    "Small green wins every session 💸",
    "Never manually traded this effectively before",
    "Abrox simplified scalping for me",
    "Profit on NAS100 was surprisingly easy",
    "Hedging strategy recommended worked perfectly",
    "My portfolio stayed in green today",
    "Accuracy is insane, never missed an entry",
    "Recovering losses has never been easier",
    "Macro and micro trades balanced perfectly",
    "Scalping signals were super fast and accurate",
    "This bot makes trading almost automatic",
    "All my trades were profitable today",
    "Abrox reduced stress during volatile sessions",
    "Late entry but still in green — amazing",
    "Missed the first entry, caught the second push",
    "Double TP hit on EUR/JPY, solid",
    "Small loss patched by next entry",
    "Hedged and escaped a red day",
    "Full green streak this week, can't complain",
    "Consistent small wins, compounding nicely",
    "Signals suit scalpers and swing traders",
    "Demo -> live transition was smooth",
    "50/50 day turned green thanks to advice",
    "Partial hedge saved a 300$ loss",
    "Small account grow to 5% today",
    "Signals helped me avoid a big news trap",
    "Very precise entries on M1 and M5",
    "Recovered my entire week's loss in one trade",
    "Placed hedge and closed in green",
    "Great on low volatility sessions",
    "Made $20 per micro scalp consistently today",
    "Pair: BTC/USD, H1 — perfect setup",
    "Made $95 quickly on US30 scalp",
    "Made back the loss in 2 trades",
    "Finally broke my losing streak",
    "TP and SL both sensible, love it",
    "Entry timing = Godlike today",
    "Signals fit my style — thank you",
    "Signal + manual exit = smooth profits",
    "Abrox gave me confidence to scale",
    "Never thought automation could be this good",
    "Made steady gains on EUR/USD this week",
    "Abrox last night recovered my red day",
    "Signals were 5/6 correct during session",
    "Great for newbies and pros alike",
    "I trust Abrox for quick scalps now",
    "Converted 50% of my manual losses",
    "Small pressure -> big green after signal",
    "Combined with TA, signals are lethal",
    "Best tool I've used for options signals",
    "Saved me from the midday dump",
    "Made my first $1000 month with Abrox",
    "Signal quality is improving weekly",
    "Perfect risk:reward setups today",
    "Signals were consistent across brokers",
    "Worked well across US30 and NAS100",
    "Amazing for high-volatility sessions",
    "Hedging suggestion recovered a trade",
    "Returned to green after 4 losses thanks to bot",
    "Abrox is my go-to signal source now",
    "Gained 12% on account in 3 days",
    "Solid returns without overtrading",
    "Signals are quick and actionable",
    "Excellent TP placements this week",
    "Made $60 off a micro scalp earlier",
    "Entry + exit timing was on-point",
    "Saved my swing trade already",
    "Highly recommend for demo testing first",
    "Small bankroll -> steady growth using Abrox",
    "Signal reliability improved drastically",
    "Good for both scalps and swings",
    "Made profit on EUR/CHF today",
    "Recovered from a bad news dip — thanks",
    "Made consistent green streaks this month",
    "Closed 100% green session today",
    "Signals helped my manual hedges work",
    "Abrox suggested perfect stop entries",
    "I trust the bot more each week"
  ];

  // Add some short reaction phrases and engagement snippets
  const ENGAGEMENT_PHRASES = [
    "Nice!", "GG", "Well played", "Solid", "On point", "Bet", "Respect", "No cap", "Nice one", "Legend",
    "Who else took it?", "What entry did you use?", "TP?", "SL?", "Where's the entry?", "Share chart", "Nice scalp",
    "This one was clean", "Any hedges?", "Marked the entry", "Love this", "Keep it coming", "🔥🔥🔥"
  ];

  // ---------- Internal state ----------
  const GENERATED_TEXTS_V11 = new Set();
  const GENERATED_HASHES = new Set();
  // load persisted fingerprints if available
  (function loadPersist(){
    try{
      const raw = localStorage.getItem(CONFIG.persistKey);
      if(raw){
        const arr = JSON.parse(raw);
        if(Array.isArray(arr)){
          arr.forEach(h => { if(h) GENERATED_HASHES.add(h); });
        }
      }
    }catch(e){}
  })();

  const LONG_TERM_POOL_V11 = []; // items: { persona, text, timestamp, id }

  // ---------- Small persona helper (fallback if identity not available) ----------
  function getRandomPersona(){
    if(window.identity && typeof window.identity.getRandomPersona === "function") return window.identity.getRandomPersona();
    // fallback synthetic persona
    const name = "User" + rand(9999);
    return { name, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random` };
  }

  // ---------- Text generation utilities ----------
  // small slang sets (if identity.SLANG exists, engine will use it)
  const DEFAULT_SLANG = {
    western: ["bro","ngl","lowkey","fr","tbh","wild","bet","dope","lit","clutch","savage","hype","flex","mad","cap","no cap","real talk","yo","fam"],
    african: ["my guy","omo","chai","no wahala","gbam","yawa","sweet","jollof","palava","chop","fine boy","hustle","ehen","kolo","sisi","big man"],
    asian: ["lah","brother","steady","respect","solid one","ok lah","si","good move","ganbatte","wa","neat","ke","nice one","yah"],
    latin: ["amigo","vamos","muy bueno","dale","epa","buenisimo","chevere","vamo","oye","mano","buena","olé"],
    eastern: ["comrade","strong move","not bad","serious play","da","top","okey","nu","excellent","good work","bravo","fine"]
  };

  function pickSlang(region){
    try{
      if(window.identity && window.identity.SLANG && window.identity.SLANG[region]) return random(window.identity.SLANG[region]);
    }catch(e){}
    return random(DEFAULT_SLANG[region] || DEFAULT_SLANG.western);
  }

  function safeNow(offsetHours=0){
    const d = new Date();
    if(offsetHours) d.setHours(d.getHours()+offsetHours);
    return d;
  }

  // compose a message with templates
  function composeMessage(persona){
    const asset = random(ASSETS);
    const broker = random(BROKERS);
    const timeframe = random(TIMEFRAMES);
    const result = random(RESULT_WORDS);
    const testimonial = random(TESTIMONIALS);
    // mix patterns
    const patterns = [
      () => `${testimonial} ${random(EMOJIS)}`,
      () => `Anyone trading ${asset} on ${broker} ${timeframe}?`,
      () => `Signal for ${asset} ${timeframe} is ${result}`,
      () => `${persona.name.split(" ")[0]}: ${testimonial}`,
      () => `${pickSlang(persona.region||"western")} ${testimonial}`,
      () => `Took ${asset} ${timeframe} — ${result} ${random(EMOJIS)}`,
      () => `Scalped ${asset} on ${broker}, result: ${result}`,
      () => `${testimonial} — ${asset} ${timeframe}`,
      () => `Entry missed but ${testimonial}`,
      () => `Testimonial: ${testimonial}`,
      () => `${random(ENGAGEMENT_PHRASES)} ${testimonial}`
    ];
    // choose template and build text
    let text = random(patterns)();
    // occasionally add 1–3 extra emojis
    if(maybe(0.55)){
      const ecount = Math.floor(Math.random()*3);
      for(let i=0;i<ecount;i++) text += " " + random(EMOJIS);
    }
    // small typos occasionally (rare)
    if(maybe(0.12)){
      text = text.replace(/\b(\w{5,})\b/g, (m) => (maybe(0.5) ? m.slice(0, m.length-1) : m));
    }
    return text;
  }

  // ---------- Dedupe & persist helpers ----------
  function isDuplicate(text){
    try{
      const key = djb2Hash(String(text || "").substring(0,320));
      if(GENERATED_HASHES.has(key)) return true;
      return false;
    }catch(e){ return false; }
  }
  function markGenerated(text){
    try{
      const key = djb2Hash(String(text || "").substring(0,320));
      GENERATED_HASHES.add(key);
      // persist trimmed array
      const arr = Array.from(GENERATED_HASHES).slice(-CONFIG.persistMaxKeep);
      try{ localStorage.setItem(CONFIG.persistKey, JSON.stringify(arr)); }catch(e){}
    }catch(e){}
  }

  // ---------- Generate single trading comment ----------
  function generateTradingCommentV11(){
    const persona = getRandomPersona();
    let text = composeMessage(persona);

    // Avoid near-duplicates by checking against GENERATED_HASHES and GENERATED_TEXTS_V11
    let attempts = 0;
    while((isDuplicate(text) || GENERATED_TEXTS_V11.has(text)) && attempts < 30){
      text = composeMessage(persona) + " " + rand(999);
      attempts++;
    }
    // final safety
    if(GENERATED_TEXTS_V11.has(text)) text += " " + Date.now().toString(36).slice(-4);

    GENERATED_TEXTS_V11.add(text);
    markGenerated(text);

    return { persona, text, timestamp: safeNow() };
  }

  // ---------- Pool management ----------
  function ensurePoolV11(minSize = CONFIG.minPoolSize){
    try{
      while(LONG_TERM_POOL_V11.length < minSize){
        const item = generateTradingCommentV11();
        // idempotent id
        item.id = "r_" + Date.now() + "_" + rand(9999);
        LONG_TERM_POOL_V11.push(item);
      }
    }catch(e){ console.warn("ensurePoolV11 error", e); }
  }

  function refillToTarget(){
    try{
      const need = Math.max(0, CONFIG.targetPoolSize - LONG_TERM_POOL_V11.length);
      for(let i=0;i<need;i++){ const it = generateTradingCommentV11(); it.id = "r_" + Date.now() + "_" + rand(9999); LONG_TERM_POOL_V11.push(it); }
    }catch(e){ console.warn("refillToTarget error", e); }
  }

  // Seed initial pool
  (function initialSeed(){
    try{
      for(let i=0;i<Math.max(40, Math.min(CONFIG.initialSeedCount, 2000)); i++){
        const it = generateTradingCommentV11();
        it.id = "r_seed_" + i + "_" + Date.now().toString(36);
        LONG_TERM_POOL_V11.push(it);
      }
      // schedule async refill a bit later to reach target without blocking
      setTimeout(refillToTarget, 200);
    }catch(e){ console.warn("initialSeed error", e); }
  })();

  // ---------- Posting logic ----------
  let realismTimer = null;
  let _started = false;

  function postFromPoolV11(count = 1){
    try{
      ensurePoolV11(50); // small safeguard
      for(let i=0;i<count;i++){
        if(LONG_TERM_POOL_V11.length === 0) { ensurePoolV11(20); if(LONG_TERM_POOL_V11.length === 0) break; }
        const item = LONG_TERM_POOL_V11.shift();
        // render via TGRenderer
        const persona = item.persona || getRandomPersona();
        const text = item.text || "";
        const ts = item.timestamp || safeNow();
        try{
          if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
            window.TGRenderer.appendMessage(persona, text, { timestamp: ts, type: "incoming", id: item.id });
          } else {
            // fallback: console output to avoid silent failure
            console.log("[realism post]", persona.name, text);
          }
        }catch(e){ console.warn("postFromPoolV11 append error", e); }

        // sometimes trigger reactions (replies)
        if(maybe(CONFIG.reactionChance)){
          triggerTrendingReactionV11(item.id, text);
        }
      }
    }catch(e){ console.warn("postFromPoolV11 error", e); }
  }

  function triggerTrendingReactionV11(baseId, baseText){
    if(!baseText) return;
    const repliesCount = Math.min(CONFIG.repliesMax, 1 + rand(4));
    for(let i=0;i<repliesCount;i++){
      setTimeout(()=>{
        try{
          const comment = generateTradingCommentV11();
          // avoid replying with exact same text
          if(isDuplicate(comment.text)) return;
          // post reply as incoming with replyToText
          if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
            window.TGRenderer.appendMessage(comment.persona, comment.text, { timestamp: safeNow(), type: "incoming", replyToText: baseText });
          } else console.log("[realism reply]", comment.persona.name, comment.text);
        }catch(e){}
      }, 600*(i+1) + rand(800));
    }
  }

  // continuous posting scheduler
  function _tick(){
    try{
      // post 1 message normally
      postFromPoolV11(1);
      // occasionally post a burst
      if(maybe(0.12)) postFromPoolV11(1 + Math.floor(Math.random()*3));
      // refill if needed
      if(LONG_TERM_POOL_V11.length < CONFIG.minPoolSize) setTimeout(refillToTarget, 200);
    }catch(e){ console.warn("realism tick error", e); }

    // schedule next tick
    const base = CONFIG.postIntervalBase;
    const jitter = Math.floor(Math.random() * CONFIG.postIntervalJitter);
    realismTimer = setTimeout(_tick, base + jitter);
  }

  function startRealism(){
    if(_started) return;
    _started = true;
    // ensure initial pool
    ensurePoolV11(Math.max(CONFIG.minPoolSize, 200));
    // start tick after slight delay
    setTimeout(()=> { _tick(); }, 400 + Math.floor(Math.random()*1000));
    console.log("realism engine started");
  }

  function stopRealism(){
    if(realismTimer) clearTimeout(realismTimer);
    realismTimer = null;
    _started = false;
    console.log("realism engine stopped");
  }

  // ---------- Public API ----------
  window.realism = window.realism || {};
  Object.assign(window.realism, {
    start: startRealism,
    stop: stopRealism,
    postFromPool: postFromPoolV11,
    triggerTrendingReaction: triggerTrendingReactionV11,
    ensurePool: ensurePoolV11,
    refill: refillToTarget,
    seedNow: function(n=200){
      try{
        for(let i=0;i<n;i++){ const it = generateTradingCommentV11(); it.id = "r_manual_" + i + "_" + Date.now().toString(36); LONG_TERM_POOL_V11.push(it); }
        console.log("seedNow added", n, "items to pool");
      }catch(e){ console.warn("seedNow error", e); }
    },
    status: function(){ return { started: _started, poolSize: LONG_TERM_POOL_V11.length, generatedHashes: GENERATED_HASHES.size }; },
    // lower-level access (read-only copy)
    _poolSnapshot: function(){ return LONG_TERM_POOL_V11.slice(0,200); },
  });

  // Auto-start if TGRenderer present
  if(window.TGRenderer && typeof window.TGRenderer.appendMessage === "function"){
    // start after a short delay to let other scripts initialize
    setTimeout(()=>{ try{ startRealism(); }catch(e){} }, 700);
  }

  // Expose a one-off debug helper to clear persist (useful while testing)
  window.realism._clearPersist = function(){
    try{ localStorage.removeItem(CONFIG.persistKey); GENERATED_HASHES.clear(); console.log("realism persist cleared"); }catch(e){ console.warn("clearPersist failed", e); }
  };

  console.log("realism-engine-v11 initialized — pool:", LONG_TERM_POOL_V11.length);
})();
