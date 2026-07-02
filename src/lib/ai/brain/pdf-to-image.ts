/* ------------------------------------------------------------------ */
/* pdf-to-image.ts — PDF → imagem da 1ª página (Convites C4)            */
/*                                                                      */
/* Convite digital e circular da escola chegam MUITO como PDF. Em vez   */
/* de ensinar cada provider de visão a ler PDF, rasterizamos a 1ª       */
/* página server-side (unpdf/pdfjs + @napi-rs/canvas — sem binário do   */
/* sistema, roda em serverless) e o pipeline segue IDÊNTICO ao caminho  */
/* de foto: classificador → extração → prévia. Serve o widget, o form   */
/* Novo Evento e o WhatsApp.                                            */
/* ------------------------------------------------------------------ */

const PDF_MAGIC = "%PDF-";

/** Paridade com o guard de imagem (8 MB). */
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length > PDF_MAGIC.length && buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC;
}

/**
 * Renderiza a 1ª página como PNG (escala 2 ≈ 150 dpi — de sobra pra visão;
 * compressImageForVision reduz depois). Import dinâmico: quem não manda PDF
 * não paga o pdfjs no cold start. Null = não-PDF, grande demais ou
 * corrompido — o caller decide a copy (o guard de imagem segue o fluxo).
 */
export async function renderPdfFirstPageToPng(buffer: Buffer): Promise<Buffer | null> {
  if (!isPdfBuffer(buffer) || buffer.length > MAX_PDF_BYTES) return null;
  try {
    const { renderPageAsImage } = await import("unpdf");
    // Cópia (new Uint8Array(buffer) copia): o pdfjs transfere/detacha o array
    // que recebe — passar uma view do Buffer original corromperia o caller.
    const png = await renderPageAsImage(new Uint8Array(buffer), 1, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: 2,
    });
    return Buffer.from(png);
  } catch {
    return null;
  }
}
