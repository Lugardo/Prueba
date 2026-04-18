/* Página de reportes accesible para supervisor, empleador y admin */
(function () {
  const user = Auth.requireAuth(["supervisor", "empleador", "administrador"]);
  if (!user) return;

  document.getElementById("role-tag").textContent = user.role;
  document.getElementById("logout-btn").addEventListener("click", () => {
    Auth.logout();
    window.location.href = "index.html";
  });

  // Menú hamburguesa (mismo comportamiento que el dashboard)
  const hamburger = document.getElementById("hamburger");
  const topbarRight = document.getElementById("topbar-right");
  if (hamburger && topbarRight) {
    const close = () => { hamburger.classList.remove("open"); topbarRight.classList.remove("open"); hamburger.setAttribute("aria-expanded", "false"); };
    hamburger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !hamburger.classList.contains("open");
      hamburger.classList.toggle("open", open);
      topbarRight.classList.toggle("open", open);
      hamburger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", (e) => { if (!topbarRight.contains(e.target) && !hamburger.contains(e.target)) close(); });
    window.addEventListener("resize", () => { if (window.innerWidth > 720) close(); });
  }

  const STATUSES = [
    { key: "trabajando", label: "Trabajando" },
    { key: "revision",   label: "En revisión" },
    { key: "realizada",  label: "Realizada" },
    { key: "cancelado",  label: "Cancelado" },
  ];
  const statusLabel = k => (STATUSES.find(s => s.key === k) || STATUSES[0]).label;
  const getStatus = t => (t && t.status) ? t.status : (t && t.done ? "realizada" : "trabajando");

  const colabs = DB.getUsers().filter(u => u.role === "colaborador");
  const colabIds = new Set(colabs.map(u => u.id));

  // Poblar selects
  const userSel = document.getElementById("rep-user");
  colabs.forEach(u => userSel.insertAdjacentHTML("beforeend", `<option value="${u.id}">${escapeHtml(u.name)}</option>`));
  const statusSel = document.getElementById("rep-status");
  STATUSES.forEach(s => statusSel.insertAdjacentHTML("beforeend", `<option value="${s.key}">${s.label}</option>`));

  const filters = { userId: "", status: "", from: "", to: "", text: "" };
  let sortBy = "createdAt";
  let sortDir = "desc";

  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const timeToMinutes = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : 0; };
  const fmtMin = min => `${Math.floor(min / 60)}h ${pad(min % 60)}m`;

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function applyFilters(tasks) {
    return tasks.filter(t => {
      if (!colabIds.has(t.userId)) return false;
      if (filters.userId && t.userId !== filters.userId) return false;
      if (filters.status && getStatus(t) !== filters.status) return false;
      if (filters.from) {
        const f = new Date(filters.from + "T00:00:00").getTime();
        if (t.createdAt < f) return false;
      }
      if (filters.to) {
        const tt = new Date(filters.to + "T23:59:59.999").getTime();
        if (t.createdAt > tt) return false;
      }
      if (filters.text) {
        const q = filters.text.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !(t.comments || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function enrich(task) {
    const u = DB.getUserById(task.userId);
    return {
      ...task,
      userName: u ? u.name : "",
      status: getStatus(task),
      timeMinutes: timeToMinutes(task.time),
    };
  }

  function sortRows(rows) {
    const mult = sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const va = a[sortBy], vb = b[sortBy];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
      return String(va ?? "").localeCompare(String(vb ?? ""), "es", { sensitivity: "base" }) * mult;
    });
  }

  function applyPreset(p) {
    const now = new Date();
    if (p === "today")      filters.from = filters.to = ymd(now);
    else if (p === "yesterday") { const y = new Date(now); y.setDate(y.getDate()-1); filters.from = filters.to = ymd(y); }
    else if (p === "week")  { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay()+6)%7)); const e = new Date(d); e.setDate(e.getDate()+6); filters.from = ymd(d); filters.to = ymd(e); }
    else if (p === "month") { filters.from = ymd(new Date(now.getFullYear(), now.getMonth(), 1)); filters.to = ymd(new Date(now.getFullYear(), now.getMonth()+1, 0)); }
    else if (p === "clear") { filters.userId = ""; filters.status = ""; filters.from = ""; filters.to = ""; filters.text = ""; }
    syncInputs();
  }

  function syncInputs() {
    document.getElementById("rep-user").value = filters.userId;
    document.getElementById("rep-status").value = filters.status;
    document.getElementById("rep-from").value = filters.from;
    document.getElementById("rep-to").value = filters.to;
    document.getElementById("rep-text").value = filters.text;
  }

  let currentRows = [];

  function draw() {
    const filtered = applyFilters(DB.getTasks()).map(enrich);
    currentRows = sortRows(filtered);

    document.getElementById("rep-stat-count").textContent = currentRows.length;
    document.getElementById("rep-stat-hours").textContent = fmtMin(currentRows.reduce((s, t) => s + t.timeMinutes, 0));
    document.getElementById("rep-stat-done").textContent  = currentRows.filter(t => t.status === "realizada").length;

    document.querySelectorAll(".rep-table th[data-sort]").forEach(th => {
      th.classList.toggle("sort-asc",  sortBy === th.dataset.sort && sortDir === "asc");
      th.classList.toggle("sort-desc", sortBy === th.dataset.sort && sortDir === "desc");
    });

    const tbody = document.getElementById("rep-tbody");
    if (!currentRows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">Sin tareas para los filtros seleccionados.</td></tr>`;
      return;
    }
    tbody.innerHTML = currentRows.map(t => `
      <tr>
        <td data-label="Colaborador">${escapeHtml(t.userName)}</td>
        <td data-label="Tarea">${escapeHtml(t.name)}</td>
        <td data-label="Inicio">${escapeHtml(t.start || "--:--")}</td>
        <td data-label="Fin">${escapeHtml(t.end || "--:--")}</td>
        <td data-label="Tiempo">${escapeHtml(t.time || "--:--")}</td>
        <td data-label="Estado"><span class="badge status-${t.status}">${statusLabel(t.status)}</span></td>
        <td data-label="Fecha">${new Date(t.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join("");
  }

  // Listeners de filtros
  document.getElementById("rep-user").addEventListener("change", e => { filters.userId = e.target.value; draw(); });
  document.getElementById("rep-status").addEventListener("change", e => { filters.status = e.target.value; draw(); });
  document.getElementById("rep-from").addEventListener("change", e => { filters.from = e.target.value; draw(); });
  document.getElementById("rep-to").addEventListener("change", e => { filters.to = e.target.value; draw(); });
  document.getElementById("rep-text").addEventListener("input", e => { filters.text = e.target.value; draw(); });
  document.querySelectorAll("[data-preset]").forEach(b =>
    b.addEventListener("click", () => { applyPreset(b.dataset.preset); draw(); })
  );

  // Orden al hacer clic en encabezados
  document.querySelectorAll(".rep-table th[data-sort]").forEach(th =>
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortBy === key) sortDir = (sortDir === "asc" ? "desc" : "asc");
      else { sortBy = key; sortDir = (key === "timeMinutes" || key === "createdAt") ? "desc" : "asc"; }
      draw();
    })
  );

  // Export CSV
  document.getElementById("rep-export-csv").addEventListener("click", () => {
    const headers = ["Colaborador","Tarea","Inicio","Fin","Tiempo","Estado","Fecha","Comentarios","Notas"];
    const esc = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(",")];
    currentRows.forEach(r => {
      const notes = (r.notes || []).map(n => (n.visibility === "public" ? "[público] " : "[privada] ") + n.text).join(" | ");
      lines.push([
        esc(r.userName), esc(r.name), esc(r.start || ""), esc(r.end || ""),
        esc(r.time || ""), esc(statusLabel(r.status)),
        esc(new Date(r.createdAt).toLocaleString()),
        esc(r.comments || ""), esc(notes),
      ].join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-tareas-${ymd(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Imprimir (usar diálogo nativo, se puede "guardar como PDF")
  document.getElementById("rep-print").addEventListener("click", () => window.print());

  draw();
})();
