# Kindar Native — Pipeline iOS (TestFlight + App Store)

Deploy iOS totalmente automatizado do Windows. Objetivo:
`git tag vX.Y.Z && git push --tags` → build na TestFlight distribuido aos testers.

**Ultima atualizacao:** 24/04/2026 — v1.1.19, build 32 na TestFlight.

---

## TL;DR — como fazer release

```bash
# 1. Commit e push
git commit -m "feat: ..."
git push origin main

# 2. Tag
git tag v1.1.X
git push origin v1.1.X

# 3. Assistir CI (automático)
gh run watch $(gh run list --workflow=ios-release.yml --limit 1 --json databaseId -q '.[0].databaseId')

# ~10-15 min depois: build aparece no TestFlight, Angelino e demais testers recebem email
```

Quando a App Privacy estiver preenchida em ASC (one-time manual), a pipeline tambem submete para review.

---

## Arquitetura

```
 git push --tags (v1.1.X)
         ↓
 GitHub Actions (.github/workflows/ios-release.yml)
 concurrency: ios-release-all  ← serializa todos os runs (evita race EAS autoIncrement)
         ↓
 ┌───────────────────────────────────────────────────────┐
 │ 1. Pre-submit audit  (scripts/pre-submit-audit.mjs)   │
 │ 2. Configure ASC     (kindar-asc.mjs)                 │
 │    ├─ App info (categorias, privacy URL)              │
 │    ├─ Subscriptions (4 IAPs — Premium/Elite M/A)      │
 │    ├─ Pricing Free   (/v1/appPriceSchedules POST)     │
 │    ├─ Version meta   (pt-BR + en-US, copyright)       │
 │    ├─ Review info    (contactPhone, demo account)     │
 │    ├─ Age rating     (schema 2024+ mix bool/enum)     │
 │    └─ Content rights (DOES_NOT_USE_THIRD_PARTY...)    │
 │ 3. EAS Build iOS production                           │
 │    └─ autoIncrement buildNumber, upload IPA pra EAS   │
 │ 4. EAS Submit → ASC  (AuthKey.p8 local credentials)   │
 │ 5. Wait Apple        (kindar-asc.mjs --wait-processing)│
 │    ├─ Poll /v1/builds?filter[app]= ate VALID          │
 │    └─ distributeBuildToTesters                        │
 │         ├─ Skip internal groups (auto-distribuidos)   │
 │         ├─ POST /betaGroups/{id}/relationships/builds │
 │         └─ POST /builds/{id}/relationships/           │
 │                individualTesters                      │
 │ 6. Submit for Review (kindar-asc.mjs --submit-review) │
 │    ├─ Reusa submission READY_FOR_REVIEW               │
 │    ├─ Anexa appStoreVersion                           │
 │    └─ PATCH submitted=true                            │
 └───────────────────────────────────────────────────────┘
         ↓
 App Store Connect (review em 24-48h se App Privacy OK)
 TestFlight (testers recebem email de convite automatico)
```

---

## Arquivos-chave

| Arquivo | Funcao |
|---------|--------|
| `.github/workflows/ios-release.yml` | Orquestracao completa |
| `kindar-asc.mjs` | Automacao App Store Connect API (metadata, submit, distribute) |
| `kindar-native/eas.json` | Profiles EAS (production usa `credentialsSource: local`) |
| `kindar-native/app.json` | Expo config (bundle id, version, plugins, permissions) |
| `AuthKey_736GBBC4YY.p8` | ASC API private key (na pasta raiz ou home, nunca commitado) |

---

## Setup inicial (já feito, documentado para futura rotação de credenciais)

### 1. App Store Connect API Key
Gere em https://appstoreconnect.apple.com/access/integrations/api. Role Admin.
- Salve o `.p8` como `AuthKey_{keyId}.p8` na pasta raiz do projeto
- KeyID: `736GBBC4YY`
- Issuer ID: `52e31db4-ca31-4a2c-b99d-86b8b599b29e`
- Team ID: `ZQ83W8MYUZ`

### 2. GitHub Secrets (Repo Settings → Secrets and variables → Actions)
- `ASC_KEY_ID` = `736GBBC4YY`
- `ASC_ISSUER_ID` = `52e31db4-...`
- `ASC_PRIVATE_KEY` = conteúdo do `.p8`
- `EXPO_TOKEN` = criado em `expo.dev/accounts/.../settings/access-tokens`
- `IOS_P12_BASE64`, `IOS_P12_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64` = gerados via `scripts/setup-ios-credentials.mjs` (executa uma vez)

### 3. Expo / EAS
`kindar-native/eas.json`:
```json
{
  "build": {
    "production": {
      "credentialsSource": "local",
      "ios": { "buildConfiguration": "Release", "autoIncrement": true }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "6762701916",
        "ascApiKeyPath": "../AuthKey.p8",
        "ascApiKeyId": "736GBBC4YY",
        "ascApiKeyIssuerId": "52e31db4-...",
        "appleTeamId": "ZQ83W8MYUZ"
      }
    }
  }
}
```

---

## Schema Age Rating (ASC API 2024+)

**Importante** — Apple mudou o schema; alguns campos viraram boolean mesmo tendo sido enum antes.

**BOOLEAN** (feature presence flags):
```ts
advertising: false,
messagingAndChat: true,
userGeneratedContent: true,
healthOrWellnessTopics: true,
gambling: false,
lootBox: false,
unrestrictedWebAccess: false,
parentalControls: false,
ageAssurance: false,
```

**ENUM** (`NONE | INFREQUENT_OR_MILD | FREQUENT_OR_INTENSE`):
```ts
alcoholTobaccoOrDrugUseOrReferences: "NONE",
contests: "NONE",
gamblingSimulated: "NONE",
gunsOrOtherWeapons: "NONE",
horrorOrFearThemes: "NONE",
matureOrSuggestiveThemes: "NONE",
medicalOrTreatmentInformation: "NONE",
profanityOrCrudeHumor: "NONE",
sexualContentGraphicAndNudity: "NONE",
sexualContentOrNudity: "NONE",
violenceCartoonOrFantasy: "NONE",
violenceRealistic: "NONE",
violenceRealisticProlongedGraphicOrSadistic: "NONE",
```

**Update pattern** (create nao funciona, 403):
```ts
const ardId = appInfo.relationships.ageRatingDeclaration.data.id;  // resolve via include
await PATCH(`/ageRatingDeclarations/${ardId}`, { ... });
```

---

## Pricing (Free app)

**Nao funciona** POST em `/appPrices` (404) ou `/v2/appPriceSchedules` (404).

**Funciona**: POST `/v1/appPriceSchedules` com manualPrices nested em `included`:
```ts
const freePointId = await GET(`/apps/${appId}/appPricePoints`, {
  "filter[territory]": "USA",
  "limit": 200,  // max 200 (nao 1000)
});  // procura customerPrice === 0

await POST(`/appPriceSchedules`, {
  data: {
    type: "appPriceSchedules",
    relationships: {
      app: { data: { type: "apps", id: appId } },
      baseTerritory: { data: { type: "territories", id: "USA" } },
      manualPrices: { data: [{ type: "appPrices", id: "new-price-1" }] },
    },
  },
  included: [{
    type: "appPrices",
    id: "new-price-1",
    relationships: {
      appPricePoint: { data: { type: "appPricePoints", id: freePointId } },
    },
  }],
});
```

---

## Review Submission — limite de 5 concurrent

Apple cap 5 `reviewSubmissions` por app. Se voce fez multiplos deploys que falharam no `submit_for_review`, cada um deixou uma submission orfa.

**Solucao** (implementado em `kindar-asc.mjs`): busca submission existente em state `READY_FOR_REVIEW` e reusa:
```ts
const existing = await GET(`/reviewSubmissions`, {
  "filter[app]": appId,
  "filter[platform]": "IOS",
  "fields[reviewSubmissions]": "state,submittedDate,platform",
});
const reusable = existing.data.find(s =>
  s.attributes.state === 'READY_FOR_REVIEW' && !s.attributes.submittedDate
);
if (reusable) {
  // Limpar items antigos, reusar ID
} else {
  // Criar nova (se houver slot)
}
```

---

## Auto-distribute para TestFlight testers

Apos build VALID, `distributeBuildToTesters(appId, buildId)` em `kindar-asc.mjs`:

```ts
// 1. Beta groups EXTERNOS (internals Apple distribui auto, rejeitam POST)
const groups = await GET(`/apps/${appId}/betaGroups`, { "fields[betaGroups]": "name,isInternalGroup" });
for (const g of groups.data.filter(x => !x.attributes.isInternalGroup)) {
  await POST(`/betaGroups/${g.id}/relationships/builds`, {
    data: [{ type: "builds", id: buildId }],
  });
}

// 2. Testers individuais via top-level /betaTesters (nao via /apps/{id}/betaTesters — 403)
const testers = await GET(`/betaTesters`, { "filter[apps]": appId, "limit": 200 });
await POST(`/builds/${buildId}/relationships/individualTesters`, {
  data: testers.data.map(t => ({ type: "betaTesters", id: t.id })),
});

// 3. Auto-notify
await PATCH(`/buildBetaDetails/${buildId}`, {
  data: { type: "buildBetaDetails", id: buildId, attributes: { autoNotifyEnabled: true } },
});
```

Testers recebem email de convite automaticamente.

---

## Itens manuais (ASC UI, one-time)

Nao ha API publica para:

### 1. App Privacy Nutrition Labels
`https://appstoreconnect.apple.com/apps/6762701916/app-privacy`
→ Responder questionario (Kindar coleta: email, nome, identificadores, dados de criancas) → **Publish**

### 2. Screenshots iPhone 6.7"
`https://appstoreconnect.apple.com/apps/6762701916/distribution/info` → Screenshots
→ Upload ≥1 por locale (pt-BR, en-US). Resolucao 1290×2796.

Depois desses 2 items, a pipeline submete para review sem intervencao (via `--full-release` flag ou etapa 6 do workflow).

---

## Rodar localmente (sem CI)

Usa-se quando GitHub Actions tem problema transient ou voce quer debugar:

```bash
cd kindar-native

# 1. Setup credentials (one-time ou quando expirar)
cd .. && node scripts/setup-ios-credentials.mjs && cd kindar-native

# 2. Build + Submit
eas build --platform ios --profile production --non-interactive --wait
eas submit --platform ios --profile production --latest

# 3. Wait + Distribute
cd .. && node kindar-asc.mjs --wait-processing
```

Obs.: EAS free tier = 30 builds/mes, depois slow queue. Se hitou 100% no mes, ou espera dia 1 do proximo mes ou paga pay-as-you-go.

---

## Debugging

### Ver status do ultimo run
```bash
gh run list --workflow=ios-release.yml --limit 1 --json databaseId,status,conclusion
```

### Ver logs de falha
```bash
gh run view {runId} --log-failed | tail -80
```

### Abortar run em andamento
```bash
gh run cancel {runId}
```

### Ver build queue do EAS
```bash
cd kindar-native && eas build:list --limit 5 --platform ios
```

### Ver state no ASC via script
```bash
node kindar-asc.mjs --dry-run
```

---

## Troubleshooting

### "You've already submitted this build"
- Causa: EAS Submit retry ou 2 runs concorrentes com mesmo buildNumber
- Fix: serializar workflow (`concurrency: ios-release-all`) + bump `version` em `app.json` se necessario

### "Cannot add internal group to a build" (422)
- Normal — internal groups (ASC team) recebem auto
- Filtro `isInternalGroup: true` aplicado em `distributeBuildToTesters`

### "The relationship 'betaTesters' does not allow 'GET_RELATED'" (403)
- Usar endpoint top-level: `GET /v1/betaTesters?filter[apps]={appId}` em vez de `/apps/{appId}/betaTesters`

### "Maximum limit=5 of concurrency has reached"
- 5+ reviewSubmissions orfas
- Fix: script reusa submission existente em `READY_FOR_REVIEW` em vez de criar nova

### "PUBLISH_REQUIREMENT_MISSING — data usages"
- App Privacy Labels nao publicado
- Manual: https://appstoreconnect.apple.com/apps/{appId}/app-privacy

### Build falha em "EAS Build" com generic "Build request failed"
- Transient do EAS server
- Fix: aguardar 1-2min e re-tagar, ou trigger via workflow_dispatch:
```bash
gh workflow run ios-release.yml --ref v1.1.X
```

---

## Historico de versoes

| Tag | Build | Conteudo |
|-----|-------|----------|
| v1.1.0 - 1.1.9 | 14-22 | Iteracoes ASC API schema 2024+ (age rating bool/enum, pricing v1, submission reuse, content rights) |
| v1.1.10 | 26 | Pricing com appPrices correto |
| v1.1.11 | 27 | TestFlight auto-distribute + dashboard rewrite |
| v1.1.12 | 28 | Calendario rico + feriados BR |
| v1.1.13 | — (travada) | Chat rico |
| v1.1.14 | 29 | Skip internal groups + betaTesters top-level |
| v1.1.15 | 30 | Escala custody_schedules + novo evento WebView + sync celular |
| v1.1.16 | 31 | Serializa CI + bump version 1.0.1 |
| v1.1.17 | 32 | `/criancas/[id]` WebView (paridade 964 LOC PWA) |
| v1.1.18 | (fila) | Swap fixes do PR #3 Angelino + direction correcta |
| v1.1.19 | (fila) | Dashboard health heuristica invertida + remove saldo + nextAction |

**Status: repo publico → CI ilimitada. Proximos builds entram sem quota.**
