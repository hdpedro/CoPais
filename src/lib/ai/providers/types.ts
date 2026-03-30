/* ------------------------------------------------------------------ */
/* AI Provider interface — all vision providers implement this          */
/* ------------------------------------------------------------------ */

export interface AIProviderResult {
  text: string;
  provider: string;
}

export interface AIProvider {
  /** Provider display name (e.g., "Groq", "Together", "Gemini") */
  readonly name: string;

  /** Check if provider has API key configured */
  isAvailable(): boolean;

  /**
   * Send an image + prompt to the vision model.
   * Returns the raw text response from the model.
   */
  generateFromImage(
    imageBase64: string,
    mimeType: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string>;
}
