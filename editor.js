/* Редактор документа «Пульт оптимизации».
   Подключается отдельным файлом: если здесь что-то сломается,
   сам документ продолжит открываться и читаться как обычно. */
(function () {
  "use strict";

  var REPO   = "tork059/resan-ut-optimization";
  var FILE   = "index.html";
  var BRANCH = "main";
  var LSKEY  = "pult.gh.token";
  var API    = "https://api.github.com";

  /* Области, которые можно править. Порядок элементов на живой странице
     и в исходнике совпадает — по нему и переносятся изменения. */
  var ZONES = [
    ".head",
    "#res .res",
    "#p1 .main", "#p1 .side",
    "#p2 .main", "#p2 .side",
    "#p3 .main", "#p3 .side",
    "#q tbody",
    "#och .mx",
    "#meas tbody",
    "#qa tbody",
    ".feed",
    "footer"
  ];

  /* Таблицы, в которых можно добавлять и удалять строки */
  var ROW_TABLES = ["#q", "#meas", "#qa"];

  var token = null, baseSha = null, editing = false, dirty = false;
  var btn, bar;

  /* ───────────────────────── оформление ───────────────────────── */
  var css = document.createElement("style");
  css.textContent = [
    ".ed-bar{display:flex;gap:6px;align-items:center}",
    ".ed-bar button{font:inherit;font-size:11.5px;font-family:var(--m);background:transparent;color:inherit;border:1px solid currentColor;opacity:.6;padding:4px 9px;cursor:pointer;white-space:nowrap}",
    ".ed-bar button:hover{opacity:1;color:var(--acc)}",
    ".ed-bar button.on{opacity:1;background:var(--acc);color:#fff;border-color:var(--acc)}",
    ".ed-bar .ed-state{font-family:var(--m);font-size:11px;opacity:.7;white-space:nowrap}",
    "body.ed-on [data-ed]{outline:1px dashed var(--rule-2);outline-offset:3px}",
    "body.ed-on [data-ed]:focus{outline:2px solid var(--acc);outline-offset:3px}",
    "body.ed-on #q tbody tr,body.ed-on #meas tbody tr,body.ed-on #qa tbody tr{position:relative}",
    "body.ed-on td:last-child{position:relative}",
    ".ed-del{position:absolute;top:4px;right:4px;z-index:5;font:inherit;font-size:11px;line-height:1;padding:2px 5px;border:1px solid var(--bad);color:var(--bad);background:var(--paper);cursor:pointer;opacity:.45}",
    ".ed-del:hover{opacity:1;background:var(--bad);color:#fff}",
    ".ed-add{margin:8px 0 0;font:inherit;font-size:12px;padding:4px 10px;border:1px dashed var(--acc);color:var(--acc-ink);background:transparent;cursor:pointer}",
    ".ed-add:hover{background:var(--acc-soft)}",
    ".ed-modal{position:fixed;inset:0;z-index:100;background:rgba(10,10,14,.55);display:flex;align-items:center;justify-content:center;padding:16px}",
    ".ed-win{background:var(--paper);border:1px solid var(--rule-2);max-width:520px;width:100%;padding:20px;display:grid;gap:12px;box-shadow:0 18px 50px rgba(0,0,0,.25)}",
    ".ed-win h3{font-size:17px}",
    ".ed-win p{font-size:13.5px;color:var(--dim);margin:0}",
    ".ed-win input{font:inherit;font-family:var(--m);font-size:13px;padding:8px 10px;border:1px solid var(--rule-2);background:var(--paper-2);color:var(--ink);width:100%}",
    ".ed-win .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}",
    ".ed-win button{font:inherit;font-size:13px;padding:7px 14px;border:1px solid var(--rule-2);background:var(--paper);color:var(--ink);cursor:pointer}",
    ".ed-win button.go{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600}",
    ".ed-win .err{color:var(--bad);font-size:13px}",
    ".ed-win ol{margin:0;padding-left:20px;font-size:13px;color:var(--dim);display:grid;gap:4px}",
    ".ed-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:110;background:var(--ink);color:var(--bg);font-size:13.5px;padding:10px 16px;max-width:90vw}",
    ".ed-toast.bad{background:var(--bad);color:#fff}",
    "@media print{.ed-bar,.ed-del,.ed-add{display:none!important}}"
  ].join("\n");
  document.head.appendChild(css);

  /* ───────────────────────── мелкие помощники ───────────────────────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toast(msg, bad) {
    var t = el("div", "ed-toast" + (bad ? " bad" : ""), msg);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 7000 : 4000);
  }
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function b64decode(str) {
    var bin = atob(String(str).replace(/\s/g, ""));
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(arr);
  }
  function gh(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }, opts.headers || {}, token ? { "Authorization": "Bearer " + token } : {});
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; },
                           function ()  { return { ok: r.ok, status: r.status, body: {} }; });
    });
  }

  /* ───────────────────────── панель ───────────────────────── */
  function buildBar() {
    btn = document.getElementById("ghbtn");
    if (!btn) return false;
    btn.hidden = false;
    bar = el("span", "ed-bar");
    btn.parentNode.insertBefore(bar, btn);
    bar.appendChild(btn);
    btn.addEventListener("click", onMainBtn);
    return true;
  }

  function renderBar() {
    bar.querySelectorAll(".ed-extra").forEach(function (n) { n.remove(); });
    if (!token) {
      btn.textContent = "вход";
      btn.classList.remove("on");
      return;
    }
    btn.textContent = editing ? "просмотр" : "редактировать";
    btn.classList.toggle("on", editing);
    if (editing) {
      var save = el("button", "ed-extra", "сохранить");
      save.type = "button";
      save.addEventListener("click", doSave);
      bar.appendChild(save);
      var st = el("span", "ed-state ed-extra", dirty ? "есть правки" : "без правок");
      bar.appendChild(st);
    }
    var out = el("button", "ed-extra", "выход");
    out.type = "button";
    out.addEventListener("click", function () {
      if (dirty && !confirm("Есть несохранённые правки. Выйти и потерять их?")) return;
      localStorage.removeItem(LSKEY);
      token = null; dirty = false;
      setEditing(false);
      renderBar();
      toast("Токен удалён из браузера");
    });
    bar.appendChild(out);
  }

  function onMainBtn() {
    if (!token) { openLogin(); return; }
    if (editing && dirty && !confirm("Есть несохранённые правки. Выйти из режима правки и потерять их?")) return;
    setEditing(!editing);
    renderBar();
  }

  /* ───────────────────────── вход ───────────────────────── */
  function openLogin() {
    var back = el("div", "ed-modal");
    var win = el("div", "ed-win");
    win.appendChild(el("h3", null, "Вход для редактирования"));
    win.appendChild(el("p", null,
      "Нужен персональный токен GitHub с правом записи в этот репозиторий. Токен сохранится в этом браузере и никуда больше не передаётся — только на api.github.com при сохранении."));
    var ol = document.createElement("ol");
    [
      "GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token",
      "Repository access: Only select repositories → resan-ut-optimization",
      "Permissions → Repository permissions → Contents: Read and write",
      "Срок жизни поставьте покороче и скопируйте токен сюда"
    ].forEach(function (t) { ol.appendChild(el("li", null, t)); });
    win.appendChild(ol);
    var inp = document.createElement("input");
    inp.type = "password";
    inp.placeholder = "github_pat_…";
    inp.autocomplete = "off";
    win.appendChild(inp);
    var err = el("p", "err");
    err.hidden = true;
    win.appendChild(err);
    var row = el("div", "row");
    var cancel = el("button", null, "Отмена");
    cancel.type = "button";
    cancel.addEventListener("click", function () { back.remove(); });
    var go = el("button", "go", "Войти");
    go.type = "button";
    row.appendChild(cancel); row.appendChild(go);
    win.appendChild(row);
    back.appendChild(win);
    document.body.appendChild(back);
    inp.focus();

    function attempt() {
      var v = inp.value.trim();
      if (!v) return;
      go.disabled = true; go.textContent = "Проверяю…"; err.hidden = true;
      token = v;
      gh("/repos/" + REPO).then(function (r) {
        if (!r.ok) throw new Error(r.status === 401 ? "Токен не принят" : "Репозиторий недоступен для этого токена");
        if (!(r.body.permissions && r.body.permissions.push)) throw new Error("У токена нет права записи в репозиторий");
        return loadSha();
      }).then(function () {
        localStorage.setItem(LSKEY, token);
        back.remove();
        setEditing(true);
        renderBar();
        toast("Вход выполнен, режим правки включён");
      }).catch(function (e) {
        token = null;
        go.disabled = false; go.textContent = "Войти";
        err.textContent = e.message || "Не удалось войти";
        err.hidden = false;
      });
    }
    go.addEventListener("click", attempt);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
    back.addEventListener("click", function (e) { if (e.target === back) back.remove(); });
  }

  function loadSha() {
    return gh("/repos/" + REPO + "/contents/" + FILE + "?ref=" + BRANCH).then(function (r) {
      if (!r.ok) throw new Error("Не удалось прочитать файл в репозитории");
      baseSha = r.body.sha;
      return r.body;
    });
  }

  /* ───────────────────────── режим правки ───────────────────────── */
  function zoneNodes() {
    var out = [];
    ZONES.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    });
    return out;
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("ed-on", on);
    zoneNodes().forEach(function (n) {
      if (on) {
        n.setAttribute("data-ed", "1");
        n.setAttribute("contenteditable", "true");
        n.setAttribute("spellcheck", "false");
      } else {
        n.removeAttribute("data-ed");
        n.removeAttribute("contenteditable");
        n.removeAttribute("spellcheck");
      }
    });
    document.querySelectorAll(".ed-del,.ed-add").forEach(function (n) { n.remove(); });
    if (on) addRowTools();
  }

  function addRowTools() {
    ROW_TABLES.forEach(function (sel) {
      var table = document.querySelector(sel);
      if (!table) return;
      table.querySelectorAll("tbody tr").forEach(decorateRow);
      var wrap = table.closest(".tw") || table.parentNode;
      var add = el("button", "ed-add", "+ строка");
      add.type = "button";
      add.contentEditable = "false";
      add.addEventListener("click", function () {
        var tb = table.querySelector("tbody");
        var last = tb.querySelector("tr:last-child");
        if (!last) return;
        var row = last.cloneNode(true);
        row.querySelectorAll(".ed-del").forEach(function (n) { n.remove(); });
        row.classList.remove("off");
        row.querySelectorAll("td").forEach(function (td) { td.textContent = ""; });
        tb.appendChild(row);
        decorateRow(row);
        markDirty();
        row.scrollIntoView({ block: "center" });
      });
      wrap.parentNode.insertBefore(add, wrap.nextSibling);
    });
  }

  function decorateRow(tr) {
    if (tr.querySelector(".ed-del")) return;
    var td = tr.querySelector("td:last-child");
    if (!td) return;
    var x = el("button", "ed-del", "✕");
    x.type = "button";
    x.title = "Удалить строку";
    x.contentEditable = "false";
    x.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!confirm("Удалить эту строку?")) return;
      tr.remove();
      markDirty();
    });
    td.appendChild(x);
  }

  function markDirty() {
    if (!dirty) { dirty = true; renderBar(); }
  }
  document.addEventListener("input", function () { if (editing) markDirty(); });
  window.addEventListener("beforeunload", function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ───────────────────────── сборка файла ───────────────────────── */
  function cleanClone(node) {
    var c = node.cloneNode(true);
    c.querySelectorAll(".ed-del,.ed-add,.ed-bar,.ed-modal,.ed-toast").forEach(function (n) { n.remove(); });
    c.querySelectorAll("[contenteditable]").forEach(function (n) { n.removeAttribute("contenteditable"); });
    c.querySelectorAll("[spellcheck]").forEach(function (n) { n.removeAttribute("spellcheck"); });
    c.querySelectorAll("[data-ed]").forEach(function (n) { n.removeAttribute("data-ed"); });
    c.querySelectorAll(".off").forEach(function (n) { n.classList.remove("off"); });
    c.querySelectorAll("#map").forEach(function (n) { n.innerHTML = ""; });
    c.querySelectorAll('[class=""]').forEach(function (n) { n.removeAttribute("class"); });
    if (c.id === "map") c.innerHTML = "";
    return c;
  }

  function buildFile(sourceText) {
    var doc = new DOMParser().parseFromString(sourceText, "text/html");
    var problems = [];
    ZONES.forEach(function (sel) {
      var live = document.querySelectorAll(sel);
      var dst  = doc.querySelectorAll(sel);
      if (live.length !== dst.length) { problems.push(sel); return; }
      for (var i = 0; i < live.length; i++) {
        dst[i].innerHTML = cleanClone(live[i]).innerHTML;
      }
    });
    if (problems.length) {
      throw new Error("Структура страницы разошлась с исходником: " + problems.join(", ") +
        ". Перезагрузите страницу и попробуйте снова.");
    }
    var ghb = doc.getElementById("ghbtn");
    if (ghb) ghb.setAttribute("hidden", "");
    return "<!doctype html>\n" + doc.documentElement.outerHTML + "\n";
  }

  function resetComputed() {
    var all = document.querySelector('.filt button[data-f="all"]');
    if (all && all.getAttribute("aria-pressed") !== "true") all.click();
    var now = document.getElementById("bn");
    if (now && now.getAttribute("aria-pressed") !== "true") now.click();
  }

  /* ───────────────────────── сохранение ───────────────────────── */
  function doSave() {
    if (!token) return;
    resetComputed();
    var msg = prompt("Что поменяли? Короткой строкой — она станет описанием правки.", "Правка документа");
    if (msg === null) return;
    msg = (msg || "").trim() || "Правка документа";

    toast("Сохраняю…");
    gh("/repos/" + REPO + "/contents/" + FILE + "?ref=" + BRANCH).then(function (r) {
      if (!r.ok) throw new Error("Не удалось прочитать файл в репозитории");
      if (baseSha && r.body.sha !== baseSha) {
        throw new Error("Файл в репозитории изменился с момента, когда вы открыли страницу. " +
          "Чтобы не затереть чужие правки, перезагрузите страницу и внесите свои заново.");
      }
      var source = b64decode(r.body.content);
      var out = buildFile(source);
      if (out.length < source.length * 0.5) {
        throw new Error("Результат вдвое короче исходника — похоже на сбой сборки. Сохранение отменено.");
      }
      return gh("/repos/" + REPO + "/contents/" + FILE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          content: b64encode(out),
          sha: r.body.sha,
          branch: BRANCH
        })
      });
    }).then(function (r) {
      if (!r.ok) {
        throw new Error((r.body && r.body.message) ? r.body.message : "GitHub отклонил сохранение");
      }
      baseSha = r.body.content && r.body.content.sha;
      dirty = false;
      renderBar();
      toast("Сохранено. Страница пересоберётся за минуту-другую.");
    }).catch(function (e) {
      toast(e.message || "Не удалось сохранить", true);
    });
  }

  /* ───────────────────────── запуск ───────────────────────── */
  try {
    if (!buildBar()) return;
    var saved = null;
    try { saved = localStorage.getItem(LSKEY); } catch (e) { saved = null; }
    if (saved) {
      token = saved;
      gh("/repos/" + REPO).then(function (r) {
        if (!r.ok || !(r.body.permissions && r.body.permissions.push)) {
          token = null;
          try { localStorage.removeItem(LSKEY); } catch (e) {}
          renderBar();
          return;
        }
        return loadSha().then(renderBar);
      }).catch(function () { token = null; renderBar(); });
    }
    renderBar();
  } catch (e) {
    /* документ должен открываться даже если редактор не завёлся */
  }
})();
