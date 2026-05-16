# Mapa de IA do Kindar — Quem faz o quê, quanto custa, como controlar

> **Propósito:** consolidar em um único lugar todas as IAs que o Kindar consome (produto + dev), os custos associados, a função de cada uma e o que justifica a sua presença no stack. Atualizar sempre que entrar/sair provedor, mudar plano ou alterar feature.
>
> **Última revisão:** 2026-05-16
> **Próxima revisão obrigatória:** mensal (1º dia útil)
> **Dono:** Henrique

---

## 1. Visão de 30 segundos

O Kindar usa IA em **três camadas**:

| Camada | Onde | Custo cresce com... |
|---|---|---|
| **Produto** (runtime) | Assistente in-app, WhatsApp bot, OCR de carteirinha de vacina, fix-pipeline de erros | Volume de mensagens/imagens/erros de usuários |
| **Desenvolvimento** | Claude Code (esta sessão), eventuais assinaturas pessoais (ChatGPT, Cursor, etc.) | Horas de engenharia / quantidade de features |
| **Observabilidade & avaliação** | PostHog LLMA evaluation (judge models), Sentry | Volume de eventos / sessões |

A regra geral de roteamento em produção é: **OpenAI primeiro, com fallback Groq → Together → Gemini**. Anthropic só é chamado pelo `fix-pipeline` (correção automática de erros).

---

## 2. IAs em PRODUÇÃO (custo por uso, escala com tráfego)

> Fonte de verdade do roteamento: [src/lib/ai/router.ts](../../src/lib/ai/router.ts). Ordem dos providers ali é a ordem de tentativa real.

### 2.1 OpenAI (primário)

- **SDK:** `openai` v6.34.0 (package.json)
- **Env vars:** `OPENAI_API_KEY`
- **Models usados:** *(preencher exatamente quais — provavelmente `gpt-4o`, `gpt-4o-mini`, etc. — checar [providers/openai.ts](../../src/lib/ai/providers/openai.ts))*
- **Função no Kindar:**
  - Vision: parse de carteirinha de vacina (`/api/ai/parse-vaccines`), parse de prescrições (`pilot-parser.ts`), OCR e classificação de mídias do WhatsApp.
  - Text: respostas do assistente in-app e do bot WhatsApp.
  - Tools (function calling): execução de ações via assistente — `create_swap_request`, `create_expense`, `record_vaccination`, `get_vaccine_status`, `create_decision`, etc.
- **Por que é o primário:** melhor qualidade de tool-calling e vision, latência aceitável.
- **Custo mensal estimado:** R$ `<preencher>` *(consultar billing.openai.com)*
- **Limite/alerta configurado:** `<preencher — limite hard na conta + alert via email>`

### 2.2 Groq (fallback 1 + Whisper dedicado)

- **SDK:** `groq-sdk`
- **Env vars:** `GROQ_API_KEY`
- **Função no Kindar:**
  - Text + tools (function calling) como fallback quando OpenAI falha.
  - **Transcrição de áudio do WhatsApp via Whisper** ([whatsapp/audio.ts](../../src/lib/whatsapp/audio.ts)) — esse caminho não passa pelo router, é chamada direta.
- **Por que está no stack:** tier free generoso + Whisper barato e rápido; bom fallback de latência.
- **Custo mensal estimado:** R$ `<preencher>` *(provavelmente em tier free hoje)*
- **Risco:** se passar do free tier silenciosamente, áudios do WhatsApp param de transcrever sem erro visível no app.

### 2.3 Together AI (fallback 2)

- **Env vars:** `TOGETHER_API_KEY`
- **Função no Kindar:** text + tools (function calling) — só usado quando OpenAI **e** Groq falham.
- **Por que está no stack:** terceiro fallback com tool-calling. Existência principalmente defensiva.
- **Custo mensal estimado:** R$ `<preencher>` *(provavelmente ~0 — só dispara em incidente)*
- **Revisão proposta:** se custo zero por 3 meses E ambos os fallbacks acima nunca falharam juntos, considerar remover para simplificar o stack.

### 2.4 Google Gemini (fallback 3 / vision extra)

- **Env vars:** `GEMINI_API_KEY` (ou `GOOGLE_API_KEY` — confirmar em [providers/gemini.ts](../../src/lib/ai/providers/gemini.ts))
- **Função no Kindar:** text + vision como último fallback. **Não** suporta tools no router atual.
- **Por que está no stack:** vision barato + cobertura extra quando todos os outros falham.
- **Custo mensal estimado:** R$ `<preencher>`

### 2.5 Anthropic Claude (fix-pipeline)

- **Env vars:** `ANTHROPIC_API_KEY`
- **Função no Kindar:** **NÃO está no router de produto.** É chamado **só** pelo [fix-pipeline/claude-fixer.ts](../../src/lib/fix-pipeline/claude-fixer.ts) — sistema que gera correções automáticas de código a partir de erros capturados em produção (Sentry → GitHub PR).
- **Por que separado:** fix-pipeline é ferramenta interna de engenharia rodando como serverless function — não atende request de usuário, então não compete com o roteamento de produto.
- **Custo mensal estimado:** R$ `<preencher>` *(função da quantidade de erros únicos)*

---

## 3. IAs em DESENVOLVIMENTO (assinaturas, custo fixo mensal)

| Ferramenta | Função | Plano atual | Custo/mês | Substituível por |
|---|---|---|---|---|
| **Claude Code** | Esta sessão. Codificação, migrations, debugging, EAS, lojas | `<preencher: Pro / Max / Team>` | R$ `<preencher>` | Cursor (parcial), ChatGPT (parcial) |
| **ChatGPT Plus / Pro** | `<preencher se usa>` brainstorm, copy, análises | `<preencher>` | R$ `<preencher>` | Claude.ai |
| **Cursor / Copilot** | `<preencher se usa>` autocomplete no editor | `<preencher>` | R$ `<preencher>` | Claude Code inline |
| **Gemini / outros** | `<preencher se usa>` | | | |

> **Princípio de controle:** uma ferramenta por função. Se duas ferramentas estão fazendo a mesma coisa há mais de 30 dias, escolher uma e cancelar a outra. Renovação automática é amiga da entropia.

---

## 4. Matriz Feature × Provedor (quem dispara o quê)

| Feature do Kindar | Tipo de chamada | Provedor primário | Fallbacks | Código fonte |
|---|---|---|---|---|
| Assistente in-app (`/api/ai/assistant`) | Tools + Text | OpenAI | Groq, Together | [route.ts](../../src/app/api/ai/assistant/route.ts) |
| WhatsApp bot — texto | Tools + Text | OpenAI | Groq, Together | [processor.ts](../../src/lib/whatsapp/processor.ts) |
| WhatsApp bot — imagens (OCR/classificação) | Vision | OpenAI | Groq, Together, Gemini | [media.ts](../../src/lib/whatsapp/media.ts) |
| WhatsApp bot — áudio (Whisper) | Audio→Text | **Groq direto** (não passa pelo router) | — | [audio.ts](../../src/lib/whatsapp/audio.ts) |
| Parse carteirinha de vacina (`/api/ai/parse-vaccines`) | Vision | OpenAI | demais via router | [route.ts](../../src/app/api/ai/parse-vaccines/route.ts) |
| Pilot parser (prescrições/documentos) | Vision | OpenAI | demais via router | [pilot-parser.ts](../../src/lib/ai/parser/pilot-parser.ts) |
| Fix-pipeline (auto-correção de erros de prod) | Text (long-context) | **Anthropic Claude** (não passa pelo router) | — | [claude-fixer.ts](../../src/lib/fix-pipeline/claude-fixer.ts) |

**Observação importante:** três caminhos NÃO passam pelo router (`Groq Whisper`, `Anthropic claude-fixer`). Qualquer mudança de provedor nesses fluxos precisa ser feita pontualmente — não é controlado pelo `PROVIDERS` array do router.

---

## 5. Custo total mensal — tabela de controle

> **Atualizar todo dia 1.** Custo em R$ convertido pela cotação do dia da fatura. Anexar link do invoice quando aplicável.

| Mês | OpenAI | Groq | Together | Gemini | Anthropic (fix-pipeline) | Claude Code | Outras assinaturas | **TOTAL** | Observação |
|---|---|---|---|---|---|---|---|---|---|
| 2026-05 | `<>` | `<>` | `<>` | `<>` | `<>` | `<>` | `<>` | `<>` | Baseline pós-lançamento iOS |
| 2026-04 | | | | | | | | | |
| 2026-03 | | | | | | | | | |

**Métricas derivadas para acompanhar:**

- Custo de IA por usuário ativo (MAU) — total ÷ MAU do mês.
- Custo de IA por mensagem WhatsApp processada.
- % de requests que caíram no fallback (sinaliza degradação do primário). Disponível via PostHog event `ai_router_attempt`.

---

## 6. Telemetria e observabilidade

Eventos PostHog que medem uso de IA *(verificar se estão todos instrumentados — alguns são proposta):*

- `ai_request_started` — props: `feature`, `type` (text/vision/tools), `provider_attempted`.
- `ai_request_succeeded` — props: `provider_winner`, `tokens_in`, `tokens_out`, `latency_ms`, `cost_usd_estimate`.
- `ai_request_failed` — props: `feature`, `attempts` (lista de provider+error).
- `whatsapp_audio_transcribed` — props: `duration_ms`, `chars_out`.
- `fix_pipeline_attempt` — props: `error_signature`, `result` (pr_opened / failed / no_op).

**Se algum desses não existir hoje, instrumentar é prioridade média** — sem isso o controle de custo vira "leitura mensal de invoice" e perde a chance de ver tendências semanais.

---

## 7. Decisões arquiteturais já tomadas (não-renegociáveis sem motivo forte)

1. **Router com fallback em cascata** — qualquer feature de produto chama o router, nunca o SDK direto. Exceções documentadas explicitamente acima (Whisper Groq, claude-fixer).
2. **Tool-calling só em providers que suportam de verdade** — OpenAI, Groq, Together. Gemini fica fora dessa rota.
3. **Anthropic NÃO entra no router de produto** — é caro pra ser fallback de chat. Fica reservado pra fix-pipeline onde qualidade > custo.
4. **Whisper via Groq** — substituir só se Groq parar de oferecer no free tier ou se qualidade pt-BR for insuficiente. Whisper OpenAI é o substituto natural.
5. **Sem assistente médico** — regra do Kindar (vide CLAUDE.md). IA não dá diagnóstico, contraindicação ou juízo clínico. OCR de carteirinha é estritamente extração de dados.

---

## 8. Riscos e dívidas a fechar

- [ ] **Instrumentar `ai_request_*` no PostHog** se ainda não estiver completo. Sem isso, custo só é visível na fatura.
- [ ] **Configurar hard limit em todas as contas** (OpenAI, Anthropic, Together, Gemini) com alerta em 50% e bloqueio em 100%.
- [ ] **Decidir destino do Together** — manter como fallback 2 ou remover por não-uso (ver §2.3).
- [ ] **Documentar quais modelos exatos** estão configurados em cada provider (preencher §2.x).
- [ ] **Confirmar billing PostHog LLMA** — se evaluation rodar com judge models, gera custo adicional.
- [ ] **Plano de contingência se OpenAI cair** — testar manualmente uma vez por trimestre que Groq + Together + Gemini cobrem todos os fluxos de produto.

---

## 9. Como manter este documento vivo

- **Quando adicionar IA nova:** atualizar §2 (produção) ou §3 (dev) **antes** de fazer merge da PR que adiciona o SDK.
- **Quando trocar modelo dentro do mesmo provider:** atualizar §2.x linha "Models usados".
- **Quando mudar o `PROVIDERS` array do router:** atualizar §4 matriz.
- **Mensalmente (dia 1):** preencher linha nova em §5 com custos do mês anterior.
- **Trimestralmente:** rever §7 e §8 — algo virou irrelevante? Algo virou bloqueante?

---

## 10. Apêndice — comandos úteis

```bash
# Listar todos os providers configurados
grep -r "API_KEY" .env.example .env.local 2>/dev/null | grep -iE "openai|anthropic|groq|together|gemini"

# Ver uso por feature no PostHog (HogQL)
SELECT feature, count() FROM events
WHERE event = 'ai_request_succeeded' AND timestamp > now() - INTERVAL 30 DAY
GROUP BY feature ORDER BY count() DESC

# Conferir env vars em produção (Vercel)
vercel env ls
```
