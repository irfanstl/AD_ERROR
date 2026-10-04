const toggle = document.getElementById("toggle");
const categories = document.getElementById("categories");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");

function render(state) {
  toggle.checked = state.enabled;
  categories.checked = state.blockCategories !== false;
  categories.disabled = !state.enabled;
  statusEl.textContent = state.enabled ? "Protection is on" : "Protection is off";
  countEl.textContent = state.popupsBlocked;
}

const refresh = () => chrome.runtime.sendMessage({ type: "getState" }, render);
refresh();

toggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "setEnabled", enabled: toggle.checked }, refresh);
});

categories.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "setCategories", value: categories.checked }, refresh);
});
