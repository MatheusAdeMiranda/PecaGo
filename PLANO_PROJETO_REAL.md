# PecaGo — Plano de Evolução para Projeto Real

Você está trabalhando no PecaGo, um marketplace de autopeças com entrega sob demanda. O projeto já tem um MVP funcional com FastAPI + React. O objetivo desta sessão é avançar em direção a um produto real, seguindo as fases abaixo em ordem de prioridade.

Leia o CLAUDE.md antes de começar qualquer tarefa.

---

## Fase 1 — Fundação Técnica (pré-requisito para tudo)

Nada nesta fase é visível para o usuário final, mas bloqueia qualquer evolução segura do projeto.

### 1.1 Migrations com Alembic

**Por que:** Hoje o schema é criado via `Base.metadata.create_all()`. O primeiro `ALTER TABLE` em produção vai exigir downtime ou perda de dados.

Tarefas:
- [ ] Instalar `alembic` e adicionar ao `requirements.txt`
- [ ] Inicializar com `alembic init alembic/`
- [ ] Configurar `alembic/env.py` para usar `DATABASE_URL` do `settings` e importar `Base` de `app.models`
- [ ] Gerar a migration inicial a partir dos models existentes
- [ ] Remover `Base.metadata.create_all()` de `app/main.py` — o startup não deve mais criar tabelas
- [ ] Atualizar `start_local.ps1` para rodar `alembic upgrade head` antes de subir a API
- [ ] Atualizar o `Dockerfile` para rodar migrations antes de iniciar o servidor

### 1.2 Refresh Tokens

**Por que:** O token atual expira em 720 min (12h) sem renovação. Ou o usuário cai fora frequentemente ou o token tem vida longa demais — nem um nem outro é correto.

Tarefas:
- [ ] Adicionar coluna `refresh_tokens` como tabela própria: `id`, `user_id`, `token_hash`, `expires_at`, `revoked`
- [ ] Gerar migration para a nova tabela
- [ ] Criar endpoint `POST /auth/refresh` que aceita refresh token e retorna novo access token
- [ ] Criar endpoint `POST /auth/logout` que revoga o refresh token
- [ ] Reduzir `ACCESS_TOKEN_EXPIRE_MINUTES` para 30 min
- [ ] Atualizar `SessionProvider` no frontend para fazer refresh automático antes de expirar

### 1.3 Rate Limiting

**Por que:** A API hoje aceita qualquer volume de requisições sem restrição. Login por força bruta e abuso de `/demo/seed` são riscos imediatos.

Tarefas:
- [ ] Instalar `slowapi` e adicionar ao `requirements.txt`
- [ ] Aplicar limite global (ex: 100 req/min por IP)
- [ ] Aplicar limite estrito em `POST /auth/login` (ex: 10 req/min por IP)
- [ ] Aplicar limite em `POST /demo/seed` (ex: 5 req/min por IP)

### 1.4 CORS em Produção

**Por que:** `allow_origins=["*"]` é aceitável para MVP, inaceitável para produção.

Tarefas:
- [ ] Adicionar `ALLOWED_ORIGINS` ao `settings` (variável de ambiente, default `*`)
- [ ] Substituir `allow_origins=["*"]` por `allow_origins=settings.allowed_origins`
- [ ] Documentar no `.env.example`

### 1.5 Logs Estruturados

**Por que:** Sem logs, debugar em produção é adivinhar.

Tarefas:
- [ ] Instalar `structlog`
- [ ] Configurar output JSON em produção, legível em desenvolvimento
- [ ] Logar criação de pedido, mudanças de status, erros de autenticação e erros 5xx
- [ ] Adicionar `request_id` a cada requisição via middleware

---

## Fase 2 — Produto (o que transforma o MVP em ferramenta útil)

### 2.1 Upload de Imagem de Produto

**Por que:** Nenhum marketplace funciona com produtos só de texto. É o gap mais visível.

Tarefas:
- [ ] Definir estratégia de storage: local (dev) ou S3-compatible (produção) via `STORAGE_BACKEND` no settings
- [ ] Instalar `python-multipart` para upload via FastAPI
- [ ] Criar endpoint `POST /products/{product_id}/image`
- [ ] Adicionar coluna `image_url` em `Product` e gerar migration
- [ ] Exibir imagem no card de produto no frontend

### 2.2 Sistema de Notificações

**Por que:** Hoje o cliente não sabe quando o pedido foi aceito, preparado ou saiu para entrega — tem que ficar atualizando a página.

Tarefas:
- [ ] Modelar tabela `notifications`: `id`, `user_id`, `type`, `payload` (JSON), `read`, `created_at`
- [ ] Gerar migration
- [ ] Disparar notificação a cada transição de status do pedido
- [ ] Criar endpoint `GET /notifications` e `PATCH /notifications/{id}/read`
- [ ] Adicionar sino de notificações no header do frontend com polling (a cada 15s) ou WebSocket

### 2.3 Pagamento com Mercado Pago

**Por que:** Sem pagamento, não é um negócio — é um demo. Mercado Pago é o gateway mais usado no Brasil.

Tarefas:
- [ ] Criar conta de desenvolvedor no Mercado Pago e configurar credenciais de sandbox
- [ ] Instalar SDK `mercadopago`
- [ ] Adicionar coluna `payment_status` e `payment_id` (externo) em `Order` e gerar migration
- [ ] Criar endpoint `POST /orders/{order_id}/payment` — gera preference e retorna checkout URL
- [ ] Criar endpoint `POST /webhooks/mercadopago` — recebe notificações de pagamento e atualiza `payment_status`
- [ ] Bloquear transição `pending→accepted` na loja enquanto `payment_status != approved`
- [ ] Exibir estado de pagamento no console do cliente

### 2.4 Rastreamento em Tempo Real

**Por que:** A entrega é o coração da proposta de valor — o cliente precisa ver onde está a peça.

Tarefas:
- [ ] Adicionar endpoint `PATCH /deliveries/{order_id}/location` — entregador envia lat/lng periodicamente
- [ ] Implementar WebSocket ou SSE em `GET /orders/{order_id}/track` para o cliente receber atualizações
- [ ] Adicionar mapa simples no frontend (Leaflet.js ou Google Maps) mostrando posição do entregador

### 2.5 Avaliações

**Por que:** Confiança no marketplace depende de reputação visível.

Tarefas:
- [ ] Modelar tabela `reviews`: `id`, `order_id`, `author_id`, `target_id`, `target_type` (store/delivery), `rating` (1-5), `comment`, `created_at`
- [ ] Gerar migration
- [ ] Criar endpoints `POST /reviews` e `GET /stores/{id}/reviews`
- [ ] Exibir rating médio no card da loja
- [ ] Permitir avaliação apenas após status `delivered`

---

## Fase 3 — Infraestrutura (antes de escalar)

### 3.1 CI/CD com GitHub Actions

Tarefas:
- [ ] Criar `.github/workflows/ci.yml`:
  - roda testes Python em cada push/PR
  - roda `npm run lint` e `npm run build` no frontend
  - falha o PR se qualquer etapa falhar
- [ ] Criar `.github/workflows/deploy.yml`:
  - dispara em push para `main`
  - faz build da imagem Docker
  - faz push para registry (GitHub Packages ou Docker Hub)
  - faz deploy no provedor escolhido (Railway, Render, Fly.io)

### 3.2 Ambientes

Tarefas:
- [ ] Separar configuração em três perfis: `development`, `staging`, `production`
- [ ] Criar arquivo `.env.staging` e `.env.production` (não versionar — só o `.env.example`)
- [ ] Garantir que `DEBUG=False` desativa `/docs` e `/redoc` em produção
- [ ] Configurar banco PostgreSQL separado para staging

### 3.3 Deploy Inicial

Tarefas:
- [ ] Escolher provedor (Railway é o mais simples para FastAPI + PostgreSQL)
- [ ] Configurar variáveis de ambiente no provedor
- [ ] Garantir que migrations rodam automaticamente no startup do container
- [ ] Configurar domínio customizado

### 3.4 Monitoramento

Tarefas:
- [ ] Configurar UptimeRobot ou BetterStack no endpoint `/health`
- [ ] Configurar alerta por email/Slack em caso de downtime
- [ ] Adicionar Sentry para captura de erros do backend (instalar `sentry-sdk[fastapi]`)

---

## Débito Técnico Conhecido

Estes itens não bloqueiam o projeto mas devem ser resolvidos antes de escalar:

- `app/static/` (frontend legado) pode ser removido após todas as páginas estarem no React
- `frontend/dist` não é versionado — o CI precisa fazer o build antes do deploy
- Busca de produto é por string livre; idealmente integrar um catálogo de veículos estruturado (marca/modelo/ano) para compatibilidade precisa
- Não há paginação nos endpoints de lista (`GET /products`, `GET /orders/my`) — vai quebrar com volume real

---

## Ordem Recomendada de Execução

```
1.1 Alembic → 1.2 Refresh Tokens → 1.3 Rate Limiting → 1.4 CORS → 1.5 Logs
     ↓
2.1 Imagem de Produto → 2.2 Notificações → 2.3 Pagamento → 2.4 Rastreamento → 2.5 Avaliações
     ↓
3.1 CI/CD → 3.2 Ambientes → 3.3 Deploy → 3.4 Monitoramento
```

Não pule a Fase 1. Qualquer feature da Fase 2 construída sem migrations vai exigir retrabalho doloroso.
