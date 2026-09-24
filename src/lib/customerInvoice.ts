/**
 * Printable invoice for an online customer's own order.
 *
 * The purchases page shows an order summary on screen, but a customer also needs
 * something they can print or save: a document that states who the seller is,
 * who the buyer is, where it is being delivered, what was bought, and exactly
 * how the total was reached — including every promotion and coupon applied.
 *
 * Everything rendered here comes from what was stored on the order at checkout,
 * so a reprint months later shows what the customer was actually charged rather
 * than what today's prices or promotions would produce.
 *
 * All amounts are in THB, the currency online orders are priced in, with the MMK
 * equivalent reported using the exchange rate recorded with the order.
 */

export type InvoiceSeller = {
  businessName: string;
  branchName: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  showLogo: boolean;
  footerMessage: string;
  footerImageUrl: string;
};

export type InvoiceBuyer = {
  name: string;
  phone: string;
  address: string;
  email: string;
  /** The customer's account id, so support can match the invoice to the account. */
  accountId: string;
};

export type InvoiceLine = {
  name: string;
  /** Colour / size, already joined for display. */
  variant: string;
  quantity: number;
  /** Catalogue unit price. Lines are quoted here so Amounts sum to the subtotal. */
  unitPrice: number;
  /** Unit price actually charged, when a discount brought it below `unitPrice`. */
  chargedUnitPrice?: number;
  /** What this line saved. */
  lineDiscount: number;
  /** Promotion responsible for the saving. */
  promotionName?: string;
  /** `unitPrice * quantity`, the catalogue value of the line. */
  lineTotal: number;
  /** `lineTotal - lineDiscount`, what the line actually cost. */
  lineNet: number;
};

export type InvoiceTotals = {
  /** Catalogue value of every line; what the Amount column adds up to. */
  subtotal: number;
  /** Named promotions, and which discount they account for. */
  promotions: Array<{ name: string; discountTHB: number }>;
  promotionsApplyTo: "line" | "order" | "none";
  /** Discounts belonging to individual lines, shown on those lines too. */
  lineDiscountTotal: number;
  /** `subtotal - lineDiscountTotal`; the sum of the net line amounts. */
  subtotalAfterItemDiscount: number;
  /** Discount applied to the order as a whole rather than to any one line. */
  orderDiscount: number;
  couponCode?: string;
  couponDiscount: number;
  taxPercent: number;
  tax: number;
  total: number;
  totalSavings: number;
  /** Total in MMK, when the order recorded an amount or a rate. */
  totalMMK?: number;
};

export type InvoiceMeta = {
  invoiceNumber: string;
  orderRef: string;
  issuedAt: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
};

export type CustomerInvoice = {
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  meta: InvoiceMeta;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const thb = (value: number) =>
  `฿ ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const mmk = (value: number) => `${Math.round(Number(value || 0)).toLocaleString()} MMK`;

/** Trim floating point noise so a label reads "7%" instead of "7.000000001%". */
function formatRatePercent(percent: number): string {
  return String(Math.round(Number(percent || 0) * 100) / 100);
}

/** Resolve a settings-relative image path against the current origin. */
function toAbsoluteUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return raw;
  }
  if (typeof window === "undefined") return raw;
  if (raw.startsWith("//")) return `${window.location.protocol}${raw}`;
  if (raw.startsWith("/")) return `${window.location.origin}${raw}`;
  return `${window.location.origin}/${raw}`;
}

/** A label/value pair, skipped entirely when the value is missing. */
function detailRow(label: string, value: string): string {
  if (!value || value === "-") return "";
  return `
    <div class="detail-row">
      <span class="detail-label">${escapeHtml(label)}</span>
      <span class="detail-value">${escapeHtml(value)}</span>
    </div>`;
}

function buildLinesHtml(lines: InvoiceLine[]): string {
  if (lines.length === 0) {
    return `<tr><td colspan="5" class="empty">No items recorded for this order</td></tr>`;
  }

  return lines
    .map((line, index) => {
      const description = [
        `<div class="item-name">${escapeHtml(line.name)}</div>`,
        line.variant
          ? `<div class="item-variant">${escapeHtml(line.variant)}</div>`
          : "",
        line.promotionName
          ? `<div class="item-promo">Promotion: ${escapeHtml(line.promotionName)}</div>`
          : "",
      ]
        .filter(Boolean)
        .join("");

      // The unit price shown is the catalogue price. When a discount applied, the
      // price actually paid per unit is noted underneath it.
      const unitCell =
        typeof line.chargedUnitPrice === "number"
          ? `<div>${escapeHtml(thb(line.unitPrice))}</div>
             <div class="paid">paid ${escapeHtml(thb(line.chargedUnitPrice))}</div>`
          : escapeHtml(thb(line.unitPrice));

      const discountCell =
        line.lineDiscount > 0
          ? `<span class="saving">-${escapeHtml(thb(line.lineDiscount))}</span>`
          : "&mdash;";

      const amountCell =
        line.lineDiscount > 0
          ? `<div class="was">${escapeHtml(thb(line.lineTotal))}</div>
             <div class="strong">${escapeHtml(thb(line.lineNet))}</div>`
          : `<span class="strong">${escapeHtml(thb(line.lineTotal))}</span>`;

      return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${description}</td>
          <td class="right">${unitCell}</td>
          <td class="center">${escapeHtml(String(line.quantity))}</td>
          <td class="right">${discountCell}</td>
          <td class="right">${amountCell}</td>
        </tr>`;
    })
    .join("");
}

function buildTotalsHtml(totals: InvoiceTotals): string {
  const anyDiscount =
    totals.lineDiscountTotal > 0 ||
    totals.orderDiscount > 0 ||
    totals.couponDiscount > 0;

  // Starts from the catalogue subtotal, which is what the Amount column above
  // adds up to, then walks down through each discount to the total charged.
  const rows: string[] = [
    `<tr><td>${
      anyDiscount ? "Subtotal (before discount)" : "Subtotal"
    }</td><td class="right">${escapeHtml(thb(totals.subtotal))}</td></tr>`,
  ];

  /** Name each promotion when they account for this bucket, else one row. */
  const pushDiscount = (
    bucket: "line" | "order",
    label: string,
    amount: number,
  ) => {
    if (amount <= 0) return;

    if (totals.promotionsApplyTo === bucket) {
      totals.promotions.forEach((promo) => {
        rows.push(
          `<tr class="discount"><td>Promotion${
            promo.name ? ` — ${escapeHtml(promo.name)}` : ""
          }</td><td class="right">-${escapeHtml(thb(promo.discountTHB))}</td></tr>`,
        );
      });
      return;
    }

    rows.push(
      `<tr class="discount"><td>${escapeHtml(label)}</td><td class="right">-${escapeHtml(
        thb(amount),
      )}</td></tr>`,
    );
  };

  pushDiscount("line", "Item discounts", totals.lineDiscountTotal);

  if (totals.lineDiscountTotal > 0) {
    rows.push(
      `<tr class="subtotal"><td>Subtotal after item discount</td><td class="right">${escapeHtml(
        thb(totals.subtotalAfterItemDiscount),
      )}</td></tr>`,
    );
  }

  pushDiscount("order", "Order discount", totals.orderDiscount);

  if (totals.couponDiscount > 0) {
    rows.push(
      `<tr class="discount"><td>Coupon${
        totals.couponCode ? ` (${escapeHtml(totals.couponCode)})` : ""
      }</td><td class="right">-${escapeHtml(thb(totals.couponDiscount))}</td></tr>`,
    );
  }

  rows.push(
    `<tr><td>Tax (${escapeHtml(formatRatePercent(totals.taxPercent))}%)</td><td class="right">${escapeHtml(
      thb(totals.tax),
    )}</td></tr>`,
  );

  rows.push(
    `<tr class="grand"><td>Total</td><td class="right">${escapeHtml(thb(totals.total))}</td></tr>`,
  );

  if (typeof totals.totalMMK === "number" && totals.totalMMK > 0) {
    rows.push(
      `<tr><td>Total (MMK)</td><td class="right">${escapeHtml(mmk(totals.totalMMK))}</td></tr>`,
    );
  }

  if (totals.totalSavings > 0) {
    rows.push(
      `<tr class="savings"><td>You saved</td><td class="right">${escapeHtml(
        thb(totals.totalSavings),
      )}</td></tr>`,
    );
  }

  return rows.join("");
}

/** Render the invoice as a standalone, printable HTML document. */
export function buildCustomerInvoiceHtml(invoice: CustomerInvoice): string {
  const { seller, buyer, meta, lines, totals } = invoice;

  const logoUrl = seller.showLogo ? toAbsoluteUrl(seller.logoUrl) : "";
  const footerImageUrl = toAbsoluteUrl(seller.footerImageUrl);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${escapeHtml(meta.invoiceNumber)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body {
        font-family: 'Noto Sans Myanmar', 'Noto Sans Thai', 'Segoe UI', Arial, sans-serif;
        color: #111827;
        font-size: 12px;
        line-height: 1.5;
        margin: 0;
        padding: 0;
      }
      .sheet { max-width: 190mm; margin: 0 auto; padding: 8px; }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        border-bottom: 2px solid #e11d48;
        padding-bottom: 14px;
      }
      .seller-name { font-size: 20px; font-weight: 700; }
      .seller-line { color: #4b5563; }
      .logo { max-height: 64px; max-width: 160px; object-fit: contain; margin-bottom: 6px; }
      .doc-title { font-size: 26px; font-weight: 700; color: #e11d48; text-align: right; letter-spacing: 1px; }
      .doc-meta { text-align: right; color: #4b5563; margin-top: 6px; }
      .doc-meta strong { color: #111827; }
      .parties { display: flex; gap: 24px; margin-top: 18px; }
      .party {
        flex: 1;
        border: 1px solid #fbcfe8;
        border-radius: 8px;
        padding: 12px 14px;
        background: #fff7fa;
      }
      .party h2 {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #be185d;
        margin: 0 0 8px;
      }
      .detail-row { display: flex; gap: 10px; margin: 3px 0; }
      .detail-label { width: 68px; flex: 0 0 68px; color: #6b7280; }
      .detail-value { flex: 1; font-weight: 600; word-break: break-word; }
      table.items { width: 100%; border-collapse: collapse; margin-top: 18px; }
      table.items th {
        text-align: left;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #6b7280;
        border-bottom: 1px solid #d1d5db;
        padding: 8px 6px;
      }
      table.items td { padding: 8px 6px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
      table.items td.num { color: #9ca3af; width: 26px; }
      .right { text-align: right; }
      .center { text-align: center; }
      .strong { font-weight: 700; }
      .item-name { font-weight: 600; }
      .item-variant { color: #6b7280; font-size: 11px; }
      .item-promo { color: #047857; font-size: 11px; }
      .was { color: #9ca3af; text-decoration: line-through; font-size: 11px; }
      .paid { color: #047857; font-size: 11px; }
      .saving { color: #047857; }
      .empty { text-align: center; color: #6b7280; padding: 18px 0; }
      .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
      table.totals { width: 62%; border-collapse: collapse; }
      table.totals td { padding: 5px 6px; }
      table.totals tr.discount td { color: #047857; padding-left: 14px; font-size: 11px; }
      table.totals tr.subtotal td { font-weight: 600; border-top: 1px dotted #d1d5db; }
      table.totals tr.grand td {
        font-size: 15px;
        font-weight: 700;
        border-top: 2px solid #111827;
        border-bottom: 2px solid #111827;
        padding: 9px 6px;
      }
      table.totals tr.savings td { font-weight: 700; color: #047857; }
      .footer {
        margin-top: 26px;
        border-top: 1px dashed #d1d5db;
        padding-top: 14px;
        text-align: center;
        color: #4b5563;
      }
      .footer .thanks { font-weight: 700; color: #111827; }
      .footer img { max-height: 90px; max-width: 100%; object-fit: contain; margin-top: 10px; }
      .note { margin-top: 10px; font-size: 10px; color: #9ca3af; text-align: center; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="top">
        <div>
          ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="" />` : ""}
          <div class="seller-name">${escapeHtml(seller.businessName || "Invoice")}</div>
          ${seller.branchName ? `<div class="seller-line">${escapeHtml(seller.branchName)}</div>` : ""}
          ${seller.address ? `<div class="seller-line">${escapeHtml(seller.address)}</div>` : ""}
          ${seller.phone ? `<div class="seller-line">Tel: ${escapeHtml(seller.phone)}</div>` : ""}
          ${seller.email ? `<div class="seller-line">${escapeHtml(seller.email)}</div>` : ""}
        </div>
        <div>
          <div class="doc-title">INVOICE</div>
          <div class="doc-meta">
            <div>Invoice No: <strong>${escapeHtml(meta.invoiceNumber)}</strong></div>
            ${meta.orderRef ? `<div>Order Ref: <strong>${escapeHtml(meta.orderRef)}</strong></div>` : ""}
            <div>Date: <strong>${escapeHtml(meta.issuedAt)}</strong></div>
            <div>Payment: <strong>${escapeHtml(meta.paymentMethod)}</strong></div>
            <div>Payment Status: <strong>${escapeHtml(meta.paymentStatus)}</strong></div>
            <div>Order Status: <strong>${escapeHtml(meta.orderStatus)}</strong></div>
          </div>
        </div>
      </div>

      <div class="parties">
        <div class="party">
          <h2>Billed To</h2>
          ${detailRow("Name", buyer.name)}
          ${detailRow("Phone", buyer.phone)}
          ${detailRow("Email", buyer.email)}
          ${detailRow("Account", buyer.accountId)}
        </div>
        <div class="party">
          <h2>Delivery Address</h2>
          ${
            buyer.address
              ? `<div class="detail-value">${escapeHtml(buyer.address)}</div>`
              : `<div class="detail-value" style="color:#6b7280;font-weight:400;">No delivery address recorded</div>`
          }
          ${detailRow("Contact", buyer.phone)}
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th class="right">Unit Price</th>
            <th class="center">Qty</th>
            <th class="right">Discount</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${buildLinesHtml(lines)}
        </tbody>
      </table>

      <div class="totals-wrap">
        <table class="totals">
          ${buildTotalsHtml(totals)}
        </table>
      </div>

      <div class="footer">
        <div class="thanks">Thank you for shopping with us!</div>
        ${seller.footerMessage ? `<div>${escapeHtml(seller.footerMessage)}</div>` : ""}
        ${footerImageUrl ? `<img src="${escapeHtml(footerImageUrl)}" alt="" />` : ""}
      </div>

      <div class="note">
        Amounts shown are the amounts charged at the time of purchase.
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Open the invoice in a new window and send it to the printer.
 *
 * Printing waits for the logo and footer images to settle, otherwise the browser
 * captures the page before they load and the invoice prints with gaps. A timeout
 * backs that up so a broken image URL can never block printing.
 *
 * @returns false when the popup was blocked, so the caller can tell the customer.
 */
export function printCustomerInvoice(invoice: CustomerInvoice): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  printWindow.document.write(buildCustomerInvoiceHtml(invoice));
  printWindow.document.close();

  let printed = false;
  const printNow = () => {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
  };

  const images = Array.from(printWindow.document.images);
  if (images.length === 0) {
    printNow();
    return true;
  }

  let settled = 0;
  const onSettled = () => {
    settled += 1;
    if (settled >= images.length) printNow();
  };

  images.forEach((img) => {
    if (img.complete) {
      onSettled();
    } else {
      img.onload = onSettled;
      img.onerror = onSettled;
    }
  });

  setTimeout(printNow, 1500);
  return true;
}
