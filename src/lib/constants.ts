export const COLORS = {
  primary: "#0EA5A0",
  primaryLight: "#E6F7F7",
  primaryDark: "#0B8A86",
  secondary: "#FF6B5B",
  accent: "#FFB627",
  dark: "#1A3B3A",
  light: "#F8FFFE",
  success: "#4CAF50",
  warning: "#FFA500",
  error: "#E53935",
  muted: "#7A8C8B",
} as const;

export const EXPENSE_CATEGORIES = [
  { value: "education", label: "Educacao", icon: "🎓" },
  { value: "health", label: "Saude", icon: "🏥" },
  { value: "food", label: "Alimentacao", icon: "🍔" },
  { value: "clothing", label: "Roupas", icon: "👕" },
  { value: "transport", label: "Transporte", icon: "🚗" },
  { value: "leisure", label: "Lazer", icon: "⚽" },
  { value: "housing", label: "Moradia", icon: "🏠" },
  { value: "other", label: "Outros", icon: "📦" },
] as const;

export const USER_ROLES = [
  { value: "parent", label: "Pai/Mae" },
  { value: "grandparent", label: "Avo/Avo" },
  { value: "caregiver", label: "Outro cuidador" },
  { value: "mediator", label: "Mediador" },
  { value: "lawyer", label: "Advogado" },
] as const;
