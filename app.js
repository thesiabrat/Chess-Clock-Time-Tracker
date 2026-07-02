(function () {
  "use strict";

  var STORAGE_KEY = "timeTracker.v1";
  var PALETTE = [
    "#4f8ef7", "#f77f4f", "#4ff78a", "#f74f9e",
    "#f7d34f", "#9e4ff7", "#4ff7e0", "#f74f4f",
    "#7ff74f", "#4f7ff7"
  ];

  // ---------- state ----------
  var state = load() || {
    categories: [
      { id: uid(), name: "Deep Work", color: PALETTE[0], archived: false },
      { id: uid(), name: "Email", color: PALETTE[1], archived: false },
      { id: uid(), name: "Break", color: PALETTE[2], archived: false }
    ],
    events: [],       // { id, categoryId, start, end }  end === null means running
    paused: false
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getOpenEvent() {
    var events = state.events;
    for (var i = events.length - 1; i >= 0; i--) {
      if (events[i].end === null) return events[i];
    }
    return null;
  }

  function switchTo(categoryId) {
    var now = Date.now();
    var open = getOpenEvent();
    if (open) open.end = now;
    state.events.push({ id: uid(), categoryId: categoryId, start: now, end: null });
    state.paused = false;
    save();
    render();
  }

  function togglePause() {
    var now = Date.now();
    var open = getOpenEvent();
    if (open) {
      // pause: close the running event, remember which category to resume
      state.paused = { categoryId: open.categoryId };
      open.end = now;
    } else if (state.paused) {
      state.events.push({ id: uid(), categoryId: state.paused.categoryId, start: now, end: null });
      state.paused = false;
    }
    save();
    render();
  }

  function stopTimer() {
    var open = getOpenEvent();
    if (open) open.end = Date.now();
    state.paused = false;
    save();
    render();
  }

  function clearHistory() {
    var ok = window.confirm("Clear all logged history? This cannot be undone. Your categories will be kept.");
    if (!ok) return;
    state.events = [];
    state.paused = false;
    save();
    render();
  }

  // ---------- category CRUD ----------
  function nextColor() {
    var used = state.categories.map(function (c) { return c.color; });
    for (var i = 0; i < PALETTE.length; i++) {
      if (used.indexOf(PALETTE[i]) === -1) return PALETTE[i];
    }
    return PALETTE[state.categories.length % PALETTE.length];
  }

  function addCategory(name, color) {
    var cat = { id: uid(), name: name, color: color, archived: false };
    state.categories.push(cat);
    save();
    render();
    return cat;
  }

  function updateCategory(id, name, color) {
    var cat = state.categories.filter(function (c) { return c.id === id; })[0];
    if (!cat) return;
    cat.name = name;
    cat.color = color;
    save();
    render();
  }

  function archiveCategory(id) {
    var cat = state.categories.filter(function (c) { return c.id === id; })[0];
    if (!cat) return;
    cat.archived = true;
    var open = getOpenEvent();
    if (open && open.categoryId === id) {
      open.end = Date.now();
      state.paused = false;
    }
    save();
    render();
  }

  // ---------- time helpers ----------
  function fmtHMS(ms) {
    var totalSec = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    return pad(h) + ":" + pad(m) + ":" + pad(s);
  }
  function fmtShort(ms) {
    var totalMin = Math.round(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h === 0) return m + "m";
    return h + "h " + m + "m";
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function dayKey(date) {
    var d = new Date(date);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function dayLabel(key) {
    var today = dayKey(Date.now());
    var yestKey = dayKey(Date.now() - 86400000);
    if (key === today) return "Today";
    if (key === yestKey) return "Yesterday";
    var d = new Date(key + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  // splits events into per-local-day segments: { date, categoryId, ms }
  function daySegments() {
    var now = Date.now();
    var segs = [];
    state.events.forEach(function (ev) {
      var start = ev.start;
      var end = ev.end === null ? now : ev.end;
      while (start < end) {
        var d = new Date(start);
        var midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
        var segEnd = Math.min(end, midnight);
        segs.push({ date: dayKey(start), categoryId: ev.categoryId, ms: segEnd - start });
        start = segEnd;
      }
    });
    return segs;
  }

  function totalsForDay(key) {
    var segs = daySegments().filter(function (s) { return s.date === key; });
    var totals = {};
    segs.forEach(function (s) {
      totals[s.categoryId] = (totals[s.categoryId] || 0) + s.ms;
    });
    return totals;
  }

  function catById(id) {
    return state.categories.filter(function (c) { return c.id === id; })[0];
  }

  // ---------- rendering ----------
  var els = {};
  function cacheEls() {
    els.wallDate = document.getElementById("wallDate");
    els.wallTime = document.getElementById("wallTime");
    els.nowLabel = document.getElementById("nowLabel");
    els.nowClock = document.getElementById("nowClock");
    els.nowCard = document.getElementById("nowCard");
    els.pauseBtn = document.getElementById("pauseBtn");
    els.stopBtn = document.getElementById("stopBtn");
    els.catGrid = document.getElementById("catGrid");
    els.addCatBtn = document.getElementById("addCatBtn");
    els.editModeBtn = document.getElementById("editModeBtn");
    els.historyList = document.getElementById("historyList");
    els.exportBtn = document.getElementById("exportBtn");
    els.clearHistoryBtn = document.getElementById("clearHistoryBtn");
    els.tabs = document.querySelectorAll(".tab");
    els.views = document.querySelectorAll(".view");
    els.catModal = document.getElementById("catModal");
    els.catModalTitle = document.getElementById("catModalTitle");
    els.catNameInput = document.getElementById("catNameInput");
    els.colorRow = document.getElementById("colorRow");
    els.catSaveBtn = document.getElementById("catSaveBtn");
    els.catCancelBtn = document.getElementById("catCancelBtn");
    els.catDeleteBtn = document.getElementById("catDeleteBtn");
  }

  function renderWallClock() {
    var now = new Date();
    els.wallDate.textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    els.wallTime.textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function renderNow() {
    renderWallClock();
    var open = getOpenEvent();
    if (open) {
      var cat = catById(open.categoryId);
      els.nowLabel.textContent = cat ? cat.name : "Unknown";
      els.nowLabel.style.color = cat ? cat.color : "";
      els.nowClock.textContent = fmtHMS(Date.now() - open.start);
      els.pauseBtn.textContent = "Pause";
      els.pauseBtn.classList.remove("is-paused");
      els.pauseBtn.classList.remove("hidden");
      els.stopBtn.classList.remove("hidden");
    } else if (state.paused) {
      var pcat = catById(state.paused.categoryId);
      els.nowLabel.textContent = (pcat ? pcat.name : "Unknown") + " (paused)";
      els.nowLabel.style.color = pcat ? pcat.color : "";
      els.pauseBtn.textContent = "Resume";
      els.pauseBtn.classList.add("is-paused");
      els.pauseBtn.classList.remove("hidden");
      els.stopBtn.classList.remove("hidden");
    } else {
      els.nowLabel.textContent = "Nothing running";
      els.nowLabel.style.color = "";
      els.nowClock.textContent = "00:00:00";
      els.pauseBtn.textContent = "Pause";
      els.pauseBtn.classList.remove("is-paused");
      els.pauseBtn.classList.add("hidden");
      els.stopBtn.classList.add("hidden");
    }
  }

  var editMode = false;

  function renderGrid() {
    var todayTotals = totalsForDay(dayKey(Date.now()));
    var open = getOpenEvent();
    els.catGrid.innerHTML = "";
    state.categories
      .filter(function (c) { return !c.archived; })
      .forEach(function (cat) {
        var btn = document.createElement("button");
        btn.className = "cat-btn" + (open && open.categoryId === cat.id ? " is-active" : "");
        btn.style.background = cat.color + "33";
        btn.style.color = "#fff";

        var name = document.createElement("div");
        name.className = "cat-name";
        name.textContent = cat.name;

        var time = document.createElement("div");
        time.className = "cat-time";
        time.textContent = fmtShort(todayTotals[cat.id] || 0) + " today";

        btn.appendChild(name);
        btn.appendChild(time);

        btn.addEventListener("click", function () {
          if (editMode) {
            openCatModal(cat);
          } else {
            switchTo(cat.id);
          }
        });

        els.catGrid.appendChild(btn);
      });
  }

  function renderHistory() {
    var segs = daySegments();
    var byDay = {};
    segs.forEach(function (s) {
      if (!byDay[s.date]) byDay[s.date] = {};
      byDay[s.date][s.categoryId] = (byDay[s.date][s.categoryId] || 0) + s.ms;
    });
    var days = Object.keys(byDay).sort().reverse();

    els.historyList.innerHTML = "";
    if (days.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No activity yet. Tap a category on the Timer tab to start tracking.";
      els.historyList.appendChild(empty);
      return;
    }

    days.forEach(function (key) {
      var totals = byDay[key];
      var dayTotal = Object.keys(totals).reduce(function (sum, k) { return sum + totals[k]; }, 0);
      var rows = Object.keys(totals)
        .map(function (id) { return { cat: catById(id), ms: totals[id], id: id }; })
        .sort(function (a, b) { return b.ms - a.ms; });

      var card = document.createElement("div");
      card.className = "day-card";

      var title = document.createElement("div");
      title.className = "day-title";
      var titleName = document.createElement("span");
      titleName.textContent = dayLabel(key);
      var titleTotal = document.createElement("span");
      titleTotal.textContent = fmtShort(dayTotal);
      title.appendChild(titleName);
      title.appendChild(titleTotal);
      card.appendChild(title);

      var bar = document.createElement("div");
      bar.className = "day-bar";
      rows.forEach(function (r) {
        var seg = document.createElement("span");
        seg.style.width = (dayTotal ? (r.ms / dayTotal * 100) : 0) + "%";
        seg.style.background = r.cat ? r.cat.color : "#666";
        bar.appendChild(seg);
      });
      card.appendChild(bar);

      var rowsEl = document.createElement("div");
      rowsEl.className = "day-rows";
      rows.forEach(function (r) {
        var row = document.createElement("div");
        row.className = "day-row";
        var nameWrap = document.createElement("span");
        nameWrap.className = "row-name";
        var dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = r.cat ? r.cat.color : "#666";
        nameWrap.appendChild(dot);
        var nameText = document.createElement("span");
        nameText.textContent = r.cat ? r.cat.name : "(deleted)";
        nameWrap.appendChild(nameText);
        var timeEl = document.createElement("span");
        timeEl.className = "row-time";
        timeEl.textContent = fmtShort(r.ms);
        row.appendChild(nameWrap);
        row.appendChild(timeEl);
        rowsEl.appendChild(row);
      });
      card.appendChild(rowsEl);

      els.historyList.appendChild(card);
    });
  }

  function render() {
    renderNow();
    renderGrid();
    renderHistory();
  }

  // ---------- category modal ----------
  var editingCatId = null;
  var selectedColor = PALETTE[0];

  function openCatModal(cat) {
    editingCatId = cat ? cat.id : null;
    els.catModalTitle.textContent = cat ? "Edit category" : "New category";
    els.catNameInput.value = cat ? cat.name : "";
    selectedColor = cat ? cat.color : nextColor();
    els.catDeleteBtn.classList.toggle("hidden", !cat);
    buildColorRow();
    els.catModal.classList.add("open");
    setTimeout(function () { els.catNameInput.focus(); }, 50);
  }

  function closeCatModal() {
    els.catModal.classList.remove("open");
    editingCatId = null;
  }

  function buildColorRow() {
    els.colorRow.innerHTML = "";
    PALETTE.forEach(function (color) {
      var sw = document.createElement("button");
      sw.className = "color-swatch" + (color === selectedColor ? " selected" : "");
      sw.style.background = color;
      sw.addEventListener("click", function () {
        selectedColor = color;
        buildColorRow();
      });
      els.colorRow.appendChild(sw);
    });
  }

  // ---------- CSV export ----------
  function exportCSV() {
    var rows = [["category", "start", "end", "duration_seconds"]];
    var now = Date.now();
    state.events.forEach(function (ev) {
      var cat = catById(ev.categoryId);
      var end = ev.end === null ? now : ev.end;
      rows.push([
        cat ? cat.name : "(deleted)",
        new Date(ev.start).toISOString(),
        new Date(end).toISOString(),
        Math.round((end - ev.start) / 1000)
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\n");

    var blob = new Blob([csv], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "time-tracker-" + dayKey(Date.now()) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- wiring ----------
  function wire() {
    els.pauseBtn.addEventListener("click", togglePause);
    els.stopBtn.addEventListener("click", stopTimer);
    els.addCatBtn.addEventListener("click", function () { openCatModal(null); });
    els.exportBtn.addEventListener("click", exportCSV);
    els.clearHistoryBtn.addEventListener("click", clearHistory);
    els.editModeBtn.addEventListener("click", function () {
      editMode = !editMode;
      els.editModeBtn.textContent = editMode ? "Done" : "Edit";
      els.editModeBtn.classList.toggle("active", editMode);
      els.catGrid.classList.toggle("edit-mode", editMode);
    });

    els.catCancelBtn.addEventListener("click", closeCatModal);
    els.catModal.addEventListener("click", function (e) {
      if (e.target === els.catModal) closeCatModal();
    });
    els.catSaveBtn.addEventListener("click", function () {
      var name = els.catNameInput.value.trim();
      if (!name) return;
      if (editingCatId) {
        updateCategory(editingCatId, name, selectedColor);
      } else {
        addCategory(name, selectedColor);
      }
      closeCatModal();
    });
    els.catDeleteBtn.addEventListener("click", function () {
      if (editingCatId) archiveCategory(editingCatId);
      closeCatModal();
    });

    els.tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        els.tabs.forEach(function (t) { t.classList.remove("active"); });
        els.views.forEach(function (v) { v.classList.remove("active"); });
        tab.classList.add("active");
        document.getElementById("view-" + tab.dataset.view).classList.add("active");
        if (tab.dataset.view === "history") renderHistory();
      });
    });

  }

  function init() {
    cacheEls();
    wire();
    render();
    setInterval(renderNow, 1000);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
