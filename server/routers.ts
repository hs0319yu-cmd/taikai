import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createOrder, listOrders, setOrderHandedOver, countStaffAccounts, createStaffAccount, getStaffByEmail, listStaffAccounts, setStaffActive, updateStaffLastSignedIn } from "./db";
import { createStaffSession, hashPassword, verifyPassword, STAFF_SESSION_MAX_AGE } from "./staffAuth";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const itemSchema = z.object({
  id: z.string(),
  name: z.string().max(120),
  price: z.number().int().min(0),
  embroidery: z.boolean(),
  embroideryText: z.string().max(200),
  embroideryColor: z.string().max(40),
  embroideryPrice: z.number().int().min(0),
});

const orderInput = z.object({
  phone: z.string().min(1).max(32),
  customerName: z.string().min(1).max(120),
  address: z.string().max(1000),
  items: z.array(itemSchema).min(1),
  deliveryEnabled: z.boolean(),
  shippingRegion: z.string().max(32).nullable(),
  shippingAmount: z.number().int().min(0),
  totalAmount: z.number().int().min(0),
  notes: z.string().max(2000),
});

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  return JSON.parse(candidate);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    setupStatus: publicProcedure.query(async () => ({
      needsSetup: (await countStaffAccounts()) === 0,
      adminEmail: (process.env.INITIAL_ADMIN_EMAIL || "hs.0319yu@gmail.com").toLowerCase(),
    })),
    bootstrapAdmin: publicProcedure.input(z.object({ setupKey: z.string().min(1).max(200), email: z.string().email().max(320), name: z.string().min(1).max(120), password: z.string().min(12).max(200) })).mutation(async ({ input, ctx }) => {
      if (await countStaffAccounts()) throw new TRPCError({ code: "FORBIDDEN", message: "初期管理者は既に設定されています" });
      const expectedKey = process.env.INITIAL_ADMIN_SETUP_KEY;
      const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || "hs.0319yu@gmail.com").toLowerCase();
      if (!expectedKey || expectedKey.length < 32 || input.setupKey !== expectedKey) throw new TRPCError({ code: "FORBIDDEN", message: "初期設定キーが正しくありません" });
      if (input.email.toLowerCase() !== adminEmail) throw new TRPCError({ code: "FORBIDDEN", message: "管理者メールアドレスが一致しません" });
      const id = await createStaffAccount({ email: adminEmail, name: input.name, passwordHash: await hashPassword(input.password), role: "admin" });
      const token = await createStaffSession(id);
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: STAFF_SESSION_MAX_AGE });
      return { success: true } as const;
    }),
    login: publicProcedure.input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(200) })).mutation(async ({ input, ctx }) => {
      const key = `${ctx.req.ip}:${input.email.toLowerCase()}`;
      const attempt = loginAttempts.get(key);
      if (attempt && attempt.resetAt > Date.now() && attempt.count >= 8) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "ログイン試行が多すぎます。15分後に再試行してください" });
      const account = await getStaffByEmail(input.email.toLowerCase());
      if (!account || !account.isActive || !(await verifyPassword(input.password, account.passwordHash))) {
        const current = attempt && attempt.resetAt > Date.now() ? attempt : { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
        loginAttempts.set(key, { count: current.count + 1, resetAt: current.resetAt });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "メールアドレスまたはパスワードが違います" });
      }
      loginAttempts.delete(key);
      await updateStaffLastSignedIn(account.id);
      const token = await createStaffSession(account.id);
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: STAFF_SESSION_MAX_AGE });
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
      return { success: true } as const;
    }),
    staffList: adminProcedure.query(async () => listStaffAccounts()),
    createStaff: adminProcedure.input(z.object({ email: z.string().email().max(320), name: z.string().min(1).max(120), password: z.string().min(12).max(200) })).mutation(async ({ input }) => {
      if (await getStaffByEmail(input.email.toLowerCase())) throw new TRPCError({ code: "CONFLICT", message: "このメールアドレスは登録済みです" });
      await createStaffAccount({ email: input.email.toLowerCase(), name: input.name, passwordHash: await hashPassword(input.password), role: "staff" });
      return { success: true } as const;
    }),
    setStaffActive: adminProcedure.input(z.object({ id: z.number().int().positive(), active: z.boolean() })).mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身のアカウント状態は変更できません" });
      await setStaffActive(input.id, input.active);
      return { success: true } as const;
    }),
  }),
  orders: router({
    list: protectedProcedure.query(async () => {
      const rows = await listOrders();
      return rows.map(row => ({
        ...row,
        items: JSON.parse(row.itemsJson) as z.infer<typeof itemSchema>[],
        deliveryEnabled: Boolean(row.deliveryEnabled),
        handedOver: Boolean(row.handedOver),
      }));
    }),
    create: protectedProcedure.input(orderInput).mutation(async ({ input, ctx }) => {
      const id = await createOrder({
        phone: input.phone,
        customerName: input.customerName,
        address: input.address,
        itemsJson: JSON.stringify(input.items),
        deliveryEnabled: input.deliveryEnabled ? 1 : 0,
        shippingRegion: input.shippingRegion,
        shippingAmount: input.shippingAmount,
        totalAmount: input.totalAmount,
        handedOver: 0,
        notes: input.notes,
        createdBy: ctx.user.openId,
      });
      return { id };
    }),
    setHandedOver: protectedProcedure.input(z.object({ id: z.number().int(), handedOver: z.boolean() })).mutation(async ({ input }) => {
      await setOrderHandedOver(input.id, input.handedOver);
      return { success: true } as const;
    }),
  }),
  ai: router({
    parseMemo: protectedProcedure.input(z.object({ memo: z.string().min(1).max(5000) })).mutation(async ({ input }) => {
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "あなたは大会注文票の入力補助です。メモから注文フォームへ入れられる候補だけを抽出し、JSONだけを返してください。個人情報を推測・補完しないでください。itemsは[{name,price,embroidery,embroideryText,embroideryColor,embroideryPrice}]の配列、phone/customerName/addressは見つかった場合だけ文字列、deliveryEnabledはboolean、shippingRegionは地域名、notesはその他の内容。見つからない値は空文字または空配列にしてください。",
          },
          { role: "user", content: `次の手書きメモのOCR結果をフォーム入力候補へ変換してください。入力されたメモ以外の情報は使わないでください。\n\n${input.memo}` },
        ],
        maxTokens: 900,
      });
      const content = result.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? content : "{}";
      try {
        const parsed = extractJson(text) as Record<string, unknown>;
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        return {
          customerName: typeof parsed.customerName === "string" ? parsed.customerName : "",
          phone: typeof parsed.phone === "string" ? parsed.phone : "",
          address: typeof parsed.address === "string" ? parsed.address : "",
          deliveryEnabled: Boolean(parsed.deliveryEnabled),
          shippingRegion: typeof parsed.shippingRegion === "string" ? parsed.shippingRegion : "",
          notes: typeof parsed.notes === "string" ? parsed.notes : "",
          items: items.map((item, index) => {
            const value = item as Record<string, unknown>;
            return {
              id: `ai-${Date.now()}-${index}`,
              name: typeof value.name === "string" ? value.name : "",
              price: Number(value.price) || 0,
              embroidery: Boolean(value.embroidery),
              embroideryText: typeof value.embroideryText === "string" ? value.embroideryText : "",
              embroideryColor: typeof value.embroideryColor === "string" ? value.embroideryColor : "",
              embroideryPrice: Number(value.embroideryPrice) || 0,
            };
          }),
        };
      } catch {
        throw new Error("AIの読み取り結果をJSONとして解釈できませんでした");
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
