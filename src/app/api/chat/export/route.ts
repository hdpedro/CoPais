// kindar/api-route-auth-helper: pwa-only — PDF export do chat só PWA (native
// reimplementa via expo-print/sharing localmente sem chamar essa rota).
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
}

function formatDateBR(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");
  const month = searchParams.get("month"); // format: YYYY-MM
  const channelId = searchParams.get("channelId"); // optional: filter by channel

  if (!groupId) {
    return new Response("groupId obrigatorio", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Nao autenticado", { status: 401 });
  }

  // Verify group membership
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return new Response("Sem acesso ao grupo", { status: 403 });
  }

  // Fetch group name
  const { data: group } = await supabase
    .from("coparenting_groups")
    .select("name")
    .eq("id", groupId)
    .single();

  // Fetch member profiles
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, profiles(full_name)")
    .eq("group_id", groupId);

  const memberNames: Record<string, string> = {};
  const memberNamesList: string[] = [];
  type GroupMemberRow = {
    user_id: string;
    profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  (members as GroupMemberRow[] || []).forEach((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const name = p?.full_name || "Usuario";
    memberNames[m.user_id] = name;
    memberNamesList.push(name);
  });

  // Fetch channel name if filtering by channel
  let channelLabel = "";
  if (channelId) {
    const { data: channelData } = await supabase
      .from("chat_channels")
      .select("name, slug")
      .eq("id", channelId)
      .single();
    if (channelData) {
      channelLabel = channelData.name;
    }
  }

  // Build query for messages
  let query = supabase
    .from("chat_messages")
    .select("id, sender_id, text, image_url, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  // Apply channel filter
  if (channelId) {
    // For geral channel, include messages with null channel_id too
    const { data: chInfo } = await supabase
      .from("chat_channels")
      .select("slug")
      .eq("id", channelId)
      .single();

    if (chInfo?.slug === "geral") {
      query = query.or(`channel_id.eq.${channelId},channel_id.is.null`);
    } else {
      query = query.eq("channel_id", channelId);
    }
  }

  let dateRangeLabel = "Todas as mensagens";

  if (month) {
    const [year, mon] = month.split("-").map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);
    query = query
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString());

    const monthNames = [
      "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];
    dateRangeLabel = `${monthNames[mon - 1]} de ${year}`;
  }

  const { data: messages, error } = await query;

  if (error) {
    return new Response("Erro ao buscar mensagens", { status: 500 });
  }

  // Build PDF
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(
    StandardFonts.HelveticaOblique
  );

  const PAGE_WIDTH = 595.28; // A4
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 50;
  const MAX_TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  const FONT_SIZE = 9;
  const LINE_HEIGHT = 14;
  const HEADER_FONT_SIZE = 16;
  const SUB_FONT_SIZE = 10;

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageCount = 1;

  function addPageNumber(p: PDFPage, num: number) {
    const text = `${num}`;
    const width = helvetica.widthOfTextAtSize(text, 8);
    p.drawText(text, {
      x: PAGE_WIDTH / 2 - width / 2,
      y: 25,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  function newPage(): PDFPage {
    addPageNumber(page, pageCount);
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageCount++;
    y = PAGE_HEIGHT - MARGIN;
    return page;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 20) {
      newPage();
    }
  }

  function drawText(
    text: string,
    font: PDFFont,
    size: number,
    color = rgb(0, 0, 0)
  ) {
    const lines = wrapText(text, font, size, MAX_TEXT_WIDTH);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size + 4;
    }
  }

  // --- Header ---
  drawText("Kindar — Registro de Conversas", helveticaBold, HEADER_FONT_SIZE);
  y -= 8;

  drawText(
    `Grupo: ${group?.name || "Grupo"}`,
    helveticaBold,
    SUB_FONT_SIZE
  );
  if (channelLabel) {
    drawText(
      `Canal: ${channelLabel}`,
      helveticaBold,
      SUB_FONT_SIZE,
      rgb(0.3, 0.3, 0.3)
    );
  }
  drawText(
    `Periodo: ${dateRangeLabel}`,
    helvetica,
    SUB_FONT_SIZE,
    rgb(0.3, 0.3, 0.3)
  );
  drawText(
    `Membros: ${memberNamesList.join(", ")}`,
    helvetica,
    SUB_FONT_SIZE,
    rgb(0.3, 0.3, 0.3)
  );

  const exportDate = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  drawText(
    `Exportado em: ${exportDate}`,
    helvetica,
    8,
    rgb(0.5, 0.5, 0.5)
  );
  y -= 6;

  // Divider line
  ensureSpace(10);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 16;

  // --- Messages ---
  if (!messages || messages.length === 0) {
    drawText(
      "Nenhuma mensagem neste periodo.",
      helveticaOblique,
      FONT_SIZE,
      rgb(0.5, 0.5, 0.5)
    );
  } else {
    for (const msg of messages) {
      const timestamp = formatDateBR(msg.created_at);
      const senderName = memberNames[msg.sender_id] || "Sistema";
      const isSystem = !memberNames[msg.sender_id];

      let messageText = "";
      if (msg.image_url && msg.text) {
        messageText = `[Imagem anexada] ${msg.text}`;
      } else if (msg.image_url) {
        messageText = "[Imagem anexada]";
      } else if (msg.text) {
        // Detect audio messages
        messageText = msg.text.startsWith("[Audio")
          ? "[Audio]"
          : msg.text;
      } else {
        messageText = "[Mensagem sem conteudo]";
      }

      const prefix = `[${timestamp}] ${senderName}: `;
      const fullText = `${prefix}${messageText}`;

      if (isSystem) {
        // System messages in italic
        const lines = wrapText(fullText, helveticaOblique, FONT_SIZE, MAX_TEXT_WIDTH);
        for (const line of lines) {
          ensureSpace(LINE_HEIGHT);
          page.drawText(line, {
            x: MARGIN,
            y,
            size: FONT_SIZE,
            font: helveticaOblique,
            color: rgb(0.4, 0.4, 0.4),
          });
          y -= LINE_HEIGHT;
        }
      } else {
        // Regular messages: bold prefix, normal text
        const prefixWidth = helveticaBold.widthOfTextAtSize(
          prefix,
          FONT_SIZE
        );

        // If prefix + message fits on available width, optimize rendering
        const firstLineMaxWidth = MAX_TEXT_WIDTH - prefixWidth;
        const msgLines = wrapText(
          messageText,
          helvetica,
          FONT_SIZE,
          firstLineMaxWidth > 50 ? firstLineMaxWidth : MAX_TEXT_WIDTH
        );

        // First line: bold prefix + start of message
        ensureSpace(LINE_HEIGHT);
        page.drawText(prefix, {
          x: MARGIN,
          y,
          size: FONT_SIZE,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });

        if (firstLineMaxWidth > 50 && msgLines.length > 0) {
          page.drawText(msgLines[0], {
            x: MARGIN + prefixWidth,
            y,
            size: FONT_SIZE,
            font: helvetica,
            color: rgb(0.15, 0.15, 0.15),
          });
          y -= LINE_HEIGHT;

          // Remaining lines
          for (let i = 1; i < msgLines.length; i++) {
            ensureSpace(LINE_HEIGHT);
            // Re-wrap remaining lines at full width
            const rewrapped = wrapText(
              msgLines.slice(i).join(" "),
              helvetica,
              FONT_SIZE,
              MAX_TEXT_WIDTH
            );
            for (const rwLine of rewrapped) {
              ensureSpace(LINE_HEIGHT);
              page.drawText(rwLine, {
                x: MARGIN,
                y,
                size: FONT_SIZE,
                font: helvetica,
                color: rgb(0.15, 0.15, 0.15),
              });
              y -= LINE_HEIGHT;
            }
            break; // We already processed the rest
          }
        } else {
          // Prefix too long, put message on next line
          y -= LINE_HEIGHT;
          const fullMsgLines = wrapText(
            messageText,
            helvetica,
            FONT_SIZE,
            MAX_TEXT_WIDTH
          );
          for (const line of fullMsgLines) {
            ensureSpace(LINE_HEIGHT);
            page.drawText(line, {
              x: MARGIN,
              y,
              size: FONT_SIZE,
              font: helvetica,
              color: rgb(0.15, 0.15, 0.15),
            });
            y -= LINE_HEIGHT;
          }
        }
      }

      // Small spacing between messages
      y -= 4;
    }
  }

  // Add page number to last page
  addPageNumber(page, pageCount);

  const pdfBytes = await pdfDoc.save();

  const filename = month
    ? `kindar-conversas-${month}.pdf`
    : "kindar-conversas-completo.pdf";

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
