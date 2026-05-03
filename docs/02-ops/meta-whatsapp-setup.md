# Meta WhatsApp Setup — Checklist do Dono

> Para ativar o **Kindar Assistente** em produção depois do merge da branch
> `feat/whatsapp-v2-full` (PR #8). Sem essas etapas, o webhook devolve 401
> e nenhuma mensagem chega no usuário.
>
> Tudo aqui é feito **fora do código** — Meta Business UI + Vercel
> Environment Variables. Não posso automatizar (exige login Meta + tokens
> privados seus).

---

## 0. Pré-requisitos

| Item | Como obter |
|---|---|
| Meta Business Account | https://business.facebook.com (já existente para Kindar) |
| WhatsApp Business Account (WABA) | Dentro da Meta Business → "Adicionar WhatsApp Business Account" |
| Número de telefone Meta-test ou produção | Within WABA → "Adicionar número" — recomendo **número de teste** primeiro (gratuito, manda sem template) |
| App Meta com produto WhatsApp ativado | https://developers.facebook.com/apps |

---

## 1. Pegar credenciais no Meta App Dashboard

Em https://developers.facebook.com/apps → seu app Kindar → **WhatsApp → API Setup**:

| Variável | Onde está | Exemplo (formato) |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | "From / Phone number ID" no topo | `123456789012345` |
| `WHATSAPP_ACCESS_TOKEN` | "Temporary access token" (24h) ou **System User Token permanente** (recomendado) | `EAAxx…` |
| `WHATSAPP_VERIFY_TOKEN` | Você inventa — string aleatória forte (>32 chars) | `kindar-wa-verify-7a9f3c…` |
| `WHATSAPP_APP_SECRET` | Settings → Basic → "App Secret" (clica "Show") | `abc123…` (32 chars hex) |

**Importante**: o token temporário expira em 24h. Para produção use **System User Access Token** sem expiração:
1. Meta Business → Business Settings → Users → System Users → Add
2. Permissões: `whatsapp_business_messaging`, `whatsapp_business_management`
3. Generate token → Token nunca expira (ou expira em ~60 dias dependendo da conta)

---

## 2. Configurar Environment Variables no Vercel

Project: **kindar** (https://vercel.com/hdpedros-projects/kindar)

`Settings → Environment Variables` — adicionar **em Production e Preview**:

```
WHATSAPP_PHONE_NUMBER_ID=<phone_number_id>
WHATSAPP_ACCESS_TOKEN=<access_token>
WHATSAPP_VERIFY_TOKEN=<verify_token_que_voce_inventou>
WHATSAPP_APP_SECRET=<app_secret>
```

Após salvar, **redeploy** (ou aguarde o próximo push). As envs só entram após redeploy.

---

## 3. Configurar Webhook na Meta

Em https://developers.facebook.com/apps → seu app → **WhatsApp → Configuration → Webhook**:

1. Clique **Edit**
2. **Callback URL**: `https://kindar.com.br/api/whatsapp/webhook`
   - Substitua pelo seu domínio real de produção. Confirme em Vercel → Project → Domains.
3. **Verify Token**: cole o **mesmo valor** de `WHATSAPP_VERIFY_TOKEN` do passo 2
4. Clique **Verify and save**
   - Meta vai fazer um GET para o callback URL com `hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
   - Nosso código (`src/app/api/whatsapp/webhook/route.ts:19-34`) responde com o `challenge` se o token bater
   - **Falhou?** → `WHATSAPP_VERIFY_TOKEN` em Vercel não é igual ao que você colou aqui, OU o redeploy não rodou ainda

5. Em **Webhook fields**, **Subscribe** aos seguintes eventos:
   - ✅ `messages` — mensagens inbound do usuário (essencial)
   - ✅ `message_status` — confirmação de envio/entrega/leitura (recomendado para logs)
   - ✅ `messaging_handovers` — apenas se for usar handoff entre apps (skip por enquanto)

---

## 4. Testar end-to-end com número Meta-test

Meta dá 1 número de teste por app. Em **API Setup**:

1. **To**: cadastre **até 5 números** que podem receber mensagens (no número de teste, só esses 5 conseguem ver respostas — restrição da Meta para números não-aprovados)
2. **From**: copie o número de teste mostrado
3. **Test message**: clique "Send message" → você deve receber no WhatsApp do número adicionado em "To"

Para validar o **inbound**:
1. Pegue um dos números de "To"
2. Vincule no Kindar pelo PWA: `https://kindar.com.br/perfil` → seção WhatsApp → coloque o número e verifique
3. Mande qualquer mensagem do WhatsApp para o número de teste Meta
4. Espere a resposta do bot — se chegar, fluxo end-to-end OK

**Smoke completo:**
- [ ] Texto: "paguei 120 da escola do Joaquim" → bot pede confirmação → "sim" → cria despesa
- [ ] Áudio: gravar "marca consulta no pediatra dia 20" → transcrição + agendamento
- [ ] Foto de recibo (sem caption) → bot pede categoria → criança → confirma
- [ ] Foto com caption "/receita" → OCR de prescription
- [ ] "trocar dia 15 com a Maria" → swap_request criado → coparente recebe card com botões Aprovar/Recusar
- [ ] "saldo" → mostra balanço de despesas pendentes
- [ ] "aprovações" → lista pendências

---

## 5. Migrar para número de produção (quando estiver pronto)

O número de teste tem 3 limitações:
- Só 5 destinatários cadastrados manualmente recebem
- Marca "[TESTE]" em todas as mensagens
- Não pode usar templates não-aprovados

Para produção:
1. **Verificar Business Manager** com documentos de PJ (CNPJ Kindar)
2. **Adicionar número de telefone** próprio (linha celular ou voip que você possua) ao WABA
3. **Verificar via SMS** que recebe códigos
4. **Display Name** aprovado pela Meta (~30min review)
5. Atualizar `WHATSAPP_PHONE_NUMBER_ID` no Vercel para o novo phone_number_id

---

## 6. (Opcional, M1.2) Templates aprovados pela Meta

Necessário **só** para outbound proativo **fora da janela de 24h** desde a última msg do usuário (a janela 24h-rule da Meta). Para tudo dentro de 24h (ex: respostas, notificações de aprovação após swap_request), **não precisa template**.

Templates atuais que valem submeter:
- `daily_summary_pt_BR` — "Bom dia! Você tem: X compromissos hoje, Y pendências"
- `swap_pending_pt_BR` — "Você tem uma solicitação de troca de dia pendente. Toque para ver."
- `expense_pending_pt_BR` — "Despesa pendente de aprovação: R$ X — descrição"

Cada template leva 1-3 dias para review. **Não bloqueia M1.1** — pode ficar pra depois.

---

## 7. Variáveis Vercel — checklist final

Após tudo configurado:

```
# Já existentes (não mexer)
NEXT_PUBLIC_SUPABASE_URL=https://jquaysfeeuwvoydsgssi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<existente>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existente>
GROQ_API_KEY=<existente>
OPENAI_API_KEY=<existente>

# Novas (passo 2)
WHATSAPP_PHONE_NUMBER_ID=<obrigatório>
WHATSAPP_ACCESS_TOKEN=<obrigatório, idealmente System User permanente>
WHATSAPP_VERIFY_TOKEN=<obrigatório, mesmo do passo 3>
WHATSAPP_APP_SECRET=<obrigatório para validação HMAC do webhook>
```

---

## 8. Validação de saúde pós-config

Endpoints para checar manualmente:

| Verificar | Como |
|---|---|
| Webhook responde ao GET | `curl 'https://kindar.com.br/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<seu_token>&hub.challenge=test123'` → deve retornar `test123` |
| Tabela `whatsapp_message_logs` recebe inbound | Após mandar uma msg de teste, query no Supabase: `SELECT * FROM whatsapp_message_logs ORDER BY created_at DESC LIMIT 5` |
| View `child_current_status` retorna dados | Já validei: 25 linhas em prod ✅ |
| View `expense_balance_per_user` retorna dados | Já validei: 13 linhas em prod ✅ |

---

## 9. Custos estimados (Meta Cloud)

Dentro da janela 24h: **gratuito**.
Templates fora da janela: **R$ 0,15-0,30 por mensagem** dependendo da categoria (utility/marketing/auth).

Mantendo o assistente **reativo** (responde quando usuário fala), o custo Meta tende a zero. Os custos reais são:
- Groq/OpenAI por LLM call (~US$ 0,001-0,01 por mensagem)
- Whisper/Groq por transcrição de áudio (~US$ 0,003 por áudio)
- Storage Supabase (já incluído)

---

## 10. Rollback

Se algo der errado em produção e quiser desligar o WhatsApp temporariamente:

**Opção fast** (15s, recomendado):
- Vercel → Settings → Environment Variables → renomeie `WHATSAPP_ACCESS_TOKEN` para `_DISABLED_WHATSAPP_ACCESS_TOKEN`
- Redeploy. Webhook continua respondendo 200 (Meta não retenta), mas `client.ts:getConfig()` lança erro logado e nada é enviado.

**Opção definitiva**:
- Meta App Dashboard → Webhook → Delete callback URL.
- Mensagens param de chegar até reconfigurar.

A migration `00065` é read-only (cria 2 views). Para reverter:
```sql
DROP VIEW IF EXISTS public.child_current_status;
DROP VIEW IF EXISTS public.expense_balance_per_user;
```

---

**Criado por**: Claude Opus 4.7 (sessão 2026-05-03)
**Issue tracker do M1.2 (não-bloqueante)**: events/activities/health domain extractions, cron daily_summary, e2e webhook tests, templates Meta aprovados.
