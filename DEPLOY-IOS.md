# KINDAR — iOS Release Autônomo

Deploy iOS TestFlight + App Store Review totalmente automatizado a partir do Windows.

Objetivo: `git tag vX.Y.Z && git push --tags` → app no TestFlight + submetido pra review, zero clique manual.

---

## Como funciona

```
  git tag v1.2.0 && git push --tags
            ↓
  GitHub Actions (.github/workflows/ios-release.yml)
            ↓
  1. Pre-submit audit    (scripts/pre-submit-audit.mjs)
  2. Metadata + IAPs     (kindar-asc.mjs)
  3. EAS Build iOS       (kindar-native/, profile production)
  4. EAS Submit → ASC    (IPA upload via ASC API key)
  5. Wait Apple process  (kindar-asc.mjs --wait-processing)
  6. Submit for Review   (kindar-asc.mjs --submit-review)
  7. Slack notify
```

Tempo típico: 20-30min até submission enviada. Depois Apple responde em 24-48h por email.

---

## Setup ÚNICO (~4h, uma vez na vida)

### 1. Apple Developer ($99/ano)

- https://developer.apple.com/enroll — aprovação em 24-48h

### 2. App Store Connect — contratos e fiscal

Em https://appstoreconnect.apple.com/business:

- **Paid Applications Agreement** → aceitar + banking info (BR: COMPE + Conta) + **24h processa**
- **W-8BEN** → preencher com CPF como Foreign TIN, sem treaty benefits
- **U.S. Certificate of Foreign Status** → mesmos dados
- **Formulário fiscal BR** → CPF

Sem status **"Active"** nesses 3, IAP review falha.

### 3. App Store Connect API key

`Users and Access` → `Integrations` → `App Store Connect API` → `Generate API Key`:

- Role: **Admin**
- Baixa o `.p8` (mostra só 1 vez)
- Anota `Key ID` e `Issuer ID`

> ⚠️ A key atual `736GBBC4YY` / issuer `52e31db4-ca31-4a2c-b99d-86b8b599b29e` já está hardcoded em `kindar-asc.mjs` e `scripts/pre-submit-audit.mjs`. Se regenerar, atualize esses dois arquivos.

### 4. Expo / EAS

```powershell
npx eas-cli login
npx eas-cli whoami   # confirma
```

Gere um token de CI:

```powershell
npx eas-cli build:cache:list   # só pra garantir login ok
# depois, em https://expo.dev/accounts/<you>/settings/access-tokens → create token
```

### 5. GitHub Secrets (repo CoPais → Settings → Secrets → Actions)

| Secret | Valor | Obrigatório |
|---|---|---|
| `EXPO_TOKEN` | Token de CI Expo | ✅ |
| `ASC_KEY_ID` | `736GBBC4YY` | ✅ |
| `ASC_ISSUER_ID` | `52e31db4-ca31-4a2c-b99d-86b8b599b29e` | ✅ |
| `ASC_PRIVATE_KEY` | Conteúdo RAW do `AuthKey_736GBBC4YY.p8` (multi-linha com `-----BEGIN/END-----`) | ✅ |
| `SLACK_WEBHOOK` | URL de webhook Slack | opcional |

**Formato do `ASC_PRIVATE_KEY`**: cola o arquivo `.p8` inteiro, preservando quebras de linha. GitHub Secrets aceita multi-linha diretamente — **não** escape com `\n`.

### 6. App no App Store Connect

Já existe com bundle `com.kindar.app`. Confirmado via `kindar-asc.mjs`. Se um dia precisar recriar:

1. https://appstoreconnect.apple.com/apps → `+` → New App
2. Bundle ID: `com.kindar.app`
3. SKU: `com.kindar.app`
4. Primary Language: Portuguese (Brazil)
5. User Access: Full Access

---

## Fluxo do dia-a-dia

```bash
# 1. Edita código
git add . && git commit -m "feat: nova feature"
git push origin main                  # Vercel auto-deploy do /pricing, /termos, /privacidade

# 2. Bump version em kindar-native/app.json (expo.version)
#    E em package.json, README, onde mais for relevante.

# 3. Tag + push
git tag v1.2.0
git push --tags                       # ← dispara o workflow iOS Release

# 4. Toma café. Slack avisa em ~25min.
# 5. Apple responde por email em 24-48h.
```

### Execução parcial (emergência / debug)

No GitHub → Actions → `iOS Release` → Run workflow:

- **skip_audit = true** → pula validações web/native
- **stop_after = audit | metadata | build | submit | fullrelease** → interrompe no ponto escolhido

Útil pra testar etapas isoladamente sem esperar 30min de build.

---

## Pontos manuais inevitáveis

1. **Primeira submissão** em um novo app: precisa preencher manualmente no ASC:
   - **Preços** de cada subscription (tier)
   - **Privacy Nutrition Labels** (questionário)
   - **Screenshots** (6.7" para iPhone 16 Pro Max — 1290×2796 px, 5 imagens mínimo)
   - **App Review Screenshots** (se reviewer pedir — só pra features de IAP)

2. **Rejeições subjetivas**: quando Apple interpreta algo do lado dela, você responde manualmente em `Resolution Center` do ASC.

3. **Renovação do contrato anual**: 30 dias antes do vencimento, ASC te pede pra re-aceitar.

---

## Status da migração (commits nesta branch)

- [x] `git subtree add kindar-native/` — Expo app importado como subdir
- [x] `src/app/termos/page.tsx` — 175 linhas, LGPD compliant
- [x] `src/app/privacidade/page.tsx` — 196 linhas
- [x] `src/app/pricing/PricingClient.tsx` — bloco de auto-renewal disclosure 3.1.2(c)
- [x] `kindar-asc.mjs` — estendido com `waitProcessing()` e `submitForReview()`
- [x] `scripts/pre-submit-audit.mjs` — validação pre-release
- [x] `kindar-native/eas.json` — submit config via ASC API key
- [x] `.github/workflows/ios-release.yml` — pipeline completo

### Pós-merge desta branch, você deve:

1. **Arquivar o repo antigo `hdpedro/kindar-native`** via GitHub UI (Settings → Archive). A cópia no monorepo é autoritativa daqui pra frente.
2. **Deletar a pasta sibling `APP CoPais/kindar-native/`** (fora do monorepo) — ela é órfã agora. Antes de deletar, mova `.env.production` e `.env.test` pra `DEV/kindar-native/` se forem necessários localmente.
3. **Gerar e configurar `EXPO_TOKEN`** no GitHub Secrets.
4. **Validar `ASC_PRIVATE_KEY`** — deve ter sido setado no setup anterior quando `kindar-asc.mjs` foi criado. Se não, pega em `../../AuthKey_736GBBC4YY.p8` e cola no secret.

### Known issues nesta branch

- **`src/lib/cron/types.ts`** existe untracked localmente e tracked em `origin/main`. Rebase falhou por isso. Resolver antes do merge: comparar os dois arquivos e escolher qual versão vale.
- **WIP stashed**: rodei `git stash push` antes da migração pra preservar seus 11 arquivos modificados. Depois de fazer merge da branch ou abandonar, rode `git stash pop` pra recuperar. Listado como: `stash@{0}: On feat/monorepo-ios-ship: WIP before monorepo-ios-ship migration`.

---

## Lições críticas

1. **NUNCA submit antes do Paid Apps Agreement estar `Active`** — Apple rejeita IAP.
2. **NUNCA use screenshot do app como promo image de IAP** — Apple rejeita 2.3.2.
3. **NUNCA deixe display name igual em Mensal e Anual** — Apple rejeita 2.3.2.
4. **SEMPRE `/termos` + `/privacidade` funcionais** antes de qualquer submit.
5. **SEMPRE bump da version em `kindar-native/app.json`** antes de tagar — se não, EAS rejeita build duplicado.

---

## Contatos

- Apple Dev: henrique.de.pedro@gmail.com (Team ID `ZQ83W8MYUZ`)
- Bundle ID: `com.kindar.app`
- EAS Project: `a0390045-42f5-4a37-8264-659fa09c1e0a`
- Produtos IAP: `com.kindar.{premium,elite}.{monthly,annual}`
