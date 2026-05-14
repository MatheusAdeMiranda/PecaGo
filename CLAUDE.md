# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PecaGo é um marketplace de autopeças com entrega sob demanda. O fluxo central: lojas publicam estoque → clientes/mecânicos buscam e fazem pedidos → entregadores assumem e concluem a corrida. Há quatro papéis operacionais: `store`, `customer`, `mechanic`, `delivery`.

## Commands

### Backend

```powershell
# Setup rápido (cria .venv, instala deps, gera .env com SQLite, sobe API)
.\start_local.ps1

# Rodar manualmente após setup
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\uvicorn app.main:app --reload

# Gerar nova migration após alterar models
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "descricao"

# Testes (todos)
.\.venv\Scripts\python.exe -m unittest discover -s tests -v

# Teste único
.\.venv\Scripts\python.exe -m unittest tests.test_api_flows.ApiFlowTests.test_review_flow_allows_customer_to_rate_store_and_delivery -v
```

### Frontend

```powershell
cd frontend
npm install
npm run dev       # dev server com proxy para http://127.0.0.1:8000
npm run build     # gera frontend/dist servido pelo FastAPI
npm run lint
```

### Docker

```bash
docker compose up --build
```

> O container só serve o frontend React se `frontend/dist` existir no momento do `docker build`. Caso contrário usa o fallback em `app/static/`.

## Architecture

### Backend (FastAPI + SQLAlchemy)

- **`app/main.py`** — inicializa app, CORS, monta routers, serve frontend. O FastAPI serve `frontend/dist` se existir; senão cai para `app/static/` (fallback legado). Registra middlewares na ordem: `SlowAPIMiddleware` → `RequestLoggingMiddleware` → `CORSMiddleware`.
- **`app/models.py`** — oito modelos ORM: `User`, `Store`, `Product`, `Order`, `OrderItem`, `Notification`, `Review`, `RefreshToken`. `Order` tem dois FKs para `User` (`customer_id` e `delivery_person_id`), exigindo `foreign_keys=` explícito nos relacionamentos.
- **`app/schemas.py`** — schemas Pydantic para request/response. Importa enums diretamente de `app/models`.
- **`app/deps.py`** — `get_db` (session factory), `get_current_user` (JWT via header `Authorization: Bearer`), `require_roles(*roles)` (factory de dependência por papel).
- **`app/core/config.py`** — settings via `pydantic-settings`; lê `.env`. Variáveis principais:
  - `DATABASE_URL`, `SECRET_KEY`
  - `ACCESS_TOKEN_EXPIRE_MINUTES` (30 min), `REFRESH_TOKEN_EXPIRE_DAYS` (30 dias)
  - `ALLOWED_ORIGINS` (lista JSON, default `["*"]`)
  - `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `APP_BASE_URL`
  - `STORAGE_BACKEND` (`local` | `s3`), `UPLOAD_DIR`, `S3_BUCKET` e demais vars S3
- **`app/core/limiter.py`** — instância `slowapi.Limiter` compartilhada. Limite global: 200 req/min por IP. Limites estritos via decorator: login (10/min), refresh (20/min), demo/seed (5/min). Em testes, chamar `limiter._storage.reset()` no `setUp` para evitar 429 entre casos.
- **`app/core/logging.py`** — configura `structlog`; output legível em dev (detectado por SQLite URL), JSON em produção. `RequestLoggingMiddleware` injeta `request_id` por requisição e loga erros 4xx/5xx. Eventos explícitos: `login_success`, `login_failed`, `order_created`, `order_status_changed`.
- **`app/core/storage.py`** — `upload_image(file)` despacha para `save_local` (serve via `/uploads`) ou `save_s3` (boto3). Valida MIME (JPEG/PNG/WebP) e tamanho máximo de 5 MB.
- **`app/routers/`** — um módulo por domínio: `auth`, `stores`, `products`, `orders`, `deliveries`, `notifications`, `payment`, `reviews`, `demo`.

### Lógica de pedidos (`app/routers/orders.py`)

- Itens duplicados no mesmo pedido são normalizados antes da validação de estoque (`normalize_order_items`).
- Transições de status são controladas por papel via tabelas de adjacência: `STORE_ALLOWED_TRANSITIONS` e `DELIVERY_ALLOWED_TRANSITIONS`. A store move `pending→accepted→preparing`; a delivery move `in_delivery→delivered`. Cancelamento é permitido em cada etapa para os respectivos papéis.
- **Gate de pagamento**: a store só pode mover `pending→accepted` quando `payment_status == approved`.
- Quando um delivery assume via `POST /deliveries/assign`, o status salta para `in_delivery` automaticamente.
- `_dispatch_status_notifications()` dispara notificações para cliente e loja a cada transição.

### Notificações (`app/routers/notifications.py`)

- Helper `notify(db, *, user_id, notification_type, order_id)` cria registros na tabela `notifications`.
- Chamado em: criação de pedido, todas as transições de status e eventos de pagamento.
- Endpoints: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all`.

### Pagamento (`app/routers/payment.py`)

- `POST /orders/{id}/payment` — cria preferência no Mercado Pago e retorna `checkout_url`; reutiliza URL existente se ainda pendente.
- `POST /webhooks/mercadopago` — valida assinatura HMAC (`MERCADOPAGO_WEBHOOK_SECRET`), consulta pagamento na API do MP, mapeia status para `PaymentStatus` e dispara notificações.
- Usa `sandbox_init_point` em sandbox, `init_point` em produção.

### Rastreamento ao vivo (`app/routers/deliveries.py`)

- `PATCH /deliveries/{order_id}/location` — entregador envia `latitude`/`longitude`; atualiza `delivery_current_latitude`, `delivery_current_longitude`, `delivery_location_updated_at` no pedido.
- `GET /deliveries/{order_id}/track` — snapshot REST da posição atual (carga inicial / polling fallback).
- `GET /deliveries/{order_id}/track/stream` — SSE via `StreamingResponse`; relê o banco a cada 4 s com `db.expire_all()` e encerra automaticamente quando o status sai de `in_delivery`. Nota: funciona em processo único; em múltiplos workers usar Redis Pub/Sub.

### Avaliações (`app/routers/reviews.py`)

- `POST /reviews` — disponível para `customer` e `mechanic`; exige pedido com status `delivered` e bloqueia duplicatas por `(order_id, reviewer_id, reviewee_type)`.
- Detecta automaticamente o `reviewee_id`: para `reviewee_type=store` usa `store.owner_id`; para `delivery` usa `order.delivery_person_id`.
- `GET /reviews/store/{store_id}` e `GET /reviews/delivery/{user_id}` — retornam `RatingSummary` com `avg_rating`, `review_count` e lista de reviews. Endpoints públicos (sem autenticação).

### Frontend (React 19 + Vite + shadcn/ui)

- Duas rotas: `/` (home institucional) e `/console` (console operacional por papel).
- `SessionProvider` (`src/components/session-provider.tsx`) gerencia JWT no `localStorage` e expõe contexto de usuário.
- Proxy Vite (`vite.config.ts`) redireciona chamadas de API para `http://127.0.0.1:8000` em dev. Em produção o FastAPI serve diretamente o `dist/`.
- Componentes notáveis:
  - `NotificationBell` — polling a cada 15 s, badge com contagem, dropdown com lista.
  - `PaymentBadge` — badge com cor por `PaymentStatus`.
  - `TrackingMap` — mapa Leaflet + OpenStreetMap; SSE autenticado via `fetch` + `ReadableStream` (EventSource nativo não suporta headers); ícones emoji 🛵/📍; `AbortController` para cleanup.
  - `StarPicker` / `StarDisplay` — seletor interativo e exibição de média de avaliações.

### Banco de dados e Migrations

- Schema gerenciado por **Alembic** (`alembic/`). O startup roda `alembic upgrade head` automaticamente via `_run_migrations()` em `app/main.py`.
- Para gerar nova migration após alterar models: `alembic revision --autogenerate -m "descricao"`. Sempre revisar o arquivo gerado antes de commitar.
- Histórico atual de migrations:
  1. `f12aece302bc` — initial_schema
  2. `a4d45372d03b` — add_refresh_tokens
  3. `66bd17bc64f1` — add_product_image_url
  4. `0d803a7d541f` — add_notifications
  5. `fba817fe6841` — add_payment_fields
  6. `b601bc70938f` — add_delivery_location
  7. `0a2d4e860a3e` — add_reviews
- Os testes usam SQLite em arquivo temporário (`test_autoparts_mvp.db`), sobrescrevendo `DATABASE_URL` via `os.environ` antes dos imports da app. O Alembic roda sobre esse banco temporário durante os testes.

### Autenticação

- **Access token** (JWT, 30 min) + **Refresh token** (opaco, hash bcrypt, 30 dias) emitidos juntos no login.
- Refresh tokens são armazenados na tabela `refresh_tokens` com hash — nunca o valor bruto. `POST /auth/refresh` troca o token e revoga o anterior (rotação). `POST /auth/logout` revoga o token sem emitir novo.
- O `get_current_user` em `app/deps.py` só valida access tokens. Refresh tokens são validados manualmente em `app/routers/auth.py`.

### Demo

- `POST /demo/seed` — popula banco com loja, produtos, usuários demo e dois pedidos. Credenciais: `store@demo.com`, `customer@demo.com`, `delivery@demo.com` (senha `123456`).
- `GET /demo/summary` — resumo operacional (contagens e status).
