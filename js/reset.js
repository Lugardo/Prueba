/* Página pública de restablecimiento de contraseña.
 * Lee ?token=... de la URL, valida con auth/reset_check y muestra el formulario.
 */
(async function () {
  const qs = new URLSearchParams(location.search);
  const token = qs.get('token') || '';

  const viewLoading = document.getElementById('view-loading');
  const viewInvalid = document.getElementById('view-invalid');
  const viewSuccess = document.getElementById('view-success');
  const form        = document.getElementById('reset-form');
  const helloMsg    = document.getElementById('hello-msg');
  const invalidTitle= document.getElementById('invalid-title');
  const invalidMsg  = document.getElementById('invalid-msg');
  const resetMsg    = document.getElementById('reset-msg');

  function show(which) {
    viewLoading.hidden = which !== 'loading';
    viewInvalid.hidden = which !== 'invalid';
    form.hidden        = which !== 'form';
    viewSuccess.hidden = which !== 'success';
    form.classList.toggle('active', which === 'form');
  }

  function setMsg(text, type) {
    resetMsg.textContent = text || '';
    resetMsg.className = 'form-msg' + (type ? ' ' + type : '');
  }

  // Toggle de "Ver contraseña"
  document.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Ver' : 'Ocultar';
    });
  });

  async function apiGet(action, params) {
    const url = 'api.php?action=' + encodeURIComponent(action) + (params ? '&' + params : '');
    const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    return res.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor.' }));
  }
  async function apiPost(action, body) {
    const res = await fetch('api.php?action=' + encodeURIComponent(action), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return res.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor.' }));
  }

  if (!token) {
    invalidTitle.textContent = 'Enlace no válido';
    invalidMsg.textContent = 'No se encontró el token en la URL.';
    show('invalid');
    return;
  }

  // Validar el token al cargar
  const check = await apiGet('auth/reset_check', 'token=' + encodeURIComponent(token));
  if (!check.ok) {
    if (check.reason === 'expired')     { invalidTitle.textContent = 'El enlace expiró'; invalidMsg.textContent = 'Este enlace ya no es válido. Pide al administrador uno nuevo.'; }
    else if (check.reason === 'used')   { invalidTitle.textContent = 'Enlace ya usado';  invalidMsg.textContent = 'Este enlace ya se utilizó para restablecer la contraseña. Pide otro si lo necesitas.'; }
    else                                { invalidTitle.textContent = 'Enlace no válido'; invalidMsg.textContent = check.error || 'No pudimos validar este enlace.'; }
    show('invalid');
    return;
  }

  helloMsg.textContent = `Hola, ${check.user.name} (@${check.user.username})`;
  show('form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    const confirm  = String(fd.get('confirm') || '');

    if (password.length < 6) return setMsg('La contraseña debe tener al menos 6 caracteres.', 'error');
    if (password !== confirm) return setMsg('Las contraseñas no coinciden.', 'error');

    setMsg('Guardando…');
    const res = await apiPost('auth/reset_submit', { token, password });
    if (!res.ok) return setMsg(res.error || 'Error al actualizar la contraseña.', 'error');
    show('success');
  });
})();
