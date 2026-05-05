# Manual do Kindar via WhatsApp

> Tudo que você pode fazer conversando com o **Kindar** em **+55 21 99960-5044** sem abrir o app.

## Antes de começar

**Vincular seu número** (1 vez só):
1. Abra `kindar.com.br/perfil` → seção **WhatsApp**
2. Confirme o telefone do seu cadastro
3. Receba o código de 6 dígitos no WhatsApp e cole no app
4. Pronto. Daqui pra frente é só conversar.

Se você está em mais de uma família/grupo, o bot pergunta qual usar. Pra trocar depois: digite `trocar grupo`.

---

## Como o bot entende você

| Forma de mandar | Aceita? | Exemplo |
|---|---|---|
| **Texto livre** | ✅ | "paguei 120 conto da escola do Joaquim" |
| **Áudio** | ✅ | grava falando — bot transcreve e processa |
| **Foto de recibo** | ✅ | manda a foto, bot lê valor/data e pergunta categoria/criança |
| **Foto de receita médica** | ✅ | foto + legenda `/receita` → bot extrai medicamentos |
| **Botões "Sim/Não"** | ✅ | confirma toda ação antes de salvar |
| **Listas interativas** | ✅ | escolhe categoria/criança/aprovação |

Você pode falar **informal**: "uns 50 pila do mercado", "marca pediatra pro Joaquim semana que vem", "trocar finde com a Maria".

---

## 📊 Despesas

### Registrar despesa

| Você diz | Bot faz |
|---|---|
| `paguei 120 da escola do Joaquim` | confirma → cria despesa categoria *Educação* |
| `gastei 50 conto com remedio do Martim` | confirma → cria, categoria *Saúde* |
| `comprei tenis 250 pro Joaquim` | confirma → cria, categoria *Vestuário* |
| `R$ 80 mercado` | confirma → cria, categoria *Alimentação* |

A divisão entre coparentes segue a regra do grupo (default 50/50). O outro responsável recebe push no app + notificação no WhatsApp.

### Foto de recibo

Tira foto do recibo / nota fiscal e manda. Bot:
1. Lê valor, descrição e data via OCR
2. Pergunta a **categoria** (Saúde / Educação / Alimentação / Vestuário / Lazer / Transporte / Moradia / Outros)
3. Pergunta **para qual criança** (ou "Geral")
4. Confirma e cria a despesa

Se a foto sair tremida ou estiver muito ruim, bot pede pra descrever por texto.

### Consultar despesas

| Você diz | Resposta |
|---|---|
| `quanto gastamos esse mês?` | total + por categoria + quanto cada um pagou |
| `gastos do Joaquim na semana` | filtra por criança e período |
| `como tá o saldo?` | quem deve quanto a quem (despesas pendentes) |

---

## 📅 Calendário e eventos

### Criar evento

| Você diz | Bot faz |
|---|---|
| `festa do Joaquim dia 15 às 16h` | cria evento no calendário |
| `viagem dia 20 a 25 de junho` | cria evento de múltiplos dias |
| `reunião escolar amanhã 19h` | cria, com horário relativo |
| `aniversário da Maria 12 de outubro` | cria, com data por extenso |

### Consultar agenda

| Você diz | Resposta |
|---|---|
| `o que tem essa semana?` | lista eventos + consultas próximos 7 dias |
| `próximos 30 dias` | mesma coisa, janela maior |
| `qual a próxima consulta?` | só agenda médica |

---

## 🩺 Saúde

### Agendar consulta

| Você diz | Bot faz |
|---|---|
| `consulta com pediatra do Joaquim dia 20 às 14h` | agenda consulta |
| `marca dentista pra Maria semana que vem` | agenda (pede horário se faltar) |
| `oftalmo Joaquim 10/06 09h30` | agenda com data BR + horário |

### Registrar status / sintoma

| Você diz | Bot faz |
|---|---|
| `Joaquim com febre 38.5` | registra episódio de febre |
| `Maria vomitou 2x hoje` | registra sintoma |
| `Martim com tosse e gripado` | registra episódio respiratório |

### Medicação

| Você diz | Bot faz |
|---|---|
| `dei dipirona pro Joaquim agora` | registra dose |
| `Maria tomou amoxicilina 250mg` | registra dose com dosagem |

### Vacina

| Você diz | Bot faz |
|---|---|
| `Joaquim tomou vacina tríplice ontem` | registra vacina |
| `vacina febre amarela Maria 15/06` | agenda vacina futura |

### Foto de receita médica

Manda a foto da receita com legenda **`/receita`**. Bot extrai:
- Nome do medicamento
- Dosagem
- Frequência
- Duração
- Para qual criança

Pede confirmação e adiciona em **Medicações ativas**.

### Foto de vacina, atestado ou exame

Manda foto com legenda `/vacina`, `/atestado` ou `/exame`. Bot identifica e te orienta a anexar pelo app pra extração estruturada (sem perda de dados, só roteamento).

### Consultar saúde

| Você diz | Resposta |
|---|---|
| `como tá o Joaquim?` | snapshot: doente? medicações ativas? alergias? |
| `próximas vacinas da Maria` | lista vacinas pendentes/agendadas |
| `histórico do Joaquim` | timeline de consultas + episódios + medicações + eventos (últimos 30 dias) |
| `histórico da Maria nos últimos 60 dias` | mesma coisa, janela ajustável |

---

## ✅ Check-ins diários

Pra registrar coisa rápida do dia-a-dia:

| Você diz | Categoria |
|---|---|
| `Joaquim dormiu bem hoje` | sono |
| `Maria comeu pouco no almoço` | alimentação |
| `Martim ficou 2h no celular` | tela / screen time |
| `Joaquim feliz hoje, brincou bastante` | humor |

Aparece pro outro responsável no chat do app + opcionalmente no WhatsApp dele.

---

## 🎯 Atividades recorrentes

| Você diz | Bot faz |
|---|---|
| `Joaquim natação ter e qui 17h` | cria atividade semanal |
| `Maria balé seg qua sex 16h às 17h30` | cria com horário inicial+final |
| `Martim aula de inglês quartas 18h` | cria recorrente |

---

## 🔄 Trocar de dia (coparentalidade)

### Pedir troca

| Você diz | Bot faz |
|---|---|
| `trocar dia 15/05 com Maria por 22/05` | cria solicitação de troca, manda card pro coparente |
| `quero o dia 20 com a [nome]` | troca por dívida (pego sem oferecer outro) |
| `visita 18/05 às 14h` | pedido de visita |

O coparente recebe um **card no WhatsApp** com botões:
- ✅ **Aprovar** → calendário atualiza automaticamente
- ❌ **Recusar** → você é avisado da recusa

### Suas pendências

| Você diz | Resposta |
|---|---|
| `aprovações pendentes` | lista trocas que esperam sua resposta |
| `tenho algo pra aprovar?` | mesma coisa |
| `inbox` | mesma coisa |

Pra responder, basta tocar nos botões do card que você recebeu (ou digitar `aprovar [trecho do pedido]`).

---

## 🗳️ Decisões colaborativas

Pra coisas que vocês 2 precisam decidir juntos:

| Você diz | Bot faz |
|---|---|
| `precisamos decidir qual escola pro Joaquim ano que vem` | cria decisão pra votação |
| `criar decisão sobre limite de tela` | cria, coparente recebe notificação |

A decisão fica aberta até os 2 votarem. Se ambos concordam → aprovada. Se algum discorda → rejeitada.

---

## 📝 Notas e lembretes

| Você diz | Bot faz |
|---|---|
| `anota: comprar mochila do Joaquim` | nota privada (só você vê) |
| `lembrete: levar relatório dia 12` | nota com data |
| `preciso lembrar de pagar mensalidade` | nota |

---

## 👥 Informações das crianças

| Você diz | Resposta |
|---|---|
| `quem está com as crianças hoje?` | escala de guarda do dia |
| `de quem é a vez amanhã?` | guarda futura |
| `info das crianças` | nomes + idades + escolas |

---

## ✍️ Ajuda pra redigir

Quando precisar mandar mensagem sensível pro coparente:

| Você diz | Bot faz |
|---|---|
| `me ajuda a falar com [nome] sobre o atraso na busca` | sugere texto neutro e direto |
| `como falar sobre divisão de despesas extras?` | rascunho respeitoso |

Bot mantém tom neutro, focado na criança, sem acusação. Você decide se manda ou ajusta.

---

## ⚙️ Comandos úteis

| Comando | Ação |
|---|---|
| `trocar grupo` / `mudar grupo` | trocar a família ativa (se você está em mais de uma) |
| `ajuda` / `o que voce faz` | bot resume capacidades |
| `cancelar` / `nao` / `deixa` | desfaz a confirmação pendente |
| `sim` / `ok` / `confirma` | confirma a ação pendente |

---

## 📌 Coisas que **não** dá pelo WhatsApp (use o app)

- Configurar o calendário inicial / escala quinzenal
- Adicionar coparente novo / convidar pra família
- Mudar permissões / RLS / dados sensíveis
- Pagar despesas (acerto financeiro entre coparentes)
- Configurar push notifications
- Ver gráficos de saúde / dashboards completos

---

## 🛡️ Privacidade

- Mensagens de WhatsApp são processadas no servidor Kindar (Vercel + Supabase)
- Notas privadas (`anota: ...`) são privadas — só você vê
- Mensagens registradas em log por **30 dias** para suporte
- Foto de recibo: armazenada no Storage até 1 ano (você pode deletar pelo app)
- Áudio: transcrito e descartado depois de processar
- Você pode revogar acesso a qualquer momento em `kindar.com.br/perfil` → desvincular WhatsApp

---

## 🆘 Quando algo não funcionar

1. Bot demorou mais de 30s → manda de novo, pode ter sido timeout do LLM
2. Bot não entendeu → reformula em pt-BR padrão (sem gírias muito específicas)
3. Botão sumiu → digite a confirmação por texto: `sim`, `confirma`, `aprovar`
4. Mensagem ignorada → confere se você está vinculado em `kindar.com.br/perfil`
5. Erro persistente → contato@kindar.com.br

---

## Limites técnicos (FYI)

- 30 mensagens/minuto por número (rate limit anti-spam)
- Textos até ~4096 caracteres
- Áudio até ~16 MB (limite Meta)
- Foto até ~5 MB
- Janela de 24h: depois da sua última mensagem, bot pode mandar texto livre por 24h. Após esse período, só templates aprovados (notificações estruturadas).
