export const SALESMEN = ["Naveen C-11", "Rajeev SC-10", "Anand SC-13", "Chander TSC-23"] as const;

export type Salesman = (typeof SALESMEN)[number];

export function formatCustomerName(salesman: string | null | undefined, customerName: string | null | undefined) {
  const safeName = customerName?.trim() || "Unnamed customer";
  return salesman ? `{${salesman}} ${safeName}` : safeName;
}
