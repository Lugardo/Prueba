/* Pickers compartidos: time picker y date picker custom.
 * Expone window.Pickers con:
 *   - attachTimePicker(input)
 *   - attachDatePicker(input)
 */
(function (global) {
  const pad = n => String(n).padStart(2, "0");

  /* =================== TIME PICKER =================== */

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

  /* =================== DATE PICKER =================== */

  const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const WEEKDAYS = ["L","M","X","J","V","S","D"];

  function attachDatePicker(input) {
    if (!input || input._datePicked) return;
    input._datePicked = true;
    // Cambiamos el tipo a "text" para evitar el date picker nativo del navegador
    if (input.type === "date") input.type = "text";
    input.readOnly = true;
    input.classList.add("date-field");
    input.placeholder = input.placeholder || "aaaa-mm-dd";
    input.addEventListener("click", (e) => {
      e.preventDefault();
      if (input._picking) return;
      input._picking = true;
      openDatePicker(input, () => { input._picking = false; });
    });
  }

  function parseYMD(str) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(str || "").trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(d.getTime())) return null;
    return d;
  }
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function sameDay(a, b) { return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

  function openDatePicker(input, onClose) {
    const today = new Date();
    let selected = parseYMD(input.value) || null;
    let viewYear  = (selected || today).getFullYear();
    let viewMonth = (selected || today).getMonth();

    const dlg = document.createElement("dialog");
    dlg.className = "date-picker-dialog";
    dlg.innerHTML = `
      <div class="dp-header">
        <button type="button" class="btn-ghost dp-nav" id="dp-prev" aria-label="Mes anterior">‹</button>
        <div class="dp-title" id="dp-title"></div>
        <button type="button" class="btn-ghost dp-nav" id="dp-next" aria-label="Mes siguiente">›</button>
      </div>
      <div class="dp-weekdays">
        ${WEEKDAYS.map(d => `<span>${d}</span>`).join("")}
      </div>
      <div class="dp-grid" id="dp-grid"></div>
      <div class="dp-actions">
        <button type="button" class="btn-ghost" id="dp-today">Hoy</button>
        <button type="button" class="btn-ghost" id="dp-clear">Limpiar</button>
        <button type="button" class="btn-ghost" id="dp-cancel">Cancelar</button>
        <button type="button" class="btn-primary" id="dp-ok">Aceptar</button>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();

    const titleEl = dlg.querySelector("#dp-title");
    const gridEl  = dlg.querySelector("#dp-grid");

    function render() {
      titleEl.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
      const firstOfMonth = new Date(viewYear, viewMonth, 1);
      const startOffset  = (firstOfMonth.getDay() + 6) % 7; // lunes=0
      const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
      const prevDays     = new Date(viewYear, viewMonth, 0).getDate();

      const cells = [];
      // días del mes anterior (grisados)
      for (let i = startOffset - 1; i >= 0; i--) {
        const day = prevDays - i;
        cells.push(renderCell(day, viewYear, viewMonth - 1, true));
      }
      // días del mes actual
      for (let d = 1; d <= daysInMonth; d++) {
        cells.push(renderCell(d, viewYear, viewMonth, false));
      }
      // completar hasta 42 celdas (6 filas × 7)
      const trailing = 42 - cells.length;
      for (let d = 1; d <= trailing; d++) {
        cells.push(renderCell(d, viewYear, viewMonth + 1, true));
      }
      gridEl.innerHTML = cells.join("");

      gridEl.querySelectorAll("[data-day]").forEach(b => {
        b.addEventListener("click", () => {
          const [y, m, d] = b.dataset.day.split("-").map(Number);
          selected = new Date(y, m, d);
          viewYear = y; viewMonth = m;
          render();
        });
      });
    }

    function renderCell(day, y, m, outside) {
      // normalizar meses fuera de rango
      const date = new Date(y, m, day);
      y = date.getFullYear(); m = date.getMonth(); day = date.getDate();
      const isToday = sameDay(date, today);
      const isSel   = sameDay(date, selected);
      const cls = [
        "dp-cell",
        outside ? "outside" : "",
        isToday ? "today" : "",
        isSel   ? "selected" : "",
      ].filter(Boolean).join(" ");
      return `<button type="button" class="${cls}" data-day="${y}-${m}-${day}">${day}</button>`;
    }

    dlg.querySelector("#dp-prev").addEventListener("click", () => {
      if (viewMonth === 0) { viewMonth = 11; viewYear--; } else { viewMonth--; }
      render();
    });
    dlg.querySelector("#dp-next").addEventListener("click", () => {
      if (viewMonth === 11) { viewMonth = 0; viewYear++; } else { viewMonth++; }
      render();
    });
    dlg.querySelector("#dp-today").addEventListener("click", () => {
      selected = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      viewYear = today.getFullYear(); viewMonth = today.getMonth();
      render();
    });
    dlg.querySelector("#dp-clear").addEventListener("click", () => {
      selected = null;
      input.value = "";
      input.dispatchEvent(new Event("input",  { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    });

    const close = () => {
      try { dlg.close(); } catch (_) {}
      dlg.remove();
      if (typeof onClose === "function") onClose();
    };
    dlg.querySelector("#dp-cancel").addEventListener("click", close);
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
    dlg.querySelector("#dp-ok").addEventListener("click", () => {
      if (selected) {
        input.value = ymd(selected);
        input.dispatchEvent(new Event("input",  { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      close();
    });

    render();
  }

  global.Pickers = { attachTimePicker, openTimePicker, attachDatePicker, openDatePicker };
})(window);
