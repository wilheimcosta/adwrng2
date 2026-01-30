# ADWRNG2

ADWRNG2 é um painel web para monitorar **Avisos de Aeródromo (AD WRNG)** da REDEMET.
Você pode cadastrar aeródromos (ICAO) favoritos, acompanhar avisos ativos e consultar o histórico.

## Principais recursos

- Monitoramento por ICAO com atualização periódica.
- Registro de avisos novos (sem duplicação) e expiração automática por validade.
- Dashboard com métricas e avisos recentes.
- Histórico completo e filtros de status.

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn-ui
- Supabase (Banco + Edge Functions)

## Configuração

1. Instale dependências:

```sh
npm i
```

2. Copie o arquivo de ambiente:

```sh
cp .env.example .env
```

3. Preencha as variáveis no `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## Desenvolvimento

```sh
npm run dev
```

## Testes

```sh
npm test
```

## Backend (Supabase)

- Funções Edge: `supabase/functions/redemet-proxy` e `supabase/functions/redemet-status-proxy`
- Migrações: `supabase/migrations`

As Edge Functions fazem proxy seguro para a API da REDEMET usando `REDEMET_API_KEY` no ambiente do Supabase.
