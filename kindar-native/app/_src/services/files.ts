/**
 * Native helper pra baixar/abrir arquivos via stream proxy autenticado
 * (`/api/files/[id]?type=...`). Substitui o uso direto de signed URLs
 * em `Linking.openURL` — agora cada download passa por rate-limit e
 * audit no backend.
 *
 * Fluxo:
 *   1. Pega Bearer da sessão Supabase ativa.
 *   2. Pede nonce em /api/files/nonce (cache em memória até 30s antes do exp).
 *   3. fetch /api/files/[id]?type=... com headers Bearer + X-Kindar-Client + nonce.
 *   4. Salva o blob em FileSystem.documentDirectory.
 *   5. Abre via expo-sharing (preferido — UI nativa) ou fallback Linking.
 *
 * Em 429 retorna ok=false pra UI mostrar mensagem; NÃO cai pra signed URL
 * antiga (seria bypass do rate-limit).
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const CLIENT_HEADER =
  Platform.OS === 'ios' ? 'native-ios@1.0' : 'native-android@1.0';

export type FileType = 'document' | 'receipt';

let cachedNonce: { token: string; expiresAt: number } | null = null;

async function getBearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function getNonce(bearer: string): Promise<string | null> {
  if (cachedNonce && cachedNonce.expiresAt > Date.now() + 30_000) {
    return cachedNonce.token;
  }
  try {
    const res = await fetch(`${WEB_URL}/api/files/nonce`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'X-Kindar-Client': CLIENT_HEADER,
      },
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
  /** Path local quando ok=true. */
  localUri?: string;
  filename?: string;
  status?: number;
  error?: string;
}

function inferExtension(mimeType: string | null, filename: string | null): string {
  if (filename) {
    const dot = filename.lastIndexOf('.');
    if (dot > -1) return filename.slice(dot);
  }
  if (!mimeType) return '';
  if (mimeType.includes('pdf')) return '.pdf';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  return '';
}

function safeBaseName(name: string | undefined): string {
  if (!name) return `file-${Date.now()}`;
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

async function downloadToCache(
  id: string,
  type: FileType,
): Promise<FileFetchResult> {
  const bearer = await getBearer();
  if (!bearer) {
    return { ok: false, status: 401, error: 'Sessão expirada.' };
  }

  const nonce = await getNonce(bearer);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${bearer}`,
    'X-Kindar-Client': CLIENT_HEADER,
  };
  if (nonce) headers['X-Files-Nonce'] = nonce;

  const url = `${WEB_URL}/api/files/${encodeURIComponent(id)}?type=${type}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 401) cachedNonce = null;
      let error = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) error = j.error;
      } catch {
        // não-JSON
      }
      return { ok: false, status: res.status, error };
    }

    const mimeType = res.headers.get('Content-Type');
    const dispo = res.headers.get('Content-Disposition') ?? '';
    const match = dispo.match(/filename="?([^"]+)"?/i);
    const rawName = match ? match[1] : null;
    const ext = inferExtension(mimeType, rawName);
    const baseName = safeBaseName(rawName ?? `${type}-${id}`);
    const filename = baseName.endsWith(ext) ? baseName : `${baseName}${ext}`;

    const arrayBuffer = await res.arrayBuffer();
    const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!dir) {
      return { ok: false, error: 'FileSystem indisponível.' };
    }
    const localUri = `${dir}${filename}`;

    // expo-file-system v19+ usa writeAsync com base64 ou ArrayBuffer
    const base64 = arrayBufferToBase64(arrayBuffer);
    await FileSystem.writeAsStringAsync(localUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return { ok: true, localUri, filename };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'fetch_failed' };
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  // RN tem `btoa` global em runtime moderno; cai pro Buffer caso contrário.
  if (typeof btoa === 'function') return btoa(binary);
  // @ts-expect-error Buffer existe em RN via polyfill
  return Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Baixa o arquivo e oferece compartilhar / abrir (UI nativa). Use no botão
 * "ver/abrir" em telas de documento/recibo.
 */
export async function openFileNative(
  id: string,
  type: FileType,
): Promise<FileFetchResult> {
  const result = await downloadToCache(id, type);
  if (!result.ok || !result.localUri) return result;

  try {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(result.localUri);
    } else {
      // Fallback: abre via Linking pro file:// URI (iOS pode não aceitar)
      const opened = await Linking.canOpenURL(result.localUri);
      if (opened) await Linking.openURL(result.localUri);
      else return { ok: false, error: 'Não foi possível abrir.', status: 0 };
    }
    return result;
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'open_failed' };
  }
}

/** Pra casos onde o caller só precisa do path local (ex: pré-visualização). */
export async function downloadFileNative(
  id: string,
  type: FileType,
): Promise<FileFetchResult> {
  return downloadToCache(id, type);
}
