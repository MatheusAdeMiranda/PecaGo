function fillStoreLogin() {
  fillLogin("store@demo.com");
}

function fillCustomerLogin() {
  fillLogin("customer@demo.com");
}

function fillDeliveryLogin() {
  fillLogin("delivery@demo.com");
}

function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function primeOrderFields({ storeId, productId, orderId, statusValue, scrollTarget } = {}) {
  if (storeId) {
    const storeInput = document.getElementById("order-store-id");
    if (storeInput) storeInput.value = storeId;
  }

  if (productId) {
    const productInput = document.getElementById("order-product-id");
    if (productInput) productInput.value = productId;
  }

  if (orderId) {
    const assignInput = document.getElementById("assign-order-id");
    const statusOrderInput = document.getElementById("status-order-id");
    if (assignInput) assignInput.value = orderId;
    if (statusOrderInput) statusOrderInput.value = orderId;
  }

  if (statusValue) {
    const statusSelect = document.getElementById("status-value");
    if (statusSelect) statusSelect.value = statusValue;
  }

  if (scrollTarget) scrollToSection(scrollTarget);
}

function renderConsoleTracker(status) {
  const root = document.getElementById("console-status-track");
  if (!root) return;

  const steps = [
    ["accepted", "Pedido aceito", "Loja confirmou o pedido."],
    ["preparing", "Separacao", "Itens sendo preparados para despacho."],
    ["in_delivery", "Em rota", "Entrega em andamento."],
    ["delivered", "Concluido", "Entrega finalizada."],
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

function renderConsoleSnapshot(data) {
  const latest = data.recent_orders[0];
  const focus = document.getElementById("console-order-focus");
  if (focus) {
    focus.innerHTML = latest
      ? `
        <strong>Pedido #${latest.id}</strong>
        <div class="badge-row">
          ${statusBadge(latest.status)}
          <span class="badge badge-accent">${currency(latest.total_amount)}</span>
        </div>
        Loja: ${latest.store_name}<br />
        Cliente: ${latest.customer_name}<br />
        Endereco: ${latest.delivery_address}
        <div class="card-actions">
          <button class="ghost-button" type="button" data-action="focus-order" data-order-id="${latest.id}" data-status="in_delivery">Preparar status</button>
        </div>
      `
      : "Nenhum pedido carregado ainda.";
  }

  const miniKpis = document.getElementById("console-mini-kpis");
  if (miniKpis) {
    miniKpis.innerHTML = `
      <div class="mini-kpi"><strong>${data.metrics.orders}</strong><span>Pedidos no MVP</span></div>
      <div class="mini-kpi"><strong>${data.metrics.available_deliveries}</strong><span>Aguardando entregador</span></div>
      <div class="mini-kpi"><strong>${data.metrics.in_delivery}</strong><span>Em rota</span></div>
    `;
  }

  renderConsoleTracker(latest?.status || "accepted");
  setRefreshNote(
    "console-refresh-note",
    latest
      ? `Snapshot sincronizado as ${formatClock()} com pedido #${latest.id}`
      : `Snapshot sincronizado as ${formatClock()}`
  );
}

async function refreshConsoleSnapshot() {
  try {
    renderConsoleSnapshot(await api("/demo/summary"));
  } catch (_) {
    setRefreshNote("console-refresh-note", "Snapshot temporariamente indisponivel");
  }
}

async function seedDemo() {
  try {
    const data = await api("/demo/seed", { method: "POST" });
    setStatus(
      "seed-status",
      `${data.message}\nStore ID: ${data.store_id || 1}\nProdutos demo: ${(data.product_ids || []).join(", ") || "1, 2, 3"}\nPedido demo: ${data.demo_order_id || 1}`
    );
    renderConsoleSnapshot(data);
    primeOrderFields({
      storeId: data.store_id || 1,
      productId: data.product_ids?.[0] || 1,
      orderId: data.demo_order_id || 1,
      statusValue: "preparing",
    });
  } catch (error) {
    setStatus("seed-status", error.message, true);
  }
}

async function registerUser() {
  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("register-name").value,
        email: document.getElementById("register-email").value,
        password: document.getElementById("register-password").value,
        role: document.getElementById("register-role").value,
      }),
    });
    setStatus("register-status", `Usuario criado com ID ${data.id}`);
    await refreshConsoleSnapshot();
  } catch (error) {
    setStatus("register-status", error.message, true);
  }
}

async function login() {
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("login-email").value,
        password: document.getElementById("login-password").value,
      }),
    });
    setToken(data.access_token);
    setStatus("login-status", "Login realizado com sucesso.");
    await refreshSessionStatus("session-user-role", "token-box");
    await refreshConsoleSnapshot();
  } catch (error) {
    setStatus("login-status", error.message, true);
  }
}

async function createStore() {
  try {
    const data = await api("/stores", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("store-name").value,
        address: document.getElementById("store-address").value,
        city: document.getElementById("store-city").value,
        latitude: Number(document.getElementById("store-lat").value),
        longitude: Number(document.getElementById("store-lng").value),
      }),
    });
    setStatus("store-status", `Loja criada com ID ${data.id}`);
    await refreshConsoleSnapshot();
  } catch (error) {
    setStatus("store-status", error.message, true);
  }
}

async function createProduct() {
  try {
    const data = await api("/products", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("product-name").value,
        sku: document.getElementById("product-sku").value,
        brand: document.getElementById("product-brand").value,
        vehicle_model: document.getElementById("product-vehicle").value,
        price: Number(document.getElementById("product-price").value),
        stock: Number(document.getElementById("product-stock").value),
      }),
    });
    setStatus("product-status", `Produto criado com ID ${data.id}`);
    await refreshConsoleSnapshot();
  } catch (error) {
    setStatus("product-status", error.message, true);
  }
}

async function searchProducts() {
  try {
    const q = encodeURIComponent(document.getElementById("search-query").value);
    const city = encodeURIComponent(document.getElementById("search-city").value);
    const data = await api(`/products/search?q=${q}&city=${city}`);
    renderList(
      "search-results",
      data.map((item) =>
        makeCard(`
          <strong>${item.name}</strong>
          <div class="badge-row">
            <span class="badge badge-info">Loja ${item.store_id}</span>
            <span class="badge badge-info">Produto ${item.id}</span>
            <span class="badge badge-accent">${currency(item.price)}</span>
          </div>
          Loja: ${item.store_name}<br />
          Estoque: ${item.stock} | Marca: ${item.brand || "-"} | Modelo: ${item.vehicle_model || "-"}
          <div class="card-actions">
            <button class="ghost-button" type="button" data-action="fill-order" data-store-id="${item.store_id}" data-product-id="${item.id}">Usar no pedido</button>
          </div>
        `)
      )
    );
  } catch (error) {
    renderList("search-results", [makeCard(error.message)]);
  }
}

async function createOrder() {
  try {
    const data = await api("/orders", {
      method: "POST",
      body: JSON.stringify({
        store_id: Number(document.getElementById("order-store-id").value),
        delivery_address: document.getElementById("order-address").value,
        items: [
          {
            product_id: Number(document.getElementById("order-product-id").value),
            quantity: Number(document.getElementById("order-quantity").value),
          },
        ],
      }),
    });
    setStatus("order-status", `Pedido #${data.id} criado. Total: ${currency(data.total_amount)}`);
    primeOrderFields({ orderId: data.id, statusValue: "accepted" });
    await refreshConsoleSnapshot();
  } catch (error) {
    setStatus("order-status", error.message, true);
  }
}

async function loadMyOrders() {
  try {
    const data = await api("/orders/my");
    renderList(
      "orders-results",
      data.map((order) =>
        makeCard(`
          <strong>Pedido #${order.id}</strong>
          <div class="badge-row">
            ${statusBadge(order.status)}
            <span class="badge badge-accent">${currency(order.total_amount)}</span>
          </div>
          Loja ID: ${order.store_id}<br />
          Entrega: ${order.delivery_address}
          <div class="card-actions">
            <button class="ghost-button" type="button" data-action="focus-order" data-order-id="${order.id}" data-status="preparing">Usar no tracking</button>
          </div>
        `)
      )
    );
  } catch (error) {
    renderList("orders-results", [makeCard(error.message)]);
  }
}

async function loadAvailableDeliveries() {
  try {
    const data = await api("/deliveries/available");
    renderList(
      "delivery-results",
      data.map((order) =>
        makeCard(`
          <strong>Pedido #${order.id}</strong>
          <div class="badge-row">
            ${statusBadge(order.status)}
            <span class="badge badge-accent">${currency(order.total_amount)}</span>
          </div>
          Cliente ID: ${order.customer_id}<br />
          Endereco: ${order.delivery_address}
          <div class="card-actions">
            <button class="ghost-button" type="button" data-action="assign-order" data-order-id="${order.id}">Preparar atribuicao</button>
          </div>
        `)
      )
    );
  } catch (error) {
    renderList("delivery-results", [makeCard(error.message)]);
  }
}

async function assignDelivery() {
  try {
    const data = await api("/deliveries/assign", {
      method: "POST",
      body: JSON.stringify({
        order_id: Number(document.getElementById("assign-order-id").value),
      }),
    });
    setStatus("delivery-status", `Pedido #${data.id} assumido com sucesso.`);
    primeOrderFields({ orderId: data.id, statusValue: "in_delivery", scrollTarget: "delivery" });
    await refreshConsoleSnapshot();
  } catch (error) {
    setStatus("delivery-status", error.message, true);
  }
}

async function updateOrderStatus() {
  try {
    const orderId = Number(document.getElementById("status-order-id").value);
    const statusValue = document.getElementById("status-value").value;
    const data = await api(`/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: statusValue }),
    });
    setStatus("status-update-result", `Pedido #${data.id} agora esta em ${data.status}.`);
    await refreshConsoleSnapshot();
  } catch (error) {
    setStatus("status-update-result", error.message, true);
  }
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  if (action === "fill-order") {
    primeOrderFields({
      storeId: Number(trigger.dataset.storeId),
      productId: Number(trigger.dataset.productId),
      scrollTarget: "customer",
    });
  }

  if (action === "focus-order") {
    primeOrderFields({
      orderId: Number(trigger.dataset.orderId),
      statusValue: trigger.dataset.status || "preparing",
      scrollTarget: "delivery",
    });
  }

  if (action === "assign-order") {
    primeOrderFields({
      orderId: Number(trigger.dataset.orderId),
      statusValue: "in_delivery",
      scrollTarget: "delivery",
    });
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  await refreshSessionStatus("session-user-role", "token-box");
  await refreshConsoleSnapshot();
  setupSectionSpy();
  window.setInterval(refreshConsoleSnapshot, 15000);
});
