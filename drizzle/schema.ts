import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 120 }).notNull(),
  address: text("address").notNull(),
  itemsJson: text("itemsJson").notNull(),
  deliveryEnabled: int("deliveryEnabled").notNull().default(0),
  shippingRegion: varchar("shippingRegion", { length: 32 }),
  shippingAmount: int("shippingAmount").notNull().default(0),
  totalAmount: int("totalAmount").notNull().default(0),
  handedOver: int("handedOver").notNull().default(0),
  notes: text("notes"),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;


export const staffAccounts = mysqlTable("staff_accounts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "staff"]).default("staff").notNull(),
  isActive: int("isActive").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type StaffAccount = typeof staffAccounts.$inferSelect;
