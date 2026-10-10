// ==========================================================================
// جدول پیش‌نمایش برنامه — رندر، انتخاب خانه‌ها، ویرایش درجا، عملیات گروهی
// ==========================================================================
const ScheduleTable = (() => {
  let lastTable = null;
  let selected = new Set(); // "row,col"
  let clipboardData = null; // 2D array of texts [[t11, t12], [t21, t22]]
  let containerSelector = "#scheduleTableWrap";

  let isDraggingSelect = false;
  let dragStartCell = null; // {row, col}

  function key(r, c) { return `${r},${c}`; }

  function renderCellContent(td, cellData) {
    td.textContent = "";
    const rawText = cellData.text || "";
    if (!rawText.trim()) return;

    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;

    const firstLine = lines[0];
    const extraLines = lines.slice(1);

    if (cellData.link) {
      const a = el("a", {
        href: "#",
        class: "cell-link",
        style: "color:var(--accent);font-weight:600;text-decoration:underline;display:block;margin-bottom:3px;"
      }, `🔗 ${firstLine}`);
      a.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(cellData.link, "_blank");
      });
      td.appendChild(a);
    } else {
      const titleDiv = el("div", { class: "cell-topic-title", style: "font-weight:normal;" }, firstLine);
      td.appendChild(titleDiv);
    }

    if (extraLines.length > 0) {
      const badgesRow = el("div", { class: "preview-badges-row" });
      extraLines.forEach((line) => {
        let badgeClass = "badge-custom";
        let icon = "";
        let displayText = line;

        if (line.includes("تعداد تست") || line.includes("تست:")) {
          badgeClass = "badge-test";
          icon = "✅ ";
          const parts = line.split(":");
          const num = parts.length > 1 ? parts[parts.length - 1].trim() : "";
          displayText = num && !isNaN(num) ? `${num}t` : line;
        } else if (line.includes("تعداد تشریحی") || line.includes("تشریحی:")) {
          badgeClass = "badge-desc";
          icon = "📝 ";
          const parts = line.split(":");
          const num = parts.length > 1 ? parts[parts.length - 1].trim() : "";
          displayText = num && !isNaN(num) ? `${num}d` : line;
        }

        const badge = el("span", { class: `preview-badge ${badgeClass}` }, `${icon}${displayText}`);
        badgesRow.appendChild(badge);
      });
      td.appendChild(badgesRow);
    }
  }

  function clearSelection() {
    selected.clear();
    $$(".day-cell.selected").forEach((c) => c.classList.remove("selected"));
    updateSelectionBar();
  }

  function updateSelectionBar() {
    const bar = $("#selectionBar");
    if (!bar) return;
    if (selected.size === 0) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    $("#selectionCount").textContent = `${selected.size} خانه انتخاب شده`;
  }

  function selectedCellsArray() {
    return Array.from(selected).map((k) => k.split(",").map(Number));
  }

  function copySelectedCells() {
    if (!lastTable || selected.size === 0) return;
    const cells = selectedCellsArray();
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    cells.forEach(([r, c]) => {
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    });

    const grid = [];
    for (let r = minR; r <= maxR; r++) {
      const rowArr = [];
      for (let c = minC; c <= maxC; c++) {
        if (selected.has(key(r, c))) {
          const text = (lastTable.rows[r] && lastTable.rows[r].cells[c]) ? lastTable.rows[r].cells[c].text || "" : "";
          rowArr.push(text);
        } else {
          rowArr.push("");
        }
      }
      grid.push(rowArr);
    }
    clipboardData = grid;
    toastOk(`${selected.size} خانه کپی شد.`);
  }

  async function pasteClipboardCells() {
    if (!lastTable || !clipboardData || !clipboardData.length || selected.size === 0) {
      if (!clipboardData) toastError("ابتدا خانه‌هایی را کپی کنید.");
      return;
    }
    const cells = selectedCellsArray();
    let minR = Infinity, minC = Infinity;
    cells.forEach(([r, c]) => {
      if (r < minR) minR = r;
      if (c < minC) minC = c;
    });

    // جایگذاری گرید کپی‌شده از خانهٔ مینی‌مام به بعد
    for (let rIdx = 0; rIdx < clipboardData.length; rIdx++) {
      const targetR = minR + rIdx;
      if (targetR >= lastTable.rows.length) break;
      for (let cIdx = 0; cIdx < clipboardData[rIdx].length; cIdx++) {
        const targetC = minC + cIdx;
        if (targetC >= lastTable.display_days) break;
        const val = clipboardData[rIdx][cIdx];
        await Api.callT("update_cell", targetR, targetC, val);
      }
    }

    const res = await Api.callT("get_bootstrap");
    if (res && res.table) {
      render(res.table, containerSelector);
      toastOk("محتوای کپی‌شده جایگذاری شد.");
    }
  }

  function selectBox(startR, startC, endR, endC, append = false) {
    if (!append) {
      selected.clear();
      $$(".day-cell.selected").forEach((c) => c.classList.remove("selected"));
    }
    const minR = Math.min(startR, endR);
    const maxR = Math.max(startR, endR);
    const minC = Math.min(startC, endC);
    const maxC = Math.max(startC, endC);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        selected.add(key(r, c));
        const td = $(`td.day-cell[data-row="${r}"][data-col="${c}"]`);
        if (td) td.classList.add("selected");
      }
    }
    updateSelectionBar();
  }

  function render(table, targetSelector) {
    lastTable = table;
    containerSelector = targetSelector || containerSelector;
    const wrap = $(containerSelector);
    if (!wrap) return;

    if (!table.rows.length) {
      wrap.innerHTML = `<div class="empty-table-hint">
        <div style="font-size:30px">🗓️</div>
        <div>هنوز درسی به برنامه اضافه نشده است.</div>
        <div style="font-size:11.5px">از پنل سمت راست یک درس و مبحث انتخاب کنید و «افزودن درس» را بزنید.</div>
      </div>`;
      selected.clear();
      updateSelectionBar();
      return;
    }

    const visibleCols = [];
    for (let c = 0; c < table.display_days; c++) {
      if (!table.hidden_columns.includes(c)) visibleCols.push(c);
    }

    const thead = el("thead", {}, [
      el("tr", {}, [
        el("th", { class: "subject-col" }, "درس"),
        ...visibleCols.map((c) => el("th", {}, `روز ${c + 1}`)),
        el("th", { style: "width:40px" }, ""),
      ]),
    ]);

    const tbody = el("tbody");
    table.rows.forEach((row, rowIdx) => {
      const tr = el("tr");
      tr.appendChild(el("td", { class: "subject-col" }, [
        el("div", {}, row.subject || row.label || ""),
        el("div", { class: "hrs" }, `⏳ ${row.hours || "0"} ساعت`),
      ]));

      visibleCols.forEach((c) => {
        const cellData = row.cells[c];
        const isSel = selected.has(key(rowIdx, c));
        const td = el("td", {
          class: "day-cell" + (cellData.manual ? " manual" : "") + (isSel ? " selected" : ""),
          "data-row": rowIdx, "data-col": c,
        });
        renderCellContent(td, cellData);
        td.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return; // فقط کلید چپ ماوس
          isDraggingSelect = true;
          dragStartCell = { row: rowIdx, col: c };
          selectBox(rowIdx, c, rowIdx, c, e.ctrlKey || e.metaKey);
        });
        td.addEventListener("mouseenter", (e) => {
          if (isDraggingSelect && dragStartCell) {
            selectBox(dragStartCell.row, dragStartCell.col, rowIdx, c, e.ctrlKey || e.metaKey);
          }
        });
        td.addEventListener("dblclick", (e) => onCellEdit(e, rowIdx, c, td, cellData));
        tr.appendChild(td);
      });

      document.addEventListener("mouseup", () => {
        isDraggingSelect = false;
        dragStartCell = null;
      });

      tr.appendChild(el("td", { class: "del-col" }, [
        el("button", { title: "حذف این درس", onclick: () => onDeleteRow(rowIdx) }, "×"),
      ]));

      tbody.appendChild(tr);
    });

    wrap.innerHTML = "";
    const tableEl = el("table", { class: "schedule-table" }, [thead, tbody]);
    wrap.appendChild(tableEl);

    // پاک‌سازی انتخاب‌هایی که دیگر معتبر نیستند
    for (const k of Array.from(selected)) {
      const [r, c] = k.split(",").map(Number);
      if (r >= table.rows.length || !visibleCols.includes(c)) selected.delete(k);
    }
    updateSelectionBar();
  }

  function onCellClick(e, row, col, td) {
    const k = key(row, col);
    if (selected.has(k)) { selected.delete(k); td.classList.remove("selected"); }
    else { selected.add(k); td.classList.add("selected"); }
    updateSelectionBar();
  }

  function onCellEdit(e, row, col, td, cellData) {
    e.stopPropagation();
    const textarea = el("textarea", {}, cellData.text || "");
    td.textContent = "";
    td.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    let saved = false;
    async function save() {
      if (saved) return;
      saved = true;
      const res = await Api.callT("update_cell", row, col, textarea.value);
      if (res) render(res.table, containerSelector);
    }
    textarea.addEventListener("blur", save);
    textarea.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); textarea.blur(); }
      if (ev.key === "Escape") { saved = true; render(lastTable, containerSelector); }
    });
  }

  async function onDeleteRow(row) {
    const ok = await confirmDialog("این درس از برنامه حذف شود؟", { title: "حذف درس" });
    if (!ok) return;
    const res = await Api.callT("remove_subject", row);
    if (res) { render(res.table, containerSelector); refreshSubjectsList(res.table); }
  }

  // -------------------- عملیات گروهی روی انتخاب --------------------
  async function opClear() {
    const cells = selectedCellsArray();
    const res = await Api.callT("clear_cells", cells);
    if (res) { render(res.table, containerSelector); clearSelection(); toastOk("محتوای خانه‌های انتخاب‌شده پاک شد."); }
  }

  async function opPlaceholder() {
    const value = await openBulkContentDialog("جایگزینی محتوا", "متن جدید برای همهٔ خانه‌های انتخاب‌شده جایگزین می‌شود.");
    if (value === null) return;
    const cells = selectedCellsArray();
    const res = await Api.callT("bulk_replace", cells, value);
    if (res) { render(res.table, containerSelector); clearSelection(); toastOk("محتوا جایگزین شد."); }
  }

  async function opInsertShift() {
    const value = await openBulkContentDialog("درج و شیفت محتوا", "متن جدید در خانه‌های انتخاب‌شده درج می‌شود و بقیهٔ محتوای آن درس‌ها یک خانه جابه‌جا می‌شود.");
    if (value === null) return;
    const cells = selectedCellsArray();
    const res = await Api.callT("insert_and_shift", cells, value);
    if (res) { render(res.table, containerSelector); clearSelection(); toastOk("محتوا درج و جابه‌جا شد."); }
  }

  async function opSaveAsTemplate() {
    const name = await promptDialog("نام قالب جدید را وارد کنید:", { title: "ذخیره به‌عنوان قالب" });
    if (!name || !name.trim()) return;
    const cells = selectedCellsArray();
    const res = await Api.callT("save_selection_as_template", name.trim(), cells);
    if (res) { clearSelection(); toastOk("قالب ذخیره شد."); if (window.onTemplatesChanged) window.onTemplatesChanged(res.templates); }
  }

  return {
    render, clearSelection, selectedCellsArray, opClear, opPlaceholder, opInsertShift, opSaveAsTemplate,
    copySelectedCells, pasteClipboardCells,
    getLastTable: () => lastTable,
  };
})();

// ---- دیالوگ ساده برای گرفتن «متن جدید» با دکمه‌های پیش‌فرض مرور/فیلم/جبرانی ----
function openBulkContentDialog(title, hint) {
  return new Promise((resolve) => {
    const root = $("#modalRoot");
    const input = el("input", { type: "text", placeholder: "متن دلخواه..." });
    const presets = ["مرور", "فیلم", "جبرانی"];
    const overlay = el("div", { class: "overlay" }, [
      el("div", { class: "modal", style: "max-width:400px" }, [
        el("div", { class: "modal-header" }, [el("h2", {}, title), el("button", { class: "x-close", onclick: () => finish(null) }, "✕")]),
        el("div", { class: "modal-body" }, [
          el("p", { style: "font-size:12px;color:var(--text-muted);margin-bottom:10px" }, hint),
          el("div", { class: "quick-row" }, presets.map((p) => el("button", { class: "quick-btn", onclick: () => finish(p) }, p))),
          el("div", { class: "field", style: "margin-top:12px" }, [el("label", {}, "متن دلخواه"), input]),
        ]),
        el("div", { class: "modal-actions" }, [
          el("button", { class: "btn btn-ghost", onclick: () => finish(null) }, "انصراف"),
          el("button", { class: "btn btn-primary", onclick: () => finish(input.value) }, "اعمال"),
        ]),
      ]),
    ]);
    function finish(v) { root.innerHTML = ""; resolve(v && v.trim() ? v.trim() : (v === null ? null : null)); }
    root.innerHTML = "";
    root.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(null); });
  });
}
