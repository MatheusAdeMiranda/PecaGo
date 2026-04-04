# Frontend PecaGo

Frontend React do PecaGo, usado para a home institucional e para o console operacional da demo.

## Stack

- React 19
- Vite
- TypeScript
- Tailwind CSS v4
- `shadcn/ui`

## Desenvolvimento

O Vite usa proxy para o backend em `http://127.0.0.1:8000`, entao a API precisa estar rodando localmente durante o desenvolvimento.

```powershell
cd frontend
npm install
npm run dev
```

## Qualidade

```powershell
cd frontend
npm run lint
npm run build
```

## Integracao com o backend

- em desenvolvimento, o frontend consome a API pelo proxy configurado em `vite.config.ts`
- em producao local, o build em `frontend/dist` e servido pelo FastAPI nas rotas `/` e `/console`
- se `frontend/dist` nao existir, a API usa `app/static/` como fallback
