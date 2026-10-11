// اسکریپت تست — شبیه‌سازی محیط pywebview با jsdom و یک Api جعلی (کاملاً black-box)
const path = require("path");
const { JSDOM } = require("jsdom");

const FAKE_LESSONS = [
  { name: "ریاضی", code: "101" },
  { name: "فیزیک", code: "" },
];
const FAKE_TOPICS = { "ریاضی": ["مبحث یک", "مبحث دو", "مبحث سه"], "فیزیک": ["نور", "الکتریسیته"] };
let FAKE_TABLE = { days: 10, display_days: 10, hidden_columns: [], rows: [], student_name: "" };
let subjectsState = [];
const SCENARIO = { savedCode: "", bypass: true, valid: true, lastActivated: null };

function recompute() {
  const display_days = FAKE_TABLE.days;
  const rows = subjectsState.map((s) => ({
    subject: s.subject, hours: s.hours, label: s.label,
    cells: Array.from({ length: display_days }, (_, i) => ({
      text: s.manual[i] ? s.manual[i] : (s.data[i] || ""), manual: !!s.manual[i], link: null,
    })),
  }));
  FAKE_TABLE = { ...FAKE_TABLE, display_days, rows, hidden_columns: [] };
}

const api = {
  get_bootstrap: async () => ({ success: true, settings: { app_title: "تست", theme_accent: "#6d5efc", default_days: 10 }, license_activated: true, lessons: FAKE_LESSONS, templates: ["قالب۱"], table: FAKE_TABLE, app_version: "test" }),
  get_license_status: async () => ({ success: true, saved_code: SCENARIO.savedCode, bypass: SCENARIO.bypass, app_title: "تست", font_faces: [] }),
  activate_license: async (code) => { SCENARIO.lastActivated = code; return SCENARIO.valid ? { success: true, valid: true, message: "ok" } : { success: true, valid: false, message: "کد نامعتبر" }; },
  list_lessons: async () => ({ success: true, lessons: FAKE_LESSONS }),
  get_topics: async (name) => ({ success: true, topics: FAKE_TOPICS[name] || [] }),
  get_settings: async () => ({ success: true, settings: { app_title: "تست", license_api_url: "https://x", theme_accent: "#6d5efc", default_days: 10 } }),
  save_settings: async (s) => ({ success: true, settings: s }),
  get_motivational_sentences: async () => ({ success: true, sentences: ["سلام {{name}}"] }),
  save_motivational_sentences: async (s) => ({ success: true, sentences: s }),
  add_subject: async (subject, topics) => {
    subjectsState.push({ subject, hours: "1", label: `${subject} - ${topics.join(", ")}`, manual: [], data: topics.map((t) => `${t}-محتوا`) });
    recompute();
    return { success: true, table: FAKE_TABLE };
  },
  remove_subject: async (row) => { subjectsState.splice(row, 1); recompute(); return { success: true, table: FAKE_TABLE }; },
  set_days: async (n) => { FAKE_TABLE.days = parseInt(n, 10); recompute(); return { success: true, table: FAKE_TABLE }; },
  set_student_name: async () => ({ success: true }),
  update_cell: async (row, col, text) => { subjectsState[row].manual[col] = text; recompute(); return { success: true, table: FAKE_TABLE }; },
  clear_cells: async (cells) => { cells.forEach(([r, c]) => { subjectsState[r].manual[c] = ""; }); recompute(); return { success: true, table: FAKE_TABLE }; },
  bulk_replace: async (cells, val) => { cells.forEach(([r, c]) => { subjectsState[r].manual[c] = val; }); recompute(); return { success: true, table: FAKE_TABLE }; },
  insert_and_shift: async (cells, val) => { cells.forEach(([r, c]) => { subjectsState[r].manual[c] = val; }); recompute(); return { success: true, table: FAKE_TABLE }; },
  save_selection_as_template: async () => ({ success: true, templates: ["قالب۱", "قالب۲"] }),
  get_manual_for_edit: async (row) => ({ success: true, manual: subjectsState[row].manual, days: FAKE_TABLE.days }),
  set_manual: async (row, manual) => { subjectsState[row].manual = manual; recompute(); return { success: true, table: FAKE_TABLE }; },
  add_manual_subject: async (manual) => { subjectsState.push({ subject: "دستی", hours: "0", label: "دستی | ...", manual, data: [] }); recompute(); return { success: true, table: FAKE_TABLE }; },
  merge_row: async () => ({ success: true, table: FAKE_TABLE }),
  list_templates: async () => ({ success: true, templates: ["قالب۱"] }),
  get_template_table: async () => ({ success: true, rows: [["a", "b"]] }),
  save_template_table: async () => ({ success: true, templates: ["قالب۱"] }),
  delete_template: async () => ({ success: true, templates: [] }),
  get_lesson_table: async () => ({ success: true, rows: [["مبحث", "محتوا"]] }),
  save_lesson_table: async () => ({ success: true, lessons: FAKE_LESSONS }),
  delete_lesson: async () => ({ success: true, lessons: FAKE_LESSONS }),
  get_lesson_codes: async () => ({ success: true, codes: { "ریاضی": "101" } }),
  save_lesson_codes: async () => ({ success: true, codes: {}, lessons: FAKE_LESSONS }),
  import_template: async () => { subjectsState.push({ subject: "قالب۱", hours: "0", label: "قالب۱ (ردیف ۱)", manual: ["x"], data: [] }); recompute(); return { success: true, table: FAKE_TABLE }; },
  reset_schedule: async () => { subjectsState = []; recompute(); return { success: true, table: FAKE_TABLE }; },
  export_word: async () => (subjectsState.length ? { success: true, path: "/tmp/x.docx" } : { success: false, message: "لطفاً حداقل یک درس اضافه کنید." }),
  export_pdf: async () => (subjectsState.length ? { success: true, path: "/tmp/x.pdf" } : { success: false, message: "لطفاً حداقل یک درس اضافه کنید." }),
  window_minimize: async () => ({ success: true }),
  window_toggle_maximize: async () => ({ success: true }),
  window_close: async () => ({ success: true }),
};

function assert(cond, msg) { if (!cond) throw new Error("FAILED: " + msg); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function click(node, win) { node.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); }
function findByText(nodes, text) { return Array.from(nodes).find((n) => n.textContent.trim().includes(text)); }

async function loadApp() {
  const indexPath = path.join(__dirname, "..", "app", "web", "index.html");
  const dom = await JSDOM.fromFile(indexPath, { runScripts: "dangerously", resources: "usable", url: "file://" + indexPath });
  const { window } = dom;
  window.pywebview = { api };
  await new Promise((resolve) => window.document.addEventListener("DOMContentLoaded", () => setTimeout(resolve, 50)));
  window.dispatchEvent(new window.Event("pywebviewready"));
  await sleep(150);
  return window;
}

async function licenseScenario() {
  SCENARIO.bypass = false; SCENARIO.savedCode = "ABCD-1234-EFGH-5678"; SCENARIO.valid = true;
  const window = await loadApp();
  const doc = window.document;
  assert(!doc.getElementById("licenseScreen").classList.contains("hidden"), "بدون bypass صفحهٔ لایسنس باید نمایش داده شود");
  assert(doc.getElementById("mainScreen").classList.contains("hidden"), "صفحهٔ اصلی باید پنهان باشد");
  assert(doc.getElementById("licenseCodeInput").value === "ABCD-1234-EFGH-5678", "کد ذخیره‌شده باید در فیلد پر شده باشد");
  assert(!doc.getElementById("openConnSettings"), "لینک تنظیمات اتصال نباید در صفحهٔ لایسنس باشد");
  click(doc.getElementById("activateBtn"), window);
  await sleep(900);
  assert(SCENARIO.lastActivated === "ABCD-1234-EFGH-5678", "با یک کلیک، همان کد ذخیره‌شده باید ارسال شود");
  assert(!doc.getElementById("mainScreen").classList.contains("hidden"), "بعد از فعال‌سازی باید وارد برنامه شود");
  assert(!doc.getElementById("infoOverlay").classList.contains("hidden"), "بعد از ورود، پاپ‌آپ اطلاعات اصلی باید خودکار باز شود");
  console.log("✔ لایسنس: کد ذخیره‌شده در فیلد، فعال‌سازی با یک کلیک، بازشدن خودکار پاپ‌آپ");
  window.close();

  SCENARIO.valid = false; SCENARIO.savedCode = "BAD-CODE";
  const w2 = await loadApp();
  click(w2.document.getElementById("activateBtn"), w2);
  await sleep(120);
  assert(w2.document.getElementById("licenseMsg").textContent.includes("نامعتبر"), "پیام خطای کد نامعتبر باید نمایش داده شود");
  assert(w2.document.getElementById("mainScreen").classList.contains("hidden"), "با کد نامعتبر نباید وارد برنامه شد");
  console.log("✔ لایسنس: کد نامعتبر وارد برنامه نمی‌کند");
  w2.close();
  SCENARIO.bypass = true; SCENARIO.valid = true; SCENARIO.savedCode = "";
}

async function main() {
  await licenseScenario();
  const indexPath = path.join(__dirname, "..", "app", "web", "index.html");
  const dom = await JSDOM.fromFile(indexPath, {
    runScripts: "dangerously",
    resources: "usable",
    url: "file://" + indexPath,
  });
  const { window } = dom;
  const doc = window.document;
  window.pywebview = { api };

  await new Promise((resolve) => doc.addEventListener("DOMContentLoaded", () => setTimeout(resolve, 50)));
  window.dispatchEvent(new window.Event("pywebviewready"));
  await sleep(150);

  assert(!doc.getElementById("mainScreen").classList.contains("hidden"), "mainScreen باید نمایش داده شود");
  console.log("✔ بوت اولیه (حالت تست) موفق بود");

  // --- پاپ‌آپ اطلاعات اصلی ---
  const infoOv = doc.getElementById("infoOverlay");
  assert(!infoOv.classList.contains("hidden"), "پاپ‌آپ اطلاعات اصلی بعد از ورود باید باز باشد");
  const nameInput = doc.getElementById("studentNameInput");
  nameInput.value = "علی رضایی";
  nameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(doc.getElementById("infoOk"), window);
  assert(infoOv.classList.contains("hidden"), "پاپ‌آپ باید بسته شود");
  assert(doc.getElementById("headerStudent").textContent.includes("علی رضایی"), "نام دانش‌آموز در هدر نمایش داده شود");
  click(doc.getElementById("btnInfo"), window);
  assert(!infoOv.classList.contains("hidden"), "دکمهٔ هدر باید پاپ‌آپ را دوباره باز کند");
  assert(nameInput.value === "علی رضایی", "مقدار واردشده بعد از بسته/باز شدن باید حفظ شود");
  click(doc.getElementById("infoClose"), window);
  assert(infoOv.classList.contains("hidden"), "دکمهٔ ✕ باید پاپ‌آپ را ببندد");
  // انتخاب درس و پیش‌نمایش باید همزمان در صفحه ثابت و قابل‌دسترس باشند
  assert(doc.getElementById("addSubjectBtn") && doc.getElementById("scheduleTableWrap"), "پنل انتخاب درس و پیش‌نمایش باید همیشه در صفحه باشند");
  assert(!doc.querySelector("#mainScreen .left-col #studentNameInput"), "اطلاعات اصلی دیگر داخل ستون کناری نیست");
  console.log("✔ پاپ‌آپ اطلاعات اصلی: باز/بسته/بازگشایی با دکمهٔ هدر، حفظ مقدار، چیپ هدر");

  click(doc.querySelector("#subjectComboMount .combo-input"), window);
  await sleep(20);
  const comboItems = doc.querySelectorAll(".combo-item");
  const riaziItem = findByText(comboItems, "ریاضی");
  assert(riaziItem, "آیتم «ریاضی» باید در کمبوباکس نمایش داده شود");
  click(riaziItem, window);
  await sleep(50);

  const topicItems = doc.querySelectorAll("#topicsList .list-item");
  assert(topicItems.length === 3, "باید ۳ مبحث نمایش داده شود، تعداد: " + topicItems.length);
  click(topicItems[0], window);
  click(topicItems[1], window);
  assert(topicItems[0].classList.contains("selected") && topicItems[1].classList.contains("selected"), "دو مبحث باید انتخاب‌شده نمایش داده شوند");
  console.log("✔ کمبوباکس جستجوپذیر و انتخاب مباحث موفق بود");

  click(doc.getElementById("addSubjectBtn"), window);
  await sleep(100);
  assert(subjectsState.length === 1, "یک درس باید در بک‌اند اضافه شده باشد");
  let rows = doc.querySelectorAll("#scheduleTableWrap table tbody tr");
  assert(rows.length === 1, "جدول باید یک ردیف داشته باشد، تعداد: " + rows.length);
  let subjectListRows = doc.querySelectorAll("#subjectsList .subject-row");
  assert(subjectListRows.length === 1, "پنل «دروس انتخاب‌شده» باید یک مورد نمایش دهد");
  console.log("✔ افزودن درس، رندر جدول و پنل کناری موفق بود");

  const firstDayCell = doc.querySelector("#scheduleTableWrap td.day-cell");
  firstDayCell.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
  await sleep(20);
  const textarea = firstDayCell.querySelector("textarea");
  assert(textarea, "باید textarea برای ویرایش درجا ساخته شود");
  textarea.value = "متن ویرایش‌شده";
  textarea.dispatchEvent(new window.Event("blur"));
  await sleep(80);
  assert(subjectsState[0].manual[0] === "متن ویرایش‌شده", "ویرایش درجا باید در بک‌اند ذخیره شود");
  console.log("✔ ویرایش درجا (inline edit) موفق بود");

  await sleep(30);
  const cellsNow = doc.querySelectorAll("#scheduleTableWrap td.day-cell");
  click(cellsNow[1], window);
  click(cellsNow[2], window);
  assert(!doc.getElementById("selectionBar").classList.contains("hidden"), "نوار عملیات گروهی باید نمایش داده شود");
  assert(doc.getElementById("selectionCount").textContent.includes("2"), "باید ۲ خانه انتخاب‌شده گزارش شود");
  click(doc.getElementById("selClear"), window);
  await sleep(80);
  assert(doc.getElementById("selectionBar").classList.contains("hidden"), "بعد از پاک‌کردن، نوار انتخاب باید مخفی شود");
  console.log("✔ انتخاب گروهی خانه‌ها و عملیات «پاک کردن» موفق بود");

  click(doc.querySelector("#subjectsList .subject-row .del"), window);
  await sleep(30);
  let confirmBtn = findByText(doc.querySelectorAll("#modalRoot .modal .btn-danger"), "تأیید");
  assert(confirmBtn, "دیالوگ تأیید حذف باید نمایش داده شود");
  click(confirmBtn, window);
  await sleep(80);
  assert(subjectsState.length === 0, "درس باید حذف شده باشد");
  console.log("✔ حذف درس با دیالوگ تأیید موفق بود");

  click(doc.getElementById("btnTemplateManager"), window);
  await sleep(50);
  assert(doc.querySelector("#modalRoot .modal"), "مودال مدیریت قالب‌ها باید باز شود");
  assert(findByText(doc.querySelectorAll("#modalRoot .modal h2"), "مدیریت قالب‌ها"), "عنوان مودال درست باشد");
  click(doc.querySelector("#modalRoot .modal .x-close"), window);
  await sleep(30);
  assert(!doc.querySelector("#modalRoot .modal"), "مودال باید بسته شود");
  console.log("✔ مودال مدیریت قالب‌ها باز/بسته شد");

  click(doc.getElementById("btnLessonManager"), window);
  await sleep(50);
  const addNewLessonBtn = findByText(doc.querySelectorAll("#modalRoot .modal button"), "افزودن درس جدید");
  assert(addNewLessonBtn, "دکمهٔ افزودن درس جدید باید وجود داشته باشد");
  click(addNewLessonBtn, window);
  await sleep(30);
  assert(doc.querySelector(".edit-grid"), "جدول قابل‌ویرایش باید نمایش داده شود");
  const addRowBtn = findByText(doc.querySelectorAll(".grid-toolbar button"), "+ ردیف");
  const beforeRows = doc.querySelectorAll(".edit-grid tbody tr").length;
  click(addRowBtn, window);
  const afterRows = doc.querySelectorAll(".edit-grid tbody tr").length;
  assert(afterRows === beforeRows + 1, "افزودن ردیف در گرید باید کار کند");
  window.closeModal();
  console.log("✔ مدیریت سورس‌های درسی و گرید قابل‌ویرایش موفق بود");

  await sleep(20);
  click(doc.getElementById("btnNewProgram"), window);
  await sleep(40);
  confirmBtn = findByText(doc.querySelectorAll("#modalRoot .modal .btn-danger"), "تأیید");
  assert(confirmBtn, "دیالوگ تأیید برنامهٔ جدید باید نمایش داده شود");
  click(confirmBtn, window);
  await sleep(80);
  assert(doc.querySelector("#scheduleTableWrap .empty-table-hint"), "بعد از ریست باید پیام خالی‌بودن جدول نمایش داده شود");
  console.log("✔ ریست برنامه (برنامهٔ جدید) موفق بود");

  click(doc.getElementById("btnExportWord"), window);
  await sleep(60);
  assert(doc.querySelector("#toastRoot .toast.err"), "بدون درس، خروجی ورد باید خطا نمایش دهد");
  console.log("✔ اعتبارسنجی خروجی ورد (بدون درس) موفق بود");

  click(doc.getElementById("btnSettings"), window);
  await sleep(50);
  assert(findByText(doc.querySelectorAll("#modalRoot .modal h2"), "تنظیمات برنامه"), "مودال تنظیمات باید باز شود");
  const settingsText = doc.querySelector("#modalRoot .modal").textContent;
  assert(!settingsText.includes("آدرس سرور") && !settingsText.includes("عنوان برنامه"), "تنظیمات نباید فیلد URL یا عنوان داشته باشد");
  window.closeModal();
  click(doc.getElementById("btnMotivational"), window);
  await sleep(60);
  assert(findByText(doc.querySelectorAll("#modalRoot .modal h2"), "جملات انگیزشی"), "ویرایشگر جملات انگیزشی از هدر باید باز شود");
  window.closeModal();
  console.log("✔ تنظیمات بدون URL/عنوان؛ جملات انگیزشی از پنل اپ قابل‌ویرایش است");

  console.log("\nALL FRONTEND TESTS PASSED ✅");
  process.exit(0);
}

main().catch((err) => { console.error("TEST ERROR:", err); process.exit(1); });
