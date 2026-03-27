# Conformidade LGPD — Kindar

> Lei Geral de Protecao de Dados (Lei 13.709/2018).
> Requisitos tecnicos, juridicos e operacionais para o Kindar.

---

## 1. Classificacao de Dados

### 1.1 Dados Pessoais (Art. 5, I)

| Dado | Tabela | Classificacao | Base Legal |
|---|---|---|---|
| Nome completo | profiles.full_name | Pessoal | Execucao contratual |
| E-mail | profiles.email | Pessoal | Execucao contratual |
| Telefone | profiles.phone | Pessoal | Consentimento |
| CPF | children.cpf | Pessoal | Obrigacao legal |
| RG | children.rg | Pessoal | Obrigacao legal |
| Foto (avatar) | profiles.avatar_url | Pessoal | Consentimento |
| Foto da crianca | children.photo_url | Pessoal Sensivel (crianca) | Consentimento (ambos pais) |

### 1.2 Dados Pessoais Sensiveis (Art. 5, II)

| Dado | Tabela | Classificacao | Base Legal |
|---|---|---|---|
| Tipo sanguineo | child_medical_info.blood_type | Sensivel (saude) | Consentimento explicito |
| Alergias | child_allergies.* | Sensivel (saude) | Consentimento explicito |
| Medicamentos | active_medications.* | Sensivel (saude) | Consentimento explicito |
| Doencas | illness_episodes.* | Sensivel (saude) | Consentimento explicito |
| Vacinas | vaccination_records.* | Sensivel (saude) | Consentimento explicito |
| Crescimento (peso/altura) | growth_records.* | Sensivel (saude) | Consentimento explicito |
| Consultas medicas | medical_appointments.* | Sensivel (saude) | Consentimento explicito |
| Numero SUS | child_medical_info.sus_number | Sensivel (saude) | Consentimento explicito |
| Plano de saude | child_medical_info.insurance_* | Sensivel (saude) | Consentimento explicito |
| Violencia domestica | sensitive_notes (topic=gender_violence) | Sensivel (violencia) | Protecao da vida |
| Abuso sexual | sensitive_notes (topic=sexual_violence) | Sensivel (violencia) | Protecao da vida |
| Saude mental | sensitive_notes (topic=mental_health) | Sensivel (saude) | Consentimento explicito |

### 1.3 Dados de Criancas e Adolescentes (Art. 14)

> "O tratamento de dados pessoais de criancas e adolescentes devera ser realizado
> em seu melhor interesse, com consentimento especifico e em destaque dado por
> pelo menos um dos pais ou pelo responsavel legal."

| Requisito | Implementacao no Kindar |
|---|---|
| Consentimento de pelo menos 1 responsavel | Registro de `lgpd_consent_at` no signup |
| Melhor interesse da crianca | Uso exclusivo para gestao da coparentalidade |
| Informacoes sobre tratamento | Politica de privacidade acessivel |
| Nao condicionar participacao | Dados opcionais (CPF, RG, fotos) |
| Verificacao de autoridade parental | Vinculacao via grupo + convite |

**Recomendacao:** Ambos os pais devem consentir com o tratamento de dados de saude da crianca. Implementar fluxo onde o segundo pai confirma consentimento ao aceitar o convite.

---

## 2. Bases Legais para Tratamento (Art. 7)

| Base Legal | Dados Cobertos | Justificativa |
|---|---|---|
| **Execucao contratual** (Art. 7, V) | Nome, email, dados de guarda, despesas, chat | Necessarios para prestar o servico |
| **Consentimento** (Art. 7, I) | Foto, telefone, dados opcionais | Fornecidos voluntariamente pelo usuario |
| **Consentimento explicito** (Art. 11, I) | Dados de saude, dados sensiveis | Dados sensiveis requerem consentimento destacado |
| **Obrigacao legal** (Art. 7, II) | CPF, RG (quando exigido por lei) | Identificacao civil |
| **Protecao da vida** (Art. 7, VII) | Notas sensiveis sobre violencia | Protecao da crianca em situacao de risco |
| **Exercicio de direitos em processo** (Art. 7, VI) | Chat imutavel, historico de decisoes | Evidencia para processos judiciais |
| **Interesse legitimo** (Art. 7, IX) | Analytics anonimizados (PostHog) | Melhoria do servico |

---

## 3. Direitos do Titular (Art. 18)

### 3.1 Direito de Acesso (Art. 18, II)

| Implementacao | Status |
|---|---|
| Endpoint `/api/lgpd/export` que gera ZIP com todos os dados do usuario | A implementar |
| Dados incluidos: perfil, mensagens, despesas, saude, decisoes, documentos | — |
| Formato: JSON + CSV | — |
| Prazo: 15 dias uteis | Conforme lei |

### 3.2 Direito de Correcao (Art. 18, III)

| Implementacao | Status |
|---|---|
| `updateProfile` (nome) | Implementado |
| `updateChild` (dados do filho) | Implementado |
| `upsertMedicalInfo` (info medica) | Implementado |
| `upsertChildEducation` (info escolar) | Implementado |

### 3.3 Direito de Exclusao (Art. 18, VI)

**Complexidade tecnica:** FK constraints e imutabilidade do chat.

| Tipo de Dado | Pode Excluir? | Mecanismo |
|---|---|---|
| Perfil do usuario | Sim (anonimizar) | Substituir nome/email por "Usuario Removido" |
| Mensagens de chat | Nao (imutavel por lei) | Anonimizar sender_id |
| Despesas criadas | Nao (registro financeiro) | Anonimizar paid_by |
| Saude da crianca | Depende | Se ambos pais concordam, sim |
| Documentos | Sim | Deletar arquivo do Storage + registro |
| Notas privadas | Sim | DELETE fisico (somente do usuario) |
| Notificacoes | Sim | DELETE fisico |
| Push subscriptions | Sim | DELETE fisico |
| Dados de grupo | Nao (outros membros dependem) | Anonimizar participacao |

**Fluxo de exclusao de conta:**

```
1. Usuario solicita exclusao (in-app ou email)
2. Confirmar identidade (email + senha)
3. Verificar se e unico admin (se sim, deve promover outro)
4. Prazo de 30 dias de "cooling off" (pode cancelar)
5. Apos 30 dias:
   a. Anonimizar perfil (nome → "Usuario Removido", email → hash)
   b. Deletar avatar, push_subscriptions, notifications
   c. Anonimizar sender_id em chat_messages
   d. Anonimizar paid_by em expenses (manter valor)
   e. Deletar private_notes
   f. Remover de group_members
   g. Invalidar sessao (Supabase Auth)
   h. Deletar auth.users (cascade para profiles)
6. Enviar confirmacao por email
7. Registrar exclusao no log de auditoria
```

### 3.4 Direito de Portabilidade (Art. 18, V)

| Formato | Conteudo |
|---|---|
| JSON | Todos os dados estruturados |
| CSV | Despesas, check-ins, registros de saude |
| PDF | Relatorio formatado (chat, decisoes, saude) |
| iCal | Calendario de guarda |

**Endpoint:** `GET /api/lgpd/export?format=json|csv|pdf`
**Prazo:** 15 dias uteis

---

## 4. Politica de Retencao de Dados

| Tipo de Dado | Retencao | Justificativa |
|---|---|---|
| Perfil ativo | Enquanto conta ativa | Necessario para o servico |
| Perfil apos exclusao | Anonimizado, permanente | Integridade referencial |
| Mensagens de chat | Permanente (imutavel) | Valor legal/probatorio |
| Despesas e acertos | 5 anos apos criacao | Prazo prescricional fiscal |
| Dados de saude | Enquanto crianca < 18 anos + 5 anos | Historico medico |
| Documentos | 5 anos apos upload | Prazo prescricional |
| Convites expirados | 90 dias apos expiracao | Limpeza |
| Notificacoes lidas | 90 dias | Performance |
| Push subscriptions | Enquanto valida | Necessario para notificacoes |
| Logs de auditoria | 5 anos | Compliance |
| Analytics (PostHog) | 2 anos | Analise de produto |

### Limpeza Automatica (Cron Job)

```sql
-- Executar semanalmente
DELETE FROM notifications WHERE is_read = true AND created_at < NOW() - INTERVAL '90 days';
DELETE FROM invitations WHERE status IN ('expired', 'revoked') AND created_at < NOW() - INTERVAL '90 days';
-- Push subscriptions invalidas sao limpas quando falham
```

---

## 5. Medidas Tecnicas de Seguranca

### 5.1 Autenticacao e Autorizacao

| Medida | Implementacao |
|---|---|
| Autenticacao | Supabase Auth (JWT + refresh tokens) |
| MFA | Suporte a TOTP via Supabase (a habilitar) |
| OAuth | Google, Apple, Facebook (via Supabase) |
| RLS (Row Level Security) | Todas as 41 tabelas com RLS habilitado |
| Helper functions | `is_group_member()`, `is_group_admin()` |
| Session management | JWT com expiracao, refresh automatico |

### 5.2 Criptografia

| Camada | Tecnologia |
|---|---|
| Em transito | TLS 1.3 (Vercel + Supabase) |
| Em repouso | AES-256 (Supabase gerenciado) |
| Tokens de convite | `gen_random_bytes(32)` + hex encoding |
| Tokens de calendario | `gen_random_bytes(32)` + hex encoding |
| Senhas | bcrypt (Supabase Auth nativo) |

### 5.3 Protecao contra Ataques

| Ataque | Protecao |
|---|---|
| SQL Injection | Supabase client (queries parametrizadas) |
| XSS | React/Next.js (escape automatico) |
| CSRF | SameSite cookies + Server Actions |
| Brute force | Rate limiting Supabase Auth |
| Data exfiltration | RLS impede acesso cross-group |
| File upload malicioso | Validacao de MIME type + tamanho |

---

## 6. Designacao do DPO (Encarregado)

### Requisitos (Art. 41)

| Item | Definicao |
|---|---|
| Nome | [A designar — fundador inicialmente] |
| E-mail | dpo@kindar.com.br |
| Responsabilidades | Receber reclamacoes, orientar funcionarios, interagir com ANPD |
| Publicacao | Nome e contato devem estar na politica de privacidade |

### Atribuicoes

1. Atender solicitacoes de titulares (acesso, exclusao, portabilidade)
2. Responder a ANPD (Autoridade Nacional de Protecao de Dados)
3. Avaliar impacto de novas features em privacidade
4. Treinar equipe em protecao de dados
5. Manter registro de atividades de tratamento (ROPA)

---

## 7. Politica de Privacidade — Requisitos

A politica deve conter (Art. 9):

| Secao | Conteudo |
|---|---|
| Identidade do controlador | Kindar Tecnologia LTDA, CNPJ, endereco |
| Dados coletados | Lista completa (secao 1 deste documento) |
| Finalidade | Gestao de coparentalidade, saude, financeiro |
| Base legal | Por tipo de dado (secao 2) |
| Compartilhamento | Supabase (processador), Vercel (hospedagem), PostHog (analytics) |
| Transferencia internacional | Sim (Supabase AWS, Vercel, PostHog — servidores nos EUA) |
| Direitos do titular | Acesso, correcao, exclusao, portabilidade |
| Contato do DPO | dpo@kindar.com.br |
| Retencao | Por tipo de dado (secao 4) |
| Cookies | Minimos: session cookie, activeGroupId cookie |
| Menores de idade | Tratamento com consentimento parental |

---

## 8. Politica de Cookies

| Cookie | Tipo | Duracao | Finalidade | Obrigatorio? |
|---|---|---|---|---|
| `sb-*` (Supabase Auth) | Funcional | Sessao | Autenticacao | Sim |
| `activeGroupId` | Funcional | 1 ano | Lembrar grupo ativo | Sim |
| PostHog `ph_*` | Analitico | 1 ano | Analytics | Nao (opt-out) |

**Nota:** O Kindar usa cookies minimos. Nao usa cookies de publicidade.

**Implementacao:** Banner de cookies simples:
- "Usamos cookies essenciais para o app funcionar e analytics para melhorar o produto."
- Botao: "Aceitar" (todos) e "Somente essenciais" (sem PostHog)

---

## 9. Notificacao de Incidentes (Art. 48)

### Prazo: 72 horas para a ANPD

| Etapa | Acao | Prazo |
|---|---|---|
| 1. Deteccao | Identificar o incidente | T+0 |
| 2. Avaliacao | Determinar se ha risco aos titulares | T+4h |
| 3. Contencao | Bloquear acesso, revogar tokens | T+8h |
| 4. Notificacao ANPD | Formulario oficial com detalhes | T+72h |
| 5. Notificacao titulares | Email individual se risco alto | T+72h |
| 6. Remediacao | Corrigir vulnerabilidade | ASAP |
| 7. Post-mortem | Documento interno com aprendizados | T+7d |

### Conteudo da Notificacao (Art. 48, § 1)

1. Natureza dos dados pessoais afetados
2. Informacoes sobre os titulares envolvidos
3. Medidas tecnicas de seguranca utilizadas
4. Riscos relacionados ao incidente
5. Medidas adotadas para reverter ou mitigar
6. Motivos da demora (se apos 72h)

---

## 10. Registro de Atividades de Tratamento (ROPA)

| Atividade | Finalidade | Base Legal | Dados | Retencao | Compartilhamento |
|---|---|---|---|---|---|
| Cadastro de usuario | Criar conta | Execucao contratual | Nome, email, senha | Ate exclusao | Supabase |
| Gestao de grupo | Coparentalidade | Execucao contratual | Membros, filhos | Ate exclusao | Supabase |
| Calendario de guarda | Organizacao da guarda | Execucao contratual | Datas, responsaveis | 5 anos | Supabase |
| Chat entre pais | Comunicacao | Execucao contratual | Mensagens | Permanente | Supabase |
| Registro de saude | Acompanhamento medico | Consentimento explicito | Dados medicos | 18 anos + 5 | Supabase |
| Despesas | Gestao financeira | Execucao contratual | Valores, categorias | 5 anos | Supabase |
| Analytics | Melhoria do produto | Interesse legitimo | Eventos anonimizados | 2 anos | PostHog |
| Notificacoes push | Engajamento | Consentimento | Endpoint, keys | Ate revogacao | Web Push API |
