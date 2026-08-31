import { describe, expect, it } from "vitest";
import { SALESMEN, formatCustomerName } from "../shared/customer";

describe("customer salesman display", () => {
  it("keeps the four approved salesman choices in order", () => {
    expect(SALESMEN).toEqual(["Naveen C-11", "Rajeev SC-10", "Anand SC-13", "Chander TSC-23"]);
  });

  it("puts the salesman in curly brackets before the customer name", () => {
    expect(formatCustomerName("Naveen C-11", "Asha Devi")).toBe("{Naveen C-11} Asha Devi");
  });

  it("keeps legacy customer names readable when no salesman is available", () => {
    expect(formatCustomerName(null, "Legacy customer")).toBe("Legacy customer");
  });
});
