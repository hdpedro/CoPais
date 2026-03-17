import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "2Lares@2026";

async function main() {
  console.log("Creating test users...\n");

  // Create Bruno (pai)
  const { data: bruno, error: brunoErr } = await supabase.auth.admin.createUser({
    email: "bruno@2lares.test",
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Bruno Silva" },
  });
  if (brunoErr) {
    if (brunoErr.message.includes("already been registered")) {
      console.log("Bruno already exists, fetching...");
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users.users.find((u) => u.email === "bruno@2lares.test");
      if (existing) {
        await supabase.auth.admin.updateUser(existing.id, { password: PASSWORD });
        var brunoId = existing.id;
      }
    } else {
      console.error("Error creating Bruno:", brunoErr);
      return;
    }
  } else {
    var brunoId = bruno.user.id;
  }
  console.log("Bruno ID:", brunoId);

  // Create Martina (mae)
  const { data: martina, error: martinaErr } = await supabase.auth.admin.createUser({
    email: "martina@2lares.test",
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Martina Oliveira" },
  });
  if (martinaErr) {
    if (martinaErr.message.includes("already been registered")) {
      console.log("Martina already exists, fetching...");
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users.users.find((u) => u.email === "martina@2lares.test");
      if (existing) {
        await supabase.auth.admin.updateUser(existing.id, { password: PASSWORD });
        var martinaId = existing.id;
      }
    } else {
      console.error("Error creating Martina:", martinaErr);
      return;
    }
  } else {
    var martinaId = martina.user.id;
  }
  console.log("Martina ID:", martinaId);

  // Create/update profiles
  await supabase.from("profiles").upsert([
    { id: brunoId, full_name: "Bruno Silva", email: "bruno@2lares.test", role: "parent", lgpd_consent: true },
    { id: martinaId, full_name: "Martina Oliveira", email: "martina@2lares.test", role: "parent", lgpd_consent: true },
  ]);
  console.log("Profiles created.");

  // Create group
  const { data: existingGroups } = await supabase
    .from("coparenting_groups")
    .select("id")
    .eq("name", "Familia Kleber")
    .limit(1);

  let groupId;
  if (existingGroups && existingGroups.length > 0) {
    groupId = existingGroups[0].id;
    console.log("Group already exists:", groupId);
  } else {
    const { data: group, error: groupErr } = await supabase
      .from("coparenting_groups")
      .insert({ name: "Familia Kleber", created_by: brunoId })
      .select()
      .single();
    if (groupErr) {
      console.error("Error creating group:", groupErr);
      return;
    }
    groupId = group.id;
    console.log("Group created:", groupId);
  }

  // Add members (upsert to avoid duplicates)
  await supabase.from("group_members").upsert(
    [
      { group_id: groupId, user_id: brunoId, role: "admin" },
      { group_id: groupId, user_id: martinaId, role: "member" },
    ],
    { onConflict: "group_id,user_id" }
  );
  console.log("Members added to group.");

  // Add child Kleber
  const { data: existingChildren } = await supabase
    .from("children")
    .select("id")
    .eq("group_id", groupId)
    .eq("full_name", "Kleber Silva Oliveira")
    .limit(1);

  let childId;
  if (existingChildren && existingChildren.length > 0) {
    childId = existingChildren[0].id;
    console.log("Child already exists:", childId);
  } else {
    const { data: child, error: childErr } = await supabase
      .from("children")
      .insert({
        group_id: groupId,
        full_name: "Kleber Silva Oliveira",
        birth_date: "2020-06-15",
      })
      .select()
      .single();
    if (childErr) {
      console.error("Error creating child:", childErr);
      return;
    }
    childId = child.id;
    console.log("Child Kleber created:", childId);
  }

  // Add sample custody events
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextWeek2 = new Date(today);
  nextWeek2.setDate(today.getDate() + 14);

  await supabase.from("custody_events").insert([
    {
      group_id: groupId,
      child_id: childId,
      responsible_user_id: brunoId,
      start_date: today.toISOString().split("T")[0],
      end_date: nextWeek.toISOString().split("T")[0],
      custody_type: "regular",
      notes: "Semana com o pai",
      created_by: brunoId,
    },
    {
      group_id: groupId,
      child_id: childId,
      responsible_user_id: martinaId,
      start_date: nextWeek.toISOString().split("T")[0],
      end_date: nextWeek2.toISOString().split("T")[0],
      custody_type: "regular",
      notes: "Semana com a mae",
      created_by: martinaId,
    },
  ]);
  console.log("Custody events created.");

  // Add sample expenses
  await supabase.from("expenses").insert([
    {
      group_id: groupId,
      child_id: childId,
      category: "education",
      description: "Mensalidade escola - Marco",
      amount: 1200.0,
      paid_by: brunoId,
      split_ratio: { default: 50 },
      status: "pending",
      expense_date: today.toISOString().split("T")[0],
    },
    {
      group_id: groupId,
      child_id: childId,
      category: "health",
      description: "Consulta pediatra",
      amount: 350.0,
      paid_by: martinaId,
      split_ratio: { default: 50 },
      status: "approved",
      expense_date: today.toISOString().split("T")[0],
    },
  ]);
  console.log("Sample expenses created.");

  // Add sample chat messages
  await supabase.from("chat_messages").insert([
    {
      group_id: groupId,
      sender_id: brunoId,
      text: "Oi Martina, o Kleber tem consulta no dentista quarta-feira as 14h. Voce pode levar?",
    },
    {
      group_id: groupId,
      sender_id: martinaId,
      text: "Oi Bruno! Posso sim, sem problema. Ele precisa levar algum documento?",
    },
    {
      group_id: groupId,
      sender_id: brunoId,
      text: "Sim, o cartao do plano de saude. Vou deixar na mochila dele.",
    },
    {
      group_id: groupId,
      sender_id: martinaId,
      text: "Perfeito, obrigada! Ah, a reuniao de pais na escola e dia 25. Vamos os dois?",
    },
    {
      group_id: groupId,
      sender_id: brunoId,
      text: "Sim, ja marquei na agenda. Podemos ir juntos se quiser, fica mais facil pro Kleber.",
    },
  ]);
  console.log("Sample chat messages created.");

  // Add sample agreement
  await supabase.from("agreements").insert([
    {
      group_id: groupId,
      created_by: martinaId,
      title: "Horario de sono do Kleber",
      description: "Kleber deve dormir ate as 21h em dias de escola, independente de estar na casa do pai ou da mae.",
      category: "routine",
      is_non_negotiable: true,
      status: "accepted",
    },
    {
      group_id: groupId,
      created_by: brunoId,
      title: "Limite de tela",
      description: "Maximo de 1 hora de tela por dia em dias de semana, 2 horas nos fins de semana.",
      category: "education",
      is_non_negotiable: false,
      status: "pending",
    },
  ]);
  console.log("Sample agreements created.");

  // Add sample school log
  await supabase.from("school_logs").insert([
    {
      group_id: groupId,
      child_id: childId,
      logged_by: martinaId,
      log_type: "grade",
      title: "Prova de matematica",
      description: "Kleber tirou 9.5 na prova de matematica! Muito orgulhosa.",
    },
    {
      group_id: groupId,
      child_id: childId,
      logged_by: brunoId,
      log_type: "meeting",
      title: "Reuniao de pais - 1o trimestre",
      description: "Professora elogiou o comportamento do Kleber. Disse que ele e muito participativo.",
    },
  ]);
  console.log("Sample school logs created.");

  console.log("\n========================================");
  console.log("  CONTAS DE TESTE CRIADAS COM SUCESSO!");
  console.log("========================================");
  console.log(`\n  Pai (Bruno):     bruno@2lares.test`);
  console.log(`  Mae (Martina):   martina@2lares.test`);
  console.log(`  Senha (ambos):   ${PASSWORD}`);
  console.log(`\n  Filho:           Kleber Silva Oliveira`);
  console.log(`  Grupo:           Familia Kleber`);
  console.log("========================================\n");
}

main().catch(console.error);
