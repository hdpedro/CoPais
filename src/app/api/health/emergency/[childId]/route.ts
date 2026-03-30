import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ childId: string }> }
) {
  const { childId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  if (!childId || !token) {
    return new NextResponse("Não encontrado", { status: 404 });
  }

  const supabase = createAdminClient();

  // Verify token matches child
  const { data: child } = await supabase
    .from("children")
    .select("id, full_name, birth_date, emergency_token, group_id")
    .eq("id", childId)
    .single();

  if (!child || child.emergency_token !== token) {
    return new NextResponse("Não encontrado", { status: 404 });
  }

  // Fetch all emergency data in parallel
  const [
    { data: medicalInfo },
    { data: allergies },
    { data: medications },
    { data: groupMembers },
  ] = await Promise.all([
    supabase
      .from("child_medical_info")
      .select("blood_type, insurance_name, insurance_number, sus_number, primary_pediatrician_id")
      .eq("child_id", childId)
      .maybeSingle(),
    supabase
      .from("child_allergies")
      .select("name, allergy_type, severity, reaction")
      .eq("child_id", childId)
      .order("severity"),
    supabase
      .from("active_medications")
      .select("name, dosage, frequency, reason")
      .eq("child_id", childId)
      .eq("status", "active"),
    supabase
      .from("group_members")
      .select("profiles(full_name, phone, email)")
      .eq("group_id", child.group_id),
  ]);

  // Fetch pediatrician if exists
  let pediatrician: { name: string; phone: string | null; specialty: string | null } | null = null;
  if (medicalInfo?.primary_pediatrician_id) {
    const { data: ped } = await supabase
      .from("medical_professionals")
      .select("name, phone, specialty")
      .eq("id", medicalInfo.primary_pediatrician_id)
      .single();
    pediatrician = ped;
  }

  // Format birth date
  const birthDate = child.birth_date
    ? new Date(child.birth_date + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Não informada";

  // Calculate age
  let ageText = "";
  if (child.birth_date) {
    const birth = new Date(child.birth_date);
    const now = new Date();
    const years = now.getFullYear() - birth.getFullYear();
    const months = now.getMonth() - birth.getMonth();
    const totalMonths = years * 12 + months;
    if (totalMonths < 24) {
      ageText = `${totalMonths} meses`;
    } else {
      ageText = `${Math.floor(totalMonths / 12)} anos`;
    }
  }

  // Build contacts list
  const contacts = (groupMembers || [])
    .map((m) => (m as unknown as { profiles: { full_name: string; phone: string | null; email: string | null } | null }).profiles)
    .filter(Boolean)
    .map((p) => ({
      name: p!.full_name || "Responsável",
      phone: p!.phone || null,
      email: p!.email || null,
    }));

  // Severity badge helper
  function severityBadge(severity: string) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      severe: { bg: "#FEE2E2", text: "#991B1B", label: "GRAVE" },
      moderate: { bg: "#FEF3C7", text: "#92400E", label: "MODERADA" },
      mild: { bg: "#D1FAE5", text: "#065F46", label: "LEVE" },
    };
    const c = config[severity] || config.mild;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;background:${c.bg};color:${c.text}">${c.label}</span>`;
  }

  function allergyTypeLabel(type: string) {
    const map: Record<string, string> = {
      food: "Alimentar",
      medication: "Medicamentosa",
      environmental: "Ambiental",
      insect: "Insetos",
      other: "Outra",
    };
    return map[type] || type;
  }

  // Build the HTML
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ficha de Emergência — ${escapeHtml(child.full_name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fff;
      color: #1a1a1a;
      line-height: 1.5;
      padding: 0;
    }
    .header {
      background: linear-gradient(135deg, #DC2626, #B91C1C);
      color: white;
      padding: 20px 16px;
      text-align: center;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header .subtitle {
      font-size: 13px;
      opacity: 0.9;
    }
    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 16px;
    }
    .section {
      margin-bottom: 16px;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      overflow: hidden;
    }
    .section-header {
      background: #F9FAFB;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      color: #374151;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-body {
      padding: 12px 14px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 14px;
    }
    .info-row + .info-row {
      border-top: 1px solid #F3F4F6;
    }
    .info-label {
      color: #6B7280;
      font-size: 13px;
    }
    .info-value {
      font-weight: 600;
      text-align: right;
    }
    .blood-type {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: #FEE2E2;
      color: #DC2626;
      font-size: 22px;
      font-weight: 800;
      border-radius: 12px;
    }
    .allergy-item {
      padding: 8px 0;
      font-size: 14px;
    }
    .allergy-item + .allergy-item {
      border-top: 1px solid #F3F4F6;
    }
    .allergy-name {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .allergy-detail {
      color: #6B7280;
      font-size: 12px;
      margin-top: 2px;
    }
    .med-item {
      padding: 8px 0;
      font-size: 14px;
    }
    .med-item + .med-item {
      border-top: 1px solid #F3F4F6;
    }
    .med-name {
      font-weight: 600;
    }
    .med-detail {
      color: #6B7280;
      font-size: 12px;
      margin-top: 2px;
    }
    .contact-item {
      padding: 8px 0;
      font-size: 14px;
    }
    .contact-item + .contact-item {
      border-top: 1px solid #F3F4F6;
    }
    .contact-name {
      font-weight: 600;
    }
    .contact-detail {
      color: #6B7280;
      font-size: 13px;
    }
    .contact-detail a {
      color: #2563EB;
      text-decoration: none;
    }
    .empty {
      color: #9CA3AF;
      font-size: 13px;
      font-style: italic;
    }
    .footer {
      text-align: center;
      padding: 24px 16px;
      color: #9CA3AF;
      font-size: 12px;
    }
    .footer a {
      color: #6B7280;
      text-decoration: none;
    }
    @media print {
      body { padding: 0; }
      .header { break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>&#9877;&#65039; Ficha de Emergência</h1>
    <div class="subtitle">${escapeHtml(child.full_name)}${ageText ? ` — ${ageText}` : ""}</div>
  </div>
  <div class="container">

    <!-- Dados Pessoais -->
    <div class="section">
      <div class="section-header">👤 Dados Pessoais</div>
      <div class="section-body">
        <div class="info-row">
          <span class="info-label">Nome completo</span>
          <span class="info-value">${escapeHtml(child.full_name)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Data de nascimento</span>
          <span class="info-value">${birthDate}</span>
        </div>
        ${ageText ? `<div class="info-row">
          <span class="info-label">Idade</span>
          <span class="info-value">${ageText}</span>
        </div>` : ""}
      </div>
    </div>

    <!-- Tipo Sanguíneo -->
    ${medicalInfo?.blood_type ? `
    <div class="section">
      <div class="section-header">🩸 Tipo Sanguíneo</div>
      <div class="section-body" style="display:flex;align-items:center;gap:12px">
        <div class="blood-type">${escapeHtml(medicalInfo.blood_type)}</div>
        <span style="font-size:16px;font-weight:700">${escapeHtml(medicalInfo.blood_type)}</span>
      </div>
    </div>
    ` : `
    <div class="section">
      <div class="section-header">🩸 Tipo Sanguíneo</div>
      <div class="section-body"><span class="empty">Não informado</span></div>
    </div>
    `}

    <!-- Alergias -->
    <div class="section">
      <div class="section-header">⚠️ Alergias</div>
      <div class="section-body">
        ${allergies && allergies.length > 0
          ? allergies.map((a: { name: string; allergy_type: string; severity: string; reaction: string | null }) => `
            <div class="allergy-item">
              <div class="allergy-name">
                ${escapeHtml(a.name)}
                ${severityBadge(a.severity)}
              </div>
              <div class="allergy-detail">
                ${allergyTypeLabel(a.allergy_type)}${a.reaction ? ` — ${escapeHtml(a.reaction)}` : ""}
              </div>
            </div>
          `).join("")
          : `<span class="empty">Nenhuma alergia registrada</span>`
        }
      </div>
    </div>

    <!-- Medicações Ativas -->
    <div class="section">
      <div class="section-header">💊 Medicações Ativas</div>
      <div class="section-body">
        ${medications && medications.length > 0
          ? medications.map((m: { name: string; dosage: string; frequency: string; reason: string | null }) => `
            <div class="med-item">
              <div class="med-name">${escapeHtml(m.name)}</div>
              <div class="med-detail">
                ${escapeHtml(m.dosage)} — ${escapeHtml(m.frequency)}
                ${m.reason ? `<br>Motivo: ${escapeHtml(m.reason)}` : ""}
              </div>
            </div>
          `).join("")
          : `<span class="empty">Nenhuma medicação ativa</span>`
        }
      </div>
    </div>

    <!-- Convênio / SUS -->
    <div class="section">
      <div class="section-header">🏥 Convênio / SUS</div>
      <div class="section-body">
        ${medicalInfo?.insurance_name || medicalInfo?.sus_number ? `
          ${medicalInfo.insurance_name ? `
            <div class="info-row">
              <span class="info-label">Convênio</span>
              <span class="info-value">${escapeHtml(medicalInfo.insurance_name)}</span>
            </div>
          ` : ""}
          ${medicalInfo.insurance_number ? `
            <div class="info-row">
              <span class="info-label">Nº Carteirinha</span>
              <span class="info-value">${escapeHtml(medicalInfo.insurance_number)}</span>
            </div>
          ` : ""}
          ${medicalInfo.sus_number ? `
            <div class="info-row">
              <span class="info-label">Nº SUS</span>
              <span class="info-value">${escapeHtml(medicalInfo.sus_number)}</span>
            </div>
          ` : ""}
        ` : `<span class="empty">Não informado</span>`}
      </div>
    </div>

    <!-- Contatos de Emergência -->
    <div class="section">
      <div class="section-header">📞 Contatos de Emergência</div>
      <div class="section-body">
        ${contacts.length > 0
          ? contacts.map((c: { name: string; phone: string | null; email: string | null }) => `
            <div class="contact-item">
              <div class="contact-name">${escapeHtml(c.name)}</div>
              <div class="contact-detail">
                ${c.phone ? `<a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a>` : ""}
                ${c.phone && c.email ? " · " : ""}
                ${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : ""}
                ${!c.phone && !c.email ? '<span class="empty">Sem contato</span>' : ""}
              </div>
            </div>
          `).join("")
          : `<span class="empty">Nenhum contato registrado</span>`
        }
      </div>
    </div>

    <!-- Pediatra -->
    <div class="section">
      <div class="section-header">🩺 Pediatra</div>
      <div class="section-body">
        ${pediatrician ? `
          <div class="info-row">
            <span class="info-label">Nome</span>
            <span class="info-value">${escapeHtml(pediatrician.name)}</span>
          </div>
          ${pediatrician.specialty ? `
          <div class="info-row">
            <span class="info-label">Especialidade</span>
            <span class="info-value">${escapeHtml(pediatrician.specialty)}</span>
          </div>
          ` : ""}
          ${pediatrician.phone ? `
          <div class="info-row">
            <span class="info-label">Telefone</span>
            <span class="info-value"><a href="tel:${escapeHtml(pediatrician.phone)}" style="color:#2563EB;text-decoration:none">${escapeHtml(pediatrician.phone)}</a></span>
          </div>
          ` : ""}
        ` : `<span class="empty">Não informado</span>`}
      </div>
    </div>

  </div>
  <div class="footer">
    Gerado pelo Kindar — <a href="https://kindar.com.br">kindar.com.br</a><br>
    <small>${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</small>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
