# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PecaGo é um marketplace de autopeças com entrega sob demanda. O fluxo central: lojas publicam estoque → clientes/mecânicos buscam e pedidos → entregadores assumem e concluem a corrida. Há quatro papéis operacionais: `store`, `customer`, `mechanic`, `delivery`.

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
.\.venv\Scripts\python.exe -m unittest tests.test_api_flows.ApiFlowTests.test_status_flow_blocks_skips_and_hides_assigned_orders -v
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

- **`app/main.py`** — inicializa app, CORS, monta routers, serve frontend. O FastAPI serve `frontend/dist` se existir; senão cai para `app/static/` (fallback legado).
- **`app/models.py`** — cinco modelos ORM: `User`, `Store`, `Product`, `Order`, `OrderItem`. `Order` tem dois FKs para `User` (`customer_id` e `delivery_person_id`), exigindo `foreign_keys=` explícito nos relacionamentos.
- **`app/schemas.py`** — schemas Pydantic para request/response.
- **`app/deps.py`** — `get_db` (session factory), `get_current_user` (JWT via header `Authorization: Bearer`), `require_roles(*roles)` (factory de dependência por papel).
- **`app/core/config.py`** — settings via `pydantic-settings`; lê `.env`. Variáveis: `DATABASE_URL`, `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` (30 min), `REFRESH_TOKEN_EXPIRE_DAYS` (30 dias), `ALLOWED_ORIGINS` (lista JSON, default `["*"]`).
- **`app/core/limiter.py`** — instância `slowapi.Limiter` compartilhada por todos os routers. Limite global: 200 req/min por IP. Limites estritos aplicados via decorator: login (10/min), refresh (20/min), demo/seed (5/min).
- **`app/core/logging.py`** — configura `structlog`; output legível em dev (SQLite), JSON em produção. Middleware `RequestLoggingMiddleware` injeta `request_id` por requisição e loga erros 4xx/5xx. Eventos explícitos: `login_success`, `login_failed`, `order_created`, `order_status_changed`.
- **`app/routers/`** — um módulo por domínio: `auth`, `stores`, `products`, `orders`, `deliveries`, `demo`.

### Lógica de pedidos (`app/routers/orders.py`)

- Itens duplicados no mesmo pedido são normalizados antes da validação de estoque (`normalize_order_items`).
- Transições de status são controladas por papel via tabelas de adjacência: `STORE_ALLOWED_TRANSITIONS` e `DELIVERY_ALLOWED_TRANSITIONS`. A store move `pending→accepted→preparing`; a delivery move `in_delivery→delivered`. Cancelamento é permitido em cada etapa para os respectivos papéis.
- Quando um delivery assume via `POST /deliveries/assign`, o status salta para `in_delivery` automaticamente.

### Frontend (React 19 + Vite + shadcn/ui)

- Duas rotas: `/` (home institucional) e `/console` (console operacional por papel).
- `SessionProvider` (`src/components/session-provider.tsx`) gerencia JWT no `localStorage` e expõe contexto de usuário.
- Proxy Vite (`vite.config.ts`) redireciona chamadas de API para `http://127.0.0.1:8000` em dev. Em produção o FastAPI serve diretamente o `dist/`.

### Banco de dados e Migrations

- Schema gerenciado por **Alembic** (`alembic/`). O startup roda `alembic upgrade head` automaticamente via `_run_migrations()` em `app/main.py`.
- Para gerar nova migration após alterar models: `alembic revision --autogenerate -m "descricao"`. Sempre revisar o arquivo gerado antes de commitar.
- Os testes usam SQLite em arquivo temporário (`test_autoparts_mvp.db`), sobrescrevendo `DATABASE_URL` via `os.environ` antes dos imports da app. O Alembic roda sobre esse banco temporário durante os testes.

### Autenticação

- **Access token** (JWT, 30 min) + **Refresh token** (opaco, hash bcrypt, 30 dias) emitidos juntos no login.
- Refresh tokens são armazenados na tabela `refresh_tokens` com hash — nunca o valor bruto. `POST /auth/refresh` troca o token e revoga o anterior (rotação). `POST /auth/logout` revoga o token sem emitir novo.
- O `get_current_user` em `app/deps.py` só valida access tokens. Refresh tokens são validados manualmente em `app/routers/auth.py`.

### Demo

- `POST /demo/seed` — popula banco com loja, produtos, usuários demo e dois pedidos. Credenciais: `store@demo.com`, `customer@demo.com`, `delivery@demo.com` (senha `123456`).
- `GET /demo/summary` — resumo operacional (contagens e status).
