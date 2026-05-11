/**
 * Client-side helper pra abrir/baixar arquivos via `/api/files/[id]`.
 *
 * Faz fetch autenticado com headers obrigatórios (X-Kindar-Client, nonce
 * quando `FILES_NONCE_REQUIRED`), constrói um blob URL e abre/baixa.
 *
 * Pra renderização inline (img/iframe) o melhor caminho é signed URL
 * server-side com TTL curto — browser não permite custom headers em src=.
 * Use `getSignedFileUrl` server-side pra esses casos.
 */

const CLIENT_HEADER = "web-pwa@1.0";

// Cache de nonce em memória — reusa enquanto válido (< 5min).
// Browser foreground only; se a sessão pausar e voltar a aba, nonce expira
// natural e renovamos no próximo download.
let cachedNonce: { token: string; expiresAt: number } | null = null;

async function getNonce(): Promise<string | null> {
  if (cachedNonce && cachedNonce.expiresAt > Date.now() + 30_000) {
    // Reusa se faltam > 30s; senão renova preventivamente.
    return cachedNonce.token;
  }
  try {
    const res = await fetch("/api/files/nonce", {
      method: "POST",
      headers: { "X-Kindar-Client": CLIENT_HEADER },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token: string; expiresAt: string };
    cachedNonce = { token: data.token, expiresAt: Date.parse(data.expiresAt) };
    return data.token;
  } catch {
    return null;
  }
}

export interface FileFetchResult {
  ok: boolean;
  blobUrl?: string;
  filename?: string;
  mimeType?: string;
  /** Quando ok=false, código HTTP retornado (429, 410, 503, etc.). */
  status?: number;
  error?: string;
}

export type FileType = "document" | "receipt";

async function fetchFile(id: string, type: FileType): Promise<FileFetchResult> {
  const nonce = await getNonce();
  const headers: HeadersInit = { "X-Kindar-Client": CLIENT_HEADER };
  if (nonce) headers["X-Files-Nonce"] = nonce;

  const url = `/api/files/${encodeURIComponent(id)}?type=${type}`;
  try {
    const res = await fetch(url, { headers });

    if (!res.ok) {
      // Invalida nonce em caso de 401 (pode ter sido consumido).
      if (res.status === 401) cachedNonce = null;
      let error = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) error = j.error;
      } catch {
        // não-JSON, mantém genérico
      }
      return { ok: false, status: res.status, error };
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    // Tenta extrair filename do Content-Disposition.
    let filename = "file";
    const dispo = res.headers.get("Content-Disposition") ?? "";
    const match = dispo.match(/filename="?([^"]+)"?/i);
    if (match) filename = match[1];

    return {
      ok: true,
      blobUrl,
      filename,
      mimeType: res.headers.get("Content-Type") ?? undefined,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "fetch_failed" };
  }
}

/**
 * Faz download disparando "save as" no browser. Retorna ok=false em caso de
 * erro (429, 403, 410) pra UI mostrar mensagem.
 */
export async function downloadFile(id: string, type: FileType): Promise<FileFetchResult> {
  const result = await fetchFile(id, type);
  if (!result.ok || !result.blobUrl) return result;

  const a = document.createElement("a");
  a.href = result.blobUrl;
  a.download = result.filename ?? "file";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Libera memória depois de um tempo (browser pode ainda estar lendo).
  setTimeout(() => {
    if (result.blobUrl) URL.revokeObjectURL(result.blobUrl);
  }, 30_000);

  return result;
}

/**
 * Abre em nova aba/janela. Útil pra PDF que o browser renderiza inline.
 */
export async function openFile(id: string, type: FileType): Promise<FileFetchResult> {
  const result = await fetchFile(id, type);
  if (!result.ok || !result.blobUrl) return result;

  const win = window.open(result.blobUrl, "_blank", "noopener,noreferrer");
  // Browser pode bloquear pop-up; nesse caso o caller deve cair pro download.
  if (!win) {
    return { ok: false, status: 0, error: "popup_blocked" };
  }

  setTimeout(() => {
    if (result.blobUrl) URL.revokeObjectURL(result.blobUrl);
  }, 60_000);

  return result;
}
