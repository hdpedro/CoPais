# Kindar — Como Funciona a Nossa Operação

> Documento para entendimento do processo de desenvolvimento, infraestrutura e próximos passos do Kindar.

---

## 1. O QUE É O 2LARES (em uma frase)

Um aplicativo web (que funciona como app no celular) para pais separados organizarem a rotina dos filhos: calendário de guarda, despesas compartilhadas, comunicação e documentos — tudo em um lugar só.

---

## 2. COMO O SISTEMA FUNCIONA (sem termos técnicos)

Imagine o Kindar como um prédio com 3 andares:

### 🏠 Andar 1 — O que o usuário vê (Frontend)
**Ferramenta: Next.js + React (hospedado na Vercel)**

É a "cara" do aplicativo. Tudo que o usuário toca, vê e interage. Inclui:
- Telas de login, cadastro, dashboard
- Calendário de guarda
- Chat entre os pais
- Controle financeiro
- Documentos, saúde, escola

**Onde fica hospedado:** Vercel (como se fosse o "terreno" onde o prédio está construído)
- Custo atual: **Gratuito**
- O site fica no ar 24h, em servidores espalhados pelo mundo
- Quando fazemos uma atualização no código, o site atualiza sozinho em ~40 segundos

### 🗄️ Andar 2 — Onde ficam os dados (Banco de Dados)
**Ferramenta: Supabase**

É o "cofre" do aplicativo. Guarda todos os dados dos usuários:
- Contas e perfis dos usuários
- Eventos do calendário
- Mensagens do chat
- Registros financeiros
- Documentos enviados

**Também faz:**
- Login seguro (autenticação)
- Atualização em tempo real (quando alguém manda mensagem no chat, aparece na hora)
- Controle de quem pode ver o quê (segurança)

**Onde fica hospedado:** Servidores da Supabase (AWS)
- Custo atual: **Gratuito**

### 🔄 Andar 3 — O processo de atualização (Deploy automático)
**Ferramentas: Git + GitHub + Vercel**

É como o sistema se atualiza:

```
Desenvolvedor escreve código
        ↓
Envia para o GitHub (repositório de código)
        ↓
Vercel detecta automaticamente
        ↓
Compila e publica em ~40 segundos
        ↓
Usuários já veem a versão nova
```

Ninguém precisa "desligar" o sistema para atualizar. É automático.

---

## 3. O QUE CADA "AGENTE" FAZ

| Serviço | O que faz | Analogia simples | Custo atual |
|---------|-----------|-------------------|-------------|
| **Vercel** | Hospeda o site e entrega para os usuários | O "terreno e prédio" | Gratuito |
| **Supabase** | Guarda dados, faz login, chat em tempo real | O "cofre e porteiro" | Gratuito |
| **GitHub** | Guarda o código-fonte e histórico de mudanças | O "cartório" do código | Gratuito |
| **Next.js/React** | Framework que constrói as telas | A "planta do prédio" | Gratuito (open source) |
| **Service Worker (PWA)** | Permite instalar como app no celular | O "atalho na home" | Gratuito |

---

## 4. O QUE JÁ ESTÁ FUNCIONANDO HOJE

### Funcionalidades ativas:
| Módulo | Status | Descrição |
|--------|--------|-----------|
| 📱 **PWA (App no celular)** | ✅ Ativo | Usuário instala pelo navegador, abre como app |
| 🔐 **Login/Cadastro** | ✅ Ativo | Email + senha, recuperação de senha |
| 👨‍👩‍👧 **Grupos familiares** | ✅ Ativo | Criar grupo, convidar membros, definir papéis |
| 📅 **Calendário de guarda** | ✅ Ativo | Escala de dias, feriados nacionais destacados |
| 🔄 **Trocas de dias** | ✅ Ativo | Solicitar troca com aprovação, saldo de dias |
| 👴 **Visitas de avós** | ✅ Ativo | Avós solicitam visita, pai responsável aprova |
| 💬 **Chat** | ✅ Ativo | Mensagens em tempo real com resposta instantânea |
| 🤖 **Mediador IA no chat** | ✅ Ativo | Detecta tom agressivo e sugere reescrita neutra |
| 💰 **Despesas compartilhadas** | ✅ Ativo | Registrar gastos, ver saldo entre os pais |
| 📄 **Documentos** | ✅ Ativo | Upload e organização de documentos |
| 🏫 **Escola** | ✅ Ativo | Informações escolares |
| 🏥 **Saúde** | ✅ Ativo | Registros de saúde |
| ✅ **Check-in** | ✅ Ativo | Registro de atividades diárias da criança |
| 📨 **Convites com status** | ✅ Ativo | Enviar, ver se aceitou/pendente, excluir |
| 📊 **Dashboard** | ✅ Ativo | Resumo do dia, próximos dias, saldo financeiro |

---

## 5. PRÓXIMOS PASSOS POR FAIXA DE USUÁRIOS

### 📊 Fase 1: 0 a 500 usuários (AGORA)
**Custo mensal: R$ 0**

| Item | Plano | Limite |
|------|-------|--------|
| Vercel | Free | 100 GB de banda/mês |
| Supabase | Free | 500 MB de banco, 1 GB de storage, 50k autenticações/mês |
| GitHub | Free | Ilimitado |

**O que fazer agora:**
- [x] App funcionando e publicado
- [x] PWA instalável no celular
- [x] Deploy automático configurado
- [ ] Testar com 10-20 usuários reais (amigos/família)
- [ ] Coletar feedback e ajustar UX
- [ ] Configurar domínio próprio (ex: `app.kindar.com.br`)
- [ ] Adicionar Google Analytics para medir uso

**⚠️ Quando migrar:** Quando o banco passar de 400 MB ou tiver mais de 200 usuários simultâneos

---

### 📊 Fase 2: 500 a 5.000 usuários
**Custo mensal estimado: ~R$ 250/mês (US$ 45)**

| Item | Plano | Custo |
|------|-------|-------|
| Vercel | Pro | US$ 20/mês |
| Supabase | Pro | US$ 25/mês |
| Domínio .com.br | — | ~R$ 40/ano |

**O que o upgrade traz:**
- Vercel Pro: analytics avançado, 1 TB de banda, builds mais rápidos
- Supabase Pro: 8 GB de banco, 100 GB storage, backups diários, sem limite de autenticação

**O que fazer nesta fase:**
- [ ] Contratar Vercel Pro + Supabase Pro
- [ ] Domínio próprio com SSL
- [ ] Adicionar Sentry (monitoramento de erros — gratuito até 5k eventos)
- [ ] Push notifications (notificar sobre trocas, mensagens)
- [ ] Termos de uso e política de privacidade (LGPD)
- [ ] Página de landing/marketing

---

### 📊 Fase 3: 5.000 a 20.000 usuários
**Custo mensal estimado: ~R$ 800/mês (US$ 150)**

| Item | Plano | Custo |
|------|-------|-------|
| Vercel | Pro | US$ 20/mês |
| Supabase | Pro (escalado) | US$ 75-100/mês |
| Sentry | Pro | US$ 26/mês |
| Email transacional (Resend) | Pro | US$ 20/mês |

**O que fazer nesta fase:**
- [ ] Otimizar banco de dados (índices, queries)
- [ ] CDN para documentos/imagens (Cloudflare R2)
- [ ] Emails automáticos (lembretes, resumo semanal)
- [ ] App na App Store via Capacitor (custo: US$ 99/ano Apple)
- [ ] Suporte ao usuário (chat/email)
- [ ] Métricas de retenção e engajamento

---

### 📊 Fase 4: 20.000 a 50.000 usuários
**Custo mensal estimado: ~R$ 3.500/mês (US$ 650)**

| Item | Plano | Custo |
|------|-------|-------|
| Vercel | Pro/Enterprise | US$ 20-50/mês |
| Supabase | Team | US$ 599/mês |
| Sentry | Business | US$ 80/mês |
| Infraestrutura extra | — | ~US$ 50/mês |

**O que o Supabase Team traz:**
- Banco de dados maior e mais rápido
- Read replicas (cópias do banco para leitura — mais velocidade)
- SOC2 compliance (segurança empresarial)
- Suporte prioritário

**O que fazer nesta fase:**
- [ ] Equipe de suporte dedicada
- [ ] Testes de carga (simular milhares de acessos)
- [ ] Cache avançado (Redis)
- [ ] App nativo iOS + Android (se ainda não fez)
- [ ] Integrações (Google Calendar, WhatsApp)
- [ ] Consultoria jurídica para LGPD completa

---

## 6. RESUMO DE CUSTOS

| Usuários | Custo mensal (R$) | Custo por usuário |
|----------|-------------------|-------------------|
| 0 - 500 | R$ 0 | R$ 0,00 |
| 500 - 5.000 | ~R$ 250 | R$ 0,05 - 0,50 |
| 5.000 - 20.000 | ~R$ 800 | R$ 0,04 - 0,16 |
| 20.000 - 50.000 | ~R$ 3.500 | R$ 0,07 - 0,17 |

> 💡 **Ponto importante:** O custo por usuário DIMINUI conforme cresce. Se cobrarmos R$ 19,90/mês por família, com 1.000 famílias pagantes já temos R$ 19.900/mês de receita contra R$ 250 de custo.

---

## 7. RISCOS E COMO MITIGAR

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Site sair do ar | Baixa | Vercel tem 99.99% de uptime |
| Perder dados | Muito baixa | Supabase faz backup automático (no plano Pro) |
| Ser hackeado | Baixa | Autenticação segura, RLS no banco, HTTPS |
| Supabase ficar caro | Média | Podemos migrar para banco próprio se necessário |
| Usuário não entender o app | Média | Onboarding guiado + tutorial |

---

## 8. GLOSSÁRIO RÁPIDO

| Termo | O que significa |
|-------|----------------|
| **Deploy** | Publicar uma versão nova do app |
| **PWA** | App que funciona pelo navegador mas parece nativo |
| **Banco de dados** | Onde ficam guardados todos os dados |
| **API** | "Ponte" entre o app e o banco de dados |
| **Realtime** | Dados que atualizam na hora (como WhatsApp) |
| **RLS** | Regra que impede um usuário de ver dados de outro |
| **Git/GitHub** | Sistema que guarda todo o histórico do código |
| **Vercel** | Empresa que hospeda nosso site |
| **Supabase** | Empresa que fornece nosso banco de dados |

---

*Documento atualizado em: Março/2026*
*Versão do app: PWA com deploy automático*
*URL de produção: https://kindar.vercel.app*
