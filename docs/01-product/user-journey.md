# Jornada do Usuario - Kindar

> Ultima atualizacao: Março 2026
> Persona principal: Carolina Mendes (Mae recem-separada)

---

## Visao Geral da Jornada

A jornada do usuario do Kindar e dividida em 5 fases, do primeiro contato ate o habito formado. O que torna esta jornada unica e que o sucesso depende de DOIS usuarios (ambos os pais) adotarem o produto — diferente da maioria dos SaaS, onde o valor e individual.

```
Fase 1          Fase 2           Fase 3          Fase 4            Fase 5
Descoberta  ->  Setup Inicial -> Rotina Diaria -> Momentos        -> Engajamento
                                                   Criticos          Continuo
[1-3 dias]     [30 min]         [Semana 1-4]     [Pontual]         [Mes 2+]
```

---

## Fase 1: Descoberta e Onboarding

**Duracao**: 1-3 dias (do primeiro contato ao primeiro login)

### Cenario Tipico

Carolina esta num grupo de WhatsApp de maes e alguem menciona que existe um app para organizar a coparentalidade. Ou ela pesquisa "app para pais separados" no Google depois de uma discussao com Lucas sobre quem pagou a escola. Ou a advogada dela recomenda.

### Touchpoints

| Touchpoint | Canal | Acao |
|-----------|-------|------|
| Primeiro contato | Google / Instagram / WhatsApp WOM | Descobre o Kindar |
| Landing page | Web | Le a proposta de valor, ve depoimentos |
| Download/Acesso | Web (PWA) ou App Store | Cria conta com email |
| Onboarding | In-app | Preenche perfil, entende o conceito |

### Emocoes

```
Curiosidade -> Esperanca -> Hesitacao -> "Sera que o Lucas vai aceitar?" -> Decisao
     |              |            |                    |                        |
   "Sera que      "Talvez      "Mais um           "Se ele nao              "Vou tentar.
    existe?"      funcione"     app..."             usar, nao              O que tenho
                                                    adianta"               a perder?"
```

### Dores nesta Fase

1. **Medo de parecer controladora**: Carolina hesita em sugerir o app pro Lucas porque nao quer parecer que quer "vigiar" ele.
2. **Fadiga de apps**: Ja tentou Google Calendar, Cozi, planilha — nada funcionou.
3. **Inseguranca sobre privacidade**: "Minhas conversas ficam salvas? O juiz pode ver?"
4. **Barreira de convencer o outro pai**: O valor so existe se ambos usarem.

### Oportunidades de Design

| Oportunidade | Implementacao |
|-------------|---------------|
| Reduzir fricao do convite | Convite via link + WhatsApp com mensagem pre-formatada neutra (ja implementado em `/convite/enviar`) |
| Onboarding empatico | Primeira tela: "Sabemos que nao e facil. O Kindar existe pra simplificar." |
| Demonstrar valor individual | Mesmo sem o outro pai, o modulo de saude e check-in ja funciona como registro pessoal |
| Linguagem neutra no convite | "Carolina convidou voce para organizar a rotina de Pedro e Luisa juntos" (nao "Carolina quer controlar") |

### Metricas da Fase

| Metrica | Meta | Medicao |
|---------|------|---------|
| Visitante -> Signup | > 25% | PostHog funnel |
| Signup -> Primeiro grupo criado | > 70% | Supabase event |
| Convite enviado | > 60% dos signups | Action tracking |
| Convite aceito em < 48h | > 40% | Supabase timestamp delta |
| Time to first value (primeiro registro) | < 5 min | PostHog |

---

## Fase 2: Primeiro Setup

**Duracao**: 20-40 minutos (primeira sessao completa)

### Cenario Tipico

Carolina acabou de criar a conta. O app a guia pelo setup: criar o grupo familiar, adicionar os filhos, configurar a escala de guarda, e enviar o convite pro Lucas.

### Fluxo de Setup

```
1. Criar grupo         2. Adicionar filhos      3. Configurar escala
   "Familia Oliveira"     Pedro (6 anos)           Semana alternada
                          Luisa (3 anos)            Inicio: Mae
                          Alergias                  Feriados: alternados
                          Medicamentos

4. Enviar convite      5. Primeira despesa      6. Primeiro check-in
   Link + WhatsApp        Escola: R$ 2.800         Pedro: dormiu bem,
   pro Lucas              Split: 50/50              humor bom, escola ok
```

### Touchpoints

| Passo | Tela | Tempo estimado | Emocao |
|-------|------|---------------|--------|
| Criar grupo | `/onboarding` | 2 min | Esperanca |
| Adicionar filho 1 | `/criancas/nova` | 3 min | Carinho (colocar foto, data de nascimento) |
| Adicionar filho 2 | `/criancas/nova` | 2 min | Rotina |
| Registrar alergias | `/saude/alergias/nova` | 2 min | Preocupacao (alergia a amendoim e seria) |
| Adicionar medicamentos | `/saude/medicamentos/novo` | 3 min | Praticidade |
| Configurar escala | `/calendario/escala` | 5 min | Ansiedade (formalizar a guarda no app e real) |
| Enviar convite | `/convite/enviar` | 2 min | Tensao ("sera que ele vai aceitar?") |
| Primeira despesa | `/despesas/nova` | 2 min | Alivio (finalmente vai ter registro) |
| Primeiro check-in | `/checkin` | 3 min | Satisfacao (rotina comecando) |

### Dores nesta Fase

1. **Formalizar a escala e emocionalmente dificil**: Ver a guarda alternada no calendario torna a separacao "mais real".
2. **Nao saber todas as informacoes de saude**: "Qual era o CRM da pediatra mesmo?"
3. **Convite sem resposta**: Lucas nao aceitou ainda. O app parece vazio e unilateral.
4. **Excesso de campos**: Se pedir muita informacao no setup, Carolina desiste.

### Oportunidades de Design

| Oportunidade | Implementacao |
|-------------|---------------|
| Setup progressivo | Pedir apenas o essencial (nome, data nascimento). Saude e documentos podem ser preenchidos depois. |
| Valor imediato sem o outro pai | Check-in e registro de saude funcionam solo. Dashboard ja mostra dados uteis. |
| Gamificacao sutil | "Perfil de Pedro: 40% completo. Adicione alergias para ter o perfil de saude pronto." |
| Reminder do convite | Se o convite nao foi aceito em 24h, sugerir reenvio com mensagem diferente. |

### Metricas da Fase

| Metrica | Meta | Medicao |
|---------|------|---------|
| Setup completo (filho + escala) | > 60% na primeira sessao | Supabase |
| Convite enviado | > 70% | Action tracking |
| Primeiro check-in em < 24h | > 50% | Timestamp |
| Retorno no dia seguinte (D1 retention) | > 40% | PostHog |

---

## Fase 3: Rotina Diaria

**Duracao**: Semanas 1-4 (formacao de habito)

### Cenario Tipico

Lucas aceitou o convite. Agora ambos os pais estao no app. Carolina faz check-in toda noite, registra despesas quando acontecem, e consulta o calendario todo domingo para planejar a semana. Lucas faz check-in mais esporadico, mas consulta o modulo de saude sempre que Pedro espirra.

### Rotina Diaria Tipica (Carolina)

| Hora | Acao | Tela |
|------|------|------|
| 7:30 | Ve quem esta com as criancas hoje (confirma mentalmente) | `/calendario` |
| 8:00 | Pedro diz que a barriga doi. Checa medicamentos e alergias | `/saude/medicamentos` |
| 12:30 | Recebe notificacao: Lucas registrou check-in (dormiu mal) | Push notification |
| 17:00 | Busca Luisa na natacao. Registra despesa da mensalidade | `/despesas/nova` |
| 21:00 | Faz check-in do dia: sono bom, humor ok, comeu bem, pouca tela | `/checkin` |
| 21:15 | Manda mensagem no canal de Pedro sobre a dor de barriga | `/chat` (canal Pedro) |

### Rotina Semanal

| Dia | Acao |
|-----|------|
| **Domingo** | Revisa calendario da semana. Ve se tem alguma troca pendente. |
| **Segunda** | Check-in normal. Registra despesas do fim de semana. |
| **Quarta** | Lucas propoe troca de sexta (viagem a trabalho). Carolina aceita. |
| **Sexta** | Troca de guarda. Ambos fazem check-in de transicao. |
| **Sabado** | Carolina ve os check-ins do Lucas. Fica tranquila. |

### Emocoes

```
Semana 1: Experimentacao cautelosa ("Sera que vai durar?")
Semana 2: Primeiros beneficios ("Nao precisei ligar pro Lucas pra saber do remedio!")
Semana 3: Habito comecando ("Esqueci de fazer check-in, senti falta")
Semana 4: Confianca no sistema ("Agora tenho tudo registrado, me sinto mais segura")
```

### Dores nesta Fase

1. **Lucas usa menos**: Ele faz check-in 2x por semana, Carolina faz todo dia. Ela se frustra.
2. **Notificacoes demais ou de menos**: Encontrar o equilibrio e critico.
3. **Chat virando WhatsApp**: Se o chat nao tiver regras, vira o mesmo caos.
4. **Esquecimento**: Sem lembretes, o check-in e abandonado em 2 semanas.

### Oportunidades de Design

| Oportunidade | Implementacao |
|-------------|---------------|
| Lembretes inteligentes | Push as 20h: "Como foi o dia do Pedro e da Luisa?" |
| Streak sutil | "5 dias seguidos de check-in" (sem punir quando perde) |
| Nudge para o outro pai | Se Lucas nao fez check-in em 3 dias, sugerir (nao cobrar) |
| Quick actions no dashboard | "Registrar despesa", "Fazer check-in", "Ver calendario" como atalhos |

### Metricas da Fase

| Metrica | Meta | Medicao |
|---------|------|---------|
| DAU/MAU (ambos os pais) | > 40% | PostHog |
| Check-ins por semana (por pai) | >= 3 | Supabase count |
| Mensagens no chat por semana | >= 5 | Supabase count |
| Despesas registradas por mes | >= 4 | Supabase count |
| D7 retention | > 35% | PostHog cohort |
| D30 retention | > 25% | PostHog cohort |

---

## Fase 4: Momentos Criticos

**Duracao**: Pontual (mas define se o usuario fica ou sai)

### Por que esta fase e decisiva

Os momentos criticos sao os eventos que testam o valor REAL do app. Se o Kindar resolve bem um momento critico, o usuario nunca mais sai. Se falha, ele abandona.

### Momento Critico 1: Filho Doente

**Cenario**: Luisa acorda com febre de 38.5 na casa do Lucas (quinta-feira). Ele precisa: (1) saber as alergias dela, (2) verificar se pode dar antitermico, (3) avisar Carolina, (4) decidir se leva ao pronto-socorro.

| Passo | Acao no Kindar | Tempo | Alternativa sem app |
|-------|---------------|-------|-------------------|
| 1 | Abre perfil da Luisa > Saude > Alergias: amendoim (grave) | 10s | Liga pra Carolina (nao atende as 2h da manha) |
| 2 | Checa medicamentos: Paracetamol 10mg/kg, ultimo uso ha 15 dias | 15s | Procura na bolsa da Luisa, acha caixa vencida |
| 3 | Registra doenca: febre 38.5, onset hoje 2h | 30s | Nao registra, esquece os detalhes |
| 4 | Manda mensagem no canal Luisa: "Febre 38.5, dei Paracetamol" | 20s | WhatsApp as 2h: Carolina ve as 7h, ja preocupada |
| 5 | Carolina ve notificacao push, responde: "OK, monitora. Se passar de 39 leva pro HC" | Push imediato | Liga de volta, discussao tensa de madrugada |
| 6 | De manha: registra evolucao no modulo de doencas | 1 min | Esquece de atualizar, Carolina nao sabe como Luisa esta |

**Resultado**: Ambos os pais informados, decisao tomada sem conflito, registro medico completo para a pediatra na proxima consulta. **Momento AHA.**

---

### Momento Critico 2: Troca Urgente de Calendario

**Cenario**: Lucas precisa viajar a trabalho na sexta (dia dele). Pede para Carolina ficar com as criancas. Carolina tem um jantar e nao pode. Impasse.

| Passo | Acao no Kindar | Emocao | Sem app |
|-------|---------------|--------|---------|
| 1 | Lucas cria swap request: sexta por domingo | Esperanca | WhatsApp: "Preciso trocar sexta" (seco, sem contexto) |
| 2 | Carolina recebe notificacao com detalhes | Neutra | Carolina: "De novo? Voce nunca esta disponivel" |
| 3 | Carolina recusa (tem jantar). Contra-propoe: sabado por domingo | Negociacao racional | Escala para briga no WhatsApp |
| 4 | Lucas aceita. Swap balance atualiza: Lucas deve 1 dia | Resolucao | Fica sem resolver, Lucas cancela viagem, ressentimento |
| 5 | Calendario atualiza para ambos. Dona Marta ve que sabado mudou | Todos alinhados | Dona Marta nao fica sabendo, prepara almoco a toa |

**Resultado**: Negociacao formal, sem carga emocional, com saldo de trocas transparente. **O swap balance elimina o "voce sempre troca e eu nunca".**

---

### Momento Critico 3: Decisao Importante

**Cenario**: Pedro vai entrar no primeiro ano. Carolina quer escola particular (R$ 2.800/mes). Lucas quer escola publica boa. Precisam decidir em 2 semanas.

| Passo | Acao no Kindar | Resultado |
|-------|---------------|-----------|
| 1 | Carolina cria decisao: "Escola do Pedro - 1o ano" | Categoria: Escola, Deadline: 15 dias |
| 2 | Carolina adiciona argumento PRO escola particular | "Turmas menores, ingles desde cedo, perto de casa" |
| 3 | Lucas adiciona argumento PRO escola publica | "Economia de R$ 33k/ano, diversidade social, perto do trabalho dele" |
| 4 | Ambos votam | Carolina: particular / Lucas: publica |
| 5 | Empate — sistema sugere: "Considerem incluir um mediador" | Alerta neutro, sem tomar lado |
| 6 | Dr. Renato e adicionado, ve argumentos de ambos | Mediacao informada por dados, nao por "ele disse/ela disse" |
| 7 | Decisao registrada com fundamentacao | Documento permanente, util para futuro |

**Resultado**: Processo estruturado substitui briga no WhatsApp. Argumentos ficam registrados. Se precisar de mediacao, o contexto ja existe.

---

### Momento Critico 4: Pai Nao Responde

**Cenario**: Carolina envia mensagem sobre vacina atrasada do Pedro. Lucas nao responde em 48h. Carolina fica ansiosa.

| Passo | Acao no Kindar | Design Decision |
|-------|---------------|-----------------|
| 1 | Mensagem enviada no canal Pedro | Confirmacao de leitura sutil (visto, nao "lido as X") |
| 2 | 24h sem resposta | Reminder automatico para Lucas (sutil, nao acusatorio) |
| 3 | 48h sem resposta | Carolina pode marcar como "aguardando resposta" |
| 4 | Se for decisao com deadline | Notificacao: "Deadline em 3 dias. [Nome] ainda nao respondeu." |
| 5 | Apos deadline | Registro automatico: "Decisao nao respondida por [Nome] no prazo" |

**Design critico**: O app NUNCA assume ma intencao. "Nao respondeu" pode ser: viajou, telefone sem bateria, semana corrida. O tom e sempre: "lembrete", nunca "cobranca".

---

### Momento Critico 5: Despesa Contestada

**Cenario**: Carolina registra "Tenis Nike - R$ 450" como despesa compartilhada. Lucas contesta: "R$ 450 em tenis pra crianca de 6 anos?"

| Passo | Acao no Kindar | Resultado |
|-------|---------------|-----------|
| 1 | Carolina registra despesa com foto do recibo | Categoria: Roupas, split 50/50, recibo anexado |
| 2 | Lucas recebe notificacao, ve o valor | Pode aceitar ou contestar |
| 3 | Lucas contesta com comentario | "Poderia ser um tenis mais barato. Sugiro dividir ate R$ 200." |
| 4 | Fica registrado como despesa em disputa | Nao entra no settlement ate resolver |
| 5 | Resolvem no chat ou na proxima mediacao | Historico completo disponivel |

**Resultado**: Disputa financeira canalizada para o app, com recibos e argumentos, ao inves de briga no WhatsApp.

---

## Fase 5: Engajamento Continuo

**Duracao**: Mes 2 em diante (habito formado)

### Cenario Tipico

3 meses apos o setup. Carolina e Lucas usam o app diariamente. O conflito reduziu significativamente. Carolina decide convidar Dona Marta para ter acesso ao modulo de saude.

### Sinais de Habito Formado

| Sinal | Indicador |
|-------|-----------|
| Check-in vira rotina | >= 5x/semana sem reminder |
| Primeira fonte de informacao | Carolina abre o Kindar antes do WhatsApp para questoes das criancas |
| Financeiro substituiu planilha | Todas as despesas no app, settlement mensal via PIX |
| Decisoes no app (nao no WhatsApp) | "Vamos decidir isso no Kindar" vira frase natural |
| Expande a rede | Convida avos, babas, ou mediador |

### Expansao da Rede Familiar

```
Mes 1: Carolina + Lucas (2 usuarios)
Mes 2: + Dona Marta como cuidadora (3 usuarios)
Mes 3: + Mae da Carolina como cuidadora (4 usuarios)
Mes 4: + Babysitter como cuidadora (5 usuarios)
Mes 6: + Dr. Renato como mediador (6 usuarios)
```

**K-factor estimado**: 1.8 (cada familia traz em media 1.8 usuarios adicionais alem do par de pais)

### Emocoes nesta Fase

```
Confianca  ->  Normalizacao  ->  Advocacia
    |               |                |
"Funciona.      "Claro, e         "Voce PRECISA
Confio no       pelo Kindar       usar o Kindar.
sistema."       que a gente       Mudou minha
                organiza."        vida."
```

### Gatilhos de Upgrade (Free -> Premium)

| Gatilho | Momento | Feature premium |
|---------|---------|-----------------|
| Segundo filho | Nasce ou e adicionado um novo filho | Mais de 1 crianca no plano free |
| Limite de documentos | Upload de boletim/certidao atinge 100MB | Storage expandido |
| Exportacao | Advogada pede relatorio para processo | Export PDF/Excel |
| Historico de saude | Pediatra pede historico completo de vacinas | Modulo de saude completo |
| Decisoes complexas | Mais de 2 decisoes no mes | Decisoes ilimitadas |

### Metricas da Fase

| Metrica | Meta | Medicao |
|---------|------|---------|
| Retention M3 | > 45% | PostHog cohort |
| Retention M6 | > 35% | PostHog cohort |
| Usuarios por grupo (media) | > 2.5 | Supabase avg |
| Free -> Premium conversion | > 12% | Stripe/Supabase |
| NPS | > 50 | Survey in-app |
| Referrals organicos | > 30% dos novos signups | UTM tracking |

---

## Mapa Emocional Consolidado

```
Emocao
  |
  |  Esperanca          Confianca                    Advocacia
  |     *                  *         *                   *
  |    / \               /   \     /   \               /
  | * /   \           * /     \ * /     \           * /
  |  /     \         /         \/        \         /
  | /       \       /          /\         \       /
  |/    *    \   * /          /  \    *    \   * /
  |   Hesitacao \ /          /    \  Rotina  \ /
  |              *          /      *          *
  |           Ansiedade    /     Frustacao
  |           (setup)     /      (outro pai
  |                      /       usa menos)
  |                     *
  |                   Tensao
  |                   (convite)
  |___________________________________________________________ Tempo
  Fase 1      Fase 2       Fase 3        Fase 4       Fase 5
```

---

## Metricas Consolidadas por Fase

| Fase | Metrica Principal | Meta | Status Atual |
|------|------------------|------|-------------|
| 1 - Descoberta | Signup -> Grupo criado | > 70% | A medir |
| 2 - Setup | Setup completo (filho + escala) | > 60% | A medir |
| 3 - Rotina | DAU/MAU ambos pais | > 40% | A medir |
| 4 - Criticos | Resolucao sem escalar | > 80% | A medir |
| 5 - Continuo | Retention M3 | > 45% | A medir |
