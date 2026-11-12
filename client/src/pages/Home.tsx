import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  CircleUserRound,
  ClipboardList,
  FileImage,
  LogOut,
  Minus,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
} from "lucide-react";

type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  embroidery: boolean;
  embroideryText: string;
  embroideryColor: string;
  embroideryPrice: number;
};

type StoredOrder = {
  id: string;
  phone: string;
  customerName: string;
  address: string;
  items: OrderItem[];
  deliveryEnabled: boolean;
  shippingRegion: string | null;
  shippingAmount: number;
  totalAmount: number;
  handedOver: boolean;
  notes: string | null;
  createdAt: Date;
};

const shippingOptions = [
  ["北海道", 1500],
  ["北東北", 880],
  ["南東北", 880],
  ["関東", 880],
  ["信越", 880],
  ["北陸", 880],
  ["中部", 880],
  ["関西", 880],
  ["中国", 700],
  ["四国", 700],
  ["九州", 700],
  ["沖縄", 2860],
] as const;

const embroideryColors = [
  [1, "金茶", "#d88a16"], [2, "黄色", "#e8e12b"], [3, "白色", "#f5f7fb"], [4, "灰色", "#9aa0a5"],
  [5, "黒色", "#17191d"], [6, "濃青", "#14396f"], [7, "青色", "#1764aa"], [8, "明青", "#267cbe"],
  [9, "濃水色", "#0ab4d2"], [10, "水色", "#65cde0"], [11, "濃赤", "#c32444"], [12, "明赤", "#e22b40"],
  [13, "鉄赤", "#b23a5c"], [14, "ピンク", "#ed6aa2"], [15, "濃ピンク", "#cf277e"], [16, "紫色", "#7c309d"],
  [17, "明紫", "#8b82cf"], [18, "ピンク紫", "#c078b8"], [19, "茶色", "#bd806d"], [20, "こげ茶", "#6b3b2d"],
  [21, "濃緑", "#17553f"], [22, "緑色", "#178552"], [23, "明緑", "#77bf61"], [24, "金色", "#dfbf26"],
  [25, "銀色", "#c5ccd0"], [26, "白緑", "#d4ead8"], [27, "白青", "#cceaf0"], [28, "白紫", "#e2d2ed"],
  [29, "白ピンク", "#f2d7de"], [30, "蛍光ピンク", "#ff52b4"], [31, "蛍光黄緑", "#b9ef73"], [32, "蛍光オレンジ", "#ff7b37"],
] as const;

function makeItem(): OrderItem {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: "",
    price: 0,
    quantity: 1,
    embroidery: false,
    embroideryText: "",
    embroideryColor: "01 金茶",
    embroideryPrice: 0,
  };
}

const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "field field-wide" : "field"}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function ItemCard({
  item,
  index,
  onChange,
  onRemove,
  onOpenSample,
}: {
  item: OrderItem;
  index: number;
  onChange: (patch: Partial<OrderItem>) => void;
  onRemove: () => void;
  onOpenSample: () => void;
}) {
  return (
    <article className="item-card">
      <div className="item-card-head">
        <div className="item-number">{String(index + 1).padStart(2, "0")}</div>
        <div>
          <p className="eyebrow">ITEM / 商品</p>
          <h3>商品 {index + 1}</h3>
        </div>
        {index > 0 && (
          <Button className="icon-button remove-item" variant="ghost" size="icon-sm" type="button" onClick={onRemove} aria-label="商品を削除">
            <X size={16} />
          </Button>
        )}
      </div>
      <div className="item-grid product-entry-grid">
        <Field label="商品名">
          <input value={item.name} onChange={e => onChange({ name: e.target.value })} placeholder="例：大会Tシャツ" />
        </Field>
        <Field label="商品単価">
          <div className="input-with-unit"><input type="number" min="0" value={item.price || ""} onChange={e => onChange({ price: Number(e.target.value) || 0 })} placeholder="0" /><span>円</span></div>
        </Field>
        <Field label="数量（点数）">
          <input type="number" min="1" step="1" value={item.quantity} onChange={e => onChange({ quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
        </Field>
      </div>
      <div className="embroidery-row">
        <div className="embroidery-toggle">
          <span className="field-label">刺繍</span>
          <div className="segmented">
            <button type="button" className={!item.embroidery ? "active" : ""} onClick={() => onChange({ embroidery: false })}>なし</button>
            <button type="button" className={item.embroidery ? "active" : ""} onClick={() => onChange({ embroidery: true })}>あり</button>
          </div>
        </div>
        <div className="item-subtotal">単価 {yen(item.price + (item.embroidery ? item.embroideryPrice : 0))} × {item.quantity}点　小計 <strong>{yen((item.price + (item.embroidery ? item.embroideryPrice : 0)) * item.quantity)}</strong></div>
      </div>
      {item.embroidery && (
        <div className="embroidery-detail">
          <div className="detail-heading"><Sparkles size={16} /><span>刺繍指定</span><span className="detail-caption">この商品のみ</span></div>
          <div className="item-grid">
            <Field label="刺繍の内容" wide><input value={item.embroideryText} onChange={e => onChange({ embroideryText: e.target.value })} placeholder="例：背番号 10 / TAKEDA" /></Field>
            <Field label="刺繍価格"><div className="input-with-unit"><input type="number" min="0" value={item.embroideryPrice || ""} onChange={e => onChange({ embroideryPrice: Number(e.target.value) || 0 })} placeholder="0" /><span>円</span></div></Field>
          </div>
          <div className="color-pick-area">
            <div className="color-label"><span className="field-label">刺繍色</span><strong>{item.embroideryColor || "未選択"}</strong><small>見本の番号で選択</small></div>
            <div className="swatches">
              {embroideryColors.map(([number, name, color]) => {
                const value = `${String(number).padStart(2, "0")} ${name}`;
                const selected = item.embroideryColor === value;
                return <button type="button" key={number} className={`swatch numbered-swatch ${selected ? "selected" : ""}`} style={{ backgroundColor: color }} onClick={() => onChange({ embroideryColor: value })} aria-label={`${number}番 ${name}`} title={`${number}番 ${name}`}>
                  <span>{number}</span>{selected && <Check size={11} color={number === 3 || number === 25 || number === 26 || number === 27 || number === 28 || number === 29 ? "#14222e" : "#fff"} />}
                </button>;
              })}
            </div>
          </div>
          <button type="button" className="color-reference" onClick={onOpenSample} aria-label="刺繍糸見本を拡大表示"><img src="./private/sisyu-iromihon.jpg" alt="刺繍糸見本 1番から32番" /><div><strong>写真で確認：{item.embroideryColor || "未選択"}</strong><span>見本写真をタップ・クリックで拡大</span></div></button>
        </div>
      )}
    </article>
  );
}

function NewOrder({ onSaved }: { onSaved: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [items, setItems] = useState<OrderItem[]>([makeItem()]);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [shippingRegion, setShippingRegion] = useState("");
  const [notes, setNotes] = useState("");
  const [embroideryPreview, setEmbroideryPreview] = useState("./private/sisyu-iromihon.jpg");
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleZoom, setSampleZoom] = useState(1);
  const [samplePan, setSamplePan] = useState({ x: 0, y: 0 });
  const pointerMap = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  useEffect(() => {
    if (!sampleOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSampleOpen(false); setSampleZoom(1); setSamplePan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sampleOpen]);
  const [scanPreview, setScanPreview] = useState("");
  const [ocrText, setOcrText] = useState("");
  const scanInput = useRef<HTMLInputElement>(null);

  const shippingAmount = shippingOptions.find(([region]) => region === shippingRegion)?.[1] ?? 0;
  const itemAmount = items.reduce((sum, item) => sum + (item.price + (item.embroidery ? item.embroideryPrice : 0)) * Math.max(1, item.quantity || 1), 0);
  const totalAmount = itemAmount + (deliveryEnabled ? shippingAmount : 0);
  const createOrder = useMutation({
    mutationFn: api.orders.create,
    onSuccess: () => {
      toast.success("注文を保存しました", { description: `${phone} / ${yen(totalAmount)}` });
      setItems([makeItem()]); setCustomerName(""); setPhone(""); setAddress(""); setNotes(""); setDeliveryEnabled(false); setShippingRegion("");
      onSaved();
    },
    onError: error => toast.error("保存できませんでした", { description: error.message }),
  });

  const updateItem = (id: string, patch: Partial<OrderItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const handleScan = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setScanPreview(String(reader.result));
    reader.readAsDataURL(file);
  };
  const save = () => {
    if (!customerName.trim() || !phone.trim() || items.some(item => !item.name.trim())) {
      toast.error("お名前・電話番号・商品名を入力してください"); return;
    }
    createOrder.mutate({ phone, customerName, address, items, deliveryEnabled, shippingRegion: shippingRegion || null, shippingAmount: deliveryEnabled ? shippingAmount : 0, totalAmount, notes });
  };
  const resetSampleZoom = () => { setSampleZoom(1); setSamplePan({ x: 0, y: 0 }); };
  const onSamplePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerMap.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerMap.current.size === 1) dragStart.current = { x: event.clientX, y: event.clientY, panX: samplePan.x, panY: samplePan.y };
    if (pointerMap.current.size === 2) {
      const pts = [...pointerMap.current.values()];
      pinchStart.current = { distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom: sampleZoom };
      dragStart.current = null;
    }
  };
  const onSamplePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerMap.current.has(event.pointerId)) return;
    pointerMap.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerMap.current.size >= 2 && pinchStart.current) {
      const pts = [...pointerMap.current.values()];
      const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setSampleZoom(Math.min(5, Math.max(1, pinchStart.current.zoom * distance / Math.max(1, pinchStart.current.distance))));
    } else if (dragStart.current) {
      setSamplePan({ x: dragStart.current.panX + event.clientX - dragStart.current.x, y: dragStart.current.panY + event.clientY - dragStart.current.y });
    }
  };
  const onSamplePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerMap.current.delete(event.pointerId);
    if (pointerMap.current.size < 2) pinchStart.current = null;
    if (pointerMap.current.size === 1) {
      const remaining = [...pointerMap.current.values()][0];
      dragStart.current = { x: remaining.x, y: remaining.y, panX: samplePan.x, panY: samplePan.y };
    } else dragStart.current = null;
  };

  return (
    <div className="workspace-grid">
      <section className="form-column">
        <div className="section-intro"><div><p className="eyebrow cyan">NEW ORDER / 受付入力</p><h2>次の注文をすぐ入力</h2><p className="section-note">電話番号を注文番号として使います。同じ電話番号の注文は保存後に自動でまとまります。</p></div><div className="privacy-chip"><ShieldCheck size={15} /> 認証済みスタッフのみ</div></div>
        <div className="panel customer-panel">
          <div className="panel-title"><div className="title-icon"><CircleUserRound size={18} /></div><div><p className="eyebrow">CUSTOMER</p><h3>お客様情報</h3></div></div>
          <div className="customer-grid">
            <Field label="お名前"><input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" /></Field>
            <Field label="電話番号 / 注文番号"><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-0000-0000" inputMode="tel" /></Field>
            <Field label="住所" wide><input value={address} onChange={e => setAddress(e.target.value)} placeholder="〒000-0000 東京都…" /></Field>
          </div>
        </div>

        <div className="panel scan-panel">
          <div className="panel-title"><div className="title-icon scan"><ScanLine size={18} /></div><div><p className="eyebrow">AI NOTE SCAN</p><h3>手書きメモから自動入力</h3></div><span className="beta-tag">確認してから保存</span></div>
          <div className="scan-content">
            <div className="scan-upload" onClick={() => scanInput.current?.click()} role="button" tabIndex={0}>
              {scanPreview ? <img src={scanPreview} alt="読み取りメモのプレビュー" /> : <><FileImage size={25} /><strong>メモ画像を選択</strong><span>撮影画像・スキャン画像を端末から選択</span></>}
              <input ref={scanInput} type="file" accept="image/*" hidden onChange={e => handleScan(e.target.files?.[0])} />
            </div>
            <div className="scan-text-wrap"><label className="field"><span className="field-label">メモの読み取り結果 / OCR補助</span><textarea value={ocrText} onChange={e => setOcrText(e.target.value)} placeholder="画像を見ながら、読み取れた文字を入力してください" rows={4} /></label><p className="privacy-note"><ShieldCheck size={13} /> 入力内容を確認してから注文欄へ転記してください。</p><Button type="button" className="scan-button" onClick={() => toast.info("AIメモ自動振り分けは、AIサービスの接続後に利用できます。現在は読み取り結果を確認しながら手入力してください。")} disabled={!ocrText.trim()}><Sparkles size={16} />AI振り分け（接続準備中）</Button></div>
          </div>
        </div>

        <div className="panel items-panel">
          <div className="panel-title"><div className="title-icon item"><PackageCheck size={18} /></div><div><p className="eyebrow">ITEMS / 商品明細</p><h3>商品を追加</h3></div><span className="count-badge">{items.reduce((sum, item) => sum + Math.max(1, item.quantity || 1), 0)} 点</span></div>
          <div className="item-list">{items.map((item, index) => <ItemCard key={item.id} item={item} index={index} onChange={patch => updateItem(item.id, patch)} onRemove={() => setItems(current => current.filter(entry => entry.id !== item.id))} onOpenSample={() => setSampleOpen(true)} />)}</div>
          <Button type="button" variant="outline" className="add-item-button" onClick={() => setItems(current => [...current, makeItem()])}><Plus size={18} /> 商品を追加</Button>
        </div>

        <div className="panel embroidery-sample-panel">
          <div className="panel-title"><div className="title-icon coral"><Sparkles size={18} /></div><div><p className="eyebrow">EMBROIDERY SAMPLE</p><h3>刺繍見本</h3></div><label className="replace-sample">見本画像を変更<input type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setEmbroideryPreview(String(reader.result)); reader.readAsDataURL(file); }} /></label></div>
          <button type="button" className="sample-content" onClick={() => setSampleOpen(true)} aria-label="刺繍糸見本を拡大表示"><img src={embroideryPreview} alt="刺繍糸見本 1番から32番" /><div><p>刺繍ありの商品で1〜32番の色を選択できます。</p><small>写真をタップ・クリックで拡大表示。商品ごとの刺繍欄にも同じ写真を表示しています。</small></div></button>
        </div>
      </section>

      <aside className="summary-column">
        <div className="summary-card">
          <div className="summary-top"><div><p className="eyebrow cyan">ORDER SUMMARY</p><h2>注文の確認</h2></div><div className="live-dot"><span /> LIVE</div></div>
          <div className="summary-lines"><div><span>商品小計</span><strong>{yen(itemAmount)}</strong></div>{deliveryEnabled && <div><span>送料 / {shippingRegion}</span><strong>{yen(shippingAmount)}</strong></div>}</div>
          <div className="total-block"><span>合計金額</span><strong>{yen(totalAmount)}</strong></div>
          <div className="delivery-box"><div className="delivery-head"><div><p className="eyebrow">DELIVERY</p><strong>発送する</strong></div><button type="button" className={`switch ${deliveryEnabled ? "on" : ""}`} onClick={() => setDeliveryEnabled(!deliveryEnabled)} aria-label="発送する切り替え"><span /></button></div>{deliveryEnabled && <div className="shipping-select"><select value={shippingRegion} onChange={e => setShippingRegion(e.target.value)}><option value="">地域を選択</option>{shippingOptions.map(([region, amount]) => <option key={region} value={region}>{region}　{yen(amount)}</option>)}</select><small>クリックポスト・ネコポス / 離島除く</small></div>}</div>
          <Button type="button" className="save-button" onClick={save} disabled={createOrder.isPending}><Send size={17} />{createOrder.isPending ? "保存中…" : "この注文を保存"}</Button>
          <p className="save-hint"><ShieldCheck size={13} /> 保存データは認証済みスタッフのみ閲覧できます</p>
        </div>
        <div className="quick-info"><div className="quick-info-head"><Truck size={17} /><strong>送料表</strong></div><div className="shipping-mini-grid">{shippingOptions.map(([region, amount]) => <span key={region}><b>{region}</b><em>{yen(amount)}</em></span>)}</div></div>
      </aside>
      {sampleOpen && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="刺繍糸見本の拡大表示" onClick={() => { setSampleOpen(false); resetSampleZoom(); }}>
        <div className="lightbox-toolbar" onClick={event => event.stopPropagation()}><span>刺繍糸見本 / 1〜32番 <small>{Math.round(sampleZoom * 100)}%</small></span><div className="lightbox-actions"><Button type="button" variant="ghost" size="icon" onClick={() => setSampleZoom(value => Math.max(1, +(value - .25).toFixed(2)))} aria-label="縮小"><Minus size={18} /></Button><Button type="button" variant="ghost" size="icon" onClick={() => setSampleZoom(value => Math.min(5, +(value + .25).toFixed(2)))} aria-label="拡大"><Plus size={18} /></Button><Button type="button" variant="ghost" size="sm" onClick={resetSampleZoom}>リセット</Button><Button type="button" variant="ghost" size="icon" onClick={() => { setSampleOpen(false); resetSampleZoom(); }} aria-label="拡大表示を閉じる"><X size={20} /></Button></div></div>
        <div className="lightbox-viewport" onClick={event => event.stopPropagation()} onWheel={event => { event.preventDefault(); setSampleZoom(value => Math.min(5, Math.max(1, +(value + (event.deltaY < 0 ? .15 : -.15)).toFixed(2)))); }} onPointerDown={onSamplePointerDown} onPointerMove={onSamplePointerMove} onPointerUp={onSamplePointerUp} onPointerCancel={onSamplePointerUp} onDoubleClick={() => setSampleZoom(value => value > 1 ? 1 : 2)}>
          <img src={embroideryPreview} alt="拡大された刺繍糸見本" draggable={false} style={{ transform: `translate(${samplePan.x}px, ${samplePan.y}px) scale(${sampleZoom})` }} />
        </div><p className="lightbox-help">スマホ：2本指で拡大・縮小 ／ PC：ホイールで拡大・縮小・ドラッグで移動</p>
      </div>}
    </div>
  );
}

function SavedOrders({ onNewOrder }: { onNewOrder: () => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "done">("all");
  const [printPhone, setPrintPhone] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: api.orders.list });
  const handedOver = useMutation({ mutationFn: api.orders.setHandedOver, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }), onError: (error: Error) => toast.error("状態を更新できませんでした", { description: error.message }) });
  const orders = (ordersQuery.data ?? []) as StoredOrder[];
  const filtered = orders.filter(order => {
    const matchesQuery = `${order.phone} ${order.customerName}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || (status === "done" ? order.handedOver : !order.handedOver);
    return matchesQuery && matchesStatus;
  });
  const groups = useMemo(() => Array.from(new Set(filtered.map(order => order.phone))).map(phone => ({ phone, orders: filtered.filter(order => order.phone === phone) })), [filtered]);
  const printOrders = printPhone ? orders.filter(order => order.phone === printPhone) : [];
  const printCustomer = printOrders[0];

  const print = (phone: string) => { setPrintPhone(phone); setTimeout(() => window.print(), 80); };

  return (
    <div className="saved-view">
      <div className="saved-header"><div><p className="eyebrow cyan">SAVED ORDERS / HISTORY</p><h2>保存済み注文</h2><p className="section-note">電話番号ごとに注文をまとめて、受け渡し状況を更新できます。</p></div><Button type="button" className="new-order-button" onClick={onNewOrder}><Plus size={17} /> 新しい注文</Button></div>
      <div className="saved-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="電話番号・お名前で検索" /></div><div className="filter-tabs"><button className={status === "all" ? "active" : ""} onClick={() => setStatus("all")}>すべて <b>{orders.length}</b></button><button className={status === "open" ? "active" : ""} onClick={() => setStatus("open")}>未受け渡し <b>{orders.filter(order => !order.handedOver).length}</b></button><button className={status === "done" ? "active" : ""} onClick={() => setStatus("done")}>渡し済み <b>{orders.filter(order => order.handedOver).length}</b></button></div><Button variant="ghost" size="icon" type="button" onClick={() => ordersQuery.refetch()} aria-label="更新"><RefreshCw size={17} className={ordersQuery.isFetching ? "spin" : ""} /></Button></div>
      {ordersQuery.isLoading ? <div className="empty-state"><RefreshCw className="spin" /><p>注文を読み込んでいます…</p></div> : groups.length === 0 ? <div className="empty-state"><ClipboardList size={35} /><h3>該当する注文はありません</h3><p>新しい注文を入力するか、検索条件を変更してください。</p></div> : <div className="order-groups">{groups.map(group => { const first = group.orders[0]; const openCount = group.orders.filter(order => !order.handedOver).length; return <article className="order-group" key={group.phone}><div className="group-head"><div className="group-person"><div className="avatar">{first.customerName.slice(0, 1) || "?"}</div><div><p className="eyebrow">PHONE / 注文番号</p><h3>{group.phone}</h3><span>{first.customerName} ・ {group.orders.length}件の注文</span></div></div><div className="group-actions"><span className={`status-pill ${openCount ? "open" : "done"}`}><span />{openCount ? `${openCount}件 未受け渡し` : "すべて渡し済み"}</span><Button variant="outline" size="sm" type="button" onClick={() => print(group.phone)}><Printer size={15} /> A4印刷</Button></div></div><div className="group-orders">{group.orders.map(order => <div className="order-row" key={order.id}><div className="order-row-main"><div className="order-id">#{String(order.id).padStart(4, "0")}</div><div><strong>{order.items.map(item => `${item.name || "商品未入力"} ×${Math.max(1, item.quantity || 1)}`).join(" / ")}</strong><span>{new Date(order.createdAt).toLocaleString("ja-JP")} ・ {order.deliveryEnabled ? `発送 ${order.shippingRegion}` : "会場受け取り"}</span></div></div><div className="order-row-total">{yen(order.totalAmount)}</div><Button type="button" className={order.handedOver ? "handed-button done" : "handed-button"} size="sm" onClick={() => handedOver.mutate({ id: String(order.id), handedOver: !order.handedOver })}>{order.handedOver ? <><Check size={15} /> 渡し済み</> : <><PackageCheck size={15} /> 渡し済みにする</>}</Button></div>)}</div></article>; })}</div>}
      {printPhone && printCustomer && <div className="print-sheet"><div className="print-brand"><div className="print-mark">✦</div><div><strong>大会注文管理</strong><span>ORDER RECEIPT / A4</span></div></div><div className="print-title"><div><p>受 注 票</p><h1>{printCustomer.customerName} 様</h1></div><div className="print-status">{printOrders.every(order => order.handedOver) ? "渡し済み" : "未受け渡し"}</div></div><div className="print-customer"><div><span>電話番号 / 注文番号</span><strong>{printCustomer.phone}</strong></div><div><span>住所</span><strong>{printCustomer.address || "—"}</strong></div></div>{printOrders.map(order => <div className="print-order" key={order.id}><div className="print-order-head"><strong>注文 #{String(order.id).padStart(4, "0")}</strong><span>{new Date(order.createdAt).toLocaleString("ja-JP")}</span></div>{order.items.map(item => <div className="print-item" key={item.id}><span>{item.name} × {Math.max(1, item.quantity || 1)}点{item.embroidery ? ` / 刺繍：${item.embroideryText || "あり"}（${item.embroideryColor}）` : ""}<small>単価：{yen(item.price + (item.embroidery ? item.embroideryPrice : 0))}</small></span><strong>{yen((item.price + (item.embroidery ? item.embroideryPrice : 0)) * Math.max(1, item.quantity || 1))}</strong></div>)}{order.deliveryEnabled && <div className="print-item"><span>送料（{order.shippingRegion}）</span><strong>{yen(order.shippingAmount)}</strong></div>}<div className="print-total"><span>注文合計</span><strong>{yen(order.totalAmount)}</strong></div></div>)}<div className="print-footer">ご注文内容をご確認ください。ありがとうございました。</div></div>}
    </div>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: api.auth.me, retry: false, refetchOnWindowFocus: true, refetchInterval: 60_000 });
  const setup = useQuery({ queryKey: ["auth", "setup"], queryFn: api.auth.setupStatus, retry: false });
  const [email, setEmail] = useState("hs.0319yu@gmail.com");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("管理者");
  const [setupKey, setSetupKey] = useState("");
  const [showStaff, setShowStaff] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const login = useMutation({ mutationFn: api.auth.login, onSuccess: () => { setPassword(""); queryClient.invalidateQueries({ queryKey: ["auth", "me"] }); }, onError: (e: Error) => toast.error("ログインできません", { description: e.message }) });
  const bootstrap = useMutation({ mutationFn: api.auth.bootstrapAdmin, onSuccess: () => { setPassword(""); setSetupKey(""); queryClient.invalidateQueries({ queryKey: ["auth"] }); }, onError: (e: Error) => toast.error("初期設定できません", { description: e.message }) });
  const logout = useMutation({ mutationFn: api.auth.logout, onSuccess: () => { queryClient.setQueryData(["auth", "me"], null); queryClient.invalidateQueries({ queryKey: ["auth", "me"] }); } });
  const staffQuery = useQuery({ queryKey: ["auth", "staff"], queryFn: api.auth.staffList, enabled: me.data?.role === "admin" && showStaff });
  const createStaff = useMutation({ mutationFn: api.auth.createStaff, onSuccess: () => { toast.success("スタッフを追加しました"); setNewStaffEmail(""); setNewStaffName(""); setNewStaffPassword(""); staffQuery.refetch(); }, onError: (e: Error) => toast.error("追加できません", { description: e.message }) });
  const changeStaff = useMutation({ mutationFn: api.auth.setStaffActive, onSuccess: () => staffQuery.refetch(), onError: (e: Error) => toast.error(e.message) });
  const [mainView, setMainView] = useState<"new" | "saved">("new");
  if (me.isLoading || setup.isLoading) return <div className="auth-loading"><div className="brand-lockup"><div className="brand-symbol">✦</div><div><strong>大会注文管理</strong><span>SECURE STAFF CONSOLE</span></div></div><RefreshCw className="spin" size={20} /><p>認証状態を確認しています…</p></div>;
  if (!me.data) return <div className="auth-screen"><form className="auth-card" onSubmit={event => { event.preventDefault(); if (setup.data?.needsSetup) bootstrap.mutate({ setupKey, email, name, password }); else login.mutate({ email, password }); }}>
    <div className="brand-lockup"><div className="brand-symbol">✦</div><div><strong>大会注文管理</strong><span>PRIVATE STAFF ACCESS</span></div></div>
    <p className="eyebrow cyan">SECURE SIGN IN</p><h1>{setup.data?.needsSetup ? "管理者の初期登録" : "スタッフログイン"}</h1>
    <p className="auth-description">登録済みのスタッフのみ利用できます。アカウント情報を入力してください。</p>
    {setup.data?.needsSetup && <><label className="field"><span className="field-label">管理者名</span><input value={name} onChange={e => setName(e.target.value)} required /></label><label className="field"><span className="field-label">初期設定キー</span><input value={setupKey} onChange={e => setSetupKey(e.target.value)} required autoComplete="off" /></label></>}
    <label className="field"><span className="field-label">メールアドレス</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} required readOnly={Boolean(setup.data?.needsSetup)} /></label>
    <label className="field"><span className="field-label">パスワード（12文字以上）</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={12} required autoComplete={setup.data?.needsSetup ? "new-password" : "current-password"} /></label>
    <Button className="save-button" type="submit" disabled={login.isPending || bootstrap.isPending}>{setup.data?.needsSetup ? "管理者アカウントを作成" : "ログイン"}</Button>
    <p className="auth-footnote"><ShieldCheck size={14} /> 通信はHTTPS・パスワードはハッシュ化して保存</p>
  </form></div>;
  return <div className="app-shell"><header className="topbar"><div className="brand-lockup"><div className="brand-symbol">✦</div><div><strong>大会注文管理</strong><span>SECURE STAFF CONSOLE</span></div></div><nav className="view-switch"><button className={mainView === "new" ? "active" : ""} onClick={() => setMainView("new")}><Plus size={16} /> 新規注文</button><button className={mainView === "saved" ? "active" : ""} onClick={() => setMainView("saved")}><ClipboardList size={16} /> 保存済み <span>注文</span></button></nav><div className="staff-menu"><div className="staff-avatar">{me.data.name?.slice(0, 1) ?? "S"}</div><div className="staff-name"><strong>{me.data.name ?? "スタッフ"}</strong><span>{me.data.role === "admin" ? "管理者" : "認証済み"}</span></div>{me.data.role === "admin" && <Button variant="outline" size="sm" type="button" onClick={() => setShowStaff(v => !v)}>スタッフ管理</Button>}<Button variant="ghost" size="icon" type="button" onClick={() => logout.mutate()} aria-label="ログアウト"><LogOut size={16} /></Button></div></header>
    {showStaff && me.data.role === "admin" && <section className="staff-admin-panel"><div className="staff-admin-heading"><div><p className="eyebrow cyan">ADMIN / STAFF</p><h2>スタッフアカウント管理</h2></div><Button variant="ghost" size="icon" onClick={() => setShowStaff(false)}><X size={18} /></Button></div><form className="staff-create-form" onSubmit={event => { event.preventDefault(); createStaff.mutate({ email: newStaffEmail, name: newStaffName, password: newStaffPassword }); }}><input type="text" placeholder="スタッフ名" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} required /><input type="email" placeholder="メールアドレス" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} required /><input type="password" placeholder="初期パスワード（12文字以上）" value={newStaffPassword} onChange={e => setNewStaffPassword(e.target.value)} minLength={12} required /><Button type="submit" disabled={createStaff.isPending}><Plus size={15} /> スタッフ追加</Button></form><div className="staff-list">{staffQuery.data?.map(staff => <div className="staff-row" key={staff.id}><div><strong>{staff.name}</strong><span>{staff.email} · {staff.role === "admin" ? "管理者" : "スタッフ"}</span></div><span className={staff.isActive ? "staff-active" : "staff-disabled"}>{staff.isActive ? "有効" : "停止中"}</span>{staff.role !== "admin" && <Button size="sm" variant="outline" onClick={() => changeStaff.mutate({ id: staff.id, active: !staff.isActive })}>{staff.isActive ? "利用停止" : "再有効化"}</Button>}</div>)}</div></section>}
    <main className="main-shell">{mainView === "new" ? <NewOrder onSaved={() => { queryClient.invalidateQueries({ queryKey: ["orders"] }); setMainView("saved"); }} /> : <SavedOrders onNewOrder={() => setMainView("new")} />}</main><footer className="app-footer"><span><ShieldCheck size={13} /> 個人情報は認証済みスタッフ専用</span><span>大会注文管理 / v1.1</span></footer></div>;
}
