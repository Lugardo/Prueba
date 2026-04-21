/* Panel principal. Renderiza según el rol: colaborador, empleador, supervisor, administrador */
(async function () {
  const user = await Auth.requireAuth();
  if (!user) return;

  // Cabecera
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-username").textContent = "@" + user.username;
  document.getElementById("role-tag").textContent = user.role;
  const avatarEl = document.getElementById("user-avatar");
  avatarEl.src = user.avatar || defaultAvatarDataURL(user.name);

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await Auth.logout();
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

      <section class="card planner-banner">
        <div>
          <h3>📝 Planificador</h3>
          <p>Anota pendientes personales para acordarte durante el día.</p>
        </div>
        <button class="btn-primary" id="open-planner">Abrir planificador</button>
      </section>

      <section class="card">
        <h3>Registrar nueva tarea</h3>
        <form id="task-form" class="form active">
          <label><span>Nombre de la tarea</span>
            <input name="name" required placeholder="Ej. Calibrar telescopio" />
          </label>
          <div class="grid-3">
            <label><span>Hora de inicio <em class="req">*</em></span>
              <input type="text" class="time-field" name="start" id="start-input" required readonly placeholder="--:--" />
            </label>
            <label><span>Hora de fin <em class="req">*</em></span>
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
      const start = String(fd.get("start") || "").trim();
      const end   = String(fd.get("end") || "").trim();
      const hint = document.getElementById("time-hint");
      if (!start || !end) {
        hint.textContent = "⚠️ Debes seleccionar la hora de inicio y la hora de fin.";
        hint.classList.add("error");
        (!start ? document.getElementById("start-input") : document.getElementById("end-input")).focus();
        return;
      }
      const time = String(fd.get("time") || "").trim();
      if (!time || time === "00:00") {
        hint.textContent = "⚠️ El tiempo es 00:00. Verifica que la hora de fin sea distinta.";
        hint.classList.add("error");
        return;
      }
      const status = String(fd.get("status") || "trabajando");
      DB.addTask({
        userId: user.id,
        name: String(fd.get("name")).trim(),
        start, end, time,
        comments: String(fd.get("comments") || "").trim(),
        status,
        done: status === "realizada",
      });
      e.target.reset();
      hint.classList.remove("error");
      render();
    });

    renderCalendar(document.getElementById("calendar"), tasks);

    document.getElementById("open-planner").addEventListener("click", openPlannerDialog);

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
    const d = new Date(t.updatedAt);
    const shortDate = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    const shortTime = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `
      <li class="task-item status-bar-${st}">
        <div class="task-body">
          <div class="task-name">${escapeHtml(t.name)}</div>
          <div class="task-meta">
            <span class="meta-time">⏱ ${escapeHtml(t.time || "--:--")}</span>
            ${t.start || t.end ? `<span class="meta-range">🕒 ${escapeHtml(t.start || "--:--")} → ${escapeHtml(t.end || "--:--")}</span>` : ""}
            ${statusCtrl}
            ${opts.showOwner && owner ? `<span class="meta-owner">👤 ${escapeHtml(owner.name)}</span>` : ""}
            <span class="meta-date">🗓 ${shortDate} · ${shortTime}</span>
          </div>
          ${t.comments ? `<div class="task-comment">${escapeHtml(t.comments)}</div>` : ""}
          ${notesHtml}
        </div>
        <div class="task-actions">
          ${opts.canEdit ? `<button class="btn-ghost" data-edit="${t.id}">Detalles</button>` : ""}
          ${opts.canDelete ? `<button class="btn-danger" data-del="${t.id}">Eliminar</button>` : ""}
        </div>
      </li>
    `;
  }

  /* =================== PLANIFICADOR (TODO personal) =================== */
  function openPlannerDialog() {
    const dlg = document.createElement("dialog");
    dlg.className = "planner-dialog";
    dlg.innerHTML = `
      <h3>📝 Mis pendientes</h3>
      <form id="planner-add" class="planner-add">
        <input type="text" maxlength="500" placeholder="¿Qué tienes pendiente?" required />
        <button type="submit" class="btn-ok">Agregar</button>
      </form>
      <ul class="planner-list" id="planner-list"></ul>
      <p class="planner-empty" id="planner-empty" hidden>Aún no tienes pendientes. ¡Agrega el primero!</p>
      <div class="row">
        <button type="button" class="btn-ghost" id="planner-close">Cerrar</button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    const listEl  = dlg.querySelector("#planner-list");
    const emptyEl = dlg.querySelector("#planner-empty");
    const addForm = dlg.querySelector("#planner-add");
    const addInput= addForm.querySelector("input");

    async function fetchJSON(action, opts = {}) {
      const url = "api.php?action=" + encodeURIComponent(action);
      const res = await fetch(url, {
        method: opts.method || "GET",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      return res.json().catch(() => ({ ok: false, error: "Respuesta inválida" }));
    }

    function renderItems(items) {
      if (!items.length) {
        listEl.innerHTML = "";
        emptyEl.hidden = false;
        return;
      }
      emptyEl.hidden = true;
      listEl.innerHTML = items.map(it => `
        <li class="planner-item ${it.done ? "done" : ""}" data-id="${it.id}">
          <input type="checkbox" class="planner-check" ${it.done ? "checked" : ""} data-toggle="${it.id}" aria-label="Marcar como hecho" />
          <span class="planner-text" data-edit="${it.id}" title="Doble clic para editar">${escapeHtml(it.text)}</span>
          <div class="planner-actions">
            <button type="button" class="planner-register" data-to-task="${it.id}" title="Pasar a reporte de tarea">📋 Registrar</button>
            <button type="button" class="planner-edit-btn" data-edit-btn="${it.id}" title="Editar" aria-label="Editar">✏️</button>
            <button type="button" class="planner-del" data-del="${it.id}" aria-label="Borrar" title="Eliminar">✕</button>
          </div>
        </li>
      `).join("");
      wireItems();
    }

    function wireItems() {
      listEl.querySelectorAll("[data-toggle]").forEach(cb =>
        cb.addEventListener("change", async () => {
          await fetchJSON("planner/toggle", { method: "POST", body: { id: cb.dataset.toggle, done: cb.checked } });
          cb.closest(".planner-item").classList.toggle("done", cb.checked);
        })
      );
      listEl.querySelectorAll("[data-del]").forEach(b =>
        b.addEventListener("click", async () => {
          const id = b.dataset.del;
          b.closest(".planner-item").remove();
          if (!listEl.children.length) emptyEl.hidden = false;
          await fetchJSON("planner/delete", { method: "POST", body: { id } });
        })
      );
      listEl.querySelectorAll("[data-edit]").forEach(sp =>
        sp.addEventListener("dblclick", () => startInlineEdit(sp))
      );
      listEl.querySelectorAll("[data-edit-btn]").forEach(b =>
        b.addEventListener("click", () => {
          const span = b.closest(".planner-item").querySelector(".planner-text");
          if (span) startInlineEdit(span);
        })
      );
      listEl.querySelectorAll("[data-to-task]").forEach(b =>
        b.addEventListener("click", () => {
          const item = b.closest(".planner-item");
          const text = item.querySelector(".planner-text").textContent;
          const nameInput = document.querySelector('#task-form input[name="name"]');
          if (nameInput) {
            nameInput.value = text;
            nameInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          dlg.close(); dlg.remove();
          setTimeout(() => {
            const startInput = document.getElementById("start-input");
            if (startInput) {
              startInput.scrollIntoView({ behavior: "smooth", block: "center" });
              startInput.focus();
            }
          }, 200);
        })
      );
    }

    function startInlineEdit(span) {
      const id = span.dataset.edit;
      const original = span.textContent;
      const input = document.createElement("input");
      input.type = "text";
      input.value = original;
      input.maxLength = 500;
      input.className = "planner-edit-input";
      span.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = async () => {
        if (committed) return; committed = true;
        const newText = input.value.trim();
        if (!newText || newText === original) {
          const s = document.createElement("span");
          s.className = "planner-text";
          s.dataset.edit = id;
          s.textContent = original;
          input.replaceWith(s);
          s.addEventListener("dblclick", () => startInlineEdit(s));
          return;
        }
        const res = await fetchJSON("planner/update", { method: "POST", body: { id, text: newText } });
        const s = document.createElement("span");
        s.className = "planner-text";
        s.dataset.edit = id;
        s.textContent = res.ok ? newText : original;
        input.replaceWith(s);
        s.addEventListener("dblclick", () => startInlineEdit(s));
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { input.value = original; commit(); }
      });
    }

    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = addInput.value.trim();
      if (!text) return;
      const res = await fetchJSON("planner/add", { method: "POST", body: { text } });
      if (!res.ok) return;
      addInput.value = "";
      // Insertar al tope
      const current = await fetchJSON("planner/list");
      if (current.ok) renderItems(current.items);
    });

    dlg.querySelector("#planner-close").addEventListener("click", () => { dlg.close(); dlg.remove(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) { dlg.close(); dlg.remove(); } });

    fetchJSON("planner/list").then(res => {
      if (res.ok) renderItems(res.items || []);
      else { emptyEl.textContent = "No se pudo cargar el planificador."; emptyEl.hidden = false; }
    });
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

      <section class="card reports-banner">
        <div>
          <h3>Reportes</h3>
          <p>Filtra, ordena y exporta tareas (CSV o imprimir).</p>
        </div>
        <a href="reports.html" class="btn-primary">Ir a reportes →</a>
      </section>

      <section class="card">
        <h3>Calendario del equipo</h3>
        <div id="emp-calendar"></div>
      </section>

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

    renderCalendar(document.getElementById("emp-calendar"), allTasks,
      { showOwner: true, canChangeStatus: true, canEdit: true });

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
    const owner = DB.getUserById(t.userId);
    const canManageNotes = user.role === "empleador" || user.role === "administrador";
    const st = getStatus(t);
    const dlg = document.createElement("dialog");
    dlg.className = "task-details-dialog";
    dlg.innerHTML = `
      <h3>Detalles de la tarea</h3>
      <div class="info-grid">
        <div class="info-cell info-full">
          <span class="info-label">Nombre</span>
          <div class="info-val">${escapeHtml(t.name)}</div>
        </div>
        ${owner ? `
          <div class="info-cell info-full">
            <span class="info-label">Colaborador</span>
            <div class="info-val">👤 ${escapeHtml(owner.name)}</div>
          </div>
        ` : ""}
        <div class="info-cell">
          <span class="info-label">Inicio</span>
          <div class="info-val">${escapeHtml(t.start || "--:--")}</div>
        </div>
        <div class="info-cell">
          <span class="info-label">Fin</span>
          <div class="info-val">${escapeHtml(t.end || "--:--")}</div>
        </div>
        <div class="info-cell">
          <span class="info-label">Tiempo</span>
          <div class="info-val">${escapeHtml(t.time || "--:--")}</div>
        </div>
        <div class="info-cell info-full">
          <span class="info-label">Estado</span>
          <div class="info-val"><span class="badge status-${st}">${statusLabel(st)}</span></div>
        </div>
        ${t.comments ? `
          <div class="info-cell info-full">
            <span class="info-label">Comentarios</span>
            <div class="info-val info-comment">${escapeHtml(t.comments)}</div>
          </div>
        ` : ""}
      </div>
      ${canManageNotes ? `
        <div class="notes-editor">
          <div class="notes-editor-title">Notas del empleador</div>
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
      ` : `
        <div class="notes-editor">
          <div class="notes-editor-title">Notas</div>
          <div id="notes-list"></div>
        </div>
      `}
      <div class="row">
        <button type="button" class="btn-primary" id="close-dialog">Cerrar</button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    const listEl = dlg.querySelector("#notes-list");
    function drawNotes() {
      const curr = DB.getTasks().find(x => x.id === t.id);
      let notes = (curr && curr.notes) || [];
      // Supervisor/admin/empleador ven todas. Otros (si llegaran) solo las públicas.
      if (!canManageNotes && user.role !== "supervisor") {
        notes = notes.filter(n => n.visibility === "public");
      }
      if (!notes.length) { listEl.innerHTML = `<p class="hint">Aún no hay notas.</p>`; return; }
      listEl.innerHTML = notes.slice().sort((a,b) => b.createdAt - a.createdAt).map(n => {
        const a = DB.getUserById(n.authorId);
        return `
          <div class="note-row note-${n.visibility}">
            <div>
              <div class="note-text">${escapeHtml(n.text)}</div>
              <div class="note-meta">${n.visibility === "private" ? "🔒 Privada" : "👁 Visible al colaborador"} · ${a ? escapeHtml(a.name) : ""} · ${new Date(n.createdAt).toLocaleString()}</div>
            </div>
            ${canManageNotes ? `<button type="button" class="btn-danger note-del" data-note-del="${n.id}">×</button>` : ""}
          </div>
        `;
      }).join("");
      if (canManageNotes) {
        listEl.querySelectorAll("[data-note-del]").forEach(b =>
          b.addEventListener("click", () => {
            DB.deleteTaskNote(t.id, b.dataset.noteDel);
            drawNotes();
            onDone && onDone();
          })
        );
      }
    }
    drawNotes();

    if (canManageNotes) {
      const textEl = dlg.querySelector("#note-text");
      dlg.querySelector("#add-note-btn").addEventListener("click", () => {
        const text = textEl.value.trim();
        if (!text) return;
        const vis = dlg.querySelector('[name="note-vis"]:checked').value;
        DB.addTaskNote(t.id, { authorId: user.id, text, visibility: vis });
        textEl.value = "";
        drawNotes();
        onDone && onDone();
      });
    }

    const close = () => { try { dlg.close(); } catch(_){} dlg.remove(); };
    dlg.querySelector("#close-dialog").addEventListener("click", close);
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
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

      <section class="card reports-banner">
        <div>
          <h3>Reportes</h3>
          <p>Consulta, filtra, ordena y exporta las tareas del equipo.</p>
        </div>
        <a href="reports.html" class="btn-primary">Ir a reportes →</a>
      </section>

      <section class="card">
        <h3>Calendario del equipo</h3>
        <div id="sup-calendar"></div>
      </section>

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

    renderCalendar(document.getElementById("sup-calendar"), allTasks,
      { showOwner: true, canEdit: true });

    const list = document.getElementById("sup-tasks");
    const sUser = document.getElementById("s-user");
    const sStatus = document.getElementById("s-status");
    function refresh() {
      let rows = DB.getTasks().filter(t => users.some(u => u.id === t.userId));
      if (sUser.value) rows = rows.filter(t => t.userId === sUser.value);
      if (sStatus.value) rows = rows.filter(t => getStatus(t) === sStatus.value);
      rows.sort((a,b) => b.updatedAt - a.updatedAt);
      list.innerHTML = rows.length
        ? rows.map(t => taskCard(t, { showOwner: true, canEdit: true })).join("")
        : `<li class="empty">Sin tareas para los filtros seleccionados.</li>`;
      bindTaskActions(list, refresh);
    }
    [sUser, sStatus].forEach(el => el.addEventListener("change", refresh));
    refresh();
  }

  /* =================== ADMINISTRADOR =================== */
  function renderAdmin() {
    const all = DB.getUsers();
    const colabIds = new Set(all.filter(u => u.role === "colaborador").map(u => u.id));
    const teamTasks = DB.getTasks().filter(t => colabIds.has(t.userId));
    const pending = all.filter(u => u.status === "pending");
    panel.innerHTML = `
      <div class="grid-3">
        <div class="stat"><div class="num">${all.length}</div><div class="lbl">Usuarios</div></div>
        <div class="stat"><div class="num">${pending.length}</div><div class="lbl">Pendientes</div></div>
        <div class="stat"><div class="num">${DB.getTasks().length}</div><div class="lbl">Tareas totales</div></div>
      </div>

      <section class="card reports-banner">
        <div>
          <h3>Reportes</h3>
          <p>Panel dedicado para filtrar, ordenar y exportar tareas.</p>
        </div>
        <a href="reports.html" class="btn-primary">Ir a reportes →</a>
      </section>

      <section class="card">
        <h3>Solicitudes de registro</h3>
        <div id="pending-list"></div>
      </section>

      <section class="card">
        <h3>Calendario del equipo</h3>
        <div id="admin-calendar"></div>
      </section>

      <section class="card">
        <h3>Gestión de usuarios</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody id="admin-tbody"></tbody>
          </table>
        </div>
      </section>
    `;

    renderCalendar(document.getElementById("admin-calendar"), teamTasks,
      { showOwner: true, canChangeStatus: true, canEdit: true });
    const pendingList = document.getElementById("pending-list");
    const tbody = document.getElementById("admin-tbody");

    function statusLabelUser(s) {
      if (s === "pending")  return "Pendiente";
      if (s === "rejected") return "Rechazado";
      if (s === "inactive") return "Dado de baja";
      return "Aprobado";
    }

    function refresh() {
      const users = DB.getUsers();

      // Solicitudes pendientes
      const pend = users.filter(u => u.status === "pending");
      if (!pend.length) {
        pendingList.innerHTML = `<p class="empty">No hay solicitudes pendientes.</p>`;
      } else {
        pendingList.innerHTML = pend.map(u => `
          <div class="pending-card">
            <div class="pending-info">
              <div class="pending-name">${escapeHtml(u.name)}</div>
              <div class="pending-meta">
                <span>@${escapeHtml(u.username)}</span>
                <span>📧 ${escapeHtml(u.email)}</span>
                <span>📞 ${escapeHtml(u.phone)}</span>
              </div>
            </div>
            <div class="pending-actions">
              <button class="btn-ok" data-approve="${u.id}">Aprobar</button>
              <button class="btn-danger" data-reject="${u.id}">Rechazar</button>
            </div>
          </div>
        `).join("");
        pendingList.querySelectorAll("[data-approve]").forEach(b =>
          b.addEventListener("click", () => approveDialog(b.dataset.approve, refresh))
        );
        pendingList.querySelectorAll("[data-reject]").forEach(b =>
          b.addEventListener("click", async () => {
            const u = DB.getUserById(b.dataset.reject);
            if (!u) return;
            const ok = await confirmDialog({
              title: "Rechazar solicitud",
              message: `¿Rechazar la solicitud de ${u.name}? Verá un agujero negro al iniciar sesión.`,
              confirmText: "Rechazar",
              cancelText: "Cancelar",
              danger: true,
              icon: "🚫",
            });
            if (ok) { DB.updateUser(u.id, { status: "rejected" }); refresh(); }
          })
        );
      }

      // Tabla principal
      tbody.innerHTML = users.map(u => {
        const st = u.status || "approved";
        return `
          <tr class="row-status-${st}">
            <td data-label="Usuario">@${escapeHtml(u.username)}</td>
            <td data-label="Nombre">${escapeHtml(u.name)}</td>
            <td data-label="Correo">${escapeHtml(u.email)}</td>
            <td data-label="Teléfono">${escapeHtml(u.phone)}</td>
            <td data-label="Rol">${u.role ? `<span class="badge ${u.role}">${u.role}</span>` : `<span class="badge badge-none">sin rol</span>`}</td>
            <td data-label="Estado"><span class="badge user-status-${st}">${statusLabelUser(st)}</span></td>
            <td data-label="Acciones" class="cell-actions">
              <button class="btn-ghost" data-edit-user="${u.id}">Editar datos</button>
              <button class="btn-ghost" data-reset="${u.id}">Restablecer</button>
              <button class="btn-ghost" data-role="${u.id}">Cambiar rol</button>
              <button class="btn-ghost" data-status="${u.id}">Cambiar estado</button>
              ${u.id !== user.id ? (
                st === "inactive"
                  ? `<button class="btn-ok" data-reactivate="${u.id}">Reactivar</button>`
                  : `<button class="btn-danger" data-deactivate="${u.id}">Dar de baja</button>`
              ) : ""}
              ${u.id !== user.id ? `<button class="btn-danger" data-drop="${u.id}">Eliminar</button>` : `<em style="opacity:.6">tú</em>`}
            </td>
          </tr>
        `;
      }).join("");
      tbody.querySelectorAll("[data-edit-user]").forEach(b =>
        b.addEventListener("click", () => editUserDialog(b.dataset.editUser, refresh))
      );
      tbody.querySelectorAll("[data-reset]").forEach(b =>
        b.addEventListener("click", () => resetPasswordDialog(b.dataset.reset))
      );
      tbody.querySelectorAll("[data-role]").forEach(b =>
        b.addEventListener("click", () => changeRoleDialog(b.dataset.role, refresh))
      );
      tbody.querySelectorAll("[data-status]").forEach(b =>
        b.addEventListener("click", () => changeStatusDialog(b.dataset.status, refresh))
      );
      tbody.querySelectorAll("[data-deactivate]").forEach(b =>
        b.addEventListener("click", async () => {
          const u = DB.getUserById(b.dataset.deactivate);
          if (!u) return;
          const ok = await confirmDialog({
            title: "Dar de baja",
            message: `¿Dar de baja a ${u.name}? No podrá iniciar sesión hasta que sea reactivado.`,
            confirmText: "Dar de baja",
            cancelText: "Cancelar",
            danger: true,
            icon: "🌑",
          });
          if (ok) { DB.updateUser(u.id, { status: "inactive" }); refresh(); }
        })
      );
      tbody.querySelectorAll("[data-reactivate]").forEach(b =>
        b.addEventListener("click", () => {
          const u = DB.getUserById(b.dataset.reactivate);
          if (!u) return;
          const patch = { status: "approved" };
          if (!u.role) patch.role = "colaborador";
          DB.updateUser(u.id, patch);
          refresh();
        })
      );
      tbody.querySelectorAll("[data-drop]").forEach(b =>
        b.addEventListener("click", async () => {
          const u = DB.getUserById(b.dataset.drop);
          if (!u) return;
          const ok = await confirmDialog({
            title: "Eliminar usuario",
            message: `Esta acción borrará a ${u.name} y todas sus tareas de forma permanente. ¿Continuar?`,
            confirmText: "Eliminar",
            cancelText: "Cancelar",
            danger: true,
            icon: "🗑️",
          });
          if (ok) { DB.deleteUser(u.id); refresh(); }
        })
      );
    }
    refresh();
  }

  function editUserDialog(userId, onDone) {
    const u = DB.getUserById(userId);
    if (!u) return;
    const dlg = document.createElement("dialog");
    dlg.className = "edit-user-dialog";
    dlg.innerHTML = `
      <h3>Editar datos de usuario</h3>
      <form id="eu-form" method="dialog">
        <div class="avatar-edit">
          <div class="avatar-preview" id="eu-avatar">
            ${u.avatar ? `<img src="${u.avatar}" alt="avatar"/>` : `<span>Sin imagen</span>`}
          </div>
          <label class="btn-ghost eu-upload">
            Cambiar avatar
            <input type="file" accept="image/*" id="eu-avatar-input" hidden />
          </label>
          ${u.avatar ? `<button type="button" class="btn-ghost eu-remove" id="eu-avatar-remove">Quitar</button>` : ""}
        </div>
        <label><span>Nombre</span>
          <input name="name" required value="${escapeHtml(u.name)}"/>
        </label>
        <div class="grid-2">
          <label><span>Usuario</span>
            <input name="username" required value="${escapeHtml(u.username)}" pattern="[a-zA-Z0-9._-]{3,20}" title="3 a 20 caracteres: letras, números, . _ -"/>
          </label>
          <label><span>Teléfono</span>
            <input type="tel" name="phone" required value="${escapeHtml(u.phone)}"/>
          </label>
        </div>
        <label><span>Correo electrónico</span>
          <input type="email" name="email" required value="${escapeHtml(u.email)}"/>
        </label>
        <p class="form-msg" id="eu-msg"></p>
        <div class="row">
          <button type="button" class="btn-ghost" id="eu-cancel">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    let newAvatar = u.avatar || "";
    const preview = dlg.querySelector("#eu-avatar");
    const fileInput = dlg.querySelector("#eu-avatar-input");
    const removeBtn = dlg.querySelector("#eu-avatar-remove");
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { setMsg("La imagen no debe superar 2 MB.", "error"); return; }
      const reader = new FileReader();
      reader.onload = () => { newAvatar = reader.result; preview.innerHTML = `<img src="${newAvatar}" alt="avatar"/>`; };
      reader.readAsDataURL(f);
    });
    if (removeBtn) removeBtn.addEventListener("click", () => {
      newAvatar = "";
      preview.innerHTML = `<span>Sin imagen</span>`;
      removeBtn.remove();
    });

    function setMsg(text, type) {
      const el = dlg.querySelector("#eu-msg");
      el.textContent = text;
      el.className = "form-msg " + (type || "");
    }

    dlg.querySelector("#eu-cancel").addEventListener("click", () => { dlg.close(); dlg.remove(); });
    dlg.querySelector("#eu-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get("name")).trim();
      const username = String(fd.get("username")).trim();
      const phone = String(fd.get("phone")).trim();
      const email = String(fd.get("email")).trim();

      const others = DB.getUsers().filter(x => x.id !== u.id);
      if (others.some(x => x.username.toLowerCase() === username.toLowerCase()))
        return setMsg("Ese usuario ya está en uso.", "error");
      if (others.some(x => x.email.toLowerCase() === email.toLowerCase()))
        return setMsg("Ese correo ya está en uso.", "error");

      DB.updateUser(u.id, { name, username, phone, email, avatar: newAvatar });
      dlg.close(); dlg.remove();
      onDone && onDone();
    });
  }

  function approveDialog(userId, onDone) {
    const u = DB.getUserById(userId);
    if (!u) return;
    const roles = ["colaborador", "empleador", "supervisor", "administrador"];
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `
      <h3>Aprobar solicitud</h3>
      <p>Selecciona el rol que tendrá <strong>${escapeHtml(u.name)}</strong>:</p>
      <label><span>Rol asignado</span>
        <select id="approve-role">
          ${roles.map(r => `<option value="${r}">${r}</option>`).join("")}
        </select>
      </label>
      <div class="row">
        <button class="btn-ghost" id="cancel">Cancelar</button>
        <button class="btn-ok" id="confirm">Aprobar</button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector("#cancel").addEventListener("click", () => { dlg.close(); dlg.remove(); });
    dlg.querySelector("#confirm").addEventListener("click", () => {
      const r = dlg.querySelector("#approve-role").value;
      DB.updateUser(u.id, { status: "approved", role: r });
      dlg.close(); dlg.remove();
      onDone && onDone();
    });
  }

  function changeStatusDialog(userId, onDone) {
    const u = DB.getUserById(userId);
    if (!u) return;
    const opts = [
      { k: "approved", l: "Aprobado" },
      { k: "pending",  l: "Pendiente" },
      { k: "inactive", l: "Dado de baja (agujero negro)" },
      { k: "rejected", l: "Rechazado (agujero negro)" },
    ];
    const current = u.status || "approved";
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `
      <h3>Cambiar estado</h3>
      <p>Usuario: <strong>${escapeHtml(u.name)}</strong></p>
      <label><span>Nuevo estado</span>
        <select id="new-status">
          ${opts.map(o => `<option value="${o.k}" ${o.k===current?"selected":""}>${o.l}</option>`).join("")}
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
      const s = dlg.querySelector("#new-status").value;
      const patch = { status: s };
      // Si pasa a aprobado sin rol, dejamos "colaborador" por defecto
      if (s === "approved" && !u.role) patch.role = "colaborador";
      DB.updateUser(u.id, patch);
      dlg.close(); dlg.remove();
      onDone && onDone();
    });
  }

  function resetPasswordDialog(userId) {
    const u = DB.getUserById(userId);
    if (!u) return;
    const dlg = document.createElement("dialog");
    dlg.className = "reset-link-dialog";
    dlg.innerHTML = `
      <h3>🔐 Restablecer contraseña</h3>
      <p>Usuario: <strong>${escapeHtml(u.name)}</strong> (@${escapeHtml(u.username)})</p>
      <p class="hint">Se generará un enlace único que el usuario deberá abrir para elegir su propia contraseña. Caduca a las 24 horas y solo puede usarse una vez.</p>

      <div id="rl-before">
        <div class="row" style="justify-content:center;margin-top:10px;">
          <button type="button" class="btn-primary" id="rl-generate">Generar enlace de restablecimiento</button>
        </div>
      </div>

      <div id="rl-after" hidden>
        <div class="reset-link-box">
          <label><span>Enlace generado</span>
            <input type="text" id="rl-link" readonly />
          </label>
          <p class="hint" id="rl-expires"></p>
        </div>
        <div class="row">
          <button type="button" class="btn-primary" id="rl-copy">📋 Copiar enlace</button>
        </div>
      </div>

      <p class="form-msg" id="rl-msg"></p>
      <div class="row">
        <button type="button" class="btn-ghost" id="rl-close">Cerrar</button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    const msgEl = dlg.querySelector("#rl-msg");
    function setMsg(text, type) {
      msgEl.textContent = text || "";
      msgEl.className = "form-msg " + (type || "");
    }

    dlg.querySelector("#rl-close").addEventListener("click", () => { dlg.close(); dlg.remove(); });

    dlg.querySelector("#rl-generate").addEventListener("click", async () => {
      setMsg("Generando enlace...");
      try {
        const res = await fetch("api.php?action=users/generate_reset_link", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId }),
        });
        const data = await res.json();
        if (!data.ok) { setMsg(data.error || "No se pudo generar el enlace.", "error"); return; }
        const absoluteLink = location.origin + location.pathname.replace(/[^/]*$/, "") + data.link;
        const exp = new Date(data.expires_at);
        dlg.querySelector("#rl-link").value = absoluteLink;
        dlg.querySelector("#rl-expires").textContent = "Caduca el " + exp.toLocaleString();
        dlg.querySelector("#rl-before").hidden = true;
        dlg.querySelector("#rl-after").hidden = false;
        setMsg("");
      } catch (e) {
        setMsg("Error de red al generar el enlace.", "error");
      }
    });

    dlg.addEventListener("click", async (e) => {
      if (e.target && e.target.id === "rl-copy") {
        const input = dlg.querySelector("#rl-link");
        try {
          await navigator.clipboard.writeText(input.value);
          setMsg("Enlace copiado al portapapeles ✓", "ok");
        } catch (_) {
          input.select();
          document.execCommand("copy");
          setMsg("Enlace seleccionado. Usa Ctrl/Cmd + C para copiar.", "ok");
        }
      }
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

  /* Pickers de hora/fecha: wrappers sobre window.Pickers.
     Se declaran como funciones para que se hoisteen y estén disponibles
     antes de que renderColaborador (que se llama al inicio) las use. */
  function attachTimePicker(input) { return window.Pickers.attachTimePicker(input); }
  function attachDatePicker(input) { return window.Pickers.attachDatePicker(input); }

  /* =================== Calendario =================== */
  function renderCalendar(container, allTasks, cardOpts = { canChangeStatus: true, canDelete: true }) {
    let viewDate = new Date();
    let selected = null;
    const showOwnerFilter = !!cardOpts.showOwner;
    const colabs = showOwnerFilter ? DB.getUsers().filter(u => u.role === "colaborador") : [];
    const filters = { userId: "", status: "", from: "", to: "" };

    const pad = n => String(n).padStart(2, "0");
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

    function applyFilters(list) {
      return list.filter(t => {
        if (filters.userId && t.userId !== filters.userId) return false;
        if (filters.status && getStatus(t) !== filters.status) return false;
        const ts = t.createdAt;
        if (filters.from) {
          const f = new Date(filters.from + "T00:00:00").getTime();
          if (ts < f) return false;
        }
        if (filters.to) {
          const tt = new Date(filters.to + "T23:59:59.999").getTime();
          if (ts > tt) return false;
        }
        return true;
      });
    }

    function totalMinutes(list) {
      return list.reduce((s, t) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(t.time || "");
        return s + (m ? +m[1] * 60 + +m[2] : 0);
      }, 0);
    }
    function fmtMin(min) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${h}h ${pad(m)}m`;
    }

    function applyPreset(p) {
      const now = new Date();
      if (p === "today") {
        filters.from = filters.to = ymd(now);
      } else if (p === "yesterday") {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        filters.from = filters.to = ymd(y);
      } else if (p === "week") {
        const d = new Date(now);
        const dow = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - dow);
        const e = new Date(d); e.setDate(e.getDate() + 6);
        filters.from = ymd(d); filters.to = ymd(e);
      } else if (p === "month") {
        filters.from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
        filters.to   = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      } else if (p === "clear") {
        filters.userId = ""; filters.status = ""; filters.from = ""; filters.to = "";
      }
    }

    function draw() {
      const filteredTasks = applyFilters(allTasks);
      const y = viewDate.getFullYear();
      const mo = viewDate.getMonth();
      const first = new Date(y, mo, 1);
      const daysInMonth = new Date(y, mo + 1, 0).getDate();
      const startOffset = (first.getDay() + 6) % 7;
      const monthName = first.toLocaleString("es", { month: "long", year: "numeric" });
      const dayKey = d => `${y}-${pad(mo+1)}-${pad(d)}`;

      const tasksByDay = {};
      filteredTasks.forEach(t => {
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

      const totalMin = totalMinutes(filteredTasks);
      const realizadas = filteredTasks.filter(t => getStatus(t) === "realizada").length;

      container.innerHTML = `
        <div class="cal-filters">
          ${showOwnerFilter ? `
            <select id="cal-f-user" class="cal-f-control">
              <option value="">Todos los colaboradores</option>
              ${colabs.map(u => `<option value="${u.id}" ${filters.userId===u.id?"selected":""}>${escapeHtml(u.name)}</option>`).join("")}
            </select>` : ""}
          <select id="cal-f-status" class="cal-f-control">
            <option value="">Cualquier estado</option>
            ${STATUSES.map(s => `<option value="${s.key}" ${filters.status===s.key?"selected":""}>${s.label}</option>`).join("")}
          </select>
          <label class="cal-date"><span>Desde</span><input type="date" id="cal-f-from" value="${filters.from}"/></label>
          <label class="cal-date"><span>Hasta</span><input type="date" id="cal-f-to" value="${filters.to}"/></label>
          <div class="cal-presets">
            <button type="button" class="btn-ghost" data-preset="today">Hoy</button>
            <button type="button" class="btn-ghost" data-preset="yesterday">Ayer</button>
            <button type="button" class="btn-ghost" data-preset="week">Esta semana</button>
            <button type="button" class="btn-ghost" data-preset="month">Este mes</button>
            <button type="button" class="btn-ghost" data-preset="clear">Limpiar</button>
          </div>
        </div>

        <div class="cal-stats-bar">
          <div class="cal-stat-pill"><span class="cal-stat-lbl">Tareas</span><strong>${filteredTasks.length}</strong></div>
          <div class="cal-stat-pill"><span class="cal-stat-lbl">Horas trabajadas</span><strong>${fmtMin(totalMin)}</strong></div>
          <div class="cal-stat-pill"><span class="cal-stat-lbl">Realizadas</span><strong>${realizadas}</strong></div>
        </div>

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

      const userSel = container.querySelector("#cal-f-user");
      if (userSel) userSel.addEventListener("change", () => { filters.userId = userSel.value; selected = null; draw(); });
      const statusSel = container.querySelector("#cal-f-status");
      statusSel.addEventListener("change", () => { filters.status = statusSel.value; selected = null; draw(); });
      const fromEl = container.querySelector("#cal-f-from");
      const toEl   = container.querySelector("#cal-f-to");
      attachDatePicker(fromEl);
      attachDatePicker(toEl);
      fromEl.addEventListener("change", e => { filters.from = e.target.value; selected = null; draw(); });
      toEl.addEventListener("change", e => { filters.to = e.target.value; selected = null; draw(); });
      container.querySelectorAll("[data-preset]").forEach(b =>
        b.addEventListener("click", () => { applyPreset(b.dataset.preset); selected = null; draw(); })
      );

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
        list.innerHTML = dayTasks.map(t => taskCard(t, cardOpts)).join("");
        bindTaskActions(list, () => render());
      }
    }
    draw();
  }

  /* Diálogo de confirmación con estilo (reemplazo de window.confirm) */
  function confirmDialog({ title, message, confirmText = "Confirmar", cancelText = "Cancelar", danger = false, icon = "⚠️" }) {
    return new Promise(resolve => {
      const dlg = document.createElement("dialog");
      dlg.className = "confirm-dialog" + (danger ? " is-danger" : "");
      dlg.innerHTML = `
        <div class="confirm-icon">${icon}</div>
        <h3>${escapeHtml(title)}</h3>
        <p class="confirm-msg">${escapeHtml(message)}</p>
        <div class="row confirm-row">
          <button type="button" class="btn-ghost" id="cd-cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="${danger ? "btn-danger" : "btn-primary"}" id="cd-confirm">${escapeHtml(confirmText)}</button>
        </div>
      `;
      document.body.appendChild(dlg);
      dlg.showModal();
      const close = (val) => { try { dlg.close(); } catch(_){} dlg.remove(); resolve(val); };
      dlg.querySelector("#cd-cancel").addEventListener("click", () => close(false));
      dlg.querySelector("#cd-confirm").addEventListener("click", () => close(true));
      dlg.addEventListener("click", (e) => { if (e.target === dlg) close(false); });
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(false); });
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
