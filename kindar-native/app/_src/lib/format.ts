/**
 * Strip a leading "CRM"/"CRO" prefix (with optional separator) from a
 * medical registration string so the UI can re-add a uniform "CRM " label
 * without producing "CRM CRM 12345/SP" when the user typed the prefix
 * themselves.
 */
export function formatCRM(crm: string | null | undefined): string {
  if (!crm) return '';
  return crm.replace(/^\s*(CRM|CRO)[\s:]*/i, '').trim();
}

/**
 * Máscara de input de CRM/CRO no formato número + UF (ex: "123456/SP").
 * Aplicada a cada tecla pra impedir texto-lixo (bug device dono 14/jun: o campo
 * aceitava "lehdhauahddn"). Reordena dígitos → número (até 7) e letras → UF
 * (2, maiúsculas), independente da ordem digitada. Vazio/só-letras degrada
 * graciosamente (sem barra solta). Cobre CRM (médicos) e CRO (dentistas).
 */
export function maskCRM(input: string | null | undefined): string {
  if (!input) return '';
  const cleaned = input.replace(/[^0-9a-zA-Z]/g, '');
  const digits = cleaned.replace(/\D/g, '').slice(0, 7);
  const uf = cleaned.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
  if (digits && uf) return `${digits}/${uf}`;
  return digits || uf;
}
