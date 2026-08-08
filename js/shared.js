/**
 * i-crypt — Shared UI plumbing
 * ---------------------------------------------------------------
 * Toast, copy, modal, alert helpers used by every page. Pure DOM
 * glue — no cipher logic. The cipher lives in engine.js, boards in
 * pieces.js.
 * ---------------------------------------------------------------
 */
"use strict";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 50);
}

function showAlert(id, msg, isErr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="alert ${isErr ? "alert-err" : "alert-ok"}">${msg}</div>`;
}

function clearAlert(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = "";
}

function copyText(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("Copied"))
    .catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Copied");
    });
}

function copyEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  copyText(el.textContent);
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
}

function copyUPI() {
  copyText("rabindrachoudhary125@oksbi");
  const el = document.getElementById("upiMsg");
  if (el) {
    el.textContent = "Copied";
    setTimeout(() => (el.textContent = ""), 2000);
  }
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}