"use client";

export type BalanceOperationType =
  | "debit"
  | "waive"
  | "gift_day"
  | "forgive_balance"
  | "reset_balance";

interface Option {
  type: BalanceOperationType;
  icon: string;
  label: string;
  description: string;
  needsProposedDate: boolean;
  needsDays: boolean;
}

const OPTIONS: Option[] = [
  {
    type: "debit",
    icon: "🔁",
    label: "Compensar depois",
    description: "Gera saldo: voce pega o dia agora e devolve outro depois",
    needsProposedDate: true,
    needsDays: false,
  },
  {
    type: "waive",
    icon: "🤝",
    label: "Sem gerar saldo",
    description: "Troca amigavel, sem criar divida",
    needsProposedDate: false,
    needsDays: false,
  },
  {
    type: "gift_day",
    icon: "🎁",
    label: "Ceder gratuitamente",
    description: "Voce cede este dia sem cobrar nada",
    needsProposedDate: false,
    needsDays: false,
  },
  {
    type: "forgive_balance",
    icon: "⚖️",
    label: "Abater saldo existente",
    description: "Perdoa parte da divida acumulada",
    needsProposedDate: false,
    needsDays: true,
  },
  {
    type: "reset_balance",
    icon: "🧹",
    label: "Zerar pendencias",
    description: "Recomecar do zero. Ambos precisam aprovar.",
    needsProposedDate: false,
    needsDays: false,
  },
];

interface Props {
  value: BalanceOperationType;
  onChange: (type: BalanceOperationType) => void;
  excludeTypes?: BalanceOperationType[];
}

export default function BalanceOperationPicker({ value, onChange, excludeTypes = [] }: Props) {
  const visibleOptions = OPTIONS.filter((o) => !excludeTypes.includes(o.type));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[#9A8878] mb-2">Como tratar esta troca?</p>
      {visibleOptions.map((opt) => {
        const isActive = value === opt.type;
        return (
          <button
            key={opt.type}
            type="button"
            onClick={() => onChange(opt.type)}
            className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
              isActive
                ? "border-[#C07055] bg-[#FFF8F0]"
                : "border-[#E8E0D4] bg-white hover:border-[#C07055]/40"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl leading-none mt-0.5">{opt.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isActive ? "text-[#C07055]" : "text-[#2C2C2C]"}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-[#9A8878] mt-0.5">{opt.description}</p>
              </div>
              {isActive && (
                <svg className="w-5 h-5 text-[#C07055] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function getOptionConfig(type: BalanceOperationType): Option | undefined {
  return OPTIONS.find((o) => o.type === type);
}
