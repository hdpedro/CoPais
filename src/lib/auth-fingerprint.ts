import { createHash } from "node:crypto";
import "server-only";

/**
 * Device fingerprint pra alerta de "novo dispositivo".
 *
 * Fingerprint = SHA-256 do User-Agent normalizado + faixa /24 do IP.
 *
 * Por que /24 e não IP completo:
 *   - IP residencial muda (DHCP, troca de operadora, mobile vs wifi).
 *     Mesma família, mesmo device → IP diferente em poucos dias → spam de alerta.
 *   - /24 (primeiros 3 octets do IPv4 / 64 bits do IPv6) preserva detecção
 *     de "veio de país diferente" sem disparar em troca rotineira de operadora.
 *   - Sacrifício aceitável de granularidade pra reduzir false-positives 10×.
 *
 * Por que UA normalizado:
 *   - Versão do browser/SO sobe → mesmo device. Normalizamos pra major version.
 *   - Linux/Mac upgrades não invalidam fingerprint.
 *
 * Hash é estável entre versões da função até mudarmos `FINGERPRINT_VERSION`.
 * Quando mudar, todos os devices conhecidos viram "novos" e disparam alerta —
 * só faça isso se realmente quiser re-baseline (raro).
 */
const FINGERPRINT_VERSION = "v1";

export interface DeviceFingerprint {
  hash: string;
  uaNormalized: string;
  ipBucket: string;
  /** Human-friendly device label: "iPhone · Safari", "Windows · Chrome" */
  deviceLabel: string;
}

export function computeFingerprint(rawUa: string | null, rawIp: string | null): DeviceFingerprint {
  const uaNormalized = normalizeUa(rawUa);
  const ipBucket = bucketIp(rawIp);
  const hash = createHash("sha256")
    .update(`${FINGERPRINT_VERSION}|${uaNormalized}|${ipBucket}`)
    .digest("hex")
    .slice(0, 32);
  const deviceLabel = labelFromUa(rawUa);
  return { hash, uaNormalized, ipBucket, deviceLabel };
}

function normalizeUa(ua: string | null): string {
  if (!ua) return "unknown";
  // Strip patch versions, keep major. "Chrome/119.0.6045.123" → "Chrome/119"
  return ua
    .replace(/(\b[A-Za-z]+\/\d+)\.\d+(?:\.\d+)*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function bucketIp(ip: string | null): string {
  if (!ip) return "unknown";
  // IPv6 → 64-bit prefix
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + "::/64";
  }
  // IPv4 → /24
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return ip;
}

/**
 * Extrai um label humano: "iPhone · Safari", "Windows · Chrome", "Android · Firefox".
 * Best-effort; fallback "Dispositivo desconhecido".
 */
function labelFromUa(ua: string | null): string {
  if (!ua) return "Dispositivo desconhecido";

  // Platform
  let platform = "Desconhecido";
  if (/iPhone|iPad|iOS/i.test(ua)) platform = "iPhone/iPad";
  else if (/Android/i.test(ua)) platform = "Android";
  else if (/Macintosh|Mac OS/i.test(ua)) platform = "Mac";
  else if (/Windows/i.test(ua)) platform = "Windows";
  else if (/Linux/i.test(ua)) platform = "Linux";

  // Browser
  let browser = "navegador";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Kindar\//i.test(ua)) browser = "App Kindar";

  return `${platform} · ${browser}`;
}

/**
 * Extrai IP da request (Vercel/Cloudflare/proxy chain).
 * Ordem: `x-vercel-forwarded-for` → `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for[0]`.
 */
export function ipFromHeaders(h: Headers): string | null {
  const candidates = [
    h.get("x-vercel-forwarded-for"),
    h.get("cf-connecting-ip"),
    h.get("x-real-ip"),
    h.get("x-forwarded-for")?.split(",")[0]?.trim(),
  ];
  for (const c of candidates) {
    if (c && c.length > 0) return c;
  }
  return null;
}

/**
 * Extrai country/city via headers Vercel/Cloudflare (geolocalização auto).
 * Headers padrão Vercel Edge: `x-vercel-ip-country`, `x-vercel-ip-city`.
 * Headers padrão Cloudflare: `cf-ipcountry`.
 */
export function geoFromHeaders(h: Headers): { country: string | null; city: string | null } {
  const country = h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null;
  const cityRaw = h.get("x-vercel-ip-city");
  // Vercel URL-encodes the city ("S%C3%A3o%20Paulo" → "São Paulo")
  let city: string | null = null;
  if (cityRaw) {
    try { city = decodeURIComponent(cityRaw); } catch { city = cityRaw; }
  }
  return { country, city };
}

/**
 * "São Paulo, BR" se city presente; senão "BR"; senão "Localização desconhecida".
 */
export function locationLabel(country: string | null, city: string | null): string {
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  return "Localização desconhecida";
}
