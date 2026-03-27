/**
 * Groq AI Load Test for Kindar App
 * Tests LLM layer performance with concurrent requests.
 * Run: node --env-file=.env.local tests/ai-load-test.mjs
 */
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---------------------------------------------------------------------------
// Test commands covering all action types
// ---------------------------------------------------------------------------
const TEST_COMMANDS = [
  // Appointments
  "Marca consulta do Martim amanhã às 14h",
  "bota consulta dia 20 pro Otto",
  "mano marca um médico pro Martim",
  // Expenses
  "Gastei 80 reais em material escolar",
  "gastei tipo 100 conto com remédio",
  "registra 50 reais uber",
  "despesa 200 dentista Otto",
  // Health logs
  "Eduarda está com febre 38.5",
  "Martim vomitou",
  "Otto pesou 22kg na consulta",
  // Events
  "Cria evento viagem casa da vovó dia 5 a 10 de abril",
  "evento aniversário sábado",
  "marcar churrasco dia 15 às 12h",
  // Check-ins
  "Check-in: Otto dormiu bem hoje",
  "Martim comeu pouco no almoço",
  "Eduarda ficou feliz na escola",
  // Decisions
  "Criar decisão sobre escola do Martim",
  "decidir sobre natação",
  // Notes
  "Anota que preciso comprar remédio",
  "cria nota lembrar vacina",
  // Activities
  "Futsal do Otto terça e quinta às 18h",
  "aula de natação do Martim segunda 16h",
  // Swap requests
  "Quero trocar o dia 30",
  "preciso trocar sábado que vem",
  // Agreements
  "Acordo: máximo 2h de tela por dia",
  "combinar horário de tela",
  // Informal / edge cases
  "e aí, marca um pediatra pro Otto semana que vem",
  "paguei 35 conto de lanche",
  "Otto tá com tosse desde ontem",
  "bota aula de inglês quarta 15h pro Martim",
];

// ---------------------------------------------------------------------------
// System prompt (mirrors src/app/api/ai/assistant/route.ts)
// ---------------------------------------------------------------------------
const MOCK_CONTEXT = `Data atual: terça-feira, 25 de março de 2026
Crianças: Martim (7 anos), Otto (5 anos), Eduarda (3 anos)
Membros do grupo: Henrique (você), Amanda`;

const ACTIONS_PROMPT = `- createEvent: Criar evento/compromisso no calendário (consulta, viagem, festa, reunião)
  Params: title(string*): Nome do evento, date(date*): Data no formato YYYY-MM-DD, time(time): Horário no formato HH:MM, endDate(date): Data fim para eventos multi-dia, location(string): Local do evento, description(string): Descrição, category(string): Categoria: sport, health, school, art, music, therapy, evento, viagem, guarda, other, allDay(boolean): Se é dia inteiro
- createExpense: Registrar despesa/gasto compartilhado
  Params: description(string*): Descrição da despesa, amount(number*): Valor em reais, category(string): Categoria: alimentacao, educacao, saude, vestuario, lazer, transporte, moradia, outros
- createAppointment: Marcar consulta médica para uma criança
  Params: childName(string*): Nome da criança, appointmentType(string): Tipo: routine, specialist, emergency, exam, vaccine, dental, therapy, other, date(date*): Data YYYY-MM-DD, time(time): Horário HH:MM, location(string): Local/clínica, notes(string): Observações
- createHealthLog: Registrar informação de saúde (febre, peso, sintoma, medicamento dado)
  Params: childName(string*): Nome da criança, logType(string*): Tipo: temperature, weight, height, symptom, medication, vaccine, allergy, sleep, feeding, mood, milestone, value(string*): Valor (ex: 38.5 para febre, 15kg para peso), notes(string): Observações
- createCheckin: Registrar check-in diário da criança (como dormiu, comeu, humor, tela)
  Params: childName(string*): Nome da criança, category(string*): Categoria: screen, food, sleep, mood, health, activity, school, text(string*): O que aconteceu
- createDecision: Criar decisão para votação entre os pais
  Params: title(string*): Título da decisão, description(string): Descrição/contexto, category(string): Categoria: education, health, financial, routine, travel, other
- createNote: Criar nota pessoal privada
  Params: title(string*): Título, content(string*): Conteúdo da nota, category(string): Categoria: reminder, observation, preparation, legal, other
- createActivity: Criar atividade recorrente (aula, esporte, terapia semanal)
  Params: name(string*): Nome da atividade, childName(string*): Nome da criança, category(string): Categoria: sport, health, school, art, music, therapy, course, other, recurrenceDays(string): Dias da semana: seg,ter,qua,qui,sex,sab,dom, timeStart(time): Horário início HH:MM, timeEnd(time): Horário fim HH:MM, location(string): Local
- requestSwap: Solicitar troca de dia de guarda
  Params: date(date*): Data que quer trocar YYYY-MM-DD, reason(string): Motivo
- createAgreement: Criar acordo/regra entre os pais
  Params: title(string*): Título do acordo, description(string*): Descrição, category(string): Categoria: principle, value, rule, boundary, routine`;

const SYSTEM_PROMPT = `Você é o assistente do Kindar, um app de coparentalidade. Sua função é interpretar comandos do usuário e retornar a ação correspondente em JSON.

CONTEXTO DO GRUPO:
${MOCK_CONTEXT}

AÇÕES DISPONÍVEIS:
${ACTIONS_PROMPT}

REGRAS:
1. SEMPRE retorne JSON válido com: { "action": "nomeAcao", "params": {...}, "confirmation": "mensagem de confirmação em pt" }
2. Se não entender o comando, retorne: { "action": "unknown", "params": {}, "confirmation": "Não entendi. Pode reformular?" }
3. Para datas relativas ("amanhã", "próxima terça"), calcule a data real baseado na data atual
4. Resolva nomes de crianças usando o contexto (ex: "do Martim" → childName: "Martim")
5. A confirmação deve ser clara e curta, no idioma pt
6. Valores monetários devem ser números (ex: "50 reais" → amount: 50)
7. NUNCA invente dados que o usuário não mencionou — deixe campos opcionais vazios`;

// ---------------------------------------------------------------------------
// Expected action mapping for accuracy check
// ---------------------------------------------------------------------------
const EXPECTED_ACTIONS = {
  "Marca consulta do Martim amanhã às 14h": "createAppointment",
  "bota consulta dia 20 pro Otto": "createAppointment",
  "mano marca um médico pro Martim": "createAppointment",
  "Gastei 80 reais em material escolar": "createExpense",
  "gastei tipo 100 conto com remédio": "createExpense",
  "registra 50 reais uber": "createExpense",
  "despesa 200 dentista Otto": "createExpense",
  "Eduarda está com febre 38.5": "createHealthLog",
  "Martim vomitou": "createHealthLog",
  "Otto pesou 22kg na consulta": "createHealthLog",
  "Cria evento viagem casa da vovó dia 5 a 10 de abril": "createEvent",
  "evento aniversário sábado": "createEvent",
  "marcar churrasco dia 15 às 12h": "createEvent",
  "Check-in: Otto dormiu bem hoje": "createCheckin",
  "Martim comeu pouco no almoço": "createCheckin",
  "Eduarda ficou feliz na escola": "createCheckin",
  "Criar decisão sobre escola do Martim": "createDecision",
  "decidir sobre natação": "createDecision",
  "Anota que preciso comprar remédio": "createNote",
  "cria nota lembrar vacina": "createNote",
  "Futsal do Otto terça e quinta às 18h": "createActivity",
  "aula de natação do Martim segunda 16h": "createActivity",
  "Quero trocar o dia 30": "requestSwap",
  "preciso trocar sábado que vem": "requestSwap",
  "Acordo: máximo 2h de tela por dia": "createAgreement",
  "combinar horário de tela": "createAgreement",
  "e aí, marca um pediatra pro Otto semana que vem": "createAppointment",
  "paguei 35 conto de lanche": "createExpense",
  "Otto tá com tosse desde ontem": "createHealthLog",
  "bota aula de inglês quarta 15h pro Martim": "createActivity",
};

// ---------------------------------------------------------------------------
// Single test runner with retry + exponential backoff
// ---------------------------------------------------------------------------
async function runSingleTest(command, index, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: command },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      });
      const elapsed = Date.now() - start;
      const raw = completion.choices[0]?.message?.content || "{}";
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { action: "parse_error" };
      }
      return {
        index,
        command,
        elapsed,
        action: parsed.action,
        confirmation: parsed.confirmation,
        success: true,
        tokens: completion.usage,
        attempt,
      };
    } catch (error) {
      const elapsed = Date.now() - start;
      // Rate limit → backoff and retry
      if (
        attempt < maxRetries &&
        (error.status === 429 || error.message?.includes("rate_limit"))
      ) {
        const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
        process.stdout.write(`[retry ${attempt + 1} in ${Math.round(delay)}ms]`);
        await sleep(delay);
        continue;
      }
      return {
        index,
        command,
        elapsed,
        success: false,
        error: error.message,
        attempt,
      };
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------
function percentile(sorted, p) {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ---------------------------------------------------------------------------
// Main load test
// ---------------------------------------------------------------------------
async function runLoadTest() {
  console.log("=== GROQ LOAD TEST — Kindar AI Assistant ===");
  console.log(`Model: llama-3.1-8b-instant`);
  console.log(`System prompt length: ${SYSTEM_PROMPT.length} chars`);
  console.log(`Test commands: ${TEST_COMMANDS.length}\n`);

  // ---- Phase 1: Sequential baseline (20 requests) ----
  console.log("Phase 1: Sequential baseline (20 requests)...");
  const seqResults = [];
  for (let i = 0; i < 20; i++) {
    const cmd = TEST_COMMANDS[i % TEST_COMMANDS.length];
    const result = await runSingleTest(cmd, i);
    seqResults.push(result);
    process.stdout.write(result.success ? "." : "X");
  }
  console.log(` done (${seqResults.filter((r) => r.success).length}/20 ok)`);

  // ---- Phase 2: Concurrent batches of 10 ----
  console.log("\nPhase 2: Concurrent (5 batches of 10)...");
  const concResults = [];
  for (let batch = 0; batch < 5; batch++) {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const idx = (batch * 10 + i) % TEST_COMMANDS.length;
      promises.push(runSingleTest(TEST_COMMANDS[idx], batch * 10 + i));
    }
    const batchResults = await Promise.all(promises);
    concResults.push(...batchResults);
    const ok = batchResults.filter((r) => r.success).length;
    process.stdout.write(`[batch${batch + 1}:${ok}/10]`);
    // Small gap between batches to avoid rate limit
    await sleep(2000);
  }
  console.log(` done (${concResults.filter((r) => r.success).length}/50 ok)`);

  // ---- Phase 3: Burst (30 simultaneous) ----
  console.log("\nPhase 3: Burst (30 simultaneous)...");
  const burstPromises = [];
  for (let i = 0; i < 30; i++) {
    const cmd = TEST_COMMANDS[i % TEST_COMMANDS.length];
    burstPromises.push(runSingleTest(cmd, i));
  }
  const burstResults = await Promise.all(burstPromises);
  console.log(
    ` done (${burstResults.filter((r) => r.success).length}/30 ok)`
  );

  // ---- Aggregate results ----
  const allResults = [...seqResults, ...concResults, ...burstResults];
  const successes = allResults.filter((r) => r.success);
  const failures = allResults.filter((r) => !r.success);
  const times = successes.map((r) => r.elapsed).sort((a, b) => a - b);

  console.log("\n============================================");
  console.log("              PERFORMANCE RESULTS            ");
  console.log("============================================");
  console.log(`Total requests:    ${allResults.length}`);
  console.log(`Successes:         ${successes.length}`);
  console.log(
    `Failures:          ${failures.length} (${((failures.length / allResults.length) * 100).toFixed(1)}%)`
  );

  if (times.length > 0) {
    const avg = Math.round(
      times.reduce((a, b) => a + b, 0) / times.length
    );
    console.log(`\nResponse times:`);
    console.log(`  Min:   ${times[0]}ms`);
    console.log(`  Avg:   ${avg}ms`);
    console.log(`  P50:   ${percentile(times, 0.5)}ms`);
    console.log(`  P95:   ${percentile(times, 0.95)}ms`);
    console.log(`  P99:   ${percentile(times, 0.99)}ms`);
    console.log(`  Max:   ${times[times.length - 1]}ms`);
  }

  // ---- Phase breakdown ----
  console.log("\n--- Phase Breakdown ---");
  for (const [label, results] of [
    ["Sequential", seqResults],
    ["Concurrent", concResults],
    ["Burst", burstResults],
  ]) {
    const ok = results.filter((r) => r.success);
    const t = ok.map((r) => r.elapsed).sort((a, b) => a - b);
    if (t.length > 0) {
      const avg = Math.round(t.reduce((a, b) => a + b, 0) / t.length);
      console.log(
        `  ${label.padEnd(12)} avg=${avg}ms  p95=${percentile(t, 0.95)}ms  errors=${results.length - ok.length}/${results.length}`
      );
    }
  }

  // ---- Failures detail ----
  if (failures.length > 0) {
    console.log("\n--- Failure Details ---");
    failures.forEach((f) =>
      console.log(`  [#${f.index}] "${f.command.slice(0, 40)}..." → ${f.error}`)
    );
  }

  // ---- Action accuracy ----
  console.log("\n--- Action Accuracy ---");
  let correct = 0;
  let total = 0;
  const mismatches = [];
  successes.forEach((r) => {
    const expected = EXPECTED_ACTIONS[r.command];
    if (expected) {
      total++;
      if (r.action === expected) {
        correct++;
      } else {
        mismatches.push({
          command: r.command,
          expected,
          got: r.action,
        });
      }
    }
  });
  console.log(`  Correct: ${correct}/${total} (${total > 0 ? ((correct / total) * 100).toFixed(1) : 0}%)`);
  if (mismatches.length > 0) {
    console.log("  Mismatches:");
    // Deduplicate
    const seen = new Set();
    mismatches.forEach((m) => {
      const key = m.command;
      if (!seen.has(key)) {
        seen.add(key);
        console.log(
          `    "${m.command.slice(0, 45)}..." expected=${m.expected} got=${m.got}`
        );
      }
    });
  }

  // ---- Per-command detail (first occurrence only) ----
  console.log("\n--- Per-Command Detail (first occurrence) ---");
  const seenCmd = new Set();
  successes.forEach((r) => {
    if (!seenCmd.has(r.command)) {
      seenCmd.add(r.command);
      const check = EXPECTED_ACTIONS[r.command]
        ? r.action === EXPECTED_ACTIONS[r.command]
          ? "OK"
          : "MISMATCH"
        : "?";
      console.log(
        `  [${String(r.elapsed).padStart(5)}ms] [${check.padEnd(8)}] "${r.command.slice(0, 45).padEnd(45)}" → ${r.action}`
      );
    }
  });

  // ---- Token usage ----
  const totalPromptTokens = successes.reduce(
    (sum, r) => sum + (r.tokens?.prompt_tokens || 0),
    0
  );
  const totalCompletionTokens = successes.reduce(
    (sum, r) => sum + (r.tokens?.completion_tokens || 0),
    0
  );
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const avgTokens = successes.length > 0 ? totalTokens / successes.length : 0;

  console.log("\n--- Token Usage ---");
  console.log(`  Total prompt tokens:     ${totalPromptTokens}`);
  console.log(`  Total completion tokens: ${totalCompletionTokens}`);
  console.log(`  Total tokens:            ${totalTokens}`);
  console.log(`  Avg tokens/request:      ${Math.round(avgTokens)}`);
  console.log(
    `  Avg prompt tokens/req:   ${successes.length > 0 ? Math.round(totalPromptTokens / successes.length) : 0}`
  );
  console.log(
    `  Avg completion tokens/req: ${successes.length > 0 ? Math.round(totalCompletionTokens / successes.length) : 0}`
  );

  // ---- Cost projections ----
  const avgPromptPerReq =
    successes.length > 0 ? totalPromptTokens / successes.length : 0;
  const avgCompletionPerReq =
    successes.length > 0 ? totalCompletionTokens / successes.length : 0;

  console.log("\n--- Cost Projections (Groq Llama 3.1 8B) ---");
  // Groq pricing: $0.05/1M input, $0.08/1M output (as of 2025)
  const inputPricePerM = 0.05;
  const outputPricePerM = 0.08;

  for (const [label, users, reqsPerDay, days] of [
    ["100 users, 5 req/day, 30 days", 100, 5, 30],
    ["500 users, 10 req/day, 30 days", 500, 10, 30],
    ["1000 users, 10 req/day, 30 days", 1000, 10, 30],
    ["5000 users, 10 req/day, 30 days", 5000, 10, 30],
  ]) {
    const totalReqs = users * reqsPerDay * days;
    const monthlyInput = totalReqs * avgPromptPerReq;
    const monthlyOutput = totalReqs * avgCompletionPerReq;
    const cost =
      (monthlyInput / 1e6) * inputPricePerM +
      (monthlyOutput / 1e6) * outputPricePerM;
    console.log(
      `  ${label}: ${(monthlyInput / 1e6).toFixed(1)}M in + ${(monthlyOutput / 1e6).toFixed(1)}M out = ~US$${cost.toFixed(2)}`
    );
  }

  console.log("\n=== LOAD TEST COMPLETE ===\n");

  // Return structured results for report generation
  return {
    total: allResults.length,
    successes: successes.length,
    failures: failures.length,
    errorRate: ((failures.length / allResults.length) * 100).toFixed(1),
    avg: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
    p50: times.length > 0 ? percentile(times, 0.5) : 0,
    p95: times.length > 0 ? percentile(times, 0.95) : 0,
    p99: times.length > 0 ? percentile(times, 0.99) : 0,
    min: times[0] || 0,
    max: times[times.length - 1] || 0,
    accuracy: total > 0 ? ((correct / total) * 100).toFixed(1) : "0",
    totalTokens,
    avgTokens: Math.round(avgTokens),
    promptLength: SYSTEM_PROMPT.length,
  };
}

runLoadTest().catch(console.error);
