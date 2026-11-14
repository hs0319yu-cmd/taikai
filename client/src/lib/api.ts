const API_URL = "https://still-voice-2835taikai-api.hs-0319yu.workers.dev/";
const TOKEN_KEY = "taikai_session_token";

export type ApiUser = { staffId: string; email: string; name: string; role: "admin" | "staff" };
export type ApiStaff = { id: string; email: string; name: string; role: "admin" | "staff"; isActive: boolean };
export type ApiProductTag = { id: string; name: string; price: number; active: boolean };
export type ApiOrderItem = {
  id: string; name: string; price: number; quantity: number; embroidery: boolean;
  embroideryText: string; embroideryColor: string; embroideryPrice: number; embroideryUnitPrice?: number; embroideryCharacterCount?: number; handedOver: boolean;
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
  const orderHandedOver = raw.handedOver === true || raw.handedOver === "true";
  return {
    ...raw,
    id,
    orderId: id,
    phone: String(raw.phone ?? ""),
    customerName: String(raw.customerName ?? ""),
    address: String(raw.address ?? ""),
    items: Array.isArray(raw.items) ? raw.items.map((item: any) => ({
      ...item,
      quantity: Math.max(1, Number(item.quantity) || 1),
      embroideryPrice: Math.max(0, Number(item.embroideryPrice) || 0),
      embroideryUnitPrice: Math.max(0, Number(item.embroideryUnitPrice) || 0),
      embroideryCharacterCount: Math.max(0, Math.floor(Number(item.embroideryCharacterCount) || 1)),
      // 旧データは注文全体の引き渡し状態を商品へ引き継ぐ
      handedOver: typeof item.handedOver === "boolean" ? item.handedOver : orderHandedOver,
    })) : [],
    deliveryEnabled: raw.deliveryEnabled === true || raw.deliveryEnabled === "true",
    shippingRegion: raw.shippingRegion || null,
    shippingAmount: Number(raw.shippingAmount || 0),
    totalAmount: Number(raw.totalAmount || 0),
    handedOver: Array.isArray(raw.items) && raw.items.length > 0
      ? raw.items.every((item: any) => typeof item.handedOver === "boolean" ? item.handedOver : orderHandedOver)
      : orderHandedOver,
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

  ai: {
    startImage(input: { imageBase64: string; mimeType: string }) {
      return callApi<any>("ai.startImage", input);
    },
    getImageResult(jobId: string) {
      return callApi<any>("ai.getImageResult", { jobId });
    },
  },

  productTags: {
    async list(): Promise<ApiProductTag[]> {
      const r = await callApi<any>("tags.list");
      return (r.tags ?? []).map((tag: any) => ({
        id: String(tag.id),
        name: String(tag.name || ""),
        price: Math.max(0, Number(tag.price) || 0),
        active: tag.active !== false
      }));
    },

    create(input: { name: string; price: number }) {
      return callApi("tags.create", input);
    },

    update(input: { id: string; name: string; price: number }) {
      return callApi("tags.update", {
        tagId: input.id,
        name: input.name,
        price: input.price
      });
    },

    remove(id: string) {
      return callApi("tags.delete", {
        tagId: id
      });
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
    setItemHandedOver(input: { id: string; itemIndex: number; handedOver: boolean }) {
      return callApi("orders.setItemHandedOver", { orderId: input.id, itemIndex: input.itemIndex, handedOver: input.handedOver });
    },
  },
};
