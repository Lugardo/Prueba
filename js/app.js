/* Lógica de la página de acceso (index.html) */
(function () {
  // Si ya hay sesión, ir al panel
  if (Auth.currentUser()) {
    window.location.replace("dashboard.html");
    return;
  }

  // ---- Tabs ----
  const tabs = document.querySelectorAll(".tab");
  const forms = {
    login: document.getElementById("form-login"),
    register: document.getElementById("form-register"),
    reset: document.getElementById("form-reset"),
  };
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    Object.values(forms).forEach(f => f.classList.remove("active"));
    forms[t.dataset.tab].classList.add("active");
    clearMessages();
  }));

  // ---- Toggle mostrar contraseña ----
  document.querySelectorAll(".toggle-pass").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "Ver" : "Ocultar";
    });
  });

  function clearMessages() {
    ["login-msg", "register-msg", "reset-msg"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = ""; el.className = "form-msg"; }
    });
  }

  function setMsg(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = "form-msg " + (type || "");
  }

  // ---- Login ----
  forms.login.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(forms.login);
    const res = Auth.login(fd.get("username").trim(), fd.get("password"));
    if (!res.ok) return setMsg("login-msg", res.error, "error");
    setMsg("login-msg", "Acceso concedido. Despegando...", "ok");
    setTimeout(() => window.location.href = "dashboard.html", 500);
  });

  // ---- Registro + avatar ----
  const avatarInput = document.getElementById("avatar-input");
  const avatarPreview = document.getElementById("avatar-preview");
  let avatarDataURL = "";

  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMsg("register-msg", "La imagen no debe superar 2 MB.", "error");
      avatarInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      avatarDataURL = reader.result;
      avatarPreview.innerHTML = `<img src="${avatarDataURL}" alt="avatar" />`;
    };
    reader.readAsDataURL(file);
  });

  forms.register.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(forms.register);
    const res = Auth.register({
      name: fd.get("name"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      password: fd.get("password"),
      avatar: avatarDataURL,
    });
    if (!res.ok) return setMsg("register-msg", res.error, "error");
    setMsg("register-msg", "Cuenta creada. Redirigiendo...", "ok");
    setTimeout(() => window.location.href = "dashboard.html", 600);
  });

  // ---- Recuperación de contraseña ----
  const sendBtn = document.getElementById("send-code");
  const confirmBtn = document.getElementById("confirm-reset");
  const step1 = forms.reset.querySelector('[data-step="1"]');
  const step2 = forms.reset.querySelector('[data-step="2"]');
  const demoCode = document.getElementById("demo-code");
  let resetCtx = null;

  sendBtn.addEventListener("click", () => {
    const ident = forms.reset.querySelector('[name="identifier"]').value.trim();
    if (!ident) return setMsg("reset-msg", "Ingresa tu usuario o correo.", "error");
    const res = Auth.generateResetCode(ident);
    if (!res.ok) return setMsg("reset-msg", res.error, "error");
    resetCtx = { userId: res.userId };
    demoCode.textContent = res.code;
    step1.hidden = true;
    step2.hidden = false;
    setMsg("reset-msg", `Código enviado a ${res.email}.`, "ok");
  });

  confirmBtn.addEventListener("click", () => {
    if (!resetCtx) return;
    const code = forms.reset.querySelector('[name="code"]').value.trim();
    const newPass = forms.reset.querySelector('[name="newPass"]').value;
    const res = Auth.resetPassword(resetCtx.userId, code, newPass);
    if (!res.ok) return setMsg("reset-msg", res.error, "error");
    setMsg("reset-msg", "Contraseña restablecida. Ya puedes iniciar sesión.", "ok");
    setTimeout(() => {
      document.querySelector('.tab[data-tab="login"]').click();
      forms.reset.reset();
      step1.hidden = false;
      step2.hidden = true;
      resetCtx = null;
    }, 1200);
  });
})();
