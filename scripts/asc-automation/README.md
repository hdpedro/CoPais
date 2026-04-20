# Kindar — App Store Connect Automation

Script Node.js que usa a **App Store Connect API** via JWT para automatizar configuracao do app Kindar.

## O que faz

1. **Encontra o app** no ASC via bundle ID (`com.kindar.app`)
2. **Configura categoria e privacy URL** (Lifestyle / Productivity, kindar.com.br/privacidade)
3. **Cria o Subscription Group** "Kindar Premium" com localizacoes pt-BR e en-US
4. **Cria os 4 subscriptions** com Product IDs corretos:
   - `com.kindar.elite.annual` (nivel 1, R$ 497/ano)
   - `com.kindar.elite.monthly` (nivel 2, R$ 49,90/mes)
   - `com.kindar.premium.annual` (nivel 3, R$ 297/ano)
   - `com.kindar.premium.monthly` (nivel 4, R$ 29,90/mes)
5. **Localiza cada subscription** (pt-BR e en-US)
6. **Atualiza metadados da versao** — descricao, keywords, promotional text, what's new
7. **Configura Review Information** — conta demo + notas para o revisor Apple

## Pre-requisitos

- Node.js 18+ (usa `fetch` nativo e `crypto.createSign`)
- Arquivo `.p8` baixado do ASC
- Key ID, Issuer ID do ASC

## Como rodar

### 1. Colocar o .p8 na raiz do projeto

```bash
# O arquivo baixado do ASC se chama AuthKey_<KEY_ID>.p8
# Exemplo: AuthKey_736GBBC4YY.p8
# Coloque na raiz do repo CoPais/
```

### 2. Exportar variaveis de ambiente

```bash
export ASC_KEY_ID=736GBBC4YY
export ASC_ISSUER_ID=52e31db4-ca31-4a2c-b99d-86b8b599b29e
# ASC_PRIVATE_KEY_PATH opcional — default e ./AuthKey_<KEY_ID>.p8
```

### 3. Rodar (dry-run primeiro)

```bash
# Dry run: so lista o que seria feito, sem fazer mudancas
node scripts/asc-automation/run.mjs --dry-run

# Execucao real
node scripts/asc-automation/run.mjs
```

## Saida esperada

```
Kindar — App Store Connect Automation
20/04/2026 10:00:00

✓ Key ID: 736GBBC4YY
✓ Issuer: 52e31db4-ca31-4a2c-b99d-86b8b599b29e
✓ Key file: ./AuthKey_736GBBC4YY.p8

── 1. Encontrando app no ASC ──
→ Buscando bundle ID: com.kindar.app
✓ App encontrado: "Kindar" (ID: 1234567890)

── 2. Configurando info do app ──
✓ Categorias: LIFESTYLE / PRODUCTIVITY
✓ pt-BR: privacy URL atualizada
✓ en-US: privacy URL atualizada

── 3. Configurando subscriptions ──
→ Criando grupo "Kindar Premium"...
✓ Grupo criado: 987654321
→ Criando com.kindar.elite.annual...
✓ ID: 12345
...

── 4. Configurando versao atual ──
✓ pt-BR: metadados atualizados
✓ en-US: metadados atualizados

── 5. Configurando Review Information ──
✓ Review details criados

── Concluido ──
✓ Execucao finalizada. Verifique no ASC.
```

## O que o script NAO faz (precisa ser manual)

| Item | Onde fazer |
|------|-----------|
| Precos das subscriptions | ASC UI — selecionar tier de preco em cada sub |
| App Review Screenshots | ASC UI — upload PNG/JPG da tela de pricing |
| Privacy Nutrition Labels | ASC UI — configurar em App Privacy |
| Screenshots do app (6.7", 6.5") | Simulador iOS + ASC UI upload |
| Submit for Review | ASC UI — clicar apos tudo configurado |

## Troubleshooting

**Erro 401 Unauthorized**
- Verifique se o `.p8` esta intacto (não edite!)
- Confirme que o Key ID bate com o nome do arquivo
- Tente regerar uma chave nova no ASC

**Erro "App not found"**
- Confirme que o app existe no ASC com bundle ID `com.kindar.app`
- Se nao existir, crie em "My Apps" > + > New App

**Erro 409 Conflict em subscription**
- Ja existe um subscription com esse Product ID (o script detecta e pula)
- Se for produto antigo (`com.gripflow.*`), delete manualmente no ASC primeiro

**Erros 400 em localization**
- Verifique se o locale esta no formato correto (pt-BR, en-US)
- Apple as vezes limita localizations na versao inicial

## Seguranca

- O `.p8` nunca deve ser commitado (esta no `.gitignore`)
- As credenciais ficam no ambiente local, nao no repo
- O JWT gerado tem vida curta (20 min, renovado automaticamente)
- A chave e valida ate ser revogada no ASC

## Referencias

- [ASC API Docs](https://developer.apple.com/documentation/appstoreconnectapi)
- [Generating Tokens](https://developer.apple.com/documentation/appstoreconnectapi/generating_tokens_for_api_requests)
- [Subscription Workflow](https://developer.apple.com/documentation/appstoreconnectapi/create_a_subscription)
