# ROTEIRO DE TESTES — Kindar (CoPais)

**Versao:** 1.0
**Data:** 2026-03-18
**Objetivo:** Validar todas as funcionalidades e cenarios possiveis antes do lancamento em producao.

---

## PERFIS DE TESTE

| Perfil | Descricao | Papel |
|--------|-----------|-------|
| **PAI_A** | Criador do grupo (admin) | parent / admin |
| **MAE_B** | Convidada e aceita no grupo | parent / member |
| **AVO_C** | Convidada como avo (readonly) | grandparent / readonly |
| **USUARIO_NOVO** | Sem conta, nao logado | — |
| **MEDIADOR_D** | Convidado como mediador | mediator / member |

---

## MODULO 1 — AUTENTICACAO E ONBOARDING

### 1.1 Cadastro (Signup)

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 1.1.1 | Cadastro com dados validos | Acessar /signup > preencher nome, email, senha > submeter | Redireciona para /verify-email, email de confirmacao enviado |
| 1.1.2 | Cadastro com email ja existente | Tentar cadastrar com email do PAI_A | Mensagem de erro "Email ja cadastrado" ou similar |
| 1.1.3 | Cadastro com senha fraca | Preencher senha com menos de 6 caracteres | Erro de validacao do Supabase |
| 1.1.4 | Cadastro com campos vazios | Submeter formulario sem preencher | Campos obrigatorios bloqueiam envio (validacao HTML5) |
| 1.1.5 | Cadastro via link de convite | Acessar /signup com ?token=xxx na URL | Apos verificar email e logar, convite e aceito automaticamente |

### 1.2 Login

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 1.2.1 | Login valido (com grupo) | Entrar com email/senha do PAI_A | Redireciona para /dashboard |
| 1.2.2 | Login valido (sem grupo) | Entrar com conta nova sem grupo | Redireciona para /onboarding |
| 1.2.3 | Login com senha errada | Email correto + senha errada | Mensagem "Credenciais invalidas" |
| 1.2.4 | Login com email nao cadastrado | Email inexistente | Mensagem de erro |
| 1.2.5 | Login com convite pendente | Login tendo token de convite na URL | Redireciona para /convite/[token] |

### 1.3 Recuperacao de Senha

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 1.3.1 | Solicitar reset | Acessar /forgot-password > digitar email valido | Email de reset enviado, mensagem de sucesso |
| 1.3.2 | Redefinir senha | Clicar no link do email > preencher nova senha em /reset-password | Senha atualizada, redireciona para login |
| 1.3.3 | Email inexistente | Digitar email nao cadastrado | Nao revela se email existe (seguranca) |

### 1.4 Onboarding

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 1.4.1 | Criar grupo com crianca | Preencher nome do grupo, nome da crianca, data de nascimento | Grupo criado, redireciona para /onboarding/convite |
| 1.4.2 | Campos vazios | Submeter sem preencher | Validacao bloqueia envio |
| 1.4.3 | Compartilhar convite | Na tela /onboarding/convite, clicar "Compartilhar" | Link de convite copiado ou compartilhado via Web Share API |

### 1.5 Sessao e Seguranca

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 1.5.1 | Acesso sem login | Acessar /dashboard diretamente sem estar logado | Redireciona para /login |
| 1.5.2 | Token expirado | Esperar sessao expirar ou simular | Redireciona para /login ao tentar acao |
| 1.5.3 | Logout | Clicar "Sair da conta" no perfil | Sessao encerrada, redireciona para /login |

---

## MODULO 2 — DASHBOARD

### 2.1 Visualizacao

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 2.1.1 | Dashboard com escala ativa | Logar como PAI_A com eventos de custodia cadastrados | Hero card mostra "Com voce" ou "Com [nome]" e cor do responsavel |
| 2.1.2 | Dashboard sem escala | Logar como usuario sem eventos de custodia | Hero card mostra "Criar escala" com link para /calendario/escala |
| 2.1.3 | Visao da semana | Verificar os 7 dias da semana no dashboard | Cada dia mostra cor do responsavel; hoje esta destacado |
| 2.1.4 | Feriados | Verificar dia de feriado na semana | Dia mostra indicador roxo e nome do feriado |
| 2.1.5 | Saldo de trocas | Ter trocas aprovadas | Card "Saldo de Trocas" mostra +N/-N dias por pai |
| 2.1.6 | Saldo equilibrado | Trocas equilibradas (mesma qtd) | Mostra "Equilibrado" com check verde |
| 2.1.7 | Sem trocas | Nenhuma troca feita | Card de saldo nao aparece |
| 2.1.8 | Resumo financeiro | Ter despesas cadastradas | Card mostra total do mes e saldo por membro |
| 2.1.9 | Proximos eventos | Ter eventos futuros cadastrados | Lista ate 5 proximos eventos com data e titulo |
| 2.1.10 | Botoes de acao rapida | Verificar grid de botoes | Todos os links navegam para as paginas corretas |

---

## MODULO 3 — CALENDARIO E CUSTODIA

### 3.1 Visualizacao do Calendario

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 3.1.1 | Mes atual | Acessar /calendario | Grid do mes atual com dias coloridos por custodia |
| 3.1.2 | Navegar entre meses | Clicar setas de proximo/anterior | Mes muda, eventos atualizam |
| 3.1.3 | Dia com custodia | Verificar dia com evento | Cor do pai responsavel, nome visivel |
| 3.1.4 | Dia com feriado | Verificar feriado nacional | Indicador roxo com nome do feriado |
| 3.1.5 | Dia sem custodia | Dia sem evento atribuido | Celula sem cor de custodia |
| 3.1.6 | Fim de semana | Verificar sabado e domingo | Destacados visualmente (numero do dia diferenciado) |

### 3.2 Criar Evento de Custodia

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 3.2.1 | Evento simples | /calendario/novo > preencher crianca, responsavel, datas, tipo | Evento criado, redireciona para /calendario |
| 3.2.2 | Evento com horario | Adicionar horarios de inicio e fim | Evento salvo com horarios |
| 3.2.3 | Evento recorrente semanal | Marcar recorrente, regra "weekly", data limite | Multiplos eventos gerados (max 52) |
| 3.2.4 | Evento recorrente quinzenal | Regra "biweekly" | Eventos a cada 14 dias |
| 3.2.5 | Campos obrigatorios vazios | Submeter sem crianca ou datas | Erro de validacao |
| 3.2.6 | Usuario sem grupo | Tentar criar evento em grupo alheio | Erro "Sem permissao para este grupo" |

### 3.3 Escala Quinzenal (Schedule Builder)

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 3.3.1 | Modelo semanas alternadas | Clicar "Semanas alternadas" | Semana 1 = Pai A, Semana 2 = Mae B (cores distintas) |
| 3.3.2 | Modelo 5-2 / 2-5 | Clicar preset | Padrao correto aplicado |
| 3.3.3 | Modelo 3-4 / 4-3 | Clicar preset | Padrao correto aplicado |
| 3.3.4 | Modelo 2-3 + FDS alternado | Clicar preset | Padrao correto aplicado |
| 3.3.5 | Clicar dia individual | Tocar em uma celula | Cicla entre: vazio > Pai A > Mae B > vazio |
| 3.3.6 | Preencher semana inteira | Clicar botao do nome acima da semana | Todos 7 dias atribuidos ao pai selecionado |
| 3.3.7 | Legenda de cores | Verificar legenda no topo | Nomes completos (primeiro nome) com cores e "(voce)" para o usuario logado |
| 3.3.8 | Separacao de FDS | Verificar grid | Dias uteis (Seg-Sex) separados visualmente do FDS (Sab-Dom) com divisor |
| 3.3.9 | FDS com estilo amber | Verificar sabado/domingo | Borda e fundo amber quando nao atribuido |
| 3.3.10 | Gerar para 3 meses | Selecionar 3 meses > gerar | Eventos criados, estimativa mostrada corretamente |
| 3.3.11 | Gerar para 6 meses | Selecionar 6 meses > gerar | Eventos criados (~180 eventos) |
| 3.3.12 | Gerar para 12 meses | Selecionar 12 meses > gerar | Eventos criados (~360 eventos) |
| 3.3.13 | Escala sem dias atribuidos | Nao selecionar nenhum dia > tentar gerar | Botao desabilitado + erro "Configure pelo menos 1 dia" |
| 3.3.14 | Selecionar crianca | Se houver 2+ criancas, trocar no seletor | Seletor aparece apenas com 2+ criancas |
| 3.3.15 | Data de inicio | Alterar data de inicio da escala | Escala inicia na data escolhida |

### 3.4 Trocas de Dia (Swap Requests)

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 3.4.1 | Solicitar troca (pai) | Clicar no dia do outro pai > preencher data proposta e motivo | Solicitacao criada com status "pending" |
| 3.4.2 | Solicitar visita (avo) | Logar como AVO_C > clicar em um dia > solicitar visita | Solicitacao de visita criada (sem data proposta) |
| 3.4.3 | Aprovar troca | Logar como alvo da troca > aprovar | Status "approved", eventos de swap criados para ambas as datas |
| 3.4.4 | Rejeitar troca | Logar como alvo > rejeitar | Status "rejected", nenhum evento criado |
| 3.4.5 | Verificar saldo apos troca | Aprovar uma troca | Saldo de trocas atualiza (+1/-1) |
| 3.4.6 | Troca sem data proposta | Solicitar troca sem preencher data | Validacao impede envio |
| 3.4.7 | Troca em grupo alheio | Tentar solicitar troca em grupo que nao pertence | Erro "Sem permissao" |
| 3.4.8 | Responsavel nao encontrado | Clicar em dia sem responsavel | Erro ou modal nao abre |

### 3.5 Exportar Calendario (iCal)

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 3.5.1 | Gerar link iCal | Clicar botao de exportar calendario | Token gerado, link copiado |
| 3.5.2 | Acessar feed iCal | Abrir /api/calendar/[token] no navegador | Arquivo .ics baixado com eventos |
| 3.5.3 | Token invalido | Acessar /api/calendar/token-falso | Erro 401/404 |
| 3.5.4 | Reusar token | Exportar novamente | Mesmo token retornado (nao duplica) |

### 3.6 Planejador de Fim de Semana

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 3.6.1 | Proximos FDS | Verificar componente no calendario | Lista proximos fins de semana com responsavel |
| 3.6.2 | FDS do usuario | Verificar FDS onde usuario e responsavel | Destacado como "Seu fim de semana" |

---

## MODULO 4 — GESTAO DE CRIANCAS

### 4.1 Listar Criancas

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 4.1.1 | Listar criancas do grupo | Acessar /criancas | Lista todas as criancas com nome, idade, alergias |
| 4.1.2 | Grupo sem criancas | Remover todas as criancas | Mensagem "Nenhuma crianca cadastrada" |

### 4.2 Adicionar Crianca

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 4.2.1 | Adicionar com dados completos | /criancas/nova > nome, nascimento, alergias, notas | Crianca criada, redireciona para /criancas |
| 4.2.2 | Adicionar com campos minimos | Apenas nome e nascimento | Crianca criada com alergias e notas nulos |
| 4.2.3 | Alergias multiplas | Digitar "Amendoim, Leite, Gluten" | Salvo como array ["Amendoim", "Leite", "Gluten"] |
| 4.2.4 | Sem permissao | Tentar adicionar crianca em grupo alheio | Erro de permissao |
| 4.2.5 | Campos obrigatorios vazios | Submeter sem nome ou data | Erro de validacao |

### 4.3 Editar Crianca

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 4.3.1 | Editar nome e data | /criancas/[id] > alterar dados > salvar | Dados atualizados, redireciona para /criancas |
| 4.3.2 | Adicionar alergia | Editar campo de alergias | Array atualizado |
| 4.3.3 | Remover notas | Limpar campo de notas | Notes salvo como null |
| 4.3.4 | Crianca inexistente | Acessar /criancas/id-invalido | Redireciona com erro "Crianca nao encontrada" |
| 4.3.5 | Sem permissao no grupo | Tentar editar crianca de outro grupo | Erro "Sem permissao" |

---

## MODULO 5 — FAMILIA E CONVITES

### 5.1 Visualizar Membros

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 5.1.1 | Lista de membros | Acessar /familia como PAI_A | Todos os membros listados com nome, email, papel, data de entrada |
| 5.1.2 | Badge "criador" | Verificar membro que criou o grupo | Badge "Criador" visivel |
| 5.1.3 | Badge "voce" | Verificar usuario logado na lista | Badge "Voce" visivel |
| 5.1.4 | Papeis exibidos | Verificar cada membro | Papel correto: admin, member, readonly |

### 5.2 Gerenciar Membros (Admin)

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 5.2.1 | Mudar papel para admin | Selecionar membro > mudar para "admin" | Papel atualizado |
| 5.2.2 | Mudar papel para readonly | Selecionar membro > mudar para "readonly" | Papel atualizado |
| 5.2.3 | Remover membro | Clicar remover > confirmar no modal | Membro removido, historico preservado |
| 5.2.4 | Admin nao pode se remover | Verificar acoes no proprio usuario | Botoes de gerenciamento ausentes |
| 5.2.5 | Nao-admin sem acesso | Logar como MAE_B (member) > acessar /familia | Botoes de gerenciamento nao aparecem |

### 5.3 Convites

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 5.3.1 | Enviar convite | /convite/enviar > email + papel | Convite criado, token gerado |
| 5.3.2 | Aceitar convite | Acessar /convite/[token] logado | Usuario adicionado ao grupo com papel correto |
| 5.3.3 | Aceitar convite sem conta | Acessar /convite/[token] sem login | Redireciona para signup, apos cadastro aceita o convite |
| 5.3.4 | Convite expirado | Tentar aceitar convite antigo (7+ dias) | Erro "Convite expirado" |
| 5.3.5 | Convite ja aceito | Tentar aceitar novamente | Erro ou redireciona para dashboard |
| 5.3.6 | Cancelar convite pendente | Admin clica "Cancelar" no convite | Status muda para "revoked" |
| 5.3.7 | Convite para avo | Enviar convite com papel "grandparent" | Ao aceitar, perfil recebe role "grandparent" |
| 5.3.8 | Convite nao sobrescreve papel | Pai aceita convite de "grandparent" | Se ja e "parent", papel NAO muda para "grandparent" |
| 5.3.9 | Historico de convites | Verificar secao de historico | Ultimos 10 convites com status (aceito/revogado/pendente) |
| 5.3.10 | Dias restantes | Verificar convite pendente | Mostra "X dias restantes" ou "Expirado" |

---

## MODULO 6 — CHAT E COMUNICACAO

### 6.1 Mensagens

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 6.1.1 | Enviar mensagem simples | Digitar texto > enviar | Mensagem aparece instantaneamente (otimista) |
| 6.1.2 | Mensagem curta (< 5 chars) | Enviar "Oi" | Enviada sem analise de tom |
| 6.1.3 | Mensagem em tempo real | PAI_A envia > verificar na tela de MAE_B | Mensagem aparece em tempo real via Supabase Realtime |
| 6.1.4 | Historico de mensagens | Abrir chat com mensagens anteriores | Todas as mensagens carregadas com scroll |
| 6.1.5 | Mensagem vazia | Tentar enviar mensagem so com espacos | Envio bloqueado |

### 6.2 Moderador de Tom

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 6.2.1 | Mensagem neutra | Digitar "Podemos conversar sobre os horarios?" | Nenhum alerta de tom |
| 6.2.2 | CAPS LOCK (agressivo) | Digitar "VOCE NUNCA FAZ NADA CERTO" | Alerta de tom agressivo com sugestao de reescrita |
| 6.2.3 | Insulto direto | Digitar "Voce e um idiota" | Alerta com pontuacao alta (50+ pontos), sugestao neutra |
| 6.2.4 | Palavras absolutistas | Digitar "Voce SEMPRE faz isso, NUNCA muda" | Alerta com sugestao trocando "sempre"→"frequentemente", "nunca"→"as vezes" |
| 6.2.5 | Ameaca | Digitar "Vai se arrepender disso" | Alerta com pontuacao 35+, sugestao cooperativa |
| 6.2.6 | Comando agressivo | Digitar "Cala a boca e escuta" | Alerta com pontuacao 40+, reescrita educada |
| 6.2.7 | Sarcasmo | Digitar "Parabens, voce e incrivel mesmo" | Alerta com deteccao de sarcasmo |
| 6.2.8 | Enviar mesmo com alerta | Ter alerta ativo > tentar enviar | Botao de envio BLOQUEADO enquanto tom agressivo |
| 6.2.9 | Aceitar sugestao | Alerta aparece > clicar na sugestao | Texto substituido pela versao neutra |
| 6.2.10 | Delay de analise | Digitar e parar | Analise dispara 1.5s apos parar de digitar |

---

## MODULO 7 — DESPESAS E FINANCEIRO

### 7.1 Criar Despesa

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 7.1.1 | Despesa completa | /despesas/nova > descricao, valor, categoria, data | Despesa criada com status "pending" |
| 7.1.2 | Despesa com crianca | Selecionar crianca associada | Salvo com child_id |
| 7.1.3 | Despesa sem crianca | Nao selecionar crianca | child_id nulo |
| 7.1.4 | Valor zero | Digitar R$ 0,00 | Erro: valor deve ser > 0 |
| 7.1.5 | Valor negativo | Digitar valor negativo | Erro de validacao |
| 7.1.6 | Todas as categorias | Testar cada: educacao, saude, alimentacao, vestuario, transporte, lazer, moradia, outros | Cada categoria salva corretamente |
| 7.1.7 | Sem permissao | Tentar criar despesa em grupo alheio | Erro de permissao |

### 7.2 Aprovar/Rejeitar Despesa

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 7.2.1 | Aprovar despesa | Outro membro clica "Aprovar" | Status = "approved", approved_by preenchido, approved_at com data |
| 7.2.2 | Rejeitar despesa | Clicar "Rejeitar" | Status = "rejected", approved_by e approved_at ficam NULL |
| 7.2.3 | Voltar para pendente | Mudar status para "pending" | approved_by e approved_at ficam NULL |
| 7.2.4 | Status invalido | Tentar enviar status "hacked" | Erro "Status invalido" |

### 7.3 Dashboard Financeiro

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 7.3.1 | Resumo mensal | Acessar /financeiro > aba "Resumo" | Total de despesas aprovadas + pendentes do mes |
| 7.3.2 | Historico mensal | Aba "Historico" | Grafico por mes com barras por membro |
| 7.3.3 | Navegar entre meses | Clicar setas prev/next | Dados do mes selecionado |
| 7.3.4 | Saldo entre pais | Verificar calculo de saldo | Divisao 50/50 correta: "Pai deve R$ X para Mae" |
| 7.3.5 | Categorias | Verificar breakdown por categoria | Percentual e valor corretos |
| 7.3.6 | Mes sem despesas | Navegar para mes vazio | Mensagem "Nenhuma despesa neste mes" |
| 7.3.7 | Rejeitadas nao contam | Ter despesas rejeitadas | NAO aparecem no calculo de saldo/total |
| 7.3.8 | Apenas 1 membro | Grupo com apenas 1 membro | Saldo mostra sem comparacao |

---

## MODULO 8 — REGISTROS DA CRIANCA

### 8.1 Saude

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 8.1.1 | Registrar febre | Tipo "febre", valor "38.5C" | Log criado com icone correto |
| 8.1.2 | Registrar medicamento | Tipo "medication", valor "Paracetamol" | Log salvo |
| 8.1.3 | Registrar vacina | Tipo "vaccine", notas "BCG" | Log salvo |
| 8.1.4 | Todos os tipos | Testar: fever, medication, mood, screen_time, food, sleep, weight, height, vaccine, other | Cada tipo salva com icone correto |
| 8.1.5 | Sem valor (opcional) | Tipo "mood", sem valor | Log salvo com value nulo |
| 8.1.6 | Historico | Verificar lista | Ultimos 30 logs em ordem cronologica descendente |
| 8.1.7 | Autoria | Verificar "Por [nome]" | Nome do autor exibido |

### 8.2 Escola

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 8.2.1 | Registrar nota | Tipo "grade", titulo "Prova de matematica" | Log criado |
| 8.2.2 | Registrar reuniao | Tipo "meeting", titulo "Reuniao de pais" | Log salvo |
| 8.2.3 | Todos os tipos | grade, meeting, behavior, homework, event, absence, achievement, concern, other | Cada tipo com icone correto |
| 8.2.4 | Data personalizada | Alterar data para ontem | Salvo com data correta |
| 8.2.5 | Descricao opcional | Sem descricao | Log salvo com description nulo |

### 8.3 Eventos e Marcos

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 8.3.1 | Criar evento futuro | Titulo, data futura, horario, local | Evento aparece em "Proximos eventos" |
| 8.3.2 | Criar evento passado | Data no passado | Evento aparece em "Eventos passados" |
| 8.3.3 | Evento com imagem | Anexar foto de convite | Imagem salva e exibida |
| 8.3.4 | Evento minimo | Apenas titulo e data | Evento criado sem horario/local/imagem |
| 8.3.5 | Associar crianca | Selecionar crianca | Nome da crianca exibido no evento |

### 8.4 Acordos de Coparentalidade

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 8.4.1 | Criar acordo | Titulo, descricao, categoria "rule" | Acordo criado com status "Pendente" |
| 8.4.2 | Marcar inegociavel | Checkbox "inegociavel" marcado | Acordo exibido com borda de destaque |
| 8.4.3 | Aceitar acordo | Outro pai clica "Aceitar" | Status muda para "Aceito" (verde) |
| 8.4.4 | Criador nao aceita | Verificar botoes no proprio acordo | Botao "Aceitar" NAO aparece para o criador |
| 8.4.5 | Todas as categorias | principle, value, rule, boundary, routine | Cada categoria salva corretamente |
| 8.4.6 | Ordenacao | Ter acordos inegociaveis e normais | Inegociaveis aparecem primeiro |

### 8.5 Temas Sensiveis

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 8.5.1 | Criar nota urgente | Topico, titulo, conteudo + marcar urgente | Nota com borda vermelha, ordenada primeiro |
| 8.5.2 | Criar nota normal | Sem marcar urgente | Nota sem destaque |
| 8.5.3 | Com link de fonte | Adicionar URL de referencia | Link clicavel exibido |
| 8.5.4 | Todos os topicos | gender_violence, sexual_violence, bullying, mental_health, substance_abuse, safety, other | Cada topico com icone correto |
| 8.5.5 | Associar crianca | Selecionar crianca | Nome exibido na nota |
| 8.5.6 | Ordenacao | Urgentes vs normais | Urgentes sempre primeiro |

---

## MODULO 9 — DOCUMENTOS

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 9.1 | Upload de documento | Nome, categoria, arquivo | Documento salvo no Supabase Storage |
| 9.2 | Categorias | personal, health, education, legal, other | Cada categoria exibida corretamente |
| 9.3 | Download | Clicar no documento na lista | Arquivo baixado |
| 9.4 | Sem crianca | Nao selecionar crianca | Exibido como "Geral" |
| 9.5 | Com crianca | Selecionar crianca | Nome da crianca exibido |
| 9.6 | Metadados | Verificar lista | Mostra: nome, categoria, autor, data, tamanho |

---

## MODULO 10 — CHECK-IN DIARIO

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 10.1 | Check-in completo | Selecionar crianca, categorias (screen_time, food, sleep, mood, health, activity, school, other), notas | Check-in salvo |
| 10.2 | Sincronizacao com chat | Fazer check-in | Mensagem automatica aparece no chat do grupo |
| 10.3 | Emojis das categorias | Verificar cada categoria | Emoji correto exibido (definido em CHECKIN_CATEGORIES) |
| 10.4 | Sem permissao | Tentar check-in em grupo alheio | Erro de permissao |

---

## MODULO 11 — PERFIL DO USUARIO

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 11.1 | Dados do perfil | Acessar /perfil | Nome, email, papel, telefone (se houver) exibidos |
| 11.2 | Inicial no avatar | Verificar circulo | Primeira letra do nome em maiusculo |
| 11.3 | Data de criacao | Verificar "Membro desde" | Data formatada em pt-BR (dd/mm/aaaa), sem "Invalid Date" |
| 11.4 | Sem data de criacao | Perfil sem created_at | Exibe "—" em vez de "Invalid Date" |
| 11.5 | Grupos listados | Verificar "Meus Grupos" | Todos os grupos com nome e papel |
| 11.6 | Botao convidar (admin) | Verificar grupo onde e admin | Link "Convidar" visivel |
| 11.7 | Botao convidar (member) | Verificar grupo onde NAO e admin | Link "Convidar" ausente |
| 11.8 | Links rapidos | Verificar "Gerenciar Criancas" e "Documentos" | Links navegam corretamente |
| 11.9 | Logout | Clicar "Sair da conta" | Sessao encerrada, redireciona para /login |

---

## MODULO 12 — NAVEGACAO E PWA

### 12.1 Bottom Navigation

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 12.1.1 | Abas ativas | Navegar entre: Inicio, Calendario, Chat, Financeiro, Mais | Aba ativa destacada com cor primaria |
| 12.1.2 | Navegacao client-side | Clicar em aba | Navegacao sem reload completo (SPA) |
| 12.1.3 | Rota aninhada | Estar em /calendario/escala | Aba "Calendario" continua ativa |

### 12.2 PWA

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 12.2.1 | Instalar no iPhone | Safari > Adicionar a Tela de Inicio | App instala com icone "Kindar" e abre standalone |
| 12.2.2 | Instalar no Android | Chrome > "Instalar app" / "Adicionar a tela" | App instala e abre standalone |
| 12.2.3 | Tela standalone | Abrir app instalado | Sem barra do navegador, tema teal #1A3B3A |
| 12.2.4 | Service worker | Verificar em DevTools > Application | SW registrado e ativo |
| 12.2.5 | Manifest | Verificar em DevTools > Application | manifest.json carregado com nome, icones, cores |

---

## MODULO 13 — SEGURANCA E PERMISSOES

### 13.1 Verificacao de Grupo (Todas as Acoes)

| # | Cenario | Acao Testada | Resultado Esperado |
|---|---------|-------------|-------------------|
| 13.1.1 | Usuario de outro grupo tenta criar evento | createCustodyEvent | Erro "Sem permissao" |
| 13.1.2 | Usuario de outro grupo tenta adicionar crianca | addChild | Redireciona com erro |
| 13.1.3 | Usuario de outro grupo tenta editar crianca | updateChild | Redireciona com erro |
| 13.1.4 | Usuario de outro grupo tenta criar despesa | createExpense | Erro de permissao |
| 13.1.5 | Usuario de outro grupo tenta solicitar troca | createSwapRequest | Erro "Sem permissao" |
| 13.1.6 | Usuario de outro grupo tenta gerar escala | generateSchedule | Erro "Sem permissao" |
| 13.1.7 | Usuario de outro grupo tenta criar acordo | createAgreement | Erro de permissao |
| 13.1.8 | Usuario de outro grupo tenta criar check-in | createCheckin | Erro de permissao |
| 13.1.9 | Usuario de outro grupo tenta upload documento | createDocument | Erro de permissao |
| 13.1.10 | Usuario de outro grupo tenta criar evento | createEvent | Erro de permissao |
| 13.1.11 | Usuario de outro grupo tenta criar log saude | createHealthLog | Erro de permissao |
| 13.1.12 | Usuario de outro grupo tenta criar log escola | createSchoolLog | Erro de permissao |
| 13.1.13 | Usuario de outro grupo tenta criar nota sensivel | createSensitiveNote | Erro de permissao |

### 13.2 Permissoes por Papel

| # | Cenario | Resultado Esperado |
|---|---------|-------------------|
| 13.2.1 | Admin gerencia membros | Pode mudar papeis e remover |
| 13.2.2 | Member nao gerencia membros | Botoes de gerenciamento ocultos |
| 13.2.3 | Readonly visualiza apenas | Pode ver dados mas nao editar |
| 13.2.4 | Admin envia convites | Botao "Convidar" visivel no perfil e familia |
| 13.2.5 | Member nao envia convites | Botao "Convidar" oculto |

---

## MODULO 14 — CENARIOS MULTIUSUARIO

### 14.1 Dois Pais em Paralelo

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 14.1.1 | Chat simultaneo | PAI_A e MAE_B enviam mensagens | Ambos veem mensagens em tempo real |
| 14.1.2 | Troca de dia completa | PAI_A solicita troca > MAE_B aprova | Escala atualiza para ambos no calendario |
| 14.1.3 | Despesa compartilhada | PAI_A cria despesa > MAE_B aprova | Saldo financeiro atualiza para ambos |
| 14.1.4 | Acordo bilateral | PAI_A cria acordo > MAE_B aceita | Status muda para "Aceito" |
| 14.1.5 | Escala vista por ambos | PAI_A gera escala | MAE_B ve mesma escala no calendario |
| 14.1.6 | Criar crianca por ambos | MAE_B adiciona segunda crianca | Ambos veem na lista |
| 14.1.7 | Check-in cruzado | PAI_A faz check-in > MAE_B ve no chat | Mensagem do check-in aparece no chat |

### 14.2 Pai + Avo

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 14.2.1 | Avo visualiza calendario | AVO_C acessa /calendario | Ve escala mas NAO pode editar |
| 14.2.2 | Avo solicita visita | AVO_C clica em dia > solicita visita | Pedido de visita enviado (nao troca) |
| 14.2.3 | Avo no chat | AVO_C envia mensagem | Mensagem visivel para todos |
| 14.2.4 | Avo nao gerencia familia | AVO_C acessa /familia | Sem botoes de admin |

### 14.3 Cenarios de Conflito

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 14.3.1 | Duas trocas no mesmo dia | PAI_A e MAE_B ambos pedem troca do mesmo dia | Ambas as solicitacoes criadas (mas so 1 pode ser aprovada por vez) |
| 14.3.2 | Despesa duplicada | Criar 2 despesas com mesma descricao | Ambas salvas (sem restricao de duplicata) |
| 14.3.3 | Mensagem agressiva entre pais | PAI_A tenta ofender MAE_B | Moderador bloqueia envio |

---

## MODULO 15 — FERIADOS BRASILEIROS

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 15.1 | Feriados fixos | Verificar: 01/01 (Ano Novo), 21/04 (Tiradentes), 01/05 (Trabalho), 07/09 (Independencia), 12/10 (Aparecida), 02/11 (Finados), 15/11 (Republica), 20/11 (Consciencia Negra), 25/12 (Natal) | Todos marcados com indicador roxo |
| 15.2 | Feriados moveis | Verificar Carnaval, Sexta-feira Santa, Pascoa, Corpus Christi | Datas corretas para o ano vigente |
| 15.3 | Feriado no calendario | Navegar para mes com feriado | Dia mostra nome do feriado |
| 15.4 | Feriado no dashboard | Feriado na semana atual | Card mostra indicador do feriado |

---

## MODULO 16 — AGENDA UNIFICADA (ATIVIDADES + EVENTOS)

### 16.1 Formulario Unificado

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 16.1.1 | Abrir formulario | /calendario > clicar "+ Novo" | Pagina com grid de 9 categorias (Esporte, Saude, Escola, Arte, Musica, Terapia, Evento, Guarda, Outro) |
| 16.1.2 | Selecionar atividade | Clicar em "Esporte" | Campos de atividade aparecem (nome, recorrencia, checklist) |
| 16.1.3 | Selecionar evento | Clicar em "Evento" | Campos de evento aparecem (titulo, descricao, data, imagem) |
| 16.1.4 | Selecionar guarda | Clicar em "Guarda" | Campos de guarda aparecem (responsavel, tipo, datas) |
| 16.1.5 | Trocar categoria | Selecionar Esporte e depois Evento | Campos mudam conforme categoria selecionada |
| 16.1.6 | Checklist pre-preenchido | Selecionar "Esporte" | Checklist ja vem com: Uniforme, Tenis/Chuteira, Meia, etc. |
| 16.1.7 | Adicionar item checklist | Digitar novo item + pressionar Enter | Item adicionado a lista |
| 16.1.8 | Remover item checklist | Clicar X ao lado de um item | Item removido da lista |

### 16.2 Criar Atividade

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 16.2.1 | Atividade semanal | Esporte > "Futsal" > Toda semana > Seg,Qua > 16:00 > Salvar | Atividade criada, redireciona para /calendario |
| 16.2.2 | Atividade para todos | Selecionar "Todos" nos filhos > Salvar | child_id NULL, atividade vale para todos |
| 16.2.3 | Atividade unica | Selecionar "Nunca" na recorrencia > Salvar | Atividade sem recorrencia criada |
| 16.2.4 | Atividade personalizada | Personalizar > A cada 3 semanas > Salvar | Recorrencia custom salva corretamente |
| 16.2.5 | Sem nome | Tentar salvar sem nome | Validacao impede (campo required) |

### 16.3 Visualizacao no Calendario

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 16.3.1 | Dots no calendario | Criar atividade semanal > ver calendario | Dots laranjas nos dias com atividade |
| 16.3.2 | Day detail | Clicar num dia com atividade | Sheet mostra guarda + atividades do dia |
| 16.3.3 | Evento no calendario | Criar evento social > ver calendario | Dot no dia do evento, visivel no day detail |
| 16.3.4 | Dashboard atividades | Criar atividade para amanha > ver dashboard | Card de atividade aparece com badge "AMANHA" |
| 16.3.5 | Dashboard eventos | Criar evento para amanha > ver dashboard | Evento aparece na secao de atividades |

### 16.4 Checklist Interativo

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 16.4.1 | Marcar item | Clicar num item do checklist | Item marcado, progresso atualiza |
| 16.4.2 | Desmarcar item | Clicar num item ja marcado | Item desmarcado |
| 16.4.3 | Todos concluidos | Marcar todos os itens | Mensagem "Tudo preparado!" |

### 16.5 Redirects

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 16.5.1 | /eventos redirect | Acessar /eventos | Redireciona para /calendario |
| 16.5.2 | /atividades redirect | Acessar /atividades | Redireciona para /calendario |
| 16.5.3 | /atividades/nova redirect | Acessar /atividades/nova | Redireciona para /calendario/novo |

---

## MODULO 17 — RESPONSIVIDADE E UX

| # | Cenario | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| 16.1 | Mobile (375px) | Abrir app em iPhone SE / Android pequeno | Layout adaptado, sem overflow horizontal |
| 16.2 | Mobile (414px) | Abrir em iPhone Pro / Android medio | Layout confortavel |
| 16.3 | Tablet (768px) | Abrir em iPad | Layout aproveitando espaco |
| 16.4 | Desktop (1280px) | Abrir no navegador | Layout centralizado com max-width |
| 16.5 | Botoes de toque | Verificar tamanho dos botoes no mobile | Min 44px de area de toque |
| 16.6 | Scroll | Paginas longas (criancas, despesas, chat) | Scroll suave, bottom nav fixo |
| 16.7 | Loading states | Submeter formularios | Botao mostra "Carregando..." durante submit |
| 16.8 | Mensagens de erro | Provocar erros em cada formulario | Erros exibidos em vermelho com contexto |

---

## CHECKLIST FINAL PRE-PRODUCAO

| # | Item | Status |
|---|------|--------|
| F1 | Todas as rotas acessiveis (nenhum 404) | [ ] |
| F2 | Todos os formularios submetem e salvam | [ ] |
| F3 | Validacoes impedem dados invalidos | [ ] |
| F4 | Permissoes de grupo verificadas em todas as acoes | [ ] |
| F5 | Chat funciona em tempo real entre 2 usuarios | [ ] |
| F6 | Moderador de tom bloqueia mensagens agressivas | [ ] |
| F7 | Calendario mostra escala corretamente | [ ] |
| F8 | Trocas de dia funcionam (solicitar, aprovar, rejeitar) | [ ] |
| F9 | Saldo de trocas calculado corretamente | [ ] |
| F10 | Despesas: criar, aprovar, rejeitar, calcular saldo | [ ] |
| F11 | Feriados nacionais exibidos corretamente | [ ] |
| F12 | Convites: enviar, aceitar, cancelar, expirar | [ ] |
| F13 | PWA instalavel no iPhone e Android | [ ] |
| F14 | Export iCal funcional | [ ] |
| F15 | Nenhum "Invalid Date" ou dado quebrado | [ ] |
| F16 | Layout responsivo em mobile, tablet e desktop | [ ] |
| F17 | Sessao expira e redireciona corretamente | [ ] |
| F18 | Logout funciona | [ ] |

---

**Total de cenarios de teste: 163**
**Modulos cobertos: 16**
**Perfis de teste: 5**
