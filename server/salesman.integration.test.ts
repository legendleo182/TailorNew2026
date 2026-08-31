import { afterAll, describe, expect, it } from "vitest";
import { createBill, createCustomer, createShop, deleteBill, deleteCustomer, deleteShop, listBills, updateCustomer, updateBill } from "./billing";

describe.skipIf(!process.env.RUN_SUPABASE_INTEGRATION_TESTS)("salesman persistence integration", () => {
  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const userId = `salesman-test-${crypto.randomUUID()}`;
  let shopId = "";
  let customerId = "";
  let optionalCustomerId = "";
  let billId = "";

  afterAll(async () => {
    if (billId) await deleteBill(userId, billId);
    if (customerId) await deleteCustomer(userId, customerId);
    if (optionalCustomerId) await deleteCustomer(userId, optionalCustomerId);
    if (shopId) await deleteShop(userId, shopId);
  });

  it("persists salesman on customers and snapshots it on bills", async () => {
    const shop = await createShop(userId, `Salesman test shop ${Date.now()}`);
    shopId = shop.id;
    const customer = await createCustomer(userId, {
      name: "Salesman Test Customer",
      salesman: "Rajeev SC-10",
      address: "Test address",
      mobile: "9999999999",
    });
    customerId = customer.id;
    expect(customer.salesman).toBe("Rajeev SC-10");

    const optionalCustomer = await createCustomer(userId, {
      name: null,
      salesman: "Chander TSC-23",
      address: "Optional contact address",
      mobile: null,
    });
    optionalCustomerId = optionalCustomer.id;
    expect(optionalCustomer.name).toBeNull();
    expect(optionalCustomer.mobile).toBeNull();

    const bill = await createBill(userId, {
      shopId,
      customerId,
      stitchingAmount: 500,
      balanceAmount: 100,
      paymentChoice: "balance_with_owner",
      status: "in_progress",
      progressReason: "work_in_progress",
      imageData: tinyPng,
      imageName: "test-bill.png",
    });
    billId = bill.id;
    expect(bill.customerSalesman).toBe("Rajeev SC-10");
    expect(bill.imageUrl).toBeTruthy();

    const updatedCustomer = await updateCustomer(userId, customerId, {
      name: customer.name,
      salesman: "Anand SC-13",
      address: customer.address,
      mobile: customer.mobile,
    });
    expect(updatedCustomer.salesman).toBe("Anand SC-13");

    const updatedBill = await updateBill(userId, billId, {
      shopId,
      customerId,
      stitchingAmount: 500,
      balanceAmount: 100,
      paymentChoice: "balance_with_owner",
      status: "in_progress",
      progressReason: "work_in_progress",
    });
    expect(updatedBill.customerSalesman).toBe("Anand SC-13");

    const salesmanMatches = await listBills(userId, { search: "Anand SC-13" });
    expect(salesmanMatches.some(item => item.id === billId)).toBe(true);
    const formattedNameMatches = await listBills(userId, { search: "{Anand SC-13} Salesman Test Customer" });
    expect(formattedNameMatches.some(item => item.id === billId)).toBe(true);
  });
});
