import { describe, expect, it } from "vitest";
import { buildReportCsv, filterBillsByDate, getRecentMonthlySummaries, type ReportBill } from "../shared/reporting";

const bills: ReportBill[] = [
  { createdAt: "2026-08-01T10:00:00.000Z", shopName: "Noor Boutique", customerName: "Asha, Devi", customerAddress: "Main \"Market\"", customerMobile: "9876543210", stitchingAmount: 500, balanceAmount: 150, paymentChoice: "paid_to_shop", status: "in_progress", progressReason: "work_in_progress", imageName: "order.jpg" },
  { createdAt: "2026-08-15T10:00:00.000Z", shopName: "Noor Boutique", customerName: "Riya", customerAddress: "Station Road", customerMobile: "9876500000", stitchingAmount: 700, balanceAmount: 200, paymentChoice: "balance_with_owner", status: "completed", progressReason: "order_completed", imageName: null },
  { createdAt: "2026-09-02T10:00:00.000Z", shopName: "Kiran Silai", customerName: "Farah", customerAddress: "Lake View", customerMobile: "9876500001", stitchingAmount: 900, balanceAmount: 0, paymentChoice: "paid_to_shop", status: "in_progress", progressReason: "fabric_not_received", imageName: null },
];

describe("report exports", () => {
  it("filters records inclusively within a selected date range", () => {
    expect(filterBillsByDate(bills, "2026-08-01", "2026-08-31").map(bill => bill.customerName)).toEqual(["Asha, Devi", "Riya"]);
  });

  it("supports open-ended report date ranges", () => {
    expect(filterBillsByDate(bills, "2026-08-15").map(bill => bill.customerName)).toEqual(["Riya", "Farah"]);
    expect(filterBillsByDate(bills, undefined, "2026-08-15").map(bill => bill.customerName)).toEqual(["Asha, Devi", "Riya"]);
  });

  it("exports spreadsheet-safe CSV with escaped text and selected bill values", () => {
    const csv = buildReportCsv([bills[0]]);
    expect(csv).toContain('"Asha, Devi"');
    expect(csv).toContain('"Main ""Market"""');
    expect(csv).toContain('"Bill paid to Noor Boutique"');
    expect(csv).toContain('"Yes"');
  });

  it("exports only the records belonging to the selected date range", () => {
    const augustCsv = buildReportCsv(filterBillsByDate(bills, "2026-08-01", "2026-08-31"));
    expect(augustCsv).toContain('"Asha, Devi"');
    expect(augustCsv).toContain('"Riya"');
    expect(augustCsv).not.toContain('"Farah"');
  });

  it("builds consecutive monthly summaries including zero-bill months", () => {
    const summaries = getRecentMonthlySummaries(bills, 3, new Date("2026-09-24T12:00:00.000Z"));
    expect(summaries.map(summary => summary.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(summaries[0]).toMatchObject({ billCount: 0, totalStitchingAmount: 0, completedCount: 0 });
    expect(summaries[1]).toMatchObject({ billCount: 2, totalStitchingAmount: 1200, totalPaidBalance: 150, totalUnpaidBalance: 200, completedCount: 1, inProgressCount: 1 });
    expect(summaries[2]).toMatchObject({ billCount: 1, totalStitchingAmount: 900, totalPaidBalance: 0, inProgressCount: 1 });
  });
});
