// Kindar app configuration — all the values that go into ASC
// Matches the product IDs used in the code (src/lib/payments.ts, migrations)

export const APP = {
  bundleId: "com.kindar.app",
  name: "Kindar",
  subtitle: "Dois lares, uma familia",
  primaryLocale: "pt-BR",
  primaryCategory: "LIFESTYLE",
  secondaryCategory: "PRODUCTIVITY",
  contentRightsDeclaration: "DOES_NOT_USE_THIRD_PARTY_CONTENT",
  privacyPolicyUrl: "https://kindar.com.br/privacidade",
  supportUrl: "https://kindar.com.br",
  marketingUrl: "https://kindar.com.br",
};

export const SUBSCRIPTION_GROUP = {
  referenceName: "Kindar Premium",
  localizations: {
    "pt-BR": {
      name: "Kindar Premium",
      customAppName: "Kindar",
    },
    "en-US": {
      name: "Kindar Premium",
      customAppName: "Kindar",
    },
  },
};

// Ordered by subscription level (highest to lowest)
// Level 1 is the highest — users can upgrade to level 1, downgrade to level 4
export const SUBSCRIPTIONS = [
  {
    productId: "com.kindar.elite.annual",
    referenceName: "Elite Annual",
    subscriptionPeriod: "ONE_YEAR",
    groupLevel: 1,
    familySharable: false,
    priceTier: 47, // ~R$ 497 (tier 47 = USD 99.99)
    localizations: {
      "pt-BR": {
        name: "Elite Anual",
        description: "Tudo do Elite por 12 meses. Economize R$ 101 por ano.",
      },
      "en-US": {
        name: "Elite Annual",
        description: "Everything in Elite for 12 months. Save $20 per year.",
      },
    },
  },
  {
    productId: "com.kindar.elite.monthly",
    referenceName: "Elite Monthly",
    subscriptionPeriod: "ONE_MONTH",
    groupLevel: 2,
    familySharable: false,
    priceTier: 9, // ~R$ 49,90 (tier 9 = USD 9.99)
    localizations: {
      "pt-BR": {
        name: "Elite",
        description: "Tudo do Premium + suporte VIP, backup juridico, relatorios detalhados e exportacao PDF.",
      },
      "en-US": {
        name: "Elite",
        description: "Everything in Premium + VIP support, legal backup, detailed reports and PDF export.",
      },
    },
  },
  {
    productId: "com.kindar.premium.annual",
    referenceName: "Premium Annual",
    subscriptionPeriod: "ONE_YEAR",
    groupLevel: 3,
    familySharable: false,
    priceTier: 27, // ~R$ 297 (tier 27 = USD 59.99)
    localizations: {
      "pt-BR": {
        name: "Premium Anual",
        description: "Tudo do Premium por 12 meses. Economize R$ 61 por ano.",
      },
      "en-US": {
        name: "Premium Annual",
        description: "Everything in Premium for 12 months. Save $10 per year.",
      },
    },
  },
  {
    productId: "com.kindar.premium.monthly",
    referenceName: "Premium Monthly",
    subscriptionPeriod: "ONE_MONTH",
    groupLevel: 4,
    familySharable: false,
    priceTier: 5, // ~R$ 29,90 (tier 5 = USD 5.99)
    localizations: {
      "pt-BR": {
        name: "Premium",
        description: "Calendario completo, chat, saude, documentos ilimitados, assistente IA e suporte prioritario.",
      },
      "en-US": {
        name: "Premium",
        description: "Full calendar, chat, health, unlimited documents, AI assistant and priority support.",
      },
    },
  },
];

export const VERSION_METADATA = {
  "pt-BR": {
    name: "Kindar",
    subtitle: "Dois lares, uma familia",
    promotionalText: "Organize a rotina dos seus filhos entre dois lares. Calendario, chat, despesas e saude em um so lugar.",
    description: `Kindar e o app para pais separados organizarem a rotina dos filhos de forma colaborativa, transparente e respeitosa.

Funcionalidades principais:

• Calendario compartilhado com escala de guarda
• Chat em tempo real entre os responsaveis
• Registro de saude completo — medicamentos, alergias, vacinas, consultas, crescimento
• Controle financeiro de despesas compartilhadas com aprovacao
• Atividades e eventos das criancas
• Decisoes em grupo com votacao
• Documentos e acordos familiares compartilhados
• Check-in diario das criancas
• Informacoes escolares
• Notificacoes em tempo real

Kindar representa os dois lares da crianca. Porque seus filhos merecem pais organizados.`,
    keywords: "coparentalidade,guarda compartilhada,filhos,familia,calendario,despesas,saude,criancas,pais separados,organizacao familiar",
    whatsNew: "Versao inicial do Kindar para iOS.",
    supportUrl: "https://kindar.com.br",
    marketingUrl: "https://kindar.com.br",
  },
  "en-US": {
    name: "Kindar",
    subtitle: "Two homes, one family",
    promotionalText: "Organize your children's routine between two homes. Calendar, chat, expenses and health in one place.",
    description: `Kindar is the app for separated parents to organize their children's routine collaboratively, transparently and respectfully.

Key features:

• Shared calendar with custody schedule
• Real-time chat between guardians
• Complete health records — medications, allergies, vaccines, appointments, growth
• Shared expense tracking with approval workflow
• Children's activities and events
• Group decisions with voting
• Shared family documents and agreements
• Daily child check-in
• School information
• Real-time notifications

Kindar represents both of a child's homes. Because your children deserve organized parents.`,
    keywords: "co-parenting,shared custody,children,family,calendar,expenses,health,kids,separated parents,family organization",
    whatsNew: "Initial release of Kindar for iOS.",
    supportUrl: "https://kindar.com.br",
    marketingUrl: "https://kindar.com.br",
  },
};

export const REVIEW_INFO = {
  contactFirstName: "Henrique",
  contactLastName: "de Pedro",
  contactEmail: "henrique.de.pedro@gmail.com",
  contactPhone: "",
  demoAccountName: "henrique.pedros@hotmail.com",
  demoAccountPassword: "12345678Pedro",
  demoAccountRequired: true,
  notes: `After login, you'll see the dashboard with custody schedule, activities, health status, and pending items. Navigate using the 5 bottom tabs: Home, Calendar, Chat, Health, More.

The app manages co-parenting coordination for separated families with shared custody. All features are functional with the demo account which has pre-populated data including children, custody schedule, health records, and expenses.

Key flows to test:
1. Dashboard: Shows greeting, custody status, recent activities, pending items
2. Calendar: Monthly grid with color-coded custody days
3. Chat: Real-time messaging between co-parents
4. Health: Per-child health records (medications, allergies, vaccines, appointments, growth)
5. More: All modules (expenses, activities, events, decisions, documents, agreements)

For IAP testing: Navigate to More > Pricing to see subscription options. All 4 subscription products are linked: Premium Monthly, Premium Annual, Elite Monthly, Elite Annual.`,
};
