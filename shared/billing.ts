export const PAYMENT_CHOICES = ["paid_to_shop", "balance_with_owner"] as const;
export const ORDER_STATUSES = ["in_progress", "completed"] as const;
export const PROGRESS_REASONS = [
  "work_in_progress",
  "fabric_not_received",
  "order_completed",
] as const;

export type PaymentChoice = (typeof PAYMENT_CHOICES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type ProgressReason = (typeof PROGRESS_REASONS)[number];

export const PROGRESS_REASON_LABELS: Record<ProgressReason, string> = {
  work_in_progress: "Work in progress",
  fabric_not_received: "Fabric not received",
  order_completed: "Order completed",
};

export const PROGRESS_REASON_TONES: Record<ProgressReason, "yellow" | "red" | "green"> = {
  work_in_progress: "yellow",
  fabric_not_received: "red",
  order_completed: "green",
};

export type AnalyticsBill = {
  stitchingAmount: number;
  balanceAmount: number;
  paymentChoice: PaymentChoice;
};

export function calculateBillingAnalytics(bills: AnalyticsBill[]) {
  const totalStitchingAmount = bills.reduce((total, bill) => total + bill.stitchingAmount, 0);
  const totalPaidBalance = bills
    .filter(bill => bill.paymentChoice === "paid_to_shop")
    .reduce((total, bill) => total + bill.balanceAmount, 0);
  const totalUnpaidBalance = bills
    .filter(bill => bill.paymentChoice === "balance_with_owner")
    .reduce((total, bill) => total + bill.balanceAmount, 0);

  return {
    totalStitchingAmount,
    totalPaidBalance,
    totalUnpaidBalance,
    deductedStitchingAmount: totalStitchingAmount * 0.5,
  };
}
