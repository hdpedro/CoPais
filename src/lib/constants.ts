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
  { value: "education", label: "Educacao", icon: "🎓" },
  { value: "health", label: "Saude", icon: "🏥" },
  { value: "food", label: "Alimentacao", icon: "🍔" },
  { value: "clothing", label: "Roupas", icon: "👕" },
  { value: "transport", label: "Transporte", icon: "🚗" },
  { value: "leisure", label: "Lazer", icon: "⚽" },
  { value: "housing", label: "Moradia", icon: "🏠" },
  { value: "subscription", label: "Assinatura Kindar", icon: "💛" },
  { value: "other", label: "Outros", icon: "📦" },
] as const;

export const USER_ROLES = [
  { value: "parent", label: "Pai/Mae" },
  { value: "grandparent", label: "Avo/Avo" },
  { value: "caregiver", label: "Outro cuidador" },
  { value: "mediator", label: "Mediador" },
  { value: "lawyer", label: "Advogado" },
] as const;

export const PARENT_COLORS = {
  primary: "#5B9E85",   // Lar A (criador) = Sage
  secondary: "#D4735A", // Lar B (convidado) = Terracota
} as const;

export const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"] as const;

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export const CUSTODY_TYPE_LABELS: Record<string, string> = {
  regular: "Regular",
  holiday: "Feriado",
  swap: "Troca",
  vacation: "Ferias",
  special: "Especial",
};

export const CHECKIN_CATEGORIES = [
  { value: "screen_time", label: "Tempo de Tela", icon: "📱" },
  { value: "food", label: "Alimentacao", icon: "🍽️" },
  { value: "sleep", label: "Sono", icon: "😴" },
  { value: "mood", label: "Humor", icon: "😊" },
  { value: "health", label: "Saude", icon: "🏥" },
  { value: "activity", label: "Atividade", icon: "⚽" },
  { value: "school", label: "Escola", icon: "🎒" },
  { value: "other", label: "Outro", icon: "📝" },
] as const;

export const SETTLEMENT_METHODS = [
  { value: "pix", label: "PIX", icon: "💸" },
  { value: "cash", label: "Dinheiro", icon: "💵" },
  { value: "transfer", label: "Transferencia", icon: "🏦" },
  { value: "other", label: "Outro", icon: "📝" },
] as const;

export const ACTIVITY_CATEGORIES = [
  { value: "sport", label: "Esporte", icon: "⚽" },
  { value: "health", label: "Saude", icon: "🏥" },
  { value: "school", label: "Escola", icon: "🎒" },
  { value: "art", label: "Arte", icon: "🎨" },
  { value: "music", label: "Musica", icon: "🎵" },
  { value: "therapy", label: "Terapia", icon: "🧠" },
  { value: "course", label: "Curso", icon: "📚" },
  { value: "evento", label: "Evento", icon: "🎉" },
  { value: "guarda", label: "Guarda", icon: "🔄" },
  { value: "other", label: "Outro", icon: "📋" },
] as const;

export const NOTE_CATEGORIES = [
  { value: "lembrete", label: "Lembrete", icon: "📌" },
  { value: "observacao", label: "Observacao", icon: "👁️" },
  { value: "preparacao", label: "Preparacao", icon: "📋" },
  { value: "juridico", label: "Juridico", icon: "⚖️" },
  { value: "outro", label: "Outro", icon: "📝" },
] as const;

export const DECISION_CATEGORIES = [
  { value: "escola", label: "Escola", icon: "🎒" },
  { value: "saude", label: "Saude", icon: "🏥" },
  { value: "atividade", label: "Atividade", icon: "⚽" },
  { value: "viagem", label: "Viagem", icon: "✈️" },
  { value: "financeiro", label: "Financeiro", icon: "💰" },
  { value: "moradia", label: "Moradia", icon: "🏠" },
  { value: "outro", label: "Outro", icon: "📋" },
] as const;

export const DEFAULT_CHECKLIST_ITEMS: Record<string, string[]> = {
  sport: ["Uniforme", "Tenis/Chuteira", "Meia", "Garrafinha de agua", "Toalha", "Protetor solar"],
  health: ["Carteirinha do plano", "Documentos", "Exames anteriores"],
  school: ["Mochila", "Material escolar", "Lanche", "Garrafinha de agua"],
  art: ["Materiais de arte", "Avental", "Toalha"],
  music: ["Instrumento", "Partituras", "Caderno de musica"],
  therapy: ["Caderno de anotacoes"],
  other: [],
};

/**
 * Returns a display-friendly name from full_name.
 * If full_name looks like an email, extracts the part before '@' and capitalizes it.
 * Returns first name only when firstOnly is true.
 */
export function getDisplayName(fullName: string | null | undefined, firstOnly = false): string {
  if (!fullName) return "Usuario";
  let name = fullName;
  // If looks like email, extract before @
  if (name.includes("@")) {
    name = name.split("@")[0]
      .replace(/[._-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return firstOnly ? name.split(" ")[0] : name;
}
