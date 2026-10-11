// Apply before the page paints; works without Firebase or account data storage.
(() => {
  const key = "cityfit-theme";
  const apply = (value) => {
    const theme = value === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#101820" : "#f5f7f7");
    document
      .querySelectorAll("[data-light-mode]")
      .forEach((toggle) => (toggle.checked = theme === "light"));
    return theme;
  };
  let saved;
  try {
    saved = localStorage.getItem(key);
  } catch {}
  apply(saved);
  window.cityfitTheme = {
    setLight(enabled) {
      const theme = apply(enabled ? "light" : "dark");
      try {
        localStorage.setItem(key, theme);
        return true;
      } catch {
        return false;
      }
    },
  };
  window.addEventListener("storage", (event) => {
    if (event.key === key) apply(event.newValue);
  });
})();
