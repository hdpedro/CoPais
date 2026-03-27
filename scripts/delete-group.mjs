import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jquaysfeeuwvoydsgssi.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  // 1. Find the group "Teixeira Barata"
  const { data: groups, error: gErr } = await admin
    .from("coparenting_groups")
    .select("id, name")
    .ilike("name", "%Teixeira%Barata%");

  if (gErr) { console.error("Erro ao buscar grupo:", gErr); return; }
  if (!groups || groups.length === 0) {
    // Try broader search
    const { data: allGroups } = await admin.from("coparenting_groups").select("id, name");
    console.log("Grupo 'Teixeira Barata' nao encontrado. Grupos existentes:");
    allGroups?.forEach(g => console.log(`  - ${g.name} (${g.id})`));
    return;
  }

  for (const group of groups) {
    console.log(`\n=== Deletando grupo: ${group.name} (${group.id}) ===\n`);
    const groupId = group.id;

    // 2. Get all members of this group
    const { data: members } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    const memberUserIds = members?.map(m => m.user_id) || [];
    console.log(`Membros encontrados: ${memberUserIds.length}`);

    // 3. Delete all related data (order matters for FK constraints)
    const tables = [
      { name: "daily_checkins", filter: "group_id" },
      { name: "health_logs", filter: "group_id" },
      { name: "school_logs", filter: "group_id" },
      { name: "chat_messages", filter: "group_id" },
      { name: "expenses", filter: "group_id" },
      { name: "swap_requests", filter: "group_id" },
      { name: "custody_events", filter: "group_id" },
      { name: "agreements", filter: "group_id" },
      { name: "documents", filter: "group_id" },
      { name: "sensitive_topics", filter: "group_id" },
      { name: "children", filter: "group_id" },
      { name: "invitations", filter: "group_id" },
      { name: "calendar_tokens", filter: "group_id" },
      { name: "group_members", filter: "group_id" },
    ];

    for (const t of tables) {
      const { error, count } = await admin
        .from(t.name)
        .delete({ count: "exact" })
        .eq(t.filter, groupId);

      if (error) {
        console.log(`  ${t.name}: ERRO - ${error.message}`);
      } else {
        console.log(`  ${t.name}: ${count || 0} registros deletados`);
      }
    }

    // 4. Delete the group itself
    const { error: delGroupErr } = await admin
      .from("coparenting_groups")
      .delete()
      .eq("id", groupId);

    if (delGroupErr) {
      console.log(`  coparenting_groups: ERRO - ${delGroupErr.message}`);
    } else {
      console.log(`  coparenting_groups: grupo deletado`);
    }

    // 5. For each member, check if they belong to other groups
    // If not, delete their auth user and profile
    console.log(`\n--- Verificando usuarios para remocao ---`);
    for (const userId of memberUserIds) {
      const { data: otherMemberships } = await admin
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

      if (!otherMemberships || otherMemberships.length === 0) {
        // User has no other groups - delete profile and auth user
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .single();

        // Delete profile
        const { error: profErr } = await admin
          .from("profiles")
          .delete()
          .eq("id", userId);

        // Delete auth user
        const { error: authErr } = await admin.auth.admin.deleteUser(userId);

        if (profErr || authErr) {
          console.log(`  ${profile?.full_name || userId}: ERRO profile=${profErr?.message} auth=${authErr?.message}`);
        } else {
          console.log(`  ${profile?.full_name} (${profile?.email}): REMOVIDO completamente`);
        }
      } else {
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .single();
        console.log(`  ${profile?.full_name || userId}: mantido (pertence a ${otherMemberships.length} outro(s) grupo(s))`);
      }
    }
  }

  console.log("\n=== Concluido ===");
}

main().catch(console.error);
