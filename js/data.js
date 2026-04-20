/* Capa de datos respaldada por api.php (MySQL).
 *
 * Mantiene un cache en memoria (STATE.users, STATE.tasks) que se puebla vía
 * DB.load() al arrancar cada página. Las lecturas (DB.getUsers, DB.getTasks,...)
 * se mantienen síncronas contra el cache; las mutaciones aplican un update
 * optimista en el cache y disparan fetch() al API en paralelo (fire-and-forget
 * con logging de errores).
 */
(function (global) {

  const STATE = {
    users: [],
    tasks: [],
    me: null,     // usuario de sesión (si lo hay)
  };

  const API = "api.php";

  async function apiGet(action) {
    const res = await fetch(`${API}?action=${encodeURIComponent(action)}`, {
      credentials: "same-origin",
      headers: { "Accept": "application/json" },
    });
    const j = await res.json().catch(() => ({ ok: false, error: "Respuesta inválida" }));
    return { status: res.status, ...j };
  }
  async function apiPost(action, body) {
    const res = await fetch(`${API}?action=${encodeURIComponent(action)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const j = await res.json().catch(() => ({ ok: false, error: "Respuesta inválida" }));
    return { status: res.status, ...j };
  }
  function bgPost(action, body) {
    apiPost(action, body).then(r => {
      if (!r.ok) console.warn(`[api ${action}]`, r.error || r);
    }).catch(err => console.warn(`[api ${action}] network`, err));
  }

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  /* ------------ Carga inicial ------------ */

  async function load() {
    const me = await apiGet("auth/me");
    STATE.me = me.ok ? me.user : null;
    if (!STATE.me) return { authed: false };

    const [uList, tList] = await Promise.all([
      apiGet("users/list"),
      apiGet("tasks/list"),
    ]);
    STATE.users = uList.ok ? (uList.users || []) : [];
    STATE.tasks = tList.ok ? (tList.tasks || []) : [];
    return { authed: true, me: STATE.me };
  }

  async function refresh() {
    const [uList, tList] = await Promise.all([
      apiGet("users/list"),
      apiGet("tasks/list"),
    ]);
    if (uList.ok) STATE.users = uList.users || [];
    if (tList.ok) STATE.tasks = tList.tasks || [];
  }

  /* ------------ DB API (compatible con el código actual) ------------ */

  const DB = {
    // sync reads - contra cache
    getUsers: () => STATE.users.slice(),
    getTasks: () => STATE.tasks.slice(),
    getTasksByUser: (userId) => STATE.tasks.filter(t => t.userId === userId),
    getUserById: (id) => STATE.users.find(u => u.id === id) || null,
    getUserByUsername: (username) => {
      const v = String(username || "").toLowerCase();
      return STATE.users.find(u => (u.username || "").toLowerCase() === v) || null;
    },
    getUserByIdentifier: (ident) => {
      const v = String(ident || "").toLowerCase();
      return STATE.users.find(u =>
        (u.username || "").toLowerCase() === v ||
        (u.email || "").toLowerCase() === v
      ) || null;
    },

    // sesión (cache del usuario actual)
    getSession: () => STATE.me ? { userId: STATE.me.id } : null,
    setSession: (s) => { if (s) { const u = DB.getUserById(s.userId); if (u) STATE.me = u; } },
    clearSession: () => { STATE.me = null; },

    // Mutaciones (optimistas + API en background)
    addUser: (user) => {
      // Se crea por auth/register en flujos reales; aquí solo mantenemos compat.
      const u = { ...user, id: user.id || uid() };
      STATE.users.push(u);
      return u;
    },
    updateUser: (id, patch) => {
      const i = STATE.users.findIndex(u => u.id === id);
      if (i < 0) return null;
      STATE.users[i] = { ...STATE.users[i], ...patch };
      // Enrutar al endpoint adecuado
      if (patch.role !== undefined && Object.keys(patch).length === 1)
        bgPost("users/change_role", { id, role: patch.role });
      else if (patch.status !== undefined && Object.keys(patch).length === 1)
        bgPost("users/change_status", { id, status: patch.status });
      else if (patch.password !== undefined)
        bgPost("users/reset_password", { id, password: patch.password });
      else {
        // update de datos (name, username, email, phone, avatar)
        const allowed = ["name", "username", "email", "phone", "avatar"];
        const clean = {};
        allowed.forEach(k => { if (k in patch) clean[k] = patch[k]; });
        if (Object.keys(clean).length) bgPost("users/update", { id, patch: clean });
        // Si además vienen status/role juntos, mandarlos por separado
        if ("role" in patch)   bgPost("users/change_role",   { id, role: patch.role });
        if ("status" in patch) bgPost("users/change_status", { id, status: patch.status });
      }
      return STATE.users[i];
    },
    deleteUser: (id) => {
      STATE.users = STATE.users.filter(u => u.id !== id);
      STATE.tasks = STATE.tasks.filter(t => t.userId !== id);
      bgPost("users/delete", { id });
    },

    addTask: (task) => {
      const t = {
        ...task,
        id: task.id || uid(),
        done: !!task.done,
        createdAt: task.createdAt || Date.now(),
        updatedAt: task.updatedAt || Date.now(),
        notes: task.notes || [],
      };
      STATE.tasks.push(t);
      // Pedir al servidor que cree uno y tomarle la id real
      apiPost("tasks/create", {
        userId: t.userId,
        name: t.name,
        start: t.start,
        end: t.end,
        time: t.time,
        comments: t.comments,
        status: t.status || (t.done ? "realizada" : "trabajando"),
      }).then(r => {
        if (r && r.ok && r.task) {
          // Reemplazar el temporal por el real para que las siguientes actualizaciones hablen con el servidor
          const idx = STATE.tasks.findIndex(x => x.id === t.id);
          if (idx >= 0) STATE.tasks[idx] = { ...STATE.tasks[idx], ...r.task };
        } else if (r && !r.ok) console.warn("[api tasks/create]", r.error);
      }).catch(err => console.warn("[api tasks/create] network", err));
      return t;
    },
    updateTask: (id, patch) => {
      const i = STATE.tasks.findIndex(t => t.id === id);
      if (i < 0) return null;
      STATE.tasks[i] = { ...STATE.tasks[i], ...patch, updatedAt: Date.now() };
      const allowed = ["name","start","end","time","comments","status","done","notes"];
      const clean = {};
      allowed.forEach(k => { if (k in patch) clean[k] = patch[k]; });
      // notes se maneja por separado (add/delete), así que si el patch trae notes completas
      // es por borrado desde el diálogo de edición -> dejamos eso al flujo add/delete vía Auth/Notes helpers.
      delete clean.notes;
      if (Object.keys(clean).length) bgPost("tasks/update", { id, patch: clean });
      return STATE.tasks[i];
    },
    deleteTask: (id) => {
      STATE.tasks = STATE.tasks.filter(t => t.id !== id);
      bgPost("tasks/delete", { id });
    },

    // Helpers específicos para notas (usados desde dashboard.js)
    addTaskNote: (taskId, note) => {
      const t = STATE.tasks.find(x => x.id === taskId);
      if (!t) return null;
      const n = { ...note, id: note.id || uid(), createdAt: note.createdAt || Date.now() };
      t.notes = [...(t.notes || []), n];
      apiPost("notes/add", { task_id: taskId, text: n.text, visibility: n.visibility })
        .then(r => {
          if (r && r.ok && r.note) {
            // Reemplazar id temporal por el real
            const task = STATE.tasks.find(x => x.id === taskId);
            if (task) {
              const idx = task.notes.findIndex(x => x.id === n.id);
              if (idx >= 0) task.notes[idx] = r.note;
            }
          } else if (r && !r.ok) console.warn("[api notes/add]", r.error);
        });
      return n;
    },
    deleteTaskNote: (taskId, noteId) => {
      const t = STATE.tasks.find(x => x.id === taskId);
      if (!t) return;
      t.notes = (t.notes || []).filter(n => n.id !== noteId);
      bgPost("notes/delete", { id: noteId });
    },

    // Password resets (no wired to email; quedan por compat si el futuro los usa)
    getResets: () => ({}),
    setResetCode: () => {},
    consumeResetCode: () => false,

    // Expuestos para debug / refresh manual
    load,
    refresh,
    _state: STATE,
  };

  global.DB = DB;
  global.uid = uid;
})(window);
