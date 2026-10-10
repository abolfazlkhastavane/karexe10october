// ==========================================================================
// کامپوننت انتخاب جستجوپذیر (معادل SearchableComboBox در نسخهٔ Qt)
// ==========================================================================
function createSearchableCombo({ placeholder = "انتخاب کنید...", emptyLabel = "موردی یافت نشد", onSelect }) {
  let items = []; // [{value, label}]
  let currentValue = null;

  const inputDisplay = el("input", { class: "combo-input", readonly: "readonly", placeholder });
  const wrap = el("div", { class: "combo" }, [inputDisplay]);
  let panel = null;

  function closePanel() {
    if (panel) { panel.remove(); panel = null; document.removeEventListener("mousedown", onDocClick, true); }
  }
  function onDocClick(e) {
    if (panel && !panel.contains(e.target) && e.target !== inputDisplay) closePanel();
  }

  function renderList(listEl, filter) {
    listEl.innerHTML = "";
    const f = (filter || "").trim().toLowerCase();
    const filtered = items.filter((it) => !f || it.label.toLowerCase().includes(f));
    if (!filtered.length) {
      listEl.appendChild(el("div", { class: "manager-empty" }, emptyLabel));
      return;
    }
    filtered.forEach((it) => {
      const row = el("div", { class: "combo-item" + (it.value === currentValue ? " active" : "") }, it.label);
      row.addEventListener("click", () => {
        currentValue = it.value;
        inputDisplay.value = it.label;
        closePanel();
        if (onSelect) onSelect(it.value, it);
      });
      listEl.appendChild(row);
    });
  }

  function openPanel() {
    if (panel) return;
    panel = el("div", { class: "combo-panel" });
    const search = el("input", { type: "text", placeholder: "جستجو..." });
    const list = el("div", { class: "combo-list" });
    panel.appendChild(search);
    panel.appendChild(list);
    wrap.appendChild(panel);
    renderList(list, "");
    search.addEventListener("input", () => renderList(list, search.value));
    setTimeout(() => search.focus(), 20);
    setTimeout(() => document.addEventListener("mousedown", onDocClick, true), 0);
  }

  inputDisplay.addEventListener("click", () => { if (panel) closePanel(); else openPanel(); });

  return {
    node: wrap,
    setItems(newItems) {
      items = newItems || [];
      if (currentValue !== null && !items.some((i) => i.value === currentValue)) {
        currentValue = null;
        inputDisplay.value = "";
      }
      if (currentValue === null && items.length) {
        currentValue = items[0].value;
        inputDisplay.value = items[0].label;
      }
    },
    getValue() { return currentValue; },
    setValue(value) {
      const found = items.find((i) => i.value === value);
      if (found) { currentValue = value; inputDisplay.value = found.label; }
    },
    clear() { currentValue = null; inputDisplay.value = ""; items = []; },
  };
}
