const API_URL = "https://still-voice-2835taikai-api.hs-0319yu.workers.dev/";
const TOKEN_KEY = "taikai_session_token";

export type ApiUser = { staffId: string; email: string; name: string; role: "admin" | "staff" };
export type ApiStaff = { id: string; email: string; name: string; role: "admin" | "staff"; isActive: boolean };
export type ApiOrderItem = {
  id: string; name: string; price: number; quantity: number; embroidery: boolean;
  embroideryText: string; embroideryColor: string; embroideryPrice: number;
};
export type ApiOrder = {
  id: string; orderId: string; phone: string; customerName: string; address: string;
  items: ApiOrderItem[]; deliveryEnabled: boolean; shippingRegion: string | null;
  shippingAmount: number; totalAmount: number; handedOver: boolean; notes: string | null;
  createdBy: string; createdAt: Date; updatedAt: Date;
};

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function saveToken(token?: string) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function callApi<T = any>(action: string, payload: Record<string, unknown> = {}, authenticated = true): Promise<T> {
  const body = { action, ...(authenticated && getToken() ? { token: getToken() } : {}), ...payload };
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let result: any;
  try { result = await response.json(); }
  catch { throw new Error(`API応答を読み取れませんでした（HTTP ${response.status}）`); }
  if (!response.ok || result?.success === false) throw new Error(result?.message || `APIエラー（HTTP ${response.status}）`);
  return result as T;
}

function normalizeOrder(raw: any): ApiOrder {
  const id = String(raw.orderId ?? raw.id ?? "");
  return {
    ...raw,
    id,
    orderId: id,
    phone: String(raw.phone ?? ""),
    customerName: String(raw.customerName ?? ""),
    address: String(raw.address ?? ""),
    items: Array.isArray(raw.items) ? raw.items.map((item: any) => ({ ...item, quantity: Math.max(1, Number(item.quantity) || 1) })) : [],
    deliveryEnabled: raw.deliveryEnabled === true || raw.deliveryEnabled === "true",
    shippingRegion: raw.shippingRegion || null,
    shippingAmount: Number(raw.shippingAmount || 0),
    totalAmount: Number(raw.totalAmount || 0),
    handedOver: raw.handedOver === true || raw.handedOver === "true",
    notes: raw.notes || null,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : new Date(),
  };
}

export const api = {
  auth: {
    async setupStatus() {
      const r = await callApi<any>("auth.setupStatus", {}, false);
      return { needsSetup: Boolean(r.setupRequired ?? r.needsSetup) };
    },
    async me(): Promise<ApiUser | null> {
      if (!getToken()) return null;
      try {
        const r = await callApi<any>("auth.me");
        return r.user ? { ...r.user, staffId: String(r.user.staffId ?? r.user.id ?? "") } : null;
      } catch (error) {
        clearToken();
        if (String(error).includes("認証") || String(error).includes("ログイン")) return null;
        throw error;
      }
    },
    async login(input: { email: string; password: string }) {
      const r = await callApi<any>("auth.login", input, false);
      saveToken(r.token);
      return r;
    },
    async bootstrapAdmin(input: { setupKey: string; email: string; name: string; password: string }) {
      const r = await callApi<any>("auth.bootstrapAdmin", input, false);
      saveToken(r.token);
      return r;
    },
    async logout() {
      try { await callApi("auth.logout"); } finally { clearToken(); }
    },
    async staffList(): Promise<ApiStaff[]> {
      const r = await callApi<any>("auth.staffList");
      return (r.staff ?? r.users ?? []).map((s: any) => ({ ...s, id: String(s.id ?? s.staffId), isActive: s.isActive !== false }));
    },
    createStaff(input: { email: string; name: string; password: string }) {
      return callApi("auth.createStaff", input);
    },
    setStaffActive(input: { id: string; active: boolean }) {
      return callApi("auth.setStaffActive", input);
    },
  },
  orders: {
    async list(): Promise<ApiOrder[]> {
      const r = await callApi<any>("orders.list");
      return (r.orders ?? []).map(normalizeOrder);
    },
    create(input: { phone: string; customerName: string; address: string; items: ApiOrderItem[]; deliveryEnabled: boolean; shippingRegion: string | null; shippingAmount: number; totalAmount: number; notes: string }) {
      return callApi("orders.create", { order: input });
    },
    setHandedOver(input: { id: string; handedOver: boolean }) {
      return callApi("orders.setHandedOver", { orderId: input.id, handedOver: input.handedOver });
    },
  },
};
