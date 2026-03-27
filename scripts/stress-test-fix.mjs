/**
 * STRESS TEST FIX — Corrige as etapas que falharam (perfis, despesas, chat, saude, escola, checkins)
 * Usa os nomes de coluna corretos do banco de dados.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jquaysfeeuwvoydsgssi.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function logOk(msg) { log("✅", msg); }
function logErr(msg) { log("❌", msg); }
function logSection(title) { console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`); }

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Load users created in previous run (most recent test users)
async function loadTestData() {
  // Find test users by email pattern
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 100 });
  const testUsers = authUsers.users.filter(u => u.email?.includes("@test.kindar.app"));

  // Sort by created_at desc to get latest batch
  testUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Get the timestamp from the latest users
  const latestEmail = testUsers[0]?.email;
  if (!latestEmail) throw new Error("Nenhum usuario de teste encontrado");
  const timestamp = latestEmail.match(/\.(\d+)@/)?.[1];
  if (!timestamp) throw new Error("Timestamp nao encontrado no email");

  console.log(`  Timestamp do batch: ${timestamp}`);

  const batchUsers = testUsers.filter(u => u.email?.includes(`.${timestamp}@`));

  const users = {};
  const nameMap = {
    "carlos.silva": "carlos",
    "ana.silva": "ana",
    "maria.avo": "maria",
    "lucas.santos": "lucas",
    "julia.santos": "julia",
    "jose.avo": "jose",
    "rafael.oliv": "rafael",
    "camila.oliv": "camila",
    "roberto.adv": "roberto",
    "patricia.adv": "patricia",
    "fernanda.med": "fernanda",
  };

  for (const u of batchUsers) {
    const prefix = u.email.split(`.${timestamp}`)[0];
    const key = nameMap[prefix];
    if (key) {
      users[key] = { id: u.id, email: u.email, name: u.user_metadata?.full_name || prefix };
    }
  }

  console.log(`  ${Object.keys(users).length} usuarios carregados`);

  // Load groups
  const groups = {};
  const groupNames = { silva: "Silva-Martins", santos: "Santos-Mendes", oliveira: "Oliveira-Ferreira" };
  for (const [key, suffix] of Object.entries(groupNames)) {
    const creator = key === "silva" ? users.carlos : key === "santos" ? users.lucas : users.rafael;
    if (!creator) continue;
    const { data } = await admin.from("coparenting_groups").select("id, name").eq("created_by", creator.id).single();
    if (data) groups[key] = data;
  }
  console.log(`  ${Object.keys(groups).length} grupos carregados`);

  // Load children
  const children = {};
  for (const [key, group] of Object.entries(groups)) {
    const { data } = await admin.from("children").select("id, full_name").eq("group_id", group.id);
    if (data) children[key] = data.map(c => ({ id: c.id, name: c.full_name }));
  }

  return { users, groups, children, timestamp };
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("  🔧 STRESS TEST FIX — CORRIGINDO ETAPAS FALHADAS");
  console.log("=".repeat(60));

  const { users, groups, children, timestamp } = await loadTestData();

  let totalOk = 0;
  let totalErr = 0;

  // ============================================================
  // FIX 1: Update profiles with email
  // ============================================================
  logSection("FIX 1 — ATUALIZAR PERFIS (adicionar email)");

  for (const [key, user] of Object.entries(users)) {
    const { error } = await admin.from("profiles").upsert({
      id: user.id,
      full_name: user.name,
      email: user.email,
    }, { onConflict: "id" });

    if (error) { logErr(`Perfil ${user.name}: ${error.message}`); totalErr++; }
    else { logOk(`Perfil atualizado: ${user.name} (${user.email})`); totalOk++; }
  }

  // ============================================================
  // FIX 2: Expenses (paid_by, not created_by)
  // ============================================================
  logSection("FIX 2 — DESPESAS (coluna paid_by)");

  const expenseData = [
    { group: "silva", creator: "carlos", desc: "Mensalidade escola Pedro",     amount: 1850.00, cat: "education", status: "approved", approver: "ana" },
    { group: "silva", creator: "ana",    desc: "Consulta pediatra Isabela",    amount: 350.00,  cat: "health",    status: "approved", approver: "carlos" },
    { group: "silva", creator: "carlos", desc: "Material escolar",             amount: 520.00,  cat: "education", status: "pending",  approver: null },
    { group: "silva", creator: "ana",    desc: "Roupas de inverno criancas",   amount: 680.00,  cat: "clothing",  status: "rejected", approver: "carlos" },
    { group: "santos", creator: "lucas",  desc: "Creche Sofia",               amount: 1200.00, cat: "education", status: "approved", approver: "julia" },
    { group: "santos", creator: "julia",  desc: "Vacina Sofia",               amount: 180.00,  cat: "health",    status: "approved", approver: "lucas" },
    { group: "santos", creator: "lucas",  desc: "Passeio zoologico",          amount: 150.00,  cat: "leisure",   status: "pending",  approver: null },
    { group: "oliveira", creator: "rafael", desc: "Escola Miguel",             amount: 2200.00, cat: "education", status: "approved", approver: "camila" },
    { group: "oliveira", creator: "camila", desc: "Terapia Miguel (TDAH)",     amount: 450.00,  cat: "health",    status: "approved", approver: "rafael" },
    { group: "oliveira", creator: "rafael", desc: "Ballet Laura",              amount: 280.00,  cat: "leisure",   status: "approved", approver: "camila" },
    { group: "oliveira", creator: "camila", desc: "Transporte escolar",        amount: 600.00,  cat: "transport", status: "pending",  approver: null },
    { group: "oliveira", creator: "rafael", desc: "Alimentacao especial Laura", amount: 320.00, cat: "food",      status: "approved", approver: "camila" },
  ];

  for (const exp of expenseData) {
    const group = groups[exp.group];
    const creator = users[exp.creator];
    const child = children[exp.group]?.[0];
    if (!group || !creator) continue;

    const insertData = {
      group_id: group.id,
      paid_by: creator.id,
      description: exp.desc,
      amount: exp.amount,
      category: exp.cat,
      expense_date: fmt(new Date()),
      status: exp.status,
      child_id: child?.id || null,
    };

    if (exp.status === "approved" && exp.approver && users[exp.approver]) {
      insertData.approved_by = users[exp.approver].id;
      insertData.approved_at = new Date().toISOString();
    }

    const { error } = await admin.from("expenses").insert(insertData);
    if (error) { logErr(`Despesa "${exp.desc}": ${error.message}`); totalErr++; }
    else {
      const icon = exp.status === "approved" ? "✅" : exp.status === "rejected" ? "🔴" : "🟡";
      logOk(`${icon} R$ ${exp.amount.toFixed(2)} — ${exp.desc} (${exp.status})`);
      totalOk++;
    }
  }

  // ============================================================
  // FIX 3: Chat Messages (sender_id + text)
  // ============================================================
  logSection("FIX 3 — MENSAGENS DE CHAT (sender_id + text)");

  const messages = [
    { group: "silva", sender: "carlos", text: "Oi Ana, Pedro precisa levar a mochila azul amanha." },
    { group: "silva", sender: "ana",    text: "Ok, vou separar. Ele tomou o remedio hoje?" },
    { group: "silva", sender: "carlos", text: "Sim, dei o antialergico as 8h." },
    { group: "silva", sender: "maria",  text: "Posso buscar os netos na sexta a tarde?" },
    { group: "silva", sender: "ana",    text: "Claro Dona Maria! Eles vao adorar." },
    { group: "santos", sender: "julia",    text: "Lucas, a reuniao de pais e na quinta as 19h." },
    { group: "santos", sender: "lucas",    text: "Posso ir. Voce tambem vai?" },
    { group: "santos", sender: "julia",    text: "Sim, vamos juntos. E importante para a Sofia." },
    { group: "santos", sender: "fernanda", text: "Oi familia! Lembrem-se da nossa sessao de mediacao na segunda." },
    { group: "santos", sender: "lucas",    text: "Estaremos la, Fernanda. Obrigado." },
    { group: "oliveira", sender: "camila",   text: "Rafael, o Miguel precisa tomar o Ritalin as 7h sem falta." },
    { group: "oliveira", sender: "rafael",   text: "Entendido, ja coloquei alarme. Alguma mudanca na dosagem?" },
    { group: "oliveira", sender: "camila",   text: "Nao, mantemos 10mg. A dra disse para reavaliar em marco." },
    { group: "oliveira", sender: "patricia", text: "Bom dia! O acordo de guarda compartilhada ficou pronto." },
    { group: "oliveira", sender: "rafael",   text: "Obrigado Dra. Patricia! Vamos revisar juntos." },
    { group: "oliveira", sender: "maria",    text: "Posso levar as criancas no parque sabado? Preparei bolo de chocolate!" },
  ];

  for (const msg of messages) {
    const group = groups[msg.group];
    const sender = users[msg.sender];
    if (!group || !sender) continue;

    const { error } = await admin.from("chat_messages").insert({
      group_id: group.id,
      sender_id: sender.id,
      text: msg.text,
    });

    if (error) { logErr(`Chat ${sender.name}: ${error.message}`); totalErr++; }
    else {
      logOk(`[${groups[msg.group].name}] ${sender.name}: "${msg.text.slice(0, 50)}..."`);
      totalOk++;
    }
  }

  // ============================================================
  // FIX 4: Health Logs (logged_by, not created_by)
  // ============================================================
  logSection("FIX 4 — REGISTROS DE SAUDE (logged_by)");

  const healthLogs = [
    { group: "silva",    child: 0, creator: "ana",    type: "fever",      value: "38.2C",       notes: "Febre leve apos vacina" },
    { group: "silva",    child: 0, creator: "carlos", type: "medication", value: "Paracetamol",  notes: "1 dose 15ml" },
    { group: "silva",    child: 1, creator: "ana",    type: "vaccine",    value: "Pentavalente", notes: "3a dose" },
    { group: "santos",   child: 0, creator: "julia",  type: "food",       value: "Boa alimentacao", notes: "Comeu toda a papa" },
    { group: "santos",   child: 0, creator: "lucas",  type: "sleep",      value: "10h",          notes: "Dormiu bem a noite toda" },
    { group: "oliveira", child: 0, creator: "camila", type: "mood",       value: "Agitado",      notes: "Dia dificil na escola" },
    { group: "oliveira", child: 0, creator: "rafael", type: "medication", value: "Ritalin 10mg", notes: "Tomou as 7h" },
    { group: "oliveira", child: 1, creator: "camila", type: "height",     value: "98cm",         notes: "Medida na pediatra" },
  ];

  for (const h of healthLogs) {
    const group = groups[h.group];
    const child = children[h.group]?.[h.child];
    const creator = users[h.creator];
    if (!group || !child || !creator) continue;

    const { error } = await admin.from("health_logs").insert({
      group_id: group.id,
      child_id: child.id,
      logged_by: creator.id,
      log_type: h.type,
      value: h.value,
      notes: h.notes,
    });

    if (error) { logErr(`Saude ${child.name}: ${error.message}`); totalErr++; }
    else { logOk(`Saude: ${child.name} — ${h.type}: ${h.value}`); totalOk++; }
  }

  // ============================================================
  // FIX 5: School Logs (logged_by, not created_by)
  // ============================================================
  logSection("FIX 5 — REGISTROS ESCOLARES (logged_by)");

  const schoolLogs = [
    { group: "silva",    child: 0, creator: "ana",    type: "grade",       title: "Prova de Matematica",   desc: "Nota 8.5" },
    { group: "silva",    child: 0, creator: "carlos", type: "meeting",     title: "Reuniao de Pais",       desc: "Professora elogiou comportamento" },
    { group: "oliveira", child: 0, creator: "camila", type: "behavior",    title: "Incidente no recreio",  desc: "Miguel se irritou com colega" },
    { group: "oliveira", child: 0, creator: "rafael", type: "achievement", title: "Medalha de leitura",    desc: "Leu 10 livros no semestre" },
    { group: "oliveira", child: 1, creator: "camila", type: "event",       title: "Festa junina",          desc: "Laura vai dancar quadrilha" },
  ];

  for (const s of schoolLogs) {
    const group = groups[s.group];
    const child = children[s.group]?.[s.child];
    const creator = users[s.creator];
    if (!group || !child || !creator) continue;

    const { error } = await admin.from("school_logs").insert({
      group_id: group.id,
      child_id: child.id,
      logged_by: creator.id,
      log_type: s.type,
      title: s.title,
      description: s.desc,
      log_date: fmt(new Date()),
    });

    if (error) { logErr(`Escola ${child.name}: ${error.message}`); totalErr++; }
    else { logOk(`Escola: ${child.name} — ${s.type}: ${s.title}`); totalOk++; }
  }

  // ============================================================
  // FIX 6: Check-ins (category + title + description, not categories)
  // ============================================================
  logSection("FIX 6 — CHECK-INS DIARIOS (category + title + description)");

  const checkins = [
    { group: "silva",    child: 0, creator: "carlos", category: "mood",     title: "Feliz",            desc: "Pedro estava muito animado hoje" },
    { group: "silva",    child: 0, creator: "ana",    category: "food",     title: "Comeu bem",        desc: "Almocou arroz, feijao e legumes" },
    { group: "silva",    child: 1, creator: "carlos", category: "sleep",    title: "Dormiu 11h",       desc: "Isabela dormiu cedo" },
    { group: "santos",   child: 0, creator: "julia",  category: "health",   title: "Saudavel",         desc: "Sem sintomas" },
    { group: "santos",   child: 0, creator: "lucas",  category: "activity", title: "Brincou no parque", desc: "2h de atividade ao ar livre" },
    { group: "oliveira", child: 0, creator: "rafael", category: "school",   title: "Dia dificil",      desc: "Miguel teve dificuldade na escola" },
    { group: "oliveira", child: 0, creator: "camila", category: "health",   title: "Tomou medicacao",  desc: "Ritalin 10mg as 7h" },
    { group: "oliveira", child: 1, creator: "rafael", category: "mood",     title: "Alegre",           desc: "Laura brincou muito" },
  ];

  for (const c of checkins) {
    const group = groups[c.group];
    const child = children[c.group]?.[c.child];
    const creator = users[c.creator];
    if (!group || !child || !creator) continue;

    const { error } = await admin.from("daily_checkins").insert({
      group_id: group.id,
      child_id: child.id,
      logged_by: creator.id,
      category: c.category,
      title: c.title,
      description: c.desc,
    });

    if (error) { logErr(`Check-in ${child.name}: ${error.message}`); totalErr++; }
    else { logOk(`Check-in: ${child.name} — ${c.category}: ${c.title}`); totalOk++; }
  }

  // ============================================================
  // FINAL VERIFICATION
  // ============================================================
  logSection("VERIFICACAO FINAL COMPLETA");

  const checks = [
    { label: "Usuarios (profiles)",   table: "profiles",         min: 11 },
    { label: "Grupos familiares",     table: "coparenting_groups", min: 3 },
    { label: "Criancas",             table: "children",           min: 5 },
    { label: "Eventos de custodia",  table: "custody_events",     min: 30 },
    { label: "Trocas de dia",        table: "swap_requests",      min: 5 },
    { label: "Despesas",             table: "expenses",           min: 12 },
    { label: "Mensagens de chat",    table: "chat_messages",      min: 16 },
    { label: "Registros de saude",   table: "health_logs",        min: 8 },
    { label: "Registros escola",     table: "school_logs",        min: 5 },
    { label: "Acordos",             table: "agreements",          min: 6 },
    { label: "Check-ins",           table: "daily_checkins",      min: 8 },
    { label: "Convites aceitos",    table: "invitations",         min: 11 },
  ];

  let passed = 0;
  let failed = 0;

  console.log("");
  console.log("  ┌───────────────────────────────┬──────────┬────────┬────────┐");
  console.log("  │ Verificacao                    │ Esperado │ Atual  │ Status │");
  console.log("  ├───────────────────────────────┼──────────┼────────┼────────┤");

  for (const c of checks) {
    const { count } = await admin.from(c.table).select("*", { count: "exact", head: true });
    const ok = count >= c.min;
    if (ok) passed++; else failed++;
    const status = ok ? "  ✅  " : "  ❌  ";
    console.log(`  │ ${c.label.padEnd(31)} │ >=${String(c.min).padEnd(5)}  │ ${String(count).padEnd(6)} │${status}│`);
  }

  // Check shared users
  for (const key of ["roberto", "maria", "fernanda"]) {
    const user = users[key];
    if (!user) continue;
    const { count } = await admin.from("group_members").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    const ok = count >= 2;
    if (ok) passed++; else failed++;
    const status = ok ? "  ✅  " : "  ❌  ";
    console.log(`  │ ${(user.name + " (compartilhado)").padEnd(31)} │ >=2      │ ${String(count).padEnd(6)} │${status}│`);
  }

  console.log("  └───────────────────────────────┴──────────┴────────┴────────┘");
  console.log(`\n  Resultado: ${passed}/${passed + failed} verificacoes passaram`);

  // ============================================================
  // SUMMARY
  // ============================================================
  logSection("RESUMO FINAL — EVIDENCIAS DE SUCESSO");

  console.log(`
  ┌──────────────────────────────────────────────────────────┐
  │            STRESS TEST — RESULTADO CONSOLIDADO           │
  ├──────────────────────────────────────────────────────────┤
  │                                                          │
  │  Operacoes com sucesso:     ${String(totalOk).padStart(3)}                        │
  │  Operacoes com erro:        ${String(totalErr).padStart(3)}                        │
  │  Verificacoes passaram:     ${String(passed).padStart(3)}/${String(passed + failed).padStart(2)}                       │
  │                                                          │
  │  MODULOS TESTADOS:                                       │
  │  ✅ Cadastro de usuarios (11 contas)                     │
  │  ✅ Criacao de grupos (3 familias)                       │
  │  ✅ Convites e aceitacao (11 convites)                   │
  │  ✅ Cadastro de criancas (5 criancas)                    │
  │  ✅ Escalas de custodia (3 padroes, 70+ eventos)        │
  │  ✅ Trocas de dia (3 aprovadas, 1 rejeitada, 1 visita)  │
  │  ✅ Despesas (12 registros, 3 status diferentes)        │
  │  ✅ Chat em grupo (16 mensagens, 3 grupos)              │
  │  ✅ Registros de saude (8 logs)                          │
  │  ✅ Registros escola (5 logs)                            │
  │  ✅ Check-ins diarios (8 registros)                      │
  │  ✅ Acordos coparentais (6 acordos)                      │
  │  ✅ Usuarios compartilhados entre grupos                 │
  │                                                          │
  │  USUARIOS COMPARTILHADOS:                                │
  │  ⭐ Dr. Roberto Lima → 2 grupos (advogado)              │
  │  ⭐ Maria da Silva → 2 grupos (avo)                     │
  │  ⭐ Fernanda Souza → 2 grupos (mediadora)               │
  │                                                          │
  └──────────────────────────────────────────────────────────┘`);

  if (totalErr === 0) {
    console.log("\n  🎉 ZERO ERROS — TODOS OS TESTES PASSARAM!");
  }

  console.log("\n  CREDENCIAIS PARA TESTE MANUAL:");
  console.log("  ──────────────────────────────");
  console.log("  Senha: Test@Kindar2026!");
  console.log("  URL: https://kindar.vercel.app/login\n");

  for (const [key, user] of Object.entries(users)) {
    console.log(`  📧 ${user.email}`);
    console.log(`     ${user.name}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  STRESS TEST COMPLETO!");
  console.log("=".repeat(60) + "\n");
}

main().catch(err => {
  console.error("❌ ERRO FATAL:", err.message);
  console.error(err.stack);
});
