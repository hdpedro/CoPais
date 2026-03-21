// =============================================
// Health Module Constants
// =============================================

export const SPECIALTIES = [
  { value: "pediatra", label: "Pediatra" },
  { value: "dentista", label: "Dentista" },
  { value: "oftalmologista", label: "Oftalmologista" },
  { value: "otorrino", label: "Otorrinolaringologista" },
  { value: "dermatologista", label: "Dermatologista" },
  { value: "ortopedista", label: "Ortopedista" },
  { value: "neurologista", label: "Neurologista" },
  { value: "fonoaudiologo", label: "Fonoaudiólogo" },
  { value: "psicologo", label: "Psicólogo" },
  { value: "nutricionista", label: "Nutricionista" },
  { value: "fisioterapeuta", label: "Fisioterapeuta" },
  { value: "alergista", label: "Alergista" },
  { value: "outro", label: "Outro" },
];

export const ALLERGY_TYPES = [
  { value: "medication", label: "Medicamento", icon: "💊" },
  { value: "food", label: "Alimento", icon: "🍽️" },
  { value: "environmental", label: "Ambiental", icon: "🌿" },
  { value: "insect", label: "Inseto", icon: "🐝" },
  { value: "other", label: "Outro", icon: "📝" },
];

export const ALLERGY_SEVERITIES = [
  { value: "mild", label: "Leve", color: "bg-yellow-100 text-yellow-700" },
  { value: "moderate", label: "Moderada", color: "bg-amber-100 text-amber-700" },
  { value: "severe", label: "Grave", color: "bg-red-100 text-red-700" },
];

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const MEDICATION_FREQUENCIES = [
  { value: "4/4h", label: "4 em 4 horas", hours: 4 },
  { value: "6/6h", label: "6 em 6 horas", hours: 6 },
  { value: "8/8h", label: "8 em 8 horas", hours: 8 },
  { value: "12/12h", label: "12 em 12 horas", hours: 12 },
  { value: "1x/dia", label: "1 vez ao dia", hours: 24 },
  { value: "2x/dia", label: "2 vezes ao dia", hours: 12 },
  { value: "se necessario", label: "Se necessário (SOS)", hours: 0 },
];

export const APPOINTMENT_STATUSES: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Agendada", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Realizada", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelada", color: "bg-gray-100 text-gray-500" },
};

export const APPOINTMENT_TYPES = [
  { value: "rotina", label: "Rotina", icon: "🩺", desc: "Consulta periodica de acompanhamento", color: "bg-primary/10 text-primary border-primary/30" },
  { value: "emergencia", label: "Emergencia", icon: "🚨", desc: "Pronto-socorro, urgencia", color: "bg-red-50 text-red-600 border-red-200" },
  { value: "retorno", label: "Retorno", icon: "🔄", desc: "Retorno de consulta anterior", color: "bg-amber-50 text-amber-600 border-amber-200" },
  { value: "exame", label: "Exame", icon: "🔬", desc: "Exame laboratorial ou de imagem", color: "bg-violet-50 text-violet-600 border-violet-200" },
];

export const ILLNESS_COMMON_SYMPTOMS = [
  "Febre",
  "Tosse",
  "Coriza",
  "Dor de garganta",
  "Dor de ouvido",
  "Dor de cabeca",
  "Dor abdominal",
  "Vomito",
  "Diarreia",
  "Manchas na pele",
  "Chiado no peito",
  "Irritabilidade",
  "Falta de apetite",
  "Cansaco",
  "Outro",
];

// Brazilian Vaccination Calendar (SUS/SBP) — simplified
export const VACCINE_CALENDAR = [
  {
    age: "Ao nascer",
    ageMonths: 0,
    vaccines: [
      { name: "BCG", doses: 1 },
      { name: "Hepatite B", doses: 1 },
    ],
  },
  {
    age: "2 meses",
    ageMonths: 2,
    vaccines: [
      { name: "Pentavalente", doses: 1 },
      { name: "VIP (Polio inativada)", doses: 1 },
      { name: "Pneumococica 10V", doses: 1 },
      { name: "Rotavirus", doses: 1 },
    ],
  },
  {
    age: "3 meses",
    ageMonths: 3,
    vaccines: [
      { name: "Meningococica C", doses: 1 },
    ],
  },
  {
    age: "4 meses",
    ageMonths: 4,
    vaccines: [
      { name: "Pentavalente", doses: 2 },
      { name: "VIP (Polio inativada)", doses: 2 },
      { name: "Pneumococica 10V", doses: 2 },
      { name: "Rotavirus", doses: 2 },
    ],
  },
  {
    age: "5 meses",
    ageMonths: 5,
    vaccines: [
      { name: "Meningococica C", doses: 2 },
    ],
  },
  {
    age: "6 meses",
    ageMonths: 6,
    vaccines: [
      { name: "Pentavalente", doses: 3 },
      { name: "VIP (Polio inativada)", doses: 3 },
      { name: "Influenza", doses: 1 },
    ],
  },
  {
    age: "9 meses",
    ageMonths: 9,
    vaccines: [
      { name: "Febre Amarela", doses: 1 },
    ],
  },
  {
    age: "12 meses",
    ageMonths: 12,
    vaccines: [
      { name: "Triplice Viral (SCR)", doses: 1 },
      { name: "Pneumococica 10V (reforco)", doses: 3 },
      { name: "Meningococica C (reforco)", doses: 3 },
    ],
  },
  {
    age: "15 meses",
    ageMonths: 15,
    vaccines: [
      { name: "DTP (reforco)", doses: 1 },
      { name: "VOP (Polio oral)", doses: 1 },
      { name: "Hepatite A", doses: 1 },
      { name: "Tetra Viral (SCRV)", doses: 1 },
    ],
  },
  {
    age: "4 anos",
    ageMonths: 48,
    vaccines: [
      { name: "DTP (2o reforco)", doses: 2 },
      { name: "VOP (Polio oral reforco)", doses: 2 },
      { name: "Varicela", doses: 2 },
      { name: "Febre Amarela (reforco)", doses: 2 },
    ],
  },
];

export function generateWhatsAppLink(
  whatsapp: string,
  professionalName: string,
  childName: string,
  preferredDate: string,
  preferredTime: string,
  reason: string
): string {
  // Clean phone number
  let phone = whatsapp.replace(/\D/g, "");
  if (phone.length === 11) phone = "55" + phone;
  if (phone.length === 10) phone = "55" + phone;

  const text = encodeURIComponent(
    `Olá ${professionalName}! 👋\n\n` +
    `Gostaria de agendar uma consulta para meu/minha filho(a) *${childName}*.\n\n` +
    `📅 Data desejada: ${preferredDate}\n` +
    `⏰ Horário preferido: ${preferredTime}\n` +
    (reason ? `📋 Motivo: ${reason}\n\n` : "\n") +
    `Aguardo confirmação. Obrigado(a)!`
  );

  return `https://wa.me/${phone}?text=${text}`;
}
