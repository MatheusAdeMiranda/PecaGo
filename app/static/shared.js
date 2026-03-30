const STATUS_META = {
  pending: { label: "Aguardando", badgeClass: "badge-info" },
  accepted: { label: "Aceito", badgeClass: "badge-info" },
  preparing: { label: "Separando", badgeClass: "badge-accent" },
  in_delivery: { label: "Em rota", badgeClass: "badge-accent" },
  delivered: { label: "Concluido", badgeClass: "badge-success" },
  cancelled: { label: "Cancelado", badgeClass: "badge-danger" },
};

function getToken() {
  return localStorage.getItem("access_token") || "";
}

function setToken(token) {
  localStorage.setItem("access_token", token);
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getStatusMeta(status) {
  return STATUS_META[status] || { label: status || "Sem status", badgeClass: "badge-info" };
}

function statusBadge(status) {
  const meta = getStatusMeta(status);
  return `<span class="badge ${meta.badgeClass}">${meta.label}</span>`;
}

function setRefreshNote(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
}

function setStatus(id, text, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.dataset.state = isError ? "error" : "ok";
}

function makeCard(html) {
  const div = document.createElement("div");
  div.className = "result-card";
  div.innerHTML = html;
  return div;
}

function renderList(id, entries, emptyMessage = "Nenhum resultado.") {
  const root = document.getElementById(id);
  if (!root) return;
  root.innerHTML = "";
  if (!entries.length) {
    root.appendChild(makeCard(emptyMessage));
    return;
  }
  entries.forEach((entry) => root.appendChild(entry));
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Erro na requisicao");
  return data;
}

async function refreshSessionStatus(roleElementId, tokenElementId) {
  const roleEl = document.getElementById(roleElementId);
  const tokenEl = document.getElementById(tokenElementId);
  const token = getToken();
  if (tokenEl) tokenEl.textContent = token || "Nenhum token ainda.";

  if (!roleEl) return;
  if (!token) {
    roleEl.textContent = "Nenhum login ativo.";
    return;
  }

  try {
    const me = await api("/auth/me");
    roleEl.textContent = `Logado como ${me.name} (${me.role})`;
  } catch (_) {
    roleEl.textContent = "Token presente, mas sem sessao valida.";
  }
}

function fillLogin(email, password = "123456") {
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  if (emailInput) emailInput.value = email;
  if (passwordInput) passwordInput.value = password;
}

function setupSectionSpy(sectionSelector = ".persona-section", linkSelector = ".quick-link") {
  const sections = [...document.querySelectorAll(sectionSelector)];
  const links = [...document.querySelectorAll(linkSelector)];
  if (!sections.length || !links.length || !("IntersectionObserver" in window)) return;

  const syncState = (activeId) => {
    sections.forEach((section) => {
      section.classList.toggle("is-current", section.id === activeId);
    });
    links.forEach((link) => {
      link.classList.toggle("is-current", link.getAttribute("href") === `#${activeId}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) syncState(visible.target.id);
    },
    {
      rootMargin: "-18% 0px -58% 0px",
      threshold: [0.2, 0.45, 0.7],
    }
  );

  sections.forEach((section) => observer.observe(section));
  syncState(sections[0].id);
}
