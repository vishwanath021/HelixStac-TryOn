export interface OtpSender {
  name: string;
  send(phone: string, code: string): Promise<void>;
}

/** Production phone login needs MSG91. Local dev may use the mock sender. */
export function phoneLoginConfigured(env: NodeJS.ProcessEnv = process.env) {
  const name = (env.OTP_PROVIDER || "mock").toLowerCase();
  if (name === "msg91") return Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID);
  if (env.NODE_ENV === "production") return false;
  return name === "mock" || name === "";
}

export function msg91Body(phone: string, code: string, templateId = process.env.MSG91_TEMPLATE_ID || "") {
  return {
    template_id: templateId,
    mobile: phone.replace(/\D/g, ""),
    otp: code,
  };
}

class MockOtpSender implements OtpSender {
  name = "mock";
  async send(phone: string, code: string) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OTP_PROVIDER=mock cannot send codes in production");
    }
    void code;
    console.info(`[otp-mock] dev code issued for phone ending ${phone.slice(-4)}`);
  }
}

class Msg91Sender implements OtpSender {
  name = "msg91";
  async send(phone: string, code: string) {
    const authkey = process.env.MSG91_AUTH_KEY || "";
    const body = msg91Body(phone, code);
    if (!authkey || !body.template_id || !body.mobile) throw new Error("MSG91 is not configured");
    const res = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: { authkey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("MSG91 rejected the OTP request");
    const data = (await res.json().catch(() => null)) as { type?: string } | null;
    if (data?.type === "error") throw new Error("MSG91 rejected the OTP request");
  }
}

export function otpSender(): OtpSender {
  if (phoneLoginConfigured() && (process.env.OTP_PROVIDER || "mock").toLowerCase() === "msg91") return new Msg91Sender();
  return new MockOtpSender();
}

export function exposeDevOtp() {
  return process.env.NODE_ENV !== "production";
}
