// bubble-renderer.js
// FULLY OPTIMIZED – batch rendering + smart scroll + stable date logic
// ============================================================

(function(){
  function init(){
    const container = document.getElementById("tg-comments-container");
    const jumpIndicator = document.getElementById("tg-jump-indicator");
    const jumpText = document.getElementById("tg-jump-text");
    const metaLine = document.getElementById("tg-meta-line");

    if(!container){
      console.error("bubble-renderer: #tg-comments-container not found");
      return;
    }

    // ================= STATE =================
    const MESSAGE_MAP = new Map();
    const insertedDateKeys = new Set();
    let unseenCount = 0;

    // ================= HELPERS =================
    function formatTime(date){
      try{
        return new Date(date).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
      }catch(e){ return ""; }
    }

    function getDateKey(date){
      const d = new Date(date);
      return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }

    function createDateSticker(date){
      const sticker = document.createElement("div");
      sticker.className = "tg-date-sticker";
      sticker.textContent = new Date(date).toLocaleDateString([], {
        year:'numeric', month:'short', day:'numeric'
      });
      sticker.dataset.dateKey = getDateKey(date);
      return sticker;
    }

    // ================= BUBBLE CREATION =================
    function createBubbleElement(persona, text, opts={}){
      const {
        timestamp=new Date(),
        type="incoming",
        replyToText=null,
        image=null,
        caption=null,
        id=null,
        pinned=false
      } = opts;

      if(type === "system"){
        const sys = document.createElement("div");
        sys.className = "tg-system-message";
        const inner = document.createElement("div");
        inner.className = "sys-inner";
        inner.textContent = text || "";
        sys.appendChild(inner);
        return sys;
      }

      const wrapper = document.createElement("div");
      wrapper.className = `tg-bubble ${type}` + (pinned ? " pinned" : "");
      wrapper.dataset.timestamp = timestamp;
      if(id) wrapper.dataset.id = id;

      // Avatar
      const avatar = document.createElement("img");
      avatar.className = "tg-bubble-avatar";
      avatar.src = persona?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(persona?.name || "U")}`;
      avatar.alt = persona?.name || "user";
      avatar.onerror = () => {
        avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(persona?.name||"U")}&background=random`;
      };

      // Content
      const content = document.createElement("div");
      content.className = "tg-bubble-content";

      // Reply Preview
      if(replyToText){
        const rp = document.createElement("div");
        rp.className = "tg-reply-preview";
        rp.textContent = replyToText.length > 120
          ? replyToText.substring(0,117)+"..."
          : replyToText;

        rp.onclick = () => {
          const norm = replyToText.toLowerCase().replace(/[\W\d_]+/g," ").trim();
          for(const [mid, obj] of MESSAGE_MAP.entries()){
            const mnorm = (obj.text||"").toLowerCase().replace(/[\W\d_]+/g," ").trim();
            if(mnorm.includes(norm)){
              obj.el.scrollIntoView({behavior:"smooth", block:"center"});
              obj.el.classList.add("tg-highlight");
              setTimeout(()=>obj.el.classList.remove("tg-highlight"),2500);
              break;
            }
          }
        };
        content.appendChild(rp);
      }

      const sender = document.createElement("div");
      sender.className = "tg-bubble-sender";
      sender.textContent = persona?.name || "User";
      content.appendChild(sender);

      if(image){
        const img = document.createElement("img");
        img.className = "tg-bubble-image";
        img.src = image;
        img.onerror = ()=> img.style.display="none";
        content.appendChild(img);
      }

      const textEl = document.createElement("div");
      textEl.className = "tg-bubble-text";
      textEl.textContent = text || "";
      content.appendChild(textEl);

      if(caption){
        const cap = document.createElement("div");
        cap.className = "tg-bubble-text";
        cap.style.marginTop = "6px";
        cap.textContent = caption;
        content.appendChild(cap);
      }

      const meta = document.createElement("div");
      meta.className = "tg-bubble-meta";

      const time = document.createElement("span");
      time.textContent = formatTime(timestamp);
      meta.appendChild(time);

      if(type === "outgoing"){
        const seen = document.createElement("div");
        seen.className = "seen";
        seen.innerHTML = `<i data-lucide="eye"></i> 1`;
        meta.appendChild(seen);
      }

      content.appendChild(meta);

      const reactions = document.createElement("div");
      reactions.className = "tg-reactions";
      content.appendChild(reactions);

      wrapper.appendChild(avatar);
      wrapper.appendChild(content);

      return wrapper;
    }

    // ================= SMART BATCH RENDER =================
    function appendMessagesBatch(messages=[]){
      if(!messages.length) return;

      const fragment = document.createDocumentFragment();

      const nearBottom =
        container.scrollTop + container.clientHeight >
        container.scrollHeight - 120;

      let previousDateKey = null;

      messages
        .sort((a,b)=> new Date(a.time) - new Date(b.time))
        .forEach(m => {

          const timestamp = new Date(m.time || Date.now());
          const currentDateKey = getDateKey(timestamp);

          if(currentDateKey !== previousDateKey &&
             !insertedDateKeys.has(currentDateKey)){

            const sticker = createDateSticker(timestamp);
            fragment.appendChild(sticker);
            insertedDateKeys.add(currentDateKey);
          }

          previousDateKey = currentDateKey;

          const el = createBubbleElement(
            { name: m.name, avatar: m.avatar },
            m.text,
            {
              id: m.id,
              timestamp,
              type: m.isOwn ? "outgoing" : "incoming",
              image: m.image,
              caption: m.caption
            }
          );

          fragment.appendChild(el);
          MESSAGE_MAP.set(m.id || crypto.randomUUID(), {
            el,
            text: m.text
          });
        });

      container.appendChild(fragment);

      if(nearBottom){
        container.scrollTop = container.scrollHeight;
        hideJumpIndicator();
      } else {
        unseenCount += messages.length;
        updateJumpIndicator();
        showJumpIndicator();
      }

      if(window.lucide?.createIcons){
        try{ window.lucide.createIcons(); }catch(e){}
      }
    }

    // ================= JUMP INDICATOR =================
    function showJumpIndicator(){
      jumpIndicator?.classList.remove("hidden");
    }

    function hideJumpIndicator(){
      jumpIndicator?.classList.add("hidden");
      unseenCount = 0;
      updateJumpIndicator();
    }

    function updateJumpIndicator(){
      if(jumpText){
        jumpText.textContent =
          unseenCount > 1
            ? `New messages · ${unseenCount}`
            : "New messages";
      }
    }

    jumpIndicator?.addEventListener("click",()=>{
      container.scrollTop = container.scrollHeight;
      hideJumpIndicator();
    });

    container.addEventListener("scroll",()=>{
      const scrollBottom =
        container.scrollHeight -
        container.scrollTop -
        container.clientHeight;

      if(scrollBottom > 100){
        showJumpIndicator();
      } else {
        hideJumpIndicator();
      }
    });

    // ================= PUBLIC API =================
    window.TGRenderer = {
      appendMessage:(persona,text,opts={})=>{
        appendMessagesBatch([{
          id: opts.id,
          name: persona.name,
          avatar: persona.avatar,
          text,
          time: opts.timestamp || Date.now(),
          isOwn: opts.type==="outgoing",
          image: opts.image,
          caption: opts.caption
        }]);
      },
      renderMessages:(arr=[])=>{
        appendMessagesBatch(arr);
      }
    };

    console.log("bubble-renderer fully optimized & stable");
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init);
  } else {
    setTimeout(init,0);
  }
})();
