# ADWRNG2

Painel web para monitorar **Avisos de Aeródromo (AD WRNG)** da REDEMET para o aeródromo **SBMQ**.

## Escopo Atual

- Monitoramento por ICAO, com `SBMQ` como padrão.
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

- `REDEMET_API_KEY`
- `AISWEB_API_KEY`
- `AISWEB_API_PASS`

Em produção na Vercel, configure essas variáveis no painel do projeto. Não use o
prefixo `VITE_`: ele torna o valor público no bundle do navegador.

## Desenvolvimento

```sh
npm run dev
```

## Build

```sh
npm run build
npm run preview
```
