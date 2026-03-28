import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getActiveGroup } from "@/lib/group-utils";
import { captureServerEvent } from "@/lib/posthog-server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessao expirada." }, { status: 401 });
  }

  const formData = await request.formData();
  const groupId = formData.get("groupId") as string;
  const childId = formData.get("childId") as string;
  const category = formData.get("category") as string;
  const name = formData.get("name") as string;
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Maximo 10MB." }, { status: 400 });
  }

  // Verify membership
  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup || activeGroup.groupId !== groupId) {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  // Verify child belongs to group
  if (childId) {
    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("group_id", groupId)
      .single();
    if (!child) {
      return NextResponse.json({ error: "Crianca nao pertence a este grupo." }, { status: 400 });
    }
  }

  // Use service role for storage
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const fileName = `${groupId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await adminClient.storage
    .from("documents")
    .upload(fileName, file);

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = adminClient.storage
    .from("documents")
    .getPublicUrl(fileName);

  const { error } = await supabase.from("documents").insert({
    group_id: groupId,
    child_id: childId || null,
    category,
    name,
    file_url: urlData.publicUrl,
    file_size: file.size,
    mime_type: file.type,
    uploaded_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  captureServerEvent(user.id, "child_document_uploaded", { category });

  return NextResponse.json({ success: true });
}
