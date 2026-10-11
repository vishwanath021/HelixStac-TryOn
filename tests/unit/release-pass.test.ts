import { describe, expect, it } from "vitest";
import { caddyKind } from "@/lib/caddy-ask";
import { contentSecurityPolicy } from "@/lib/csp";
import { mailConfigured } from "@/lib/mail";
import { msg91Body, phoneLoginConfigured } from "@/lib/otp";
import { base32Decode, totp, verifyTotp } from "@/lib/totp";

const RFC_SECRET = Buffer.from("12345678901234567890");

describe("totp", () => {
  it("matches the RFC 6238 SHA1 vector at time 59", () => {
    expect(totp(RFC_SECRET, 59_000)).toBe("287082");
    expect(verifyTotp(RFC_SECRET, "287082", 59_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET, "000000", 59_000)).toBe(false);
  });

  it("decodes the published base32 form of that secret", () => {
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").equals(RFC_SECRET)).toBe(true);
  });
});

describe("csp", () => {
  it("keeps unsafe-eval out of the production script policy", () => {
    const policy = contentSecurityPolicy("abc", { dev: false, embed: false });
    expect(policy).toContain("nonce-abc");
    expect(policy).toContain("'wasm-unsafe-eval'");
    expect(policy).toContain("strict-dynamic");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("keeps unsafe-eval for the dev server", () => {
    expect(contentSecurityPolicy("abc", { dev: true, embed: false })).toContain("unsafe-eval");
  });
});

describe("channels", () => {
  it("treats phone login as off in production unless MSG91 is set", () => {
    expect(phoneLoginConfigured({ NODE_ENV: "production", OTP_PROVIDER: "mock" } as NodeJS.ProcessEnv)).toBe(false);
    expect(phoneLoginConfigured({
      NODE_ENV: "production",
      OTP_PROVIDER: "msg91",
      MSG91_AUTH_KEY: "key",
      MSG91_TEMPLATE_ID: "tpl",
    } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("builds an MSG91 body without logging the code", () => {
    expect(msg91Body("919800011122", "123456", "tpl")).toEqual({ template_id: "tpl", mobile: "919800011122", otp: "123456" });
  });

  it("reports mail as unconfigured when both senders are empty", () => {
    const prevResend = process.env.RESEND_API_KEY;
    const prevSmtp = process.env.SMTP_URL;
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_URL;
    expect(mailConfigured()).toBe(false);
    if (prevResend) process.env.RESEND_API_KEY = prevResend;
    if (prevSmtp) process.env.SMTP_URL = prevSmtp;
  });
});

describe("caddy ask", () => {
  it("allows the apex and a real salon host, and refuses strangers", () => {
    expect(caddyKind("lookuvi.in", "lookuvi.in", "lookuvi.in").kind).toBe("apex");
    expect(caddyKind("demo.try.lookuvi.in", "lookuvi.in", "lookuvi.in")).toEqual({ kind: "salon", slug: "demo" });
    expect(caddyKind("www.lookuvi.in", "lookuvi.in", "lookuvi.in").kind).toBe("apex");
    expect(caddyKind("evil.example", "lookuvi.in", "lookuvi.in").kind).toBe("custom");
    expect(caddyKind("admin.try.lookuvi.in", "lookuvi.in", "lookuvi.in").kind).toBe("no");
  });
});
