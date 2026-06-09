# Plano — Dashboard v2.0: O Briefing Familiar
## Kindar como concierge que reduz carga mental

> **Status:** visão fechada em debate de produto (jun/2026). Próximo passo: **mockup → validação visual → build faseado**.
> **Premissa central:** este plano **NÃO adiciona funcionalidade nova de domínio**. Ele reorganiza o que já existe em torno de uma única pergunta:
> **"O que eu preciso fazer pelos meus filhos hoje?"**

---

## 1. A tese

O Kindar não vende organização — vende **"eu sei exatamente o que preciso fazer pelos meus filhos hoje"**. É uma diferença de categoria:

| | Mostra | Sensação |
|---|---|---|
| App de gestão familiar | **o que existe no sistema** | "está tudo registrado" |
| Assistente familiar (o alvo) | **o que importa hoje** | "estou no controle" |

O dashboard atual é um sistema administrativo bem organizado (funcional ~9/10), mas a **UX de retenção diária é ~6,5/10** — não cria o hábito "abro o Kindar toda manhã pra saber meu dia". A v2.0 fecha essa lacuna virando a tela um **Briefing Familiar**.

**Norte:** *"Apple Health da vida familiar"* — transformar dezenas de microinformações (rotina, escola, saúde, financeiro, atividades) numa sensação diária de **clareza e tranquilidade**. O diferencial não está nas funcionalidades isoladas; está na capacidade de **reduzir a carga mental** dos pais todo dia.

---

## 2. Os 5 princípios (inegociáveis)

1. **O briefing é o produto.** Não é uma tela — é o motor, renderizado em todo lugar (tela, push, widget, watch, e-mail).
2. **Responde só uma pergunta:** *"O que merece minha atenção agora?"*
3. **Gera calma.** Nunca culpa, nunca ansiedade, **nunca arma**. Proibido vermelho no dashboard principal.
4. **Distribui responsabilidade.** Mostra o que está **sem dono** + "eu cuido" num toque — não só executa tarefas.
5. **Uma verdade, dois pais.** Paz mental **compartilhada**: o mesmo briefing, levemente personalizado, da mesma fonte.

---

## 3. A virada de mentalidade

O maior problema da tela atual **não é visual, é estratégico**: ela mostra *o que existe no sistema*. Deveria mostrar *o que importa hoje*. Essa única mudança muda tudo — e faz cada seção (Calendário, Escola, Saúde, Financeiro, Checklists) deixar de ser **destino** e virar **fonte de contexto**. O usuário não navega pra descobrir; **o Kindar conta**.

---

## 4. Arquitetura — o motor de briefing é o CORE

```
   FONTES DE CONTEXTO              MOTOR (1 lugar)           RENDERS (superfícies finas)
 ┌───────────────────────┐                                ┌──────────────────────┐
 │ care_routine (leva/busca)│                              │ Dashboard hero  (P1) │
 │ custody (guarda)         │     compositor               │ Push noturno (existe)│
 │ calendar_occurrences     │  →  + curador (régua)   →     │ Widget iOS/Android   │
 │ activity_checklist_items │     + time-awareness          │ Apple Watch (futuro) │
 │ school / health / $$$    │                              │ E-mail diário (opt)  │
 └───────────────────────┘                                └──────────────────────┘
```

- **Já começou:** `src/lib/services/care-routine-briefing-core.ts` (o push noturno) é a semente do motor.
- **Princípio:** **constrói o cérebro uma vez.** O dashboard, o widget, o e-mail — todos chamam o mesmo motor. É o que faz a aposta multi-superfície ser barata e consistente (em vez de 5 implementações que divergem).

---

## 5. O cérebro — curadoria e priorização (a "IA" de verdade)

A inteligência não está no texto bonito; está na **curadoria**. Regra de ouro:

> **1 destaque + no máximo 2–3 de apoio. Nunca mais que isso.**

### Régua de prioridade do destaque (decrescente)
1. **Furo de cobertura** — "ninguém marcado pra buscar o João hoje". (já detectado: `hasCoverageGap` no briefing-core)
2. **O que muda o de-sempre** — troca de guarda hoje, imprevisto.
3. **Atividade com preparo sem dono** — "kimono do Martim sem responsável".
4. **Ação pendente sua** — aprovar despesa, confirmar reunião, relato pendente.
5. **Nada disso → "Dia tranquilo."** ← isso é **feature, não vazio**.

### Responsabilidade > tarefa (princípio #4 — o que vira categoria)
Carga mental não é *fazer*; é **lembrar + notar + atribuir** — o "quem vai resolver isso?" que mora na cabeça de uma pessoa só (em geral, a mãe). O motor mostra o **não-atribuído**, não a tarefa:

- ❌ "Comprar kimono" → ✅ **"O kimono do Martim ainda não tem responsável."**
- Loop fechado: **"Eu cuido"** num toque → a carga **transfere sem briga**. A mãe que carregava em silêncio vê "o Kindar tá cuidando" e **solta**.

### O "Dia Tranquilo" é feature de primeira linha
Pais vivem em alerta. Abrir o app e ler *"Tudo sob controle hoje. Fernanda leva, você busca 18h30. Nenhuma pendência."* gera a emoção mais rara: **alívio**. A maioria dos apps mostra tela vazia; o Kindar mostra **paz**.

---

## 6. A estrutura da tela (universal)

Mesma moldura pra **todos** — só o conteúdo do herói muda. O cérebro aprende: *"o que importa sempre está aqui"*.

```
Bom dia, Henrique
┌──────────────────────────┐
│  VOZ + HERÓI             │   ← a voz é o TOPO do herói, não um bloco separado
├──────────────────────────┤
│  SUA ATENÇÃO             │   ← calmo, sem-dono, "eu cuido"
├──────────────────────────┤
│  FILHOS (mini-hubs)      │
├──────────────────────────┤
│  SAÚDE (condensada)      │
└──────────────────────────┘
```

**Herói adapta (mesma estrutura):**
- **Separados:** "As crianças estão com Fernanda · troca segunda 18h" (+ rotina se houver).
- **Juntos/solo:** "Fernanda leva · você busca 18h30."

> A decisão "briefing pra TODOS, herói adapta" já está parcialmente em prod (`coparenting_groups.arrangement` + adaptação do dashboard). A v2.0 troca o herói chapado por um herói premium e adiciona a moldura.

---

## 7. Os blocos, detalhados

### Voz + Herói
- **Voz** (1 linha, concierge): *"Bom dia, Henrique. Dia tranquilo hoje. Fernanda leva e você busca no Jiu-Jitsu às 18h30."* Calor humano sem coach.
- **Herói visual forte** — tratamento premium (não o card branco chapado de hoje): fundo quente, avatares coloridos, hierarquia.
- **Jornada inline** — o dia num olhar: casa → leva 8h → escola → Jiu-Jitsu 18h30 → busca → casa. (reusa `buildChildJourney`). **Dissolve a seção "Atividades" dentro do herói.**
- Ações inline: Levou?/Buscou? (honesto — só "✓" se confirmado) · Trocar hoje.

### Sua Atenção (o motor de retenção)
- Tom **convite**, calmo: "Algumas coisas pra hoje 🎒". **Nunca** "⚠️ 3 pendências".
- Itens = **buracos / sem-dono / pendências**, não tarefas: "kimono do Martim sem responsável", "reunião amanhã — confirmar", "despesa aguardando você".
- **"Eu cuido"** por item → atribui responsável + some.
- **Conflito-safe:** sempre sobre a TAREFA ("precisa de alguém"), nunca a PESSOA ("você não fez").
- Vazio → não renderiza (o "dia tranquilo" já vive no herói).

### Filhos — mini-hubs
- ❌ "Otto · 6 anos · nasceu 2020" (enchimento).
- ✅ "Otto · Jiu-Jitsu hoje 18:30" · "Martim · reunião amanhã 16:30" · "🟢 tudo tranquilo".
- Cada criança = **o próximo relevante dela**.

### Saúde — condensada
- ❌ 2 cards grandes ("Saudável · sem registros recentes" ×2).
- ✅ "❤️ Saúde · Otto 🟢 · Martim 🟢 · último registro há 15 dias". **Metade do espaço.**

---

## 8. Time-awareness — o que vira concierge

Dashboard estático = tracker. Dashboard que muda com o horário = concierge. **3 estados + relativo ao evento:**

| Momento | Briefing |
|---|---|
| **Manhã** | "Fernanda leva. Próximo: escola 08:00." |
| **Tarde** | "Jiu-Jitsu 18:30. Kimono ainda não marcado." |
| **Noite** | "Tudo concluído hoje ✓. Amanhã: reunião 16:30." |

Cria sensação de **vida** — faz abrir de manhã **e** de tarde (o número de retenção que importa).

---

## 9. A voz (engenharia + tom)

- **Template inteligente, NÃO LLM ao vivo.** Composição (ICU + a régua de prioridade) = instantâneo, grátis, confiável, copy controlada. **A IA é a curadoria, não a geração de texto.**
- **Range:** dia tranquilo = voz tranquila; buraco = "uma coisa precisa de você"; **nunca alarme**.
- **Bíblia de tom:** nem robô (*"Hoje Fernanda leva"*), nem coach (*"Que dia lindo!"*). Meio: *"Dia tranquilo hoje. Fernanda leva e você busca 18h30."* **Informado E calmo** (Apple Health).
- i18n: 5 locales; voz/onboarding = revisão de tradução humana (Regra Canônica 10).

---

## 10. Guardrails (o que protege a marca)

1. **Calma acima de tudo.** Proibido vermelho no dashboard. Hierarquia por âmbar-suave/neutro, nunca alarme.
2. **Nunca arma.** Responsabilidade é convite, jamais acusação — **impossível tirar print como prova contra o coparente** (mesma razão da métrica neutra). É onde apps de "justiça coparental" morrem.
3. **Honesto.** "Concluído ✓" só se confirmado. Senão: fato ("você busca 18h30") ou incerteza ("buscou? ainda não marcado"). Concierge que erra com confiança perde a confiança pra sempre.
4. **Compartilhado.** Uma verdade, dois pais — mata o "eu não sabia".

---

## 11. Reuso vs. novo

**Já existe (reaproveitar):** `care-routine-briefing-core` (push), `buildChildJourney` (timeline), `activity_checklist_items` (mochila), métrica de corresponsabilidade, health status, resolvers de custody/care_routine, detecção de furo de cobertura.

**Novo (construir):** o **curador/priorizador** (a régua), o card **Sua Atenção**, **ownership / "eu cuido"** (atribuir responsável a um item), **time-awareness**, o **compositor de voz**, o **tratamento visual** de herói.

→ **Zero funcionalidade nova de domínio.** É composição + hierarquia + tom.

---

## 12. Faseamento

| Fase | Entrega | Observação |
|---|---|---|
| **P0** | **O motor** — compositor + curador (régua) + time-awareness, expandindo `care-routine-briefing-core`. Puro, testável. | Renderiza pra tela **e** push. É o cérebro. |
| **P1** | **Herói dinâmico + briefing universal** — moldura (Voz+Herói), adaptável (separado/junto), jornada inline, visual premium. | Mockup antes. |
| **P2** | **Card "Sua Atenção"** — calmo, ownership, "eu cuido", conflito-safe. | O motor de retenção. |
| **P3** | **Filhos viram mini-hubs** + **Saúde condensada.** | |
| **P4** | **Dashboard adaptativo por horário** (time-awareness na UI). | |
| **P5** | **Refatoração da sidebar** (Início · Rotina · Conversas · Filhos · Financeiro · Mais). | **Projeto separado** — afeta a navegação do app inteiro. |
| **Futuro** | **Multi-superfície:** widget iOS/Android (spec pronta, precisa EAS) · Apple Watch · e-mail diário opcional. | Renders do mesmo motor. |

Cada fase é **shippável + revisável**.

---

## 13. Não-regressão e riscos

- **Pai separado intocado.** O herói de guarda continua igual pra quem reveza; a moldura nova é aditiva. (a adaptação por `arrangement` já está em prod, validada)
- **Editor de rotina segue limpo** (sem switcher — lição aprendida no PR #119→#121).
- **Conflito coparental:** o guardrail #2 é crítico — testar que nenhum elemento vira acusação/print.
- **Performance:** o motor roda no caminho do dashboard → composição **pura**, sem N queries novas (reusa payload + resolvers existentes) + cache-first hydration. Caminho crítico é sagrado.
- **Marca:** revisão de tom (humano, calmo) em toda copy nova.

---

## 14. Métricas de sucesso

- **Retenção:** aberturas/dia (manhã + tarde) ↑ — o número que importa.
- **Hábito:** % de usuários que abrem em ≥5 manhãs/semana.
- **Redistribuição:** nº de "eu cuido" tocados (carga mental transferida).
- **Alívio (qualitativo):** feedback "sei meu dia em 10 segundos".

---

## 15. Próximo passo

**Mockup HTML navegável** da v2.0 — os 3 estados de horário, o dia-tranquilo, o "sem-dono → eu cuido", a hierarquia calma, e os **dois heróis** (separado e junto) na mesma estrutura. Validação visual da visão fechada → **só então** o build faseado (P0 → P1 → …).
