import { describe, expect, it } from "vitest";
import { calculateBillingAnalytics, PROGRESS_REASON_LABELS, PROGRESS_REASON_TONES } from "../shared/billing";
import { assertBillWorkflow } from "./billing";

describe("billing analytics", () => {
  it("separates paid and owner-held balance while calculating the 50% stitching deduction", () => {
    const analytics = calculateBillingAnalytics([
      { stitchingAmount: 1_000, balanceAmount: 400, paymentChoice: "paid_to_shop" },
      { stitchingAmount: 600, balanceAmount: 250, paymentChoice: "balance_with_owner" },
    ]);

    expect(analytics).toEqual({
      totalStitchingAmount: 1_600,
      totalPaidBalance: 400,
      totalUnpaidBalance: 250,
      deductedStitchingAmount: 800,
    });
  });

  it("returns zero-valued totals without bills", () => {
    expect(calculateBillingAnalytics([])).toEqual({
      totalStitchingAmount: 0,
      totalPaidBalance: 0,
      totalUnpaidBalance: 0,
      deductedStitchingAmount: 0,
    });
  });
});

describe("bill status presentation", () => {
  it("keeps the required labels and indicator colors stable", () => {
    expect(PROGRESS_REASON_LABELS).toEqual({
      work_in_progress: "Work in progress",
      fabric_not_received: "Fabric not received",
      order_completed: "Order completed",
    });
    expect(PROGRESS_REASON_TONES).toEqual({
      work_in_progress: "yellow",
      fabric_not_received: "red",
      order_completed: "green",
    });
  });
});

describe("bill lifecycle validation", () => {
  it("requires the completed reason when an order is complete", () => {
    expect(() => assertBillWorkflow({ status: "completed", progressReason: "work_in_progress" })).toThrow(
      "Completed orders must use the Order completed status."
    );
  });

  it("requires an active progress reason while an order is in progress", () => {
    expect(() => assertBillWorkflow({ status: "in_progress", progressReason: "order_completed" })).toThrow(
      "An active order needs Work in progress or Fabric not received as its status."
    );
  });

  it("accepts the two required active order statuses", () => {
    expect(() => assertBillWorkflow({ status: "in_progress", progressReason: "work_in_progress" })).not.toThrow();
    expect(() => assertBillWorkflow({ status: "in_progress", progressReason: "fabric_not_received" })).not.toThrow();
  });
});
