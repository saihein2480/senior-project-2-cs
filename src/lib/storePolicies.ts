/**
 * Store policies the chatbot can quote, derived from the published
 * Terms & Conditions page (`/terms-and-conditions`).
 *
 * The terms page itself renders the authoritative bilingual text. These are
 * short English summaries so the assistant can answer policy questions without
 * guessing, and it always points customers to the full terms for the complete
 * wording. Keep these in step with that page when the terms change.
 */

export interface PolicySummary {
  topic: string;
  summary: string;
}

export const POLICY_SUMMARIES: PolicySummary[] = [
  {
    topic: "delivery time",
    summary:
      "Yangon deliveries take about 3-5 days. Mandalay takes about 1-2 days. Delivery charges are paid by the customer.",
  },
  {
    topic: "faulty item window",
    summary:
      "If an item has a fault or error, contact Swe Trendy Hub within 1 day of receiving it to be eligible for a remedy.",
  },
  {
    topic: "exchange",
    summary:
      "Faulty items reported within 1 day are exchanged for the same item from the brand's own stock where available.",
  },
  {
    topic: "made to order and pre-order",
    summary:
      "Items that were specially ordered or measured to request cannot be refunded or exchanged.",
  },
  {
    topic: "size exchange",
    summary:
      "For a size exchange on an online order, the replacement size must be in stock. The customer pays the delivery cost for the exchange.",
  },
  {
    topic: "exchange conditions",
    summary:
      "Exchanges must be for the same item. Swapping for a different item is not allowed, and the original label tag must still be attached and undamaged.",
  },
  {
    topic: "refund timing",
    summary:
      "Refunds are only issued after Swe Trendy Hub has received the returned goods back and checked them.",
  },
  {
    topic: "cancellation",
    summary:
      "Cancellation and return requests are submitted from Account > My Purchases and must be reviewed and approved by the store; they are not automatic.",
  },
];

/** One compact block for the model, with a pointer to the full terms. */
export function formatPoliciesForAssistant(): string {
  const lines = POLICY_SUMMARIES.map((p) => `- ${p.topic}: ${p.summary}`);

  return [
    ...lines,
    "",
    "These are summaries. The full Terms & Conditions (English and Burmese) are on the /terms-and-conditions page — refer customers there for exact wording, and never invent a policy detail that is not listed above.",
  ].join("\n");
}
