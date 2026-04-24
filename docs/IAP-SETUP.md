# Setup manual IAP — Apple App Store + RevenueCat

Guia obrigatório antes de submeter a primeira build com IAP. Tempo estimado: 45-60 min.

A integração de código já está em [kindar-native/src/services/iap.ts](../kindar-native/src/services/iap.ts) (commit `9d29c75`). Este documento cobre apenas as configurações manuais em 3 painéis web que **não podem ser automatizadas** via API ou commit.

## Pré-requisitos

- Conta Apple Developer Program ativa (R$ 99 USD/ano, pago)
- Acesso ao Team ID `ZQ83W8MYUZ` como Admin ou Account Holder
- Acesso ao App Store Connect com App ID `6762701916` (Kindar)
- Cadastro no RevenueCat (plano free cobre até $2.5k MRR — suficiente pro MVP)

---

## Etapa 1 — Apple Developer Portal (5 min)

Habilitar a capability **In-App Purchase** no App ID.

1. https://developer.apple.com/account/resources/identifiers/list
2. Encontre o identifier `com.kindar.app`
3. Clique em **Edit**
4. Marque a checkbox **In-App Purchase**
5. **Save**

O EAS vai regenerar o provisioning profile automaticamente na próxima build com `eas build --platform ios --profile production`.

**Não precisa editar `app.json`** — o Expo gerencia via managed workflow.

---

## Etapa 2 — App Store Connect (20 min)

Criar os 4 produtos IAP e colocar em estado "Ready to Submit".

### 2.1 Acordos e contratos

1. https://appstoreconnect.apple.com/business
2. **Paid Apps** → se não estiver "Active", complete:
   - **Contact info**: responsável legal + financeiro
   - **Bank info**: CNPJ + conta bancária PJ (pessoa física também aceita mas demora mais)
   - **Tax info**: tabela W-8BEN-E (Brasil)
3. **Aguardar aprovação** — pode levar de 24h a 5 dias úteis. **IAP não funciona sem isso.**

### 2.2 Criar os 4 produtos

Em https://appstoreconnect.apple.com → **My Apps** → **Kindar** → aba **Features** → **In-App Purchases** → **+**

Criar cada produto como **Auto-Renewable Subscription**. Primeiro precisa criar o **Subscription Group** chamado `Kindar Premium`:

**Subscription Group**: `kindar_premium_group` (Reference Name), `Kindar Premium` (Display Name)

Depois, dentro do grupo, criar os 4 produtos:

| Reference Name | Product ID | Preço (BRL) | Duração | Group |
|---|---|---|---|---|
| Premium Mensal | `com.kindar.premium.monthly` | R$ 29,90 | 1 mês | kindar_premium_group |
| Premium Anual | `com.kindar.premium.annual` | R$ 297,00 | 1 ano | kindar_premium_group |
| Elite Mensal | `com.kindar.elite.monthly` | R$ 49,90 | 1 mês | kindar_premium_group |
| Elite Anual | `com.kindar.elite.annual` | R$ 497,00 | 1 ano | kindar_premium_group |

Para cada produto, preencher:

**Localizações (Português-BR):**
- **Display Name**: "Kindar Premium" / "Kindar Premium Anual" / "Kindar Elite" / "Kindar Elite Anual"
- **Description**:
  - Premium Mensal: `Acesso completo ao Kindar: calendario ilimitado, chat sem limites, saude, documentos, IA e mais. Renova mensalmente.`
  - Premium Anual: `Tudo do Premium com desconto de 17%. Renova anualmente. Melhor valor.`
  - Elite Mensal: `Premium + suporte VIP, backup juridico, relatorios detalhados e exportacao PDF.`
  - Elite Anual: `Todos os recursos Elite com desconto de 17%. Renova anualmente.`

**Review Information (inglês, visível só para Apple review team):**
- **Screenshot**: upload de um screenshot da tela de pricing (1 por produto, 640×920 no mínimo)
- **Review notes**: 
  ```
  Auto-renewable subscription. Unlocks premium features in Kindar app.
  No trial. No promotional offer. Renewal handled by Apple StoreKit.
  Test account: reviewer@kindar.com.br / KindarReview2026
  ```

**Preço:**
- Selecionar **Brazil (BRL) 29.90** (ou correspondente)
- Apple calcula automaticamente os preços das outras 175 regiões — revisar rapidamente, pode aceitar

**Tax Category**: `Apps (Digital Goods/Services)` (padrão)

**Após preencher todos os campos**: o produto aparece como **Missing Metadata** → depois de completar, vira **Ready to Submit** (bolinha amarela). Esse é o estado correto antes da primeira build.

⚠️ **Importante**: produtos IAP são anexados ao **build** específico. Quando submeter a build 35 para review, selecionar os 4 produtos na seção "In-App Purchases" da versão da app. Sem isso, Apple review não vê os produtos e rejeita.

---

## Etapa 3 — RevenueCat (15 min)

Painel que intermedia StoreKit + Google Billing + webhooks.

### 3.1 Criar projeto

1. https://app.revenuecat.com/signup (ou login se já tiver)
2. **Create new project** → nome `Kindar`
3. **Add app** → plataforma **App Store**
4. Preencher:
   - **App name**: Kindar
   - **Bundle ID**: `com.kindar.app`
   - **App Store Connect API Key**: upload do `.p8` (o mesmo usado em `AuthKey.p8` do eas.json — ou gere um novo com permissão "App Manager" em ASC → Users and Access → Keys)
   - **Issuer ID**: `52e31db4-ca31-4a2c-b99d-86b8b599b29e`
   - **Key ID**: `736GBBC4YY`

### 3.2 App-specific Shared Secret

RevenueCat precisa disso pra validar receipts direto com a Apple.

1. ASC → **My Apps** → **Kindar** → **App Information** → role até o final → **App-Specific Shared Secret** → **Generate**
2. Copia o valor
3. RevenueCat → projeto Kindar → **App settings** → **App-Specific Shared Secret** → cola

### 3.3 Importar produtos

Com a App Store API Key conectada, RevenueCat auto-importa os 4 produtos criados na etapa 2.2. Verificar em **Products**.

Se não importar automaticamente, **+ New** → Product ID `com.kindar.premium.monthly` → tipo **Subscription** → Store **App Store**. Repetir pros 4.

### 3.4 Entitlements

Definem quais features premium liberam quando um produto é comprado. São usados em código como `info.entitlements.active['premium']`.

**+ New Entitlement**:

| Identifier | Description | Attached Products |
|---|---|---|
| `premium` | Acesso Premium completo | `com.kindar.premium.monthly` + `com.kindar.premium.annual` |
| `elite` | Acesso Elite (VIP + juridico) | `com.kindar.elite.monthly` + `com.kindar.elite.annual` |

### 3.5 Offerings

Agrupa produtos oferecidos na tela de pricing. O código `getAvailablePackages()` lê do **current offering**.

**+ New Offering**:

- **Identifier**: `default` (importante — código lê `offerings.current`)
- **Packages**:
  - `$rc_monthly` → `com.kindar.premium.monthly`
  - `$rc_annual` → `com.kindar.premium.annual`

Marcar o offering como **current**.

(Elite pode ser um offering separado `elite` ou incluído no mesmo `default` com packages adicionais — decisão de produto.)

### 3.6 API Key

RevenueCat → **API keys** → copia o **Public App-Specific key** (começa com `appl_`).

Adicionar em [eas.json](../kindar-native/eas.json):

```json
"EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY": "appl_XXXXXXXXXXXXXXXXXX"
```

⚠️ Colocar nos 3 profiles (`development`, `preview`, `production`).

### 3.7 Webhook (opcional mas recomendado)

RevenueCat manda eventos de lifecycle (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION) pro seu backend, que reconcilia a tabela `subscriptions`.

1. RevenueCat → **Integrations** → **Webhooks** → **+ Add**
2. URL: `https://kindar.com.br/api/iap/webhook` (endpoint ainda não existe — criar em próxima iteração)
3. Authorization header: um token arbitrário forte (salvar em env `REVENUECAT_WEBHOOK_SECRET`)

**Por enquanto**: o fluxo de `purchasePackage` chama `/api/iap/verify` direto após a compra, o que é suficiente pra MVP. Webhook é defesa adicional pra casos em que o app é killed antes do POST.

---

## Etapa 4 — Build + Teste (15 min)

### 4.1 Prebuild + instalação do módulo nativo

```bash
cd kindar-native
npm install
npx expo prebuild --clean
```

Isso regenera as pastas `ios/` e `android/` com o native module do `react-native-purchases` linkado.

### 4.2 Build EAS

```bash
eas build --platform ios --profile production
```

Automaticamente incrementa o buildNumber e:
- Puxa o provisioning profile atualizado (com capability IAP habilitada)
- Injeta as env vars do eas.json (incluindo RevenueCat API key)
- Envia pra TestFlight via submit profile

### 4.3 Teste na TestFlight

1. ASC → **Users and Access** → **Sandbox Testers** → criar uma conta fake (ex: `tester+kindar@teu-email.com`)
2. No iPhone: **Ajustes** → **App Store** → **Sandbox Account** → logar com o tester
3. Instalar a build nova pela TestFlight
4. Perfil → Assinatura → tocar num plano → deve aparecer o sheet StoreKit sandbox → confirmar (pedirá senha do tester)
5. Verificar no DB:
   ```sql
   SELECT * FROM subscriptions WHERE user_id = '<teu user_id>';
   ```
   Deve aparecer 1 linha com `payment_provider='apple'`, `status='active'`, `current_period_end` com +1 mês/ano.

### 4.4 Teste de restore

1. Deletar a app do device
2. Reinstalar pela TestFlight
3. Login com mesmo user
4. Perfil → Assinatura → tocar em **Restaurar compras** → deve reativar

---

## Checklist final antes de submeter pra review

- [ ] Paid Apps agreement ativo no ASC
- [ ] 4 produtos criados no subscription group `kindar_premium_group`
- [ ] Cada produto em "Ready to Submit" (amarelo) com metadata PT-BR + review notes EN
- [ ] Screenshot de review por produto
- [ ] In-App Purchase capability habilitada no App ID `com.kindar.app`
- [ ] RevenueCat projeto `Kindar` com API key conectada ao ASC
- [ ] App-Specific Shared Secret colado no RevenueCat
- [ ] 2 entitlements criados (`premium`, `elite`)
- [ ] 1 offering `default` marcado como current
- [ ] `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` preenchida nos 3 profiles do eas.json
- [ ] Build EAS passou com `expo prebuild --clean` anterior
- [ ] Sandbox tester confirmou compra end-to-end
- [ ] Restore testado após reinstalar
- [ ] Ao submeter a build pra review em ASC → aba **App Review Information** → seção **In-App Purchases** → selecionar os 4 produtos

---

## Troubleshooting comum

**"No products available" na tela de pricing:**
- Paid Apps agreement não está Active → bloqueia StoreKit
- Sandbox tester não está logado no device
- Produtos não estão no mesmo Subscription Group
- RevenueCat offering não está marcado como current
- API key errada (começa com `appl_` — key do RevenueCat, não do ASC)

**"Cannot connect to iTunes Store":**
- Testando em simulador (StoreKit 1 não funciona bem em sim — usar device real)
- Device sem internet
- Apple ID do sandbox não validou email

**Subscription ativa no RevenueCat mas não aparece no DB:**
- `/api/iap/verify` falhou silenciosamente → verificar logs Vercel
- Token Bearer inválido (session expirou durante compra)
- `apple_product_id` não bate no seed da tabela `plans` (ver migration 00051)

**Review rejeita "Guideline 3.1.1 — Unlock with IAP":**
- Há botão/link que leva pra pagamento externo (kindar.com.br/pricing). Remover do native ou esconder no iOS com `Platform.OS !== 'ios'`.

---

## Referências

- [Apple — Auto-Renewable Subscriptions](https://developer.apple.com/documentation/storekit/original_api_for_in-app_purchase/subscriptions_and_offers)
- [RevenueCat — Expo install guide](https://www.revenuecat.com/docs/getting-started/installation/expo)
- [RevenueCat — Entitlements](https://www.revenuecat.com/docs/getting-started/entitlements)
- Código Kindar: [kindar-native/src/services/iap.ts](../kindar-native/src/services/iap.ts)
- Backend verify: [src/app/api/iap/verify/route.ts](../src/app/api/iap/verify/route.ts)
