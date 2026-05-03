/* ------------------------------------------------------------------ */
/* WhatsApp Cloud API Types                                           */
/* Meta webhook payload + send API types                               */
/* ------------------------------------------------------------------ */

/* ================================================================== */
/* INBOUND — Webhook Payload                                          */
/* ================================================================== */

/** Top-level webhook payload from Meta */
export interface WAWebhookPayload {
  object: "whatsapp_business_account";
  entry: WAEntry[];
}

export interface WAEntry {
  id: string; // WhatsApp Business Account ID
  changes: WAChange[];
}

export interface WAChange {
  value: WAChangeValue;
  field: "messages";
}

export interface WAChangeValue {
  messaging_product: "whatsapp";
  metadata: WAMetadata;
  contacts?: WAContact[];
  messages?: WAInboundMessage[];
  statuses?: WAStatus[];
  errors?: WAError[];
}

export interface WAMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WAContact {
  profile: { name: string };
  wa_id: string; // Phone number in E.164 without +
}

/* ------------------------------------------------------------------ */
/* Inbound Message Types                                               */
/* ------------------------------------------------------------------ */

export interface WAInboundMessage {
  from: string; // Sender phone number (E.164 without +)
  id: string; // Message ID (wamid.xxx)
  timestamp: string; // Unix timestamp as string
  type: WAMessageType;
  text?: { body: string };
  image?: WAMedia;
  audio?: WAMedia;
  video?: WAMedia;
  document?: WAMedia & { filename?: string };
  sticker?: WAMedia;
  location?: WALocation;
  contacts?: WAContactCard[];
  interactive?: WAInteractiveReply;
  button?: { text: string; payload: string };
  context?: { from: string; id: string }; // Reply context
}

export type WAMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "button"
  | "reaction"
  | "unsupported";

export interface WAMedia {
  id: string; // Media ID for download
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface WALocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WAContactCard {
  name: { formatted_name: string; first_name?: string };
  phones?: { phone: string; type: string }[];
}

export interface WAInteractiveReply {
  type: "button_reply" | "list_reply";
  button_reply?: { id: string; title: string };
  list_reply?: { id: string; title: string; description?: string };
}

/* ------------------------------------------------------------------ */
/* Status Updates                                                      */
/* ------------------------------------------------------------------ */

export interface WAStatus {
  id: string; // Message ID
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: WAError[];
}

export interface WAError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}

/* ================================================================== */
/* OUTBOUND — Send API                                                */
/* ================================================================== */

/** Base send message payload */
interface WASendBase {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string; // Recipient phone E.164 without +
}

/** Send a text message */
export interface WASendText extends WASendBase {
  type: "text";
  text: { preview_url?: boolean; body: string };
}

/** Send an interactive button message */
export interface WASendInteractiveButtons extends WASendBase {
  type: "interactive";
  interactive: {
    type: "button";
    body: { text: string };
    action: {
      buttons: Array<{
        type: "reply";
        reply: { id: string; title: string };
      }>;
    };
  };
}

/** Send an interactive list message */
export interface WASendInteractiveList extends WASendBase {
  type: "interactive";
  interactive: {
    type: "list";
    body: { text: string };
    action: {
      button: string; // CTA button text
      sections: Array<{
        title: string;
        rows: Array<{
          id: string;
          title: string;
          description?: string;
        }>;
      }>;
    };
  };
}

/** Send a template message */
export interface WASendTemplate extends WASendBase {
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: "body" | "header" | "button";
      parameters: Array<{
        type: "text";
        text: string;
      }>;
    }>;
  };
}

export type WASendPayload =
  | WASendText
  | WASendInteractiveButtons
  | WASendInteractiveList
  | WASendTemplate;

/** Send API response */
export interface WASendResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

/* ================================================================== */
/* Internal Types                                                      */
/* ================================================================== */

/** Session state stored in whatsapp_sessions.state JSONB */
export interface WASessionState {
  pending_action?: string;
  pending_params?: Record<string, string>;
  pending_confirmation_text?: string;
  pending_at?: string; // ISO timestamp
  original_text?: string;
  awaiting_group_selection?: boolean;
  group_options?: Array<{ id: string; name: string }>;
  /** Receipt multi-step flow (G4) — set after OCR succeeds and user
   * needs to pick category and child before the expense is created. */
  receipt_step?: "category" | "child";
  receipt_draft?: {
    description: string;
    amount: number;
    expense_date: string;
    category?: string;
    child_id?: string | null;
  };
}

/** Phone link record from whatsapp_phone_links */
export interface WAPhoneLink {
  id: string;
  user_id: string;
  phone_number: string;
  phone_hash: string;
  verified_at: string | null;
  active_group_id: string | null;
  is_active: boolean;
}

/** Extracted message info (normalized from webhook) */
export interface WAExtractedMessage {
  from: string; // Phone E.164 with +
  messageId: string;
  timestamp: number;
  type: WAMessageType;
  text?: string;
  mediaId?: string;
  mediaMimeType?: string;
  caption?: string;
  buttonReplyId?: string;
  listReplyId?: string;
  contactName?: string;
}
