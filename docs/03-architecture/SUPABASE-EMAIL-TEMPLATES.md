# Templates de Email Supabase Auth — Kindar

Este documento contém o HTML **pronto para colar** nos 4 templates de email do Supabase Auth. Substituir todos os templates atuais por estes corrige o bug PKCE cross-device que travava signups no flow `?code=`.

## Por que trocamos

O Supabase Auth gera o link de confirmação de duas formas:

- `{{ .ConfirmationURL }}` → gera `?code=XXX` (**PKCE — quebra em WebView Gmail/Outlook**)
- `{{ .TokenHash }}` → gera `?token_hash=XXX` (**funciona cross-device**)

PKCE exige o `code_verifier` em cookie do mesmo browser onde o signup foi feito. Quando o usuário toca o link de email no app Gmail (que abre WebView interno), o cookie não está presente — `exchangeCodeForSession` falha — `email_confirmed_at` fica NULL — usuário trava.

`token_hash` é processado pelo nosso `/auth/confirm` route via `verifyOtp({type, token_hash})`. **Não exige cookie do browser de origem.** Padrão Tier A de SaaS (Stripe, Linear, Cal.com).

---

## Como aplicar

1. Abra https://supabase.com/dashboard/project/jquaysfeeuwvoydsgssi/auth/templates
2. Para cada um dos 4 templates abaixo:
   - Selecione o template no menu lateral
   - Cole o **Subject** no campo de assunto
   - Cole o **HTML** no editor (substituindo TUDO que tiver lá)
   - Click "Save changes"
3. Pronto. O próximo signup já usa token_hash.

---

## 1. Confirm signup

**Subject:**
```
Confirme seu e-mail no Kindar
```

**Message body (HTML):**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF8;padding:40px 0">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
      <tr><td align="center" style="padding:0 24px 32px">
        <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
        <p style="font-size:13px;color:#9A8878;margin:4px 0 0">a rotina organizada · para toda a família</p>
      </td></tr>
      <tr><td style="padding:0 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.04)">
          <tr><td style="padding:32px">
            <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 12px">Bem-vindo ao Kindar</h2>
            <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 24px">
              Confirme seu e-mail clicando no botão abaixo. O link funciona em qualquer dispositivo onde você abrir esta mensagem.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td align="center">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard"
                   style="display:inline-block;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none">
                  Confirmar e-mail
                </a>
              </td></tr>
            </table>
            <p style="font-size:13px;color:#6B6560;line-height:1.6;margin:24px 0 0">
              Se o botão não funcionar, copie e cole este link no navegador:
            </p>
            <p style="font-size:12px;color:#9A8878;word-break:break-all;margin:8px 0 0">
              {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
            </p>
            <p style="font-size:13px;color:#9A8878;line-height:1.6;margin:24px 0 0">
              Se você não criou uma conta no Kindar, pode ignorar este e-mail.
            </p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px">
        <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
```

---

## 2. Magic Link

**Subject:**
```
Seu link de acesso ao Kindar
```

**Message body (HTML):**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF8;padding:40px 0">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
      <tr><td align="center" style="padding:0 24px 32px">
        <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
        <p style="font-size:13px;color:#9A8878;margin:4px 0 0">a rotina organizada · para toda a família</p>
      </td></tr>
      <tr><td style="padding:0 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.04)">
          <tr><td style="padding:32px">
            <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 12px">Entre sem senha</h2>
            <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 24px">
              Clique no botão abaixo para entrar no Kindar. Esse link vale por uma hora e funciona em qualquer dispositivo.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td align="center">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard"
                   style="display:inline-block;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none">
                  Entrar no Kindar
                </a>
              </td></tr>
            </table>
            <p style="font-size:13px;color:#6B6560;line-height:1.6;margin:24px 0 0">
              Se o botão não funcionar, copie e cole este link no navegador:
            </p>
            <p style="font-size:12px;color:#9A8878;word-break:break-all;margin:8px 0 0">
              {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard
            </p>
            <p style="font-size:13px;color:#9A8878;line-height:1.6;margin:24px 0 0">
              Se você não solicitou este link, pode ignorar este e-mail — sua conta segue segura.
            </p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px">
        <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
```

---

## 3. Reset Password

**Subject:**
```
Redefinir sua senha no Kindar
```

**Message body (HTML):**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF8;padding:40px 0">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
      <tr><td align="center" style="padding:0 24px 32px">
        <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
        <p style="font-size:13px;color:#9A8878;margin:4px 0 0">a rotina organizada · para toda a família</p>
      </td></tr>
      <tr><td style="padding:0 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.04)">
          <tr><td style="padding:32px">
            <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 12px">Redefinir senha</h2>
            <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 24px">
              Recebemos um pedido para redefinir sua senha. Clique no botão abaixo para escolher uma nova.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td align="center">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password"
                   style="display:inline-block;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none">
                  Redefinir senha
                </a>
              </td></tr>
            </table>
            <p style="font-size:13px;color:#6B6560;line-height:1.6;margin:24px 0 0">
              Se o botão não funcionar, copie e cole este link no navegador:
            </p>
            <p style="font-size:12px;color:#9A8878;word-break:break-all;margin:8px 0 0">
              {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
            </p>
            <p style="font-size:13px;color:#9A8878;line-height:1.6;margin:24px 0 0">
              Se você não pediu pra redefinir, pode ignorar este e-mail. Sua senha atual continua valendo.
            </p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px">
        <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
```

---

## 4. Change Email Address

**Subject:**
```
Confirme seu novo e-mail no Kindar
```

**Message body (HTML):**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF8;padding:40px 0">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
      <tr><td align="center" style="padding:0 24px 32px">
        <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
        <p style="font-size:13px;color:#9A8878;margin:4px 0 0">a rotina organizada · para toda a família</p>
      </td></tr>
      <tr><td style="padding:0 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.04)">
          <tr><td style="padding:32px">
            <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 12px">Confirmar novo e-mail</h2>
            <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 24px">
              Você pediu pra trocar o e-mail da sua conta no Kindar. Confirme clicando no botão abaixo.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td align="center">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/perfil"
                   style="display:inline-block;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none">
                  Confirmar novo e-mail
                </a>
              </td></tr>
            </table>
            <p style="font-size:13px;color:#6B6560;line-height:1.6;margin:24px 0 0">
              Se o botão não funcionar, copie e cole este link no navegador:
            </p>
            <p style="font-size:12px;color:#9A8878;word-break:break-all;margin:8px 0 0">
              {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/perfil
            </p>
            <p style="font-size:13px;color:#9A8878;line-height:1.6;margin:24px 0 0">
              Se você não pediu essa mudança, ignore este e-mail e troque sua senha por precaução.
            </p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px">
        <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
```

---

## Validação após colar

Depois de colar e salvar os 4 templates:

1. Crie uma conta teste com um e-mail seu (gmail/outlook): `seu+test@gmail.com`
2. Abra o e-mail **no app Gmail do celular** (cenário que travava antes)
3. Clique no botão "Confirmar e-mail"
4. Deve redirecionar pra `/dashboard` direto, sem erro de "link expirado"
5. Em `auth.users` o `email_confirmed_at` aparece preenchido

Se algo falhar, abra `/admin/metrics` e veja a tile "Saúde do funil de signup" — vai mostrar contagem de stuck em tempo real.

## Variáveis Supabase disponíveis

Pra referência futura. Não usadas nos templates acima mas podem ser úteis:

- `{{ .Email }}` — e-mail do usuário (use no copy: "Você criou conta com {{ .Email }}")
- `{{ .Token }}` — token OTP de 6 dígitos (se quiser fluxo de código em vez de link)
- `{{ .TokenHash }}` — usado nos nossos templates
- `{{ .SiteURL }}` — `NEXT_PUBLIC_APP_URL` configurada no Supabase
- `{{ .ConfirmationURL }}` — URL PKCE legacy — **NUNCA usar nos novos templates**
- `{{ .RedirectTo }}` — `emailRedirectTo` passado pelo cliente
