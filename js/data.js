/* Capa de datos local usando localStorage.
   Estructura:
   - ctd_users:   [{ id, name, phone, email, username, password, role, avatar }]
   - ctd_tasks:   [{ id, userId, name, time, comments, done, createdAt, updatedAt }]
   - ctd_session: { userId }
   - ctd_resets:  { [userId]: { code, expiresAt } }
*/
(function (global) {
  const K = {
    USERS: "ctd_users",
    TASKS: "ctd_tasks",
    SESSION: "ctd_session",
    RESETS: "ctd_resets",
  };

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function seed() {
    if (!localStorage.getItem(K.USERS)) {
      const seedUsers = [
        { id: uid(), name: "Admin General", phone: "+52 5500000000", email: "admin@orbital.app", username: "admin",  password: "admin123",  role: "administrador", status: "approved", avatar: "" },
        { id: uid(), name: "Laura Empleador", phone: "+52 5511111111", email: "laura@orbital.app", username: "laura",  password: "laura123",  role: "empleador",     status: "approved", avatar: "" },
        { id: uid(), name: "Sergio Supervisor", phone: "+52 5522222222", email: "sergio@orbital.app", username: "sergio", password: "sergio123", role: "supervisor",    status: "approved", avatar: "" },
        { id: uid(), name: "Carlos Colaborador", phone: "+52 5533333333", email: "carlos@orbital.app", username: "carlos", password: "carlos123", role: "colaborador",   status: "approved", avatar: "" },
      ];
      write(K.USERS, seedUsers);
    }
    if (!localStorage.getItem(K.TASKS)) {
      const users = read(K.USERS, []);
      const colab = users.find(u => u.role === "colaborador");
      if (colab) {
        write(K.TASKS, [
          { id: uid(), userId: colab.id, name: "Revisar reportes diarios", time: "01:30", comments: "Validar métricas del sistema.", done: false, createdAt: Date.now(), updatedAt: Date.now() },
          { id: uid(), userId: colab.id, name: "Calibrar sensores", time: "00:45", comments: "Estación norte.", done: true, createdAt: Date.now(), updatedAt: Date.now() },
        ]);
      } else write(K.TASKS, []);
    }
    if (!localStorage.getItem(K.RESETS)) write(K.RESETS, {});
  }

  const DB = {
    // Users
    getUsers: () => read(K.USERS, []),
    saveUsers: (users) => write(K.USERS, users),
    getUserById: (id) => read(K.USERS, []).find(u => u.id === id) || null,
    getUserByUsername: (username) => read(K.USERS, []).find(u => u.username.toLowerCase() === String(username).toLowerCase()) || null,
    getUserByIdentifier: (ident) => {
      const v = String(ident).toLowerCase();
      return read(K.USERS, []).find(u => u.username.toLowerCase() === v || u.email.toLowerCase() === v) || null;
    },
    addUser: (user) => {
      const users = read(K.USERS, []);
      const u = { ...user, id: uid() };
      users.push(u);
      write(K.USERS, users);
      return u;
    },
    updateUser: (id, patch) => {
      const users = read(K.USERS, []);
      const i = users.findIndex(u => u.id === id);
      if (i < 0) return null;
      users[i] = { ...users[i], ...patch };
      write(K.USERS, users);
      return users[i];
    },
    deleteUser: (id) => {
      const users = read(K.USERS, []).filter(u => u.id !== id);
      write(K.USERS, users);
      const tasks = read(K.TASKS, []).filter(t => t.userId !== id);
      write(K.TASKS, tasks);
    },

    // Tasks
    getTasks: () => read(K.TASKS, []),
    getTasksByUser: (userId) => read(K.TASKS, []).filter(t => t.userId === userId),
    addTask: (task) => {
      const tasks = read(K.TASKS, []);
      const t = { ...task, id: uid(), done: !!task.done, createdAt: Date.now(), updatedAt: Date.now() };
      tasks.push(t);
      write(K.TASKS, tasks);
      return t;
    },
    updateTask: (id, patch) => {
      const tasks = read(K.TASKS, []);
      const i = tasks.findIndex(t => t.id === id);
      if (i < 0) return null;
      tasks[i] = { ...tasks[i], ...patch, updatedAt: Date.now() };
      write(K.TASKS, tasks);
      return tasks[i];
    },
    deleteTask: (id) => {
      const tasks = read(K.TASKS, []).filter(t => t.id !== id);
      write(K.TASKS, tasks);
    },

    // Session
    getSession: () => read(K.SESSION, null),
    setSession: (session) => write(K.SESSION, session),
    clearSession: () => localStorage.removeItem(K.SESSION),

    // Password resets
    getResets: () => read(K.RESETS, {}),
    setResetCode: (userId, code, ttlMs = 15 * 60 * 1000) => {
      const r = read(K.RESETS, {});
      r[userId] = { code, expiresAt: Date.now() + ttlMs };
      write(K.RESETS, r);
    },
    consumeResetCode: (userId, code) => {
      const r = read(K.RESETS, {});
      const entry = r[userId];
      if (!entry) return false;
      if (Date.now() > entry.expiresAt) { delete r[userId]; write(K.RESETS, r); return false; }
      if (String(entry.code) !== String(code)) return false;
      delete r[userId];
      write(K.RESETS, r);
      return true;
    },
  };

  seed();
  global.DB = DB;
  global.uid = uid;
})(window);
