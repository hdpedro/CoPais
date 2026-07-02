// @vitest-environment node
/* ------------------------------------------------------------------ */
/* pdf-to-image — rasterização da 1ª página (Convites C4).              */
/* Fixture gerada com pdf-lib (já é dependência) — sem binário no repo. */
/* Ambiente NODE de propósito: no jsdom o unpdf acha um HTMLCanvas fake */
/* e ignora o @napi-rs/canvas (em prod/serverless não há DOM).          */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { isPdfBuffer, renderPdfFirstPageToPng, MAX_PDF_BYTES } from "@/lib/ai/brain/pdf-to-image";

async function makeInvitePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Convite: Aniversario do Theo", { x: 60, y: 760, size: 24, font });
  page.drawText("Sabado 12/07 as 15h - Buffet Alegria", { x: 60, y: 720, size: 16, font });
  return Buffer.from(await doc.save());
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("isPdfBuffer", () => {
  it("reconhece o magic %PDF-", async () => {
    expect(isPdfBuffer(await makeInvitePdf())).toBe(true);
  });
  it("rejeita imagem/lixo", () => {
    expect(isPdfBuffer(PNG_MAGIC)).toBe(false);
    expect(isPdfBuffer(Buffer.from("oi, tudo bem?"))).toBe(false);
    expect(isPdfBuffer(Buffer.alloc(0))).toBe(false);
  });
});

describe("renderPdfFirstPageToPng", () => {
  it("PDF de 1 página vira PNG", async () => {
    const png = await renderPdfFirstPageToPng(await makeInvitePdf());
    expect(png).not.toBeNull();
    expect(png!.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
    expect(png!.length).toBeGreaterThan(1000);
  });
  it("não-PDF → null (guard de imagem decide a copy)", async () => {
    expect(await renderPdfFirstPageToPng(Buffer.from("nao sou pdf"))).toBeNull();
  });
  it("PDF acima do teto → null", async () => {
    const fat = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(MAX_PDF_BYTES)]);
    expect(await renderPdfFirstPageToPng(fat)).toBeNull();
  });
  it("PDF corrompido → null (nunca lança)", async () => {
    const broken = Buffer.from("%PDF-1.4\nlixo total sem estrutura");
    expect(await renderPdfFirstPageToPng(broken)).toBeNull();
  });
  it("página em branco → null (Falha #5: visão inventava convite inteiro)", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const blank = Buffer.from(await doc.save());
    expect(await renderPdfFirstPageToPng(blank)).toBeNull();
  });
});
