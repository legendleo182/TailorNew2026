import postgres from "postgres";
import {
  calculateBillingAnalytics,
  type OrderStatus,
  type PaymentChoice,
  type ProgressReason,
} from "../shared/billing";
import { SALESMEN, type Salesman } from "../shared/customer";

type SqlClient = postgres.Sql;

export type ShopRecord = {
  id: string;
  name: string;
  createdAt: string;
};

export type CustomerRecord = {
  id: string;
  name: string | null;
  address: string;
  mobile: string | null;
  salesman: Salesman;
  createdAt: string;
};

export type BillRecord = {
  id: string;
  shopId: string | null;
  customerId: string | null;
  shopName: string;
  customerName: string | null;
  customerSalesman: Salesman | null;
  customerAddress: string;
  customerMobile: string | null;
  stitchingAmount: number;
  balanceAmount: number;
  paymentChoice: PaymentChoice;
  status: OrderStatus;
  progressReason: ProgressReason;
  imageUrl: string | null;
  imageName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillInput = {
  shopId: string;
  customerId: string;
  stitchingAmount: number;
  balanceAmount: number;
  paymentChoice: PaymentChoice;
  status: OrderStatus;
  progressReason: ProgressReason;
  imageData?: string;
  imageName?: string;
};

let sqlClient: SqlClient | null = null;
let schemaPromise: Promise<void> | null = null;
let bucketPromise: Promise<void> | null = null;

function getDatabase() {
  if (sqlClient) return sqlClient;

  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    throw new Error("Supabase database connection is not configured.");
  }

  sqlClient = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return sqlClient;
}

function getSupabaseSettings() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase storage credentials are not configured.");
  }
  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

function storageHeaders(contentType?: string) {
  const { serviceRoleKey } = getSupabaseSettings();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

function encodedStoragePath(path: string) {
  return path
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");
}

async function ensureBillingSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const sql = getDatabase();
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS billing_shops (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, name)
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS billing_customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        name TEXT CHECK (char_length(btrim(name)) > 0),
        salesman TEXT NOT NULL DEFAULT 'Naveen C-11' CHECK (salesman IN ('Naveen C-11', 'Rajeev SC-10', 'Anand SC-13', 'Chander TSC-23')),
        address TEXT NOT NULL CHECK (char_length(btrim(address)) > 0),
        mobile TEXT NOT NULL CHECK (char_length(btrim(mobile)) > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS billing_bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        shop_id UUID REFERENCES billing_shops(id) ON DELETE SET NULL,
        customer_id UUID REFERENCES billing_customers(id) ON DELETE SET NULL,
        shop_name TEXT NOT NULL,
        customer_name TEXT,
        customer_salesman TEXT,
        customer_address TEXT NOT NULL,
        customer_mobile TEXT,
        stitching_amount NUMERIC(12, 2) NOT NULL CHECK (stitching_amount >= 0),
        balance_amount NUMERIC(12, 2) NOT NULL CHECK (balance_amount >= 0),
        payment_choice TEXT NOT NULL CHECK (payment_choice IN ('paid_to_shop', 'balance_with_owner')),
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
        progress_reason TEXT NOT NULL CHECK (progress_reason IN ('work_in_progress', 'fabric_not_received', 'order_completed')),
        image_key TEXT,
        image_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS salesman TEXT NOT NULL DEFAULT 'Naveen C-11'`);
    await sql.unsafe(`ALTER TABLE billing_customers ALTER COLUMN name DROP NOT NULL`);
    await sql.unsafe(`ALTER TABLE billing_customers ALTER COLUMN mobile DROP NOT NULL`);
    await sql.unsafe(`ALTER TABLE billing_bills ADD COLUMN IF NOT EXISTS customer_salesman TEXT`);
    await sql.unsafe(`ALTER TABLE billing_bills ALTER COLUMN customer_name DROP NOT NULL`);
    await sql.unsafe(`ALTER TABLE billing_bills ALTER COLUMN customer_mobile DROP NOT NULL`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS billing_shops_user_idx ON billing_shops(user_id)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS billing_customers_user_idx ON billing_customers(user_id)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS billing_bills_user_created_idx ON billing_bills(user_id, created_at DESC)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS billing_bills_status_idx ON billing_bills(user_id, status)`);
  })().catch(error => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

async function ensurePrivateImageBucket() {
  if (bucketPromise) return bucketPromise;

  bucketPromise = (async () => {
    const { url } = getSupabaseSettings();
    const current = await fetch(`${url}/storage/v1/bucket`, { headers: storageHeaders() });
    if (!current.ok) {
      throw new Error(`Unable to inspect secure bill image storage (${current.status}).`);
    }
    const buckets = (await current.json()) as Array<{ id?: string; name?: string }>;
    if (buckets.some(bucket => bucket.id === "bill-images" || bucket.name === "bill-images")) return;

    const created = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: storageHeaders("application/json"),
      body: JSON.stringify({
        id: "bill-images",
        name: "bill-images",
        public: false,
        file_size_limit: 8 * 1024 * 1024,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
      }),
    });

    if (!created.ok && created.status !== 409) {
      throw new Error(`Unable to create secure bill image storage (${created.status}).`);
    }
  })().catch(error => {
    bucketPromise = null;
    throw error;
  });

  return bucketPromise;
}

function decodeImage(imageData: string) {
  const match = imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/);
  if (!match) {
    throw new Error("Only JPEG, PNG, and WebP bill images are supported.");
  }

  const contentType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
    throw new Error("Bill images must be smaller than 8 MB.");
  }

  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return { bytes, contentType, extension };
}

async function uploadBillImage(userId: string, imageData: string, originalName?: string) {
  await ensurePrivateImageBucket();
  const { url } = getSupabaseSettings();
  const image = decodeImage(imageData);
  const key = `${userId}/bills/${crypto.randomUUID()}.${image.extension}`;
  const response = await fetch(`${url}/storage/v1/object/bill-images/${encodedStoragePath(key)}`, {
    method: "POST",
    headers: {
      ...storageHeaders(image.contentType),
      "x-upsert": "true",
    },
    body: image.bytes,
  });

  if (!response.ok) {
    throw new Error(`The bill image could not be uploaded (${response.status}).`);
  }

  return { key, imageName: originalName?.slice(0, 160) || "Bill image" };
}

async function deleteBillImage(key: string | null | undefined) {
  if (!key) return;
  try {
    const { url } = getSupabaseSettings();
    await fetch(`${url}/storage/v1/object/bill-images`, {
      method: "DELETE",
      headers: storageHeaders("application/json"),
      body: JSON.stringify({ prefixes: [key] }),
    });
  } catch (error) {
    console.warn("[Billing] Could not remove an unreferenced bill image", error);
  }
}

async function getSignedImageUrl(key: string | null) {
  if (!key) return null;
  try {
    await ensurePrivateImageBucket();
    const { url } = getSupabaseSettings();
    const response = await fetch(
      `${url}/storage/v1/object/sign/bill-images/${encodedStoragePath(key)}`,
      {
        method: "POST",
        headers: storageHeaders("application/json"),
        body: JSON.stringify({ expiresIn: 60 * 60 }),
      }
    );
    if (!response.ok) return null;
    const result = (await response.json()) as { signedURL?: string; signedUrl?: string };
    const signedPath = result.signedURL ?? result.signedUrl;
    return signedPath ? `${url}/storage/v1${signedPath}` : null;
  } catch (error) {
    console.warn("[Billing] Could not create private bill-image URL", error);
    return null;
  }
}

function toShop(row: Record<string, unknown>): ShopRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function toCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    id: String(row.id),
    name: row.name == null ? null : String(row.name),
    address: String(row.address),
    mobile: row.mobile == null ? null : String(row.mobile),
    salesman: SALESMEN.includes(String(row.salesman) as Salesman) ? String(row.salesman) as Salesman : "Naveen C-11",
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

async function toBill(row: Record<string, unknown>): Promise<BillRecord> {
  return {
    id: String(row.id),
    shopId: row.shop_id ? String(row.shop_id) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    shopName: String(row.shop_name),
    customerName: row.customer_name == null ? null : String(row.customer_name),
    customerSalesman: SALESMEN.includes(String(row.customer_salesman) as Salesman) ? String(row.customer_salesman) as Salesman : null,
    customerAddress: String(row.customer_address),
    customerMobile: row.customer_mobile == null ? null : String(row.customer_mobile),
    stitchingAmount: Number(row.stitching_amount),
    balanceAmount: Number(row.balance_amount),
    paymentChoice: row.payment_choice as PaymentChoice,
    status: row.status as OrderStatus,
    progressReason: row.progress_reason as ProgressReason,
    imageUrl: await getSignedImageUrl((row.image_key as string | null) ?? null),
    imageName: (row.image_name as string | null) ?? null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function fetchBillRow(userId: string, billId: string) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM billing_bills WHERE id = ${billId} AND user_id = ${userId} LIMIT 1
  `;
  const bill = rows[0];
  if (!bill) throw new Error("Bill not found.");
  return bill;
}

async function assertReferences(userId: string, shopId: string, customerId: string) {
  const sql = getDatabase();
  const shops = await sql<Record<string, unknown>[]>`
    SELECT id, name FROM billing_shops WHERE id = ${shopId} AND user_id = ${userId} LIMIT 1
  `;
  const customers = await sql<Record<string, unknown>[]>`
    SELECT id, name, salesman, address, mobile FROM billing_customers WHERE id = ${customerId} AND user_id = ${userId} LIMIT 1
  `;
  if (!shops[0]) throw new Error("Selected shop was not found.");
  if (!customers[0]) throw new Error("Selected customer was not found.");
  return { shop: shops[0], customer: customers[0] };
}

export function assertBillWorkflow(input: Pick<BillInput, "status" | "progressReason">) {
  if (input.status === "completed" && input.progressReason !== "order_completed") {
    throw new Error("Completed orders must use the Order completed status.");
  }
  if (input.status === "in_progress" && input.progressReason === "order_completed") {
    throw new Error("An active order needs Work in progress or Fabric not received as its status.");
  }
}

export async function listShops(userId: string) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT id, name, created_at FROM billing_shops WHERE user_id = ${userId} ORDER BY name ASC
  `;
  return rows.map(toShop);
}

export async function createShop(userId: string, name: string) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO billing_shops (user_id, name) VALUES (${userId}, ${name.trim()})
    RETURNING id, name, created_at
  `;
  return toShop(rows[0]);
}

export async function updateShop(userId: string, id: string, name: string) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    UPDATE billing_shops SET name = ${name.trim()}, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, name, created_at
  `;
  if (!rows[0]) throw new Error("Shop not found.");
  return toShop(rows[0]);
}

export async function deleteShop(userId: string, id: string) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<{ id: string }[]>`
    DELETE FROM billing_shops WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  if (!rows[0]) throw new Error("Shop not found.");
  return { success: true };
}

export async function listCustomers(userId: string) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT id, name, salesman, address, mobile, created_at FROM billing_customers
    WHERE user_id = ${userId} ORDER BY name ASC
  `;
  return rows.map(toCustomer);
}

export async function createCustomer(userId: string, data: Omit<CustomerRecord, "id" | "createdAt">) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO billing_customers (user_id, name, salesman, address, mobile)
    VALUES (${userId}, ${data.name?.trim() || null}, ${data.salesman}, ${data.address.trim()}, ${data.mobile?.trim() || null})
    RETURNING id, name, salesman, address, mobile, created_at
  `;
  return toCustomer(rows[0]);
}

export async function updateCustomer(userId: string, id: string, data: Omit<CustomerRecord, "id" | "createdAt">) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    UPDATE billing_customers
    SET name = ${data.name?.trim() || null}, salesman = ${data.salesman}, address = ${data.address.trim()}, mobile = ${data.mobile?.trim() || null}, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, name, salesman, address, mobile, created_at
  `;
  if (!rows[0]) throw new Error("Customer not found.");
  return toCustomer(rows[0]);
}

export async function deleteCustomer(userId: string, id: string) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<{ id: string }[]>`
    DELETE FROM billing_customers WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  if (!rows[0]) throw new Error("Customer not found.");
  return { success: true };
}

export async function listBills(
  userId: string,
  filters: { search?: string; shopId?: string; paymentChoice?: PaymentChoice; status?: OrderStatus }
) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const values: string[] = [userId];
  const conditions = ["user_id = $1"];

  if (filters.search?.trim()) {
    values.push(`%${filters.search.trim()}%`);
    const placeholder = `$${values.length}`;
    conditions.push(`(
      customer_name ILIKE ${placeholder}
      OR customer_salesman ILIKE ${placeholder}
      OR ('{' || customer_salesman || '} ' || customer_name) ILIKE ${placeholder}
      OR customer_address ILIKE ${placeholder}
      OR customer_mobile ILIKE ${placeholder}
      OR stitching_amount::TEXT ILIKE ${placeholder}
      OR balance_amount::TEXT ILIKE ${placeholder}
    )`);
  }
  if (filters.shopId) {
    values.push(filters.shopId);
    conditions.push(`shop_id = $${values.length}`);
  }
  if (filters.paymentChoice) {
    values.push(filters.paymentChoice);
    conditions.push(`payment_choice = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  const rows = await sql.unsafe<Record<string, unknown>[]>(
    `SELECT * FROM billing_bills WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    values as any
  );
  return Promise.all(rows.map(toBill));
}

export async function createBill(userId: string, input: BillInput) {
  await ensureBillingSchema();
  assertBillWorkflow(input);
  const sql = getDatabase();
  const { shop, customer } = await assertReferences(userId, input.shopId, input.customerId);
  const customerName = customer.name == null ? null : String(customer.name);
  const customerMobile = customer.mobile == null ? null : String(customer.mobile);
  const image = input.imageData ? await uploadBillImage(userId, input.imageData, input.imageName) : null;

  try {
    const rows = await sql<Record<string, unknown>[]>`
      INSERT INTO billing_bills (
        user_id, shop_id, customer_id, shop_name, customer_name, customer_salesman, customer_address, customer_mobile,
        stitching_amount, balance_amount, payment_choice, status, progress_reason, image_key, image_name
      ) VALUES (
        ${userId}, ${input.shopId}, ${input.customerId}, ${String(shop.name)}, ${customerName}, ${String(customer.salesman)},
        ${String(customer.address)}, ${customerMobile}, ${input.stitchingAmount}, ${input.balanceAmount},
        ${input.paymentChoice}, ${input.status}, ${input.progressReason}, ${image?.key ?? null}, ${image?.imageName ?? null}
      ) RETURNING *
    `;
    return toBill(rows[0]);
  } catch (error) {
    await deleteBillImage(image?.key);
    throw error;
  }
}

export async function updateBill(userId: string, id: string, input: BillInput) {
  await ensureBillingSchema();
  assertBillWorkflow(input);
  const sql = getDatabase();
  const existing: Record<string, unknown> = await fetchBillRow(userId, id);
  const { shop, customer } = await assertReferences(userId, input.shopId, input.customerId);
  const customerName = customer.name == null ? null : String(customer.name);
  const customerMobile = customer.mobile == null ? null : String(customer.mobile);
  const image = input.imageData ? await uploadBillImage(userId, input.imageData, input.imageName) : null;

  try {
    const rows = await (sql<Record<string, unknown>[]>`
      UPDATE billing_bills SET
        shop_id = ${input.shopId}, customer_id = ${input.customerId}, shop_name = ${String(shop.name)},
        customer_name = ${customerName}, customer_salesman = ${String(customer.salesman)}, customer_address = ${String(customer.address)},
        customer_mobile = ${customerMobile}, stitching_amount = ${input.stitchingAmount},
        balance_amount = ${input.balanceAmount}, payment_choice = ${input.paymentChoice}, status = ${input.status},
        progress_reason = ${input.progressReason}, image_key = ${image?.key ?? (existing.image_key as string | null)},
        image_name = ${image?.imageName ?? (existing.image_name as string | null)}, updated_at = now()
      WHERE id = ${id} AND user_id = ${userId} RETURNING *
    ` as unknown as Promise<Record<string, unknown>[]>);
    const updated = await toBill(rows[0]);
    if (image?.key) await deleteBillImage((existing.image_key as string | null) ?? null);
    return updated;
  } catch (error) {
    await deleteBillImage(image?.key);
    throw error;
  }
}

export async function deleteBill(userId: string, id: string) {
  const existing = await fetchBillRow(userId, id);
  const sql = getDatabase();
  await sql`DELETE FROM billing_bills WHERE id = ${id} AND user_id = ${userId}`;
  await deleteBillImage((existing.image_key as string | null) ?? null);
  return { success: true };
}

export async function clearBillImage(userId: string, id: string) {
  const existing = await fetchBillRow(userId, id);
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    UPDATE billing_bills
    SET image_key = NULL, image_name = NULL, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `;
  await deleteBillImage((existing.image_key as string | null) ?? null);
  return toBill(rows[0]);
}

export async function completeBill(userId: string, id: string) {
  await ensureBillingSchema();
  const sql = getDatabase();
  const rows = await sql<Record<string, unknown>[]>`
    UPDATE billing_bills
    SET status = 'completed', progress_reason = 'order_completed', updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `;
  if (!rows[0]) throw new Error("Bill not found.");
  return toBill(rows[0]);
}

export async function getDashboard(userId: string) {
  const bills = await listBills(userId, {});
  const analytics = calculateBillingAnalytics(bills);
  const [shops, customers] = await Promise.all([listShops(userId), listCustomers(userId)]);
  return {
    analytics,
    shopCount: shops.length,
    customerCount: customers.length,
    billCount: bills.length,
    activeBillCount: bills.filter(bill => bill.status === "in_progress").length,
    recentBills: bills.slice(0, 5),
  };
}
