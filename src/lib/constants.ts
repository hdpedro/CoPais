export const COLORS = {
  primary: "#5B9E85",
  primaryLight: "#EDF5F1",
  primaryDark: "#4A8A72",
  secondary: "#D4735A",
  accent: "#E8A228",
  dark: "#2C2C2C",
  light: "#EEECEA",
  success: "#4CAF50",
  warning: "#E8A228",
  error: "#E53935",
  muted: "#8A8A8A",
  violet: "#7C6FAE",
} as const;

export const EXPENSE_CATEGORIES = [
  { value: "education", label: "Educação", icon: "🎓" },
  { value: "health", label: "Saúde", icon: "🏥" },
  { value: "food", label: "Alimentação", icon: "🍔" },
  { value: "clothing", label: "Roupas", icon: "👕" },
  { value: "transport", label: "Transporte", icon: "🚗" },
  { value: "leisure", label: "Lazer", icon: "⚽" },
  { value: "housing", label: "Moradia", icon: "🏠" },
  { value: "subscription", label: "Assinatura Kindar", icon: "💛" },
  { value: "other", label: "Outros", icon: "📦" },
] as const;

export const USER_ROLES = [
  { value: "parent", label: "Pai/Mãe" },
  { value: "grandparent", label: "Avô/Avó" },
  { value: "caregiver", label: "Outro cuidador" },
  { value: "mediator", label: "Mediador" },
  { value: "lawyer", label: "Advogado" },
] as const;

export const PARENT_COLORS = {
  primary: "#5B9E85",   // Lar A (criador) = Sage
  secondary: "#D4735A", // Lar B (convidado) = Terracota
} as const;

export const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export const CUSTODY_TYPE_LABELS: Record<string, string> = {
  regular: "Regular",
  holiday: "Feriado",
  swap: "Troca",
  vacation: "Férias",
  special: "Especial",
};

export const CHECKIN_CATEGORIES = [
  { value: "screen_time", label: "Tempo de Tela", icon: "📱" },
  { value: "food", label: "Alimentação", icon: "🍽️" },
  { value: "sleep", label: "Sono", icon: "😴" },
  { value: "mood", label: "Humor", icon: "😊" },
  { value: "health", label: "Saúde", icon: "🏥" },
  { value: "activity", label: "Atividade", icon: "⚽" },
  { value: "school", label: "Escola", icon: "🎒" },
  { value: "other", label: "Outro", icon: "📝" },
] as const;

export const SETTLEMENT_METHODS = [
  { value: "pix", label: "PIX", icon: "💸" },
  { value: "cash", label: "Dinheiro", icon: "💵" },
  { value: "transfer", label: "Transferência", icon: "🏦" },
  { value: "other", label: "Outro", icon: "📝" },
] as const;

export const ACTIVITY_CATEGORIES = [
  { value: "sport", label: "Esporte", icon: "⚽" },
  { value: "health", label: "Saúde", icon: "🏥" },
  { value: "school", label: "Escola", icon: "🎒" },
  { value: "art", label: "Arte", icon: "🎨" },
  { value: "music", label: "Música", icon: "🎵" },
  { value: "therapy", label: "Terapia", icon: "🧠" },
  { value: "course", label: "Curso", icon: "📚" },
  { value: "evento", label: "Evento", icon: "🎉" },
  { value: "guarda", label: "Guarda", icon: "🔄" },
  { value: "other", label: "Outro", icon: "📋" },
] as const;

export const NOTE_CATEGORIES = [
  { value: "lembrete", label: "Lembrete", icon: "📌" },
  { value: "observacao", label: "Observação", icon: "👁️" },
  { value: "preparacao", label: "Preparação", icon: "📋" },
  { value: "juridico", label: "Jurídico", icon: "⚖️" },
  { value: "outro", label: "Outro", icon: "📝" },
] as const;

export const DECISION_CATEGORIES = [
  { value: "escola", label: "Escola", icon: "🎒" },
  { value: "saude", label: "Saúde", icon: "🏥" },
  { value: "atividade", label: "Atividade", icon: "⚽" },
  { value: "viagem", label: "Viagem", icon: "✈️" },
  { value: "financeiro", label: "Financeiro", icon: "💰" },
  { value: "moradia", label: "Moradia", icon: "🏠" },
  { value: "outro", label: "Outro", icon: "📋" },
] as const;

export const DEFAULT_CHECKLIST_ITEMS: Record<string, string[]> = {
  sport: ["Uniforme", "Tênis/Chuteira", "Meia", "Garrafinha de água", "Toalha", "Protetor solar"],
  health: ["Carteirinha do plano", "Documentos", "Exames anteriores"],
  school: ["Mochila", "Material escolar", "Lanche", "Garrafinha de água"],
  art: ["Materiais de arte", "Avental", "Toalha"],
  music: ["Instrumento", "Partituras", "Caderno de música"],
  therapy: ["Caderno de anotações"],
  other: [],
};

/* ------------------------------------------------------------------ */
/*  Quick Actions catalog                                              */
/* ------------------------------------------------------------------ */

export interface QuickActionDef {
  id: string;
  href: string;
  color: string;
  labelKey: string;
  defaultLabel: string;
  svgInner: string; // SVG inner HTML — static app constant, safe for dangerouslySetInnerHTML
}

export const QUICK_ACTIONS_CATALOG: QuickActionDef[] = [
  {
    id: "nova-despesa",
    href: "/despesas/nova",
    color: "#D4735A",
    labelKey: "dashboard.newExpense",
    defaultLabel: "Nova Despesa",
    svgInner: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  },
  {
    id: "calendario",
    href: "/calendario",
    color: "#5B9E85",
    labelKey: "dashboard.agenda",
    defaultLabel: "Agenda",
    svgInner: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  },
  {
    id: "financeiro",
    href: "/financeiro",
    color: "#5B9E85",
    labelKey: "nav.sectionFinancial",
    defaultLabel: "Financeiro",
    svgInner: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  },
  {
    id: "saude",
    href: "/saude",
    color: "#EF4444",
    labelKey: "nav.health",
    defaultLabel: "Saúde",
    svgInner: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  },
  {
    id: "acordos",
    href: "/acordos",
    color: "#F59E0B",
    labelKey: "nav.agreements",
    defaultLabel: "Acordos",
    svgInner: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  },
  {
    id: "documentos",
    href: "/documentos",
    color: "#F59E0B",
    labelKey: "nav.documents",
    defaultLabel: "Documentos",
    svgInner: '<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>',
  },
  {
    id: "decisoes",
    href: "/decisoes",
    color: "#8B5CF6",
    labelKey: "nav.decisions",
    defaultLabel: "Decisões",
    svgInner: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  },
  {
    id: "notas",
    href: "/notas",
    color: "#3B82F6",
    labelKey: "nav.notes",
    defaultLabel: "Notas",
    svgInner: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="13" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
  },
  {
    id: "nova-atividade",
    href: "/atividades/nova",
    color: "#22C55E",
    labelKey: "activities.newActivity",
    defaultLabel: "Nova Atividade",
    svgInner: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  },
  {
    id: "novo-evento",
    href: "/calendario/novo",
    color: "#5B9E85",
    labelKey: "events.newEvent",
    defaultLabel: "Novo Evento",
    svgInner: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>',
  },
  {
    id: "nova-consulta",
    href: "/saude/consultas/nova",
    color: "#EF4444",
    labelKey: "health.newAppointment",
    defaultLabel: "Nova Consulta",
    svgInner: '<path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  },
  {
    id: "checkin",
    href: "/checkin",
    color: "#22C55E",
    labelKey: "nav.checkin",
    defaultLabel: "Check-in",
    svgInner: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  },
  {
    id: "semana",
    href: "/semana",
    color: "#3B82F6",
    labelKey: "dashboard.weeklyAnalysis",
    defaultLabel: "Análise Semanal",
    svgInner: '<path d="M21 15V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10"/><path d="M3 21h18"/><path d="M7 17l3-3 2 2 5-5"/>',
  },
  {
    id: "escola",
    href: "/escola",
    color: "#3B82F6",
    labelKey: "nav.school",
    defaultLabel: "Escola",
    svgInner: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  },
  {
    id: "criancas",
    href: "/criancas",
    color: "#D4735A",
    labelKey: "nav.children",
    defaultLabel: "Crianças",
    svgInner: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  },
];

export const DEFAULT_QUICK_ACTIONS = {
  primary: "nova-despesa",
  secondary: ["calendario", "financeiro", "saude", "acordos", "documentos", "decisoes"],
} as const;

/**
 * Retorna nome amigável a partir de qualquer string de nome (idealmente
 * `profiles.display_name`, que já vem normalizado do banco — migration 00081).
 *
 * Defensivo pra inputs problemáticos:
 *   - null/empty → "Usuário"
 *   - email "henrique.de.pedro@gmail.com" → "Henrique De Pedro"
 *   - já normalizado → retorna como está
 *
 * NUNCA retorna UUID, email cru nem string vazia.
 */
export function getDisplayName(name: string | null | undefined, firstOnly = false): string {
  if (!name || !name.trim()) return "Usuário";
  let normalized = name.trim();
  if (normalized.includes("@")) {
    normalized = normalized.split("@")[0]
      .replace(/[._-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return firstOnly ? normalized.split(" ")[0] : normalized;
}
