import { activatePlan, addCreditPack } from "@/lib/billing/apply";
import { verifyRazorpaySignature } from "@/lib/billing/signature";
import type { BillingEvent, BillingProvider } from "@/lib/billing/types";
import { CREDIT_PACKS } from "@/data/plans";
import { appBaseUrl } from "@/lib/env";

type RazorpayPayload = {
  event?: string;
  payload?: {
    subscription?: { entity?: { id?: string; notes?: Record<string, string> } };
    payment?: { entity?: { id?: string; notes?: Record<string, string>; order_id?: string } };
  };
};

function authHeader() {
  const key = process.env.RAZORPAY_KEY_ID || "";
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

export class RazorpayBilling implements BillingProvider {
  name = "razorpay";

  async createSubscription(input: { tenantId: string; plan: string; interval: "monthly" | "yearly" }) {
    const envKey = `RAZORPAY_PLAN_${input.plan}_${input.interval.toUpperCase()}`;
    const planId = process.env[envKey];
    if (!planId) {
      throw new Error(`Create a Razorpay plan and set ${envKey}. Prices are ex-GST; add 18% GST on the Razorpay plan amount.`);
    }
    const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { authorization: authHeader(), "content-type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        total_count: input.interval === "yearly" ? 5 : 12,
        customer_notify: 1,
        notes: { tenantId: input.tenantId, plan: input.plan, interval: input.interval },
      }),
    });
    if (!response.ok) throw new Error(`Razorpay subscription failed (${response.status})`);
    const data = (await response.json()) as { id: string; short_url?: string };
    return { checkoutUrl: data.short_url || `${appBaseUrl()}/admin/billing`, externalId: data.id };
  }

  async createCreditPackOrder(input: { tenantId: string; packId: string }) {
    const pack = CREDIT_PACKS.find((item) => item.id === input.packId);
    if (!pack) throw new Error("UNKNOWN_PACK");
    const amountPaise = (pack.priceExGst + Math.round(pack.priceExGst * 0.18)) * 100;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: authHeader(), "content-type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `${input.tenantId.slice(0, 12)}-${pack.id}`,
        notes: { tenantId: input.tenantId, packId: pack.id },
      }),
    });
    if (!response.ok) throw new Error(`Razorpay order failed (${response.status})`);
    const data = (await response.json()) as { id: string };
    return { checkoutUrl: `${appBaseUrl()}/admin/billing?order=${data.id}`, externalId: data.id };
  }

  async cancelSubscription(externalId: string) {
    const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${externalId}/cancel`, {
      method: "POST",
      headers: { authorization: authHeader(), "content-type": "application/json" },
      body: JSON.stringify({ cancel_at_cycle_end: 1 }),
    });
    if (!response.ok) throw new Error(`Razorpay cancel failed (${response.status})`);
  }

  async handleWebhook(rawBody: string, signature: string): Promise<BillingEvent> {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    if (!verifyRazorpaySignature(rawBody, signature, secret)) throw new Error("INVALID_SIGNATURE");
    const body = JSON.parse(rawBody) as RazorpayPayload;
    const event = body.event || "ignored";
    if (event === "subscription.charged") {
      const entity = body.payload?.subscription?.entity;
      const tenantId = entity?.notes?.tenantId;
      const plan = entity?.notes?.plan || "STARTER";
      const interval = entity?.notes?.interval === "yearly" ? "yearly" : "monthly";
      if (tenantId) {
        await activatePlan({
          tenantId,
          plan,
          interval,
          provider: this.name,
          externalId: entity?.id,
          chargeSetup: false,
        });
      }
      return { type: "subscription.charged", externalId: entity?.id || "", plan, tenantId };
    }
    if (event === "subscription.halted" || event === "subscription.cancelled") {
      return { type: "subscription.halted", externalId: body.payload?.subscription?.entity?.id || "" };
    }
    if (event === "payment.captured" || event === "order.paid") {
      const notes = body.payload?.payment?.entity?.notes;
      if (notes?.tenantId && notes.packId) {
        await addCreditPack(notes.tenantId, notes.packId, this.name, body.payload?.payment?.entity?.id);
      }
      return { type: "payment.captured", externalId: body.payload?.payment?.entity?.id || "", packId: notes?.packId, tenantId: notes?.tenantId };
    }
    return { type: "ignored", externalId: event };
  }
}
