import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { NOTE_CATEGORIES } from "@/lib/constants";
import NotasClient from "./NotasClient";

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const filterCategory = (params.category as string) || "todas";
  const editId = params.edit as string | undefined;
  const deleteId = params.deleteConfirm as string | undefined;
  const errorMsg = params.error as string | undefined;
  const successMsg = params.success as string | undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId } = activeGroup;

  const { data: children, error: childrenError } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  if (childrenError) console.error("Children query error:", childrenError);

  // Query notes WITHOUT FK join (avoids PostgREST schema cache issues)
  let query = supabase
    .from("private_notes")
    .select("*")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .order("updated_at", { ascending: false });

  if (filterCategory !== "todas") {
    query = query.eq("category", filterCategory);
  }

  const { data: rawNotes, error: notesError } = await query;
  if (notesError) console.error("Notes query error:", notesError);

  // Manually resolve child names
  const childMap = new Map((children || []).map(c => [c.id, c.full_name]));
  const notes = (rawNotes || []).map(note => ({
    ...note,
    child_name: note.child_id ? childMap.get(note.child_id) || null : null,
  }));

  const editNote = editId ? notes?.find((n) => n.id === editId) || null : null;
  const deleteConfirmNote = deleteId ? notes?.find((n) => n.id === deleteId) || null : null;

  return (
    <NotasClient
      notes={notes}
      children={children || []}
      groupId={groupId}
      filterCategory={filterCategory}
      editNote={editNote}
      deleteConfirmNote={deleteConfirmNote}
      errorMsg={errorMsg}
      successMsg={successMsg}
      noteCategories={NOTE_CATEGORIES as unknown as Array<{ value: string; label: string; icon: string }>}
    />
  );
}
