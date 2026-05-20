# Templates de WhatsApp — Kindar

Documento de referência pros templates aprovados no Meta Business Manager que o Kindar usa via WhatsApp Cloud API.

---

## 🚨 Bug raiz que motivou esse doc

Carolina (e mais 5 testers) tentaram linkar telefone, **WhatsApp Cloud API aceitou o envio (200 OK)** mas **mensagem nunca chegou**. Causa:

- API Free-form text exige **janela 24h aberta** (user mandou msg pro bot nas últimas 24h)
- Novos signups NUNCA têm janela aberta → mensagem dropada silenciosamente
- Taxa histórica de sucesso: **54.5%** (6 verificados em 11 tentativas — todos os 5 falhados foram pelo mesmo motivo)

**Fix definitivo:** usar **template AUTHENTICATION aprovado**, que funciona fora da janela 24h.

---

## 1. Template `verificacao_kindar` — CRÍTICO

### Como criar no Meta Business Manager

1. Abrir https://business.facebook.com/wa/manage/message-templates/
2. Selecionar o **business account** Kindar (henrique.de.pedro@gmail.com)
3. Clicar **"Create template"**

### Configuração exata

| Campo | Valor |
|---|---|
| **Category** | `AUTHENTICATION` (não Marketing nem Utility) |
| **Name** | `verificacao_kindar` (snake_case, lowercase) |
| **Language** | `Portuguese (BR)` → código `pt_BR` |
| **Body** | `Seu código Kindar é: *{{1}}*. Expira em 10 minutos.` |
| **Variable example** | `123456` (Meta exige exemplo pra aprovar) |

### Header / Footer
- **Header:** vazio (não precisa)
- **Footer:** opcional — pode ser `Não compartilhe este código com ninguém.`
- **Buttons:** vazio (template AUTHENTICATION tem botão "Copy code" automático)

### Submit

Após salvar, Meta revisa em **1-24h**. Status fica em `In Review`. Quando aprovado, vira `Active`.

Status do template é checável via:
- Dashboard: status badge ao lado do nome
- API: `GET /v21.0/{{whatsapp_business_account_id}}/message_templates`

### Por que `AUTHENTICATION` (não Marketing/Utility)

Meta criou a categoria `AUTHENTICATION` em 2023 especificamente pra OTP. Vantagens:
- Aprovação mais rápida (~1h vs ~24h)
- Permite envio fora da janela 24h
- **Custo menor:** $0.00375/OTP no Brasil vs $0.05 marketing
- Botão "Copy code" automático na UI do WhatsApp
- **Não conta como "marketing message"** pra reputação do número

---

## 2. Outros templates do Kindar

Quando adicionar mais features, documentar aqui:

| Template | Categoria | Quando usar |
|---|---|---|
| `verificacao_kindar` | AUTHENTICATION | OTP linkar telefone |
| _(futuro)_ `aprovacao_despesa` | UTILITY | Notificação de despesa pendente do coparente |
| _(futuro)_ `lembrete_consulta` | UTILITY | 24h antes de consulta médica |
| _(futuro)_ `boas_vindas` | MARKETING | Convite pra usar o Bot Kindar |

---

## 3. Como o código usa o template

`src/lib/whatsapp/send-otp.ts`:

```ts
// 1. Tenta TEMPLATE primeiro (cross-janela-24h)
await sendTemplateMessage(phoneWithout, "verificacao_kindar", "pt_BR", [otp]);

// 2. Se falhar (template não existe / não aprovado / outro erro),
//    cai pra TEXT (só funciona se há janela 24h aberta)
await sendTextMessage(phoneWithout, "Kindar - Código: *123456*. Expira em 10 min.");

// 3. Se ambos falham, reporta crítico + retorna erro user-friendly
```

Quando template estiver aprovado: 99%+ taxa de delivery imediato pra novos users.

Enquanto template estiver `In Review`: usuário recebe `error` no UI com mensagem "Contate suporte@kindar.com.br" — você libera manualmente via:

```sql
UPDATE whatsapp_phone_links
SET verified_at = now(), verification_code = NULL, verification_expires_at = NULL
WHERE user_id = '<UUID>' AND is_active = true;
```

---

## 4. Webhook delivery status — futuro

Próxima sprint (não bloqueia esse fix): tratar callback `messages.statuses` no `/api/whatsapp/webhook` pra marcar `whatsapp_phone_links.delivery_failed_at` quando Meta reporta `failed`. Isso permite:
- Detectar antecipadamente número errado / banido
- Diferenciar "código enviou mas user não viu" vs "código nunca chegou"
- Métrica de saúde do canal no `/admin/metrics`

---

## 5. Checklist quando submeter `verificacao_kindar`

- [ ] Categoria: AUTHENTICATION
- [ ] Name: `verificacao_kindar` (exato)
- [ ] Language: pt_BR
- [ ] Body literal: `Seu código Kindar é: *{{1}}*. Expira em 10 minutos.`
- [ ] Variable exemplo: `123456`
- [ ] Status pós-submit: `In Review` → aguardar 1-24h → `Active`
- [ ] Testar com `/perfil/WhatsAppLinkSection` ou `/api/native/whatsapp` action `request`
