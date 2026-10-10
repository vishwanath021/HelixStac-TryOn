import { billingProviderName } from "@/lib/env";
import { MockBilling } from "@/lib/billing/mock";
import { RazorpayBilling } from "@/lib/billing/razorpay";
import type { BillingProvider } from "@/lib/billing/types";

export function getBillingProvider(): BillingProvider {
  if (billingProviderName() === "razorpay") return new RazorpayBilling();
  return new MockBilling();
}
