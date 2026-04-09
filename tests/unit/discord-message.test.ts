import { describe, it, expect } from "vitest";
import {
  buildErrorMessage,
  buildStatusMessage,
} from "@/lib/discord/message-builder";

describe("buildErrorMessage", () => {
  const sampleError = {
    id: "abc-123",
    message: "Cannot read property 'map' of undefined",
    stack: "TypeError: Cannot read property 'map' of undefined\n    at LoginForm (src/components/LoginForm.tsx:42:5)",
    filePath: "src/components/LoginForm.tsx",
    folderCategory: "components",
    severity: "error",
  };

  it("creates a valid Discord message payload", () => {
    const payload = buildErrorMessage(sampleError);

    expect(payload.embeds).toHaveLength(1);
    expect(payload.components).toHaveLength(1);
  });

  it("includes error details in the embed", () => {
    const payload = buildErrorMessage(sampleError);
    const embed = payload.embeds[0];

    expect(embed.title).toContain("error");
    expect(embed.description).toContain("Cannot read property");
    expect(embed.footer.text).toContain("abc-123");
  });

  it("includes category and file path fields", () => {
    const payload = buildErrorMessage(sampleError);
    const fields = payload.embeds[0].fields;

    const categoryField = fields.find((f) => f.name === "Categoria");
    expect(categoryField?.value).toContain("components");

    const fileField = fields.find((f) => f.name === "Arquivo");
    expect(fileField?.value).toContain("LoginForm.tsx");
  });

  it("includes 3 action buttons", () => {
    const payload = buildErrorMessage(sampleError);
    const buttons = payload.components[0].components;

    expect(buttons).toHaveLength(3);
    expect(buttons[0].custom_id).toBe("fix_error:abc-123");
    expect(buttons[1].custom_id).toBe("ack_error:abc-123");
    expect(buttons[2].custom_id).toBe("ignore_error:abc-123");
  });

  it("uses correct button styles", () => {
    const payload = buildErrorMessage(sampleError);
    const buttons = payload.components[0].components;

    expect(buttons[0].style).toBe(1); // Primary
    expect(buttons[1].style).toBe(2); // Secondary
    expect(buttons[2].style).toBe(4); // Danger
  });

  it("handles missing stack trace", () => {
    const errorNoStack = { ...sampleError, stack: undefined };
    const payload = buildErrorMessage(errorNoStack);
    const stackField = payload.embeds[0].fields.find(
      (f) => f.name === "Stack Trace"
    );
    expect(stackField?.value).toContain("No stack trace");
  });

  it("handles missing file path", () => {
    const errorNoFile = { ...sampleError, filePath: undefined };
    const payload = buildErrorMessage(errorNoFile);
    const fileField = payload.embeds[0].fields.find(
      (f) => f.name === "Arquivo"
    );
    expect(fileField?.value).toBe("Desconhecido");
  });
});

describe("buildStatusMessage", () => {
  it("creates a valid status message", () => {
    const payload = buildStatusMessage("Test Title", "Test Desc", 0x22c55e);

    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].title).toBe("Test Title");
    expect(payload.embeds[0].description).toBe("Test Desc");
    expect(payload.embeds[0].color).toBe(0x22c55e);
  });
});
