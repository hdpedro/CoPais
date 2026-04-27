# Templates de Email — Supabase Auth (via Resend SMTP)

Copie cada template no painel do Supabase:
**Project Settings > Authentication > Email Templates**

---

## 1. Confirm Signup (Confirmar cadastro)

**Subject:** `Confirme sua conta no Kindar`

**Body:**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">A rotina organizada para toda a familia</p>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">Confirme seu email</h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Clique no botao abaixo para confirmar sua conta e comecar a usar o Kindar.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none">
      Confirmar minha conta
    </a>
    <p style="font-size:12px;color:#9A8878;margin:20px 0 0;text-align:center">
      Se voce nao criou uma conta no Kindar, ignore este email.
    </p>
  </div>
  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar. Todos os direitos reservados.</p>
  </div>
</div>
</body>
</html>
```

---

## 2. Reset Password (Recuperar senha)

**Subject:** `Recupere sua senha — Kindar`

**Body:**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">A rotina organizada para toda a familia</p>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">Recuperar senha</h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Voce solicitou a recuperacao de senha. Clique no botao abaixo para criar uma nova senha.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none">
      Redefinir minha senha
    </a>
    <p style="font-size:12px;color:#9A8878;margin:20px 0 0;text-align:center">
      Se voce nao solicitou a recuperacao, ignore este email. Sua senha nao sera alterada.
    </p>
  </div>
  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar. Todos os direitos reservados.</p>
  </div>
</div>
</body>
</html>
```

---

## 3. Magic Link (Login sem senha)

**Subject:** `Seu link de acesso — Kindar`

**Body:**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">A rotina organizada para toda a familia</p>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">Acesse o Kindar</h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Clique no botao abaixo para acessar sua conta.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none">
      Acessar minha conta
    </a>
    <p style="font-size:12px;color:#9A8878;margin:20px 0 0;text-align:center">
      Este link expira em 24 horas. Se voce nao solicitou, ignore este email.
    </p>
  </div>
  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar. Todos os direitos reservados.</p>
  </div>
</div>
</body>
</html>
```

---

## 4. Invite User (Convite para grupo)

**Subject:** `Voce foi convidado para o Kindar`

**Body:**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">A rotina organizada para toda a familia</p>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">Voce foi convidado!</h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Alguem te convidou para organizar a rotina das criancas no Kindar. Clique no botao abaixo para aceitar o convite.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none">
      Aceitar convite
    </a>
  </div>
  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar. Todos os direitos reservados.</p>
  </div>
</div>
</body>
</html>
```

---

## Configuracao SMTP no Supabase

1. Acesse: **supabase.com** > projeto CoPais > **Project Settings** > **Authentication** > **SMTP Settings**
2. Ative **"Enable Custom SMTP"**
3. Preencha:
   - **Sender email:** `noreply@kindar.com.br`
   - **Sender name:** `Kindar`
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** (sua RESEND_API_KEY)
4. Clique **Save**

5. Va em **Authentication** > **Email Templates**
6. Cole cada template acima na secao correspondente
7. Atualize o **Subject** de cada um
