// bubble-renderer.js
// Responsible for rendering messages, system messages, reply previews, date separators,
// jump indicator behavior, typing indicator, and lucide icon re-rendering.
// Defensive: guarded against missing DOM, missing window.lucide, and missing TGRenderer.
// ============================================================

(function(){
  function init(){
    const container = document.getElementById("tg-comments-container");
    const jumpIndicator = document.getElementById("tg-jump-indicator");
    const jumpText = document.getElementById("tg-jump-text");
    const metaLine = document.getElementById("tg-meta-line");
    const pinBanner = document.getElementById("tg-pin-banner");

    if(!container){
      console.error("bubble-renderer: #tg-comments-container not found — renderer exiting");
      return;
    }

    // Internal state
    let lastMessageDateKey = null;
    let unseenCount = 0;
    const MESSAGE_MAP = new Map(); // id -> { el, text }

    // Helpers
    function formatTime(date){
      try{
        const d = new Date(date);
        return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      }catch(e){ return ""; }
    }
    function formatDateKey(date){
      const d = new Date(date);
      return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }

    function insertDateSticker(dateObj){
      try{
        const key = formatDateKey(dateObj);
        if(key === lastMessageDateKey) return;
        lastMessageDateKey = key;
        const sticker = document.createElement("div");
        sticker.className = "tg-date-sticker";
        sticker.textContent = (new Date(dateObj)).toLocaleDateString([], {year:'numeric', month:'short', day:'numeric'});
        container.appendChild(sticker);
      }catch(e){ console.warn("insertDateSticker failed", e); }
    }

    // Typing indicator in header meta area
    function showTypingInHeader(names){
      if(!metaLine) return;
      try{
        metaLine.style.opacity = "0.95";
        metaLine.style.color = "#b9c7d8";
        const text = names.length > 2 ? `${names.slice(0,2).join(", ")} and others are typing...` : (names.join(" ") + (names.length>1?" are typing...":" is typing..."));
        metaLine.textContent = text;
        // restore after 1-3s
        setTimeout(()=> {
          if(metaLine) metaLine.textContent = `${(window.MEMBER_COUNT||0).toLocaleString()} members, ${(window.ONLINE_COUNT||0).toLocaleString()} online`;
          metaLine.style.color = "";
        }, 1000 + Math.floor(Math.random()*2000));
      }catch(e){}
    }

    // Small inline typing bubble in stream
    function showTypingIndicator(persona, duration=1600){
      try{
        const wrap = document.createElement("div");
        wrap.className = "tg-bubble incoming typing";
        const avatar = document.createElement("img");
        avatar.className = "tg-bubble-avatar";
        avatar.src = persona && persona.avatar ? persona.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(persona && persona.name?persona.name:"U")}`;
        avatar.alt = persona && persona.name ? persona.name : "user";
        avatar.onerror = function(){
          this.onerror = null;
          try{ this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(persona && persona.name?persona.name:"U")}&background=random`; }catch(e){ this.src = "https://picsum.photos/seed/fallback/64/64"; }
        };
        wrap.appendChild(avatar);

        const bubble = document.createElement("div");
        bubble.className = "tg-bubble-content";
        bubble.innerHTML = `<div class="tg-reply-preview">${persona && persona.name ? persona.name : "Someone"} is typing…</div>`;
        wrap.appendChild(bubble);

        container.appendChild(wrap);
        container.scrollTop = container.scrollHeight;
        setTimeout(()=>{ try{ if(wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); }catch(e){} }, Math.max(800, duration));
      }catch(e){ console.warn("showTypingIndicator failed", e); }
    }

    // Create bubble element (supports incoming/outgoing/system, images, captions, reply previews)
    function createBubbleElement(persona, text, opts={}){
      const { timestamp=new Date(), type="incoming", replyToText=null, image=null, caption=null, id=null, pinned=false } = opts;
      try{
        insertDateSticker(timestamp);

        // system message (centered)
        if(type === "system"){
          const sys = document.createElement("div");
          sys.className = "tg-system-message";
          const inner = document.createElement("div");
          inner.className = "sys-inner";
          inner.textContent = String(text || "");
          sys.appendChild(inner);
          return sys;
        }

        const wrapper = document.createElement("div");
        wrapper.className = `tg-bubble ${type}` + (pinned ? " pinned" : "");
        if(id) wrapper.dataset.id = id;

        // avatar
        const avatar = document.createElement("img");
        avatar.className = "tg-bubble-avatar";
        avatar.src = persona && persona.avatar ? persona.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(persona && persona.name?persona.name:"U")}`;
        avatar.alt = persona && persona.name ? persona.name : "user";
        avatar.onerror = function(){
          this.onerror = null;
          try{
            this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(persona && persona.name?persona.name:"U")}&background=random`;
          }catch(e){ this.src = "https://picsum.photos/seed/fallback/64/64"; }
        };

        const content = document.createElement("div"); content.className = "tg-bubble-content";

        // reply preview
        if(replyToText){
          const rp = document.createElement("div"); rp.className = "tg-reply-preview";
          rp.textContent = replyToText.length > 120 ? replyToText.substring(0,117) + "..." : replyToText;
          rp.addEventListener("click", ()=>{ 
            // fuzzy match target message and scroll/highlight
            const norm = String(replyToText).toLowerCase().replace(/[\W\d_]+/g," ").trim().substring(0,120);
            for(const [mid, mobj] of MESSAGE_MAP.entries()){
              try{
                const mnorm = String(mobj.text||"").toLowerCase().replace(/[\W\d_]+/g," ").trim().substring(0,120);
                if(mnorm && norm && mnorm.indexOf(norm) !== -1){
                  mobj.el.scrollIntoView({ behavior:"smooth", block:"center" });
                  mobj.el.classList.add("tg-highlight");
                  setTimeout(()=> mobj.el.classList.remove("tg-highlight"), 2600);
                  break;
                }
              }catch(e){}
            }
          });
          content.appendChild(rp);
        }

        const sender = document.createElement("div"); sender.className = "tg-bubble-sender"; sender.textContent = persona && persona.name ? persona.name : "User";
        content.appendChild(sender);

        // image inside bubble
        if(image){
          const img = document.createElement("img"); img.className = "tg-bubble-image"; img.src = image; img.alt = "image";
          img.onerror = function(){
            try{
              if(!this.src.includes("assets/broadcast.jpg")) this.src = "assets/broadcast.jpg";
              else this.style.display = "none";
            }catch(e){ this.style.display = "none"; }
          };
          content.appendChild(img);
        }

        const textEl = document.createElement("div"); textEl.className = "tg-bubble-text"; textEl.textContent = text || ""; content.appendChild(textEl);

        // caption with inline glass button logic (Contact Admin)
        if(caption){
          // if caption contains explicit "Contact Admin" text, render inline glass button
          if(String(caption).toLowerCase().includes("contact admin")){
            const capWrap = document.createElement("div"); capWrap.style.marginTop = "8px";
            const glass = document.createElement("button");
            glass.className = "tg-glass-button";
            glass.textContent = "Contact Admin";
            glass.onclick = (e)=>{ e.stopPropagation(); const href = window.CONTACT_ADMIN_LINK || "https://t.me/ph_suppp"; window.open(href, "_blank"); };
            capWrap.appendChild(glass);
            content.appendChild(capWrap);
          } else {
            const cap = document.createElement("div"); cap.className = "tg-bubble-text"; cap.style.marginTop = "6px"; cap.textContent = caption; content.appendChild(cap);
          }
        }

        // meta (time + seen for outgoing)
        const meta = document.createElement("div"); meta.className = "tg-bubble-meta";
        const timeSpan = document.createElement("span"); timeSpan.textContent = formatTime(timestamp); meta.appendChild(timeSpan);

        if(type === "outgoing"){
          const seen = document.createElement("div"); seen.className = "seen"; seen.innerHTML = `<i data-lucide="eye"></i> 1`; meta.appendChild(seen);
        }
        content.appendChild(meta);

        // reactions container
        const reactions = document.createElement("div"); reactions.className = "tg-reactions"; content.appendChild(reactions);

        wrapper.appendChild(avatar); wrapper.appendChild(content);

        // context menu hook
        wrapper.addEventListener("contextmenu", (e)=>{ try{ e.preventDefault(); const ev = new CustomEvent("messageContext",{ detail:{ id, persona, text } }); document.dispatchEvent(ev); }catch(err){} });

        return wrapper;
      }catch(e){ console.warn("createBubbleElement error", e); return document.createElement("div"); }
    }

    // Append message to DOM safely
    function appendMessage(persona, text, opts={}){
      const id = opts.id || ("m_" + Date.now() + "_" + Math.floor(Math.random()*9999));
      opts.id = id;
      try{
        const el = createBubbleElement(persona, text, opts);
        container.appendChild(el);

        // record mapping
        MESSAGE_MAP.set(id, { el, text });

        const atBottom = (container.scrollTop + container.clientHeight) > (container.scrollHeight - 120);
        if(atBottom){ container.scrollTop = container.scrollHeight; hideJumpIndicator(); }
        else { unseenCount++; updateJumpIndicator(); showJumpIndicator(); }

        // entrance animation
        el.style.opacity = 0; el.style.transform = "translateY(6px)";
        requestAnimationFrame(()=>{ el.style.transition = "all 220ms ease"; el.style.opacity = 1; el.style.transform = "translateY(0)"; });

        // re-render lucide icons if loaded
        if(window.lucide && typeof window.lucide.createIcons === "function"){
          try{ window.lucide.createIcons(); }catch(e){ /* ignore */ }
        }
        return id;
      }catch(e){ console.warn("appendMessage failed", e); return null; }
    }

    // Jump indicator helpers
    function showJumpIndicator(){ if(jumpIndicator && jumpIndicator.classList.contains("hidden")) jumpIndicator.classList.remove("hidden"); }
    function hideJumpIndicator(){ if(jumpIndicator && !jumpIndicator.classList.contains("hidden")) jumpIndicator.classList.add("hidden"); unseenCount = 0; updateJumpIndicator(); }
    function updateJumpIndicator(){ if(jumpText) jumpText.textContent = unseenCount > 1 ? `New messages · ${unseenCount}` : `New messages`; }

    if(jumpIndicator) jumpIndicator.addEventListener("click", ()=>{ container.scrollTop = container.scrollHeight; hideJumpIndicator(); });
    container.addEventListener("scroll", ()=>{ const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight; if(scrollBottom > 100) showJumpIndicator(); else hideJumpIndicator(); });

    // header typing events (multiple names)
    const typingNames = [];
    document.addEventListener("headerTyping", (ev)=>{ 
      try{
        const name = ev.detail && ev.detail.name ? ev.detail.name : "Someone";
        typingNames.push(name);
        showTypingInHeader(typingNames.slice(-3));
        setTimeout(()=>{ typingNames.shift(); }, 1000 + Math.floor(Math.random()*2000));
      }catch(e){}
    });

    // Expose TGRenderer API (idempotent)
    window.TGRenderer = window.TGRenderer || {
      appendMessage: (persona, text, opts={}) => appendMessage(persona, text, opts),
      showTyping: (persona, duration=1600) => { showTypingIndicator(persona, duration); document.dispatchEvent(new CustomEvent("headerTyping",{ detail:{ name: persona && persona.name ? persona.name : "Someone" } })); }
    };

    // Convenience renderer for arrays
    window.BubbleRenderer = window.BubbleRenderer || {
      renderMessages: (arr=[]) => { try{ arr.forEach(m => appendMessage({ name: m.name, avatar: m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name||"U")}` }, m.text, { id: m.id, timestamp: new Date(m.time || Date.now()), type: m.isOwn ? "outgoing" : "incoming", image: m.image, caption: m.caption })); }catch(e){ console.warn("BubbleRenderer.renderMessages err", e); } }
    };

    // initial lucide render
    if(window.lucide && typeof window.lucide.createIcons === "function"){ try{ window.lucide.createIcons(); }catch(e){} }
    console.log("bubble-renderer initialized (safe)");
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 0);
})();
