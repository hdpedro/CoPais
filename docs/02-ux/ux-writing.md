# UX Writing - Kindar

> Guia de redacao para toda a interface do Kindar.
> O tom de voz e parte central do produto: somos um mediador digital neutro.
> Versao: 1.0 | Atualizado: Marco 2026

---

## 1. Tom de Voz

### Principios Fundamentais

| Principio       | Descricao                                                         |
|-----------------|-------------------------------------------------------------------|
| **Empatico**    | Reconhecemos que coparentalidade e dificil. Nunca minimizamos.    |
| **Neutro**      | Nunca tomamos partido. Nunca culpamos. Nunca julgamos.            |
| **Factual**     | Informamos fatos, nao interpretamos intencoes.                    |
| **Acionavel**   | Toda mensagem sugere o proximo passo.                             |
| **Conciso**     | Menos palavras, mais clareza. Pais ocupados nao leem paragrafos.  |

### Tom por Contexto

| Contexto            | Tom                    | Exemplo                                    |
|---------------------|------------------------|---------------------------------------------|
| Dashboard           | Acolhedor, informativo | "Boa tarde, Carlos! Lucas esta com voce."   |
| Alertas de saude    | Calmo, preciso         | "Ana registrou: Lucas com febre desde hoje."|
| Trocas de guarda    | Formal, neutro         | "Pedido de troca para 25/03."               |
| Financeiro          | Transparente, direto   | "Saldo do mes: voce pagou R$ 150 a mais."   |
| Chat (moderacao)    | Suave, nao-julgamental | "Esta mensagem pode soar mais dura do que pretendido." |
| Erros               | Compreensivo, util     | "Nao conseguimos salvar. Tente novamente."  |
| Empty states        | Encorajador            | "Nenhuma despesa este mes. Que bom!"        |

---

## 2. Convencoes de Nomenclatura

### Termos do Kindar

| USE                        | NAO USE                      | Motivo                                    |
|----------------------------|------------------------------|-------------------------------------------|
| Responsavel(is)            | Pai/Mae                      | Neutro de genero, inclui avos/cuidadores  |
| Guarda                     | Custodia                     | Termo usado no contexto juridico brasileiro|
| Crianca(s)                 | Filho(a)                     | Neutro - nao assume relacao biologica      |
| Grupo familiar             | Familia                      | Inclui configuracoes nao-tradicionais     |
| Troca                      | Permuta, substituicao        | Simples e direto                           |
| Pedido de troca            | Solicitacao de alteracao      | Informal mas respeitoso                    |
| Escala de guarda           | Calendario de custodia       | Termo acessivel                            |
| Liquidacao                 | Acerto, pagamento de divida  | Formal, sem julgamento                     |
| Registro (saude)           | Relato, denuncia             | Neutro, sem conotacao negativa             |
| Decisao compartilhada      | Decisao conjunta obrigatoria | Colaborativo, nao impositivo               |
| Compromisso                | Evento, obrigacao            | Positivo e neutro                          |

### Roles do Sistema

| Role no BD    | Label na UI         | Contexto                  |
|---------------|---------------------|---------------------------|
| `parent`      | Responsavel          | Perfil                    |
| `grandparent` | Avo/Avo             | Perfil                    |
| `caregiver`   | Outro cuidador       | Perfil                    |
| `mediator`    | Mediador             | Perfil                    |
| `lawyer`      | Advogado             | Perfil                    |
| `admin`       | Administrador        | Papel no grupo            |
| `member`      | Membro               | Papel no grupo            |
| `readonly`    | Visualizador         | Papel no grupo (avos etc) |

---

## 3. Mensagens de Erro

### Principio: Nunca culpar, sempre orientar

**Estrutura padrao:**
```
[O que aconteceu] + [O que fazer agora]
```

### Exemplos por Categoria

#### Autenticacao
| Situacao                | FACA                                           | NAO FACA                         |
|-------------------------|------------------------------------------------|----------------------------------|
| Senha incorreta         | "Senha incorreta. Esqueceu? Redefina aqui."    | "Senha errada."                  |
| Sessao expirada         | "Sua sessao expirou. Faca login novamente."     | "Erro de autenticacao."          |
| Sem permissao           | "Voce nao tem acesso a este grupo."             | "Acesso negado."                 |

#### Formularios
| Situacao                | FACA                                           | NAO FACA                         |
|-------------------------|------------------------------------------------|----------------------------------|
| Campo obrigatorio       | "Titulo e obrigatorio."                         | "Erro: campo vazio."             |
| Valor invalido          | "Insira um valor valido em reais."              | "Input invalido."                |
| Data no passado         | "A data precisa ser futura."                    | "Data invalida."                 |
| Arquivo muito grande    | "Comprovante muito grande. Maximo 5MB."         | "Erro de upload."                |
| Tipo nao permitido      | "Use JPG, PNG, HEIC ou PDF."                    | "Formato invalido."             |

#### Rede/Sistema
| Situacao                | FACA                                           | NAO FACA                         |
|-------------------------|------------------------------------------------|----------------------------------|
| Falha ao salvar         | "Nao conseguimos salvar. Tente novamente."      | "Erro 500."                      |
| Sem conexao             | "Sem conexao. Suas alteracoes serao salvas quando voltar online." | "Network error." |
| Timeout                 | "Esta demorando mais que o normal. Tente novamente em alguns segundos." | "Request timeout." |

---

## 4. Empty States

### Principio: Encorajar, guiar para a acao

| Pagina             | Mensagem                                                    | CTA                        |
|--------------------|-------------------------------------------------------------|-----------------------------|
| Dashboard (novo)   | "Bem-vindo ao Kindar! Comece adicionando uma crianca."      | [Adicionar crianca]          |
| Calendario vazio   | "Nenhuma escala configurada. Configure a escala de guarda."  | [Criar escala]               |
| Despesas vazio     | "Nenhuma despesa este mes."                                  | [Registrar despesa]          |
| Chat sem mensagem  | "Comece uma conversa. Tudo fica registrado aqui."           | (campo de texto ativo)       |
| Saude sem dados    | "Nenhum registro de saude ainda. Que bom!"                   | [Adicionar vacina]           |
| Decisoes vazio     | "Nenhuma decisao pendente. Tudo alinhado!"                   | [Nova decisao]               |
| Documentos vazio   | "Nenhum documento compartilhado."                            | [Enviar documento]           |
| Sem crianca        | "Adicione uma crianca para comecar."                         | [Adicionar crianca]          |
| Sem segundo resp.  | "Convide o outro responsavel para usar juntos."              | [Enviar convite]             |

### Regra de Ouro dos Empty States
- NUNCA mostrar uma tela em branco sem explicacao
- SEMPRE ter um CTA visivel
- Usar tom positivo quando apropriado ("Que bom!" para saude sem problemas)

---

## 5. Notificacoes Push

### Principio: Conciso, factual, nunca inflamatorio

### Formato Padrao
```
Titulo: [Tipo] (max 30 chars)
Corpo: [Quem] [acao]: [objeto] (max 60 chars)
```

### Exemplos

| Tipo                | Titulo              | Corpo                                    |
|---------------------|---------------------|------------------------------------------|
| Troca solicitada    | "Pedido de Troca"   | "Carlos pediu troca para Qua 25/03."     |
| Troca aceita        | "Troca Confirmada"  | "Ana aceitou a troca de 25/03."          |
| Troca nao aceita    | "Troca"             | "Nao foi possivel trocar o dia 25/03."   |
| Despesa registrada  | "Nova Despesa"      | "Ana registrou: Material escolar R$ 150." |
| Despesa aprovada    | "Despesa Aprovada"  | "Carlos aprovou: Material escolar."       |
| Decisao criada      | "Nova Decisao"      | "Ana criou: Mudar Lucas de escola?"       |
| Doenca registrada   | "Alerta de Saude"   | "Ana registrou: Lucas com Gripe."         |
| Medicamento         | "Medicamento"       | "Lembrete: Amoxicilina para Lucas."       |
| Check-in            | "Check-in"          | "Carlos registrou check-in de Lucas."     |
| Chat                | "Nova Mensagem"     | "Carlos no chat Geral."                   |

### O Que NUNCA Fazer em Notificacoes

| NAO FACA                                           | POR QUE                                     |
|----------------------------------------------------|----------------------------------------------|
| "Ana RECUSOU sua troca"                             | Tom acusatorio, inflama conflito             |
| "Carlos NAO respondeu a decisao!"                   | Pressao passivo-agressiva                    |
| "Ana gastou R$ 500 sem seu acordo"                  | Julgamento de valor                          |
| "URGENTE: Lucas esta doente e voce nao viu"         | Culpabilizante                               |
| "Voce esqueceu o medicamento de Lucas"              | Acusatorio                                   |

---

## 6. Escritas de Contexto Especifico

### 6.1 Decisoes - DO vs DON'T

| Contexto              | FACA                                          | NAO FACA                                 |
|-----------------------|-----------------------------------------------|------------------------------------------|
| Decisao criada        | "Nova decisao criada. O outro responsavel sera notificado." | "Decisao enviada para aprovacao." |
| Voto registrado       | "Seu voto foi registrado."                    | "Voce votou contra."                     |
| Prazo proximo         | "Prazo em 2 dias."                            | "ATENCAO: prazo vencendo!"               |
| Sem consenso          | "Os responsaveis nao concordaram. Considere conversar ou buscar mediacao." | "Decisao rejeitada pelo outro responsavel." |

### 6.2 Trocas de Guarda - DO vs DON'T

| Contexto              | FACA                                          | NAO FACA                                 |
|-----------------------|-----------------------------------------------|------------------------------------------|
| Pedido enviado        | "Pedido de troca enviado."                    | "Aguardando resposta de Ana."            |
| Pedido aceito         | "Troca confirmada para 25/03."                | "Ana aceitou! Finalmente."               |
| Pedido nao aceito     | "Nao foi possivel trocar o dia 25/03."        | "Ana recusou sua troca."                 |
| Sem data proposta     | "Troca sem data de compensacao. O saldo sera ajustado." | "Voce ficou devendo um dia." |

### 6.3 Alertas de Saude - DO vs DON'T

| Contexto              | FACA                                          | NAO FACA                                 |
|-----------------------|-----------------------------------------------|------------------------------------------|
| Doenca registrada     | "Lucas com febre desde hoje. Registrado por Ana." | "ALERTA: Ana diz que Lucas esta doente!" |
| Medicamento ativo     | "Amoxicilina: 5ml a cada 8h."                | "LEMBRETE URGENTE de medicamento!"        |
| Consulta proxima      | "Consulta com Dr. Silva amanha as 10h."       | "Nao esqueca a consulta!"                |
| Vacina atrasada       | "1 vacina pendente no calendario SBP."        | "ATENCAO: vacina atrasada!"              |

### 6.4 Financeiro - DO vs DON'T

| Contexto              | FACA                                          | NAO FACA                                 |
|-----------------------|-----------------------------------------------|------------------------------------------|
| Saldo devedor         | "Saldo do mes: voce pagou R$ 150 a mais."     | "Ana te deve R$ 150."                    |
| Saldo credor          | "Saldo do mes: o outro responsavel pagou R$ 150 a mais." | "Voce deve R$ 150 para Ana." |
| Despesa pendente      | "1 despesa aguardando sua revisao."            | "Aprove a despesa de Ana!"               |
| Liquidacao            | "Liquidacao de R$ 150 registrada via PIX."     | "Divida paga!"                           |

---

## 7. Regras de Escrita Consciente de Conflito

### 7.1 Voz Passiva Estrategica
Quando a acao pode gerar ressentimento, usar voz passiva para remover o "agente":

- **Ativo (evitar)**: "Ana recusou sua troca."
- **Passivo (preferir)**: "Nao foi possivel trocar o dia 25/03."

### 7.2 Foco no Fato, Nao na Pessoa
- **Pessoa (evitar)**: "Carlos nao respondeu."
- **Fato (preferir)**: "Decisao aguardando resposta."

### 7.3 Nunca Usar Exclamacao em Alertas
Exclamacao transmite urgencia emocional. Usamos ponto final mesmo em alertas.
- **Evitar**: "URGENTE! Lucas no hospital!"
- **Preferir**: "Lucas hospitalizado. Registrado por Ana."

### 7.4 Sugestao em Vez de Cobranca
- **Cobranca (evitar)**: "Responda a decisao pendente."
- **Sugestao (preferir)**: "Tem 1 decisao pendente para revisar."

### 7.5 Moderacao de Tom no Chat
O sistema `analyzeTone()` detecta padroes agressivos antes do envio:

| Padrao Detectado      | Aviso do Sistema                                       |
|-----------------------|--------------------------------------------------------|
| Palavroes             | "Esta mensagem pode soar mais dura do que pretendido." |
| Tom acusatorio        | "Considere reformular para focar no fato."             |
| CAPS LOCK             | "Letras maiusculas podem ser interpretadas como gritar."|
| Multiplas exclamacoes | "Tente usar um tom mais neutro."                       |

**O sistema NUNCA bloqueia**: apenas sugere. O usuario decide enviar ou reescrever.

---

## 8. Internacionalizacao (i18n)

### Idiomas Suportados
| Codigo | Idioma     | Status     |
|--------|------------|------------|
| `pt`   | Portugues  | Completo   |
| `en`   | Ingles     | Completo   |
| `es`   | Espanhol   | Completo   |
| `fr`   | Frances    | Completo   |
| `de`   | Alemao     | Completo   |

### Regras de Traducao
- Termos juridicos devem ser adaptados por pais (ex: "guarda" no BR vs "custodia" em PT)
- Formatos de data seguem o locale (`DD/MM` para pt, `MM/DD` para en)
- Moeda: exibir no formato local (R$ para pt-BR, $ para en-US, etc.)
- Emojis sao universais e nao precisam de traducao
- Chaves i18n seguem namespacing: `nav.home`, `health.title`, `decisions.empty`

### Fallback
Se uma chave nao existir no idioma selecionado, retorna a chave em portugues. Se tambem nao existir em portugues, retorna a propria chave como string.

---

*Este guia deve ser consultado antes de escrever qualquer texto na interface do Kindar.*
