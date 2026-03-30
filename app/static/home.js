function renderMetrics(metrics) {
  const root = document.getElementById("metrics-grid");
  if (!root) return;

  const cards = [
    ["Lojas ativas", metrics.stores, "Pontos de venda cadastrados"],
    ["Produtos", metrics.products, "Itens publicados no catalogo"],
    ["Pedidos", metrics.orders, "Pedidos registrados no MVP"],
    ["Entregas livres", metrics.available_deliveries, "Pedidos aguardando entregador"],
    ["Em rota", metrics.in_delivery, "Pedidos atualmente em entrega"],
    ["Baixo estoque", metrics.low_stock, "Produtos com estoque 3 ou menor"],
    ["Entregadores", metrics.delivery_users, "Perfis prontos para corrida"],
    ["GMV simulado", currency(metrics.gross_volume), "Volume bruto em pedidos"],
  ];

  root.innerHTML = "";
  cards.forEach(([label, value, foot]) => {
    const div = document.createElement("div");
    div.className = "metric-card";
    div.innerHTML = `
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-foot">${foot}</div>
    `;
    root.appendChild(div);
  });
}

function renderTracker(rootId, status) {
  const root = document.getElementById(rootId);
  if (!root) return;

  const steps = [
    ["accepted", "Pedido aceito", "Loja confirmou o atendimento."],
    ["preparing", "Separacao", "Pedido em preparacao para despacho."],
    ["in_delivery", "Em rota", "Entregador a caminho do destino."],
    ["delivered", "Concluido", "Entrega finalizada com sucesso."],
  ];

  const matchIndex = steps.findIndex(([key]) => key === status);
  const currentIndex = matchIndex >= 0 ? matchIndex : 0;

  root.innerHTML = "";
  steps.forEach(([key, title, subtitle], index) => {
    const stateClass =
      key === status ? "is-active" : index < currentIndex ? "is-done" : "";
    const div = document.createElement("div");
    div.className = `tracker-step ${stateClass}`.trim();
    div.innerHTML = `
      <div class="tracker-dot">${index + 1}</div>
      <div>
        <div class="tracker-title">${title}</div>
        <div class="tracker-subtitle">${subtitle}</div>
      </div>
    `;
    root.appendChild(div);
  });
}

function renderOrderCard(order) {
  return makeCard(`
    <strong>Pedido #${order.id}</strong>
    <div class="badge-row">
      ${statusBadge(order.status)}
      <span class="badge badge-accent">${currency(order.total_amount)}</span>
    </div>
    Loja: ${order.store_name}<br />
    Cliente: ${order.customer_name}<br />
    Endereco: ${order.delivery_address}
    <div class="card-actions">
      <a class="ghost-button" href="/console#delivery">Ver fluxo operacional</a>
    </div>
  `);
}

function renderProductCard(product) {
  return makeCard(`
    <strong>${product.name}</strong>
    <div class="badge-row">
      <span class="badge badge-info">ID ${product.id}</span>
      <span class="badge badge-accent">${currency(product.price)}</span>
      <span class="badge badge-info">Estoque ${product.stock}</span>
    </div>
    Loja: ${product.store_name}
    <div class="card-actions">
      <a class="ghost-button" href="/console#customer">Simular pedido</a>
    </div>
  `);
}

function renderSummary(data) {
  renderMetrics(data.metrics);

  const users = document.getElementById("demo-users-box");
  if (users) {
    users.innerHTML = `
      ${data.demo_users.store}<br />
      ${data.demo_users.customer}<br />
      ${data.demo_users.delivery}
    `;
  }

  renderList("recent-orders", data.recent_orders.map(renderOrderCard));
  renderList("featured-products", data.featured_products.map(renderProductCard));

  const latest = data.recent_orders[0];
  const spotlight = document.getElementById("order-spotlight");
  if (spotlight) {
    spotlight.innerHTML = latest
      ? `
        <strong>Pedido #${latest.id}</strong>
        <div class="badge-row">
          ${statusBadge(latest.status)}
          <span class="badge badge-accent">${currency(latest.total_amount)}</span>
        </div>
        Loja: ${latest.store_name}<br />
        Cliente: ${latest.customer_name}<br />
        Entrega: ${latest.delivery_address}
        <div class="card-actions">
          <a class="ghost-button" href="/console#delivery">Continuar no console</a>
        </div>
      `
      : "Nenhum pedido em foco ainda.";
  }

  const miniKpis = document.getElementById("logistics-mini-kpis");
  if (miniKpis) {
    miniKpis.innerHTML = `
      <div class="mini-kpi"><strong>${data.metrics.available_deliveries}</strong><span>Pedidos aguardando entregador</span></div>
      <div class="mini-kpi"><strong>${data.metrics.in_delivery}</strong><span>Pedidos em rota</span></div>
      <div class="mini-kpi"><strong>${data.metrics.delivered}</strong><span>Pedidos concluidos</span></div>
    `;
  }

  renderTracker("order-state-track", latest?.status || "accepted");
  setRefreshNote("home-refresh-note", `Painel sincronizado as ${formatClock()}`);
  setRefreshNote(
    "home-ops-refresh",
    latest
      ? `Pedido #${latest.id} em destaque atualizado as ${formatClock()}`
      : `Sem pedidos recentes ate ${formatClock()}`
  );
}

async function refreshDashboard() {
  try {
    renderSummary(await api("/demo/summary"));
  } catch (error) {
    setStatus("seed-status", error.message, true);
  }
}

async function seedDemo() {
  try {
    const data = await api("/demo/seed", { method: "POST" });
    setStatus(
      "seed-status",
      `${data.message}\nStore ID: ${data.store_id || 1}\nProdutos demo: ${(data.product_ids || []).join(", ") || "1, 2, 3"}\nPedido demo: ${data.demo_order_id || 1}`
    );
    renderSummary(data);
  } catch (error) {
    setStatus("seed-status", error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await refreshSessionStatus("session-user-role", "token-box");
  await refreshDashboard();
  window.setInterval(refreshDashboard, 20000);
});
