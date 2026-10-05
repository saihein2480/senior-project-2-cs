import React from "react";

/**
 * Payment method icon + label, matching the POS transactions page
 * (plain gray-900 line icon with the text to the right).
 *
 * The icons are inline copies of lucide's credit-card, smartphone and truck
 * glyphs, so the storefront doesn't need the lucide-react dependency.
 *
 * cash -> credit card, scan / wallet -> smartphone, cod -> truck.
 */

type IconProps = { className?: string };

const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CreditCardIcon({ className = "" }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

function SmartphoneIcon({ className = "" }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function TruckIcon({ className = "" }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}

function iconFor(method: string) {
  switch (method.toLowerCase()) {
    case "scan":
    case "wallet":
      return SmartphoneIcon;
    case "cod":
      return TruckIcon;
    case "cash":
    default:
      return CreditCardIcon;
  }
}

export function PaymentMethodLabel({
  method,
  label,
  className = "",
}: {
  /** Raw payment method value, e.g. "cash", "scan", "wallet", "cod". */
  method: string | null | undefined;
  /** Text shown next to the icon. */
  label: React.ReactNode;
  className?: string;
}) {
  if (!method) {
    return <span className={className}>{label || "-"}</span>;
  }

  const Icon = iconFor(method);
  return (
    <span className={`inline-flex items-center whitespace-nowrap ${className}`}>
      <Icon className="h-4 w-4 shrink-0 text-gray-900" />
      <span className="ml-2">{label}</span>
    </span>
  );
}
