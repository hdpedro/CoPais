# Auditoria Total de Paridade — PWA vs Nativo

Data: 2026-04-27  
Escopo: `src/` (PWA Next.js) vs `kindar-native/` (Expo/React Native)  
Branch auditada: `fix/audit-p0-p1-corrections`

## 1. Resumo Executivo

### Veredito

Nao, o produto **nao pode ser declarado 100% paritario** entre PWA e app nativo com base nas evidencias desta auditoria.

### Nota geral

- **PWA:** 7.2/10
- **Nativo:** 4.9/10
- **Paridade validada:** ~63%
- **Pronto para producao como experiencia cross-platform equivalente:** **NAO**

### Motivos do NAO

1. **O backend e compartilhado**, mas a superficie funcional nao e identica.
2. **Existem gaps reais de telas/rotas**: 72 rotas de tela no PWA vs 62 no nativo; 22 sao exclusivas do PWA e 12 exclusivas do nativo.
3. **A certificacao de paridade nativa esta incompleta por infraestrutura**: a automacao atual valida `expo-web`, nao iPhone/Android reais.
4. **Ha risco estrutural de divergencia por selecao de grupo ativo** em cenarios multi-grupo, mas isso nao foi a causa do bug de criancas reproduzido nas contas fornecidas.
5. **Performance e estabilidade do lado nativo nao sustentam a afirmacao de “paridade total”** na bateria executada.

### Riscos criticos

- **P0:** o modulo de criancas no nativo consulta colunas inexistentes em producao e pode zerar lista/detalhe.
- **P0:** nao existe evidência suficiente em device real para push, WebView, background e IAP nativos.
- **P1:** a selecao de grupo ativo ainda diverge conceitualmente entre PWA e nativo, mas isso **nao explicou** o bug de criancas nas contas fornecidas.
- **P1:** tela/fluxo de assinatura difere estruturalmente entre web e nativo.
- **P1:** documentacao do repo afirma “paridade funcional completa”, mas os testes e o mapa de rotas contradizem isso.

### Evidencias principais

- Mesmo projeto Supabase validado em ambos os clientes:
  - `src/lib/supabase/client.ts`
  - `src/lib/supabase/server.ts`
  - `kindar-native/src/lib/supabase.ts`
- Documentacao afirma paridade completa:
  - `README.md:64`
- A bateria de testes do “nativo” usa `expo-web`, nao iOS/Android reais:
  - `kindar-native/playwright.config.ts:4-8`
  - `kindar-native/playwright.config.ts:34-45`

## 2. Metodologia

### Fontes de evidência usadas

- Inspecao estatica de codigo.
- Mapeamento automatico de rotas PWA e expo-router.
- Inspecao de `.env`, `eas.json`, clientes Supabase e middlewares.
- Leitura de migrations Supabase e implementacoes de push/storage.
- Execucao Playwright:
  - `01-auth.spec.ts`
  - `02-navigation.spec.ts`
  - `09-data-parity.spec.ts`
  - `10-performance.spec.ts`
  - `12-payments.spec.ts`
  - `14-coparenting-flow.spec.ts`

### Limites de confianca

- O “nativo” automatizado hoje e **`expo-web`**. Isso **nao prova** comportamento real de:
  - APNs/FCM em device fisico
  - WebView em iOS/Android
  - background/foreground real
  - restore purchase / StoreKit / Google Billing reais
- Portanto, esta auditoria e **forte para arquitetura, backend compartilhado, mapa de telas e sinais de falha**, mas **nao fecha selo de 100% de paridade operacional nativa**.

## 3. Banco de Dados / Backend

### Conclusao

**Sim, PWA e nativo apontam para o mesmo backend Supabase.**  
Isso foi validado por configuracao, clientes Supabase e rotas server-side compartilhadas.

### Matriz

| Item | PWA | Nativo | Status |
| --- | --- | --- | --- |
| URL Supabase | `NEXT_PUBLIC_SUPABASE_URL` em `.env.local` | `EXPO_PUBLIC_SUPABASE_URL` em `kindar-native/.env` e `eas.json` | Igual |
| Projeto Supabase | ref `jquaysfeeuwvoydsgssi` | ref `jquaysfeeuwvoydsgssi` | Igual |
| Auth client | `@supabase/ssr` browser/server | `@supabase/supabase-js` + AsyncStorage | Igual backend / diferente persistencia |
| Sessao/login | cookies SSR + backup localStorage | persistencia em AsyncStorage | Parcialmente equivalente |
| Tabelas | mesmo projeto, mesmas migrations | mesmo projeto, mesmas migrations | Igual arquiteturalmente |
| RLS policies | mesmo projeto, mesmas migrations | mesmo projeto, mesmas migrations | Igual arquiteturalmente |
| Funcoes/Triggers | `supabase/migrations/` compartilhado | `supabase/migrations/` compartilhado | Igual arquiteturalmente |
| Webhooks | Stripe / RevenueCat / push vivem no backend web | nativo consome esse backend | Igual backend |
| Realtime | chat + badge + notificacoes | notificacoes confirmadas; demais parciais | Parcial |
| Storage buckets | `documents`, `receipts` no mesmo projeto | mesmos buckets | Igual |
| Push tokens | web push + APNs/FCM | expo-notifications registra APNs/FCM via backend web | Parcial |
| Billing status | PWA decide no backend | nativo consulta `/api/billing/status` | Igual fonte de verdade |

### Evidencias de codigo

- PWA usa o mesmo projeto Supabase nas camadas browser, server e middleware:
  - `src/lib/supabase/client.ts:9-13`
  - `src/lib/supabase/server.ts:7-11`
  - `src/lib/supabase/middleware.ts:9-18`
- Nativo usa o mesmo projeto Supabase com sessao persistida:
  - `kindar-native/src/lib/supabase.ts:12-20`
- Nativo depende do backend web para side-effects e billing:
  - `kindar-native/src/services/notify.ts:67`
  - `kindar-native/src/services/billing.ts:63`
  - `kindar-native/src/services/iap.ts:141`

### Observacao importante

Mesmo backend **nao significa** mesmo comportamento.  
O nativo mistura:

- acesso direto ao Supabase
- chamadas ao backend web (`/api/native/notify`, `/api/billing/status`, `/api/iap/verify`)
- WebView para algumas telas complexas

Resultado: **base compartilhada confirmada; paridade operacional total, nao.**

## 4. Paridade de Telas

### Inventario de rotas

- **PWA:** 72 rotas de tela mapeadas
- **Nativo:** 62 rotas de tela mapeadas
- **Intersecao exata:** 50
- **Exclusivas do PWA:** 22
- **Exclusivas do nativo:** 12

### Achado principal

O nativo **nao e** um espelho 1:1 do PWA.  
Ele combina:

- rotas equivalentes exatas
- rotas equivalentes por alias
- rotas via WebView
- rotas ausentes
- rotas nativo-only

### Rotas PWA sem correspondencia exata no nativo

| Rota PWA | Nativo | Diferenca | Prioridade |
| --- | --- | --- | --- |
| `/admin` | Nao | telas administrativas sem equivalente | P2 |
| `/admin/coupons` | Nao | telas administrativas sem equivalente | P2 |
| `/admin/metrics` | Nao | telas administrativas sem equivalente | P2 |
| `/native-bridge` | Nao | web/native bridge legado do PWA | P2 |
| `/pricing/cancel` | Nao | retorno de Stripe sem equivalente | P1 |
| `/pricing/success` | Nao | retorno de Stripe sem equivalente | P1 |
| `/privacidade` | Parcial | nativo abre link externo via perfil | P2 |
| `/r/[code]` | Nao | rota de referral sem equivalente | P2 |
| `/reset-password` | Nao | nao ha rota equivalente clara no nativo | P1 |
| `/saude/alergias/nova` | Parcial | nativo usa fluxo alternativo de registro | P1 |
| `/saude/consultas/nova` | Parcial | nativo usa fluxo alternativo de registro | P1 |
| `/saude/consultas/resumo` | Nao | ausente | P1 |
| `/saude/crescimento/novo` | Parcial | nativo usa fluxo alternativo de registro | P1 |
| `/saude/medicamentos/[id]` | Parcial | nativo usa `saude/detalhe` | P1 |
| `/saude/medicamentos/novo` | Parcial | nativo usa `saude/registrar` | P1 |
| `/saude/profissionais/novo` | Parcial | fluxo divergente | P1 |
| `/saude/vacinas/carteirinha` | Nao | ausente | P1 |
| `/saude/vacinas/nova` | Parcial | fluxo divergente | P1 |
| `/session-recovery` | Nao | ausente | P1 |
| `/suporte` | Parcial | nativo abre link externo via perfil | P2 |
| `/termos` | Parcial | nativo abre link externo via perfil | P2 |
| `/verify-email` | Nao | ausente | P1 |

### Rotas nativo-only

| Rota Nativa | PWA | Observacao | Prioridade |
| --- | --- | --- | --- |
| `/ai` | Nao | feature nativo-only | P2 |
| `/auth/callback` | Nao como tela publica equivalente | auth flow proprio | P2 |
| `/auth/forgot-password` | Alias | duplica `/forgot-password` | P2 |
| `/auth/login` | Alias | duplica `/login` | P2 |
| `/auth/signup` | Alias | duplica `/signup` | P2 |
| `/chat/[channelId]` | Nao exata | detalhamento de chat separado | P2 |
| `/decisoes/[id]` | Nao exata | detalhe nativo separado | P2 |
| `/eventos/pedidos` | Nao | sem espelho exato | P2 |
| `/perfil/deletar-conta` | Nao | funcionalidade existe so no nativo como tela dedicada | P1 |
| `/saude/detalhe` | Nao | fluxo agregado nativo | P2 |
| `/saude/registrar` | Nao | fluxo agregado nativo | P2 |
| `/saude/timeline` | Nao | fluxo agregado nativo | P2 |

### Rotas criticas via WebView

| Tela | Implementacao nativa | Observacao |
| --- | --- | --- |
| `/calendario/novo` | WebView | `kindar-native/app/calendario/novo.tsx:2-23` |
| `/semana` | WebView | `kindar-native/app/semana/index.tsx:1-11` |

### Contradicao documental

O repo afirma paridade completa, mas a propria documentacao admite WebView hibrida e features native-only:

- `README.md:64`
- `README.md:68-75`
- `README.md:95-102`

## 5. Paridade de Funcionalidades

| Modulo | Status | Evidencia | Observacao |
| --- | --- | --- | --- |
| Login/Auth | Alto | auth Playwright 10/10 passou | mesmo Supabase Auth, persistencia diferente |
| Dashboard | Medio | carrega em ambos, porem mais lento no nativo | equivalencia incompleta em performance |
| Calendario | Medio | existe em ambos; `/calendario/novo` e `/semana` dependem de WebView no nativo | paridade funcional depende de WebView |
| Notificacoes | Medio-Alto | realtime validado nos dois lados | comportamento em device real nao provado |
| Push notifications | Medio | backend APNs/FCM/web push existe | device real nao validado nesta auditoria |
| Chat | Medio | existe em ambos; realtime PWA validado; canal detalhado difere | paridade suficiente, nao total |
| Perfil/Configuracao | Alto | existe em ambos | nativo tem `deletar-conta` dedicada |
| Saude | Medio | existe em ambos, mas com decomposicao de rotas diferente | varias rotas PWA nao existem 1:1 |
| Pagamentos | Baixo | PWA usa Stripe; nativo usa RevenueCat/IAP | mesma “fonte de verdade”, fluxo comercial diferente |
| Documentos | Medio-Alto | mesmo bucket/tabela e signed URL helper nos dois | rollout de hardening ainda em transicao no branch |

### Login / Auth

- **Validado com sucesso** na bateria executada.
- PWA:
  - cookies SSR + fallback em localStorage
  - `src/lib/supabase/client.ts:22-34`
  - `src/lib/supabase/server.ts:5-19`
- Nativo:
  - sessao persistida em AsyncStorage
  - `kindar-native/src/lib/supabase.ts:12-20`
  - `kindar-native/src/store/auth.ts:61-80`

### Pagamentos

Aqui nao existe paridade “mesmo fluxo”. Existe, no maximo, tentativa de convergencia de entitlement.

- **PWA/web:** Stripe Checkout
  - `src/lib/payments.ts:178-195`
  - `src/app/api/stripe/checkout/route.ts:9-18`
  - `src/app/api/stripe/webhook/route.ts:34-80`
- **Nativo:** RevenueCat / Apple IAP / Google Billing
  - `kindar-native/app/pricing/index.tsx:2-13`
  - `kindar-native/src/services/iap.ts:2-7`
  - `kindar-native/src/services/iap.ts:124-155`

Conclusao: **mesmo status final de assinatura e buscado; mesmo comportamento operacional, nao.**

### Crianças

Aqui surgiu o achado funcional mais forte da rodada complementar.

- O dashboard nativo consegue mostrar criancas.
- A tela nativa `/criancas` mostra empty state para os dois usuarios testados.
- O detalhe `/criancas/[id]` falha mesmo com ID valido.

#### Evidencia operacional reproduzida

Consulta executada com as credenciais fornecidas:

- `select id, full_name, birth_date from children where group_id = ...` → **2 registros**
- `select id, full_name, birth_date, gender, photo_url, blood_type, notes, allergies, cpf, rg from children where group_id = ...` → **erro**

Erro retornado:

> `column children.gender does not exist`

#### Causa-raiz

O PWA ja trabalha com o schema atual:

- lista web usa `sex`, nao `gender`
  - `src/app/(app)/criancas/page.tsx:17`

O nativo ainda consulta e modela a tabela `children` com campos antigos/inexistentes:

- `kindar-native/src/services/children.ts:14-16`
- `kindar-native/src/services/children.ts:80`
- `kindar-native/src/services/children.ts:113`

Impacto:

- `/criancas` pode ficar vazia no nativo
- `/criancas/[id]` pode falhar
- criacao/edicao de crianca no nativo tem alto risco de falhar ou gravar payload invalido, porque ainda usa `gender`
  - `kindar-native/src/services/children.ts:217`
  - `kindar-native/app/criancas/nova.tsx:63-67`

Conclusao: **o modulo de criancas nao esta em paridade funcional no nativo.**

## 6. Workflows Criticos

### Resultado

**Nao foi possivel certificar ponta a ponta com alta confianca.**

### O que sustentou essa conclusao

- `14-coparenting-flow.spec.ts` foi instavel no PWA e falhou no `expo-web`.
- A stack de QA atual nao testa device real para:
  - push tap em app morto
  - WebView real
  - IAP real
  - foreground/background nativos

### Fluxos com boa confianca

- login
- logout
- refresh de sessao
- acesso basico aos modulos principais

### Fluxos com confianca insuficiente

- onboarding completo nativo
- convite multiusuario ponta a ponta
- aprovacoes cruzadas em device real
- troca de guarda com retorno por push
- restore purchase real
- sync realtime + push + deep link em app nativo fechado

## 7. Push e Automacoes

### O que foi validado

- O backend central de push existe e atende web, iOS e Android:
  - `src/lib/push.ts`
- Android FCM foi implementado no backend:
  - `src/lib/push.ts:177-202`
  - `src/lib/push.ts:354-369`
  - `src/lib/push-fcm.ts`
- Registro de token nativo no backend:
  - `src/app/api/push/register-apns/route.ts:9-11`
  - `src/app/api/push/register-apns/route.ts:38-40`
  - `kindar-native/src/services/push-setup.ts:84-97`
- Native side-effects para criar as mesmas notificacoes do PWA:
  - `src/app/api/native/notify/route.ts`
  - `kindar-native/src/services/notify.ts:67`

### Tabela de eventos observados no codigo

| Evento | PWA | Nativo | Igual? | Observacao |
| --- | --- | --- | --- | --- |
| Nova despesa | Sim | Sim via `/api/native/notify` | Parcial | mesma intencao, caminhos distintos |
| Despesa aprovada/rejeitada | Sim | Sim via `/api/native/notify` | Parcial | backend compartilhado |
| Novo evento | Sim | Sim via `/api/native/notify` | Parcial | backend compartilhado |
| Nova decisao / voto / encerramento | Sim | Sim via `/api/native/notify` | Parcial | backend compartilhado |
| Novo acordo / aceite | Sim | Sim via `/api/native/notify` | Parcial | backend compartilhado |
| Registro de saude | Sim | Sim via `/api/native/notify` | Parcial | backend compartilhado |
| Documento enviado | Sim | Sim via `/api/native/notify` | Parcial | backend compartilhado |
| Troca de guarda / resposta | Sim | Sim via `/api/native/notify` | Parcial | backend compartilhado |
| Chat | Sim | Sim | Parcial | comportamento real em device nao provado |
| Push web | Sim | Nao aplicavel | Nao | web usa VAPID |
| Push iOS APNs | Sim | Sim | Parcial | sem teste em device real |
| Push Android FCM | Sim | Sim | Parcial | sem teste em device real |

### Observacao

A arquitetura de push esta **bem mais madura do que parecia a primeira vista**.  
O que falta e **prova operacional em device real**, nao apenas codigo.

## 8. Design / UX Parity

### Nota visual

- **PWA:** 8.1/10
- **Nativo:** 7.0/10
- **Paridade visual:** 6.8/10

### Diagnostico

- As telas nativas puras tem identidade consistente e boa qualidade visual.
- A experiencia quebra quando entra em:
  - WebView para telas complexas
  - fluxos divergentes de saude
  - monetizacao diferente
- O produto nao parece “o mesmo app em duas superficies” de ponta a ponta.

## 9. Performance

### PWA

Sinais colhidos na bateria executada:

- dashboard: ~9.45s
- calendario: ~2.27s
- chat: ~2.83s
- saude: ~4.05s
- despesas: ~2.37s
- financeiro: ~17.66s na primeira tentativa
- criancas: ~6.01s
- notificacoes: >14s e falha

### Nativo (`expo-web`)

- 9/9 checks da suite de performance falharam ou estouraram timeout.
- Navegacao em massa tambem foi instavel.

### Conclusao

- **PWA:** funcional, mas com gargalos serios em `financeiro` e `notificacoes`.
- **Nativo:** a confianca de performance e baixa na automacao atual.

## 10. Seguranca

### O que esta bom

- Mesmo Supabase e mesmo RLS para ambos os clientes.
- Logout limpa sessao em ambos os lados.
- Rotas protegidas no PWA por middleware:
  - `src/lib/supabase/middleware.ts:43-79`
- Nativo limpa sessao e grupo ativo:
  - `kindar-native/src/store/auth.ts:123-126`

### O que merece atencao

#### 10.1 Storage hardening esta em transicao

O branch local contem:

- helper de signed URL web: `src/lib/storage-signed-url.ts`
- helper de signed URL nativo: `kindar-native/src/services/storage.ts`
- migration de lock-down: `supabase/migrations/00062_storage_rls_lockdown.sql`

Mas esse pacote ainda aparece **nao commitado / em andamento**:

- `src/lib/storage-signed-url.ts` — untracked
- `kindar-native/src/services/storage.ts` — untracked
- `supabase/migrations/00062_storage_rls_lockdown.sql` — untracked

Ou seja:

- a direcao esta correta
- o write-path principal ja grava `path-only`
- o rollout ainda parece **transicional**, nao consolidado

#### 10.2 Nao encontrei exposicao obvia de secret sensivel versionado

- `.env.local` e `kindar-native/.env` estao ignorados pelo git
- `eas.json` contem anon key / URL publicas, nao service-role

### Veredito de seguranca

- **Autenticacao / autorizacao:** boa
- **Cross-tenant leak:** nao encontrei evidencia
- **Estado de rollout de storage/push:** precisa consolidacao

## 11. Bugs Priorizados

### P0

#### P0.1 — Modulo de criancas do nativo esta quebrado por drift de schema

**Sintoma:** o dashboard nativo mostra as criancas, mas `/criancas` mostra empty state e `/criancas/[id]` falha para um ID valido.  
**Causa confirmada:** `fetchChildren` e `fetchChildDetail` selecionam colunas inexistentes na tabela `children` de producao, em especial `gender`. Quando a query falha, o servico devolve `[]` ou `null`, mascarando o erro.  
**Arquivos:**

- `kindar-native/src/services/children.ts:80`
- `kindar-native/src/services/children.ts:113`
- `kindar-native/app/criancas/index.tsx:18-24`
- `src/app/(app)/criancas/page.tsx:17`

**Risco:** lista, detalhe e possivelmente criacao/edicao de criancas no nativo ficam incorretos.  
**Correcao recomendada:** alinhar o contrato do nativo ao schema real do PWA/Supabase, trocando `gender` por `sex` e removendo do `select` os campos que hoje vivem em tabelas auxiliares.

#### P0.2 — Nao existe infraestrutura suficiente para certificar paridade nativa real

**Sintoma:** o “nativo” em automacao e `expo-web`, nao iOS/Android.  
**Arquivos:**

- `kindar-native/playwright.config.ts:4-8`
- `kindar-native/playwright.config.ts:34-45`

**Risco:** push, IAP, WebView e deep link podem parecer cobertos sem estarem de fato provados.  
**Correcao recomendada:** adicionar suite em device real com Detox, Maestro ou Appium, cobrindo iOS e Android.

### P1

#### P1.1 — Selecao de grupo ativo ainda diverge conceitualmente entre PWA e nativo

**Sintoma:** o PWA persiste `activeGroupId` em cookie server-side; o nativo persiste grupo local em AsyncStorage e, na ausencia dele, cai no primeiro membership retornado.  
**Arquivos:**

- `src/lib/group-utils.ts:23-38`
- `src/actions/group-switch.ts:25-31`
- `kindar-native/src/store/auth.ts:145-176`

**Risco:** usuarios multi-grupo podem cair em grupos diferentes entre plataformas.  
**Observacao:** nas credenciais fornecidas, ambos os usuarios possuem **apenas um grupo**, entao isso **nao foi a causa** do bug de criancas reproduzido nesta rodada.  
**Correcao recomendada:** definir um identificador canonico de grupo ativo compartilhado entre plataformas e backend.

#### P1.2 — Paridade de pagamentos e apenas parcial

**Sintoma:** o PWA usa Stripe; o nativo usa RevenueCat/IAP.  
**Arquivos:**

- `src/lib/payments.ts:178-195`
- `src/app/api/stripe/checkout/route.ts`
- `kindar-native/app/pricing/index.tsx:2-13`
- `kindar-native/src/services/iap.ts:124-155`

**Risco:** UX, trial, restore, cancelamento e copy comercial nao sao equivalentes.  
**Correcao recomendada:** redefinir oficialmente “paridade” de billing como “equivalencia de entitlement” e nao “mesmo fluxo”, ou reescrever a experiencia para aproximar copy/estado/edge cases.

#### P1.3 — Ha lacunas reais no mapa de telas

**Sintoma:** 22 rotas do PWA nao tem equivalente exato no nativo.  
**Arquivos de referencia:** inventario de rotas nesta auditoria.  
**Risco:** QA funcional 1:1 e incompleto por definicao.  
**Correcao recomendada:** fechar gaps ou documentar formalmente quais telas sao web-only, native-only ou equivalentes por agregacao.

#### P1.4 — Performance abaixo do esperado em modulos criticos

**Sintoma:** PWA com lentidao forte em `financeiro` e `notificacoes`; nativo instavel na automacao.  
**Risco:** friccao em modulos centrais e baixa confianca operacional.  
**Correcao recomendada:** profiling de queries, suspense/loading segmentado, reduzir waterfall de dados e medir em device real.

#### P1.5 — Storage hardening ainda parece em rollout

**Sintoma:** migration/helpers existem, mas ainda estao fora de commit neste branch.  
**Arquivos:**

- `supabase/migrations/00062_storage_rls_lockdown.sql`
- `src/lib/storage-signed-url.ts`
- `kindar-native/src/services/storage.ts`

**Risco:** ambiguidade entre estado local, estado deployado e comportamento de registros legados.  
**Correcao recomendada:** consolidar commit, aplicar migration, migrar dados legados e validar smoke test web+nativo.

### P2

#### P2.1 — Documentacao afirma mais do que o sistema comprova

**Sintoma:** `README.md` diz “paridade funcional completa”.  
**Arquivo:** `README.md:64`  
**Correcao recomendada:** ajustar documentacao para “backend compartilhado + paridade parcial/hibrida”.

#### P2.2 — Comentarios de push estao desatualizados

**Sintoma:** `push-setup.ts` ainda fala em `push_subscriptions table`, mas a implementacao usa a tabela `notifications` para tokens/subs.  
**Arquivos:**

- `kindar-native/src/services/push-setup.ts:1-10`
- `src/lib/push.ts:47-53`

## 12. Acoes Recomendadas

### Imediatas

1. Corrigir o modulo de **criancas** no nativo para o schema real de producao.
2. Unificar definicao de **grupo ativo** entre PWA, nativo e testes.
3. Corrigir ou documentar oficialmente as rotas ausentes do nativo.
4. Tratar billing como plataforma-especifico, nao como “mesmo fluxo”.
5. Consolidar e versionar o hardening de storage.
6. Atualizar `README.md` e `MANUAL_DEV.md`.

### Antes de chamar de “100% paritario”

1. Adicionar E2E real para iOS.
2. Adicionar E2E real para Android.
3. Cobrir push tap em foreground, background e app cold start.
4. Cobrir restore purchase real.
5. Cobrir WebView routes criticas em device real.
6. Reexecutar bateria multiusuario com grupo ativo controlado.

## 13. Veredito Final

O produto **compartilha backend** entre PWA e nativo. Isso esta comprovado.

O produto **nao compartilha 100% da mesma experiencia operacional**. Isso tambem esta comprovado.

Hoje, a afirmacao correta e:

> **“Existe base unica de backend e boa cobertura funcional cruzada, mas a paridade total PWA vs nativo ainda nao foi atingida nem comprovada.”**

Se a pergunta for “posso afirmar para investidores, time ou QA que ja existe paridade total?”, a resposta honesta e:

**Nao.**
