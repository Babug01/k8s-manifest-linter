// Shared, tool-agnostic UI effects. Imported once by Header, so every tool gets them.
const PANEL = 'div[style*="border: 1px solid var(--border"][style*="border-radius"]';
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function toastHost() {
  let host = document.getElementById("fx-toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "fx-toasts";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.append(host);
  }
  return host;
}

export function toast(message) {
  const host = toastHost();
  const item = document.createElement("div");
  item.className = "fx-toast";
  item.textContent = message;
  host.append(item);
  if (host.childElementCount > 3) host.firstElementChild.remove();
  setTimeout(() => item.classList.add("leaving"), 1800);
  setTimeout(() => item.remove(), 2200);
}

function ripple(event) {
  const button = event.target.closest("button");
  if (!button || button.disabled || reducedMotion.matches || event.button !== 0) return;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const wave = document.createElement("span");
  wave.className = "fx-ripple";
  wave.style.width = wave.style.height = `${size}px`;
  wave.style.left = `${event.clientX - rect.left - size / 2}px`;
  wave.style.top = `${event.clientY - rect.top - size / 2}px`;
  button.classList.add("fx-ripple-host");
  button.append(wave);
  wave.addEventListener("animationend", () => wave.remove(), { once: true });
}

let frame = 0;
function spotlight(event) {
  if (frame || reducedMotion.matches) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const panel = event.target.closest?.(PANEL);
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panel.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    panel.style.setProperty("--my", `${event.clientY - rect.top}px`);
  });
}

function patchClipboard() {
  const clipboard = navigator.clipboard;
  if (!clipboard?.writeText || clipboard.writeText.fxPatched) return;
  const original = clipboard.writeText.bind(clipboard);
  const patched = (text) =>
    original(text).then((result) => {
      toast("Copied to clipboard");
      return result;
    });
  patched.fxPatched = true;
  clipboard.writeText = patched;
}

if (!window.__devToolboxFx) {
  window.__devToolboxFx = true;
  document.addEventListener("pointerdown", ripple, { passive: true });
  document.addEventListener("pointermove", spotlight, { passive: true });
  patchClipboard();
}
