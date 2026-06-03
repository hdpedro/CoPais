# Regras Canônicas do Kindar

> Estas regras são **inegociáveis** e se aplicam a TODO código, copy, UI, comentário visível ao usuário, mensagem de erro, toast, e-mail, push notification e qualquer texto do app — em **toda** funcionalidade existente, nova ou futura, tanto no front Next.js (web/PWA) quanto no React Native/Expo (iOS/Android).
>
> **Versão:** 1.1 — 2026-06-03
> **Dono:** Henrique
> **Revisão:** trimestral (próxima: 2026-08-16)
> **Status:** ATIVAS — toda PR que violar é bloqueada no CI

---

## Por que existem

Kindar é app cross-platform (PWA + iOS + Android) com 5 idiomas e copy emocionalmente sensível (família, saúde, dinheiro, guarda). Cada string mal escrita, mal traduzida, ou hardcoded é um momento de fricção com um pai cansado às 22h. Premium não é só design — é cada palavra.

Estas 19 regras representam o state-of-the-art 2025 ajustado pra estágio do Kindar — copy, i18n e arquitetura de plataforma. Comparáveis ao stack de Mozilla, Stripe, Spotify. Acima da média do mercado.

---

## Regra 1 — Português impecável

Todo texto em português DEVE ter:

- **Acentuação correta**: `é`, `ê`, `á`, `à`, `â`, `ã`, `í`, `ó`, `ô`, `õ`, `ú`, `ç`. Nunca aceitar `voce`, `nao`, `acoes`, `usuario` (sem til), `pagina` (sem acento), `botao`, `informacao`, `criança` sem til.
- **Ortografia correta** (Acordo Ortográfico vigente).
- **Gramática correta**: concordância nominal/verbal, regência, crase, pontuação.
- **Tom consistente**: tratamento por "você" (não "tu"/"vós"), formal-amigável, conciso.

Antes de finalizar qualquer texto: **releia em voz alta mentalmente**. Se soa estranho ou tem erro, corrija antes de entregar.

❌ `"Voce nao tem permissao para acessar essa pagina"`
✅ `"Você não tem permissão para acessar esta página"`

❌ `"Ações disponiveis"` (faltou acento em "disponíveis")
✅ `"Ações disponíveis"`

---

## Regra 2 — i18n obrigatória, sem exceção

**Nenhuma string visível ao usuário pode estar hardcoded no código.** Todo texto passa pelo sistema de idiomas do app.

### Isso inclui (lista NÃO exaustiva):

- Texto em JSX/TSX: `<Text>`, `<p>`, `<button>`, `<label>`, `<h1>`...
- Atributos: `placeholder`, `alt`, `aria-label`, `title`, `accessibilityLabel`, `accessibilityHint`
- Mensagens de erro (validação de form, erros de API, fallbacks)
- Toasts, alerts, modals, confirmations
- Títulos de tela, headers de navegação, tab labels
- Push notifications e e-mails transacionais
- WhatsApp bot responses
- Strings em arrays/objetos de configuração (status, categorias, opções de select)
- Mensagens de loading, empty states, skeleton states
- Texto em imagens geradas dinamicamente (OG images, certificados, etc.)

### O que fazer ao criar/editar qualquer feature:

1. **Toda string nova** → chave nos 5 locales (não deixar nenhum incompleto).
2. **Chaves semânticas e hierárquicas** (ver Regra 9 pra convenção exata).
3. **Plurais** via ICU MessageFormat (`{count, plural, =0 {...} one {...} other {...}}`), nunca `if (count === 1)`.
4. **Interpolação** via placeholder nomeado (`{name}`, `{date}`), nunca concatenação de strings traduzidas.
5. **Datas, horas, números, moedas** → `Intl.*` respeitando locale atual.
6. **RTL preparedness**: `marginStart`/`marginEnd` (RN) / `padding-inline-start` (CSS) — não `marginLeft`/`marginRight` em layouts direcionais.

### Exemplos:

❌ `<Text>Bem-vindo ao Kindar</Text>`
✅ `<Text>{t('home.welcome')}</Text>`

❌ `toast.error("Erro ao salvar")`
✅ `toast.error(t('errors.saveFailed'))`

❌ `const STATUS = ['Ativo', 'Inativo']`
✅ `const STATUS = [t('status.active'), t('status.inactive')]`

❌ Adicionar chave só no `pt-BR.json` e deixar `en.json` faltando
✅ Adicionar em **todos** os locales (`TODO: review translation` aceito como placeholder pra MT, mas chave nunca ausente)

---

## Regra 3 — Imutabilidade de chaves

Chaves de tradução são **append-only**. **Nunca renomear.** Renomear invalida traduções nos 5 locales simultaneamente e abre janela pra string em pt aparecer em EN/DE/etc.

Para renomear:

1. Criar nova chave com nome correto.
2. Marcar antiga `@deprecated <nova-chave>` em comentário no JSON.
3. Migrar callsites no código.
4. Remover antiga apenas em release **≥30 dias** depois.

---

## Regra 4 — Source language + workflow de tradução

- **pt-BR é a fonte.** Todo texto nasce em pt-BR. Único locale editável direto no código.
- Outros 4 locales gerados via TMS (Tolgee Cloud — free tier inicial).
- Tradução LLM (MT) aceita em copy não-crítica, com flag `needsReview: true`.
- **Copy crítica = humano nativo obrigatório**, nunca LLM:
  - Legal (ToS, LGPD, Política de Privacidade)
  - Médica (vacinas, alergias, sintomas, medicamentos)
  - Financeira (cobrança, refund, split)
  - Onboarding e signup
- Release **bloqueia automaticamente** se chave `needsReview: true` há >7 dias em copy crítica.

---

## Regra 5 — Política de erro do usuário

Erros de usuário **nunca** vazam termo técnico, código SQL, stack trace, ID interno.

Toda mensagem de erro tem:

1. **O que aconteceu** (em linguagem humana)
2. **O que fazer** (acionável)

❌ `"PostgreSQL error 23505: duplicate key violates unique constraint"`
✅ `"Esse registro já existe. Verifique se não foi adicionado por engano."`

❌ `"Error 401: JWT expired"`
✅ `"Sua sessão expirou. Faça login novamente."`

Mapeamento PG code → mensagem human-friendly mora em `lib/error-messages.ts` (pattern estabelecido em `services/children.ts`).

---

## Regra 6 — Fallback explícito de tradução

- **Dev**: chave faltando → exibe `🔴 MISSING: home.welcome` + warning no console + Sentry error.
- **Prod**: chave faltando → cai pro source language (pt-BR) + Sentry warning silencioso.

**Nunca** vazar a `chave.path` literal pro usuário em produção.

---

## Regra 7 — Cobertura mínima de testes

| Tipo | O que valida | Onde roda |
|---|---|---|
| Unit | `t('chave.existente')` nunca retorna a key literal | vitest / jest |
| CI parity | 5 JSONs com estrutura idêntica | GitHub Actions, bloqueia PR |
| Integration | Trocar locale propaga ≥10 telas críticas | Playwright (PWA) + Detox (native) |
| Visual regression | Screenshot diff em 5 locales × 10 telas críticas | Playwright + Detox, cada PR |
| Pseudo-loc | UI rodando em `[!! Ƒáḿḯĺý ḯńṿḯťé !!]` | Flag dev (`NEXT_PUBLIC_PSEUDO_LOC=1` / `EXPO_PUBLIC_PSEUDO_LOC=1`) |

**Pseudo-localization** detecta:
- Strings hardcoded (não traduzidas continuam limpas em pt)
- Truncamento de UI (DE costuma ser ~30% mais longo que PT — botões estouram)
- Lugares sem `t()`

---

## Regra 8 — A11y é texto crítico

`accessibilityLabel`, `accessibilityHint`, `accessibilityValue`, `accessibilityRole` tratados com **mesma seriedade** que texto visível.

- VoiceOver (iOS) e TalkBack (Android) testados em **pt-BR + en-US** em release das telas principais.
- Trap de foco em modais.
- `accessibilityHint` obrigatório em ações destrutivas ("Toque duas vezes pra excluir esta despesa").
- Alvo: WCAG 2.1 AA.

---

## Regra 9 — Naming convention de chaves

```
<scope>.<entity>.<property>     ex: family.invite.title
action.<verb>                    ex: action.save, action.cancel, action.delete
status.<entity>.<state>          ex: status.expense.pending, status.vaccine.overdue
error.<domain>.<specific>        ex: error.auth.invalidCredentials
empty.<screen>                   ex: empty.expenses, empty.vaccines
a11y.<context>.<role>            ex: a11y.dashboard.menuButton
```

**Regras**:
- **Lowercase camelCase** apenas. Sem espaços, sem maiúsculas no início de segmento.
- Verb prefix pra ações.
- Status sempre com namespace do domínio.
- Erros sempre com domínio.

---

## Regra 10 — Translation Memory + Glossary obrigatórios

**Glossary do Kindar** (travado por locale, gerenciado no Tolgee):

| PT | EN | ES | FR | DE |
|---|---|---|---|---|
| coparente | co-parent | coparental | coparent | Mitelternteil |
| custódia | custody | custodia | garde | Sorgerecht |
| guarda | custody | custodia | garde | Sorgerecht |
| troca | swap | intercambio | échange | Tausch |
| reforço (vacina) | booster | refuerzo | rappel | Auffrischung |
| responsável | guardian | responsable | tuteur | Erziehungsberechtigter |
| escala | schedule | calendario | planning | Plan |
| compromisso | appointment | cita | rendez-vous | Termin |

**Translation Memory**: chaves novas com ≥80% match em chave antiga reutilizam tradução automaticamente. Garante "Salvar" sempre = "Save", nunca alternando com "Store"/"Keep".

---

## Regra 11 — `Intl.*` completo

Não basta `DateTimeFormat` + `NumberFormat`. **Obrigatório** também:

- **`Intl.RelativeTimeFormat`** — "há 3 dias", "em 2 horas". Crítico em "Visto por Amanda há 14 min", dashboard, audit trail, push notifications.
- **`Intl.ListFormat`** — "Maria, João e Pedro" (PT) vs "Maria, João, and Pedro" (EN com Oxford) vs "Maria, João und Pedro" (DE).
- **`Intl.Collator`** — ordenação com acento. `[].sort()` puro quebra com "Ágatha" vs "Amanda". Usar `[].sort(new Intl.Collator(locale).compare)`.

Bonus: locale-aware `toLocaleString` em datas/horas com `options.timeZone` explícito.

---

## Regra 12 — Linguagem inclusiva canonizada

Kindar serve mãe+pai, mãe+mãe, pai+pai, mãe+avó, pai+padrasto, tutor+responsável.

- **"coparente" / "responsável"** > "marido/esposa/pais"
- **"criança"** > "filho/filha" quando gender-neutral serve
- Sem pressupor número: "ambos os pais" → "os responsáveis"
- **Pronome neutro em EN**: `they/them` (não `he/she`)
- **DE**: "du" (informal) > "Sie" (formal) — Kindar é informal-amigável
- **ES**: "tú" (informal) > "usted"
- **FR**: "tu" (informal) > "vous"

---

## Regra 13 — Standards: BCP 47 + CLDR + ISO 4217

- **Tags de idioma**: BCP 47 estrito. `pt-BR` (não `pt-br`, não `pt_BR`), `en-US`, `pt-PT` (se entrar). Hífen, não underscore. País em UPPERCASE.
- **Regras culturais** (plural, ordem de data, format de número): consultar **CLDR** primeiro. `Intl.*` já usa por baixo.
- **Moeda**: códigos **ISO 4217** (`BRL`, `USD`, `EUR`). Nunca strings livres como `"R$"`.

---

## Regra 14 — Copy legal fenced

ToS, Política de Privacidade, LGPD, App Store description, ASO keywords, copy de cobrança/refund, comunicação de breach:

- Tradutor humano nativo + revisor jurídico obrigatório.
- **Nunca** LLM.
- Versionada separadamente das demais traduções (pasta `i18n/legal/`).
- Mudança requer aprovação do Henrique + jurídico.

---

## Regra 15 — Limites de caracteres por canal

CI valida automaticamente. Estourar trunca pro usuário, vira bug.

| Canal | Limite |
|---|---|
| iOS push title | 50 chars |
| iOS push body | 178 chars |
| Android push body | 240 chars |
| Email subject | 50 chars (Gmail mobile corta acima disso) |
| WhatsApp template body | 1024 chars |
| `accessibilityLabel` (iOS VoiceOver) | 200 chars |
| Botão primário PWA | 30 chars (mobile) / 50 chars (desktop) |

---

## Regra 16 — Detecção de locale + persistência

### PWA (Next.js)
- Middleware Next.js lê `Accept-Language` HTTP no **Edge**, redireciona pra `/<locale>/...` no primeiro visit.
- Persiste em cookie `kindar-locale` quando user troca manualmente em `/perfil`.
- Cookie tem prioridade sobre auto-detect.

### Native (Expo/RN)
- `expo-localization` no app boot detecta locale do iOS/Android automaticamente.
- Persiste em `AsyncStorage @kindar_locale` quando user troca em settings.
- AsyncStorage tem prioridade sobre auto-detect.

### Server (push / email / WhatsApp)
- Lê `users.locale` do Supabase (coluna obrigatória a partir de migration `00083`).
- User sem locale → fallback `pt-BR`.

**Auto-detect nunca sobrescreve escolha do user.**

---

## Regra 17 — Onboarding + signup com cobertura 100% humana

Primeira impressão. Telas `/login`, `/signup`, onboarding completo (criar família, adicionar criança, primeira escala), trial e billing flow:

- 100% das chaves traduzidas por humano nativo. **Zero MT, zero `needsReview`.**
- Visual regression rodando em cada PR.
- A11y validada pt-BR + en-US (mínimo) em release.

---

## Regra 18 — Governance + analytics

### Ownership (RACI)

- **R**esponsible (faz): qualquer dev que adiciona/altera chave
- **A**ccountable (responde): Henrique
- **C**onsulted (revisa): tradutor por locale via Tolgee
- **I**nformed (sabe): time todo via PR

### Analytics obrigatórios

- Todo evento PostHog leva super-property `$locale` (registrado no provider).
- Dashboards obrigatórios:
  - Bounce rate por locale (alto = tradução quebrada)
  - Funil de onboarding por locale
  - Erros JS por locale
  - Cobertura de chaves traduzidas vs total (Tolgee dashboard)

---

## Regra 19 — Separação inteligente de plataforma

Kindar é **um produto só**: uma visão de negócio, uma lógica, uma experiência funcional. iOS, Android e PWA **não são três produtos** — são três **apresentações** do mesmo produto. O objetivo nunca é criar apps diferentes; é desenvolver com inteligência, separando só o que naturalmente pertence a cada sistema.

**A regra de negócio é uma só. iOS = Android = PWA. Só a camada de apresentação pode divergir.**

### A pergunta que decide tudo

Antes de qualquer mudança: **"isto é regra de negócio ou comportamento de plataforma?"**

**Regra de negócio → compartilhada, implementada UMA vez.** Cadastro de criança, responsáveis, escala, calendário, despesas, vacinas, guarda, decisões, validações, permissões, segurança, quem recebe qual notificação, contratos de API, banco, correções de lógica. Mora em `src/lib/services/<dominio>.ts` (fonte única de verdade). Os três callers são wrappers finos — `actions/*` (PWA), `api/*/route.ts` (Native), `ai/tools.ts` (assistente + WhatsApp) — e só fazem auth + parsing + adaptação do retorno. Detalhe completo na seção "Regra crítica: paridade PWA ↔ Nativo ↔ WhatsApp" do `CLAUDE.md`.

**Comportamento de plataforma → separado, só onde o usuário ganha.** Material Design vs Human Interface Guidelines, navegação e gestos nativos, botão voltar do Android, sheets e modais, date picker (dialog nativo no Android vs wheel no iOS — `kindar-native/app/_src/components/ui/DateTimeField.tsx`), safe-area e insets, haptics, APNs vs FCM, Apple Sign In vs Google, RevenueCat Apple/Google. Separar **inline** com `Platform.OS` / `Platform.select()` no ponto de uso — nunca forkar arquivo (`.ios.tsx`/`.android.tsx`) nem duplicar a lógica por trás.

### Ordem de decisão (sempre o caminho mais simples)

1. Resolver **compartilhado** (iOS + Android + PWA).
2. Se houver diferença real de UX nativa, separar **só a apresentação**.
3. Nunca forkar regra de negócio, nunca duplicar, nunca criar solução paralela.
4. Uma fonte de verdade pra dados e estado.
5. Na dúvida, **compartilhar**. Separação é exceção justificada, nunca o default.

Todos os incidentes de divergência nasceram de regra de negócio **vazando** pra camada de apresentação: swap `2026-05-01`, calendar_occurrences `2026-05-07`, decisions stance `2026-05-18`, balance-operations `2026-05-29`, chat `2026-06-02`. Service compartilhado — com trigger no banco como rede de segurança — fecha a porta.

❌ Native reescreve `directionForType()` com valores próprios → diverge do PWA → viola CHECK em produção
✅ `direction` derivado uma vez no service `balance-operations.ts`; trigger no banco reescreve como defesa

❌ `if (Platform.OS === 'ios') { /* recalcula o split de despesa diferente */ }`
✅ `Platform.OS` decide só picker, inset, haptic — **nunca** o split

### Publicação é independente por plataforma

Builds já são independentes (binários EAS separados por perfil iOS/Android). **OTA não é por padrão:** `eas update` sem `--platform` publica numa branch única e atinge **iOS E Android** no mesmo `runtimeVersion`. Por isso:

- OTA que toca comportamento de plataforma → **sempre** por plataforma: `npm run ota:android` ou `npm run ota:ios`.
- `npm run ota:all` (sem `--platform`, atinge os dois) → **só** pra lógica/JS compartilhada e segura nos dois sistemas.
- Android só impacta Android. iOS só impacta iOS. Ambos **só quando explicitamente pedido**. Nunca assumir publicação multiplataforma por default.

> ✅ **Mecanismo no repo:** `kindar-native/scripts/publish-ota-all-versions.mjs` aceita `--platform android|ios` e avisa quando publica pros dois; os scripts npm `ota:android` / `ota:ios` / `ota:all` cobrem os três casos.

---

## Checklist obrigatório antes de qualquer PR/commit

Cole no template do PR:

- [ ] Nenhuma string visível hardcoded — todas via `t()` / sistema de i18n
- [ ] Todas as chaves novas presentes em **todos** os 5 arquivos de locale
- [ ] Naming segue convenção da Regra 9
- [ ] Textos em português revisados (acentuação, ortografia, gramática, crase)
- [ ] Datas/números/moedas formatados via `Intl.*` respeitando o locale
- [ ] Plurais usando ICU MessageFormat, não `if` manual
- [ ] `placeholder`, `alt`, `aria-label`, `accessibilityLabel`/`Hint` traduzidos
- [ ] Mensagens de erro sem termo técnico (Regra 5)
- [ ] Linguagem inclusiva (Regra 12)
- [ ] Tags BCP 47 corretas (Regra 13)
- [ ] Limites de caracteres respeitados em push/email (Regra 15)
- [ ] Visual regression rodou em 5 locales (CI)
- [ ] Onboarding/signup, se tocado, com tradução humana (Regra 17)
- [ ] Lógica de negócio nova vive em `services/` (uma vez, pros 3 surfaces) — só apresentação diverge via `Platform.OS` (Regra 19)
- [ ] OTA que afeta um SO só usa `--platform` (`ota:android`/`ota:ios`); `ota:all` apenas pra mudança compartilhada e segura nos dois (Regra 19)

---

## Para IA trabalhando neste projeto

Ao gerar qualquer código, copy ou sugestão:

1. **Pare antes de escrever uma string literal em JSX/TSX** e pergunte-se: "isso vai aparecer pro usuário?". Se sim → `t('chave')`.
2. Ao criar uma chave nova, **sempre entregue junto** os snippets JSON pros 5 locales (MT marcada com `TODO: review translation` é aceito).
3. Ao escrever português, **trate como produção** — não é rascunho, é texto final. Acento faltando = bug.
4. Se não tiver certeza da tradução para outro idioma, marque `TODO` explicitamente em vez de inventar.
5. Naming segue Regra 9 estritamente — não invente convenção própria.
6. Chaves existentes são imutáveis (Regra 3) — para renomear, siga o processo.
7. Antes de implementar, pergunte: **"regra de negócio ou plataforma?"** Negócio → `services/` (uma vez, pros 3 surfaces); plataforma → diverge só na apresentação via `Platform.OS`. Na dúvida, compartilhe (Regra 19).

---

# Enforcement técnico (Fase B do plano i18n)

Regras viram código, não recomendação. Toda PR passa por:

| Enforcer | O que detecta | Regra correspondente |
|---|---|---|
| ESLint custom `no-literal-jsx-text` | `<Text>Carregando</Text>` literal | Regra 2 |
| ESLint custom `no-string-literal-attr` | `placeholder="Nome"`, `alt="..."` | Regra 2 |
| Script `validate-locale-parity.js` (CI) | Chaves dessincronizadas entre 5 locales | Regras 2, 7 |
| Script `validate-orphan-keys.js` (CI, warn) | Chaves no JSON sem uso no código | Regra 7 |
| Script `validate-char-limits.js` (CI) | Push >178 chars, email subject >50, etc. | Regra 15 |
| Pseudo-localization dev mode | Strings hardcoded e truncamento | Regras 2, 7 |
| TypeScript `.d.ts` gerado de `pt.json` | `t("key.inexistente")` é erro de compilação | Regras 2, 6 |
| Sentry hook em fallback i18n | Chaves faltando em prod | Regra 6 |
| Husky pre-commit | Roda ESLint + parity check antes do commit | Todas |
| GitHub Action `i18n-gate` | Bloqueia merge se algum check acima falhar | Todas |

---

# Roadmap

## Tier 2 — adicionar quando virar prioridade (~6 meses)

- **CDN + OTA translations**: JSONs servidos via CDN (`cdn.kindar.com.br/i18n/v123/en.json`), app baixa no boot. Fix de typo em prod em 2 minutos, sem novo build EAS.
- **In-context editing Tolgee**: tradutor abre o app real, clica na string, edita ao vivo no contexto.
- **Right-sized strings**: `action.save`, `action.save.short`, `action.save.long` pra UI adaptar por espaço.
- **Cultural checklist completo por locale**: data, telefone, nome (ordem), endereço (CEP/ZIP/PLZ), moeda padrão, honorific.
- **L10n SLA com gate técnico**: pt-BR (commit) → MT auto (<1h) → human review (<72h) → release bloqueia se `needsReview` >7d em copy crítica.
- **Voice + tone matrix**: empático em erro crítico, afirmativo em confirmação, encorajador em empty state.

## Tier 3 — Airbnb/Stripe scale (NÃO agora, revisar em 100k+ MAU)

- A/B testing de copy por locale (PostHog feature flags multivariate)
- Pricing localizado real (Stripe Tax + Pricing API)
- MT continuous loop com ML proprietário
- ASO localizado profissional por país
- 24h human-translation SLA com tradutor dedicado por locale

---

# Histórico

| Data | Mudança | Autor |
|---|---|---|
| 2026-05-16 | v1.0 — 18 regras canônicas iniciais | Henrique + Claude |
| 2026-06-03 | v1.1 — +Regra 19 (separação inteligente de plataforma: lógica única iOS/Android/PWA, divergência só na apresentação; publicação por `--platform`) | Henrique + Claude |
