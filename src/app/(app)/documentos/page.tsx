import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getSignedFileUrl } from "@/lib/storage-signed-url";
import DocumentsDashboard from "./DocumentsDashboard";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  // Fetch children and ALL documents in parallel
  const [{ data: children }, { data: documents }] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name, birth_date")
      .eq("group_id", groupId)
      .order("created_at"),
    supabase
      .from("documents")
      .select("id, name, category, file_url, mime_type, created_at, child_id")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false }),
  ]);

  // Sign all file URLs server-side. After migration 062, file_url is path-only
  // and the bucket is private — direct GETs return 404. We sign with a 1-hour
  // TTL which covers a normal session; if the user hangs around longer, the
  // page will be re-rendered (Next.js server components are not long-lived).
  const signedDocs = await Promise.all(
    (documents || []).map(async (doc) => ({
      id: doc.id,
      name: doc.name,
      category: doc.category,
      file_url: (await getSignedFileUrl(supabase, "documents", doc.file_url)) || doc.file_url,
      mime_type: doc.mime_type,
      created_at: doc.created_at,
      child_id: doc.child_id,
    })),
  );

  // Group documents by child
  const childDocs: Record<string, Array<{ id: string; name: string; category: string; file_url: string; mime_type: string | null; created_at: string }>> = {};
  const generalDocs: Array<{ id: string; name: string; category: string; file_url: string; mime_type: string | null; created_at: string }> = [];

  for (const doc of signedDocs) {
    const d = { id: doc.id, name: doc.name, category: doc.category, file_url: doc.file_url, mime_type: doc.mime_type, created_at: doc.created_at };
    if (doc.child_id) {
      if (!childDocs[doc.child_id]) childDocs[doc.child_id] = [];
      childDocs[doc.child_id].push(d);
    } else {
      generalDocs.push(d);
    }
  }

  // Define expected document types per child
  const expectedTypes = ["personal", "health", "education", "legal"];

  const childrenWithDocs = (children || []).map((child) => {
    const docs = childDocs[child.id] || [];
    const categoriesPresent = new Set(docs.map((d) => d.category));
    const missing = expectedTypes.filter((t) => !categoriesPresent.has(t));
    return {
      id: child.id,
      name: child.full_name?.split(" ")[0] || "?",
      fullName: child.full_name || "?",
      docsCount: docs.length,
      docs,
      missingCategories: missing,
      completeness: Math.round(((expectedTypes.length - missing.length) / expectedTypes.length) * 100),
    };
  });

  return (
    <DocumentsDashboard
      childrenWithDocs={childrenWithDocs}
      generalDocs={generalDocs}
      isReadonly={isReadonly}
    />
  );
}
