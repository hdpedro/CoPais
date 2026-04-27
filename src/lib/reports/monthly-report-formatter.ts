import type { MonthlyChildData, ActivitySummary, CheckinSummary, HealthSummary, CustodySummary, ExpenseSummary, DecisionSummary } from "./monthly-child-report";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

// Category emojis (mirrors src/lib/constants.ts)
const ACTIVITY_EMOJI: Record<string, string> = {
  sport: "\u26BD", health: "\uD83C\uDFE5", school: "\uD83C\uDF92", art: "\uD83C\uDFA8",
  music: "\uD83C\uDFB5", therapy: "\uD83E\uDDE0", course: "\uD83D\uDCDA", evento: "\uD83C\uDF89",
  guarda: "\uD83D\uDD04", other: "\uD83D\uDCCB",
};

const EXPENSE_EMOJI: Record<string, string> = {
  education: "\uD83C\uDF93", health: "\uD83C\uDFE5", food: "\uD83C\uDF54", clothing: "\uD83D\uDC55",
  transport: "\uD83D\uDE97", leisure: "\u26BD", housing: "\uD83C\uDFE0", other: "\uD83D\uDCE6",
};

const MOOD_EMOJI: Record<string, string> = {
  happy: "\uD83D\uDE04", neutral: "\uD83D\uDE10", sad: "\uD83D\uDE22", anxious: "\uD83D\uDE1F", tired: "\uD83D\uDE34",
};

const CHECKIN_EMOJI: Record<string, string> = {
  health: "\u{1F3E5}", sleep: "\u{1F634}", food: "\u{1F354}", mood: "\u{1F60A}",
  school: "\u{1F3EB}", other: "\u{1F4CB}",
};

const CHECKIN_LABELS: Record<string, string> = {
  health: "Saude", sleep: "Sono", food: "Alimentacao", mood: "Humor",
  school: "Escola", other: "Outro",
};

const DECISION_STATUS_EMOJI: Record<string, string> = {
  aberta: "\u{1F7E1}", aprovada: "\u{2705}", rejeitada: "\u{274C}", expirada: "\u{23F3}",
};

const DECISION_STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta", aprovada: "Aprovada", rejeitada: "Rejeitada", expirada: "Expirada",
};

const SYMPTOM_LABELS: Record<string, string> = {
  febre: "Febre", vomito: "Vomito", diarreia: "Diarreia", tosse: "Tosse",
  dor: "Dor", mancha: "Mancha", falta_apetite: "Falta de apetite", outro: "Outro",
};

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Generates the complete HTML email for a monthly report (1 or more children).
 */
export function formatMonthlyReportHtml(children: MonthlyChildData[], parentName: string): string {
  const firstName = parentName.split(" ")[0];
  const period = children[0]?.period;
  const periodLabel = period ? period.label : "";

  const childSections = children
    .filter((c) => c.hasData)
    .map((c) => buildChildSection(c))
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:40px 20px">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:28px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:14px;color:#9A8878;margin:8px 0 0">Relatorio Mensal</p>
  </div>

  <div style="background:#FFFFFF;border-radius:16px;padding:32px 24px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 4px">
      ${periodLabel}
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.5;margin:0 0 28px">
      Ola, ${firstName}! Aqui esta o resumo do mes ${children.length > 1 ? "dos seus filhos" : ""}.
    </p>

    ${childSections}
  </div>

  <!-- Footer -->
  <div style="text-align:center;margin-top:24px">
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:#C07055;color:white;font-size:14px;font-weight:600;padding:12px 28px;border-radius:12px;text-decoration:none">
      Abrir o Kindar
    </a>
    <p style="font-size:11px;color:#C4BEB6;margin:16px 0 0">
      Gerado automaticamente pelo Kindar &bull; &copy; 2024-2026
    </p>
  </div>

</div>
</body>
</html>`;
}

function buildChildSection(data: MonthlyChildData): string {
  const childName = data.child.full_name.split(" ")[0];
  const sections: string[] = [];

  if (data.activities.total > 0) sections.push(buildActivitiesSection(data.activities));
  if (data.checkins.total > 0) sections.push(buildCheckinsSection(data.checkins));
  if (hasHealthData(data.health)) sections.push(buildHealthSection(data.health));
  if (data.custody.totalDays > 0) sections.push(buildCustodySection(data.custody));
  if (data.expenses.count > 0) sections.push(buildExpensesSection(data.expenses));
  if (data.decisions.total > 0) sections.push(buildDecisionsSection(data.decisions));

  return `
    <div style="border-top:2px solid #EDF5F1;padding-top:24px;margin-top:24px">
      <h3 style="font-size:18px;font-weight:700;color:#5B9E85;margin:0 0 20px">
        ${childName}
      </h3>
      ${sections.join("")}
    </div>`;
}

// ============================================================
// Activities Section
// ============================================================

function buildActivitiesSection(a: ActivitySummary): string {
  const rateColor = a.attendanceRate >= 80 ? "#4CAF50" : a.attendanceRate >= 50 ? "#E8A228" : "#E53935";

  // Top mood
  let topMood = "";
  if (Object.keys(a.moodBreakdown).length > 0) {
    const sorted = Object.entries(a.moodBreakdown).sort((x, y) => y[1] - x[1]);
    topMood = `${MOOD_EMOJI[sorted[0][0]] || ""} Humor predominante: ${sorted[0][0]}`;
  }

  const topActivitiesHtml = a.topActivities
    .slice(0, 5)
    .map((act) => {
      const catEmoji = findCategoryEmoji(act.name, a.byCategory);
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
        <span style="font-size:13px;color:#0E0C0A">${catEmoji} ${act.name}</span>
        <span style="font-size:12px;color:#9A8878">${act.count}x &bull; ${act.completedRate}%</span>
      </div>`;
    })
    .join("");

  return `
    <div style="margin-bottom:24px">
      <h4 style="font-size:14px;font-weight:700;color:#0E0C0A;margin:0 0 12px">\u{1F4C5} Atividades</h4>

      <!-- Stats row -->
      <div style="display:flex;gap:12px;margin-bottom:12px">
        ${buildStatPill("Total", String(a.total), "#6B6560")}
        ${buildStatPill("Comparecimento", `${a.attendanceRate}%`, rateColor)}
        ${a.missed > 0 ? buildStatPill("Faltou", String(a.missed), "#E53935") : ""}
      </div>

      ${topMood ? `<p style="font-size:12px;color:#9A8878;margin:0 0 8px">${topMood}</p>` : ""}

      ${topActivitiesHtml ? `
        <div style="background:#FAFAF8;border-radius:12px;padding:12px 16px;margin-top:8px">
          <p style="font-size:11px;font-weight:600;color:#9A8878;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Top Atividades</p>
          ${topActivitiesHtml}
        </div>` : ""}
    </div>`;
}

function findCategoryEmoji(actName: string, byCategory: Array<{ category: string }>): string {
  // We don't have per-activity category, use first category or default
  return byCategory.length > 0 ? (ACTIVITY_EMOJI[byCategory[0].category] || "\u{1F4CB}") : "\u{1F4CB}";
}

// ============================================================
// Health Section
// ============================================================

function hasHealthData(h: HealthSummary): boolean {
  return h.appointments.length > 0 || h.vaccinesAdministered.length > 0 ||
    h.illnesses.length > 0 || h.symptoms.length > 0 ||
    h.medications.length > 0 || h.growth !== null;
}

function buildHealthSection(h: HealthSummary): string {
  const parts: string[] = [];

  if (h.appointments.length > 0) {
    const items = h.appointments.map((a) =>
      `<div style="padding:4px 0;font-size:13px;color:#0E0C0A">\u{1F4C5} ${formatDate(a.date)} — ${a.title}${a.location ? ` (${a.location})` : ""}</div>`
    ).join("");
    parts.push(`<div style="margin-bottom:10px"><p style="font-size:12px;font-weight:600;color:#9A8878;margin:0 0 4px">Consultas (${h.appointments.length})</p>${items}</div>`);
  }

  if (h.vaccinesAdministered.length > 0) {
    const items = h.vaccinesAdministered.map((v) =>
      `<div style="padding:4px 0;font-size:13px;color:#0E0C0A">\u{1F489} ${v.name}${v.dose ? ` (${v.dose})` : ""} — ${formatDate(v.date)}</div>`
    ).join("");
    parts.push(`<div style="margin-bottom:10px"><p style="font-size:12px;font-weight:600;color:#9A8878;margin:0 0 4px">Vacinas (${h.vaccinesAdministered.length})</p>${items}</div>`);
  }

  if (h.illnesses.length > 0) {
    const items = h.illnesses.map((i) => {
      const sev = i.severity ? ` (${i.severity})` : "";
      return `<div style="padding:4px 0;font-size:13px;color:#0E0C0A">\u{1F912} ${i.title}${sev} — ${formatDate(i.startDate)}${i.endDate ? ` a ${formatDate(i.endDate)}` : ""}</div>`;
    }).join("");
    parts.push(`<div style="margin-bottom:10px"><p style="font-size:12px;font-weight:600;color:#9A8878;margin:0 0 4px">Doencas (${h.illnesses.length})</p>${items}</div>`);
  }

  if (h.symptoms.length > 0) {
    const grouped = new Map<string, number>();
    for (const s of h.symptoms) {
      grouped.set(s.type, (grouped.get(s.type) || 0) + 1);
    }
    const items = Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${SYMPTOM_LABELS[type] || type} (${count}x)`)
      .join(", ");
    parts.push(`<div style="margin-bottom:10px"><p style="font-size:12px;font-weight:600;color:#9A8878;margin:0 0 4px">Sintomas</p><p style="font-size:13px;color:#0E0C0A;margin:0">${items}</p></div>`);
  }

  if (h.medications.length > 0) {
    const items = h.medications.map((m) =>
      `<div style="padding:4px 0;font-size:13px;color:#0E0C0A">\u{1F48A} ${m.name} — ${m.dosage} (${m.status})</div>`
    ).join("");
    parts.push(`<div style="margin-bottom:10px"><p style="font-size:12px;font-weight:600;color:#9A8878;margin:0 0 4px">Medicamentos (${h.medications.length})</p>${items}</div>`);
  }

  if (h.growth) {
    const g = h.growth;
    const measures: string[] = [];
    if (g.weight) measures.push(`${g.weight} kg`);
    if (g.height) measures.push(`${g.height} cm`);
    if (g.head) measures.push(`PC ${g.head} cm`);
    if (measures.length > 0) {
      parts.push(`<div style="margin-bottom:10px"><p style="font-size:12px;font-weight:600;color:#9A8878;margin:0 0 4px">Crescimento (${formatDate(g.date)})</p><p style="font-size:13px;color:#0E0C0A;margin:0">\u{1F4CF} ${measures.join(" &bull; ")}</p></div>`);
    }
  }

  return `
    <div style="margin-bottom:24px">
      <h4 style="font-size:14px;font-weight:700;color:#0E0C0A;margin:0 0 12px">\u{1F3E5} Saude</h4>
      <div style="background:#FAFAF8;border-radius:12px;padding:12px 16px">
        ${parts.join("")}
      </div>
    </div>`;
}

// ============================================================
// Custody Section
// ============================================================

function buildCustodySection(c: CustodySummary): string {
  const barsHtml = c.daysByParent.map((p) => {
    const pct = c.totalDays > 0 ? Math.round((p.days / c.totalDays) * 100) : 0;
    return `
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:13px;color:#0E0C0A">${p.name}</span>
          <span style="font-size:12px;color:#9A8878">${p.days} dias (${pct}%)</span>
        </div>
        <div style="background:#EEECEA;border-radius:6px;height:8px;overflow:hidden">
          <div style="background:#5B9E85;width:${pct}%;height:100%;border-radius:6px"></div>
        </div>
      </div>`;
  }).join("");

  return `
    <div style="margin-bottom:24px">
      <h4 style="font-size:14px;font-weight:700;color:#0E0C0A;margin:0 0 12px">\u{1F4C6} Custodia</h4>
      <div style="background:#FAFAF8;border-radius:12px;padding:12px 16px">
        ${barsHtml}
        ${c.swaps > 0 ? `<p style="font-size:12px;color:#9A8878;margin:8px 0 0">\u{1F504} ${c.swaps} troca(s) no mes</p>` : ""}
      </div>
    </div>`;
}

// ============================================================
// Expenses Section
// ============================================================

function buildExpensesSection(e: ExpenseSummary): string {
  const categoriesHtml = e.byCategory.slice(0, 5).map((c) => {
    const emoji = EXPENSE_EMOJI[c.category] || "\u{1F4E6}";
    return `<div style="display:flex;justify-content:space-between;padding:4px 0">
      <span style="font-size:13px;color:#0E0C0A">${emoji} ${c.category}</span>
      <span style="font-size:13px;font-weight:600;color:#0E0C0A">${formatCurrency(c.amount)}</span>
    </div>`;
  }).join("");

  const payersHtml = e.byPayer.map((p) =>
    `<span style="font-size:12px;color:#9A8878">${p.name}: ${formatCurrency(p.amount)}</span>`
  ).join(" &bull; ");

  return `
    <div style="margin-bottom:24px">
      <h4 style="font-size:14px;font-weight:700;color:#0E0C0A;margin:0 0 12px">\u{1F4B0} Despesas</h4>
      <div style="background:#FAFAF8;border-radius:12px;padding:12px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #EEECEA">
          <span style="font-size:13px;color:#6B6560">${e.count} despesa(s)</span>
          <span style="font-size:16px;font-weight:700;color:#0E0C0A">${formatCurrency(e.total)}</span>
        </div>
        ${categoriesHtml}
        ${payersHtml ? `<p style="margin:8px 0 0">${payersHtml}</p>` : ""}
      </div>
    </div>`;
}

// ============================================================
// Helpers
// ============================================================

// ============================================================
// Checkins Section
// ============================================================

function buildCheckinsSection(c: CheckinSummary): string {
  const categoriesHtml = Object.entries(c.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => {
      const emoji = CHECKIN_EMOJI[cat] || "\u{1F4CB}";
      const label = CHECKIN_LABELS[cat] || cat;
      return `<span style="font-size:12px;color:#0E0C0A">${emoji} ${label} (${count})</span>`;
    })
    .join(" &bull; ");

  const recentEntries = c.entries.slice(0, 5).map((e) => {
    const emoji = CHECKIN_EMOJI[e.category] || "\u{1F4CB}";
    return `<div style="padding:4px 0;font-size:13px;color:#0E0C0A">
      ${emoji} <strong>${formatDate(e.date)}</strong> — ${e.title}${e.description ? `: <span style="color:#6B6560">${e.description.length > 60 ? e.description.slice(0, 60) + "..." : e.description}</span>` : ""}
    </div>`;
  }).join("");

  return `
    <div style="margin-bottom:24px">
      <h4 style="font-size:14px;font-weight:700;color:#0E0C0A;margin:0 0 12px">\u{1F4DD} Check-ins Diarios (${c.total})</h4>
      <div style="background:#FAFAF8;border-radius:12px;padding:12px 16px">
        <p style="margin:0 0 10px">${categoriesHtml}</p>
        ${recentEntries}
        ${c.total > 5 ? `<p style="font-size:11px;color:#9A8878;margin:8px 0 0">+ ${c.total - 5} outros registros</p>` : ""}
      </div>
    </div>`;
}

// ============================================================
// Decisions Section
// ============================================================

function buildDecisionsSection(d: DecisionSummary): string {
  const statusSummary = Object.entries(d.byStatus)
    .map(([status, count]) => {
      const emoji = DECISION_STATUS_EMOJI[status] || "";
      const label = DECISION_STATUS_LABELS[status] || status;
      return `${emoji} ${count} ${label.toLowerCase()}`;
    })
    .join(" &bull; ");

  const entriesHtml = d.entries.map((e) => {
    const emoji = DECISION_STATUS_EMOJI[e.status] || "";
    const statusLabel = DECISION_STATUS_LABELS[e.status] || e.status;
    return `<div style="display:flex;justify-content:space-between;padding:4px 0">
      <span style="font-size:13px;color:#0E0C0A">${emoji} ${e.title}</span>
      <span style="font-size:12px;color:#9A8878">${statusLabel}</span>
    </div>`;
  }).join("");

  return `
    <div style="margin-bottom:24px">
      <h4 style="font-size:14px;font-weight:700;color:#0E0C0A;margin:0 0 12px">\u{1F5F3} Decisoes (${d.total})</h4>
      <div style="background:#FAFAF8;border-radius:12px;padding:12px 16px">
        <p style="font-size:12px;color:#9A8878;margin:0 0 8px">${statusSummary}</p>
        ${entriesHtml}
      </div>
    </div>`;
}

// ============================================================
// Helpers
// ============================================================

function buildStatPill(label: string, value: string, color: string): string {
  return `<div style="background:#FAFAF8;border-radius:10px;padding:8px 14px;text-align:center">
    <div style="font-size:18px;font-weight:700;color:${color}">${value}</div>
    <div style="font-size:11px;color:#9A8878;margin-top:2px">${label}</div>
  </div>`;
}

/**
 * Plain text version of the monthly report.
 */
export function formatMonthlyReportText(children: MonthlyChildData[], parentName: string): string {
  const firstName = parentName.split(" ")[0];
  const period = children[0]?.period?.label || "";
  const lines: string[] = [
    `KINDAR - Relatorio Mensal`,
    `${period}`,
    ``,
    `Ola, ${firstName}!`,
    ``,
  ];

  for (const child of children.filter((c) => c.hasData)) {
    const name = child.child.full_name.split(" ")[0];
    lines.push(`=== ${name} ===`);
    lines.push(``);

    if (child.activities.total > 0) {
      const a = child.activities;
      lines.push(`Atividades: ${a.total} total | ${a.completed} OK | ${a.missed} faltou | ${a.attendanceRate}% comparecimento`);
      for (const act of a.topActivities.slice(0, 3)) {
        lines.push(`  - ${act.name}: ${act.count}x (${act.completedRate}%)`);
      }
      lines.push(``);
    }

    if (child.checkins.total > 0) {
      const cats = Object.entries(child.checkins.byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => `${CHECKIN_LABELS[cat] || cat}: ${count}`)
        .join(", ");
      lines.push(`Check-ins: ${child.checkins.total} registros (${cats})`);
      for (const e of child.checkins.entries.slice(0, 3)) {
        lines.push(`  - ${e.date}: ${e.title}`);
      }
      lines.push(``);
    }

    if (hasHealthData(child.health)) {
      const h = child.health;
      if (h.appointments.length > 0) lines.push(`Consultas: ${h.appointments.length}`);
      if (h.vaccinesAdministered.length > 0) lines.push(`Vacinas: ${h.vaccinesAdministered.map((v) => v.name).join(", ")}`);
      if (h.illnesses.length > 0) lines.push(`Doencas: ${h.illnesses.map((i) => i.title).join(", ")}`);
      if (h.growth) {
        const g = h.growth;
        const m: string[] = [];
        if (g.weight) m.push(`${g.weight}kg`);
        if (g.height) m.push(`${g.height}cm`);
        lines.push(`Crescimento: ${m.join(", ")}`);
      }
      lines.push(``);
    }

    if (child.custody.totalDays > 0) {
      for (const p of child.custody.daysByParent) {
        lines.push(`Custodia: ${p.name} — ${p.days} dias`);
      }
      lines.push(``);
    }

    if (child.expenses.count > 0) {
      lines.push(`Despesas: ${formatCurrency(child.expenses.total)} (${child.expenses.count} itens)`);
      lines.push(``);
    }

    if (child.decisions.total > 0) {
      const statuses = Object.entries(child.decisions.byStatus)
        .map(([s, c]) => `${DECISION_STATUS_LABELS[s] || s}: ${c}`)
        .join(", ");
      lines.push(`Decisoes: ${child.decisions.total} (${statuses})`);
      for (const d of child.decisions.entries) {
        lines.push(`  - ${d.title} [${d.status}]`);
      }
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(`Gerado automaticamente pelo Kindar`);
  return lines.join("\n");
}
