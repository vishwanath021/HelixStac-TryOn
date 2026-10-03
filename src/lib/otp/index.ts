export interface OtpSender {
  name: string;
  send(phone: string, code: string): Promise<void>;
}

class MockOtpSender implements OtpSender {
  name = "mock";
  async send(phone: string, code: string) {
    console.info(`[otp-mock] code for phone ending ${phone.slice(-4)}: ${code}`);
  }
}

class Msg91Stub implements OtpSender {
  name = "msg91";
  async send() {
    if (!process.env.MSG91_AUTH_KEY) throw new Error("MSG91_AUTH_KEY is not set");
    throw new Error("MSG91 adapter is a stub. Set OTP_PROVIDER=mock until the live template is wired.");
  }
}

class TwilioStub implements OtpSender {
  name = "twilio";
  async send() {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) throw new Error("Twilio keys are not set");
    throw new Error("Twilio adapter is a stub. Set OTP_PROVIDER=mock until the live sender is wired.");
  }
}

export function otpSender(): OtpSender {
  const name = (process.env.OTP_PROVIDER || "mock").toLowerCase();
  if (name === "msg91" && process.env.MSG91_AUTH_KEY) return new Msg91Stub();
  if (name === "twilio" && process.env.TWILIO_ACCOUNT_SID) return new TwilioStub();
  return new MockOtpSender();
}

export function exposeDevOtp() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_OTP === "true";
}
