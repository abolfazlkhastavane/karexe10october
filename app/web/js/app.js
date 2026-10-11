// ==========================================================================
// راه‌انداز اصلی برنامه
// ==========================================================================
let subjectCombo = null;
let selectedTopics = new Set();
let currentLessons = [];
let currentDays = 10;

function injectCustomFont(faces) {
  if (!faces || !faces.length) return;
  let style = document.getElementById("customFontFace");
  if (!style) {
    style = document.createElement("style");
    style.id = "customFontFace";
    document.head.appendChild(style);
  }
  style.textContent = faces
    .map((f) => `@font-face { font-family: '${f.family || 'Vazir'}'; font-weight: ${f.weight}; font-style: normal; font-display: swap; src: url('${f.url}') format('truetype'); }`)
    .join("\n");
}

const saveStudentName = debounceLater((name) => Api.call("set_student_name", name), 250);
function debounceLater(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// -------------------- نوار عنوان --------------------
function wireTitlebar() {
  $("#tbMinimize").addEventListener("click", () => Api.call("window_minimize"));
  $("#tbMaximize").addEventListener("click", () => Api.call("window_toggle_maximize"));
  $("#tbClose").addEventListener("click", () => Api.call("window_close"));
}

// -------------------- صفحهٔ لایسنس --------------------
function wireLicenseScreen() {
  const input = $("#licenseCodeInput");
  const btn = $("#activateBtn");
  const msg = $("#licenseMsg");

  async function activate() {
    const code = input.value.trim();
    if (!code) { msg.textContent = "لطفاً کد لایسنس را وارد کنید."; msg.className = "license-msg err"; return; }
    setBusy(btn, true, "در حال بررسی...");
    msg.textContent = ""; msg.className = "license-msg";
    const res = await Api.call("activate_license", code);
    setBusy(btn, false);
    if (res && res.success && res.valid) {
      msg.textContent = res.message || "فعال‌سازی موفق بود.";
      msg.className = "license-msg ok";
      setTimeout(startMainApp, 500);
    } else {
      msg.textContent = (res && res.message) || "فعال‌سازی ناموفق بود.";
      msg.className = "license-msg err";
    }
  }

  btn.addEventListener("click", activate);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });
}

// -------------------- ورود به برنامهٔ اصلی --------------------
async function startMainApp() {
  $("#licenseScreen").classList.add("hidden");
  $("#mainScreen").classList.remove("hidden");

  const boot = await Api.callT("get_bootstrap");
  if (!boot) return;

  applyTheme(boot.settings.theme_accent);
  injectCustomFont(boot.font_faces);
  $("#appTitleText").textContent = boot.settings.app_title;
  $("#mainTitle").textContent = boot.settings.app_title;
  currentDays = boot.settings.default_days || 10;

  currentLessons = boot.lessons;
  mountSubjectCombo();
  setLessonItems(boot.lessons);

  $("#daysInput").value = boot.table.days || currentDays;
  buildQuickButtons(boot.settings);

  ScheduleTable.render(boot.table, "#scheduleTableWrap");
  refreshSubjectsList(boot.table);

  wireMainScreenEvents();
  updateHeaderStudent();
  openInfoPopup(); // بعد از ورود، اطلاعات اصلی به‌صورت پاپ‌آپ باز می‌شود
}

// -------------------- پاپ‌آپ «اطلاعات اصلی» --------------------
function openInfoPopup() {
  $("#infoOverlay").classList.remove("hidden");
  setTimeout(() => $("#studentNameInput").focus(), 30);
}
function closeInfoPopup() {
  $("#infoOverlay").classList.add("hidden");
  updateHeaderStudent();
}
function updateHeaderStudent() {
  const chip = $("#headerStudent");
  const name = $("#studentNameInput").value.trim();
  const days = $("#daysInput").value;
  if (name) { chip.textContent = `${name} — ${days} روز`; chip.classList.remove("hidden"); }
  else chip.classList.add("hidden");
}

function mountSubjectCombo() {
  subjectCombo = createSearchableCombo({
    placeholder: "یک درس انتخاب کنید",
    onSelect: async (value) => {
      const res = await Api.callT("get_topics", value);
      renderTopicsList(res ? res.topics : []);
    },
  });
  $("#subjectComboMount").innerHTML = "";
  $("#subjectComboMount").appendChild(subjectCombo.node);
}

function setLessonItems(lessons) {
  currentLessons = lessons;
  const items = lessons.map((l) => ({ value: l.name, label: l.code ? `${l.code} - ${l.name}` : l.name }));
  subjectCombo.setItems(items);
  const val = subjectCombo.getValue();
  if (val) Api.callT("get_topics", val).then((res) => renderTopicsList(res ? res.topics : []));
  else renderTopicsList([]);
}

function renderTopicsList(topics) {
  selectedTopics = new Set();
  const box = $("#topicsList");
  box.innerHTML = "";
  if (!topics.length) { box.appendChild(el("div", { class: "manager-empty" }, "مبحثی برای این درس یافت نشد.")); return; }
  topics.forEach((t) => {
    const row = el("div", { class: "list-item" }, [el("input", { type: "checkbox" }), el("span", {}, t)]);
    row.addEventListener("click", () => {
      if (selectedTopics.has(t)) { selectedTopics.delete(t); row.classList.remove("selected"); row.querySelector("input").checked = false; }
      else { selectedTopics.add(t); row.classList.add("selected"); row.querySelector("input").checked = true; }
    });
    box.appendChild(row);
  });
}

function buildQuickButtons(settings = {}) {
  const hoursStr = settings.hours_shortcuts || "0.5, 1, 1.15, 1.30, 1.45, 2, 2.30, 3";
  const testsStr = settings.tests_shortcuts || "5, 10, 15, 20, 25, 30, 40, 50";
  const descStr = settings.descriptive_shortcuts || "5, 10, 15, 20, 25, 30, 40, 50";

  const hoursQuick = $("#hoursQuick");
  hoursQuick.innerHTML = "";
  hoursStr.split(",").map((s) => s.trim()).filter(Boolean).forEach((val) => {
    hoursQuick.appendChild(el("button", { class: "quick-btn", onclick: () => { $("#hoursInput").value = val; } }, val));
  });

  const testsQuick = $("#testsQuick");
  testsQuick.innerHTML = "";
  testsStr.split(",").map((s) => s.trim()).filter(Boolean).forEach((v) => {
    testsQuick.appendChild(el("button", { class: "quick-btn", onclick: () => { $("#testsInput").value = v; } }, v));
  });

  const descriptiveQuick = $("#descriptiveQuick");
  descriptiveQuick.innerHTML = "";
  descStr.split(",").map((s) => s.trim()).filter(Boolean).forEach((v) => {
    descriptiveQuick.appendChild(el("button", { class: "quick-btn", onclick: () => { $("#descriptiveInput").value = v; } }, v));
  });
}

// -------------------- دروس انتخاب‌شده (پاپ‌آپ مدال) --------------------
let draggedSubjectIdx = null;

function openSubjectsModal() {
  $("#subjectsOverlay").classList.remove("hidden");
}
function closeSubjectsModal() {
  $("#subjectsOverlay").classList.add("hidden");
}

function refreshSubjectsList(table) {
  const box = $("#subjectsListModal");
  if (!box) return;
  box.innerHTML = "";
  if (!table || !table.rows || !table.rows.length) {
    box.appendChild(el("div", { class: "manager-empty" }, "هنوز درسی اضافه نشده."));
    return;
  }

  let dragStartIndex = null;

  table.rows.forEach((row, idx) => {
    const rowEl = el("div", {
      class: "subject-row draggable-subject",
      draggable: "true",
      "data-index": idx,
    }, [
      el("span", { class: "drag-handle", title: "جابه‌جایی" }, "☰"),
      el("span", { class: "txt", title: row.label }, row.label || row.subject),
      el("div", { style: "display:flex;gap:4px" }, [
        el("button", { class: "quick-btn", title: "انتقال به بالا", onclick: (e) => { e.stopPropagation(); moveSubjectRow(idx, idx - 1); } }, "▲"),
        el("button", { class: "quick-btn", title: "انتقال به پایین", onclick: (e) => { e.stopPropagation(); moveSubjectRow(idx, idx + 1); } }, "▼"),
      ]),
      el("button", { class: "merge-btn", title: "ادغام خانه‌ها", onclick: (e) => { e.stopPropagation(); openMergeDialog(idx); } }, "⋯"),
      el("button", { class: "del", title: "حذف", onclick: (e) => { e.stopPropagation(); removeSubjectRow(idx); } }, "×"),
    ]);

    rowEl.addEventListener("dragstart", (e) => {
      dragStartIndex = idx;
      rowEl.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", idx.toString());
      }
    });

    rowEl.addEventListener("dragend", () => {
      rowEl.classList.remove("dragging");
      $$("#subjectsListModal .subject-row").forEach((r) => r.classList.remove("drag-over"));
    });

    rowEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      rowEl.classList.add("drag-over");
    });

    rowEl.addEventListener("dragleave", () => {
      rowEl.classList.remove("drag-over");
    });

    rowEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      rowEl.classList.remove("drag-over");
      let fromIdx = dragStartIndex;
      if (fromIdx === null && e.dataTransfer) {
        const txt = e.dataTransfer.getData("text/plain");
        if (txt) fromIdx = parseInt(txt, 10);
      }
      if (fromIdx !== null && !isNaN(fromIdx) && fromIdx !== idx) {
        await moveSubjectRow(fromIdx, idx);
      }
    });

    box.appendChild(rowEl);
  });
}

async function moveSubjectRow(fromIdx, toIdx) {
  const table = ScheduleTable.getLastTable();
  if (!table || !table.rows || toIdx < 0 || toIdx >= table.rows.length) return;
  const res = await Api.callT("reorder_subjects", fromIdx, toIdx);
  if (res) {
    ScheduleTable.render(res.table);
    refreshSubjectsList(res.table);
  }
}

async function removeSubjectRow(idx) {
  const ok = await confirmDialog("این درس از برنامه حذف شود؟", { title: "حذف درس" });
  if (!ok) return;
  const res = await Api.callT("remove_subject", idx);
  if (res) { ScheduleTable.render(res.table); refreshSubjectsList(res.table); }
}

// -------------------- رویدادهای صفحهٔ اصلی --------------------
function wireMainScreenEvents() {
  $("#btnLessonManager").onclick = openLessonManager;
  $("#btnTemplateManager").onclick = openTemplateManager;
  $("#btnCodeManager").onclick = openLessonCodeManager;
  $("#btnSettings").onclick = openSettingsModal;
  $("#btnMotivational").onclick = openMotivationalEditor;

  // پاپ‌آپ دروس انتخاب‌شده
  $("#btnSelectedSubjects").onclick = openSubjectsModal;
  $("#subjectsClose").onclick = closeSubjectsModal;
  $("#subjectsOk").onclick = closeSubjectsModal;
  $("#subjectsOverlay").addEventListener("mousedown", (e) => { if (e.target.id === "subjectsOverlay") closeSubjectsModal(); });

  // پاپ‌آپ اطلاعات اصلی
  $("#btnInfo").onclick = openInfoPopup;
  $("#infoClose").onclick = closeInfoPopup;
  $("#infoOk").onclick = closeInfoPopup;
  $("#infoOverlay").addEventListener("mousedown", (e) => { if (e.target.id === "infoOverlay") closeInfoPopup(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#infoOverlay").classList.contains("hidden") && !$("#modalRoot").children.length) closeInfoPopup();
  });
  $("#studentNameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#daysInput").focus(); });
  $("#daysInput").addEventListener("keydown", (e) => { if (e.key === "Enter") closeInfoPopup(); });

  $("#studentNameInput").addEventListener("input", (e) => {
    saveStudentName(e.target.value);
    updateHeaderStudent();
  });
  $("#daysInput").addEventListener("change", async (e) => {
    const res = await Api.callT("set_days", e.target.value);
    if (res) { ScheduleTable.render(res.table); refreshSubjectsList(res.table); }
    updateHeaderStudent();
  });

  $("#addSubjectBtn").onclick = async (e) => {
    const subject = subjectCombo.getValue();
    const topics = Array.from(selectedTopics);
    if (!subject || !topics.length) { toastError("لطفاً درس و حداقل یک مبحث را انتخاب کنید."); return; }
    setBusy(e.target, true, "در حال افزودن...");
    const res = await Api.call(
      "add_subject", subject, topics,
      $("#hoursInput").value.trim() || "0",
      $("#testsInput").value.trim() || "0",
      $("#descriptiveInput").value.trim() || "0",
      $("#addTestsCheck").checked,
      $("#addDescriptiveCheck").checked
    );
    setBusy(e.target, false);
    if (res && res.success) {
      ScheduleTable.render(res.table);
      refreshSubjectsList(res.table);
      toastOk("درس اضافه شد.");
    } else toastError((res && res.message) || "خطا در افزودن درس.");
  };

  $("#btnImportTemplate").onclick = openImportTemplateFlow;

  $("#btnExportWord").onclick = async (e) => {
    setBusy(e.target, true, "در حال ساخت فایل...");
    const res = await Api.call("export_word");
    setBusy(e.target, false);
    if (res && res.success && !res.cancelled) toastOk("فایل ورد با موفقیت ذخیره شد.");
    else if (res && !res.success) toastError(res.message);
  };

  $("#btnExportPdf").onclick = () => openPdfExportOptionsModal();

  $("#btnEditManual").onclick = () => {
    const table = ScheduleTable.getLastTable();
    if (!table || !table.rows.length) { toastError("لطفاً یک درس را انتخاب کنید."); return; }
    const cells = ScheduleTable.selectedCellsArray();
    const row = cells.length ? cells[0][0] : 0;
    openManualEditDialog(row);
  };

  $("#btnAddManual").onclick = () => openAddManualDialog(parseInt($("#daysInput").value || "10", 10));

  $("#btnNewProgram").onclick = async () => {
    const ok = await confirmDialog("برنامهٔ فعلی پاک شود و یک برنامهٔ جدید شروع شود؟", { title: "برنامهٔ جدید" });
    if (!ok) return;
    const res = await Api.callT("reset_schedule");
    if (res) {
      ScheduleTable.render(res.table);
      refreshSubjectsList(res.table);
      $("#studentNameInput").value = "";
      $("#hoursInput").value = "";
      $("#testsInput").value = "";
      $("#descriptiveInput").value = "";
      updateHeaderStudent();
      toastOk("برنامهٔ جدید آماده شد.");
      openInfoPopup();
    }
  };

  $("#btnFullscreen").onclick = () => {
    $("#fullscreenTableOverlay").classList.remove("hidden");
    ScheduleTable.render(ScheduleTable.getLastTable(), "#fullscreenTableWrap");
  };
  $("#btnExitFullscreen").onclick = () => {
    $("#fullscreenTableOverlay").classList.add("hidden");
    ScheduleTable.render(ScheduleTable.getLastTable(), "#scheduleTableWrap");
  };

  // نوار شناور انتخاب گروهی
  $("#selCopy").onclick = () => ScheduleTable.copySelectedCells();
  $("#selPaste").onclick = () => ScheduleTable.pasteClipboardCells();
  $("#selClear").onclick = () => ScheduleTable.opClear();
  $("#selPlaceholder").onclick = () => ScheduleTable.opPlaceholder();
  $("#selShift").onclick = () => ScheduleTable.opInsertShift();
  $("#selTemplate").onclick = () => ScheduleTable.opSaveAsTemplate();
  $("#selDeselect").onclick = () => ScheduleTable.clearSelection();

  // کلیدهای میانبر کپی و پیست (Ctrl+C / Ctrl+V)
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const isEditingInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (isEditingInput) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      ScheduleTable.copySelectedCells();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      ScheduleTable.pasteClipboardCells();
    }
  });

  window.onLessonsChanged = (lessons) => setLessonItems(lessons);
  window.onTemplatesChanged = () => {};
}

// -------------------- شروع --------------------
async function boot() {
  wireTitlebar();
  wireLicenseScreen();

  const status = await Api.callT("get_license_status");
  if (!status) return;
  injectCustomFont(status.font_faces);
  if (status.app_title) $("#appTitleText").textContent = status.app_title;

  if (status.bypass) { // حالت تست هنگام اجرا از سورس (SCHEDULER_SKIP_LICENSE=1)
    startMainApp();
    return;
  }
  // آخرین کد واردشده در فیلد پر می‌شود؛ کاربر فقط دکمهٔ «فعال‌سازی» را می‌زند
  const input = $("#licenseCodeInput");
  input.value = status.saved_code || "";
  (status.saved_code ? $("#activateBtn") : input).focus();
}

document.addEventListener("DOMContentLoaded", boot);
