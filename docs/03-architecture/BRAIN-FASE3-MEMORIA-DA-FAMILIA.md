# Kindar Brain — Fase 3: Memória da Família

> **Direção** (dono, 02/jul): "histórico vira contexto". O Brain deixa de olhar
> só pra frente (conflitos de agenda) e passa a olhar **pra trás**: cada coisa
> nova que a família registra chega com o contexto do que já aconteceu.
> Recall **FACTUAL, nunca clínico** — datas, contagens, valores e fontes;
> jamais interpretação ("a alergia piorou" é PROIBIDO).

## Por que isso é a fase certa

O pipeline (00126) já persiste tudo com proveniência: intakes → artefatos →
audit. A Saúde cria retornos no calendário, Despesas registra categorias,
Convites/Escolar populam a agenda. Hoje esse histórico só é usado pra dedupe.
A Memória transforma o mesmo trilho em **contexto no momento certo** — a
prévia — sem tela nova, sem hábito novo.

## Princípios (herdam as Regras Canônicas)

1. **Factual, nunca clínico.** A memória enuncia fatos verificáveis no banco
   ("última consulta do Otto: 12/03, Dra. Ana"), nunca julga ("faz tempo
   demais"). Números, datas e fontes; zero adjetivos.
2. **Calmo (Regra 6).** Retro-impacto é SEMPRE `severity: "info"` — memória
   informa, não alarma. `attention` continua exclusivo de conflito de agenda.
3. **Proveniência.** Todo fato de memória é rastreável a um registro
   (`relatedRecordId`) — nada de "resumo de IA" sem fonte.
4. **Puro + injetável.** Detector novo (`retro-impact.ts`) é função pura
   (plan + snapshot → findings), espelhando `impact.ts`. O serviço injeta o
   snapshot; teste unitário não toca banco.
5. **Dormente por construção.** Flag própria `FEATURE_BRAIN_FAMILY_MEMORY`
   (OFF). Flag OFF = snapshot nem é buscado = zero custo e zero mudança.
6. **Privacidade.** Memória é do GRUPO (mesma RLS de sempre); nada cruza
   grupos; nada sai em log (sanitize já existente).

## Arquitetura da fatia M1 (preview com memória)

```
createAndAnalyze*(…)
  └─ finalizeAnalysis / analyzeIntakeImage
       ├─ analyzeImpact(plan, existing)            ← já existe (frente)
       ├─ [flag ON] loadFamilyMemory(sb, ctx, plan) ← NOVO (I/O, escopado)
       ├─ [flag ON] analyzeRetroImpact(plan, mem)   ← NOVO (puro, trás)
       └─ impacts = [...frente, ...trás]            ← mesmo contrato
```

- `ImpactFinding` não muda de shape — só ganha kinds novos. O WhatsApp já
  renderiza QUALQUER finding via `t(titleKey, vars)` (brain-flow) → zero
  mudança de canal lá. Widget/native recebem o content montado no servidor →
  as rotas passam a anexar as linhas de impacto ao preview (helper único).

### Kinds novos (M1)

| kind                    | playbook   | fato enunciado                                             |
|-------------------------|------------|------------------------------------------------------------|
| `last_visit_context`    | saúde      | "Última consulta de {child}: {date} ({provider})."          |
| `followup_candidate`    | saúde      | "Há um retorno de {child} marcado pra {date} — este pode ser ele." |
| `expense_month_context` | despesas   | "{count}ª despesa de {category} no mês (R$ {total})."        |
| `busy_week_context`     | convite    | "{child} já tem {count} compromisso(s) nessa semana."        |

### Snapshot (`FamilyMemorySnapshot`) — consultas mínimas, por docType

- saúde: última `health_records` visita da criança (data, profissional) +
  eventos futuros de retorno da criança (janela ±14d da consulta nova).
- despesas: despesas do MESMO mês/categoria do plano (count + soma).
- convite: eventos da criança na semana ISO do evento novo (count).
- escolar/guarda: fora do M1 (escolar não mexe no live; guarda já tem N4).

## Fatias

- **M1 — Memória no preview** (esta entrega): loader + detector puro + 4
  kinds + i18n + linhas no content das rotas + flag. Sem migration.
- **M2 — Fechar o laço do retorno**: confirmar consulta com
  `followup_candidate` aceito marca o retorno como cumprido (materialização +
  proveniência + undo; migration própria, dormente).
- **M3 — Recall com proveniência no assistente**: tool `family_memory_lookup`
  read-only ("quando foi a última consulta?" → fato + fonte + data).
- **M4 — Contexto no digest/WhatsApp proativo.**

## O que NÃO é (anti-escopo)

- Não é prontuário nem análise de tendência clínica.
- Não é busca semântica/embedding (M1-M3 são SQL determinístico).
- Não altera prioridade/entrega de notificações (Priority intacto).

## Validações do dono (registradas)

- M1 live: mandar consulta nova de criança de teste → prévia com "última
  consulta"; despesa repetida no mês → contexto de categoria; convite em
  semana cheia → contagem da semana.
- Conferir tom: nenhuma linha de memória pode soar alarme/julgamento.
