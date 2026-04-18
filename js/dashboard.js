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

  // Menú hamburguesa responsive
  const hamburger = document.getElementById("hamburger");
  const topbarRight = document.getElementById("topbar-right");
  if (hamburger && topbarRight) {
    const closeMenu = () => {
      hamburger.classList.remove("open");
      topbarRight.classList.remove("open");
      hamburger.setAttribute("aria-expanded", "false");
    };
    hamburger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !hamburger.classList.contains("open");
      hamburger.classList.toggle("open", open);
      topbarRight.classList.toggle("open", open);
      hamburger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", (e) => {
      if (!topbarRight.contains(e.target) && !hamburger.contains(e.target)) closeMenu();
    });
    window.addEventListener("resize", () => { if (window.innerWidth > 720) closeMenu(); });
  }

  const panel = document.getElementById("panel");

  const STATUSES = [
    { key: "trabajando", label: "Trabajando" },
    { key: "revision",   label: "En revisión" },
    { key: "realizada",  label: "Realizada" },
    { key: "cancelado",  label: "Cancelado" },
  ];
  function getStatus(t) {
    if (t && t.status) return t.status;
    return t && t.done ? "realizada" : "trabajando";
  }
  function statusLabel(k) { return (STATUSES.find(s => s.key === k) || STATUSES[0]).label; }
  function statusOptions(selected) {
    return STATUSES.map(s => `<option value="${s.key}" ${s.key===selected?"selected":""}>${s.label}</option>`).join("");
  }

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
    const byStatus = k => tasks.filter(t => getStatus(t) === k).length;
    panel.innerHTML = `
      <div class="grid-3">
        <div class="stat"><div class="num">${tasks.length}</div><div class="lbl">Tareas</div></div>
        <div class="stat"><div class="num">${byStatus("realizada")}</div><div class="lbl">Realizadas</div></div>
        <div class="stat"><div class="num">${byStatus("trabajando") + byStatus("revision")}</div><div class="lbl">En proceso</div></div>
      </div>

      <section class="card">
        <h3>Registrar nueva tarea</h3>
        <form id="task-form" class="form active">
          <label><span>Nombre de la tarea</span>
            <input name="name" required placeholder="Ej. Calibrar telescopio" />
          </label>
          <div class="grid-3">
            <label><span>Hora de inicio</span>
              <input type="text" class="time-field" name="start" id="start-input" required readonly placeholder="--:--" />
            </label>
            <label><span>Hora de fin</span>
              <input type="text" class="time-field" name="end" id="end-input" required readonly placeholder="--:--" />
            </label>
            <label><span>Tiempo (HH:MM)</span>
              <input name="time" id="time-input" required readonly placeholder="00:00" />
            </label>
          </div>
          <label><span>Estado inicial</span>
            <select name="status">${statusOptions("trabajando")}</select>
          </label>
          <p class="hint" id="time-hint">El tiempo se calcula automáticamente al capturar inicio y fin.</p>
          <label><span>Comentarios</span>
            <textarea name="comments" rows="3" placeholder="Detalles de la tarea..."></textarea>
          </label>
          <button class="btn-primary" type="submit">Enviar reporte</button>
        </form>
      </section>

      <section class="card">
        <h3>Calendario de tareas</h3>
        <div id="calendar"></div>
      </section>

      <section class="card">
        <h3>Mis tareas reportadas</h3>
        <ul class="task-list" id="my-tasks"></ul>
      </section>
    `;

    attachTimePicker(document.getElementById("start-input"));
    attachTimePicker(document.getElementById("end-input"));
    setupTimeRange();

    document.getElementById("task-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const time = String(fd.get("time") || "").trim();
      if (!time || time === "00:00") {
        document.getElementById("time-hint").textContent = "Captura una hora de inicio y fin válidas.";
        return;
      }
      const status = String(fd.get("status") || "trabajando");
      DB.addTask({
        userId: user.id,
        name: String(fd.get("name")).trim(),
        start: String(fd.get("start") || "").trim(),
        end: String(fd.get("end") || "").trim(),
        time,
        comments: String(fd.get("comments") || "").trim(),
        status,
        done: status === "realizada",
      });
      e.target.reset();
      render();
    });

    renderCalendar(document.getElementById("calendar"), tasks);

    const list = document.getElementById("my-tasks");
    if (!tasks.length) {
      list.innerHTML = `<li class="empty">Aún no has reportado tareas hoy.</li>`;
      return;
    }
    list.innerHTML = tasks
      .slice().sort((a, b) => b.createdAt - a.createdAt)
      .map(t => taskCard(t, { canDelete: true, canChangeStatus: true })).join("");

    bindTaskActions(list, render);
  }

  /* Enlaza botones de cambio de estado y borrado en una lista de tareas */
  function bindTaskActions(list, refresh) {
    list.querySelectorAll("[data-del]").forEach(b =>
      b.addEventListener("click", () => {
        if (confirm("¿Eliminar esta tarea?")) { DB.deleteTask(b.dataset.del); refresh(); }
      })
    );
    list.querySelectorAll("select[data-status]").forEach(sel =>
      sel.addEventListener("change", () => {
        const k = sel.value;
        DB.updateTask(sel.dataset.status, { status: k, done: k === "realizada" });
        refresh();
      })
    );
    list.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openEditTask(b.dataset.edit, refresh))
    );
  }

  /* Cálculo automático del tiempo a partir de hora de inicio y fin.
     Si la hora de fin es menor (cruza medianoche) se suman 24 h. */
  function setupTimeRange() {
    const startEl = document.getElementById("start-input");
    const endEl = document.getElementById("end-input");
    const timeEl = document.getElementById("time-input");
    const hint = document.getElementById("time-hint");

    function parseHM(v) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }
    function format(mins) {
      const total = Math.max(0, Math.round(mins));
      return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    }

    function recompute() {
      const a = parseHM(startEl.value);
      const b = parseHM(endEl.value);
      if (a === null || b === null) { timeEl.value = ""; hint.textContent = "El tiempo se calcula automáticamente al capturar inicio y fin."; return; }
      let diff = b - a;
      if (diff < 0) diff += 24 * 60;
      timeEl.value = format(diff);
      hint.textContent = diff === 0
        ? "Inicio y fin iguales: 00:00."
        : (b < a ? "La hora de fin es menor: se asume cruce de medianoche." : "Tiempo calculado correctamente.");
    }

    startEl.addEventListener("input", recompute);
    endEl.addEventListener("input", recompute);
  }

  function taskCard(t, opts = {}) {
    const owner = DB.getUserById(t.userId);
    const st = getStatus(t);
    const statusCtrl = opts.canChangeStatus
      ? `<select class="status-select" data-status="${t.id}">${statusOptions(st)}</select>`
      : `<span class="badge status-${st}">${statusLabel(st)}</span>`;
    const notes = (t.notes || []).filter(n =>
      user.role === "colaborador" ? n.visibility === "public" : true
    );
    const notesHtml = notes.length ? `
      <div class="task-notes">
        ${notes.map(n => {
          const author = DB.getUserById(n.authorId);
          return `
            <div class="note-pill note-${n.visibility}">
              <span class="note-icon">${n.visibility === "private" ? "🔒" : "📝"}</span>
              <span class="note-text">${escapeHtml(n.text)}</span>
              <span class="note-meta">${author ? escapeHtml(author.name) : ""}${n.visibility === "private" ? " · privada" : ""}</span>
            </div>
          `;
        }).join("")}
      </div>
    ` : "";
    return `
      <li class="task-item status-bar-${st}">
        <div>
          <div class="task-name">${escapeHtml(t.name)}</div>
          <div class="task-meta">
            <span>⏱ ${escapeHtml(t.time || "--:--")}</span>
            ${t.start || t.end ? `<span>🕒 ${escapeHtml(t.start || "--:--")} → ${escapeHtml(t.end || "--:--")}</span>` : ""}
            ${statusCtrl}
            ${opts.showOwner && owner ? `<span>👤 ${escapeHtml(owner.name)}</span>` : ""}
            <span>🗓 ${new Date(t.updatedAt).toLocaleString()}</span>
          </div>
          ${t.comments ? `<div class="task-comment">${escapeHtml(t.comments)}</div>` : ""}
          ${notesHtml}
        </div>
        <div class="task-actions">
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
        <div class="stat"><div class="num">${allTasks.filter(t=>getStatus(t)==="realizada").length}</div><div class="lbl">Realizadas</div></div>
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
            ${STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join("")}
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
      if (fStatus.value) rows = rows.filter(t => getStatus(t) === fStatus.value);
      if (fText.value.trim()) {
        const q = fText.value.toLowerCase();
        rows = rows.filter(t =>
          t.name.toLowerCase().includes(q) ||
          (t.comments || "").toLowerCase().includes(q)
        );
      }
      rows.sort((a,b) => b.updatedAt - a.updatedAt);
      list.innerHTML = rows.length
        ? rows.map(t => taskCard(t, { showOwner: true, canChangeStatus: true, canEdit: true, canDelete: true })).join("")
        : `<li class="empty">Sin tareas para los filtros seleccionados.</li>`;

      bindTaskActions(list, refresh);
    }
    [fUser, fStatus, fText].forEach(el => el.addEventListener("input", refresh));
    refresh();
  }

  function openEditTask(id, onDone) {
    const t = DB.getTasks().find(x => x.id === id);
    if (!t) return;
    const dlg = document.createElement("dialog");
    const canManageNotes = user.role === "empleador" || user.role === "administrador";
    dlg.innerHTML = `
      <h3>Editar tarea</h3>
      <form method="dialog" id="edit-form">
        <label><span>Nombre</span><input name="name" required value="${escapeHtml(t.name)}"/></label>
        <div class="grid-3">
          <label><span>Inicio</span><input type="text" class="time-field" name="start" readonly value="${escapeHtml(t.start || "")}"/></label>
          <label><span>Fin</span><input type="text" class="time-field" name="end" readonly value="${escapeHtml(t.end || "")}"/></label>
          <label><span>Tiempo</span><input name="time" id="edit-time" required readonly value="${escapeHtml(t.time)}" pattern="^\\d{1,2}:\\d{2}$"/></label>
        </div>
        <label><span>Comentarios</span><textarea name="comments" rows="3">${escapeHtml(t.comments || "")}</textarea></label>
        <label><span>Estado</span>
          <select name="status">${statusOptions(getStatus(t))}</select>
        </label>
        ${canManageNotes ? `
          <div class="notes-editor">
            <div class="notes-editor-title">Notas</div>
            <div id="notes-list"></div>
            <div class="notes-add">
              <textarea id="note-text" rows="2" placeholder="Escribir nota..."></textarea>
              <div class="notes-add-row">
                <label class="inline-radio"><input type="radio" name="note-vis" value="private" checked/> 🔒 Privada</label>
                <label class="inline-radio"><input type="radio" name="note-vis" value="public"/> 👁 Visible al colaborador</label>
                <button type="button" class="btn-ok" id="add-note-btn">Agregar nota</button>
              </div>
            </div>
          </div>
        ` : ""}
        <div class="row">
          <button type="button" class="btn-ghost" id="cancel-edit">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    const startEl = dlg.querySelector('[name="start"]');
    const endEl = dlg.querySelector('[name="end"]');
    const timeEl = dlg.querySelector("#edit-time");
    attachTimePicker(startEl);
    attachTimePicker(endEl);

    if (canManageNotes) {
      const listEl = dlg.querySelector("#notes-list");
      const textEl = dlg.querySelector("#note-text");
      function drawNotes() {
        const curr = DB.getTasks().find(x => x.id === t.id);
        const notes = (curr && curr.notes) || [];
        if (!notes.length) { listEl.innerHTML = `<p class="hint">Aún no hay notas.</p>`; return; }
        listEl.innerHTML = notes.slice().sort((a,b) => b.createdAt - a.createdAt).map(n => {
          const a = DB.getUserById(n.authorId);
          return `
            <div class="note-row note-${n.visibility}">
              <div>
                <div class="note-text">${escapeHtml(n.text)}</div>
                <div class="note-meta">${n.visibility === "private" ? "🔒 Privada" : "👁 Visible al colaborador"} · ${a ? escapeHtml(a.name) : ""} · ${new Date(n.createdAt).toLocaleString()}</div>
              </div>
              <button type="button" class="btn-danger note-del" data-note-del="${n.id}">×</button>
            </div>
          `;
        }).join("");
        listEl.querySelectorAll("[data-note-del]").forEach(b =>
          b.addEventListener("click", () => {
            const curr = DB.getTasks().find(x => x.id === t.id);
            const kept = (curr.notes || []).filter(n => n.id !== b.dataset.noteDel);
            DB.updateTask(t.id, { notes: kept });
            drawNotes();
          })
        );
      }
      dlg.querySelector("#add-note-btn").addEventListener("click", () => {
        const text = textEl.value.trim();
        if (!text) return;
        const vis = dlg.querySelector('[name="note-vis"]:checked').value;
        const curr = DB.getTasks().find(x => x.id === t.id);
        const note = { id: uid(), authorId: user.id, text, visibility: vis, createdAt: Date.now() };
        DB.updateTask(t.id, { notes: [...(curr.notes || []), note] });
        textEl.value = "";
        drawNotes();
      });
      drawNotes();
    }
    function recompute() {
      const parse = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ""); return m ? +m[1] * 60 + +m[2] : null; };
      const a = parse(startEl.value), b = parse(endEl.value);
      if (a === null || b === null) return;
      let d = b - a; if (d < 0) d += 24 * 60;
      timeEl.value = String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0");
    }
    startEl.addEventListener("input", recompute);
    endEl.addEventListener("input", recompute);

    dlg.querySelector("#cancel-edit").addEventListener("click", () => { dlg.close(); dlg.remove(); });
    dlg.querySelector("#edit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const status = String(fd.get("status") || "trabajando");
      DB.updateTask(t.id, {
        name: String(fd.get("name")).trim(),
        start: String(fd.get("start") || "").trim(),
        end: String(fd.get("end") || "").trim(),
        time: String(fd.get("time")).trim(),
        comments: String(fd.get("comments") || "").trim(),
        status,
        done: status === "realizada",
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
        <div class="stat"><div class="num">${allTasks.filter(t=>getStatus(t)==="realizada").length}</div><div class="lbl">Realizadas</div></div>
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
            ${STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join("")}
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
      if (sStatus.value) rows = rows.filter(t => getStatus(t) === sStatus.value);
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
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Rol</th><th>Acciones</th></tr>
            </thead>
            <tbody id="admin-tbody"></tbody>
          </table>
        </div>
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

  /* =================== Selector de hora personalizado =================== */
  function attachTimePicker(input) {
    input.readOnly = true;
    input.classList.add("time-field");
    input.addEventListener("click", (e) => {
      e.preventDefault();
      if (input._picking) return;
      input._picking = true;
      openTimePicker(input, () => { input._picking = false; });
    });
  }

  function openTimePicker(input, onClose) {
    const pad = n => String(n).padStart(2, "0");
    const now = new Date();
    const match = /^(\d{1,2}):(\d{2})$/.exec(input.value || "");
    let h = match ? Math.min(23, +match[1]) : now.getHours();
    let m = match ? Math.round((+match[2]) / 5) * 5 % 60 : Math.round(now.getMinutes() / 5) * 5 % 60;

    const dlg = document.createElement("dialog");
    dlg.className = "time-picker-dialog";
    dlg.innerHTML = `
      <div class="tp-header">
        <div class="tp-clock">
          <span class="tp-h">${pad(h)}</span><span class="tp-sep">:</span><span class="tp-m">${pad(m)}</span>
        </div>
        <p class="tp-sub">Elige hora y minutos</p>
      </div>
      <div class="tp-cols">
        <div class="tp-col">
          <div class="tp-col-label">Hora</div>
          <div class="tp-col-grid" id="tp-h-grid">
            ${Array.from({length:24}, (_,i) => `<button type="button" class="tp-cell ${i===h?"active":""}" data-h="${i}">${pad(i)}</button>`).join("")}
          </div>
        </div>
        <div class="tp-col">
          <div class="tp-col-label">Minutos</div>
          <div class="tp-col-grid" id="tp-m-grid">
            ${Array.from({length:12}, (_,i) => i*5).map(mm => `<button type="button" class="tp-cell ${mm===m?"active":""}" data-m="${mm}">${pad(mm)}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="tp-actions">
        <button type="button" class="btn-ghost" id="tp-now">Ahora</button>
        <button type="button" class="btn-ghost" id="tp-cancel">Cancelar</button>
        <button type="button" class="btn-primary" id="tp-ok">Aceptar</button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    const hEl = dlg.querySelector(".tp-h");
    const mEl = dlg.querySelector(".tp-m");
    function setH(v) { h = v; hEl.textContent = pad(h); dlg.querySelectorAll("[data-h]").forEach(b => b.classList.toggle("active", +b.dataset.h === h)); }
    function setM(v) { m = v; mEl.textContent = pad(m); dlg.querySelectorAll("[data-m]").forEach(b => b.classList.toggle("active", +b.dataset.m === m)); }

    dlg.querySelector("#tp-h-grid").addEventListener("click", e => {
      const b = e.target.closest("[data-h]"); if (b) setH(+b.dataset.h);
    });
    dlg.querySelector("#tp-m-grid").addEventListener("click", e => {
      const b = e.target.closest("[data-m]"); if (b) setM(+b.dataset.m);
    });
    dlg.querySelector("#tp-now").addEventListener("click", () => {
      const n = new Date();
      setH(n.getHours());
      setM(Math.round(n.getMinutes() / 5) * 5 % 60);
    });
    const close = () => {
      try { dlg.close(); } catch (_) {}
      dlg.remove();
      if (typeof onClose === "function") onClose();
    };
    dlg.querySelector("#tp-cancel").addEventListener("click", close);
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
    dlg.querySelector("#tp-ok").addEventListener("click", () => {
      input.value = pad(h) + ":" + pad(m);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    });
  }

  /* =================== Calendario =================== */
  function renderCalendar(container, tasks) {
    let viewDate = new Date();
    let selected = null;

    function draw() {
      const y = viewDate.getFullYear();
      const mo = viewDate.getMonth();
      const first = new Date(y, mo, 1);
      const daysInMonth = new Date(y, mo + 1, 0).getDate();
      const startOffset = (first.getDay() + 6) % 7; // lunes = 0
      const monthName = first.toLocaleString("es", { month: "long", year: "numeric" });

      const dayKey = d => `${y}-${pad(mo+1)}-${pad(d)}`;
      const pad = n => String(n).padStart(2, "0");
      const tasksByDay = {};
      tasks.forEach(t => {
        const d = new Date(t.createdAt);
        if (d.getFullYear() === y && d.getMonth() === mo) {
          const k = dayKey(d.getDate());
          (tasksByDay[k] = tasksByDay[k] || []).push(t);
        }
      });

      const cells = [];
      for (let i = 0; i < startOffset; i++) cells.push(`<div class="cal-cell empty"></div>`);
      for (let d = 1; d <= daysInMonth; d++) {
        const k = dayKey(d);
        const dayTasks = tasksByDay[k] || [];
        const dots = [...new Set(dayTasks.map(getStatus))]
          .map(s => `<span class="cal-dot status-${s}" title="${statusLabel(s)}"></span>`).join("");
        const isSel = selected === k ? "selected" : "";
        const today = new Date();
        const isToday = (today.getFullYear()===y && today.getMonth()===mo && today.getDate()===d) ? "today" : "";
        cells.push(`
          <button type="button" class="cal-cell ${isSel} ${isToday}" data-day="${k}">
            <span class="cal-num">${d}</span>
            <span class="cal-dots">${dots}</span>
            ${dayTasks.length ? `<span class="cal-count">${dayTasks.length}</span>` : ""}
          </button>
        `);
      }

      container.innerHTML = `
        <div class="cal-head">
          <button type="button" class="btn-ghost" id="cal-prev">◀</button>
          <strong class="cal-title">${monthName}</strong>
          <button type="button" class="btn-ghost" id="cal-next">▶</button>
        </div>
        <div class="cal-weekdays">
          <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
        </div>
        <div class="cal-grid">${cells.join("")}</div>
        <div class="cal-legend">
          ${STATUSES.map(s => `<span class="legend-item"><span class="cal-dot status-${s.key}"></span>${s.label}</span>`).join("")}
        </div>
        <ul class="task-list cal-day-list" id="cal-day-list"></ul>
      `;

      container.querySelector("#cal-prev").addEventListener("click", () => { viewDate = new Date(y, mo - 1, 1); selected = null; draw(); });
      container.querySelector("#cal-next").addEventListener("click", () => { viewDate = new Date(y, mo + 1, 1); selected = null; draw(); });
      container.querySelectorAll("[data-day]").forEach(btn =>
        btn.addEventListener("click", () => { selected = btn.dataset.day; drawDayList(); container.querySelectorAll(".cal-cell").forEach(c => c.classList.toggle("selected", c.dataset.day === selected)); })
      );
      drawDayList();

      function drawDayList() {
        const list = container.querySelector("#cal-day-list");
        if (!selected) { list.innerHTML = `<li class="empty">Selecciona un día para ver sus tareas.</li>`; return; }
        const dayTasks = tasksByDay[selected] || [];
        if (!dayTasks.length) { list.innerHTML = `<li class="empty">Sin tareas registradas ese día.</li>`; return; }
        list.innerHTML = dayTasks.map(t => taskCard(t, { canChangeStatus: true })).join("");
        bindTaskActions(list, () => render());
      }
    }
    draw();
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
