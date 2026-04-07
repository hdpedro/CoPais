/* ------------------------------------------------------------------ */
/* WhatsApp Response Formatter                                        */
/* Converts AI responses to WhatsApp-safe text                         */
/* ------------------------------------------------------------------ */

const WA_MAX_TEXT_LENGTH = 4096;

/**
 * Format a response for WhatsApp.
 * - Converts markdown to WhatsApp formatting
 * - Truncates to 4096 chars
 * - Preserves emojis
 */
export function formatForWhatsApp(text: string): string {
  if (!text) return "";

  let formatted = text;

  // Convert markdown bold **text** to WhatsApp bold *text*
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "*$1*");

  // Convert markdown headers ## to bold
  formatted = formatted.replace(/^#{1,3}\s+(.+)$/gm, "*$1*");

  // Convert markdown links [text](url) to text (url)
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  // Convert markdown code `text` to text (WhatsApp doesn't have inline code)
  formatted = formatted.replace(/`([^`]+)`/g, "$1");

  // Convert markdown code blocks
  formatted = formatted.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```\w*\n?/g, "").replace(/```/g, "").trim();
  });

  // Clean up extra newlines
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  // Truncate
  if (formatted.length > WA_MAX_TEXT_LENGTH) {
    formatted = formatted.slice(0, WA_MAX_TEXT_LENGTH - 3) + "...";
  }

  return formatted.trim();
}

/**
 * Split a long message into multiple WhatsApp messages.
 * Splits at paragraph boundaries when possible.
 */
export function splitMessage(text: string, maxLength = WA_MAX_TEXT_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }

    // Try to split at a paragraph boundary
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt === -1 || splitAt < maxLength * 0.3) {
      // Try newline
      splitAt = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitAt === -1 || splitAt < maxLength * 0.3) {
      // Try sentence boundary
      splitAt = remaining.lastIndexOf(". ", maxLength);
      if (splitAt !== -1) splitAt += 1; // Include the period
    }
    if (splitAt === -1 || splitAt < maxLength * 0.3) {
      // Hard split
      splitAt = maxLength;
    }

    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return parts;
}
