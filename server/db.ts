import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertOrder, InsertUser, orders, users, staffAccounts, type StaffAccount } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = 'admin';
    updateSet.role = 'admin';
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listOrders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).orderBy(desc(orders.createdAt));
}

export async function createOrder(order: InsertOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(orders).values(order);
  return Number(result[0].insertId);
}

export async function setOrderHandedOver(id: number, handedOver: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(orders).set({ handedOver: handedOver ? 1 : 0 }).where(eq(orders.id, id));
}


export async function countStaffAccounts() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: staffAccounts.id }).from(staffAccounts).limit(1);
  return rows.length;
}

export async function createStaffAccount(input: { email: string; name: string; passwordHash: string; role: "admin" | "staff" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(staffAccounts).values({ ...input, isActive: 1 });
  return Number(result[0].insertId);
}

export async function getStaffByEmail(email: string): Promise<StaffAccount | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(staffAccounts).where(eq(staffAccounts.email, email.toLowerCase())).limit(1);
  return rows[0];
}

export async function getStaffById(id: number): Promise<StaffAccount | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(staffAccounts).where(eq(staffAccounts.id, id)).limit(1);
  return rows[0];
}

export async function listStaffAccounts() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select({ id: staffAccounts.id, email: staffAccounts.email, name: staffAccounts.name, role: staffAccounts.role, isActive: staffAccounts.isActive, createdAt: staffAccounts.createdAt, lastSignedIn: staffAccounts.lastSignedIn }).from(staffAccounts).orderBy(staffAccounts.createdAt);
}

export async function setStaffActive(id: number, active: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(staffAccounts).set({ isActive: active ? 1 : 0 }).where(eq(staffAccounts.id, id));
}

export async function updateStaffLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(staffAccounts).set({ lastSignedIn: new Date() }).where(eq(staffAccounts.id, id));
}
