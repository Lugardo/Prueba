/* Panel principal. Renderiza según el rol: colaborador, empleador, supervisor, administrador */
(function () {
  const user = Auth.requireAuth();
  if (!user) return;

  // Cabecera
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-username").textContent = "@" + user.username;
  document.getElementById("role-tag").textContent = user.role;
  const avatarEl = document.getElementById("user-avatar");
  avatarEl.src = user.avatar || defaultAvatarDataURL(user.name);

  document.getElementById("logout-btn").addEventListener("click", () => {
    Auth.logout();
    window.location.href = "index.html";
  });

  const panel = document.getElementById("panel");
  render();

  function render() {
    panel.innerHTML = "";
    if (user.role === "colaborador")   renderColaborador();
    else if (user.role === "empleador") renderEmpleador();
    else if (user.role === "supervisor") renderSupervisor();
    else if (user.role === "administrador") renderAdmin();
  }

  /* =================== COLABORADOR =================== */
  function renderColaborador() {
    const tasks = DB.getTasksByUser(user.id);
    const done = tasks.filter(t => t.done).length;
    panel.innerHTML = `
      <div class="grid-3">
        <div class="stat"><div class="num">${tasks.length}</div><div class="lbl">Tareas</div></div>
        <div class="stat"><div class="num">${done}</div><div class="lbl">Completadas</div></div>
        <div class="stat"><div class="num">${tasks.length - done}</div><div class="lbl">Pendientes</div></div>
      </div>

      <section class="card">
        <h3>Registrar nueva tarea</h3>
        <form id="task-form" class="form active">
          <div class="grid-2">
            <label><span>Nombre de la tarea</span>
              <input name="name" required placeholder="Ej. Calibrar telescopio" />
            </label>
            <label><span>Tiempo (HH:MM)</span>
              <input name="time" required placeholder="01:30" pattern="^\\d{1,2}:\\d{2}$" />
            </label>
          </div>
          <label><span>Comentarios</span>
            <textarea name="comments" rows="3" placeholder="Detalles de la tarea..."></textarea>
          </label>
          <button class="btn-primary" type="submit">Enviar reporte</button>
        </form>
      </section>

      <section class="card">
        <h3>Mis tareas reportadas</h3>
        <ul class="task-list" id="my-tasks"></ul>
      </section>
    `;

    document.getElementById("task-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      DB.addTask({
        userId: user.id,
        name: String(fd.get("name")).trim(),
        time: String(fd.get("time")).trim(),
        comments: String(fd.get("comments") || "").trim(),
        done: false,
      });
      e.target.reset();
      render();
    });

    const list = document.getElementById("my-tasks");
    if (!tasks.length) {
      list.innerHTML = `<li class="empty">Aún no has reportado tareas hoy.</li>`;
      return;
    }
    list.innerHTML = tasks
      .slice().sort((a, b) => b.createdAt - a.createdAt)
      .map(t => taskCard(t, { canDelete: true })).join("");

    list.querySelectorAll("[data-del]").forEach(b =>
      b.addEventListener("click", () => {
        if (confirm("¿Eliminar esta tarea?")) { DB.deleteTask(b.dataset.del); render(); }
      })
    );
  }

  function taskCard(t, opts = {}) {
    const owner = DB.getUserById(t.userId);
    return `
      <li class="task-item ${t.done ? "done" : ""}">
        <div>
          <div class="task-name">${escapeHtml(t.name)}</div>
          <div class="task-meta">
            <span>⏱ ${escapeHtml(t.time || "--:--")}</span>
            <span class="badge ${t.done ? "done" : "pending"}">${t.done ? "Completada" : "Pendiente"}</span>
            ${opts.showOwner && owner ? `<span>👤 ${escapeHtml(owner.name)}</span>` : ""}
            <span>🗓 ${new Date(t.updatedAt).toLocaleString()}</span>
          </div>
          ${t.comments ? `<div class="task-comment">${escapeHtml(t.comments)}</div>` : ""}
        </div>
        <div class="task-actions">
          ${opts.canToggle ? `<button class="btn-ok" data-toggle="${t.id}">${t.done ? "Reabrir" : "Marcar hecha"}</button>` : ""}
          ${opts.canEdit ? `<button class="btn-ghost" data-edit="${t.id}">Editar</button>` : ""}
          ${opts.canDelete ? `<button class="btn-danger" data-del="${t.id}">Eliminar</button>` : ""}
        </div>
      </li>
    `;
  }

  /* =================== EMPLEADOR =================== */
  function renderEmpleador() {
    const users = DB.getUsers().filter(u => u.role === "colaborador");
    const allTasks = DB.getTasks().filter(t => users.some(u => u.id === t.userId));
    panel.innerHTML = `
      <div class="grid-3">
        <div class="stat"><div class="num">${users.length}</div><div class="lbl">Colaboradores</div></div>
        <div class="stat"><div class="num">${allTasks.length}</div><div class="lbl">Tareas</div></div>
        <div class="stat"><div class="num">${allTasks.filter(t=>t.done).length}</div><div class="lbl">Completadas</div></div>
      </div>

      <section class="card">
        <h3>Tareas del equipo</h3>
        <div class="filter-bar">
          <select id="f-user">
            <option value="">Todos los colaboradores</option>
            ${users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}
          </select>
          <select id="f-status">
            <option value="">Cualquier estado</option>
            <option value="pending">Pendientes</option>
            <option value="done">Completadas</option>
          </select>
          <input type="text" id="f-text" placeholder="Buscar..." />
        </div>
        <ul class="task-list" id="emp-tasks"></ul>
      </section>
    `;

    const list = document.getElementById("emp-tasks");
    const fUser = document.getElementById("f-user");
    const fStatus = document.getElementById("f-status");
    const fText = document.getElementById("f-text");

    function refresh() {
      let rows = DB.getTasks().filter(t => users.some(u => u.id === t.userId));
      if (fUser.value) rows = rows.filter(t => t.userId === fUser.value);
      if (fStatus.value === "done") rows = rows.filter(t => t.done);
      if (fStatus.value === "pending") rows = rows.filter(t => !t.done);
      if (fText.value.trim()) {
        const q = fText.value.toLowerCase();
        rows = rows.filter(t =>
          t.name.toLowerCase().includes(q) ||
          (t.comments || "").toLowerCase().includes(q)
        );
      }
      rows.sort((a,b) => b.updatedAt - a.updatedAt);
      list.innerHTML = rows.length
        ? rows.map(t => taskCard(t, { showOwner: true, canToggle: true, canEdit: true, canDelete: true })).join("")
        : `<li class="empty">Sin tareas para los filtros seleccionados.</li>`;

      list.querySelectorAll("[data-toggle]").forEach(b =>
        b.addEventListener("click", () => {
          const t = DB.getTasks().find(x => x.id === b.dataset.toggle);
          if (t) { DB.updateTask(t.id, { done: !t.done }); refresh(); }
        })
      );
      list.querySelectorAll("[data-edit]").forEach(b =>
        b.addEventListener("click", () => openEditTask(b.dataset.edit, refresh))
      );
      list.querySelectorAll("[data-del]").forEach(b =>
        b.addEventListener("click", () => {
          if (confirm("¿Eliminar esta tarea?")) { DB.deleteTask(b.dataset.del); refresh(); }
        })
      );
    }
    [fUser, fStatus, fText].forEach(el => el.addEventListener("input", refresh));
    refresh();
  }

  function openEditTask(id, onDone) {
    const t = DB.getTasks().find(x => x.id === id);
    if (!t) return;
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `
      <h3>Editar tarea</h3>
      <form method="dialog" id="edit-form">
        <label><span>Nombre</span><input name="name" required value="${escapeHtml(t.name)}"/></label>
        <label><span>Tiempo</span><input name="time" required value="${escapeHtml(t.time)}" pattern="^\\d{1,2}:\\d{2}$"/></label>
        <label><span>Comentarios</span><textarea name="comments" rows="3">${escapeHtml(t.comments || "")}</textarea></label>
        <label><span>Estado</span>
          <select name="done">
            <option value="0" ${!t.done ? "selected" : ""}>Pendiente</option>
            <option value="1" ${t.done ? "selected" : ""}>Completada</option>
          </select>
        </label>
        <div class="row">
          <button type="button" class="btn-ghost" id="cancel-edit">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector("#cancel-edit").addEventListener("click", () => { dlg.close(); dlg.remove(); });
    dlg.querySelector("#edit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      DB.updateTask(t.id, {
        name: String(fd.get("name")).trim(),
        time: String(fd.get("time")).trim(),
        comments: String(fd.get("comments") || "").trim(),
        done: fd.get("done") === "1",
      });
      dlg.close(); dlg.remove();
      onDone && onDone();
    });
  }

  /* =================== SUPERVISOR =================== */
  function renderSupervisor() {
    const users = DB.getUsers().filter(u => u.role === "colaborador");
    const allTasks = DB.getTasks().filter(t => users.some(u => u.id === t.userId));
    panel.innerHTML = `
      <div class="grid-3">
        <div class="stat"><div class="num">${users.length}</div><div class="lbl">Colaboradores</div></div>
        <div class="stat"><div class="num">${allTasks.length}</div><div class="lbl">Tareas</div></div>
        <div class="stat"><div class="num">${allTasks.filter(t=>t.done).length}</div><div class="lbl">Completadas</div></div>
      </div>
      <section class="card">
        <h3>Consulta de tareas (solo lectura)</h3>
        <div class="filter-bar">
          <select id="s-user">
            <option value="">Todos los colaboradores</option>
            ${users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}
          </select>
          <select id="s-status">
            <option value="">Cualquier estado</option>
            <option value="pending">Pendientes</option>
            <option value="done">Completadas</option>
          </select>
        </div>
        <ul class="task-list" id="sup-tasks"></ul>
      </section>
    `;
    const list = document.getElementById("sup-tasks");
    const sUser = document.getElementById("s-user");
    const sStatus = document.getElementById("s-status");
    function refresh() {
      let rows = DB.getTasks().filter(t => users.some(u => u.id === t.userId));
      if (sUser.value) rows = rows.filter(t => t.userId === sUser.value);
      if (sStatus.value === "done") rows = rows.filter(t => t.done);
      if (sStatus.value === "pending") rows = rows.filter(t => !t.done);
      rows.sort((a,b) => b.updatedAt - a.updatedAt);
      list.innerHTML = rows.length
        ? rows.map(t => taskCard(t, { showOwner: true })).join("")
        : `<li class="empty">Sin tareas para los filtros seleccionados.</li>`;
    }
    [sUser, sStatus].forEach(el => el.addEventListener("change", refresh));
    refresh();
  }

  /* =================== ADMINISTRADOR =================== */
  function renderAdmin() {
    const all = DB.getUsers();
    panel.innerHTML = `
      <div class="grid-3">
        <div class="stat"><div class="num">${all.length}</div><div class="lbl">Usuarios</div></div>
        <div class="stat"><div class="num">${all.filter(u=>u.role==='colaborador').length}</div><div class="lbl">Colaboradores</div></div>
        <div class="stat"><div class="num">${DB.getTasks().length}</div><div class="lbl">Tareas totales</div></div>
      </div>

      <section class="card">
        <h3>Gestión de usuarios</h3>
        <table>
          <thead>
            <tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Rol</th><th>Acciones</th></tr>
          </thead>
          <tbody id="admin-tbody"></tbody>
        </table>
      </section>
    `;
    const tbody = document.getElementById("admin-tbody");
    function refresh() {
      const users = DB.getUsers();
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>@${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.phone)}</td>
          <td><span class="badge ${u.role}">${u.role}</span></td>
          <td>
            <button class="btn-ghost" data-reset="${u.id}">Restablecer</button>
            <button class="btn-ghost" data-role="${u.id}">Cambiar rol</button>
            ${u.id !== user.id ? `<button class="btn-danger" data-drop="${u.id}">Eliminar</button>` : `<em style="opacity:.6">tú</em>`}
          </td>
        </tr>
      `).join("");
      tbody.querySelectorAll("[data-reset]").forEach(b =>
        b.addEventListener("click", () => resetPasswordDialog(b.dataset.reset))
      );
      tbody.querySelectorAll("[data-role]").forEach(b =>
        b.addEventListener("click", () => changeRoleDialog(b.dataset.role, refresh))
      );
      tbody.querySelectorAll("[data-drop]").forEach(b =>
        b.addEventListener("click", () => {
          const u = DB.getUserById(b.dataset.drop);
          if (!u) return;
          if (confirm(`Eliminar a ${u.name} y todas sus tareas?`)) { DB.deleteUser(u.id); refresh(); }
        })
      );
    }
    refresh();
  }

  function resetPasswordDialog(userId) {
    const u = DB.getUserById(userId);
    if (!u) return;
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `
      <h3>Restablecer contraseña</h3>
      <p>Usuario: <strong>${escapeHtml(u.name)}</strong> (@${escapeHtml(u.username)})</p>
      <label><span>Nueva contraseña</span>
        <div class="password-wrap">
          <input type="password" id="new-pass" minlength="6" placeholder="Mínimo 6 caracteres"/>
          <button type="button" class="toggle-pass">Ver</button>
        </div>
      </label>
      <div class="row">
        <button class="btn-ghost" id="cancel">Cancelar</button>
        <button class="btn-primary" id="confirm">Guardar</button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector(".toggle-pass").addEventListener("click", (e) => {
      const i = dlg.querySelector("#new-pass");
      const show = i.type === "text";
      i.type = show ? "password" : "text";
      e.target.textContent = show ? "Ver" : "Ocultar";
    });
    dlg.querySelector("#cancel").addEventListener("click", () => { dlg.close(); dlg.remove(); });
    dlg.querySelector("#confirm").addEventListener("click", () => {
      const np = dlg.querySelector("#new-pass").value;
      if (!np || np.length < 6) { alert("Mínimo 6 caracteres."); return; }
      DB.updateUser(u.id, { password: np });
      alert("Contraseña actualizada.");
      dlg.close(); dlg.remove();
    });
  }

  function changeRoleDialog(userId, onDone) {
    const u = DB.getUserById(userId);
    if (!u) return;
    const roles = ["colaborador", "empleador", "supervisor", "administrador"];
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `
      <h3>Cambiar rol</h3>
      <p>Usuario: <strong>${escapeHtml(u.name)}</strong></p>
      <label><span>Nuevo rol</span>
        <select id="new-role">
          ${roles.map(r => `<option value="${r}" ${u.role===r?"selected":""}>${r}</option>`).join("")}
        </select>
      </label>
      <div class="row">
        <button class="btn-ghost" id="cancel">Cancelar</button>
        <button class="btn-primary" id="confirm">Guardar</button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector("#cancel").addEventListener("click", () => { dlg.close(); dlg.remove(); });
    dlg.querySelector("#confirm").addEventListener("click", () => {
      const r = dlg.querySelector("#new-role").value;
      DB.updateUser(u.id, { role: r });
      dlg.close(); dlg.remove();
      onDone && onDone();
    });
  }

  /* =================== Helpers =================== */
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => (
      { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
    ));
  }
  function defaultAvatarDataURL(name) {
    const initial = (name || "?").trim().charAt(0).toUpperCase();
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#3d8bff"/>
            <stop offset="100%" stop-color="#0b1e55"/>
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="32" fill="url(#g)"/>
        <text x="50%" y="56%" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="28" fill="#fff" font-weight="700">${initial}</text>
      </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }
})();
