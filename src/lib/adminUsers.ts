import { getSupabase } from "./supabase";
import { hashPassword, verifyPassword } from "./password";
import type { AdminRole } from "./adminSections";

/**
 * Named admin accounts — the teachers, and anyone else given a way in.
 *
 * The environment password (ADMIN_PASSWORD) still works and still grants
 * `full`. That is on purpose: it is the owner's key, it needs no database, and
 * it means a mistake in this table can never lock him out of his own admin.
 */

export type AdminUser = {
  id: string;
  name: string;
  username: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
};

type AdminUserRow = {
  id: string;
  name: string;
  username: string;
  password_hash: string;
  password_salt: string;
  role: AdminRole;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
};

function fromRow(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await getSupabase()
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as AdminUserRow[]).map(fromRow);
}

export async function findAdminUser(id: string): Promise<AdminUser | undefined> {
  const { data, error } = await getSupabase().from("admin_users").select("*").eq("id", id).maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "22P02") return undefined;
    throw error;
  }
  return data ? fromRow(data as AdminUserRow) : undefined;
}

export async function createAdminUser(input: {
  name: string;
  username: string;
  password: string;
  role: AdminRole;
}): Promise<AdminUser> {
  const { hash, salt } = hashPassword(input.password);
  const { data, error } = await getSupabase()
    .from("admin_users")
    .insert({
      name: input.name,
      username: input.username.trim().toLowerCase(),
      password_hash: hash,
      password_salt: salt,
      role: input.role,
    })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as AdminUserRow);
}

export async function updateAdminUser(
  id: string,
  patch: { name?: string; role?: AdminRole; active?: boolean; password?: string }
): Promise<AdminUser | undefined> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.password) {
    const { hash, salt } = hashPassword(patch.password);
    row.password_hash = hash;
    row.password_salt = salt;
  }
  if (Object.keys(row).length === 0) return findAdminUser(id);

  const { data, error } = await getSupabase()
    .from("admin_users")
    .update(row)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as AdminUserRow) : undefined;
}

export async function deleteAdminUser(id: string): Promise<void> {
  const { error } = await getSupabase().from("admin_users").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Checks a username/password against the table.
 *
 * A deactivated account fails exactly like a wrong password — the caller
 * cannot tell which, and neither can whoever is trying usernames.
 */
export async function verifyAdminLogin(
  username: string,
  password: string
): Promise<AdminUser | null> {
  const { data, error } = await getSupabase()
    .from("admin_users")
    .select("*")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as AdminUserRow;
  if (!row.active) return null;
  if (!verifyPassword(password, row.password_hash, row.password_salt)) return null;

  await getSupabase()
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", row.id);

  return fromRow(row);
}
