# iOS Build via GitHub Actions — Setup Guide

O workflow `.github/workflows/ios-build.yml` builda o app iOS na nuvem (macOS runner) e faz upload para o App Store Connect. Nao precisa de Mac local.

## Pre-requisitos

1. Apple Developer Account ($99/ano) — ja tem
2. App criado no App Store Connect com Bundle ID `com.kindar.app`
3. Produtos IAP criados no App Store Connect (4 subscriptions)

## Secrets necessarios no GitHub

Va em **Settings > Secrets and variables > Actions** no repositorio e adicione:

### 1. Certificado de distribuicao (P12)

No Mac (ou Keychain Access remoto):
```bash
# Gerar CSR e chave privada
openssl req -new -newkey rsa:2048 -nodes -keyout kindar.key -out kindar.csr -subj "/CN=Kindar/O=Kindar/C=BR"

# No Apple Developer Portal:
# Certificates > + > Apple Distribution > Upload CSR > Download .cer

# Converter .cer para .p12
openssl x509 -in distribution.cer -inform DER -out distribution.pem
openssl pkcs12 -export -inkey kindar.key -in distribution.pem -out kindar.p12

# Codificar em base64
base64 -i kindar.p12 | pbcopy
```

| Secret | Valor |
|---|---|
| `IOS_P12_BASE64` | Output do `base64` acima |
| `IOS_P12_PASSWORD` | Senha usada no export do .p12 |

### 2. Provisioning Profile

No Apple Developer Portal:
1. **Identifiers** > Registrar `com.kindar.app` (App ID)
2. Ativar capabilities: **Push Notifications**, **In-App Purchase**
3. **Profiles** > + > **App Store Connect** > Selecionar App ID + Certificate > Download

```bash
# Codificar em base64
base64 -i Kindar_AppStore.mobileprovision | pbcopy
```

| Secret | Valor |
|---|---|
| `IOS_PROVISIONING_PROFILE_BASE64` | Output do `base64` acima |
| `IOS_PROVISIONING_PROFILE_NAME` | Nome do profile (ex: "Kindar AppStore") |

### 3. Apple Team ID

| Secret | Valor |
|---|---|
| `APPLE_TEAM_ID` | Seu Team ID (visivel em developer.apple.com > Membership) |

### 4. App Store Connect API Key (para upload)

No App Store Connect:
1. **Users and Access** > **Integrations** > **App Store Connect API**
2. **Generate API Key** > Role: **App Manager**
3. Download o `.p8` file

```bash
# Codificar em base64
base64 -i AuthKey_XXXXXX.p8 | pbcopy
```

| Secret | Valor |
|---|---|
| `ASC_KEY_ID` | Key ID (mostrado no App Store Connect) |
| `ASC_ISSUER_ID` | Issuer ID (mostrado no App Store Connect) |
| `ASC_API_KEY_BASE64` | Output do `base64` do .p8 |

## Como usar

### Build manual (sem upload)
1. Va em **Actions** > **iOS Build & Upload** > **Run workflow**
2. Selecione `upload_to_appstore: false`
3. O IPA sera salvo como artifact para download

### Build + Upload para App Store Connect
1. Va em **Actions** > **iOS Build & Upload** > **Run workflow**
2. Selecione `upload_to_appstore: true`
3. Apos upload, va ao App Store Connect para submeter para review

### Build automatico via tag
```bash
git tag v1.0.0
git push origin v1.0.0
```
Isso triggera o build E upload automaticamente.

## Resumo dos secrets

| Secret | Descricao |
|---|---|
| `IOS_P12_BASE64` | Certificado Apple Distribution em base64 |
| `IOS_P12_PASSWORD` | Senha do certificado P12 |
| `IOS_PROVISIONING_PROFILE_BASE64` | Provisioning profile App Store em base64 |
| `IOS_PROVISIONING_PROFILE_NAME` | Nome do provisioning profile |
| `APPLE_TEAM_ID` | Team ID da Apple Developer Account |
| `ASC_KEY_ID` | App Store Connect API Key ID |
| `ASC_ISSUER_ID` | App Store Connect API Issuer ID |
| `ASC_API_KEY_BASE64` | App Store Connect API Key (.p8) em base64 |

## Custos

- GitHub Actions macOS runners: **10x o custo** de runners Linux
- Free tier: 2000 min/mes (equivale a ~200 min macOS)
- Cada build leva ~15-20 min = **~10-13 builds/mes gratis**
- Se precisar de mais: GitHub Teams ($4/user/mes) tem 3000 min
