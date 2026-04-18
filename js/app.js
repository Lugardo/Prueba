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
  };
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    Object.values(forms).forEach(f => { if (f) f.classList.remove("active"); });
    const target = forms[t.dataset.tab];
    if (target) target.classList.add("active");
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
    ["login-msg", "register-msg"].forEach(id => {
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

  // ---- Views (contact admin / agujero negro) ----
  const authMain = document.getElementById("auth-main");
  const viewContact = document.getElementById("view-contact");
  const viewBH = document.getElementById("view-blackhole");
  const contactTitle = document.getElementById("contact-title");
  const contactMsg = document.getElementById("contact-msg");

  function showView(which) {
    authMain.hidden = which !== "main";
    viewContact.hidden = which !== "contact";
    viewBH.hidden = which !== "blackhole";
  }
  document.getElementById("contact-back").addEventListener("click", () => showView("main"));
  document.getElementById("bh-back").addEventListener("click", () => showView("main"));

  function showPendingContact(afterRegister) {
    if (afterRegister) {
      contactTitle.textContent = "Registro recibido";
      contactMsg.innerHTML = "Tu cuenta fue creada y está <strong>pendiente de aprobación</strong>. Para activarla, comunícate con un administrador:";
    } else {
      contactTitle.textContent = "Cuenta pendiente de aprobación";
      contactMsg.innerHTML = "Tu registro todavía no ha sido aprobado. Comunícate con un administrador para activar tu cuenta:";
    }
    showView("contact");
  }

  // ---- Login ----
  forms.login.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(forms.login);
    const res = Auth.login(fd.get("username").trim(), fd.get("password"));
    if (res.ok) {
      setMsg("login-msg", "Acceso concedido. Despegando...", "ok");
      setTimeout(() => window.location.href = "dashboard.html", 500);
      return;
    }
    if (res.state === "pending")  return showPendingContact(false);
    if (res.state === "rejected" || res.state === "inactive") return showView("blackhole");
    setMsg("login-msg", res.error, "error");
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
    forms.register.reset();
    if (avatarPreview) avatarPreview.innerHTML = `<span>Sin imagen</span>`;
    avatarDataURL = "";
    showPendingContact(true);
  });

})();
