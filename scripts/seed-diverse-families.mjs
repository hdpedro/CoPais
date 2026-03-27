import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Kindar@2026";

async function getOrCreateUser(email, fullName) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    if (error.message.includes("already been registered")) {
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users.users.find((u) => u.email === email);
      if (existing) {
        await supabase.auth.admin.updateUser(existing.id, { password: PASSWORD });
        console.log(`  [exists] ${fullName} (${email}) -> ${existing.id}`);
        return existing.id;
      }
    }
    console.error(`  Error creating ${fullName}:`, error.message);
    return null;
  }
  console.log(`  [new] ${fullName} (${email}) -> ${data.user.id}`);
  return data.user.id;
}

async function getOrCreateGroup(name, createdBy) {
  const { data: existing } = await supabase
    .from("coparenting_groups")
    .select("id")
    .eq("name", name)
    .limit(1);
  if (existing && existing.length > 0) {
    console.log(`  [exists] Group "${name}" -> ${existing[0].id}`);
    return existing[0].id;
  }
  const { data: group, error } = await supabase
    .from("coparenting_groups")
    .insert({ name, created_by: createdBy })
    .select()
    .single();
  if (error) {
    console.error(`  Error creating group "${name}":`, error.message);
    return null;
  }
  console.log(`  [new] Group "${name}" -> ${group.id}`);
  return group.id;
}

async function addMembers(groupId, members) {
  await supabase.from("group_members").upsert(
    members.map((m) => ({ group_id: groupId, user_id: m.userId, role: m.role })),
    { onConflict: "group_id,user_id" }
  );
}

async function addChild(groupId, fullName, birthDate) {
  const { data: existing } = await supabase
    .from("children")
    .select("id")
    .eq("group_id", groupId)
    .eq("full_name", fullName)
    .limit(1);
  if (existing && existing.length > 0) {
    console.log(`  [exists] Child "${fullName}" -> ${existing[0].id}`);
    return existing[0].id;
  }
  const { data: child, error } = await supabase
    .from("children")
    .insert({ group_id: groupId, full_name: fullName, birth_date: birthDate })
    .select()
    .single();
  if (error) {
    console.error(`  Error creating child "${fullName}":`, error.message);
    return null;
  }
  console.log(`  [new] Child "${fullName}" -> ${child.id}`);
  return child.id;
}

async function main() {
  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const nextWeek2 = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  // ============================================================
  // FAMILIA 1: Recomposta (Blended Family)
  // Ricardo (pai, admin) + Fernanda (mae, member) + 2 filhos
  // ============================================================
  console.log("\n=== FAMILIA RECOMPOSTA ===");
  const ricardoId = await getOrCreateUser("ricardo@kindar.test", "Ricardo Mendes");
  const fernandaId = await getOrCreateUser("fernanda@kindar.test", "Fernanda Costa");

  await supabase.from("profiles").upsert([
    { id: ricardoId, full_name: "Ricardo Mendes", email: "ricardo@kindar.test", role: "parent", lgpd_consent: true },
    { id: fernandaId, full_name: "Fernanda Costa", email: "fernanda@kindar.test", role: "parent", lgpd_consent: true },
  ]);

  const grupoRecomposta = await getOrCreateGroup("Familia Recomposta", ricardoId);
  await addMembers(grupoRecomposta, [
    { userId: ricardoId, role: "admin" },
    { userId: fernandaId, role: "member" },
  ]);

  const lucasId = await addChild(grupoRecomposta, "Lucas Mendes", "2018-03-22");
  const sofiaId = await addChild(grupoRecomposta, "Sofia Costa", "2023-01-10");

  // Custody: alternating weeks
  await supabase.from("custody_events").insert([
    { group_id: grupoRecomposta, child_id: lucasId, responsible_user_id: ricardoId, start_date: today, end_date: nextWeek, custody_type: "regular", notes: "Semana com Ricardo", created_by: ricardoId },
    { group_id: grupoRecomposta, child_id: lucasId, responsible_user_id: fernandaId, start_date: nextWeek, end_date: nextWeek2, custody_type: "regular", notes: "Semana com Fernanda", created_by: fernandaId },
    { group_id: grupoRecomposta, child_id: sofiaId, responsible_user_id: fernandaId, start_date: today, end_date: nextWeek, custody_type: "regular", notes: "Sofia com a mae", created_by: fernandaId },
    { group_id: grupoRecomposta, child_id: sofiaId, responsible_user_id: ricardoId, start_date: nextWeek, end_date: nextWeek2, custody_type: "regular", notes: "Sofia com o pai", created_by: ricardoId },
  ]);

  // Expenses
  await supabase.from("expenses").insert([
    { group_id: grupoRecomposta, child_id: lucasId, category: "education", description: "Material escolar - Lucas", amount: 450.00, paid_by: ricardoId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoRecomposta, child_id: sofiaId, category: "health", description: "Vacina - Sofia", amount: 280.00, paid_by: fernandaId, split_ratio: { default: 50 }, status: "pending", expense_date: today },
    { group_id: grupoRecomposta, child_id: lucasId, category: "extracurricular", description: "Aula de natacao - Lucas", amount: 320.00, paid_by: ricardoId, split_ratio: { default: 60 }, status: "approved", expense_date: today },
    { group_id: grupoRecomposta, child_id: sofiaId, category: "clothing", description: "Roupas de inverno - Sofia", amount: 590.00, paid_by: fernandaId, split_ratio: { default: 50 }, status: "rejected", expense_date: today },
  ]);

  // Chat
  await supabase.from("chat_messages").insert([
    { group_id: grupoRecomposta, sender_id: ricardoId, text: "Fernanda, o Lucas tem jogo de futebol sabado. Posso levar?" },
    { group_id: grupoRecomposta, sender_id: fernandaId, text: "Claro! Ele vai adorar. A Sofia pode ir assistir tambem?" },
    { group_id: grupoRecomposta, sender_id: ricardoId, text: "Sim, levo os dois. Volto com eles ate as 17h." },
  ]);

  // Agreements
  await supabase.from("agreements").insert([
    { group_id: grupoRecomposta, created_by: ricardoId, title: "Atividades extracurriculares", description: "Ambos os pais devem concordar antes de inscrever os filhos em novas atividades.", category: "education", is_non_negotiable: true, status: "accepted" },
    { group_id: grupoRecomposta, created_by: fernandaId, title: "Alimentacao da Sofia", description: "Sofia tem intolerancia a lactose. Nao oferecer leite ou derivados.", category: "health", is_non_negotiable: true, status: "accepted" },
  ]);

  console.log("  Familia Recomposta completa!");

  // ============================================================
  // FAMILIA 2: Com Avo (Extended Family with Grandparent)
  // Patricia (mae, admin) + Joao (pai, member) + Dona Maria (avo, readonly) + Gabriel
  // ============================================================
  console.log("\n=== FAMILIA COM AVO ===");
  const patriciaId = await getOrCreateUser("patricia@kindar.test", "Patricia Almeida");
  const joaoId = await getOrCreateUser("joao@kindar.test", "Joao Ferreira");
  const donaMariaId = await getOrCreateUser("donamaria@kindar.test", "Maria Santos");

  await supabase.from("profiles").upsert([
    { id: patriciaId, full_name: "Patricia Almeida", email: "patricia@kindar.test", role: "parent", lgpd_consent: true },
    { id: joaoId, full_name: "Joao Ferreira", email: "joao@kindar.test", role: "parent", lgpd_consent: true },
    { id: donaMariaId, full_name: "Maria Santos", email: "donamaria@kindar.test", role: "grandparent", lgpd_consent: true },
  ]);

  const grupoAvo = await getOrCreateGroup("Familia Gabriel", patriciaId);
  await addMembers(grupoAvo, [
    { userId: patriciaId, role: "admin" },
    { userId: joaoId, role: "member" },
    { userId: donaMariaId, role: "readonly" },
  ]);

  const gabrielId = await addChild(grupoAvo, "Gabriel Ferreira Almeida", "2020-09-14");

  // Custody events
  await supabase.from("custody_events").insert([
    { group_id: grupoAvo, child_id: gabrielId, responsible_user_id: patriciaId, start_date: today, end_date: nextWeek, custody_type: "regular", notes: "Com a mae", created_by: patriciaId },
    { group_id: grupoAvo, child_id: gabrielId, responsible_user_id: joaoId, start_date: nextWeek, end_date: nextWeek2, custody_type: "regular", notes: "Com o pai", created_by: joaoId },
  ]);

  // Expenses
  await supabase.from("expenses").insert([
    { group_id: grupoAvo, child_id: gabrielId, category: "education", description: "Mensalidade escola particular", amount: 2200.00, paid_by: joaoId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoAvo, child_id: gabrielId, category: "health", description: "Plano de saude", amount: 680.00, paid_by: patriciaId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoAvo, child_id: gabrielId, category: "extracurricular", description: "Aula de piano", amount: 400.00, paid_by: joaoId, split_ratio: { default: 70 }, status: "pending", expense_date: today },
  ]);

  // Chat
  await supabase.from("chat_messages").insert([
    { group_id: grupoAvo, sender_id: patriciaId, text: "Joao, a mae quer levar o Gabriel no parque domingo. Pode ser?" },
    { group_id: grupoAvo, sender_id: joaoId, text: "Claro! Dona Maria e otima com ele. Pode buscar as 10h." },
    { group_id: grupoAvo, sender_id: donaMariaId, text: "Obrigada, vou preparar um lanchinho especial pra ele!" },
    { group_id: grupoAvo, sender_id: patriciaId, text: "Mae, ele nao pode comer amendoim. Lembra da alergia!" },
  ]);

  // School logs
  await supabase.from("school_logs").insert([
    { group_id: grupoAvo, child_id: gabrielId, logged_by: patriciaId, log_type: "behavior", title: "Comportamento excelente", description: "Professora elogiou Gabriel na reuniao." },
    { group_id: grupoAvo, child_id: gabrielId, logged_by: joaoId, log_type: "event", title: "Festa junina da escola", description: "Dia 15/06. Gabriel vai dancar quadrilha." },
  ]);

  // Agreements
  await supabase.from("agreements").insert([
    { group_id: grupoAvo, created_by: patriciaId, title: "Alergia a amendoim", description: "Gabriel tem alergia grave a amendoim. TODOS os responsaveis devem estar cientes. Carregar epinefrina.", category: "health", is_non_negotiable: true, status: "accepted" },
  ]);

  console.log("  Familia com Avo completa!");

  // ============================================================
  // FAMILIA 3: Com Mediador (Conflicted Family with Mediator)
  // Renata (mae, admin) + Eduardo (pai, member) + Dr. Paulo (mediador, readonly) + Beatriz
  // ============================================================
  console.log("\n=== FAMILIA COM MEDIADOR ===");
  const renataId = await getOrCreateUser("renata@kindar.test", "Renata Souza");
  const eduardoId = await getOrCreateUser("eduardo@kindar.test", "Eduardo Lima");
  const drPauloId = await getOrCreateUser("drpaulo@kindar.test", "Dr. Paulo Ribeiro");

  await supabase.from("profiles").upsert([
    { id: renataId, full_name: "Renata Souza", email: "renata@kindar.test", role: "parent", lgpd_consent: true },
    { id: eduardoId, full_name: "Eduardo Lima", email: "eduardo@kindar.test", role: "parent", lgpd_consent: true },
    { id: drPauloId, full_name: "Dr. Paulo Ribeiro", email: "drpaulo@kindar.test", role: "mediator", lgpd_consent: true },
  ]);

  const grupoMediador = await getOrCreateGroup("Familia Beatriz", renataId);
  await addMembers(grupoMediador, [
    { userId: renataId, role: "admin" },
    { userId: eduardoId, role: "member" },
    { userId: drPauloId, role: "readonly" },
  ]);

  const beatrizId = await addChild(grupoMediador, "Beatriz Lima Souza", "2022-04-30");

  // Custody
  await supabase.from("custody_events").insert([
    { group_id: grupoMediador, child_id: beatrizId, responsible_user_id: renataId, start_date: today, end_date: nextWeek, custody_type: "regular", notes: "Com a mae", created_by: renataId },
    { group_id: grupoMediador, child_id: beatrizId, responsible_user_id: eduardoId, start_date: nextWeek, end_date: nextWeek2, custody_type: "regular", notes: "Com o pai", created_by: eduardoId },
  ]);

  // Expenses - some conflicting/rejected
  await supabase.from("expenses").insert([
    { group_id: grupoMediador, child_id: beatrizId, category: "education", description: "Creche particular", amount: 1800.00, paid_by: renataId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoMediador, child_id: beatrizId, category: "clothing", description: "Roupa de marca importada", amount: 1200.00, paid_by: renataId, split_ratio: { default: 50 }, status: "rejected", expense_date: today },
    { group_id: grupoMediador, child_id: beatrizId, category: "health", description: "Terapia infantil", amount: 500.00, paid_by: eduardoId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoMediador, child_id: beatrizId, category: "extracurricular", description: "Ballet classico", amount: 350.00, paid_by: eduardoId, split_ratio: { default: 50 }, status: "pending", expense_date: today },
  ]);

  // Chat with tension and mediator
  await supabase.from("chat_messages").insert([
    { group_id: grupoMediador, sender_id: renataId, text: "Eduardo, voce atrasou 2 horas pra buscar a Beatriz. Isso nao pode acontecer." },
    { group_id: grupoMediador, sender_id: eduardoId, text: "Tive um imprevisto no trabalho, avisei antes. Nao exagera." },
    { group_id: grupoMediador, sender_id: drPauloId, text: "Pessoal, vamos manter o dialogo construtivo. Eduardo, e importante cumprir os horarios. Renata, vamos entender o contexto." },
    { group_id: grupoMediador, sender_id: renataId, text: "Ok, Dr. Paulo. Mas preciso que isso seja registrado." },
    { group_id: grupoMediador, sender_id: eduardoId, text: "Concordo. Vou me organizar melhor. Desculpa pelo transtorno." },
  ]);

  // Agreements - some pending (contentious)
  await supabase.from("agreements").insert([
    { group_id: grupoMediador, created_by: renataId, title: "Pontualidade nas trocas", description: "Atraso maximo de 15 minutos. Apos isso, o outro pai pode recusar a troca.", category: "routine", is_non_negotiable: true, status: "pending" },
    { group_id: grupoMediador, created_by: eduardoId, title: "Comunicacao so pelo app", description: "Toda comunicacao sobre a Beatriz deve ser feita exclusivamente pelo app, para registro.", category: "routine", is_non_negotiable: false, status: "accepted" },
  ]);

  // Sensitive topic
  await supabase.from("sensitive_topics").insert([
    { group_id: grupoMediador, child_id: beatrizId, reported_by: renataId, topic: "mental_health", title: "Ansiedade de separacao", description: "Beatriz tem chorado muito nas trocas. Psicologa recomendou transicoes mais suaves.", visibility: "all" },
  ]);

  console.log("  Familia com Mediador completa!");

  // ============================================================
  // FAMILIA 4: Grande (Multiple Children, Different Ages)
  // Camila (mae, admin) + Tiago (pai, member) + 3 filhos
  // ============================================================
  console.log("\n=== FAMILIA GRANDE ===");
  const camilaId = await getOrCreateUser("camila@kindar.test", "Camila Rodrigues");
  const tiagoId = await getOrCreateUser("tiago@kindar.test", "Tiago Nascimento");

  await supabase.from("profiles").upsert([
    { id: camilaId, full_name: "Camila Rodrigues", email: "camila@kindar.test", role: "parent", lgpd_consent: true },
    { id: tiagoId, full_name: "Tiago Nascimento", email: "tiago@kindar.test", role: "parent", lgpd_consent: true },
  ]);

  const grupoGrande = await getOrCreateGroup("Familia Nascimento", camilaId);
  await addMembers(grupoGrande, [
    { userId: camilaId, role: "admin" },
    { userId: tiagoId, role: "member" },
  ]);

  const miguelId = await addChild(grupoGrande, "Miguel Nascimento", "2019-02-18");
  const aliceId = await addChild(grupoGrande, "Alice Nascimento", "2021-07-05");
  const heitorId = await addChild(grupoGrande, "Heitor Nascimento", "2024-11-20");

  // Custody - different arrangements per child
  await supabase.from("custody_events").insert([
    // Miguel - alternating weeks
    { group_id: grupoGrande, child_id: miguelId, responsible_user_id: camilaId, start_date: today, end_date: nextWeek, custody_type: "regular", notes: "Miguel com a mae", created_by: camilaId },
    { group_id: grupoGrande, child_id: miguelId, responsible_user_id: tiagoId, start_date: nextWeek, end_date: nextWeek2, custody_type: "regular", notes: "Miguel com o pai", created_by: tiagoId },
    // Alice - same as Miguel
    { group_id: grupoGrande, child_id: aliceId, responsible_user_id: camilaId, start_date: today, end_date: nextWeek, custody_type: "regular", notes: "Alice com a mae", created_by: camilaId },
    { group_id: grupoGrande, child_id: aliceId, responsible_user_id: tiagoId, start_date: nextWeek, end_date: nextWeek2, custody_type: "regular", notes: "Alice com o pai", created_by: tiagoId },
    // Heitor (baby) - mostly with mom
    { group_id: grupoGrande, child_id: heitorId, responsible_user_id: camilaId, start_date: today, end_date: nextWeek2, custody_type: "regular", notes: "Heitor bebe, com a mae", created_by: camilaId },
  ]);

  // Many expenses for 3 children
  await supabase.from("expenses").insert([
    { group_id: grupoGrande, child_id: miguelId, category: "education", description: "Escola - Miguel", amount: 1500.00, paid_by: tiagoId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoGrande, child_id: aliceId, category: "education", description: "Escola - Alice", amount: 1500.00, paid_by: tiagoId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoGrande, child_id: heitorId, category: "health", description: "Pediatra - Heitor", amount: 300.00, paid_by: camilaId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoGrande, child_id: miguelId, category: "extracurricular", description: "Judo - Miguel", amount: 250.00, paid_by: camilaId, split_ratio: { default: 50 }, status: "pending", expense_date: today },
    { group_id: grupoGrande, child_id: aliceId, category: "health", description: "Dentista - Alice", amount: 400.00, paid_by: tiagoId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoGrande, child_id: heitorId, category: "clothing", description: "Fraldas e roupas - Heitor", amount: 620.00, paid_by: camilaId, split_ratio: { default: 50 }, status: "approved", expense_date: today },
    { group_id: grupoGrande, child_id: miguelId, category: "health", description: "Oculos - Miguel", amount: 850.00, paid_by: tiagoId, split_ratio: { default: 50 }, status: "rejected", expense_date: today },
  ]);

  // Chat
  await supabase.from("chat_messages").insert([
    { group_id: grupoGrande, sender_id: camilaId, text: "Tiago, o Heitor esta com febre. Levei no pediatra, nada grave." },
    { group_id: grupoGrande, sender_id: tiagoId, text: "Obrigado por avisar! Precisa de alguma coisa? Posso passar na farmacia." },
    { group_id: grupoGrande, sender_id: camilaId, text: "Ja comprei o remedio. Ah, a Alice tem apresentacao na escola sexta. Vem?" },
    { group_id: grupoGrande, sender_id: tiagoId, text: "Com certeza! E o Miguel pediu pra ir no aniversario do amigo sabado. Posso levar." },
    { group_id: grupoGrande, sender_id: camilaId, text: "Pode sim! O convite esta na mochila dele. Festa e das 14h as 18h." },
  ]);

  // Agreements
  await supabase.from("agreements").insert([
    { group_id: grupoGrande, created_by: camilaId, title: "Rotina do Heitor", description: "Heitor precisa de mamadeira as 3h da madrugada. Manter a rotina de sono.", category: "routine", is_non_negotiable: true, status: "accepted" },
    { group_id: grupoGrande, created_by: tiagoId, title: "Lição de casa", description: "Miguel e Alice devem fazer licao antes de assistir TV em ambas as casas.", category: "education", is_non_negotiable: false, status: "accepted" },
    { group_id: grupoGrande, created_by: camilaId, title: "Vacinas do Heitor", description: "Proxima vacina em abril. Tiago pode levar?", category: "health", is_non_negotiable: false, status: "pending" },
  ]);

  // School logs
  await supabase.from("school_logs").insert([
    { group_id: grupoGrande, child_id: miguelId, logged_by: tiagoId, log_type: "grade", title: "Boletim 1o bimestre", description: "Miguel tirou notas otimas. Matematica 9.0, Portugues 8.5." },
    { group_id: grupoGrande, child_id: aliceId, logged_by: camilaId, log_type: "achievement", title: "Aluna destaque", description: "Alice foi escolhida como aluna destaque do mes!" },
  ]);

  console.log("  Familia Grande completa!");

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("  TODAS AS FAMILIAS DE TESTE CRIADAS COM SUCESSO!");
  console.log("=".repeat(60));
  console.log("\n  CONTAS DE TESTE (senha: Kindar@2026 para todas):\n");
  console.log("  FAMILIA RECOMPOSTA:");
  console.log("    ricardo@kindar.test  (pai, admin)");
  console.log("    fernanda@kindar.test (mae, member)");
  console.log("    Filhos: Lucas (7a), Sofia (3a)");
  console.log("\n  FAMILIA COM AVO:");
  console.log("    patricia@kindar.test (mae, admin)");
  console.log("    joao@kindar.test     (pai, member)");
  console.log("    donamaria@kindar.test (avo, readonly)");
  console.log("    Filho: Gabriel (5a)");
  console.log("\n  FAMILIA COM MEDIADOR:");
  console.log("    renata@kindar.test   (mae, admin)");
  console.log("    eduardo@kindar.test  (pai, member)");
  console.log("    drpaulo@kindar.test  (mediador, readonly)");
  console.log("    Filha: Beatriz (3a)");
  console.log("\n  FAMILIA GRANDE (3 filhos):");
  console.log("    camila@kindar.test   (mae, admin)");
  console.log("    tiago@kindar.test    (pai, member)");
  console.log("    Filhos: Miguel (7a), Alice (4a), Heitor (bebe)");
  console.log("\n" + "=".repeat(60));
}

main().catch(console.error);
