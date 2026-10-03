export type BillingInterval = "monthly" | "yearly";

export type BillingEvent =
  | { type: "subscription.charged"; externalId: string; plan: string; tenantId?: string }
  | { type: "subscription.halted"; externalId: string }
  | { type: "payment.captured"; externalId: string; packId?: string; tenantId?: string }
  | { type: "ignored"; externalId: string };

export interface BillingProvider {
  name: string;
  createSubscription(input: { tenantId: string; plan: string; interval: BillingInterval }): Promise<{ checkoutUrl: string; externalId: string }>;
  createCreditPackOrder(input: { tenantId: string; packId: string }): Promise<{ checkoutUrl: string; externalId: string }>;
  cancelSubscription(externalId: string): Promise<void>;
  handleWebhook(rawBody: string, signature: string): Promise<BillingEvent>;
}
