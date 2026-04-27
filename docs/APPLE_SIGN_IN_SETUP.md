# Apple Sign In — Setup manual obrigatório

## Problema diagnosticado

Apple Sign In retornando erro silencioso no iOS. **Apple provider está desabilitado no Supabase Auth.**

Confirmação via `https://jquaysfeeuwvoydsgssi.supabase.co/auth/v1/settings`:

```json
"external": {
  "apple": false,    ← ❌ aqui
  "google": true,
  "email": true
}
```

O native (`kindar-native/src/services/social-auth.ts`) chama `supabase.auth.signInWithIdToken({ provider: 'apple', token })` corretamente, mas o Supabase rejeita silenciosamente porque o provider não está habilitado.

## Como resolver (~15 min, 1× setup)

### 1. Apple Developer Portal — gerar credenciais

#### a. Team ID — já temos
- `ZQ83W8MYUZ` (em `kindar-native/eas.json:62`)

#### b. Key ID + .p8 file
- developer.apple.com/account → "Keys" → **+** → criar nova key
- Nome: `Kindar Sign In`
- Habilitar: **Sign in with Apple**
- Configure → escolher Primary App ID = `com.kindar.app`
- Continue → Save → **Download .p8** (só pode baixar 1×)
- Anotar **Key ID** (10 chars)

#### c. Client ID — já temos
- `com.kindar.app` (Bundle ID em `kindar-native/app.json:18`)

### 2. Gerar JWT secret

Apple não usa client secret tradicional — usa JWT assinado com .p8.

```bash
# Salvar .p8 como AppleAuthKey.p8 (não comitar)
node -e '
const jwt = require("jsonwebtoken");
const fs = require("fs");
const TEAM_ID = "ZQ83W8MYUZ";
const KEY_ID = "XXXXXXXXXX";
const CLIENT_ID = "com.kindar.app";
const privateKey = fs.readFileSync("./AppleAuthKey.p8");
const token = jwt.sign({}, privateKey, {
  algorithm: "ES256",
  expiresIn: "180d",
  audience: "https://appleid.apple.com",
  issuer: TEAM_ID,
  subject: CLIENT_ID,
  keyid: KEY_ID,
});
console.log(token);
'
```

### 3. Habilitar no Supabase Dashboard

- supabase.com/dashboard/project/jquaysfeeuwvoydsgssi → **Authentication** → **Providers**
- **Apple** → toggle **Enabled** = ON
- **Client ID**: `com.kindar.app`
- **Client Secret**: JWT do passo 2
- Save

### 4. Verificar

```bash
curl -s "https://jquaysfeeuwvoydsgssi.supabase.co/auth/v1/settings" \
  -H "apikey: <ANON_KEY>" | jq '.external.apple'
# Esperado: true
```

### 5. Testar

- Login → "Entrar com Apple" no iPhone (já em produção via OTA)
- Native agora mostra mensagem específica em caso de erro (Wave H atualizou error mapping em `social-auth.ts`)

## Notas importantes

- **JWT expira em 180 dias** — agendar regeneração
- **NÃO comitar .p8** (adicionar `*.p8` no `.gitignore`)
- Service ID alternativo (web) NÃO é necessário para o flow native via id_token

## Status atual

- ✅ Code native correto (`signInWithIdToken({ provider: 'apple' })`)
- ✅ `usesAppleSignIn: true` em app.json
- ✅ Plugin `expo-apple-authentication` ativo
- ✅ Bundle ID `com.kindar.app` no Apple Developer
- ✅ Error mapping na Wave H (mensagens específicas em vez de "Erro" genérico)
- ❌ **Supabase provider Apple: DESABILITADO** ← resolver com este doc
