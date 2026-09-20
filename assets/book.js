/* ============================================================
   電子婚紗 · 翻頁引擎
   一般情況不需要改這個檔案。要改內容請改「config/album.js」
   ============================================================ */
(function () {
  "use strict";

  var C = window.相簿設定;
  var IMGDIR = "photos/";
  var RATIO_PC = 0.75;            // 電腦：單頁 寬/高
  var RATIO_M = 0.62;             // 手機：單頁 寬/高
  /* 翻頁時間不再寫死在 JS，改成直接讀 style.css 的 --flip。
     ------------------------------------------------------------
     以前 JS 有 FLIP_MS，CSS 有 transition-duration，還有掃光的
     animation-duration —— 三個地方各寫一份，改一個忘了另一個就會失準
     （翻頁鎖太早放開＝動畫被打斷，太晚放開＝連點被吃掉）。
     現在 style.css 的 :root / body.thin 只有一個 --flip 是真相，
     這裡讀它，永遠不會對不上。 */
  var FLIP_FALLBACK = 1050;
  function flipMs() {
    var v = getComputedStyle(document.body).getPropertyValue("--flip").trim();
    if (!v) return FLIP_FALLBACK;
    var n = parseFloat(v);
    if (isNaN(n)) return FLIP_FALLBACK;
    return /ms$/.test(v) ? n : n * 1000;   /* 支援 "620ms" 與 ".62s" 兩種寫法 */
  }

  /* ---------------- 組出所有頁面 ---------------- */
  var pages = [];
  var tocList = [];

  pages.push({ 型: "封面" });
  C.章節.forEach(function (ch, i) {
    tocList.push({ i: i, at: pages.length, ch: ch });
    pages.push({ 型: "章名", ch: ch });
    (ch.頁面 || []).forEach(function (p) {
      var q = {};
      for (var k in p) q[k] = p[k];
      q.__ch = ch;
      pages.push(q);
    });
  });
  pages.push({ 型: "結語" });

  /* ---------------- 頁面 HTML ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function img(name) {
    /* 先不給 src，等這一頁快翻到了才載入（手機記憶體救命用）。
       ⚠️ 不可以再加 loading="lazy"：載入時機已經由 hydrate() 自己控制，
       再讓瀏覽器自己判斷會打架 —— Safari 會把「剛設好 src、但還在 3D 圖層裡
       還沒排版」的圖再往後延，結果那一頁翻到時圖是空的，翻走再翻回來才出現
       （2026-09-20 使用者回報「雙直頁的大圖會消失」就是這個）。 */
    return '<img decoding="async" data-src="' +
      IMGDIR + encodeURIComponent(name) + '" alt="">';
  }

  /* 把某一片葉子裡的圖真的載進來 */
  function hydrate(lf) {
    if (!lf || lf.__on) return;
    lf.__on = 1;
    var list = lf.querySelectorAll("img[data-src]");
    for (var i = 0; i < list.length; i++) {
      var im = list[i];
      im.removeAttribute("loading");          /* 保險：舊快取來的 HTML 也拿掉 */
      im.src = im.getAttribute("data-src");
      im.removeAttribute("data-src");
      /* 主動要求解碼，讓圖片在翻到之前就準備好，不要等瀏覽器自己排隊 */
      if (im.decode) { im.decode().catch(function () {}); }
    }
  }
  function cap(t) {
    return '<div class="cap' + (t ? "" : " empty") + '">' + esc(t || "") + "</div>";
  }

  function pageHTML(p, n) {
    if (!p) return '<div class="page"></div>';

    if (p.型 === "封面") {
      var c = C.封面 || {};
      /* 主標如果是英文（像 "OUR STORY"），字級與字距要另外一套 ——
         中文 2~3 個字的大小拿來排 9 個英文字母會塞不下、被折成兩行。
         這裡只加一個 class，實際尺寸交給 style.css 的 .cover h1.latin。 */
      var 主標拉丁 = /^[\x20-\x7E]+$/.test(c.主標 || "");
      return '<div class="cover">' +
        '<div class="head">' +
          '<div class="en">' + esc(c.英文標) + "</div>" +
          '<h1' + (主標拉丁 ? ' class="latin"' : '') + ">" + esc(c.主標) + "</h1>" +
          '<div class="rule"></div>' +
          '<div class="sub">' + esc(c.副標) + "</div>" +
        "</div>" +
        '<div class="shot">' + img(c.圖) + "</div>" +
        '<div class="foot"><div class="tiny">' + esc(c.小字) + "</div></div>" +
        "</div>";
    }

    if (p.型 === "結語") {
      var e = C.結語 || {};
      return '<div class="ending">' +
        '<div class="head">' +
          '<div class="en">' + esc(e.英文標) + "</div>" +
          "<h2>" + esc(e.主標) + "</h2>" +
          '<div class="rule"></div>' +
        "</div>" +
        '<div class="shot">' + img(e.圖) + "</div>" +
        '<div class="foot"><p>' + esc(e.內文) + "</p>" +
        '<div class="sign">' + esc(e.署名) + "</div></div>" +
        "</div>";
    }

    var body = "";

    if (p.型 === "章名") {
      var ch = p.ch;
      body = '<div class="chapter">' +
        '<div class="num">' + esc(ch.編號) + "</div>" +
        '<div class="rule"></div>' +
        "<h2>" + esc(ch.標題) + "</h2>" +
        '<div class="en">' + esc(ch.英文) + "</div>" +
        '<div class="lead">' + esc(ch.引言) + "</div>" +
        "</div>";
    } else if (p.型 === "文字") {
      body = '<div class="textpage"><p>' + esc(p.主文) + "</p>" +
        (p.署名 ? '<div class="sign">' + esc(p.署名) + "</div>" : "") + "</div>";
    } else if (p.型 === "滿版") {
      body = '<div class="shots"><div class="shot">' + img(p.圖) + "</div></div>" + cap(p.說明);
    } else if (p.型 === "雙直") {
      body = '<div class="shots duo">' +
        '<div class="shot">' + img(p.圖[0]) + "</div>" +
        '<div class="shot">' + img(p.圖[1]) + "</div>" +
        "</div>" + cap(p.說明);
    } else if (p.型 === "雙橫") {
      body = '<div class="shots col">' +
        '<div class="shot">' + img(p.圖[0]) + "</div>" +
        '<div class="shot">' + img(p.圖[1]) + "</div>" +
        "</div>" + cap(p.說明);
    } else if (p.型 === "連拍") {
      /* 三張同一組動作的橫式照片，由上往下、左中右錯開排，像一條底片。
         只放同一個場景、同一套衣服的連續瞬間，不要拿不同風格的照片來湊。 */
      body = '<div class="strip">' +
        '<div class="shot">' + img(p.圖[0]) + "</div>" +
        '<div class="shot">' + img(p.圖[1]) + "</div>" +
        '<div class="shot">' + img(p.圖[2]) + "</div>" +
        "</div>" + cap(p.說明);
    } else {
      body = ""; // 空白頁
    }

    var num = (p.型 === "章名" || p.型 === "空白") ? "" : '<div class="pnum">' + n + "</div>";
    /* 雙直頁在手機直式（單頁模式）改成錯位疊圖，靠 CSS 的 .duopage 接手 */
    var cls = "page" + (p.型 === "雙直" ? " duopage" : "");
    return '<div class="' + cls + '">' + body + num + "</div>";
  }

  /* ---------------- DOM ---------------- */
  var stage = document.getElementById("stage");
  var book = document.getElementById("book");
  var counter = document.getElementById("counter");
  var btnPrev = document.getElementById("prev");
  var btnNext = document.getElementById("next");
  var btnAuto = document.getElementById("btn-auto");
  var hint = document.getElementById("hint");

  var mobile = false;      // 版面：true=單頁、false=雙頁跨頁
  var thin = false;        // 資源策略：true=裝置偏小，圖片要省著載
  var leaves = [];
  var pos = 0;            // 桌機:已翻頁數 / 手機:目前頁索引
  var animating = false;

  /* 手機的網址列一收一放會讓 innerHeight 一直跳，
     所以尺寸一律用這組「穩定值」算，不直接讀即時的 innerHeight。 */
  var baseW = window.innerWidth;
  var baseH = window.innerHeight;
  var WIN = 2;              // 手機上前後各保留幾頁在 DOM 裡
  var WIN_PC = 3;           // 電腦上前後各保留幾張葉子「顯示」（其餘先 display:none）

  function isMobileNow() {
    /* 版面判斷：直式（含接近正方形）一律單頁；橫式只要寬度還放得下
       兩頁，就比照電腦版做雙頁跨頁——手機橫放時也適用這一支。 */
    if (baseH >= baseW) return true;
    return baseW < 480;
  }

  function isThinDevice() {
    /* 不管直橫，裝置「短邊」偏小就代表是手機這類記憶體有限的裝置，
       圖片要用「快翻到才載入」的省記憶體策略，不能一次全部塞進 DOM
       （這就是之前手機會被系統砍分頁的原因）。用短邊判斷是因為同一支
       手機轉向後短邊不會變，橫放時也一樣要省。 */
    return Math.min(baseW, baseH) < 700;
  }

  function sizeUp() {
    var vw = baseW, vh = baseH, ph, ratio;
    if (mobile) {
      ratio = RATIO_M;
      ph = Math.min(vh - 104, (vw - 16) / ratio);
    } else {
      ratio = RATIO_PC;
      ph = Math.min(vh - 132, (vw - 90) / 2 / ratio);
    }
    ph = Math.max(260, Math.round(ph));
    document.documentElement.style.setProperty("--ph", ph + "px");
    document.documentElement.style.setProperty("--pw", Math.round(ph * ratio) + "px");
  }

  function build() {
    mobile = isMobileNow();
    thin = isThinDevice();
    document.body.classList.toggle("mobile", mobile);
    /* thin＝手機這類算力/記憶體有限的裝置（短邊<700px，轉向也不會變）。
       翻頁動畫的效能設定要看 thin 而不是 mobile —— 手機橫放時版面雖然
       跟電腦一樣是雙頁跨頁，硬體卻還是手機，一樣吃不下每幀重畫。 */
    document.body.classList.toggle("thin", thin);
    sizeUp();
    book.innerHTML = '<div id="spine"></div>';
    leaves = [];

    if (mobile) {
      pages.forEach(function (p, i) {
        var lf = document.createElement("div");
        lf.className = "leaf";
        lf.style.zIndex = pages.length - i;
        lf.innerHTML =
          '<div class="face front">' + pageHTML(p, i) + "</div>" +
          /* 單頁模式的背面固定留白，而且 CSS 會把它整個藏起來
             （body.mobile .face.back{visibility:hidden}）——
             手機一頁就是一張照片，沒有「紙的另一面」要給人看，
             藏起來才不會在翻頁前半段掃出一張空白紙。 */
          '<div class="face back"><div class="page"></div></div>';
        book.appendChild(lf);
        leaves.push(lf);
      });
    } else {
      var list = pages.slice();
      if (list.length % 2) list.push({ 型: "空白" });
      for (var i = 0; i < list.length; i += 2) {
        var lf = document.createElement("div");
        lf.className = "leaf";
        lf.innerHTML =
          '<div class="face front">' + pageHTML(list[i], i) + "</div>" +
          '<div class="face back">' + pageHTML(list[i + 1], i + 1) + "</div>";
        book.appendChild(lf);
        leaves.push(lf);
        /* 記憶體夠的裝置（一般電腦）才一次載齊、交給 loading="lazy"；
           偏小的裝置（手機橫放雙頁跨頁時）跟手機單頁版一樣，交給
           apply() 依目前頁範圍才真的載圖，避免圖片一次全部塞進記憶體。 */
        if (!thin) hydrate(lf);
      }
    }
    apply(true);
  }

  function total() { return leaves.length; }

  function apply(instant) {
    if (instant) {
      leaves.forEach(function (l) { l.style.transition = "none"; });
    }
    leaves.forEach(function (l, i) {
      var flipped = i < pos;
      l.classList.toggle("flipped", flipped);
      /* 正在翻的那一頁要浮到最上層，不然會被還沒翻的整疊頁蓋住，
         書愈前面剩的頁愈多、擋得愈嚴重，看起來就像「沒有翻頁特效」。 */
      /* 翻頁中的那一片要浮到所有葉子之上（葉子最高只用到 total()+1，約 26），
         但 **不能碰到 #spine 的層級**。舊值 999 跟 #spine 的 z-index 完全相同，
         同層時 DOM 順序決定誰在上面，而葉子是在 #spine 之後才 append 的
         —— 結果一按下翻頁，書縫陰影就被葉子整個蓋掉、直接消失，
         等葉子轉過 90 度離開中線才又冒出來，看起來就是「陰影閃一下」。
         改用 500，穩穩高於所有葉子、又低於 #spine。 */
      l.style.zIndex = l.classList.contains("flipping") ? 500 : (flipped ? i + 1 : total() - i + 1);
      if (mobile) {
        /* 只留目前這幾頁在畫面上，其餘整片拔掉。
           手機一次撐不住 50 幾個 3D 圖層 + 60 張大圖，會被系統砍掉分頁。 */
        var near = (i >= pos - 1 && i <= pos + WIN);
        l.style.display = near ? "" : "none";
        if (near) hydrate(l);
      } else {
        /* 電腦：圖片本來就全部載好了，問題出在「同時攤開」的 3D 圖層太多，
           每翻一頁瀏覽器都要重算/合成全部葉子，才會又卡又讓翻頁動畫看起來
           像用跳的（轉一半忽然消失、才跳出新照片）。其實沒在翻頁範圍內的
           葉子本來就被上面那疊完全擋住、根本看不到，所以可以放心隱藏。 */
        var nearPC = (i >= pos - WIN_PC && i <= pos + WIN_PC);
        l.style.display = nearPC ? "" : "none";
        if (thin && nearPC) hydrate(l);   // 手機橫放等小螢幕：範圍內才真的載圖
      }
    });
    if (!mobile) {
      book.classList.toggle("closed", pos === 0);
      book.classList.toggle("finished", pos >= total());
      book.classList.toggle("opened", pos > 0 && pos < total());
    }
    if (instant) {
      void book.offsetWidth;
      leaves.forEach(function (l) { l.style.transition = ""; });
    }
    updateUI();
  }

  function updateUI() {
    var cur, max;
    if (mobile) { cur = pos + 1; max = pages.length; }
    else { cur = pos; max = total(); }
    counter.textContent = mobile
      ? cur + " / " + max
      : (pos === 0 ? "封面" : (pos >= max ? "封底" : pos + " / " + max));
    btnPrev.disabled = pos <= 0;
    btnNext.disabled = mobile ? pos >= pages.length - 1 : pos >= total();
  }

  function go(dir) {
    if (animating) return;
    var limit = mobile ? pages.length - 1 : total();
    var np = pos + dir;
    if (np < 0 || np > limit) return;
    animating = true;
    if (mobile && dir < 0) {
      // 先讓上一頁出現，再轉回來
      var l = leaves[np];
      if (l) l.style.display = "";
    }
    // 這次動作真正在翻的是哪一張葉子（見下方 apply() 的說明）
    var activeLeaf = leaves[dir > 0 ? pos : pos - 1];
    if (activeLeaf) {
      activeLeaf.classList.add("flipping");
      /* 往回翻時，正反面出現的順序是相反的（見 style.css 的 faceKeep/faceShow）。 */
      activeLeaf.classList.toggle("rev", dir < 0);
    }
    pos = np;
    apply(false);
    setTimeout(function () {
      animating = false;
      if (activeLeaf) { activeLeaf.classList.remove("flipping"); activeLeaf.classList.remove("rev"); }
      apply(false);
    }, flipMs());
  }

  function jump(target) {
    if (animating) return;
    leaves.forEach(function (l) { l.classList.remove("flipping"); l.classList.remove("rev"); });
    pos = mobile ? target : Math.floor(target / 2);
    apply(true);
  }

  /* ---------------- 展示模式（收禮桌那台 iPad） ----------------
     怎麼開：那台裝置的網址加 /demo（例如 w-album2.pages.dev/demo）。
             開過一次就記在那台瀏覽器裡，之後開一般網址也還是展示模式
             —— 加入主畫面、重新整理都不會掉。
     怎麼關：同一台開 ?demo=off。
     行為：閒置一段時間沒人碰 → 自動翻頁；有人一碰就停，手放開再閒置一樣的時間又自己開始。
     想調節奏不用改程式：/demo?idle=30&sec=6 （秒）。
     ⚠️ 刻意不做「偵測是不是 iPad」：偵測不可靠（iPadOS 會自稱 Macintosh），
        而且要的是「這台是展示機」而不是「這是 iPad」—— 賓客自己帶的平板不該被自動翻頁。 */
  var 網址參數 = {};
  (location.search || "").replace(/^\?/, "").split("&").forEach(function (kv) {
    if (!kv) return;
    var i = kv.indexOf("=");
    網址參數[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1));
  });
  var KIOSK = (function () {
    var v = 網址參數.demo !== undefined ? 網址參數.demo : 網址參數.kiosk;
    var 關掉 = (v === "off" || v === "0");
    var 開啟 = /(^|\/)demo\/?$/.test(location.pathname) || (v !== undefined && !關掉);
    try {
      if (關掉) { localStorage.removeItem("展示模式"); return false; }
      if (開啟) localStorage.setItem("展示模式", "1");
      else if (localStorage.getItem("展示模式") === "1") 開啟 = true;
    } catch (e) { /* 無痕模式等存不了，就只看這次的網址 */ }
    return 開啟;
  })();
  function 秒(名, 預設) {
    var v = parseFloat(網址參數[名]);
    return (v > 0 && v < 3600) ? Math.round(v * 1000) : 預設;
  }

  /* ---------------- 自動翻頁 ---------------- */
  var AUTO_MS = 秒("sec", KIOSK ? 6000 : 5000);   // 每隔幾秒自動翻下一頁
  var IDLE_MS = 秒("idle", 30000);                // 展示模式：閒置多久就自己開始翻
  var idleTimer = null;
  var autoTimer = null;
  var autoOn = false;

  /* 閒置計時器：只有展示模式會用。任何操作都會把它重新計時。 */
  function resetIdle() {
    if (!KIOSK) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (!autoOn) startAuto(); }, IDLE_MS);
  }

  function autoTick() {
    var limit = mobile ? pages.length - 1 : total();
    if (pos >= limit) { jump(0); }   // 翻到封底了，跳回封面重新循環
    else { go(1); }
  }
  function startAuto() {
    if (autoOn) return;
    autoOn = true;
    btnAuto.textContent = "⏸ 自動播放中";
    btnAuto.classList.add("on");
    autoTimer = setInterval(autoTick, AUTO_MS);
  }
  function stopAuto() {
    if (!autoOn) return;
    autoOn = false;
    btnAuto.textContent = "▶ 自動播放";
    btnAuto.classList.remove("on");
    clearInterval(autoTimer);
    autoTimer = null;
  }
  /* 使用者自己手動操作（點按鈕、滑動、滾輪、開目錄…）就視為接手控制，
     自動播放先關掉，避免兩邊互相搶著翻頁。 */
  function pauseAutoIfOn() { if (autoOn) stopAuto(); resetIdle(); }
  btnAuto.addEventListener("click", function () { autoOn ? stopAuto() : startAuto(); });

  /* ---------------- 操作 ---------------- */
  btnPrev.addEventListener("click", function () { pauseAutoIfOn(); go(-1); });
  btnNext.addEventListener("click", function () { pauseAutoIfOn(); go(1); });

  document.addEventListener("keydown", function (e) {
    if (document.getElementById("toc").classList.contains("on")) {
      if (e.key === "Escape") closeToc();
      return;
    }
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); pauseAutoIfOn(); go(1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); pauseAutoIfOn(); go(-1); }
  });

  stage.addEventListener("click", function (e) {
    var r = stage.getBoundingClientRect();
    pauseAutoIfOn();
    go(e.clientX - r.left < r.width / 2 ? -1 : 1);
  });

  var tx = 0, ty = 0, tmoved = false;
  stage.addEventListener("touchstart", function (e) {
    tx = e.touches[0].clientX; ty = e.touches[0].clientY; tmoved = false;
  }, { passive: true });
  stage.addEventListener("touchmove", function () { tmoved = true; }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (!tmoved) return;
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { pauseAutoIfOn(); go(dx < 0 ? 1 : -1); }
  }, { passive: true });

  var wheelLock = 0;
  stage.addEventListener("wheel", function (e) {
    var now = Date.now();
    if (now - wheelLock < 700) return;
    var d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(d) < 12) return;
    wheelLock = now;
    pauseAutoIfOn();
    go(d > 0 ? 1 : -1);
  }, { passive: true });

  var rt;
  function onViewportChange() {
    var vw = window.innerWidth, vh = window.innerHeight;
    /* 手機捲動時網址列收合，高度會跳個 60~120px。
       寬度沒變、高度變化不大 → 視為網址列，完全不理它。
       （不擋的話這裡會一直重算尺寸甚至重建整本書，畫面就一直閃。） */
    if (vw === baseW && Math.abs(vh - baseH) < 150) return;
    clearTimeout(rt);
    rt = setTimeout(function () {
      var wasMobile = mobile, wasThin = thin;
      var absolute = mobile ? pos : pos * 2;
      baseW = window.innerWidth;
      baseH = window.innerHeight;
      if (isMobileNow() !== wasMobile || isThinDevice() !== wasThin) { build(); jump(absolute); }
      else { sizeUp(); }
    }, 200);
  }
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("orientationchange", function () {
    /* 轉向一定要重算，強制略過上面的門檻 */
    setTimeout(function () { baseW = -1; onViewportChange(); }, 300);
  });

  /* ---------------- 目錄 ---------------- */
  var toc = document.getElementById("toc");
  var tocBox = document.getElementById("tocbox");
  tocList.forEach(function (t) {
    var a = document.createElement("a");
    a.innerHTML = '<span class="n">' + String(t.i + 1).padStart(2, "0") + "</span>" +
      '<span class="t">' + esc(t.ch.標題) + "</span>" +
      '<span class="e">' + esc(t.ch.英文) + "</span>";
    a.addEventListener("click", function () { closeToc(); pauseAutoIfOn(); jump(t.at); });
    tocBox.appendChild(a);
  });
  function openToc() { pauseAutoIfOn(); toc.classList.add("on"); }
  function closeToc() { toc.classList.remove("on"); }
  document.getElementById("btn-toc").addEventListener("click", openToc);
  toc.addEventListener("click", function (e) { if (e.target === toc) closeToc(); });

  /* ---------------- 音樂 ---------------- */
  var audio = document.getElementById("bgm");
  var btnMusic = document.getElementById("btn-music");
  audio.src = "music/" + encodeURIComponent((C.音樂 && C.音樂.檔名) || "bgm.mp3");
  audio.volume = (C.音樂 && typeof C.音樂.音量 === "number") ? C.音樂.音量 : 0.35;

  function setMusic(on) {
    if (on) {
      var pr = audio.play();
      if (pr && pr.catch) pr.catch(function () { btnMusic.textContent = "♪ 音樂"; });
      btnMusic.textContent = "♪ 音樂 開";
      btnMusic.classList.add("on");
    } else {
      audio.pause();
      btnMusic.textContent = "♪ 音樂 關";
      btnMusic.classList.remove("on");
    }
  }
  btnMusic.addEventListener("click", function () { setMusic(audio.paused); });

  /* ---------------- 開場 ---------------- */
  var intro = document.getElementById("intro");
  function start(withMusic) {
    setMusic(!!withMusic);
    intro.classList.add("hide");
    setTimeout(function () { intro.style.display = "none"; }, 850);
    hint.classList.add("on");
    setTimeout(function () { hint.classList.remove("on"); }, 4200);
  }
  document.getElementById("start-music").addEventListener("click", function () { start(true); });
  document.getElementById("start-mute").addEventListener("click", function () { start(false); });

  /* 展示模式：沒有人會去點開場遮罩，直接靜音進入。
     （iPad 不允許沒有使用者手勢就播音樂，要配樂就現場點一次右上角的「♪ 音樂」。） */
  if (KIOSK) {
    document.body.classList.add("kiosk");
    start(false);
    resetIdle();
    /* 任何操作都重新計時；touch/pointer 都收，因為滑動不一定會走到 pauseAutoIfOn。 */
    ["pointerdown", "touchstart", "keydown", "wheel"].forEach(function (ev) {
      document.addEventListener(ev, function () { resetIdle(); }, { passive: true });
    });
    /* 盡量不要讓 iPad 自己睡著（Safari 16.4+ 支援；不支援就忽略，
       最保險還是到 設定 → 顯示與亮度 → 自動鎖定 → 永不）。 */
    var 醒著 = function () {
      if (!navigator.wakeLock || document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").catch(function () {});
    };
    醒著();
    document.addEventListener("visibilitychange", 醒著);
    document.addEventListener("pointerdown", 醒著, { passive: true });
  }

  /* ---------------- 走 ---------------- */
  document.title = C.網頁標題 || "Our Story";
  document.getElementById("intro-title").textContent = (C.封面 && C.封面.主標) || "";
  document.getElementById("intro-en").textContent = (C.封面 && C.封面.英文標) || "";
  document.getElementById("intro-sub").textContent = (C.封面 && C.封面.副標) || "";
  build();
})();
