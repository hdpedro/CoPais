import { describe, it, expect } from "vitest";
import {
  classifyFolder,
  severityColor,
} from "@/lib/error-tracking/classify";

describe("classifyFolder", () => {
  it("classifies src/app/ paths as app", () => {
    expect(classifyFolder("src/app/page.tsx")).toBe("app");
    expect(classifyFolder("src/app/(app)/dashboard/page.tsx")).toBe("app");
  });

  it("classifies src/app/api/ paths as services", () => {
    expect(classifyFolder("src/app/api/log-error/route.ts")).toBe("services");
    expect(classifyFolder("src/app/api/stripe/webhook/route.ts")).toBe(
      "services"
    );
  });

  it("classifies src/components/ paths as components", () => {
    expect(classifyFolder("src/components/LoginForm.tsx")).toBe("components");
    expect(classifyFolder("src/components/ui/Button.tsx")).toBe("components");
  });

  it("classifies src/lib/ paths as lib", () => {
    expect(classifyFolder("src/lib/supabase/admin.ts")).toBe("lib");
  });

  it("classifies src/hooks/ paths as hooks", () => {
    expect(classifyFolder("src/hooks/useAuth.ts")).toBe("hooks");
  });

  it("classifies src/actions/ paths as actions", () => {
    expect(classifyFolder("src/actions/events.ts")).toBe("actions");
  });

  it("classifies supabase/ paths as supabase", () => {
    expect(classifyFolder("supabase/migrations/00044_app_errors.sql")).toBe(
      "supabase"
    );
  });

  it("returns unknown for unrecognised paths", () => {
    expect(classifyFolder("package.json")).toBe("unknown");
    expect(classifyFolder("README.md")).toBe("unknown");
  });

  it("handles null/undefined", () => {
    expect(classifyFolder(null)).toBe("unknown");
    expect(classifyFolder(undefined)).toBe("unknown");
    expect(classifyFolder("")).toBe("unknown");
  });

  it("normalises Windows backslashes", () => {
    expect(classifyFolder("src\\components\\Button.tsx")).toBe("components");
  });

  it("handles absolute paths with src/", () => {
    expect(
      classifyFolder(
        "/Users/dev/project/src/components/LoginForm.tsx"
      )
    ).toBe("components");
    expect(
      classifyFolder(
        "C:\\Users\\henri\\project\\src\\hooks\\useAuth.ts"
      )
    ).toBe("hooks");
  });

  it("handles paths with leading ./", () => {
    expect(classifyFolder("./src/lib/utils.ts")).toBe("lib");
  });
});

describe("severityColor", () => {
  it("returns dark red for critical", () => {
    expect(severityColor("critical")).toBe(0x991b1b);
  });

  it("returns red for error", () => {
    expect(severityColor("error")).toBe(0xdc2626);
  });

  it("returns amber for warning", () => {
    expect(severityColor("warning")).toBe(0xf59e0b);
  });

  it("returns gray for unknown severity", () => {
    expect(severityColor("info")).toBe(0x6b7280);
  });
});
