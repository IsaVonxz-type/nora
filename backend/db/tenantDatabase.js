import { getTenantId, requireTenantId } from "../src/tenancy/context.js";

export function createTenantDatabase(pool) {
  let roleCheck;

  async function verifyRole() {
    roleCheck ??= pool.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    ).then(({ rows }) => {
      if (!rows.length || rows[0].rolsuper || rows[0].rolbypassrls) {
        throw new Error("Database runtime role must be NOSUPERUSER NOBYPASSRLS");
      }
    }).catch((error) => {
      roleCheck = undefined;
      throw error;
    });
    return roleCheck;
  }

  async function connect() {
    const tenantId = requireTenantId();
    await verifyRole();
    const client = await pool.connect();
    let transactionOpen = false;
    return {
      async query(text, params) {
        const beginsTransaction = typeof text === "string" && /^\s*BEGIN\s*;?\s*$/i.test(text);
        if (beginsTransaction) transactionOpen = true;
        const result = await client.query(text, params);
        if (beginsTransaction) {
          await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
        }
        if (typeof text === "string" && /^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i.test(text)) transactionOpen = false;
        return result;
      },
      release: (error) => client.release(error || (transactionOpen ? new Error("Unclosed tenant transaction") : undefined)),
    };
  }

  async function query(text, params) {
    await verifyRole();
    if (!getTenantId()) return pool.query(text, params);
    const client = await connect();
    let failure;
    try {
      await client.query("BEGIN");
      const result = await client.query(text, params);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        failure = rollbackError;
      }
      throw error;
    } finally {
      client.release(failure);
    }
  }

  return { connect, query };
}
