# Fluxos de UX - Kindar

> Mapeamento detalhado dos fluxos criticos da plataforma Kindar.
> Cada fluxo documenta estados, decisoes e tratamento de erros.
> Versao: 1.0 | Atualizado: Marco 2026

---

## 1. Onboarding (Primeiro Acesso)

### Contexto
O onboarding e o momento mais delicado: o usuario esta provavelmente em uma situacao emocional dificil (separacao recente). O fluxo deve ser rapido, acolhedor e nunca pressionar.

### Fluxo Principal

```
  [Login/Cadastro]
        |
        v
  +------------------+
  | Tem convite?     |----SIM---> [Auto-aceita convite]---> [Dashboard]
  | (autoAccept)     |
  +------------------+
        | NAO
        v
  +------------------+
  | Tela Onboarding  |
  | "Crie seu grupo" |
  +------------------+
        |
        v
  +------------------+
  | Nome do grupo    |
  | Ex: "Familia     |
  | Silva"           |
  +------------------+
        |
        v
  +------------------+
  | Adicionar crianca|
  | - Nome completo  |
  | - Data nasc.     |
  +------------------+
        |
        v
  +------------------+
  | Dashboard        |
  | (grupo criado,   |
  |  1 membro)       |
  +------------------+
        |
        v
  +------------------+
  | Enviar convite   |  <--- Disponivel em /convite/enviar
  | ao outro         |       e tambem via Sidebar
  | responsavel      |
  +------------------+
        |
        v
  [Outro responsavel recebe email]
        |
        v
  [Cadastra-se + token auto-aceita]
        |
        v
  [Grupo completo - 2 membros]
```

### Decisoes de UX
- **Auto-accept**: Se o email do usuario tem convite pendente, aceita automaticamente (sem token manual)
- **Grupo primeiro**: Criamos o grupo antes de convidar, para o usuario ja poder usar o app sozinho
- **Sem pressao para convidar**: O convite e sugerido, nunca obrigatorio
- **Redirect loop safety**: Se o usuario perdeu o token no fluxo de signup, `autoAcceptPendingInvitations()` resolve

### Estados de Erro
| Erro                        | Tratamento                                           |
|-----------------------------|------------------------------------------------------|
| Email ja tem grupo          | Redirect para `/dashboard`                           |
| Token de convite expirado   | Auto-accept por email como fallback                   |
| Convite para email diferente| Mostra mensagem: "Este convite e para outro email"    |

---

## 2. Rotina Diaria (Uso Principal)

### Contexto
O uso mais frequente do app: abrir, ver o que precisa de atencao, agir. O dashboard e otimizado para responder em 3 segundos: "Quem esta com a crianca? Tem algo urgente?"

### Fluxo Tipico

```
  [Abre o app]
       |
       v
  +-------------------------+
  | Dashboard               |
  | - Saudacao + data       |
  | - Card de guarda hoje   |
  | - Semana visual         |
  | - Alertas de saude      |
  | - Atividades do dia     |
  | - Pendencias financeiro |
  | - Decisoes abertas      |
  +-------------------------+
       |
       +-------> [Ver calendario] --> Detalhes do dia --> Pedir troca?
       |
       +-------> [Fazer check-in] --> Seleciona crianca --> Preenche
       |                              categoria + nota
       |
       +-------> [Abrir chat] --> Canal geral ou por crianca
       |                          --> Escreve mensagem
       |                          --> Moderacao de tom (se agressivo)
       |                          --> Envia
       |
       +-------> [Ver saude] --> Seleciona crianca
       |                     --> Ve doencas/meds/vacinas
       |                     --> Registra novo episodio?
       |
       +-------> [Registrar despesa] --> Formulario
                                     --> Upload comprovante
                                     --> Outro responsavel aprova
```

### Hierarquia de Informacao no Dashboard
1. **Hero**: Quem esta com a crianca hoje (informacao #1 mais importante)
2. **Semana**: Visao rapida dos proximos dias com cores por responsavel
3. **Alertas**: Doenca ativa, medicamento, consulta proxima (urgencia)
4. **Atividades**: O que tem hoje/amanha (organizacao)
5. **Financeiro**: Saldo do mes (transparencia)
6. **Pendencias**: Trocas, despesas e decisoes aguardando acao

---

## 3. Criando uma Decisao

### Contexto
Decisoes sao para escolhas que afetam a crianca e precisam do acordo dos dois responsaveis. Ex: mudar de escola, fazer cirurgia, viajar.

### Fluxo Principal

```
  [/decisoes] --> [+ Nova Decisao]
       |
       v
  +---------------------------+
  | Formulario                |
  | - Titulo*                 |
  | - Descricao               |
  | - Categoria (dropdown)    |
  |   [escola|saude|atividade |
  |    viagem|financeiro|     |
  |    moradia|outro]         |
  | - Prazo (date, opcional)  |
  +---------------------------+
       |
       v
  [Criar] --> Server Action: createDecision()
       |
       +---> Push notification para outro responsavel
       |     "Ana criou: Mudar Lucas de escola?"
       |
       +---> Mensagem automatica no chat
       |     "Nova decisao: Mudar Lucas de escola?"
       |
       v
  +---------------------------+
  | Decisao aberta            |
  | Status: "aberta"          |
  |                           |
  | [Concordo] [Discordo]    |
  | (votacao por membro)      |
  +---------------------------+
       |
       v
  +---------------------------+
  | Ambos votaram?            |
  |                           |
  | SIM + concordam           |
  |   --> Status: "aprovada"  |
  |                           |
  | SIM + discordam           |
  |   --> Status: "rejeitada" |
  |   --> Sugere mediacao     |
  |                           |
  | Prazo expirou             |
  |   --> Alerta visual       |
  |   --> Notificacao push    |
  +---------------------------+
```

### Categorias de Decisao
| Categoria   | Emoji | Exemplos                                  |
|-------------|-------|-------------------------------------------|
| Escola      | `🎒`  | Mudar de escola, aula particular          |
| Saude       | `🏥`  | Cirurgia, trocar de medico                 |
| Atividade   | `⚽`  | Iniciar esporte, parar terapia             |
| Viagem      | `✈️`  | Viagem com um responsavel                  |
| Financeiro  | `💰`  | Investimento em nome da crianca            |
| Moradia     | `🏠`  | Mudanca de endereco de um responsavel      |
| Outro       | `📋`  | Qualquer decisao compartilhada             |

### Momentos Criticos
- **Sem resposta apos 7 dias**: Notificacao de lembrete (ainda nao implementado)
- **Decisao urgente de saude**: Destaque visual no dashboard com badge de atencao
- **Historico**: Todas as decisoes ficam registradas para referencia juridica

---

## 4. Fluxo de Crianca Doente

### Contexto
O momento mais estressante para pais separados. O Kindar deve garantir que AMBOS os responsaveis tenham a informacao completa, sem atrasos, sem jogo de culpa.

### Fluxo Principal

```
  [/saude] --> Seleciona crianca --> [Doencas] --> [+ Nova Doenca]
       |
       v
  +---------------------------+
  | Registro de Doenca        |
  | - Titulo* (ex: "Gripe")  |
  | - Sintomas* (multi-sel)   |
  | - Data inicio*            |
  | - Severidade              |
  |   [leve|moderada|grave]   |
  | - Hospitalizacao?         |
  |   [sim|nao]               |
  | - Notas                   |
  +---------------------------+
       |
       v
  [Registrar] --> Server Action: createIllness()
       |
       +---> Push notification para outro responsavel
       |     "Ana registrou: Lucas com Gripe"
       |     PRIORIDADE ALTA
       |
       +---> Badge de alerta no dashboard do outro
       |
       v
  +---------------------------+
  | Episodio ativo            |
  | Timeline de evolucao      |
  |                           |
  | [+ Atualizar Evolucao]    |
  | - Novos sintomas          |
  | - Melhora/piora           |
  | - Novo medicamento        |
  |                           |
  | [Resolver Episodio]       |
  | - Data de resolucao       |
  +---------------------------+
       |
       v
  +---------------------------+
  | Medicamentos ativos       |
  | mostrados no dashboard    |
  | de AMBOS os responsaveis  |
  |                           |
  | Consultas pendentes       |
  | linkadas ao episodio      |
  +---------------------------+
```

### Fluxo de Urgencia (Hospitalizacao)

```
  [Marca hospitalizacao = sim]
       |
       v
  +---------------------------+
  | Push URGENTE              |
  | "[Crianca] hospitalizada" |
  |                           |
  | Dashboard: card vermelho  |
  | com destaque maximo       |
  |                           |
  | Ambos responsaveis veem   |
  | badge "Visto por" quando  |
  | o outro visualizou        |
  +---------------------------+
```

### "Visto por" (Health Views)
- Quando um responsavel visualiza informacao de saude, fica registrado
- O outro pode ver: "Visto por Ana em 22/03 as 14:30"
- Isso reduz ansiedade: "Ele/ela sabe da situacao?"

### Momentos Criticos
| Situacao                     | Tratamento UX                                    |
|------------------------------|--------------------------------------------------|
| Doenca grave registrada      | Push imediato + destaque no dashboard             |
| Outro nao visualizou em 4h   | Lembrete push (via cron - `/api/cron/`)           |
| Medicamento com horario      | Card de lembrete no dashboard                     |
| Consulta de retorno marcada  | Visivel para ambos na timeline de saude            |

---

## 5. Pedido de Troca de Guarda

### Contexto
Trocas sao fonte frequente de conflito. O fluxo deve ser formal, registrado, e manter o "saldo de trocas" para equidade.

### Fluxo Principal

```
  [/calendario] --> Clica em um dia --> [Sheet de detalhes]
       |
       v
  +---------------------------+
  | Dia: Quarta, 25 de Marco |
  | Guarda: Ana (regular)     |
  |                           |
  | [Pedir Troca]             |
  +---------------------------+
       |
       v
  +---------------------------+
  | Modal de Troca            |
  | - Data original (fixo)    |
  | - Data proposta (opcional)|
  |   Se nao propor data,     |
  |   conta como "debito"     |
  | - Motivo*                 |
  +---------------------------+
       |
       v
  [Enviar] --> Server Action: createSwapRequest()
       |
       +---> Push para outro responsavel
       |     "Carlos pediu troca para 25/03"
       |
       +---> Status: "pending"
       |
       v
  +---------------------------+
  | Outro responsavel         |
  | ve no dashboard:          |
  | "Carlos pediu troca para  |
  |  Qua 25/03"              |
  |                           |
  | [Aceitar] [Recusar]      |
  +---------------------------+
       |
       +--- Aceitar --> custody_events atualizado
       |               saldo de trocas ajustado
       |               push: "Ana aceitou a troca"
       |
       +--- Recusar --> push: "Ana nao pode trocar"
                        NUNCA diz "recusou" (tom neutro)
                        Motivo e opcional
```

### Saldo de Trocas (Swap Balance)

```
  +---------------------------+
  | Saldo de Trocas           |
  |                           |
  | Carlos: +2 dias           |
  | Ana: -2 dias              |
  |                           |
  | (Calculado sobre 3 meses  |
  |  de custody_events com    |
  |  tipo "swap")             |
  +---------------------------+
```

**Logica**: `computeSwapBalance()` em `calendar-utils.ts` calcula quantos dias de troca cada responsavel "deve" ao outro, baseado nos ultimos 3 meses.

### Fluxo Alternativo: Pedido de Visita

```
  [Dia em que NAO e sua guarda] --> [Pedir Visita]
       |
       v
  (Mesmo fluxo do swap, mas com flag isVisitRequest)
  (Nao gera debito no saldo)
```

### Estados do Pedido

| Status     | Significado                    | Acao do Solicitante        |
|------------|--------------------------------|----------------------------|
| `pending`  | Aguardando resposta            | Pode cancelar              |
| `approved` | Aceito pelo outro              | Calendario atualizado       |
| `rejected` | Nao aceito                     | Pode tentar outra data      |

---

## 6. Fluxo de Despesas

### Contexto
Financas sao a segunda maior fonte de conflito em coparentalidade. O Kindar implementa um modelo inspirado no Splitwise: registrar, comprovar, dividir, liquidar.

### Fluxo Principal

```
  [/despesas] --> [+ Nova Despesa]
       |
       v
  +---------------------------+
  | Formulario de Despesa     |
  | - Crianca (select)        |
  | - Categoria*              |
  |   [educacao|saude|alim.   |
  |    roupas|transporte|     |
  |    lazer|moradia|outro]   |
  | - Descricao*              |
  | - Valor* (R$)             |
  | - Data*                   |
  | - Divisao (split ratio)   |
  |   [50/50 | 60/40 | ...]  |
  | - Comprovante (upload)    |
  |   [JPG|PNG|HEIC|PDF 5MB] |
  +---------------------------+
       |
       v
  [Registrar] --> Server Action: createExpense()
       |
       +---> Upload comprovante para Supabase Storage
       |     bucket: "receipts", path: {groupId}/{timestamp}-receipt.{ext}
       |
       +---> Push para outro responsavel
       |     "Ana registrou: Material escolar R$ 150"
       |
       +---> Status: "pending" (aguarda aprovacao)
       |
       v
  +---------------------------+
  | Outro responsavel         |
  | [Aprovar] [Rejeitar]      |
  |                           |
  | Pode ver comprovante      |
  | (ReceiptViewer)           |
  +---------------------------+
       |
       +--- Aprovar --> Status: "approved"
       |               Entra no calculo de saldo
       |
       +--- Rejeitar --> Status: "rejected"
       |                 Motivo opcional
       |                 NAO entra no calculo
       |
       v
  +---------------------------+
  | Painel Financeiro         |
  | - Total do mes            |
  | - Meu gasto vs outro      |
  | - Saldo (quem deve quem)  |
  | - Botao "Liquidar"        |
  +---------------------------+
       |
       v
  +---------------------------+
  | Liquidacao (Settlement)   |
  | - Valor a liquidar        |
  | - Metodo (PIX/Dinheiro/   |
  |   Transferencia/Outro)    |
  | - Confirmar               |
  +---------------------------+
```

### Calculo de Saldo

```
  Para cada despesa aprovada do mes:
    - Se eu paguei R$ 300 e o split e 50/50:
      Eu deveria pagar R$ 150
      O outro deve me R$ 150

    balance = totalQuePaguei - totalQueDevoPagar
    Se balance > 0: o outro me deve
    Se balance < 0: eu devo ao outro
```

### Split Ratio Customizado
- Padrao: 50/50
- Configuravel por despesa: 60/40, 70/30, etc.
- Armazenado como JSON: `{ "userId1": 50, "userId2": 50 }`

---

## 7. Fluxos Auxiliares

### 7.1 Check-in Diario

```
  [/checkin] --> Seleciona crianca
       |
       v
  +---------------------------+
  | Categorias disponíveis:   |
  | Tela | Comida | Sono |    |
  | Humor | Saude | Atividade |
  | Escola | Outro            |
  |                           |
  | Rating (1-5 estrelas)     |
  | Nota de texto             |
  +---------------------------+
       |
       v
  [Salvar] --> Visivel para ambos no dashboard
```

### 7.2 Chat com Moderacao de Tom

```
  [/chat] --> Seleciona canal (geral/crianca/financeiro)
       |
       v
  [Digita mensagem]
       |
       v
  +---------------------------+
  | analyzeTone() client-side |
  |                           |
  | score > threshold?        |
  |   --> Aviso: "Esta msg    |
  |       pode soar agressiva"|
  |   --> Sugestao de reescrita|
  |   --> [Enviar mesmo]      |
  |       [Reescrever]        |
  |                           |
  | score <= threshold         |
  |   --> Envia normalmente   |
  +---------------------------+
       |
       v
  [Supabase Realtime] --> Outro usuario ve em tempo real
```

### 7.3 Escala de Guarda

```
  [/calendario/escala] --> ScheduleBuilder
       |
       v
  +---------------------------+
  | Configurar padrao:        |
  | - Tipo de alternancia     |
  |   [semanal|quinzenal|     |
  |    custom]                |
  | - Quem comeca             |
  | - Data inicio             |
  | - Data fim                |
  | - Crianca(s)              |
  +---------------------------+
       |
       v
  [Preview visual] --> [Confirmar] --> Gera custody_events em lote
```

---

## 8. Mapa de Momentos Criticos

### Momentos de Alta Tensao e Resposta do Sistema

| Momento                       | Emocao do Usuario  | Resposta do Kindar                        |
|-------------------------------|--------------------|--------------------------------------------|
| Crianca hospitalizada         | Panicoacao, medo    | Push urgente, card vermelho, "visto por"   |
| Troca de guarda negada        | Frustracao          | Tom neutro, nunca "recusou", sugere outra  |
| Despesa alta rejeitada        | Raiva               | Permite contra-argumentar, mostra comprov. |
| Outro nao responde decisao    | Ansiedade            | Lembrete automatico apos X dias            |
| Medicamento esquecido         | Culpa               | Lembrete neutro, sem historico de "falhas" |
| Fim de guarda se aproxima     | Ansiedade/saudade   | Info factual: "Troca amanha as 18h"        |
| Chat com tom agressivo        | Raiva               | Moderacao suave, sugestao de reescrita     |

### Principio: "Informar, nao inflamar"
Toda notificacao e mensagem do sistema segue este principio. O app e um mediador digital neutro, nunca um amplificador de conflito.

---

*Fluxos devem ser revisados a cada sprint com base em feedback de usuarios beta.*
