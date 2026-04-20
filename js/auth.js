/* Funciones de autenticación (client) respaldadas por api.php */
(function (global) {

  async function apiPost(action, body) {
    const res = await fetch(`api.php?action=${encodeURIComponent(action)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const j = await res.json().catch(() => ({ ok: false, error: "Respuesta inválida del servidor." }));
    return j;
  }

  const Auth = {
    async login(identifier, password) {
      const res = await apiPost("auth/login", { identifier, password });
      if (res.ok && res.user) {
        // Sincroniza con el cache local
        DB.setSession({ userId: res.user.id });
        if (!DB.getUserById(res.user.id)) DB.getUsers().push(res.user);
      }
      return res;
    },

    async register(data) {
      const res = await apiPost("auth/register", {
        name: data.name, phone: data.phone, email: data.email,
        username: data.username || null,
        password: data.password, avatar: data.avatar || null,
      });
      return res;
    },

    async currentUser() {
      const s = DB.getSession();
      return s ? DB.getUserById(s.userId) : null;
    },

    async logout() {
      try { await apiPost("auth/logout", {}); } catch (_) {}
      DB.clearSession();
    },

    // Sin recuperación por ahora (queda el hueco para cuando se conecte email)
    async generateResetCode() { return { ok: false, error: "No disponible." }; },
    async resetPassword()    { return { ok: false, error: "No disponible." }; },

    // Dashboard/reports llaman a esto al arrancar
    async requireAuth(allowedRoles) {
      const bootstrap = await DB.load();
      if (!bootstrap.authed) {
        window.location.href = "index.html";
        return null;
      }
      const user = bootstrap.me;
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        window.location.href = "dashboard.html";
        return null;
      }
      return user;
    },
  };

  global.Auth = Auth;
})(window);
