-- ============================================================
-- Migration 062: Lockdown storage buckets (receipts + documents)
-- ============================================================
--
-- ⚠️  BLAST RADIUS — READ BEFORE APPLYING ⚠️
--
-- Antes desta migration, os buckets `receipts` e `documents` eram
-- `public: true` com policy "Public read access" sem filtro. Resultado:
-- qualquer URL vazada (Slack, screenshot, log indexado pelo Google)
-- dava acesso permanente ao arquivo.
--
-- Esta migration:
--   1. Setа os buckets para `public: false` — URLs `/object/public/...`
--      antigas DEIXAM DE FUNCIONAR.
--   2. Cria policies de SELECT/INSERT/UPDATE/DELETE em storage.objects
--      que exigem o usuário ser membro do grupo dono do arquivo. O grupo
--      é o primeiro folder do path (`{group_id}/...`), convenção que o
--      código já segue (`src/actions/documents.ts:55`,
--      `src/actions/expenses.ts:51`).
--   3. Remove as policies "public read access" antigas.
--
-- PRÉ-REQUISITO ANTES DE APLICAR EM PRODUÇÃO:
--   - [ ] Atualizar TODOS os reads de `documents.file_url` e
--         `expenses.receipt_url` para gerar signed URLs em runtime via
--         `supabase.storage.from(bucket).createSignedUrl(path, 3600)`.
--         Helper: `src/lib/storage-signed-url.ts` (TODO).
--   - [ ] Atualizar UI nativa (`kindar-native`) com helper equivalente.
--   - [ ] Migrar `documents.file_url` e `expenses.receipt_url` de URL
--         absoluta (kindar.com.br/storage/v1/...) para path relativo
--         (`{group_id}/{timestamp}-...`). Script de backfill no fim.
--   - [ ] Smoke test em ambiente de staging com 1 receipt + 1 doc.
--
-- Apply só depois desses 4 itens. Caso contrário, todos os comprovantes
-- e documentos do app ficam quebrados (404) até reimplementação.
-- ============================================================

-- 1. Drop old "public read" policies
DROP POLICY IF EXISTS "Public read access to receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;

-- 2. Lock down buckets — no more public reads.
-- Existing URLs at /storage/v1/object/public/{bucket}/* will return 404
-- after this; clients MUST switch to createSignedUrl().
UPDATE storage.buckets SET public = false WHERE id IN ('receipts', 'documents');

-- 3. Group-membership-aware policies for both buckets.
-- The `name` column stores the path (e.g. "6626786b-.../1737295123-receipt.jpg").
-- (storage.foldername(name))[1] returns the first folder = group_id.

CREATE POLICY "members_can_read_their_group_receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT group_id::text FROM public.group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "members_can_upload_their_group_receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT group_id::text FROM public.group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "owners_can_update_their_group_receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT group_id::text FROM public.group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "owners_can_delete_their_group_receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND owner = auth.uid()
);

CREATE POLICY "members_can_read_their_group_documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT group_id::text FROM public.group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "members_can_upload_their_group_documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT group_id::text FROM public.group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "owners_can_update_their_group_documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT group_id::text FROM public.group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "owners_can_delete_their_group_documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND owner = auth.uid()
);

-- 4. Backfill: trim absolute public URLs in documents.file_url and
-- expenses.receipt_url back to path-only ("{group_id}/{name}"). Done in a
-- single sweep so future reads can call createSignedUrl(path) directly.
--
-- Pattern stored: "https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>"
-- We extract everything after "/<bucket>/".

UPDATE public.documents
SET file_url = regexp_replace(
  file_url,
  '^https?://[^/]+/storage/v1/object/public/documents/',
  ''
)
WHERE file_url LIKE 'http%/storage/v1/object/public/documents/%';

UPDATE public.expenses
SET receipt_url = regexp_replace(
  receipt_url,
  '^https?://[^/]+/storage/v1/object/public/receipts/',
  ''
)
WHERE receipt_url LIKE 'http%/storage/v1/object/public/receipts/%';

-- After this migration:
--   - Reads MUST go through createSignedUrl(path, ttlSec) — direct GETs return 404.
--   - file_url / receipt_url store only the path (no scheme/host/bucket prefix).
--   - storage.objects RLS scoped to group membership = no cross-group leakage.
