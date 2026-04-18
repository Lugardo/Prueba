/* Funciones de autenticación compartidas */
(function (global) {
  const Auth = {
    login(username, password) {
      const user = DB.getUserByUsername(username);
      if (!user || user.password !== password) return { ok: false, error: "Usuario o contraseña incorrectos." };
      DB.setSession({ userId: user.id });
      return { ok: true, user };
    },

    register(data) {
      if (!data.username || !data.password || !data.name || !data.email || !data.phone || !data.role)
        return { ok: false, error: "Faltan campos obligatorios." };
      if (DB.getUserByUsername(data.username))
        return { ok: false, error: "Ese usuario ya está registrado." };
      const exists = DB.getUsers().find(u => u.email.toLowerCase() === data.email.toLowerCase());
      if (exists) return { ok: false, error: "Ese correo ya está registrado." };
      const user = DB.addUser({
        name: data.name.trim(),
        phone: data.phone.trim(),
        email: data.email.trim(),
        username: data.username.trim(),
        password: data.password,
        role: data.role,
        avatar: data.avatar || "",
      });
      DB.setSession({ userId: user.id });
      return { ok: true, user };
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
