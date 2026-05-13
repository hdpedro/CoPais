/**
 * Helpers puros do wizard nativo.
 *
 * Nenhuma dependência de React/RN — toda computação é determinística e
 * segura pra render. Inclui utilidades específicas do native que o PWA
 * não precisa (parser DD/MM/AAAA + `withTimeout`).
 */

import type { ChildSex, Translate } from './types';

/** ISO YYYY-MM-DD → BR DD/MM/YYYY sem alocar Date. */
export function brFromIso(iso: string): string {
  return iso.split('-').reverse().join('/');
}

/**
 * BR DD/MM/AAAA → ISO YYYY-MM-DD. Retorna `null` se inválido (formato,
 * mês/dia fora do calendário ou data futura).
 */
export function isoFromBR(value: string): string | null {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(+y, +mo - 1, +d);
  if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null;
  if (dt > new Date()) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * Mask DD/MM/AAAA aplicada incrementalmente em um TextInput numérico.
 * Aceita só dígitos, descarta o resto e insere as barras conforme o
 * usuário digita. Usada no `onChangeText` do form de criança.
 */
export function applyBirthDateMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Idade humanizada usando o `t` do i18n nativo (sintaxe `{{count}}`). */
export function ageLabel(iso: string, t: Translate): string {
  const birth = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12
    + (now.getMonth() - birth.getMonth())
    - (now.getDate() < birth.getDate() ? 1 : 0);
  if (months < 1) return t('onboardingForm.ageNewborn');
  if (months < 12) {
    return months === 1
      ? t('onboardingForm.ageMonthOne')
      : t('onboardingForm.ageMonths', { count: months });
  }
  const years = Math.floor(months / 12);
  return years === 1
    ? t('onboardingForm.ageYearOne')
    : t('onboardingForm.ageYears', { count: years });
}

/** Avatar emoji derivado do sexo. `null` cai num neutro 🧒. */
export function avatarEmoji(sex: ChildSex): string {
  if (sex === 'F') return '👧';
  if (sex === 'M') return '👦';
  return '🧒';
}

/**
 * Promise.race com timeout. Usado pra impedir que o auto-accept-invitation
 * prenda o usuário em loading inicial quando a rede está lenta — 3s
 * de espera no máximo, depois cai pro form manual.
 *
 * O `Promise` rejeita em vez de resolver pra que o caller use `try/catch`
 * existente sem ramo extra.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}
