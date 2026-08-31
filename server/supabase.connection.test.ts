import postgres from "postgres";
import { describe, expect, it } from "vitest";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;

describe("Supabase connection", () => {
  it("authenticates the configured service role against Supabase", async () => {
    expect(supabaseUrl).toBeTruthy();
    expect(serviceRoleKey).toBeTruthy();

    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: serviceRoleKey as string,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    expect(response.status, await response.text()).toBe(200);
  }, 15_000);

  it("connects to the configured Supabase PostgreSQL database", async () => {
    expect(databaseUrl).toBeTruthy();

    const sql = postgres(databaseUrl as string, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 1,
    });

    try {
      const result = await sql<{ connection_ok: number }[]>`select 1 as connection_ok`;
      expect(result[0]?.connection_ok).toBe(1);
    } finally {
      await sql.end({ timeout: 2 });
    }
  }, 15_000);
});
