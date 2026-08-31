import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SALESMEN } from "../shared/customer";
import {
  completeBill,
  clearBillImage,
  createBill,
  createCustomer,
  createShop,
  deleteBill,
  deleteCustomer,
  deleteShop,
  getDashboard,
  listBills,
  listCustomers,
  listShops,
  updateBill,
  updateCustomer,
  updateShop,
} from "./billing";
import { protectedProcedure, router } from "./_core/trpc";

const paymentChoice = z.enum(["paid_to_shop", "balance_with_owner"]);
const orderStatus = z.enum(["in_progress", "completed"]);
const progressReason = z.enum(["work_in_progress", "fabric_not_received", "order_completed"]);
const salesman = z.enum(SALESMEN);
const optionalText = (max: number) => z.preprocess(value => typeof value === "string" && !value.trim() ? null : value, z.string().trim().max(max).nullable());
const imageData = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,/, "Use a JPEG, PNG, or WebP image.")
  .max(12_000_000, "Please select a smaller bill image.");

const billInput = z
  .object({
    shopId: z.string().uuid(),
    customerId: z.string().uuid(),
    stitchingAmount: z.coerce.number().min(0).max(99_999_999),
    balanceAmount: z.coerce.number().min(0).max(99_999_999),
    paymentChoice,
    status: orderStatus,
    progressReason,
    imageData: imageData.optional(),
    imageName: z.string().trim().max(160).optional(),
  })
  .superRefine((data, context) => {
    if (data.status === "completed" && data.progressReason !== "order_completed") {
      context.addIssue({ code: "custom", path: ["progressReason"], message: "Completed orders use Order completed." });
    }
    if (data.status === "in_progress" && data.progressReason === "order_completed") {
      context.addIssue({ code: "custom", path: ["progressReason"], message: "Choose an active order status." });
    }
  });

function safely<T>(action: () => Promise<T>) {
  return action().catch(error => {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "The billing action could not be completed.",
    });
  });
}

export const billingRouter = router({
  dashboard: protectedProcedure.query(({ ctx }) => safely(() => getDashboard(ctx.user.openId))),
  analytics: protectedProcedure.query(async ({ ctx }) => (await getDashboard(ctx.user.openId)).analytics),
  shops: router({
    list: protectedProcedure.query(({ ctx }) => safely(() => listShops(ctx.user.openId))),
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1, "Shop name is required.").max(120) }))
      .mutation(({ ctx, input }) => safely(() => createShop(ctx.user.openId, input.name))),
    update: protectedProcedure
      .input(z.object({ id: z.string().uuid(), name: z.string().trim().min(1, "Shop name is required.").max(120) }))
      .mutation(({ ctx, input }) => safely(() => updateShop(ctx.user.openId, input.id, input.name))),
    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => safely(() => deleteShop(ctx.user.openId, input.id))),
  }),
  customers: router({
    list: protectedProcedure.query(({ ctx }) => safely(() => listCustomers(ctx.user.openId))),
    create: protectedProcedure
      .input(z.object({ name: optionalText(120), salesman, address: z.string().trim().min(1).max(500), mobile: optionalText(30) }))
      .mutation(({ ctx, input }) => safely(() => createCustomer(ctx.user.openId, input))),
    update: protectedProcedure
      .input(z.object({ id: z.string().uuid(), name: optionalText(120), salesman, address: z.string().trim().min(1).max(500), mobile: optionalText(30) }))
      .mutation(({ ctx, input }) => safely(() => updateCustomer(ctx.user.openId, input.id, input))),
    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => safely(() => deleteCustomer(ctx.user.openId, input.id))),
  }),
  bills: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().trim().max(200).optional(), shopId: z.string().uuid().optional(), paymentChoice: paymentChoice.optional(), status: orderStatus.optional() }))
      .query(({ ctx, input }) => safely(() => listBills(ctx.user.openId, input))),
    create: protectedProcedure.input(billInput).mutation(({ ctx, input }) => safely(() => createBill(ctx.user.openId, input))),
    update: protectedProcedure
      .input(z.object({ id: z.string().uuid(), data: billInput }))
      .mutation(({ ctx, input }) => safely(() => updateBill(ctx.user.openId, input.id, input.data))),
    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => safely(() => deleteBill(ctx.user.openId, input.id))),
    clearImage: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => safely(() => clearBillImage(ctx.user.openId, input.id))),
    complete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => safely(() => completeBill(ctx.user.openId, input.id))),
  }),
});
