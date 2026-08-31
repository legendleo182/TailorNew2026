import { calculateBillingAnalytics, type AnalyticsBill } from "./billing";
import { formatCustomerName } from "./customer";

export type ReportBill = AnalyticsBill & {
  createdAt: string;
  shopName: string;
  customerName: string | null;
  customerSalesman?: string | null;
  customerAddress: string;
  customerMobile: string | null;
  status: "in_progress" | "completed";
  progressReason: "work_in_progress" | "fabric_not_received" | "order_completed";
  imageName: string | null;
};

export function filterBillsByDate<T extends { createdAt: string }>(bills: T[], from?: string, to?: string) {
  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  return bills.filter(bill => {
    const billTime = new Date(bill.createdAt).getTime();
    return Number.isFinite(billTime) && billTime >= fromTime && billTime <= toTime;
  });
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function paymentChoiceText(bill: ReportBill) {
  return bill.paymentChoice === "paid_to_shop" ? `Bill paid to ${bill.shopName}` : "Mere paas balance amount hai";
}

function reasonText(reason: ReportBill["progressReason"]) {
  return reason === "work_in_progress" ? "Work in progress" : reason === "fabric_not_received" ? "Fabric not received" : "Order completed";
}

export function buildReportCsv(bills: ReportBill[]) {
  const header = ["Bill date", "Customer name", "Address", "Mobile number", "Shop", "Stitching amount", "Balance amount", "Payment choice", "Order status", "Progress reason", "Image attached"];
  const rows = bills.map(bill => [
    new Date(bill.createdAt).toLocaleDateString("en-GB"),
    formatCustomerName(bill.customerSalesman, bill.customerName),
    bill.customerAddress,
    bill.customerMobile,
    bill.shopName,
    bill.stitchingAmount.toFixed(2),
    bill.balanceAmount.toFixed(2),
    paymentChoiceText(bill),
    bill.status === "completed" ? "Completed" : "In progress",
    reasonText(bill.progressReason),
    bill.imageName ? "Yes" : "No",
  ]);
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
}

export function calculateReportAnalytics(bills: ReportBill[]) {
  return calculateBillingAnalytics(bills);
}

export type MonthlySummary = {
  key: string;
  label: string;
  billCount: number;
  totalStitchingAmount: number;
  totalPaidBalance: number;
  totalUnpaidBalance: number;
  completedCount: number;
  inProgressCount: number;
};

export function getRecentMonthlySummaries(bills: ReportBill[], monthCount = 6, referenceDate = new Date()): MonthlySummary[] {
  const safeMonthCount = Math.max(1, Math.floor(monthCount));
  const firstMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - safeMonthCount + 1, 1);

  return Array.from({ length: safeMonthCount }, (_, index) => {
    const monthStart = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const matchingBills = bills.filter(bill => {
      const billDate = new Date(bill.createdAt);
      return billDate.getFullYear() === year && billDate.getMonth() === month;
    });
    const totals = calculateBillingAnalytics(matchingBills);

    return {
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(monthStart),
      billCount: matchingBills.length,
      totalStitchingAmount: totals.totalStitchingAmount,
      totalPaidBalance: totals.totalPaidBalance,
      totalUnpaidBalance: totals.totalUnpaidBalance,
      completedCount: matchingBills.filter(bill => bill.status === "completed").length,
      inProgressCount: matchingBills.filter(bill => bill.status === "in_progress").length,
    };
  });
}
