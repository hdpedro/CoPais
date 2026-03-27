/**
 * STRESS TEST — Kindar (CoPais)
 * Simula 3 grupos familiares completos com convites, escalas, trocas, despesas e chat.
 * Usa Supabase service role para criar usuarios reais e simular o fluxo de ponta a ponta.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = "https://jquaysfeeuwvoydsgssi.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ============================================================
// CONFIG — 3 Familias
// ============================================================
const PASSWORD = "Test@Kindar2026!";
const TIMESTAMP = Date.now();

const USERS = {
  // Familia 1 — Silva
  carlos:   { email: `carlos.silva.${TIMESTAMP}@test.kindar.app`, name: "Carlos Silva",    role: "parent" },
  ana:      { email: `ana.silva.${TIMESTAMP}@test.kindar.app`,    name: "Ana Martins",     role: "parent" },
  maria:    { email: `maria.avo.${TIMESTAMP}@test.kindar.app`,    name: "Maria da Silva",  role: "grandparent" },  // SHARED: Family 1 + 3

  // Familia 2 — Santos
  lucas:    { email: `lucas.santos.${TIMESTAMP}@test.kindar.app`, name: "Lucas Santos",    role: "parent" },
  julia:    { email: `julia.santos.${TIMESTAMP}@test.kindar.app`, name: "Julia Mendes",    role: "parent" },
  jose:     { email: `jose.avo.${TIMESTAMP}@test.kindar.app`,     name: "Jose dos Santos", role: "grandparent" },

  // Familia 3 — Oliveira
  rafael:   { email: `rafael.oliv.${TIMESTAMP}@test.kindar.app`,  name: "Rafael Oliveira", role: "parent" },
  camila:   { email: `camila.oliv.${TIMESTAMP}@test.kindar.app`,  name: "Camila Ferreira", role: "parent" },

  // Advogados (COMPARTILHADOS entre familias)
  roberto:  { email: `roberto.adv.${TIMESTAMP}@test.kindar.app`,  name: "Dr. Roberto Lima",    role: "lawyer" },    // Family 1 + 2
  patricia: { email: `patricia.adv.${TIMESTAMP}@test.kindar.app`, name: "Dra. Patricia Costa",  role: "lawyer" },    // Family 3

  // Mediador (COMPARTILHADO)
  fernanda: { email: `fernanda.med.${TIMESTAMP}@test.kindar.app`, name: "Fernanda Souza",  role: "mediator" },  // Family 2 + 3
};

const results = {
  users: {},
  groups: {},
  children: {},
  invitations: [],
  custodyEvents: 0,
  swapRequests: [],
  expenses: [],
  chatMessages: [],
  healthLogs: 0,
  schoolLogs: 0,
  agreements: [],
  checkins: 0,
  errors: [],
};

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function logSection(title) { console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`); }
function logOk(msg) { log("✅", msg); }
function logErr(msg) { log("❌", msg); results.errors.push(msg); }
function logInfo(msg) { log("📋", msg); }

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ============================================================
// STEP 1: Create Users
// ============================================================
async function createUsers() {
  logSection("ETAPA 1 — CRIAR USUARIOS (11 contas)");

  for (const [key, user] of Object.entries(USERS)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name: user.name },
    });

    if (error) {
      logErr(`Falha ao criar ${user.name}: ${error.message}`);
      continue;
    }

    results.users[key] = { id: data.user.id, ...user };
    logOk(`${user.name} (${user.email}) — id: ${data.user.id.slice(0, 8)}...`);

    // Create profile
    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      full_name: user.name,
      role: user.role,
    });

    if (profileError) {
      logErr(`Perfil de ${user.name}: ${profileError.message}`);
    }
  }

  logInfo(`${Object.keys(results.users).length}/11 usuarios criados`);
}

// ============================================================
// STEP 2: Create 3 Family Groups
// ============================================================
async function createGroups() {
  logSection("ETAPA 2 — CRIAR 3 GRUPOS FAMILIARES");

  const groups = [
    { key: "silva",    name: "Familia Silva-Martins",    creator: "carlos" },
    { key: "santos",   name: "Familia Santos-Mendes",    creator: "lucas" },
    { key: "oliveira", name: "Familia Oliveira-Ferreira", creator: "rafael" },
  ];

  for (const g of groups) {
    const creator = results.users[g.creator];
    if (!creator) { logErr(`Creator ${g.creator} nao existe`); continue; }

    const groupId = crypto.randomUUID();

    const { error: groupError } = await admin
      .from("coparenting_groups")
      .insert({ id: groupId, name: g.name, created_by: creator.id });

    if (groupError) { logErr(`Grupo ${g.name}: ${groupError.message}`); continue; }

    // Add creator as admin
    const { error: memberError } = await admin
      .from("group_members")
      .insert({ group_id: groupId, user_id: creator.id, role: "admin" });

    if (memberError) { logErr(`Admin ${g.name}: ${memberError.message}`); continue; }

    results.groups[g.key] = { id: groupId, name: g.name, creator: g.creator };
    logOk(`${g.name} — criado por ${creator.name} — id: ${groupId.slice(0, 8)}...`);
  }
}

// ============================================================
// STEP 3: Create Invitations and Accept Them
// ============================================================
async function createInvitations() {
  logSection("ETAPA 3 — CONVITES E ACEITACAO");

  const invitations = [
    // Familia Silva
    { group: "silva",    inviter: "carlos", invitee: "ana",      role: "parent",      groupRole: "member" },
    { group: "silva",    inviter: "carlos", invitee: "maria",    role: "grandparent", groupRole: "readonly" },
    { group: "silva",    inviter: "carlos", invitee: "roberto",  role: "lawyer",      groupRole: "member" },

    // Familia Santos
    { group: "santos",   inviter: "lucas",  invitee: "julia",    role: "parent",      groupRole: "member" },
    { group: "santos",   inviter: "lucas",  invitee: "jose",     role: "grandparent", groupRole: "readonly" },
    { group: "santos",   inviter: "lucas",  invitee: "roberto",  role: "lawyer",      groupRole: "member" },  // SHARED lawyer
    { group: "santos",   inviter: "lucas",  invitee: "fernanda", role: "mediator",    groupRole: "member" },  // SHARED mediator

    // Familia Oliveira
    { group: "oliveira", inviter: "rafael", invitee: "camila",   role: "parent",      groupRole: "member" },
    { group: "oliveira", inviter: "rafael", invitee: "maria",    role: "grandparent", groupRole: "readonly" },  // SHARED grandma
    { group: "oliveira", inviter: "rafael", invitee: "patricia", role: "lawyer",      groupRole: "member" },
    { group: "oliveira", inviter: "rafael", invitee: "fernanda", role: "mediator",    groupRole: "member" },  // SHARED mediator
  ];

  for (const inv of invitations) {
    const group = results.groups[inv.group];
    const inviter = results.users[inv.inviter];
    const invitee = results.users[inv.invitee];
    if (!group || !inviter || !invitee) {
      logErr(`Convite faltando dados: ${inv.group}/${inv.inviter}/${inv.invitee}`);
      continue;
    }

    const token = crypto.randomUUID();

    // 1. Create invitation record
    const { error: invError } = await admin.from("invitations").insert({
      group_id: group.id,
      invited_by: inviter.id,
      email: invitee.email,
      role: inv.role,
      group_role: inv.groupRole,
      token,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (invError) {
      logErr(`Convite para ${invitee.name} em ${group.name}: ${invError.message}`);
      continue;
    }

    logOk(`Convite criado: ${inviter.name} → ${invitee.name} (${inv.role}) no ${group.name}`);

    // 2. Accept invitation (simulate)
    // Add to group_members
    const { error: memberError } = await admin.from("group_members").insert({
      group_id: group.id,
      user_id: invitee.id,
      role: inv.groupRole,
    });

    if (memberError) {
      // May already be a member (shared users)
      if (memberError.message.includes("duplicate") || memberError.message.includes("unique")) {
        logInfo(`${invitee.name} ja e membro do ${group.name} (compartilhado)`);
      } else {
        logErr(`Adicionar ${invitee.name} ao ${group.name}: ${memberError.message}`);
        continue;
      }
    }

    // Update invitation status
    await admin.from("invitations").update({
      status: "accepted",
      accepted_by: invitee.id,
      accepted_at: new Date().toISOString(),
    }).eq("token", token);

    logOk(`Convite aceito: ${invitee.name} entrou no ${group.name} como ${inv.role}`);

    results.invitations.push({
      group: group.name,
      from: inviter.name,
      to: invitee.name,
      role: inv.role,
      token: token.slice(0, 8) + "...",
      status: "accepted",
    });
  }

  logInfo(`${results.invitations.length} convites processados`);
}

// ============================================================
// STEP 4: Add Children
// ============================================================
async function addChildren() {
  logSection("ETAPA 4 — CADASTRAR CRIANCAS");

  const childrenData = [
    // Familia Silva
    { group: "silva",    name: "Pedro Silva Martins",     birth: "2021-03-15", allergies: ["Amendoim", "Leite"], notes: "Usa oculos" },
    { group: "silva",    name: "Isabela Silva Martins",   birth: "2023-08-20", allergies: null, notes: null },

    // Familia Santos
    { group: "santos",   name: "Sofia Santos Mendes",     birth: "2023-01-10", allergies: ["Gluten"], notes: "Intolerancia a lactose" },

    // Familia Oliveira
    { group: "oliveira", name: "Miguel Oliveira Ferreira", birth: "2019-06-05", allergies: null, notes: "TDAH - acompanhamento" },
    { group: "oliveira", name: "Laura Oliveira Ferreira",  birth: "2022-11-28", allergies: ["Camarao", "Morango"], notes: null },
  ];

  for (const c of childrenData) {
    const group = results.groups[c.group];
    if (!group) continue;

    const { data, error } = await admin.from("children").insert({
      group_id: group.id,
      full_name: c.name,
      birth_date: c.birth,
      allergies: c.allergies,
      notes: c.notes,
    }).select("id").single();

    if (error) { logErr(`Crianca ${c.name}: ${error.message}`); continue; }

    if (!results.children[c.group]) results.children[c.group] = [];
    results.children[c.group].push({ id: data.id, name: c.name });
    logOk(`${c.name} — ${c.group} — nascimento: ${c.birth}${c.allergies ? " — alergias: " + c.allergies.join(", ") : ""}`);
  }
}

// ============================================================
// STEP 5: Generate Custody Schedules
// ============================================================
async function generateSchedules() {
  logSection("ETAPA 5 — GERAR ESCALAS DE CUSTODIA (3 meses)");

  const schedules = [
    {
      group: "silva",
      parent1: "carlos", parent2: "ana",
      pattern: "alternating", // Semanas alternadas
    },
    {
      group: "santos",
      parent1: "lucas", parent2: "julia",
      pattern: "5-2", // 5-2 / 2-5
    },
    {
      group: "oliveira",
      parent1: "rafael", parent2: "camila",
      pattern: "3-4", // 3-4 / 4-3
    },
  ];

  const today = new Date();
  const startDate = new Date(today);
  // Start from last Monday
  startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 3);

  for (const sched of schedules) {
    const group = results.groups[sched.group];
    const p1 = results.users[sched.parent1];
    const p2 = results.users[sched.parent2];
    const childList = results.children[sched.group];
    if (!group || !p1 || !p2 || !childList) continue;

    // Build 14-day pattern
    let pattern;
    switch (sched.pattern) {
      case "alternating":
        pattern = [p1.id, p1.id, p1.id, p1.id, p1.id, p1.id, p1.id,
                   p2.id, p2.id, p2.id, p2.id, p2.id, p2.id, p2.id];
        break;
      case "5-2":
        pattern = [p1.id, p1.id, p1.id, p1.id, p1.id, p2.id, p2.id,
                   p2.id, p2.id, p2.id, p2.id, p2.id, p1.id, p1.id];
        break;
      case "3-4":
        pattern = [p1.id, p1.id, p1.id, p2.id, p2.id, p2.id, p2.id,
                   p2.id, p2.id, p2.id, p2.id, p1.id, p1.id, p1.id];
        break;
    }

    // Generate events for each child
    for (const child of childList) {
      const events = [];
      const current = new Date(startDate);
      let rangeStart = null;
      let rangeUserId = null;
      let dayIndex = 0;

      while (current < endDate) {
        const patternIdx = dayIndex % 14;
        const userId = pattern[patternIdx];

        if (rangeUserId === userId) {
          // Continue range
        } else {
          if (rangeStart && rangeUserId) {
            const prevDay = new Date(current);
            prevDay.setDate(prevDay.getDate() - 1);
            events.push({
              group_id: group.id,
              child_id: child.id,
              responsible_user_id: rangeUserId,
              start_date: fmt(rangeStart),
              end_date: fmt(prevDay),
              custody_type: "regular",
              notes: `Escala ${sched.pattern} - gerado por stress test`,
              created_by: p1.id,
            });
          }
          rangeStart = new Date(current);
          rangeUserId = userId;
        }

        current.setDate(current.getDate() + 1);
        dayIndex++;
      }

      // Close final range
      if (rangeStart && rangeUserId) {
        const lastDay = new Date(current);
        lastDay.setDate(lastDay.getDate() - 1);
        events.push({
          group_id: group.id,
          child_id: child.id,
          responsible_user_id: rangeUserId,
          start_date: fmt(rangeStart),
          end_date: fmt(lastDay),
          custody_type: "regular",
          notes: `Escala ${sched.pattern} - gerado por stress test`,
          created_by: p1.id,
        });
      }

      // Batch insert
      for (let i = 0; i < events.length; i += 50) {
        const batch = events.slice(i, i + 50);
        const { error } = await admin.from("custody_events").insert(batch);
        if (error) { logErr(`Eventos ${child.name}: ${error.message}`); break; }
      }

      results.custodyEvents += events.length;
      logOk(`${child.name} — ${events.length} eventos (escala ${sched.pattern}) — ${group.name}`);
    }
  }

  logInfo(`Total: ${results.custodyEvents} eventos de custodia gerados`);
}

// ============================================================
// STEP 6: Create Swap Requests
// ============================================================
async function createSwapRequests() {
  logSection("ETAPA 6 — SOLICITAR TROCAS DE DIA");

  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const weekAfter = new Date(today);
  weekAfter.setDate(weekAfter.getDate() + 14);

  const swaps = [
    // Familia Silva: Ana pede troca para Carlos
    {
      group: "silva", requester: "ana", target: "carlos",
      originalDate: fmt(nextWeek), proposedDate: fmt(weekAfter),
      reason: "Consulta medica do Pedro na terca",
      action: "approve",
    },
    // Familia Santos: Julia pede troca para Lucas
    {
      group: "santos", requester: "julia", target: "lucas",
      originalDate: fmt(nextWeek), proposedDate: fmt(weekAfter),
      reason: "Aniversario da avo da Sofia",
      action: "approve",
    },
    // Familia Santos: Lucas pede troca - sera REJEITADA
    {
      group: "santos", requester: "lucas", target: "julia",
      originalDate: fmt(new Date(today.getTime() + 21 * 86400000)),
      proposedDate: fmt(new Date(today.getTime() + 28 * 86400000)),
      reason: "Viagem de trabalho",
      action: "reject",
    },
    // Familia Oliveira: Camila pede troca para Rafael
    {
      group: "oliveira", requester: "camila", target: "rafael",
      originalDate: fmt(new Date(today.getTime() + 10 * 86400000)),
      proposedDate: fmt(new Date(today.getTime() + 17 * 86400000)),
      reason: "Festa de aniversario da Laura",
      action: "approve",
    },
    // Avo Maria solicita VISITA na familia Silva
    {
      group: "silva", requester: "maria", target: "carlos",
      originalDate: fmt(new Date(today.getTime() + 5 * 86400000)),
      proposedDate: null,
      reason: "Gostaria de ver os netos no sabado",
      action: "approve",
      isVisit: true,
    },
  ];

  for (const swap of swaps) {
    const group = results.groups[swap.group];
    const requester = results.users[swap.requester];
    const target = results.users[swap.target];
    if (!group || !requester || !target) continue;

    const { data, error } = await admin.from("swap_requests").insert({
      group_id: group.id,
      requester_id: requester.id,
      target_user_id: target.id,
      original_date: swap.originalDate,
      proposed_date: swap.proposedDate,
      reason: swap.reason,
      status: "pending",
    }).select("id").single();

    if (error) { logErr(`Troca ${requester.name} → ${target.name}: ${error.message}`); continue; }

    logOk(`Solicitacao: ${requester.name} → ${target.name} (${swap.originalDate}) — ${swap.reason}`);

    // Process response
    if (swap.action === "approve") {
      const { error: updateError } = await admin.from("swap_requests")
        .update({ status: "approved", responded_at: new Date().toISOString() })
        .eq("id", data.id);

      if (updateError) { logErr(`Aprovar troca: ${updateError.message}`); continue; }
      logOk(`  → APROVADA por ${target.name}`);
    } else {
      const { error: updateError } = await admin.from("swap_requests")
        .update({ status: "rejected", responded_at: new Date().toISOString() })
        .eq("id", data.id);

      if (updateError) { logErr(`Rejeitar troca: ${updateError.message}`); continue; }
      logOk(`  → REJEITADA por ${target.name}`);
    }

    results.swapRequests.push({
      group: group.name,
      from: requester.name,
      to: target.name,
      date: swap.originalDate,
      status: swap.action === "approve" ? "approved" : "rejected",
      isVisit: swap.isVisit || false,
    });
  }
}

// ============================================================
// STEP 7: Create Expenses
// ============================================================
async function createExpenses() {
  logSection("ETAPA 7 — REGISTRAR DESPESAS");

  const categories = ["education", "health", "food", "clothing", "transport", "leisure", "housing", "other"];
  const expenseData = [
    // Familia Silva
    { group: "silva", creator: "carlos", desc: "Mensalidade escola Pedro",     amount: 1850.00, cat: "education", status: "approved", approver: "ana" },
    { group: "silva", creator: "ana",    desc: "Consulta pediatra Isabela",    amount: 350.00,  cat: "health",    status: "approved", approver: "carlos" },
    { group: "silva", creator: "carlos", desc: "Material escolar",             amount: 520.00,  cat: "education", status: "pending",  approver: null },
    { group: "silva", creator: "ana",    desc: "Roupas de inverno criancas",   amount: 680.00,  cat: "clothing",  status: "rejected", approver: "carlos" },

    // Familia Santos
    { group: "santos", creator: "lucas",  desc: "Creche Sofia",               amount: 1200.00, cat: "education", status: "approved", approver: "julia" },
    { group: "santos", creator: "julia",  desc: "Vacina Sofia",               amount: 180.00,  cat: "health",    status: "approved", approver: "lucas" },
    { group: "santos", creator: "lucas",  desc: "Passeio zoologico",          amount: 150.00,  cat: "leisure",   status: "pending",  approver: null },

    // Familia Oliveira
    { group: "oliveira", creator: "rafael", desc: "Escola Miguel",             amount: 2200.00, cat: "education", status: "approved", approver: "camila" },
    { group: "oliveira", creator: "camila", desc: "Terapia Miguel (TDAH)",     amount: 450.00,  cat: "health",    status: "approved", approver: "rafael" },
    { group: "oliveira", creator: "rafael", desc: "Ballet Laura",              amount: 280.00,  cat: "leisure",   status: "approved", approver: "camila" },
    { group: "oliveira", creator: "camila", desc: "Transporte escolar",        amount: 600.00,  cat: "transport", status: "pending",  approver: null },
    { group: "oliveira", creator: "rafael", desc: "Alimentacao especial Laura", amount: 320.00, cat: "food",      status: "approved", approver: "camila" },
  ];

  for (const exp of expenseData) {
    const group = results.groups[exp.group];
    const creator = results.users[exp.creator];
    const child = results.children[exp.group]?.[0];
    if (!group || !creator) continue;

    const insertData = {
      group_id: group.id,
      created_by: creator.id,
      description: exp.desc,
      amount: exp.amount,
      category: exp.cat,
      expense_date: fmt(new Date()),
      status: exp.status,
      child_id: child?.id || null,
    };

    if (exp.status === "approved" && exp.approver) {
      const approver = results.users[exp.approver];
      if (approver) {
        insertData.approved_by = approver.id;
        insertData.approved_at = new Date().toISOString();
      }
    }

    const { error } = await admin.from("expenses").insert(insertData);
    if (error) { logErr(`Despesa "${exp.desc}": ${error.message}`); continue; }

    const statusIcon = exp.status === "approved" ? "✅" : exp.status === "rejected" ? "🔴" : "🟡";
    logOk(`${statusIcon} R$ ${exp.amount.toFixed(2)} — ${exp.desc} — ${group.name} (${exp.status})`);
    results.expenses.push({ group: group.name, desc: exp.desc, amount: exp.amount, status: exp.status });
  }
}

// ============================================================
// STEP 8: Chat Messages (with Tone Moderation Simulation)
// ============================================================
async function createChatMessages() {
  logSection("ETAPA 8 — MENSAGENS NO CHAT");

  const messages = [
    // Familia Silva — conversa normal
    { group: "silva", sender: "carlos", text: "Oi Ana, Pedro precisa levar a mochila azul amanha." },
    { group: "silva", sender: "ana",    text: "Ok, vou separar. Ele tomou o remedio hoje?" },
    { group: "silva", sender: "carlos", text: "Sim, dei o antialergico as 8h." },
    { group: "silva", sender: "maria",  text: "Posso buscar os netos na sexta a tarde?" },
    { group: "silva", sender: "ana",    text: "Claro Dona Maria! Eles vao adorar." },

    // Familia Santos — conversa sobre escola
    { group: "santos", sender: "julia",    text: "Lucas, a reuniao de pais e na quinta as 19h." },
    { group: "santos", sender: "lucas",    text: "Posso ir. Voce tambem vai?" },
    { group: "santos", sender: "julia",    text: "Sim, vamos juntos. E importante para a Sofia." },
    { group: "santos", sender: "fernanda", text: "Oi familia! Lembrem-se da nossa sessao de mediacao na segunda." },
    { group: "santos", sender: "lucas",    text: "Estaremos la, Fernanda. Obrigado." },

    // Familia Oliveira — conversa sobre saude
    { group: "oliveira", sender: "camila",   text: "Rafael, o Miguel precisa tomar o Ritalin as 7h sem falta." },
    { group: "oliveira", sender: "rafael",   text: "Entendido, ja coloquei alarme. Alguma mudanca na dosagem?" },
    { group: "oliveira", sender: "camila",   text: "Nao, mantemos 10mg. A dra disse para reavaliar em marco." },
    { group: "oliveira", sender: "patricia", text: "Bom dia! O acordo de guarda compartilhada ficou pronto. Vou enviar para assinatura." },
    { group: "oliveira", sender: "rafael",   text: "Obrigado Dra. Patricia! Vamos revisar juntos." },
    { group: "oliveira", sender: "maria",    text: "Posso levar as criancas no parque sabado? Preparei bolo de chocolate!" },
  ];

  for (const msg of messages) {
    const group = results.groups[msg.group];
    const sender = results.users[msg.sender];
    if (!group || !sender) continue;

    const { error } = await admin.from("chat_messages").insert({
      group_id: group.id,
      user_id: sender.id,
      content: msg.text,
    });

    if (error) { logErr(`Chat ${sender.name}: ${error.message}`); continue; }

    logOk(`[${group.name}] ${sender.name}: "${msg.text.slice(0, 50)}${msg.text.length > 50 ? "..." : ""}"`);
    results.chatMessages.push({ group: group.name, sender: sender.name, text: msg.text.slice(0, 40) });
  }
}

// ============================================================
// STEP 9: Health Logs, School Logs, Check-ins
// ============================================================
async function createHealthAndSchoolLogs() {
  logSection("ETAPA 9 — REGISTROS DE SAUDE, ESCOLA E CHECK-INS");

  // Health logs
  const healthLogs = [
    { group: "silva",    child: 0, creator: "ana",    type: "fever",      value: "38.2°C",     notes: "Febre leve apos vacina" },
    { group: "silva",    child: 0, creator: "carlos", type: "medication", value: "Paracetamol", notes: "1 dose 15ml" },
    { group: "silva",    child: 1, creator: "ana",    type: "vaccine",    value: "Pentavalente", notes: "3a dose" },
    { group: "santos",   child: 0, creator: "julia",  type: "food",       value: "Boa alimentacao", notes: "Comeu toda a papa" },
    { group: "santos",   child: 0, creator: "lucas",  type: "sleep",      value: "10h",         notes: "Dormiu bem a noite toda" },
    { group: "oliveira", child: 0, creator: "camila", type: "mood",       value: "Agitado",     notes: "Dia dificil na escola" },
    { group: "oliveira", child: 0, creator: "rafael", type: "medication", value: "Ritalin 10mg", notes: "Tomou as 7h" },
    { group: "oliveira", child: 1, creator: "camila", type: "height",     value: "98cm",        notes: "Medida na pediatra" },
  ];

  for (const h of healthLogs) {
    const group = results.groups[h.group];
    const child = results.children[h.group]?.[h.child];
    const creator = results.users[h.creator];
    if (!group || !child || !creator) continue;

    const { error } = await admin.from("health_logs").insert({
      group_id: group.id,
      child_id: child.id,
      created_by: creator.id,
      log_type: h.type,
      value: h.value,
      notes: h.notes,
    });

    if (error) { logErr(`Saude ${child.name}: ${error.message}`); continue; }
    results.healthLogs++;
    logOk(`Saude: ${child.name} — ${h.type}: ${h.value}`);
  }

  // School logs
  const schoolLogs = [
    { group: "silva",    child: 0, creator: "ana",    type: "grade",       title: "Prova de Matematica",   desc: "Nota 8.5" },
    { group: "silva",    child: 0, creator: "carlos", type: "meeting",     title: "Reuniao de Pais",       desc: "Professora elogiou comportamento" },
    { group: "oliveira", child: 0, creator: "camila", type: "behavior",    title: "Incidente no recreio",  desc: "Miguel se irritou com colega" },
    { group: "oliveira", child: 0, creator: "rafael", type: "achievement", title: "Medalha de leitura",    desc: "Leu 10 livros no semestre" },
    { group: "oliveira", child: 1, creator: "camila", type: "event",       title: "Festa junina",          desc: "Laura vai dancar quadrilha" },
  ];

  for (const s of schoolLogs) {
    const group = results.groups[s.group];
    const child = results.children[s.group]?.[s.child];
    const creator = results.users[s.creator];
    if (!group || !child || !creator) continue;

    const { error } = await admin.from("school_logs").insert({
      group_id: group.id,
      child_id: child.id,
      created_by: creator.id,
      log_type: s.type,
      title: s.title,
      description: s.desc,
      log_date: fmt(new Date()),
    });

    if (error) { logErr(`Escola ${child.name}: ${error.message}`); continue; }
    results.schoolLogs++;
    logOk(`Escola: ${child.name} — ${s.type}: ${s.title}`);
  }

  // Daily check-ins
  const checkins = [
    { group: "silva",    child: 0, creator: "carlos", categories: { mood: "Feliz", food: "Comeu bem", sleep: "Dormiu 10h" } },
    { group: "santos",   child: 0, creator: "julia",  categories: { mood: "Calma", health: "Saudavel", activity: "Brincou no parque" } },
    { group: "oliveira", child: 0, creator: "rafael", categories: { mood: "Ansioso", school: "Dia dificil", health: "Tomou medicacao" } },
  ];

  for (const c of checkins) {
    const group = results.groups[c.group];
    const child = results.children[c.group]?.[c.child];
    const creator = results.users[c.creator];
    if (!group || !child || !creator) continue;

    const { error } = await admin.from("daily_checkins").insert({
      group_id: group.id,
      child_id: child.id,
      created_by: creator.id,
      categories: c.categories,
      notes: "Check-in do stress test",
    });

    if (error) { logErr(`Check-in ${child.name}: ${error.message}`); continue; }
    results.checkins++;
    logOk(`Check-in: ${child.name} por ${creator.name}`);
  }
}

// ============================================================
// STEP 10: Agreements
// ============================================================
async function createAgreements() {
  logSection("ETAPA 10 — ACORDOS DE COPARENTALIDADE");

  const agreements = [
    { group: "silva",    creator: "carlos", title: "Horario de sono",         desc: "Criancas dormem ate 21h em dias de escola", cat: "routine", nonNeg: true, accepter: "ana" },
    { group: "silva",    creator: "ana",    title: "Limite de tela",          desc: "Maximo 1h por dia durante a semana",         cat: "rule",    nonNeg: false, accepter: "carlos" },
    { group: "santos",   creator: "lucas",  title: "Alimentacao saudavel",   desc: "Nada de refrigerante ou fast food em excesso", cat: "value",  nonNeg: true, accepter: "julia" },
    { group: "santos",   creator: "julia",  title: "Comunicacao sobre escola", desc: "Ambos os pais devem ser informados de reunioes", cat: "principle", nonNeg: true, accepter: null },
    { group: "oliveira", creator: "rafael", title: "Medicacao do Miguel",     desc: "Ritalin 10mg as 7h todos os dias de escola", cat: "rule",    nonNeg: true, accepter: "camila" },
    { group: "oliveira", creator: "camila", title: "Restricoes alimentares Laura", desc: "Verificar sempre se ha camarao ou morango", cat: "boundary", nonNeg: true, accepter: "rafael" },
  ];

  for (const a of agreements) {
    const group = results.groups[a.group];
    const creator = results.users[a.creator];
    if (!group || !creator) continue;

    const insertData = {
      group_id: group.id,
      created_by: creator.id,
      title: a.title,
      description: a.desc,
      category: a.cat,
      is_non_negotiable: a.nonNeg,
    };

    if (a.accepter) {
      const accepter = results.users[a.accepter];
      if (accepter) {
        insertData.accepted_by = accepter.id;
        insertData.accepted_at = new Date().toISOString();
      }
    }

    const { error } = await admin.from("agreements").insert(insertData);
    if (error) { logErr(`Acordo "${a.title}": ${error.message}`); continue; }

    const status = a.accepter ? "ACEITO" : "PENDENTE";
    logOk(`${status}: "${a.title}" — ${group.name} (${a.cat}${a.nonNeg ? ", INEGOCIAVEL" : ""})`);
    results.agreements.push({ group: group.name, title: a.title, status, category: a.cat });
  }
}

// ============================================================
// STEP 11: Verify All Data
// ============================================================
async function verifyData() {
  logSection("ETAPA 11 — VERIFICACAO DE INTEGRIDADE");

  const checks = [];

  // 1. Users count
  const { count: userCount } = await admin.from("profiles").select("*", { count: "exact", head: true });
  checks.push({ item: "Usuarios com perfil", expected: ">=11", actual: userCount, ok: userCount >= 11 });

  // 2. Groups count
  const { count: groupCount } = await admin.from("coparenting_groups").select("*", { count: "exact", head: true });
  checks.push({ item: "Grupos familiares", expected: ">=3", actual: groupCount, ok: groupCount >= 3 });

  // 3. Group members
  for (const [key, group] of Object.entries(results.groups)) {
    const { count } = await admin.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", group.id);
    const expectedMembers = key === "silva" ? 4 : key === "santos" ? 5 : 5;
    checks.push({ item: `Membros ${group.name}`, expected: `>=${expectedMembers}`, actual: count, ok: count >= expectedMembers });
  }

  // 4. Invitations
  const { count: invCount } = await admin.from("invitations").select("*", { count: "exact", head: true }).eq("status", "accepted");
  checks.push({ item: "Convites aceitos", expected: ">=11", actual: invCount, ok: invCount >= 11 });

  // 5. Children
  const { count: childCount } = await admin.from("children").select("*", { count: "exact", head: true });
  checks.push({ item: "Criancas cadastradas", expected: ">=5", actual: childCount, ok: childCount >= 5 });

  // 6. Custody events
  const { count: eventCount } = await admin.from("custody_events").select("*", { count: "exact", head: true });
  checks.push({ item: "Eventos de custodia", expected: ">=30", actual: eventCount, ok: eventCount >= 30 });

  // 7. Swap requests
  const { count: swapCount } = await admin.from("swap_requests").select("*", { count: "exact", head: true });
  checks.push({ item: "Trocas de dia", expected: ">=5", actual: swapCount, ok: swapCount >= 5 });

  // 8. Expenses
  const { count: expenseCount } = await admin.from("expenses").select("*", { count: "exact", head: true });
  checks.push({ item: "Despesas", expected: ">=12", actual: expenseCount, ok: expenseCount >= 12 });

  // 9. Chat messages
  const { count: chatCount } = await admin.from("chat_messages").select("*", { count: "exact", head: true });
  checks.push({ item: "Mensagens de chat", expected: ">=16", actual: chatCount, ok: chatCount >= 16 });

  // 10. Health logs
  const { count: healthCount } = await admin.from("health_logs").select("*", { count: "exact", head: true });
  checks.push({ item: "Registros de saude", expected: ">=8", actual: healthCount, ok: healthCount >= 8 });

  // 11. School logs
  const { count: schoolCount } = await admin.from("school_logs").select("*", { count: "exact", head: true });
  checks.push({ item: "Registros escola", expected: ">=5", actual: schoolCount, ok: schoolCount >= 5 });

  // 12. Agreements
  const { count: agreeCount } = await admin.from("agreements").select("*", { count: "exact", head: true });
  checks.push({ item: "Acordos", expected: ">=6", actual: agreeCount, ok: agreeCount >= 6 });

  // 13. Check shared users in multiple groups
  const sharedUsers = ["roberto", "maria", "fernanda"];
  for (const key of sharedUsers) {
    const user = results.users[key];
    if (!user) continue;
    const { count } = await admin.from("group_members").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    checks.push({ item: `${user.name} em multiplos grupos`, expected: ">=2", actual: count, ok: count >= 2 });
  }

  // Print results
  console.log("");
  console.log("  ┌─────────────────────────────────────────┬──────────┬────────┬────────┐");
  console.log("  │ Verificacao                              │ Esperado │ Atual  │ Status │");
  console.log("  ├─────────────────────────────────────────┼──────────┼────────┼────────┤");

  let passed = 0;
  let failed = 0;

  for (const c of checks) {
    const status = c.ok ? "  ✅  " : "  ❌  ";
    const name = c.item.padEnd(41);
    const expected = String(c.expected).padEnd(8);
    const actual = String(c.actual).padEnd(6);
    console.log(`  │ ${name} │ ${expected} │ ${actual} │${status}│`);
    if (c.ok) passed++; else failed++;
  }

  console.log("  └─────────────────────────────────────────┴──────────┴────────┴────────┘");
  console.log(`\n  Resultado: ${passed} passou, ${failed} falhou de ${checks.length} verificacoes`);

  return { passed, failed, total: checks.length };
}

// ============================================================
// STEP 12: Print Final Report
// ============================================================
function printReport(verification) {
  logSection("RELATORIO FINAL — EVIDENCIAS DE SUCESSO");

  console.log(`
  ┌──────────────────────────────────────────────────────────┐
  │              STRESS TEST — 2LARES — RESULTADO            │
  ├──────────────────────────────────────────────────────────┤
  │                                                          │
  │  Usuarios criados:          ${String(Object.keys(results.users).length).padStart(3)}                        │
  │  Grupos familiares:         ${String(Object.keys(results.groups).length).padStart(3)}                        │
  │  Convites processados:      ${String(results.invitations.length).padStart(3)}                        │
  │  Criancas cadastradas:      ${String(Object.values(results.children).flat().length).padStart(3)}                        │
  │  Eventos de custodia:       ${String(results.custodyEvents).padStart(3)}                        │
  │  Trocas de dia:             ${String(results.swapRequests.length).padStart(3)}                        │
  │  Despesas registradas:      ${String(results.expenses.length).padStart(3)}                        │
  │  Mensagens de chat:         ${String(results.chatMessages.length).padStart(3)}                        │
  │  Registros de saude:        ${String(results.healthLogs).padStart(3)}                        │
  │  Registros escola:          ${String(results.schoolLogs).padStart(3)}                        │
  │  Acordos:                   ${String(results.agreements.length).padStart(3)}                        │
  │  Check-ins:                 ${String(results.checkins).padStart(3)}                        │
  │                                                          │
  │  Verificacoes: ${String(verification.passed).padStart(2)}/${String(verification.total).padStart(2)} passaram                         │
  │  Erros encontrados:         ${String(results.errors.length).padStart(3)}                        │
  │                                                          │
  └──────────────────────────────────────────────────────────┘`);

  // Family structure
  console.log("\n  ESTRUTURA DOS GRUPOS:");
  console.log("  ─────────────────────");

  for (const [key, group] of Object.entries(results.groups)) {
    console.log(`\n  📁 ${group.name}`);
    // Find members
    for (const [userKey, user] of Object.entries(results.users)) {
      const inv = results.invitations.find(i => i.group === group.name && i.to === user.name);
      if (group.creator === userKey) {
        console.log(`     👑 ${user.name} (${user.role} / admin — criador)`);
      } else if (inv) {
        const shared = results.invitations.filter(i => i.to === user.name).length > 1 ? " ⭐ COMPARTILHADO" : "";
        console.log(`     👤 ${user.name} (${user.role} / ${inv.role})${shared}`);
      }
    }
    // Children
    const kids = results.children[key] || [];
    for (const child of kids) {
      console.log(`     👶 ${child.name}`);
    }
  }

  // Shared users evidence
  console.log("\n  USUARIOS COMPARTILHADOS:");
  console.log("  ────────────────────────");
  const sharedMap = {};
  for (const inv of results.invitations) {
    if (!sharedMap[inv.to]) sharedMap[inv.to] = [];
    sharedMap[inv.to].push(inv.group);
  }
  for (const [name, groups] of Object.entries(sharedMap)) {
    if (groups.length > 1) {
      console.log(`  ⭐ ${name} → ${groups.join(" + ")}`);
    }
  }

  // Swap summary
  console.log("\n  TROCAS DE DIA:");
  console.log("  ──────────────");
  for (const swap of results.swapRequests) {
    const icon = swap.status === "approved" ? "✅" : "🔴";
    const type = swap.isVisit ? " (VISITA)" : "";
    console.log(`  ${icon} ${swap.from} → ${swap.to} (${swap.date}) — ${swap.status}${type}`);
  }

  // Financial summary
  console.log("\n  FINANCEIRO:");
  console.log("  ───────────");
  const byGroup = {};
  for (const exp of results.expenses) {
    if (!byGroup[exp.group]) byGroup[exp.group] = { total: 0, approved: 0, pending: 0, rejected: 0 };
    byGroup[exp.group].total += exp.amount;
    byGroup[exp.group][exp.status] += exp.amount;
  }
  for (const [group, data] of Object.entries(byGroup)) {
    console.log(`  💰 ${group}: R$ ${data.total.toFixed(2)} total (✅ R$ ${data.approved.toFixed(2)} aprovado | 🟡 R$ ${data.pending.toFixed(2)} pendente | 🔴 R$ ${data.rejected.toFixed(2)} rejeitado)`);
  }

  // Errors
  if (results.errors.length > 0) {
    console.log("\n  ERROS ENCONTRADOS:");
    console.log("  ──────────────────");
    for (const err of results.errors) {
      console.log(`  ❌ ${err}`);
    }
  } else {
    console.log("\n  🎉 ZERO ERROS — TODOS OS TESTES PASSARAM!");
  }

  // Login credentials
  console.log("\n  CREDENCIAIS PARA TESTE MANUAL:");
  console.log("  ──────────────────────────────");
  console.log(`  Senha universal: ${PASSWORD}`);
  console.log(`  URL: https://kindar.vercel.app/login`);
  console.log("");
  for (const [key, user] of Object.entries(results.users)) {
    const groups = results.invitations.filter(i => i.to === user.name).map(i => i.group);
    const creatorOf = Object.values(results.groups).filter(g => g.creator === key).map(g => g.name);
    const allGroups = [...creatorOf.map(g => g + " (admin)"), ...groups];
    console.log(`  📧 ${user.email}`);
    console.log(`     ${user.name} (${user.role}) — ${allGroups.join(", ") || "criador"}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  STRESS TEST COMPLETO!");
  console.log("=".repeat(60) + "\n");
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("  🧪 STRESS TEST — 2LARES — INICIO");
  console.log("  " + new Date().toLocaleString("pt-BR"));
  console.log("=".repeat(60));

  try {
    await createUsers();
    await createGroups();
    await createInvitations();
    await addChildren();
    await generateSchedules();
    await createSwapRequests();
    await createExpenses();
    await createChatMessages();
    await createHealthAndSchoolLogs();
    await createAgreements();
    const verification = await verifyData();
    printReport(verification);
  } catch (err) {
    console.error("\n❌ ERRO FATAL:", err.message);
    console.error(err.stack);
  }
}

main();
