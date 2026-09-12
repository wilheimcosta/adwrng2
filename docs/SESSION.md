# SESSION — Estado do projeto AD WRNG Monitor

> Data: 2026-09-12 · Branch atual: `agent/history-redemet-down` · Commit: `b97773a` · PR #17 (OPEN) · Produção: https://wilheim.vercel.app (200 OK, ainda em `main`/`5d6cce4`)

Gerenciador de pacotes em uso: **npm** (há `pnpm-lock.yaml` e `package-lock.json` — ver Problemas conhecidos).

---

## 1. RESUMO DO PRODUTO

**AeroWatch / AD WRNG Monitor** — dashboard de monitoramento meteorológico e de avisos de aeródromo (REDEMET), com:
- METAR/SPECI, SYNOP e TAF em tempo real por ICAO;
- painel History (últimas 24h) espelhando METAR e SYNOP;
- alerta de atraso de publicação (watch) em overlay de tela cheia com som;
- alarme de AD WRNG ativo com silêncio/reconhecimento;
- fallback METAR e TAF via **AVIATIONWEATHER** (aviationweather.gov) quando a REDEMET está fora do ar — inclusive o History (24h via endpoint raw-text);
- seleção automática de fonte: REDEMET é a fonte primária; quando offline, a AVIATIONWEATHER alimenta METAR/TAF atuais, flight rule e History.

Stack: React + TypeScript + Vite + shadcn/ui + Tailwind + TanStack Query + React Router. Deploy: Vercel (serverless functions em `api/`).

---

## 2. O QUE FOI IMPLEMENTADO (sessão atual)

Branch `agent/history-redemet-down` — PR #17 (OPEN, base `main`). Commits da sessão:

- `4487e99` — usar AVIATIONWEATHER como fonte primária quando a REDEMET está offline (`redemetOffline`), com `flightRule`/`reportLine`/`tafLine` preferindo a AVIATIONWEATHER nesse caso.
- `7d983e6` — piscar apenas o pill da fonte primária ao vivo (removido o pill `PRIMARY`).
- `1c23c18` — piscar a bolinha da fonte primária liga/desliga (`animate-blink`, keyframe `step-end` 1s) em vez de animação de ping.
- `c6fba26` — a bolinha OFFLINE (vermelha) também pisca intermitentemente.
- `a0e4d9b` — `api/aviationweather.ts` passa a suportar `format=raw` (`ids`, `format=raw`, `taf=true`, `hours`), retornando text/plain; History de 23h alimentado por esse endpoint raw quando a REDEMET está offline; `parseAviationWeatherRawText`/`fetchAviationWeatherRawText` em `src/lib/redemet.ts`.
- `94bdc7c` — slots do History preservam mensagens METAR buscadas próximo à virada da hora (janela orientada por dados, além do relógio).
- `e897da0` — slots orientados por dados cobrem **toda hora presente nos dados** (piso de 48h), garantindo que a última mensagem da sequência nunca perca o slot mesmo com defasagem de horas entre requisição e visualização.
- `b97773a` — endpoint raw passa de `hours=23` para `hours=24`: intervalo exato de **24h** entre a mensagem METAR atual e a última da lista (verificado com `date=202609120800`: `120800Z` → `110800Z`).

### 2.1 Estado do painel de fontes (head do PR #17)
- Pill `REDEMET`: LIVE (verde) / OFFLINE (vermelha, pisca) / SYNC (âmbar, estática).
- Pill `AVIATIONWEATHER`: LIVE (verde, pisca quando é a fonte primária) / OFFLINE (vermelha, pisca) / SYNC (âmbar, estática).
- PRIMARY = `REDEMET` a menos que `redemetOffline` → `AVIATIONWEATHER`.

### 2.2 Funcionalidades entregues nas sessões anteriores (já em `main`)
1. **Fonte alternativa — AVIATIONWEATHER (METAR/TAF)** via `api/aviationweather.ts` (JSON) — PR #16 (`5d6cce4`).
2. **Pills de status por fonte** no header; **relógio UTC** em card próprio; **áudio** na sidebar (`AudioProvider`).
3. **Alerta de atraso (watch)** com overlay full-screen e **alarme AD WRNG**.

---

## 3. O QUE AINDA FALTA / EM ABERTO

- **PR #17 não mergeado**: branch `agent/history-redemet-down` aguardando revisão/merge em `main` e re-deploy de produção (só com autorização explícita).
- Feature branch de trabalho pode ser útil para futuras rodadas: `agent/history-redemet-down` (limpa e atualizada).
- Melhorias possíveis (não autorizadas):
  - Indicar visualmente no painel TAF/METAR a origem da mensagem (REDEMET vs AVIATIONWEATHER).
  - Pill AVIATIONWEATHER refletir também o estado do TAF (hoje só o METAR).
  - Aviso/silêncio de áudio persistido em `localStorage`.
  - Botão/atualização manual (refetch) por fonte.
  - Cobertura de testes para componentes/sidebar (hoje os testes focam em `src/lib/redemet.ts`).

---

## 4. ARQUIVOS MODIFICADOS/CRIADOS (sessão atual)

- `api/aviationweather.ts` — branch `format=raw`: raw-text upstream com `taf=true&hours=24&date=<UTC atual HHMM>`; responde `text/plain`.
- `src/lib/redemet.ts` — `FlightRule` inclui `"MVFR"`; `mapFlightRuleFromAviationWeather`; `fetchAviationWeatherMetarRaw`; `parseAviationWeatherRawText` (METARs `DDHHMMZ`, virada de mês, bloco TAF separado) e `fetchAviationWeatherRawText`; merges de cache.
- `src/pages/Dashboard.tsx` — `redemetOffline`; queries avweather JSON+raw; `avWeatherData` (merge raw + JSON, dedupe por `mens`); `currentAvWeatherFltCat`/`flightRule`; `reportLine`/`tafLine` preferindo AVIATIONWEATHER offline; `sourcePills` com blink; `historySlots` orientado por dados (48h pra trás / 2h adiante); `metarHourlyRows` (≈783) e render (≈1862).
- `src/index.css` — `@keyframes blink` + `.animate-blink`.
- `src/components/FlightRuleBadge.tsx` — caso MVFR.
- `src/test/example.test.ts` — **56 testes** (inclui 3 de `mapFlightRuleFromAviationWeather`, 4 de `parseAviationWeatherRawText`).

Sessões anteriores (já em `main`): `api/redemet.ts`, `api/aisweb.ts`, `api/stationinfo.ts`, `server/http.ts`, `src/contexts/audio-context.tsx`, `src/components/AppSidebar.tsx`, `src/App.tsx`, `src/components/DashboardHeader.tsx` (código morto).

---

## 5. DECISÕES TÉCNICAS (sessão atual)

1. **Fonte primária dinâmica**: PRIMARY = REDEMET; ao detectar REDEMET offline (`Boolean(error)` da status query), AVIATIONWEATHER passa a ser a fonte de METAR/TAF atuais, flight rule e History.
2. **History offline via raw**: `parseAviationWeatherRawText` lê as linhas `METAR <ICAO> DDHHMMZ` + bloco `TAF` e converte para `MetarHistoryItem[]`, com validação de virada de mês (`resolveDayHourMinuteWithReference`); dedupe por `mens` com o JSON normalizado.
3. **Janela de 24h**: `hours=24` no upstream garante intervalo de 24h entre a mensagem atual e a última da lista (`120800Z` → `110800Z`).
4. **Slots orientados por dados**: o History garante uma lacuna de slot para cada hora presente nos dados (METAR cache + avweather), com piso de 48h para proteger a intenção de "últimas 24h" contra dados stale prolongados — a última mensagem da sequência nunca é ocultada.
5. **Simulação de offline**: short-circuit TEMPORÁRIO em `api/redemet.ts` (503) apenas para o deploy do Preview de validação; sempre revertido via `git checkout` e nunca commitado.
6. **Watch/alarme 100% REDEMET**: a fonte AVIATIONWEATHER não participa da lógica de alerta (evita falso positivo de indisponibilidade).
7. **Verificações**: `npm run typecheck`, `npm run lint`, `npm run test` (56), `npm run build` e typecheck separado dos endpoints (`npx tsc --noEmit ... api/*.ts server/http.ts`) — todos PASS.

---

## 6. PROBLEMAS CONHECIDOS

- **PR #17 pendente de merge/deploy de produção** (a produção continua na `main`/`5d6cce4`).
- **Dois lockfiles**: `package-lock.json` e `pnpm-lock.yaml` coexistem. Não remover automaticamente; alinhar com o usuário qual gerenciador oficial usar.
- **`DashboardHeader.tsx` órfão**: contém um relógio UTC + sino não utilizados; candidato a remoção (depende de autorização).
- **Estados efêmeros**: `audioEnabled` e `watchSilenced` não persistem entre reloads (comportamento atual).
- **Cold start do upstream**: primeira chamada às APIs na Vercel pode devolver 504; retry subsequente é ~200ms (verificado em produção).
- **Preview SSO**: URLs de preview exigem autenticação; `curl` anônimo retorna 302 (esperado).
- **Dados da AVIATIONWEATHER na simulação**: snapshot congelado em 2026-09-12/13 (ambiente de teste); o clock real do navegador pode divergir alguns minutos da janela dos dados — o slot orientado por dados absorve essa defasagem.
- **Branches remotas locais não apagadas**: várias `agent/*` e `codex/*` ainda existem em `origin` (algumas já mergeadas) — limpeza depende de autorização.

---

## 7. PRÓXIMOS PASSOS

1. Revisar e mergear o **PR #17** em `main` (com autorização); depois validar/deployar produção.
2. (Opcional) Persistir preferências (`audioEnabled`, `watchSilenced`) em `localStorage`.
3. (Opcional) Exibir origem da mensagem (REDEMET/AVIATIONWEATHER) no painel TAF.
4. Limpeza: remover `DashboardHeader.tsx` órfão e branches remotas mergeadas (com autorização).
5. Alinhar gerenciador de pacotes (remover lockfile redundante) — só com autorização.

---

## 8. COMANDOS NECESSÁRIOS PARA CONTINUAR

```bash
# Estado / inspeção
git status
git branch --show-current
git log --oneline -12
git diff

# Instalar dependências (npm)
npm install

# Desenvolvimento
npm run dev

# Verificações (local)
npm run test            # 56 testes (vitest run)
npm run typecheck       # tsc --noEmit -p tsconfig.app.json
npm run lint            # eslint .
npm run build           # typecheck + vite build
npm run preview         # vite preview

# Typecheck específico dos endpoints serverless (fora do tsconfig.app.json)
npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck api/*.ts server/http.ts

# Deploy Preview (branch de trabalho)
VERCEL_ORG_ID=team_wfdJap8k6L0yJ1PekDrbZTrg \
VERCEL_PROJECT_ID=prj_niKvjopOieCyLHwwhi5MMmWrAw3g \
npx vercel --yes

# Deploy Produção (somente com autorização explícita)
VERCEL_ORG_ID=team_wfdJap8k6L0yJ1PekDrbZTrg \
VERCEL_PROJECT_ID=prj_niKvjopOieCyLHwwhi5MMmWrAw3g \
npx vercel --prod --yes

# Validação pós-deploy
curl -s -o /dev/null -w "%{http_code}\n" https://wilheim.vercel.app
curl -s "https://wilheim.vercel.app/api/aviationweather?ids=SBMQ"
curl -s "https://wilheim.vercel.app/api/aviationweather?ids=SBMQ&format=raw"
curl -s "https://wilheim.vercel.app/api/redemet?resource=metar&icao=SBMQ"
curl -s "https://wilheim.vercel.app/api/redemet?resource=synop&wmo=82099"

# PRs (GitHub CLI)
gh pr view 17
gh pr checkout 17
```

Previews de validação (simulação offline) desta sessão: `adwrng2-i668pv00b-*` (slot coverage), `adwrng2-ag1ud9oeq-*` (hours=24, head `b97773a`).

---

## 9. FLUXO OPERACIONAL DO AGENTE

- Cada rodada segue **MODO A→B→C→D→E/F** com autorização por etapa do usuário.
- Produção exige autorização explícita (nunca inferida de um Preview aprovado).
- Não executar operações destrutivas (`git reset --hard`, `--force`, `vercel rm`) sem autorização explícita.
- Código científico/notebooks prioriza o runtime **Google Colab** via `colab exec` (não usar runtime local).
- Nunca inventar resultados: toda validação é executada e verificada antes do relatório.
- Ao encerrar sessão: atualizar este arquivo e commitar `Update development session state`.