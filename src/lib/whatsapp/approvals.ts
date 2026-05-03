/* ------------------------------------------------------------------ */
/* WhatsApp Approval Protocol (encode/decode only)                     */
/*                                                                     */
/* Wire format for interactive button replies that mean "approve /     */
/* reject this pending entity". Used by:                               */
/*   - notify.ts → encodes approval requests as buttons                */
/*   - processor.ts → decodes inbound button replies and dispatches    */
/*                                                                     */
/* Format: "<verb>:<entity>:<uuid>"                                     */
/*   verb     ∈ approve | reject                                        */
/*   entity   ∈ swap | event_request | expense                          */
/*                                                                     */
/* IMPORTANT: this module must NOT import services/* — keeping it      */
/* dependency-free avoids an import cycle with notify.ts (which is     */
/* imported by services/swap.ts to send approval cards).               */
/* Dispatch logic lives in processor.ts.                               */
/* ------------------------------------------------------------------ */

export type ApprovalVerb = "approve" | "reject";
export type ApprovalEntity = "swap" | "event_request" | "expense";

export interface ApprovalPayload {
  verb: ApprovalVerb;
  entity: ApprovalEntity;
  id: string;
}

export function encodeApproval(p: ApprovalPayload): string {
  return `${p.verb}:${p.entity}:${p.id}`;
}

export function decodeApproval(buttonId: string | undefined): ApprovalPayload | null {
  if (!buttonId) return null;
  const parts = buttonId.split(":");
  if (parts.length !== 3) return null;
  const [verb, entity, id] = parts;
  if (verb !== "approve" && verb !== "reject") return null;
  if (entity !== "swap" && entity !== "event_request" && entity !== "expense") {
    return null;
  }
  if (!id || id.length < 4) return null;
  return { verb, entity, id };
}

export function isApprovalButton(buttonId: string | undefined): boolean {
  return decodeApproval(buttonId) !== null;
}
