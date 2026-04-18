/* Funciones de autenticación compartidas */
(function (global) {
  function generateUsername(name, email) {
    const base = (email.split("@")[0] || name || "usuario")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 20) || "usuario";
    let candidate = base;
    let i = 1;
    while (DB.getUserByUsername(candidate)) {
      candidate = `${base}${i++}`;
      if (i > 9999) { candidate = base + Date.now().toString(36); break; }
    }
    return candidate;
  }

  const Auth = {
    login(identifier, password) {
      const user = DB.getUserByIdentifier(identifier);
      if (!user || user.password !== password) return { ok: false, error: "Usuario o contraseña incorrectos." };
      if (user.status === "pending")  return { ok: false, state: "pending",  user, error: "Tu registro aún no ha sido aprobado." };
      if (user.status === "rejected") return { ok: false, state: "rejected", user, error: "Tu solicitud fue rechazada." };
      if (user.status === "inactive") return { ok: false, state: "inactive", user, error: "Tu cuenta fue dada de baja." };
      DB.setSession({ userId: user.id });
      return { ok: true, user };
    },

    register(data) {
      if (!data.password || !data.name || !data.email || !data.phone)
        return { ok: false, error: "Faltan campos obligatorios." };
      const email = data.email.trim().toLowerCase();
      if (DB.getUsers().find(u => u.email.toLowerCase() === email))
        return { ok: false, error: "Ese correo ya está registrado." };
      const user = DB.addUser({
        name: data.name.trim(),
        phone: data.phone.trim(),
        email: data.email.trim(),
        username: generateUsername(data.name, email),
        password: data.password,
        role: "",
        status: "pending",
        avatar: data.avatar || "",
      });
      // No iniciamos sesión: la cuenta queda pendiente de aprobación.
      return { ok: true, user, state: "pending" };
    },

    currentUser() {
      const s = DB.getSession();
      if (!s) return null;
      return DB.getUserById(s.userId);
    },

    logout() { DB.clearSession(); },

    generateResetCode(identifier) {
      const user = DB.getUserByIdentifier(identifier);
      if (!user) return { ok: false, error: "No encontramos una cuenta con ese dato." };
      const code = String(Math.floor(100000 + Math.random() * 900000));
      DB.setResetCode(user.id, code);
      return { ok: true, code, userId: user.id, email: user.email };
    },

    resetPassword(userId, code, newPassword) {
      if (!newPassword || newPassword.length < 6) return { ok: false, error: "La contraseña debe tener mínimo 6 caracteres." };
      if (!DB.consumeResetCode(userId, code)) return { ok: false, error: "Código inválido o expirado." };
      DB.updateUser(userId, { password: newPassword });
      return { ok: true };
    },

    requireAuth(allowedRoles) {
      const user = this.currentUser();
      if (!user) { window.location.href = "index.html"; return null; }
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        window.location.href = "index.html";
        return null;
      }
      return user;
    },
  };

  global.Auth = Auth;
})(window);
