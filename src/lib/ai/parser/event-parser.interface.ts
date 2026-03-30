/* ------------------------------------------------------------------ */
/* EventParser — desacoplado para trocar implementação facilmente      */
/* ------------------------------------------------------------------ */

import { ParseResult, ParserMetadata } from "./types";

export interface EventParser {
  parse(file: File): Promise<ParseResult & { metadata: ParserMetadata }>;
}
