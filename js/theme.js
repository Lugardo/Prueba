/* Helper de tema (claro / aster).
 * Guarda la preferencia en localStorage y, si hay sesión, la sincroniza con el
 * servidor vía api.php?action=users/set_theme.
 */
(function (global) {
  const KEY = 'aster_theme';
  const VALID = ['light', 'aster'];

  function apply(name) {
    if (!VALID.includes(name)) name = 'light';
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem(KEY, name); } catch (_) {}
    updateIcon();
  }

  function get() {
    try { return localStorage.getItem(KEY) || 'light'; }
    catch (_) { return 'light'; }
  }

  async function set(name, { syncServer = true } = {}) {
    apply(name);
    if (syncServer) {
      try {
        await fetch('api.php?action=users/set_theme', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: name }),
        });
      } catch (_) { /* offline: mantenemos solo localStorage */ }
    }
  }

  function toggle() {
    set(get() === 'aster' ? 'light' : 'aster');
  }

  function updateIcon() {
    const btns = document.querySelectorAll('.theme-toggle');
    const current = get();
    btns.forEach(b => {
      b.textContent = current === 'aster' ? '☀️' : '🌌';
      b.setAttribute('title', current === 'aster' ? 'Cambiar a tema claro' : 'Cambiar a tema Aster');
    });
  }

  function wireToggles() {
    document.querySelectorAll('.theme-toggle').forEach(b => {
      if (b.__wired) return;
      b.__wired = true;
      b.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
    });
    updateIcon();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggles);
  } else {
    wireToggles();
  }

  global.Theme = { apply, get, set, toggle, wireToggles };
})(window);
