/**
 * Validação do header `X-Kindar-Client` que todo download/nonce request deve
 * enviar. Identifica origem do request (PWA web, native iOS/Android).
 *
 * Não é segurança real — qualquer atacante pode setar o header. Serve pra:
 *   1. Filtrar scraper genérico que não conhece a API.
 *   2. Granularidade no audit (qual cliente está originando o tráfego).
 *
 * Valores esperados (matchados case-insensitive):
 *   - web-pwa@<semver>
 *   - native-ios@<semver>
 *   - native-android@<semver>
 *
 * Outros formatos são rejeitados — força client a se declarar.
 */

const VALID_CLIENT_RE = /^(web-pwa|native-ios|native-android)@\d+\.\d+(\.\d+)?(-[\w.-]+)?$/i;

export interface ClientHeader {
  raw: string;
  platform: "web-pwa" | "native-ios" | "native-android";
  version: string;
}

export function parseClientHeader(value: string | null | undefined): ClientHeader | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!VALID_CLIENT_RE.test(trimmed)) return null;
  const [platform, version] = trimmed.split("@");
  return {
    raw: trimmed,
    platform: platform.toLowerCase() as ClientHeader["platform"],
    version,
  };
}

export function readClientHeader(request: Request): ClientHeader | null {
  return parseClientHeader(request.headers.get("x-kindar-client"));
}
