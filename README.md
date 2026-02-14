# ADWRNG2

Painel web para monitorar **Avisos de Aeródromo (AD WRNG)** da REDEMET para o aeródromo **SBMQ**.

## Escopo Atual

- Monitoramento fixo em `SBMQ`.
- Atualização periódica dos avisos.
- Sem Supabase.
- Sem histórico persistido.

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn-ui

## Configuração

1. Instale dependências:

```sh
npm i
```

2. Copie o arquivo de ambiente:

```sh
cp .env.example .env
```

3. Preencha no `.env`:

- `VITE_REDEMET_API_KEY`

## Desenvolvimento

```sh
npm run dev
```

## Build

```sh
npm run build
npm run preview
```
