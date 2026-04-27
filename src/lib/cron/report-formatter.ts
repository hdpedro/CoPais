import type { DailyReport, CronReport } from "./types";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(success: boolean): string {
  return success ? "\u2705" : "\u274C";
}

function statusLabel(success: boolean): string {
  return success ? "OK" : "FALHOU";
}

/**
 * Formats the daily report as HTML email following Kindar brand style.
 */
export function formatReportHtml(report: DailyReport): string {
  const statusColor = report.failureCount > 0 ? "#D4735A" : "#4CAF50";
  const statusText = report.failureCount > 0
    ? `${report.failureCount} falha(s)`
    : "Tudo OK";

  const detailsHtml = report.details
    .map((d) => buildCronRowHtml(d))
    .join("");

  const errorsHtml = report.totalErrors > 0
    ? buildErrorsSectionHtml(report.details)
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">Relatorio de CRONs</p>
  </div>

  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">

    <h2 style="font-size:18px;font-weight:700;color:#0E0C0A;margin:0 0 4px">
      ${report.date}
    </h2>
    <p style="font-size:14px;font-weight:600;color:${statusColor};margin:0 0 24px">
      ${statusText}
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6B6560">CRONs executados</td>
        <td style="padding:8px 0;font-size:13px;font-weight:600;color:#0E0C0A;text-align:right">${report.totalCrons}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6B6560">Sucesso</td>
        <td style="padding:8px 0;font-size:13px;font-weight:600;color:#4CAF50;text-align:right">${report.successCount}</td>
      </tr>
      ${report.failureCount > 0 ? `<tr>
        <td style="padding:8px 0;font-size:13px;color:#6B6560">Falhas</td>
        <td style="padding:8px 0;font-size:13px;font-weight:600;color:#D4735A;text-align:right">${report.failureCount}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6B6560">Notificacoes enviadas</td>
        <td style="padding:8px 0;font-size:13px;font-weight:600;color:#0E0C0A;text-align:right">${report.totalSent}</td>
      </tr>
    </table>

    <div style="border-top:1px solid #F0EDEA;padding-top:20px;margin-top:8px">
      <h3 style="font-size:14px;font-weight:700;color:#0E0C0A;margin:0 0 12px">Detalhes</h3>
      ${detailsHtml}
    </div>

    ${errorsHtml}

  </div>

  <div style="text-align:center;margin-top:24px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">&copy; 2024-2026 Kindar</p>
  </div>

</div>
</body>
</html>`;
}

function buildCronRowHtml(d: CronReport): string {
  const color = d.success ? "#4CAF50" : "#D4735A";
  const icon = d.success ? "&#9989;" : "&#10060;";

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F8F6F4">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px">${icon}</span>
        <span style="font-size:13px;font-weight:600;color:#0E0C0A">${d.name}</span>
      </div>
      <div style="text-align:right">
        <span style="font-size:12px;color:${color};font-weight:600">${statusLabel(d.success)}</span>
        <span style="font-size:11px;color:#9A8878;margin-left:8px">${d.sent} enviados</span>
        <span style="font-size:11px;color:#C4BEB6;margin-left:8px">${formatDuration(d.durationMs)}</span>
      </div>
    </div>`;
}

function buildErrorsSectionHtml(details: CronReport[]): string {
  const allErrors = details.flatMap((d) =>
    d.errors.map((e) => `<strong>${d.name}:</strong> ${e}`)
  );

  if (allErrors.length === 0) return "";

  const listHtml = allErrors
    .map((e) => `<li style="font-size:12px;color:#D4735A;margin-bottom:4px">${e}</li>`)
    .join("");

  return `
    <div style="border-top:1px solid #F0EDEA;padding-top:20px;margin-top:16px">
      <h3 style="font-size:14px;font-weight:700;color:#D4735A;margin:0 0 8px">Erros</h3>
      <ul style="margin:0;padding-left:16px">${listHtml}</ul>
    </div>`;
}

/**
 * Formats the daily report as plain text (fallback for email clients that don't render HTML).
 */
export function formatReportText(report: DailyReport): string {
  const lines: string[] = [
    `KINDAR - Relatorio de CRONs`,
    `Data: ${report.date}`,
    ``,
    `Resumo:`,
    `- CRONs executados: ${report.totalCrons}`,
    `- Sucesso: ${report.successCount}`,
    `- Falhas: ${report.failureCount}`,
    `- Notificacoes enviadas: ${report.totalSent}`,
    ``,
    `Detalhes:`,
  ];

  for (const d of report.details) {
    lines.push(`  ${statusIcon(d.success)} ${d.name}`);
    lines.push(`     Processados: ${d.processed}`);
    lines.push(`     Enviados: ${d.sent}`);
    lines.push(`     Tempo: ${formatDuration(d.durationMs)}`);
    if (d.errors.length > 0) {
      for (const e of d.errors) {
        lines.push(`     ERRO: ${e}`);
      }
    }
    lines.push(``);
  }

  if (report.totalErrors > 0) {
    lines.push(`Erros:`);
    for (const d of report.details) {
      for (const e of d.errors) {
        lines.push(`- ${d.name}: ${e}`);
      }
    }
  } else {
    lines.push(`Nenhum erro registrado.`);
  }

  return lines.join("\n");
}
