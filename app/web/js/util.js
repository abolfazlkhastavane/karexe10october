// ==========================================================================
// ابزارهای کمکی عمومی
// ==========================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------------- Toast ----------------
function toast(message, type = "") {
  const root = $("#toastRoot");
  const node = el("div", { class: `toast ${type}` }, message);
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = "opacity .2s";
    node.style.opacity = "0";
    setTimeout(() => node.remove(), 200);
  }, 2600);
}
function toastError(message) { toast(message, "err"); }
function toastOk(message) { toast(message, "ok"); }

// ---------------- Confirm dialog (replaces window.confirm for consistent look) ----------------
function confirmDialog(message, { title = "تأیید عملیات", okText = "تأیید", danger = true } = {}) {
  return new Promise((resolve) => {
    const root = $("#modalRoot");
    const overlay = el("div", { class: "overlay" }, [
      el("div", { class: "modal", style: "max-width:360px" }, [
        el("div", { class: "modal-header" }, [el("h2", {}, title)]),
        el("div", { class: "modal-body" }, [el("p", { style: "font-size:13px;color:var(--text-2);line-height:1.8" }, message)]),
        el("div", { class: "modal-actions" }, [
          el("button", { class: "btn btn-ghost", onclick: () => finish(false) }, "انصراف"),
          el("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, onclick: () => finish(true) }, okText),
        ]),
      ]),
    ]);
    function finish(v) { root.innerHTML = ""; resolve(v); }
    root.innerHTML = "";
    root.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(false); });
  });
}

// ---------------- Simple prompt dialog ----------------
function promptDialog(message, { title = "ورود مقدار", okText = "تأیید", placeholder = "", initial = "" } = {}) {
  return new Promise((resolve) => {
    const root = $("#modalRoot");
    const input = el("input", { type: "text", placeholder, value: initial });
    const overlay = el("div", { class: "overlay" }, [
      el("div", { class: "modal", style: "max-width:380px" }, [
        el("div", { class: "modal-header" }, [el("h2", {}, title)]),
        el("div", { class: "modal-body" }, [
          el("p", { style: "font-size:12.5px;color:var(--text-2);margin-bottom:10px" }, message),
          el("div", { class: "field" }, [input]),
        ]),
        el("div", { class: "modal-actions" }, [
          el("button", { class: "btn btn-ghost", onclick: () => finish(null) }, "انصراف"),
          el("button", { class: "btn btn-primary", onclick: () => finish(input.value) }, okText),
        ]),
      ]),
    ]);
    function finish(v) { root.innerHTML = ""; resolve(v); }
    root.innerHTML = "";
    root.appendChild(overlay);
    setTimeout(() => input.focus(), 30);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(input.value); if (e.key === "Escape") finish(null); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(null); });
  });
}

function closeModal() { $("#modalRoot").innerHTML = ""; }

function setBusy(buttonEl, busy, busyLabel) {
  if (!buttonEl) return;
  if (busy) {
    buttonEl.dataset.originalHtml = buttonEl.innerHTML;
    buttonEl.disabled = true;
    buttonEl.innerHTML = `<span class="spinner"></span> ${busyLabel || ""}`;
  } else {
    buttonEl.disabled = false;
    if (buttonEl.dataset.originalHtml) buttonEl.innerHTML = buttonEl.dataset.originalHtml;
  }
}
