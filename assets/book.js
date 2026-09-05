/* ============================================================
   Our Story — 美式編輯版  翻頁引擎
   ------------------------------------------------------------
   設計原則（沿用舊版驗證過的兩條）：
   ① 單一真相：翻頁時間只寫在 CSS 的 --flip，JS 直接讀它。
      要改手感 → 只改 style.css 的 --flip / body.thin --flip。
   ② 版面看 mobile，效能看 thin。
      body.mobile = 單頁版面（手機直式）
      body.thin   = 算力有限的裝置（短邊 <700px，手機直式＋橫式都算）
   ============================================================ */
(function () {
"use strict";

var A = window.相簿設定;
if (!A) { document.title = "設定檔讀取失敗"; return; }

/* ---------- 常數 ---------- */
var AUTO_MS = 5200;        // 自動播放間隔
var WIN_M   = 2;           // 手機：目前頁前後保留幾片
var WIN_PC  = 3;           // 電腦：同上
var R_SPREAD = 0.78;       // 跨頁模式的單頁長寬比 (寬/高)
var R_SINGLE = 0.62;       // 單頁模式的單頁長寬比

/* ---------- DOM ---------- */
var $ = function (s) { return document.querySelector(s); };
var stage = $("#stage"), book = $("#book"), spine = $("#spine");
var gate  = $("#gate"),  gateArt = $("#gate-art");
var corner= $("#corner"), bar = $("#bar"), toc = $("#toc");
var bgm   = $("#bgm");
var btnPrev = $("#prev"), btnNext = $("#next");
var btnToc = $("#btn-toc"), btnAuto = $("#btn-auto"), btnSnd = $("#btn-snd");
var chNow = $("#ch-now"), pgNow = $("#pg-now"), fill = $("#fill");

/* ---------- 狀態 ---------- */
var faces = [];      // 每一「面」的內容描述
var leaves = [];     // DOM 上的葉
var pos = 0;         // 已翻過的葉數
var limit = 0;
var mobile = false, thin = false;
var animating = false;
var autoOn = false, autoTimer = null;
var baseW = 0, baseH = 0;

/* ============================================================
   一、把設定檔攤平成 faces[]
   ============================================================ */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildFaces() {
  faces = [];
  faces.push({ k: "cover" });

  A.章節.forEach(function (c, ci) {
    faces.push({ k: "ch", ci: ci });
    (c.頁面 || []).forEach(function (p) {
      var t = p.型;
      if (t === "跨頁") {
        // 跨頁必須落在「左頁(奇數) + 右頁(偶數)」，否則先補一張空白
        if (faces.length % 2 === 0) faces.push({ k: "blank", ci: ci });
        faces.push({ k: "span", side: "l", p: p, ci: ci });
        faces.push({ k: "span", side: "r", p: p, ci: ci });
      } else if (t === "留白") {
        faces.push({ k: "air", p: p, ci: ci });
      } else if (t === "雙直") {
        faces.push({ k: "duo", p: p, ci: ci });
      } else if (t === "雙橫") {
        faces.push({ k: "duh", p: p, ci: ci });
      } else if (t === "文字") {
        faces.push({ k: "txt", p: p, ci: ci });
      } else if (t === "空白") {
        faces.push({ k: "blank", ci: ci });
      } else {
        faces.push({ k: "full", p: p, ci: ci });
      }
    });
  });

  // 結語固定排在左頁（奇數 index），這樣最後停下來時它就在眼前
  if (faces.length % 2 === 0) faces.push({ k: "blank", ci: A.章節.length - 1 });
  faces.push({ k: "end", ci: A.章節.length - 1 });

  // 標頁碼（封面、章名、結語不標）
  var n = 0;
  faces.forEach(function (f) {
    if (f.k === "cover" || f.k === "end" || f.k === "blank") { f.no = 0; return; }
    f.no = ++n;
  });
}

/* ============================================================
   二、每一面的 HTML
   ============================================================ */
function pic(src, cls) {
  return '<img class="' + (cls || "") + '" data-src="photos/' + esc(src) + '" alt="">';
}
function capHTML(txt, withRule) {
  var t = String(txt || "");
  if (!t) return '<p class="cap empty"></p>';
  return '<p class="cap">' + (withRule === false ? "" : '<span class="cap-rule"></span>') + esc(t) + '</p>';
}
function chrome(f) {
  var c = A.章節[f.ci];
  var h = "";
  if (c) h += '<div class="rh">' + esc(c.標題) + "</div>";
  if (f.no) h += '<div class="folio">' + f.no + "</div>";
  return h;
}

function faceHTML(f) {
  var c = A.章節[f.ci];
  var tint = c && c.色 ? ' style="--accent:' + esc(c.色) + '"' : "";

  switch (f.k) {
    case "cover":
      var cv = A.封面;
      return '<div class="page pg-cover">' +
        pic(cv.圖) + '<div class="wash"></div>' +
        '<div class="box">' +
          '<p class="kick">' + esc(cv.卷首 || "") + "</p>" +
          "<h1>" + esc(cv.主標 || "") + "</h1>" +
          '<div class="ln"></div>' +
          '<p class="sub">' + esc(cv.副標 || "") + "</p>" +
        "</div>" +
        '<div class="foot">' + esc(cv.小字 || "") + "</div></div>";

    case "end":
      var ed = A.結語;
      return '<div class="page pg-end">' +
        pic(ed.圖) + '<div class="wash"></div>' +
        '<div class="box">' +
          "<h2>" + esc(ed.主標 || "") + "</h2>" +
          '<div class="ln"></div>' +
          "<p>" + esc(ed.內文 || "") + "</p>" +
          '<p class="sign">' + esc(ed.署名 || "") + "</p>" +
        "</div></div>";

    case "ch":
      return '<div class="page pg-ch"' + tint + ">" +
        '<div class="num">第 ' + esc(c.序) + " 章</div>" +
        '<div class="rule"></div>' +
        "<h2>" + esc(c.標題) + "</h2>" +
        '<p class="lead">' + esc(c.引言 || "") + "</p>" +
        '<div class="rule-b"></div>' +
        "</div>";

    case "full":
      return '<div class="page"' + tint + '><div class="pg-full">' +
        pic(f.p.圖) + '<div class="veil"></div>' + capHTML(f.p.說明) +
        "</div></div>";

    case "span":
      return '<div class="page"' + tint + '><div class="pg-span h-' + f.side + '">' +
        pic(f.p.圖) +
        (f.side === "r" ? '<div class="veil"></div>' + capHTML(f.p.說明) : "") +
        "</div></div>";

    case "air":
      var side = String(f.p.說明 || "")
        ? '<div class="side"><p class="cap">' + esc(f.p.說明) + "</p></div>" : "";
      return '<div class="page pg-air"' + tint + ">" + chrome(f) +
        '<div class="shot">' + pic(f.p.圖) + "</div>" + side +
        '<div class="mark"></div>' +
        "</div>";

    case "duo":
      return '<div class="page pg-duo"' + tint + ">" + chrome(f) +
        '<div class="shots"><figure>' + pic(f.p.圖[0]) + "</figure>" +
        "<figure>" + pic(f.p.圖[1]) + "</figure></div>" +
        capHTML(f.p.說明) + "</div>";

    case "duh":
      return '<div class="page pg-duh"' + tint + ">" + chrome(f) +
        '<div class="shots"><figure>' + pic(f.p.圖[0]) + "</figure>" +
        "<figure>" + pic(f.p.圖[1]) + "</figure></div>" +
        capHTML(f.p.說明) + "</div>";

    case "txt":
      var sg = String(f.p.署名 || "");
      return '<div class="page pg-txt"' + tint + ">" + chrome(f) +
        '<div class="quo">&ldquo;</div>' +
        "<p>" + esc(f.p.主文 || "") + "</p>" +
        '<p class="sign' + (sg ? "" : " empty") + '">' + esc(sg) + "</p></div>";

    default:
      return '<div class="page pg-blank"' + tint + ">" + chrome(f) +
        '<span class="dot"></span>' + "</div>";
  }
}

/* ============================================================
   三、尺寸
   ============================================================ */
function isSingle() { return baseH >= baseW || baseW < 480; }
function isThin()   { return Math.min(baseW, baseH) < 700; }

function sizeUp() {
  var low = baseH < 520;
  var padTop = low ? 34 : 56;
  var padBot = mobile ? 66 : (low ? 44 : 84);
  var availH = Math.max(200, baseH - padTop - padBot);
  var availW = Math.max(200, baseW - (mobile ? 16 : (low ? 24 : 44)));
  var pw, ph;
  if (mobile) {
    ph = Math.min(availH, availW / R_SINGLE);
    pw = ph * R_SINGLE;
    if (pw > availW) { pw = availW; ph = pw / R_SINGLE; }
  } else {
    ph = Math.min(availH, availW / (R_SPREAD * 2));
    pw = ph * R_SPREAD;
  }
  var r = document.documentElement.style;
  r.setProperty("--pw", Math.round(pw) + "px");
  r.setProperty("--ph", Math.round(ph) + "px");
  r.setProperty("--half", mobile ? "0px" : Math.round(pw) + "px");
}

function flipMs() {
  var v = getComputedStyle(document.body).getPropertyValue("--flip").trim();
  var n = parseFloat(v) || 1;
  return (/ms$/.test(v) ? n : n * 1000) + 30;
}

/* ============================================================
   四、造書
   ============================================================ */
function build() {
  mobile = isSingle();
  thin   = isThin();
  document.body.classList.toggle("mobile", mobile);
  document.body.classList.toggle("thin", thin);
  sizeUp();

  book.innerHTML = "";
  book.appendChild(spine);
  leaves = [];

  var i;
  if (mobile) {
    // 單頁：一葉一面，背面是紙（相片本來就只貼一面）
    for (i = 0; i < faces.length; i++) {
      leaves.push(mkLeaf(faces[i], null, i));
    }
  } else {
    for (i = 0; i < faces.length; i += 2) {
      leaves.push(mkLeaf(faces[i], faces[i + 1] || null, i));
    }
  }
  limit = leaves.length;
  if (pos > limit) pos = limit;
  apply(true);
}

function mkLeaf(front, back, idx) {
  var lf = document.createElement("div");
  lf.className = "leaf";
  lf.dataset.i = idx;
  var a = document.createElement("div"); a.className = "face front";
  a.innerHTML = faceHTML(front);
  var b = document.createElement("div"); b.className = "face back";
  b.innerHTML = back ? faceHTML(back) : '<div class="page pg-blank"></div>';
  lf.appendChild(a); lf.appendChild(b);
  book.appendChild(lf);
  return lf;
}

function hydrate(lf) {
  if (lf.dataset.hy) return;
  lf.dataset.hy = "1";
  var im = lf.querySelectorAll("img[data-src]");
  for (var i = 0; i < im.length; i++) {
    mark(im[i]);
    im[i].src = im[i].dataset.src;
    im[i].removeAttribute("data-src");
  }
}

/* 圖片載入後，把橫式／直式標到父層，版型才知道要用哪個框 */
function mark(img) {
  var set = function () {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    var box = img.parentNode;
    if (box && box.classList) box.classList.add(w >= h ? "is-w" : "is-h");
    // 「留白」版型要照圖片的真實長寬開框，才不會裁到照片
    var air = img.closest ? img.closest(".pg-air") : null;
    if (air) {
      air.classList.add(w >= h ? "is-w" : "is-h");
      air.style.setProperty("--ar", (w / h).toFixed(4));
    }
  };
  if (img.complete && img.naturalWidth) set();
  else img.addEventListener("load", set, { once: true });
}

/* ---------- 套用目前狀態 ---------- */
function apply(first) {
  var win = thin ? WIN_M : WIN_PC;
  for (var i = 0; i < leaves.length; i++) {
    var lf = leaves[i];
    var flipped = i < pos;
    lf.classList.toggle("flipped", flipped);
    lf.style.zIndex = flipped ? (leaves.length + i) : (leaves.length - i);

    var near = (i >= pos - win && i <= pos + win);
    if (thin) {
      lf.style.display = near ? "" : "none";
      if (near) hydrate(lf);
    } else {
      lf.style.display = (i >= pos - WIN_PC && i <= pos + WIN_PC) ? "" : "none";
      hydrate(lf);
    }
  }
  document.body.classList.toggle("at-start", pos === 0);
  document.body.classList.toggle("at-end", pos === limit && limit > 0);
  meter();
}

/* ---------- 目前在第幾面 ---------- */
function curFace() {
  if (mobile) return Math.min(pos, faces.length - 1);
  if (pos === 0) return 0;
  var right = 2 * pos;
  return right < faces.length ? right : 2 * pos - 1;
}

function meter() {
  var f = faces[curFace()] || faces[0];
  var c = A.章節[f.ci];
  chNow.textContent = (f.k === "cover") ? "封面" : (f.k === "end" ? "結語" : (c ? c.標題 : ""));
  pgNow.textContent = f.no ? (f.no + " / " + faces.filter(function (x) { return x.no; }).length) : "";
  fill.style.width = (limit ? (pos / limit * 100) : 0) + "%";
  btnPrev.disabled = pos <= 0;
  btnNext.disabled = pos >= limit;
  var ac = c && c.色 ? c.色 : "#A98A5B";
  document.documentElement.style.setProperty("--accent", ac);
}

/* ============================================================
   五、翻頁
   ============================================================ */
function go(d) {
  if (animating) return;
  var to = pos + d;
  if (to < 0 || to > limit) return;
  var idx = d > 0 ? pos : pos - 1;
  var lf = leaves[idx];
  animating = true;
  pos = to;

  if (lf) {
    lf.style.display = "";
    hydrate(lf);
    lf.classList.add("flipping");
    lf.classList.toggle("rev", d < 0);   // 往回翻時，正反面出現的順序是相反的
    lf.style.zIndex = leaves.length * 3;
  }
  apply();
  setTimeout(function () {
    if (lf) { lf.classList.remove("flipping"); lf.classList.remove("rev"); }
    animating = false;
    apply();
  }, flipMs());
}

function jump(p) {
  if (p === pos) return;
  pos = Math.max(0, Math.min(limit, p));
  for (var i = 0; i < leaves.length; i++) {
    leaves[i].classList.remove("flipping");
    leaves[i].classList.remove("rev");
  }
  animating = false;
  // 跳頁不要走翻頁動畫（一次翻十幾頁看起來像壞掉），關掉 transition 直接就位
  document.body.classList.add("no-anim");
  apply();
  void book.offsetWidth;
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { document.body.classList.remove("no-anim"); });
  });
}

function jumpFace(fi) {
  jump(mobile ? fi : Math.floor((fi + 1) / 2));
}

/* ============================================================
   六、自動播放
   ============================================================ */
function autoTick() {
  if (!autoOn) return;
  if (pos >= limit) jump(0); else go(1);
}
function startAuto() {
  autoOn = true;
  btnAuto.classList.add("on");
  btnAuto.textContent = "播放中";
  clearInterval(autoTimer);
  autoTimer = setInterval(autoTick, AUTO_MS);
}
function stopAuto() {
  autoOn = false;
  btnAuto.classList.remove("on");
  btnAuto.textContent = "自動播放";
  clearInterval(autoTimer);
}
function pauseAuto() { if (autoOn) stopAuto(); }

/* ============================================================
   七、音樂
   ============================================================ */
var sndOn = false;
function setSnd(on) {
  sndOn = on;
  btnSnd.classList.toggle("on", on);
  btnSnd.textContent = on ? "音樂 開" : "音樂 關";
  if (on) { bgm.play().catch(function () {}); } else { bgm.pause(); }
}

/* ============================================================
   八、目錄
   ============================================================ */
function buildToc() {
  var ol = $("#toc-list");
  ol.innerHTML = "";
  faces.forEach(function (f, i) {
    if (f.k !== "ch") return;
    var c = A.章節[f.ci];
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.innerHTML = '<span class="n">第 ' + esc(c.序) + ' 章</span>' +
                  '<span class="t">' + esc(c.標題) + "</span>" +
                  '<span class="p">' + (faces[i + 1] ? (faces[i + 1].no || "") : "") + "</span>";
    b.addEventListener("click", function () {
      pauseAuto(); closeToc(); jumpFace(i);
    });
    li.appendChild(b); ol.appendChild(li);
  });
}
function openToc() { pauseAuto(); toc.hidden = false; requestAnimationFrame(function(){ toc.classList.add("open"); }); }
function closeToc() { toc.classList.remove("open"); setTimeout(function () { toc.hidden = true; }, 400); }

/* ============================================================
   九、事件
   ============================================================ */
function onViewport() {
  var w = window.innerWidth, h = window.innerHeight;
  if (w === baseW && Math.abs(h - baseH) < 150) return;   // 手機網址列收合，不要重建
  baseW = w; baseH = h;
  var m = isSingle(), t = isThin();
  if (m !== mobile || t !== thin) { build(); } else { sizeUp(); }
}

function bind() {
  btnPrev.addEventListener("click", function () { pauseAuto(); go(-1); });
  btnNext.addEventListener("click", function () { pauseAuto(); go(1); });
  btnToc .addEventListener("click", openToc);
  $("#toc-x").addEventListener("click", closeToc);
  btnAuto.addEventListener("click", function () { autoOn ? stopAuto() : startAuto(); });
  btnSnd .addEventListener("click", function () { setSnd(!sndOn); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "PageDown") { pauseAuto(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { pauseAuto(); go(-1); }
    else if (e.key === "Escape") closeToc();
  });

  // 點左右半邊翻頁
  stage.addEventListener("click", function (e) {
    if (gate.classList.contains("away") === false) return;
    var x = e.clientX / window.innerWidth;
    pauseAuto();
    if (x > 0.55) go(1); else if (x < 0.45) go(-1);
  });

  // 觸控滑動
  var sx = 0, sy = 0, tracking = false;
  stage.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (!tracking) return; tracking = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      pauseAuto();
      go(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  // 滾輪
  var wheelLock = 0;
  stage.addEventListener("wheel", function (e) {
    var now = Date.now();
    if (now - wheelLock < 480) return;
    if (Math.abs(e.deltaY) < 12 && Math.abs(e.deltaX) < 12) return;
    wheelLock = now; pauseAuto();
    go((e.deltaY > 0 || e.deltaX > 0) ? 1 : -1);
  }, { passive: true });

  window.addEventListener("resize", onViewport);
  window.addEventListener("orientationchange", function () {
    setTimeout(function () { baseW = 0; onViewport(); }, 260);
  });
}

/* ============================================================
   十、開場
   ============================================================ */
function enter(withMusic) {
  gate.classList.add("away");
  stage.hidden = false; corner.hidden = false; bar.hidden = false;
  setTimeout(function () { gate.style.display = "none"; }, 900);
  if (withMusic) setSnd(true); else setSnd(false);
}

function start() {
  document.title = A.網頁標題 || "Our Story";
  baseW = window.innerWidth; baseH = window.innerHeight;

  // 開場遮罩文字
  var cv = A.封面;
  $(".g-kicker").textContent = cv.卷首 || "";
  $(".g-title").textContent  = cv.主標 || "";
  $(".g-sub").textContent    = cv.副標 || "";
  $(".g-note").textContent   = cv.小字 || "";
  gateArt.style.backgroundImage = 'url("photos/' + cv.圖 + '")';
  var pre = new Image();
  pre.onload = function () { gateArt.classList.add("on"); };
  pre.src = "photos/" + cv.圖;

  if (A.音樂 && A.音樂.檔名) {
    bgm.src = "music/" + A.音樂.檔名;
    bgm.volume = typeof A.音樂.音量 === "number" ? A.音樂.音量 : 0.32;
  }

  buildFaces();
  build();
  buildToc();
  bind();

  $("#go-music").addEventListener("click", function () { enter(true); });
  $("#go-mute") .addEventListener("click", function () { enter(false); });
}

/* 除錯用：主控台可以 __album.jump(12) 直接跳到第 12 個跨頁 */
window.__album = {
  jump: jump, jumpFace: jumpFace,
  get pos() { return pos; },
  get faces() { return faces; }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else { start(); }

})();
