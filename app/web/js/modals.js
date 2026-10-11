// ==========================================================================
// دیالوگ‌ها و مدال‌های مدیریت (سورس‌های درسی، قالب‌ها، کدهای درسی، تنظیمات، خروجی PDF)
// ==========================================================================

async function openPdfExportOptionsModal(initialState = {}) {
  const root = $("#modalRoot");
  const fontSelect = el("select", {}, [
    el("option", { value: "Vazir" }, "فونت وزیر (Vazir)"),
    el("option", { value: "IBM Plex Sans Arabic" }, "فونت آی‌بی‌ام (IBM Plex Sans Arabic)"),
    el("option", { value: "Shabnam" }, "فونت شبنم (Shabnam)"),
    el("option", { value: "Tajawal" }, "فونت تجول (Tajawal)"),
    el("option", { value: "Samim" }, "فونت صمیم (Samim)"),
    el("option", { value: "random" }, "🎲 انتخاب تصادفی (Random)"),
  ]);
  if (initialState.font) fontSelect.value = initialState.font;

  const templateSelect = el("select", {}, [
    el("option", { value: "classic" }, "قالب کلاسیک (لوکس و باطراوت)"),
    el("option", { value: "modern" }, "قالب مدرن (پیشرفته و گلاس‌مورفیسم)"),
    el("option", { value: "random" }, "🎲 انتخاب تصادفی (Random)"),
  ]);
  if (initialState.template) templateSelect.value = initialState.template;

  const fontSizeInput = el("input", { type: "number", min: "7", max: "18", value: initialState.fontSize || "11" });
  const selectedChapterPaths = initialState.selectedChapterPaths || new Set();

  const chaptersRes = await Api.callT("list_chapter_folders");
  const structure = (chaptersRes && chaptersRes.structure) ? chaptersRes.structure : {};

  const countBadge = el("span", {
    class: "badge-count",
    style: "font-size:11px;background:var(--accent-soft);color:var(--accent);padding:2px 8px;border-radius:12px;font-weight:700"
  }, `${selectedChapterPaths.size} فصل`);

  const openChaptersBtn = el("button", {
    class: "btn btn-ghost btn-block",
    style: "margin-top:4px;justify-content:space-between;"
  }, [
    el("span", {}, "🖼️ مدیریت و پیوست عکس‌های فصل‌ها..."),
    countBadge,
  ]);

  openChaptersBtn.onclick = () => {
    openChapterSelectorModal(structure, selectedChapterPaths, () => {
      countBadge.textContent = `${selectedChapterPaths.size} فصل`;
    });
  };

  const exportBtn = el("button", { class: "btn btn-primary btn-block" }, "✨ ساخت و ذخیره PDF");

  const overlay = el("div", { class: "overlay" }, [
    el("div", { class: "modal", style: "max-width:480px" }, [
      el("div", { class: "modal-header" }, [
        el("h2", {}, "✨ تنظیمات خروجی لوکس PDF"),
        el("button", { class: "x-close", onclick: () => { overlay.remove(); } }, "✕"),
      ]),
      el("div", { class: "modal-body" }, [
        el("div", { class: "field" }, [
          el("label", {}, "انتخاب قالب خروجی"),
          templateSelect,
        ]),
        el("div", { class: "field" }, [
          el("label", {}, "انتخاب فونت فارسی"),
          fontSelect,
        ]),
        el("div", { class: "field" }, [
          el("label", {}, "سایز فونت جدول (پیکسل/pt)"),
          fontSizeInput,
          el("p", { style: "font-size:11px;color:var(--text-muted);margin-top:4px" }, "اگر متن درون خانه‌ها زیاد است، می‌توانید سایز فونت را کوچک‌تر کنید."),
        ]),
        el("div", { class: "field" }, [
          el("label", {}, "پیوست خودکار عکس‌های فصل‌ها (اختیاری)"),
          openChaptersBtn,
        ]),
      ]),
      el("div", { class: "modal-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: () => { overlay.remove(); } }, "انصراف"),
        exportBtn,
      ]),
    ]),
  ]);

  exportBtn.onclick = async () => {
    const font = fontSelect.value;
    const template = templateSelect.value;
    const fontSize = fontSizeInput.value || 11;
    const chapterPaths = Array.from(selectedChapterPaths);

    setBusy(exportBtn, true, "در حال ساخت PDF...");
    const res = await Api.call("export_pdf", font, template, fontSize, chapterPaths);
    setBusy(exportBtn, false);

    if (res && res.success && !res.cancelled) {
      overlay.remove();
      toastOk("فایل PDF با موفقیت ذخیره شد.");
    } else if (res && !res.success) {
      toastError(res.message);
    }
  };

  root.innerHTML = "";
  root.appendChild(overlay);
}

function openChapterSelectorModal(structure, selectedPaths, onConfirm) {
  const root = $("#modalRoot");
  const tempSelected = new Set(selectedPaths);
  const searchInput = el("input", { type: "text", placeholder: "🔍 جستجوی نام فصل یا درس (مثلاً زیست دهم)..." });
  const container = el("div", { class: "chapter-groups-container" });
  const statusSummary = el("span", { style: "font-size:12.5px;font-weight:700;color:var(--text-2)" }, "");

  function updateSummary() {
    statusSummary.textContent = `${tempSelected.size} فصل انتخاب شده است`;
  }

  function renderGroups(filter = "") {
    container.innerHTML = "";
    filter = filter.trim().toLowerCase();
    let totalGroups = 0;

    for (const [groupTitle, chapters] of Object.entries(structure || {})) {
      if (!chapters || !chapters.length) continue;

      const filteredChapters = chapters.filter((ch) => {
        if (!filter) return true;
        return groupTitle.toLowerCase().includes(filter) || ch.name.toLowerCase().includes(filter);
      });

      if (!filteredChapters.length) continue;
      totalGroups++;

      const groupCard = el("div", { class: "chapter-group-card" });
      const allInGroupSelected = filteredChapters.every((ch) => tempSelected.has(ch.path));
      const selectGroupBtn = el("button", { class: "quick-btn" }, allInGroupSelected ? "لغو گروه" : "انتخاب گروه");

      const groupHeader = el("div", { class: "chapter-group-header" }, [
        el("div", { style: "display:flex;align-items:center;gap:8px" }, [
          el("span", {}, groupTitle),
          el("span", { style: "font-size:11px;opacity:0.8;font-weight:normal" }, `(${filteredChapters.length} فصل)`),
        ]),
        selectGroupBtn,
      ]);

      selectGroupBtn.onclick = () => {
        const currentlyAll = filteredChapters.every((ch) => tempSelected.has(ch.path));
        filteredChapters.forEach((ch) => {
          if (currentlyAll) tempSelected.delete(ch.path);
          else tempSelected.add(ch.path);
        });
        updateSummary();
        renderGroups(searchInput.value);
      };

      const grid = el("div", { class: "chapter-items-grid" });
      filteredChapters.forEach((ch) => {
        const isSelected = tempSelected.has(ch.path);
        const cb = el("input", { type: "checkbox" });
        cb.checked = isSelected;

        const chip = el("div", { class: `chapter-chip ${isSelected ? "selected" : ""}` }, [
          cb,
          el("span", {}, ch.name),
        ]);

        chip.onclick = () => {
          if (tempSelected.has(ch.path)) {
            tempSelected.delete(ch.path);
            chip.classList.remove("selected");
            cb.checked = false;
          } else {
            tempSelected.add(ch.path);
            chip.classList.add("selected");
            cb.checked = true;
          }
          updateSummary();
          const nowAll = filteredChapters.every((c) => tempSelected.has(c.path));
          selectGroupBtn.textContent = nowAll ? "لغو گروه" : "انتخاب گروه";
        };

        grid.appendChild(chip);
      });

      groupCard.appendChild(groupHeader);
      groupCard.appendChild(grid);
      container.appendChild(groupCard);
    }

    if (totalGroups === 0) {
      container.appendChild(el("div", { class: "manager-empty" }, "هیچ فصل یا پوشه متناظری یافت نشد."));
    }
  }

  searchInput.oninput = () => renderGroups(searchInput.value);

  const selectAllBtn = el("button", { class: "quick-btn" }, "انتخاب همهٔ فصل‌ها");
  selectAllBtn.onclick = () => {
    for (const chapters of Object.values(structure || {})) {
      (chapters || []).forEach((ch) => tempSelected.add(ch.path));
    }
    updateSummary();
    renderGroups(searchInput.value);
  };

  const clearAllBtn = el("button", { class: "quick-btn" }, "پاک کردن همه");
  clearAllBtn.onclick = () => {
    tempSelected.clear();
    updateSummary();
    renderGroups(searchInput.value);
  };

  updateSummary();
  renderGroups();

  function closeThisModal() {
    chapterOverlay.remove();
    if (onConfirm) onConfirm();
  }

  const modalNode = el("div", { class: "modal modal-wide chapter-modal-wide" }, [
    el("div", { class: "modal-header" }, [
      el("h2", {}, "🖼️ مدیریت و پیوست عکس‌های فصل‌ها"),
      el("button", { class: "x-close", onclick: closeThisModal }, "✕"),
    ]),
    el("div", { class: "modal-body" }, [
      el("div", { class: "chapter-search-row" }, [
        searchInput,
        selectAllBtn,
        clearAllBtn,
      ]),
      container,
    ]),
    el("div", { class: "modal-actions", style: "align-items:center;justify-content:space-between" }, [
      statusSummary,
      el("div", { style: "display:flex;gap:8px" }, [
        el("button", { class: "btn btn-ghost", onclick: closeThisModal }, "انصراف"),
        el("button", { class: "btn btn-primary", onclick: () => {
          selectedPaths.clear();
          tempSelected.forEach((p) => selectedPaths.add(p));
          closeThisModal();
        } }, "تأیید و اعمال"),
      ]),
    ]),
  ]);

  const chapterOverlay = el("div", { class: "overlay", style: "z-index:90" }, [modalNode]);
  chapterOverlay.addEventListener("click", (e) => {
    if (e.target === chapterOverlay) closeThisModal();
  });

  root.appendChild(chapterOverlay);
}

function openOverlay(contentNode, { wide = false } = {}) {
  const root = $("#modalRoot");
  const overlay = el("div", { class: "overlay" }, [contentNode]);
  if (wide) contentNode.classList.add("modal-wide");
  root.innerHTML = "";
  root.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  return overlay;
}

function modalShell({ title, wide = false, bodyChildren = [], actions = [] }) {
  const modal = el("div", { class: "modal" }, [
    el("div", { class: "modal-header" }, [el("h2", {}, title), el("button", { class: "x-close", onclick: closeModal }, "✕")]),
    el("div", { class: "modal-body" }, bodyChildren),
    actions.length ? el("div", { class: "modal-actions" }, actions) : null,
  ]);
  openOverlay(modal, { wide });
  return modal;
}

// ==========================================================================
// شبکهٔ متنی قابل‌ویرایش (مشترک بین ویرایشگر درس و قالب)
// ==========================================================================
function createEditableGrid(initialRows, headerFn) {
  let rows = initialRows.length ? initialRows.map((r) => r.slice()) : [["", ""]];
  const wrap = el("div", { class: "grid-wrap" });

  function colCount() { return Math.max(...rows.map((r) => r.length), 1); }

  function renderGrid() {
    const nCols = colCount();
    const thead = el("thead", {}, [el("tr", {}, Array.from({ length: nCols }, (_, i) => el("th", {}, headerFn(i))))]);
    const tbody = el("tbody");
    rows.forEach((row, rIdx) => {
      const tr = el("tr");
      for (let c = 0; c < nCols; c++) {
        const input = el("input", { type: "text", value: row[c] ?? "" });
        input.addEventListener("input", () => { row[c] = input.value; });
        tr.appendChild(el("td", {}, [input]));
      }
      tbody.appendChild(tr);
    });
    wrap.innerHTML = "";
    wrap.appendChild(el("table", { class: "edit-grid" }, [thead, tbody]));
  }

  renderGrid();

  return {
    node: wrap,
    getRows: () => rows.map((r) => r.slice()),
    addRow: () => { rows.push(new Array(colCount()).fill("")); renderGrid(); },
    removeRow: () => { if (rows.length > 1) { rows.pop(); renderGrid(); } },
    addCol: () => { rows = rows.map((r) => [...r, ""]); renderGrid(); },
    removeCol: () => { if (colCount() > 1) { rows = rows.map((r) => r.slice(0, -1)); renderGrid(); } },
  };
}

// ==========================================================================
// مدیریت سورس‌های درسی
// ==========================================================================
async function openLessonManager() {
  const res = await Api.callT("list_lessons");
  if (!res) return;
  renderLessonManagerModal(res.lessons);
}

function renderLessonManagerModal(lessons) {
  const list = el("ul", { class: "manager-list" });
  if (!lessons.length) list.appendChild(el("li", { class: "manager-empty" }, "هنوز درسی ثبت نشده است."));
  lessons.forEach((l) => {
    list.appendChild(el("li", {}, [
      el("span", {}, l.code ? `${l.code} - ${l.name}` : l.name),
      el("div", { class: "row-btns" }, [
        el("button", { class: "btn btn-ghost btn-sm", onclick: () => openLessonEditor(l.name) }, "ویرایش"),
        el("button", { class: "btn btn-danger btn-sm", onclick: () => deleteLessonFlow(l.name) }, "حذف"),
      ]),
    ]));
  });

  modalShell({
    title: "مدیریت سورس‌های درسی",
    wide: true,
    bodyChildren: [list],
    actions: [
      el("button", { class: "btn btn-primary btn-block", onclick: () => openLessonEditor(null) }, "+ افزودن درس جدید"),
    ],
  });
}

async function deleteLessonFlow(name) {
  const ok = await confirmDialog(`فایل درسی «${name}» برای همیشه حذف شود؟`, { title: "حذف سورس درسی" });
  if (!ok) return;
  const res = await Api.callT("delete_lesson", name);
  if (res) { toastOk("حذف شد."); renderLessonManagerModal(res.lessons); refreshTopBootstrapLessons(res.lessons); }
}

async function openLessonEditor(name) {
  let rows = [["", ""]];
  if (name) {
    const res = await Api.callT("get_lesson_table", name);
    if (!res) return;
    rows = res.rows;
  }
  const grid = createEditableGrid(rows, (i) => (i === 0 ? "مبحث" : `محتوا ${i}`));
  const nameInput = el("input", { type: "text", value: name || "", placeholder: "نام درس (نام فایل)" });

  const modal = modalShell({
    title: name ? `ویرایش درس «${name}»` : "افزودن درس جدید",
    wide: true,
    bodyChildren: [
      el("div", { class: "field" }, [el("label", {}, "نام درس"), nameInput]),
      el("div", { class: "grid-toolbar" }, [
        el("button", { class: "quick-btn", onclick: () => grid.addRow() }, "+ ردیف"),
        el("button", { class: "quick-btn", onclick: () => grid.removeRow() }, "− ردیف"),
        el("button", { class: "quick-btn", onclick: () => grid.addCol() }, "+ ستون"),
        el("button", { class: "quick-btn", onclick: () => grid.removeCol() }, "− ستون"),
      ]),
      grid.node,
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: () => openLessonManager() }, "بازگشت"),
      el("button", { class: "btn btn-primary", onclick: (e) => saveLessonFlow(e.target, name, nameInput, grid, false) }, "ذخیره"),
    ],
  });
}

async function saveLessonFlow(btn, originalName, nameInput, grid, force) {
  const newName = nameInput.value.trim();
  if (!newName) { toastError("نام درس نمی‌تواند خالی باشد."); return; }
  setBusy(btn, true, "در حال ذخیره...");
  const res = await Api.call("save_lesson_table", newName, grid.getRows(), originalName || null, force);
  setBusy(btn, false);
  if (res && res.success) {
    toastOk("درس ذخیره شد.");
    refreshTopBootstrapLessons(res.lessons);
    renderLessonManagerModal(res.lessons);
    return;
  }
  if (res && res.conflict) {
    const ok = await confirmDialog(res.message + " بازنویسی شود؟", { title: "فایل موجود است" });
    if (ok) return saveLessonFlow(btn, originalName, nameInput, grid, true);
    return;
  }
  toastError((res && res.message) || "ذخیره ناموفق بود.");
}

function refreshTopBootstrapLessons(lessons) {
  if (window.onLessonsChanged) window.onLessonsChanged(lessons);
}

// ==========================================================================
// مدیریت قالب‌ها
// ==========================================================================
async function openTemplateManager() {
  const res = await Api.callT("list_templates");
  if (!res) return;
  renderTemplateManagerModal(res.templates);
}

function renderTemplateManagerModal(templateNames) {
  const list = el("ul", { class: "manager-list" });
  if (!templateNames.length) list.appendChild(el("li", { class: "manager-empty" }, "هنوز قالبی ثبت نشده است."));
  templateNames.forEach((name) => {
    list.appendChild(el("li", {}, [
      el("span", {}, name),
      el("div", { class: "row-btns" }, [
        el("button", { class: "btn btn-ghost btn-sm", onclick: () => openTemplateEditor(name) }, "ویرایش"),
        el("button", { class: "btn btn-danger btn-sm", onclick: () => deleteTemplateFlow(name) }, "حذف"),
      ]),
    ]));
  });
  modalShell({
    title: "مدیریت قالب‌ها",
    wide: true,
    bodyChildren: [list],
    actions: [el("button", { class: "btn btn-primary btn-block", onclick: () => openTemplateEditor(null) }, "+ افزودن قالب جدید")],
  });
}

async function deleteTemplateFlow(name) {
  const ok = await confirmDialog(`قالب «${name}» برای همیشه حذف شود؟`, { title: "حذف قالب" });
  if (!ok) return;
  const res = await Api.callT("delete_template", name);
  if (res) { toastOk("حذف شد."); renderTemplateManagerModal(res.templates); if (window.onTemplatesChanged) window.onTemplatesChanged(res.templates); }
}

async function openTemplateEditor(name) {
  let rows = [["", ""]];
  if (name) {
    const res = await Api.callT("get_template_table", name);
    if (!res) return;
    rows = res.rows;
  }
  const grid = createEditableGrid(rows, (i) => `روز ${i + 1}`);
  const nameInput = el("input", { type: "text", value: name || "", placeholder: "نام قالب" });

  modalShell({
    title: name ? `ویرایش قالب «${name}»` : "افزودن قالب جدید",
    wide: true,
    bodyChildren: [
      el("div", { class: "field" }, [el("label", {}, "نام قالب"), nameInput]),
      el("div", { class: "grid-toolbar" }, [
        el("button", { class: "quick-btn", onclick: () => grid.addRow() }, "+ ردیف"),
        el("button", { class: "quick-btn", onclick: () => grid.removeRow() }, "− ردیف"),
        el("button", { class: "quick-btn", onclick: () => grid.addCol() }, "+ ستون"),
        el("button", { class: "quick-btn", onclick: () => grid.removeCol() }, "− ستون"),
      ]),
      grid.node,
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: () => openTemplateManager() }, "بازگشت"),
      el("button", { class: "btn btn-primary", onclick: (e) => saveTemplateFlow(e.target, name, nameInput, grid, false) }, "ذخیره"),
    ],
  });
}

async function saveTemplateFlow(btn, originalName, nameInput, grid, force) {
  const newName = nameInput.value.trim();
  if (!newName) { toastError("نام قالب نمی‌تواند خالی باشد."); return; }
  setBusy(btn, true, "در حال ذخیره...");
  const res = await Api.call("save_template_table", newName, grid.getRows(), originalName || null, force);
  setBusy(btn, false);
  if (res && res.success) {
    toastOk("قالب ذخیره شد.");
    if (window.onTemplatesChanged) window.onTemplatesChanged(res.templates);
    renderTemplateManagerModal(res.templates);
    return;
  }
  if (res && res.conflict) {
    const ok = await confirmDialog(res.message + " بازنویسی شود؟", { title: "فایل موجود است" });
    if (ok) return saveTemplateFlow(btn, originalName, nameInput, grid, true);
    return;
  }
  toastError((res && res.message) || "ذخیره ناموفق بود.");
}

// ==========================================================================
// مدیریت کدهای درسی
// ==========================================================================
async function openLessonCodeManager() {
  const [lessonsRes, codesRes] = await Promise.all([Api.callT("list_lessons"), Api.callT("get_lesson_codes")]);
  if (!lessonsRes || !codesRes) return;
  const codes = codesRes.codes || {};
  const inputs = {};

  const list = el("div", {});
  lessonsRes.lessons.forEach((l) => {
    const input = el("input", { type: "text", value: codes[l.name] || "", placeholder: "کد عددی" });
    inputs[l.name] = input;
    list.appendChild(el("div", { class: "sentence-row" }, [
      el("span", { style: "flex:1;font-size:12.5px" }, l.name),
      input,
    ]));
  });
  if (!lessonsRes.lessons.length) list.appendChild(el("div", { class: "manager-empty" }, "هنوز درسی ثبت نشده است."));

  modalShell({
    title: "مدیریت کدهای درسی",
    wide: true,
    bodyChildren: [list],
    actions: [
      el("button", { class: "btn btn-primary btn-block", onclick: async (e) => {
        const codesOut = {};
        for (const [name, input] of Object.entries(inputs)) {
          if (input.value.trim()) codesOut[name] = input.value.trim();
        }
        setBusy(e.target, true, "در حال ذخیره...");
        const res = await Api.call("save_lesson_codes", codesOut);
        setBusy(e.target, false);
        if (res && res.success) { toastOk("کدها ذخیره شد."); refreshTopBootstrapLessons(res.lessons); closeModal(); }
        else toastError((res && res.message) || "خطا در ذخیرهٔ کدها.");
      } }, "ذخیرهٔ کدها"),
    ],
  });
}

// ==========================================================================
// ویرایش دستی محتوای روزها
// ==========================================================================
function buildDayFields(days, values) {
  const fields = [];
  const wrap = el("div", { class: "day-fields" });
  for (let i = 0; i < days; i++) {
    const input = el("input", { type: "text", value: values[i] ?? "" });
    fields.push(input);
    wrap.appendChild(el("div", { class: "day-row" }, [el("label", {}, `روز ${i + 1}`), input]));
  }
  return { wrap, fields };
}

async function openManualEditDialog(row) {
  const res = await Api.callT("get_manual_for_edit", row);
  if (!res) return;
  const { wrap, fields } = buildDayFields(res.days, res.manual);
  modalShell({
    title: "ویرایش محتوای دستی",
    bodyChildren: [wrap],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "انصراف"),
      el("button", { class: "btn btn-primary", onclick: async (e) => {
        setBusy(e.target, true);
        const values = fields.map((f) => f.value);
        const r = await Api.call("set_manual", row, values);
        setBusy(e.target, false);
        if (r && r.success) { ScheduleTable.render(r.table); closeModal(); toastOk("ذخیره شد."); }
        else toastError((r && r.message) || "خطا در ذخیره.");
      } }, "تأیید"),
    ],
  });
}

async function openAddManualDialog(currentDays) {
  const values = new Array(currentDays).fill("");
  const { wrap, fields } = buildDayFields(currentDays, values);
  modalShell({
    title: "افزودن دستی",
    bodyChildren: [wrap],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "انصراف"),
      el("button", { class: "btn btn-primary", onclick: async (e) => {
        setBusy(e.target, true);
        const vals = fields.map((f) => f.value);
        const r = await Api.call("add_manual_subject", vals);
        setBusy(e.target, false);
        if (r && r.success) { ScheduleTable.render(r.table); closeModal(); toastOk("افزوده شد."); refreshSubjectsList(r.table); }
        else toastError((r && r.message) || "خطا.");
      } }, "افزودن"),
    ],
  });
}

// ==========================================================================
// ادغام خانه‌ها
// ==========================================================================
function openMergeDialog(row) {
  const factorInput = el("input", { type: "number", min: "2", value: "2" });
  const testsInput = el("input", { type: "number", min: "0", value: "" });
  const descInput = el("input", { type: "number", min: "0", value: "" });

  async function doMerge() {
    const factor = parseInt(factorInput.value || "0", 10);
    const res = await Api.call("merge_row", row, factor, testsInput.value.trim(), descInput.value.trim());
    if (res && res.success) { ScheduleTable.render(res.table); closeModal(); toastOk("ادغام انجام شد."); }
    else toastError((res && res.message) || "خطا در ادغام.");
  }

  modalShell({
    title: "ادغام خانه‌ها",
    bodyChildren: [
      el("div", { class: "field" }, [
        el("label", {}, "مقادیر پیش‌فرض"),
        el("div", { class: "quick-row" }, [2, 3, 4].map((v) => el("button", { class: "quick-btn", onclick: () => { factorInput.value = v; doMerge(); } }, String(v)))),
      ]),
      el("div", { class: "field" }, [el("label", {}, "تعداد دلخواه برای ادغام"), factorInput]),
      el("div", { class: "field" }, [
        el("label", {}, "تعداد تست"), testsInput,
        el("div", { class: "quick-row" }, ["8", "15", "20", "25"].map((v) => el("button", { class: "quick-btn", onclick: () => { testsInput.value = v; } }, v))),
      ]),
      el("div", { class: "field" }, [
        el("label", {}, "تعداد تشریحی"), descInput,
        el("div", { class: "quick-row" }, ["8", "15", "20", "25"].map((v) => el("button", { class: "quick-btn", onclick: () => { descInput.value = v; } }, v))),
      ]),
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "انصراف"),
      el("button", { class: "btn btn-primary", onclick: doMerge }, "تأیید"),
    ],
  });
}

// ==========================================================================
// وارد کردن از قالب
// ==========================================================================
async function openImportTemplateFlow() {
  const res = await Api.callT("list_templates");
  if (!res) return;
  if (!res.templates.length) { toastError("هنوز هیچ قالبی ساخته نشده است."); return; }

  let selected = res.templates[0];
  const list = el("ul", { class: "manager-list" });
  function renderList() {
    list.innerHTML = "";
    res.templates.forEach((name) => {
      const li = el("li", { style: `cursor:pointer;${name === selected ? "background:var(--accent-soft)" : ""}` }, [el("span", {}, name)]);
      li.addEventListener("click", () => { selected = name; renderList(); });
      list.appendChild(li);
    });
  }
  renderList();

  modalShell({
    title: "وارد کردن از قالب — انتخاب قالب",
    bodyChildren: [list],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "انصراف"),
      el("button", { class: "btn btn-primary", onclick: () => openImportTemplateAdvanced(selected) }, "بعدی"),
    ],
  });
}

function openImportTemplateAdvanced(templateName) {
  const nameInput = el("input", { type: "text", value: templateName, placeholder: "نام درس برای نمایش" });
  const hoursInput = el("input", { type: "text", value: "0" });

  modalShell({
    title: `وارد کردن «${templateName}»`,
    bodyChildren: [
      el("div", { class: "field" }, [el("label", {}, "نام درس برای نمایش"), nameInput]),
      el("div", { class: "field" }, [
        el("label", {}, "تعداد ساعت"), hoursInput,
        el("div", { class: "quick-row" }, ["1", "1.5", "2"].map((v) => el("button", { class: "quick-btn", onclick: () => { hoursInput.value = v; } }, v))),
      ]),
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "انصراف"),
      el("button", { class: "btn btn-primary", onclick: async (e) => {
        setBusy(e.target, true);
        const res = await Api.call("import_template", templateName, nameInput.value.trim(), hoursInput.value.trim() || "0");
        setBusy(e.target, false);
        if (res && res.success) { ScheduleTable.render(res.table); closeModal(); toastOk("قالب وارد شد."); refreshSubjectsList(res.table); }
        else toastError((res && res.message) || "خطا در وارد کردن قالب.");
      } }, "وارد کردن"),
    ],
  });
}

// ==========================================================================
// تنظیمات برنامه
// ==========================================================================
async function openSettingsModal() {
  const res = await Api.callT("get_settings");
  if (!res) return;
  const s = res.settings;

  const accentInput = el("input", { type: "text", value: s.theme_accent || "#d9a036", dir: "ltr", style: "text-align:left" });
  const daysInput = el("input", { type: "number", min: "1", max: "31", value: s.default_days || 10 });
  const hoursShortcutsInput = el("input", { type: "text", value: s.hours_shortcuts || "0.5, 1, 1.15, 1.30, 1.45, 2, 2.30, 3", dir: "ltr" });
  const testsShortcutsInput = el("input", { type: "text", value: s.tests_shortcuts || "5, 10, 15, 20, 25, 30, 40, 50", dir: "ltr" });
  const descShortcutsInput = el("input", { type: "text", value: s.descriptive_shortcuts || "5, 10, 15, 20, 25, 30, 40, 50", dir: "ltr" });

  modalShell({
    title: "تنظیمات برنامه",
    wide: true,
    bodyChildren: [
      el("div", { class: "field" }, [el("label", {}, "رنگ اصلی تم (کد HEX)"), accentInput]),
      el("div", { class: "field" }, [el("label", {}, "تعداد روز پیش‌فرض برنامهٔ جدید"), daysInput]),
      el("div", { class: "field" }, [el("label", {}, "میان‌برهای سریع ساعات (با ویرگول)"), hoursShortcutsInput]),
      el("div", { class: "field" }, [el("label", {}, "میان‌برهای سریع تست‌ها (با ویرگول)"), testsShortcutsInput]),
      el("div", { class: "field" }, [el("label", {}, "میان‌برهای سریع تشریحی (با ویرگول)"), descShortcutsInput]),
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "انصراف"),
      el("button", { class: "btn btn-primary", onclick: async (e) => {
        setBusy(e.target, true);
        const r = await Api.call("save_settings", {
          theme_accent: accentInput.value.trim() || "#d9a036",
          default_days: parseInt(daysInput.value || "10", 10),
          hours_shortcuts: hoursShortcutsInput.value.trim(),
          tests_shortcuts: testsShortcutsInput.value.trim(),
          descriptive_shortcuts: descShortcutsInput.value.trim(),
        });
        setBusy(e.target, false);
        if (r && r.success) {
          toastOk("تنظیمات ذخیره شد.");
          applyTheme(r.settings.theme_accent);
          buildQuickButtons(r.settings);
          closeModal();
        } else toastError((r && r.message) || "خطا در ذخیرهٔ تنظیمات.");
      } }, "ذخیره"),
    ],
  });
}

function applyTheme(accent) {
  if (accent) document.documentElement.style.setProperty("--accent", accent);
}

async function openMotivationalEditor() {
  const res = await Api.callT("get_motivational_sentences");
  if (!res) return;
  let sentences = res.sentences.slice();

  const list = el("div", {});
  function renderList() {
    list.innerHTML = "";
    sentences.forEach((s, idx) => {
      const input = el("input", { type: "text", value: s });
      input.addEventListener("input", () => { sentences[idx] = input.value; });
      list.appendChild(el("div", { class: "sentence-row" }, [
        input,
        el("button", { class: "btn btn-danger btn-icon btn-sm", onclick: () => { sentences.splice(idx, 1); renderList(); } }, "×"),
      ]));
    });
  }
  renderList();

  modalShell({
    title: "جملات انگیزشی (از {{name}} برای نام دانش‌آموز استفاده کنید)",
    wide: true,
    bodyChildren: [
      list,
      el("button", { class: "btn btn-ghost btn-block", style: "margin-top:8px", onclick: () => { sentences.push("«{{name}}» "); renderList(); } }, "+ افزودن جمله"),
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "انصراف"),
      el("button", { class: "btn btn-primary", onclick: async (e) => {
        setBusy(e.target, true);
        const r = await Api.call("save_motivational_sentences", sentences);
        setBusy(e.target, false);
        if (r && r.success) { toastOk("ذخیره شد."); closeModal(); } else toastError((r && r.message) || "خطا.");
      } }, "ذخیره"),
    ],
  });
}
