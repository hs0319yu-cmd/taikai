import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, getToken, type ApiProductTag } from "@/lib/api";
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
  Tag,
  Pencil,
  Trash2,
} from "lucide-react";

type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  embroidery: boolean;
  embroiderySize: string;
  embroideryText: string;
  embroideryColor: string;
  embroideryPrice: number;
  embroideryUnitPrice: number;
  embroideryCharacterCount: number;
  handedOver: boolean;
};
type DraftOrderItem = Omit<OrderItem, "quantity"> & { quantity: number | "" };

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

// 都道府県別送料（税込）。注文画面・送料一覧・注文票で共通利用する。
const shippingOptions = [
  ["北海道", 1500],
  ["青森県", 880],
  ["岩手県", 880],
  ["宮城県", 880],
  ["秋田県", 880],
  ["山形県", 880],
  ["福島県", 880],
  ["東京都", 880],
  ["神奈川県", 880],
  ["埼玉県", 880],
  ["千葉県", 880],
  ["茨城県", 880],
  ["栃木県", 880],
  ["群馬県", 880],
  ["山梨県", 880],
  ["新潟県", 880],
  ["長野県", 880],
  ["富山県", 880],
  ["石川県", 880],
  ["福井県", 880],
  ["愛知県", 880],
  ["岐阜県", 880],
  ["静岡県", 880],
  ["三重県", 880],
  ["大阪府", 880],
  ["兵庫県", 880],
  ["京都府", 880],
  ["滋賀県", 880],
  ["奈良県", 880],
  ["和歌山県", 880],
  ["鳥取県", 700],
  ["島根県", 700],
  ["岡山県", 700],
  ["広島県", 700],
  ["山口県", 700],
  ["徳島県", 700],
  ["香川県", 700],
  ["愛媛県", 700],
  ["高知県", 700],
  ["福岡県", 700],
  ["佐賀県", 700],
  ["長崎県", 700],
  ["熊本県", 700],
  ["大分県", 700],
  ["宮崎県", 700],
  ["鹿児島県", 700],
  ["沖縄県", 2860],
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

function makeItem(): DraftOrderItem {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: "",
    price: 0,
    quantity: "",
    embroidery: false,
    embroiderySize: "通常",
    embroideryText: "",
    embroideryColor: "なし",
    embroideryPrice: 0,
    embroideryUnitPrice: 0,
    embroideryCharacterCount: 1,
    handedOver: false,
  };
}

/**
 * OCR送信用画像を軽量化する
 * 最大2048px・JPEG品質86%（小さい文字の判読性を優先）
 * HEICなどブラウザで変換できない画像は元画像を使用
 */
async function prepareOcrImage(file: File): Promise<{
  imageBase64: string;
  mimeType: string;
  size: number;
}> {
  let uploadFile: Blob = file;

  try {
    const bitmap = await createImageBitmap(file);

    try {
      const maxSize = 2048;
      const longest = Math.max(bitmap.width, bitmap.height);

      // 大きな画像だけ縮小
      if (longest > maxSize || file.size > 2 * 1024 * 1024) {
        const scale = Math.min(1, maxSize / longest);

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);

        const ctx = canvas.getContext("2d");

        if (ctx) {
          // 透過画像も白背景にして文字を読みやすくする
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

          const compressed = await new Promise<Blob | null>(
            resolve => canvas.toBlob(resolve, "image/jpeg", 0.86)
          );

          if (compressed && compressed.size < file.size) {
            uploadFile = compressed;
          }
        }
      }
    } finally {
      bitmap.close();
    }
  } catch (error) {
    // HEICなど変換できない画像は元画像を使う
    uploadFile = file;
  }

  if (uploadFile.size > 6 * 1024 * 1024) {
    throw new Error("画像サイズが大きすぎます。6MB以下にしてください。");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));

    reader.readAsDataURL(uploadFile);
  });

  return {
    imageBase64: dataUrl.split(",")[1],
    mimeType: uploadFile.type || file.type || "image/jpeg",
    size: uploadFile.size
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
  tags,
}: {
  item: DraftOrderItem;
  index: number;
  onChange: (patch: Partial<DraftOrderItem>) => void;
  onRemove: () => void;
  onOpenSample: () => void;
  tags: ApiProductTag[];
}) {
  // 数字入力中に空欄を許可し、スマホで先頭の0が残る問題を防ぐ
  const [embroideryCountText, setEmbroideryCountText] = useState(String(item.embroideryCharacterCount ?? 1));

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
          <input value={item.name} onChange={e => onChange({ name: e.target.value })} placeholder="例：大会Tシャツ" list={`product-tags-${item.id}`} />
          <datalist id={`product-tags-${item.id}`}>{tags.map(tag => <option key={tag.id} value={tag.name} />)}</datalist>
          {tags.length > 0 && <select aria-label="登録商品タグから選択" className="tag-quick-select" value="" onChange={e => { const selected = tags.find(tag => tag.id === e.target.value); if (selected) onChange({ name: selected.name, price: selected.price }); }}><option value="">登録商品タグから選択（価格も入力）</option>{tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name} ／ {yen(tag.price)}</option>)}</select>}
        </Field>
        <Field label="商品単価（税込）">
          <div className="input-with-unit"><input type="number" min="0" value={item.price || ""} onChange={e => onChange({ price: Number(e.target.value) || 0 })} placeholder="0" /><span>円</span></div>
        </Field>
        <Field label="数量（点数）">
          <input type="number" min="1" step="1" value={item.quantity} onChange={e => { const value = e.target.value; onChange({ quantity: value === "" ? "" : Number(value) }); }} placeholder="数量を入力" />
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
        <div className="item-subtotal">単価 {yen(item.price + (item.embroidery ? item.embroideryPrice : 0))} × {item.quantity === "" ? "—" : `${item.quantity}点`}　小計 <strong>{yen((item.price + (item.embroidery ? item.embroideryPrice : 0)) * (Number(item.quantity) || 0))}</strong></div>
      </div>
      {item.embroidery && (
        <div className="embroidery-detail">
          <div className="detail-heading"><Sparkles size={16} /><span>刺繍指定</span><span className="detail-caption">この商品のみ</span></div>
          <div className="item-grid">
            <Field label="刺繍の内容" wide><input value={item.embroideryText} onChange={e => onChange({ embroideryText: e.target.value })} placeholder="例：背番号 10 / TAKEDA" /></Field>
            <Field label="刺繍サイズ">
              <select value={item.embroiderySize || "通常"} onChange={e => onChange({ embroiderySize: e.target.value })}>
                <option value="通常">通常</option>
                <option value="2.5cm">2.5cm</option>
                <option value="3cm">3cm</option>
              </select>
            </Field>
            <Field label="1文字あたりの刺繍単価（税込）"><div className="input-with-unit"><input type="number" min="0" value={item.embroideryUnitPrice || ""} onChange={e => { const unit = Number(e.target.value) || 0; onChange({ embroideryUnitPrice: unit, embroideryPrice: unit * Math.max(0, Number(item.embroideryCharacterCount) || 0) }); }} placeholder="200" /><span>円</span></div></Field>
            <Field label="文字数"><input type="text" inputMode="numeric" pattern="[0-9]*" value={embroideryCountText} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ""); setEmbroideryCountText(raw); if (raw !== "") { const count = Number(raw); onChange({ embroideryCharacterCount: count, embroideryPrice: Math.max(0, Number(item.embroideryUnitPrice) || 0) * count }); } }} onBlur={() => { const count = embroideryCountText === "" ? (item.embroideryCharacterCount ?? 1) : Number(embroideryCountText); const normalized = String(count); setEmbroideryCountText(normalized); onChange({ embroideryCharacterCount: count, embroideryPrice: Math.max(0, Number(item.embroideryUnitPrice) || 0) * count }); }} placeholder="例：2" /></Field>
            <div className="field"><span className="field-label">刺繍料金（税込・自動計算）</span><div className="input-with-unit"><input value={item.embroideryPrice.toLocaleString("ja-JP")} readOnly aria-label="刺繍料金" /><span>円</span></div><small>{yen(item.embroideryUnitPrice || 0)} × {item.embroideryCharacterCount ?? 1}文字</small></div>
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
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [postalStatus, setPostalStatus] = useState("");
  const lastAutoAddress = useRef("");
  const [items, setItems] = useState<DraftOrderItem[]>([makeItem()]);
  const productTagsQuery = useQuery({ queryKey: ["productTags"], queryFn: api.productTags.list, staleTime: 60_000 });
  const productTags = productTagsQuery.data ?? [];
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
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanJobId, setScanJobId] = useState("");
  const [ocrText, setOcrText] = useState("");
  const scanInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const normalized = postalCode.replace(/\D/g, "");
    if (normalized.length !== 7) {
      setPostalStatus("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setPostalStatus("住所を検索中…");
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${normalized}`, { signal: controller.signal });
        if (!response.ok) throw new Error("住所検索に失敗しました");
        const data = await response.json();
        const result = data?.results?.[0];
        if (!result) {
          setPostalStatus("該当する住所が見つかりませんでした");
          return;
        }
        const foundAddress = `${result.address1}${result.address2}${result.address3}`;
        if (!address.trim() || address === lastAutoAddress.current) {
          lastAutoAddress.current = foundAddress;
          setAddress(foundAddress);
          setPostalStatus("住所を自動入力しました");
        } else {
          setPostalStatus("住所が見つかりました。既存の住所は変更していません");
        }
      } catch (error) {
        if (!controller.signal.aborted) setPostalStatus("住所を取得できませんでした。住所を手入力してください");
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [postalCode, address]);

  const shippingAmount = shippingOptions.find(([region]) => region === shippingRegion)?.[1] ?? 0;
  const itemAmount = items.reduce((sum, item) => sum + (item.price + (item.embroidery ? item.embroideryPrice : 0)) * (Number(item.quantity) || 0), 0);
  const totalAmount = itemAmount + (deliveryEnabled ? shippingAmount : 0);
  const createOrder = useMutation({
    mutationFn: api.orders.create,
    onSuccess: () => {
      toast.success("注文を保存しました", { description: `${phone} / ${yen(totalAmount)}` });
      setItems([makeItem()]); setCustomerName(""); setPhone(""); setPostalCode(""); setAddress(""); setPostalStatus(""); lastAutoAddress.current = ""; setNotes(""); setDeliveryEnabled(false); setShippingRegion(""); setScanPreview(""); setScanFile(null); setOcrText("");setScanJobId("");
      onSaved();
    },
    onError: error => toast.error("保存できませんでした", { description: error.message }),
  });

  const updateItem = (id: string, patch: Partial<DraftOrderItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
 const handleScan = (file?: File) => {
  if (!file) return;

  setScanJobId("");
  setScanFile(file);
  setOcrText("");

  const reader = new FileReader();
  reader.onload = () => setScanPreview(String(reader.result));
  reader.readAsDataURL(file);
};



const runImageOcr = async () => {
  if (!scanFile) {
    toast.error("先に注文メモの写真を選択してください");
    return;
  }

  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(scanFile.type)) {
    toast.error("この画像形式は読み取れません");
    return;
  }

  setScanBusy(true);

  try {
    let jobId = scanJobId;

    // 新しいジョブの場合だけ画像を送信
    if (!jobId) {
      toast.info("画像を準備しています…");

      const prepared = await prepareOcrImage(scanFile);

      const started = await api.ai.startImage({
        imageBase64: prepared.imageBase64,
        mimeType: prepared.mimeType
      });

      if (!started?.success || !started.jobId) {
        throw new Error(
          started?.message || "OCR受付に失敗しました。"
        );
      }

      jobId = started.jobId;
      setScanJobId(jobId);

      toast.success("画像を受け付けました", {
        description: "AIが注文内容を読み取っています。"
      });
    }

    let parsed: any = null;

    // 最初は短い間隔で確認し、待機が長引く場合は通信回数を抑える
    for (let i = 0; i < 240; i++) {
      const waitMs = i < 12 ? 1200 : 1800;
      await new Promise(resolve => window.setTimeout(resolve, waitMs));

      const response = await api.ai.getImageResult(jobId);

      if (response.status === "done") {
        parsed = response.result || response;
        break;
      }

      if (response.status === "failed") {
        setScanJobId("");

        throw new Error(
          response.error || "AI画像読み取りに失敗しました。"
        );
      }
    }

    if (!parsed) {
      toast.warning("AI読み取りを継続しています", {
        description: "同じボタンを押すと続きから確認できます。"
      });
      return;
    }

    setScanJobId("");

    // お客様情報を反映
    if (parsed.customerName) setCustomerName(parsed.customerName);
    if (parsed.phone) setPhone(parsed.phone);
    if (parsed.postalCode) setPostalCode(parsed.postalCode);
    if (parsed.address) setAddress(parsed.address);
    if (parsed.notes) setNotes(parsed.notes);

    if (parsed.deliveryEnabled) {
      setDeliveryEnabled(true);
    }

    if (
      parsed.shippingRegion &&
      shippingOptions.some(([region]) => region === parsed.shippingRegion)
    ) {
      setShippingRegion(parsed.shippingRegion);
    }

    if (parsed.recognizedText) {
      setOcrText(parsed.recognizedText);
    }

    // 商品情報を反映
    const extractedItems = Array.isArray(parsed.items)
      ? parsed.items
      : [];

    const validItems = extractedItems.filter(
      (item: any) => String(item.name || "").trim()
    );

    if (validItems.length) {
      setItems(validItems.map((item: any, index: number) => {
        const base = makeItem();
        const recognizedColor = String(item.embroideryColor || "").trim();

        const matchedColor = embroideryColors.find(([number, name]) => {
          const full = `${String(number).padStart(2, "0")} ${name}`;
          return recognizedColor === full || recognizedColor.includes(name);
        });

        return {
          ...base,
          id: `ai-${Date.now()}-${index}`,
          name: String(item.name || "").trim(),
          price: Math.max(0, Number(item.price) || 0),
          quantity:
            item.quantity == null || Number(item.quantity) <= 0
              ? ""
              : Math.floor(Number(item.quantity)),
          embroidery: item.embroidery === true,
          embroiderySize: ["通常", "2.5cm", "3cm"].includes(String(item.embroiderySize || "")) ? String(item.embroiderySize) : "通常",
          embroideryText: String(item.embroideryText || ""),
          embroideryColor: matchedColor
            ? `${String(matchedColor[0]).padStart(2, "0")} ${matchedColor[1]}`
            : base.embroideryColor,
          embroideryPrice: Math.max(0, Number(item.embroideryPrice) || 0),
          embroideryUnitPrice: Math.max(0, Number(item.embroideryUnitPrice) || 0),
          embroideryCharacterCount: Math.max(0, Math.floor(Number(item.embroideryCharacterCount) || 1)),
          handedOver: false
        };
      }));
    }

    const filledCount = [
      parsed.customerName,
      parsed.phone,
      parsed.address,
      ...validItems.map((item: any) => item.name)
    ].filter(Boolean).length;

    if (!filledCount) {
      toast.warning("文字を十分に読み取れませんでした", {
        description: "写真を明るく撮り直してください。"
      });
    } else {
      toast.success("AI読み取りが完了しました", {
        description:
          `商品${validItems.length}件・お客様情報を反映しました。内容を確認してください。`
      });
    }

  } catch (error) {
    toast.error("AI読み取りに失敗しました", {
      description: error instanceof Error
        ? error.message
        : String(error)
    });
  } finally {
    setScanBusy(false);
  }
};
  
  const save = () => {
    if (!customerName.trim() || !phone.trim() || items.some(item => !item.name.trim())) {
      toast.error("お名前・電話番号・商品名を入力してください"); return;
    }
    if (items.some(item => item.quantity === "" || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)) {
      toast.error("商品の数量を1以上の整数で入力してください"); return;
    }
    const savedItems: OrderItem[] = items.map(item => ({ ...item, quantity: Number(item.quantity), embroideryPrice: item.embroidery ? Math.max(0, Number(item.embroideryUnitPrice) || 0) * Math.max(0, Number(item.embroideryCharacterCount) || 0) : item.embroideryPrice }));
    createOrder.mutate({ phone, customerName, address, items: savedItems, deliveryEnabled, shippingRegion: shippingRegion || null, shippingAmount: deliveryEnabled ? shippingAmount : 0, totalAmount, notes });
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
            <Field label="郵便番号"><input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="860-0001 / 8600001" inputMode="numeric" autoComplete="postal-code" maxLength={8} /></Field>
            <Field label="住所" wide><input value={address} onChange={e => setAddress(e.target.value)} placeholder="郵便番号から自動入力・手動修正も可能" autoComplete="street-address" />{postalStatus && <small className="postal-status">{postalStatus}</small>}</Field>
          </div>
        </div>

        <div className="panel scan-panel">
          <div className="panel-title"><div className="title-icon scan"><ScanLine size={18} /></div><div><p className="eyebrow">AI NOTE SCAN</p><h3>手書きメモから自動入力</h3></div><span className="beta-tag">確認してから保存</span></div>
          <div className="scan-content">
            <div className="scan-upload" onClick={() => scanInput.current?.click()} role="button" tabIndex={0}>
              {scanPreview ? <img src={scanPreview} alt="読み取りメモのプレビュー" /> : <><FileImage size={25} /><strong>メモ画像を選択</strong><span>撮影画像・スキャン画像を端末から選択</span></>}
              <input ref={scanInput} type="file" accept="image/*" hidden onChange={e => handleScan(e.target.files?.[0])} />
            </div>
            <div className="scan-text-wrap"><label className="field"><span className="field-label">AI読み取り結果</span><textarea value={ocrText} onChange={e => setOcrText(e.target.value)} placeholder="写真を選択して「AI読み取り・フォーム反映」を押してください" rows={4} /></label><p className="privacy-note"><ShieldCheck size={13} /> 写真はGemini AIで解析します。読み取り結果を確認・修正してから保存してください。</p><Button type="button" className="scan-button" onClick={runImageOcr} disabled={!scanFile || scanBusy}>{scanBusy
  ? <><RefreshCw size={16} className="spin" />AI読み取り中…</>
  : <><Sparkles size={16} />{scanJobId ? "読み取り結果を確認" : "AI読み取り・フォーム反映"}</>}</Button></div>
          </div>
        </div>

        <div className="panel items-panel">
          <div className="panel-title"><div className="title-icon item"><PackageCheck size={18} /></div><div><p className="eyebrow">ITEMS / 商品明細</p><h3>商品を追加</h3></div><span className="count-badge">{items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)} 点</span></div>
          <div className="item-list">{items.map((item, index) => <ItemCard key={item.id} item={item} index={index} onChange={patch => updateItem(item.id, patch)} onRemove={() => setItems(current => current.filter(entry => entry.id !== item.id))} onOpenSample={() => setSampleOpen(true)} tags={productTags} />)}</div>
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
          <div className="delivery-box"><div className="delivery-head"><div><p className="eyebrow">DELIVERY</p><strong>発送する</strong></div><button type="button" className={`switch ${deliveryEnabled ? "on" : ""}`} onClick={() => setDeliveryEnabled(!deliveryEnabled)} aria-label="発送する切り替え"><span /></button></div>{deliveryEnabled && <div className="shipping-select"><select value={shippingRegion} onChange={e => setShippingRegion(e.target.value)}><option value="">都道府県を選択</option>{shippingOptions.map(([region, amount]) => <option key={region} value={region}>{region}　{yen(amount)}</option>)}</select><small>クリックポスト・ネコポス / 離島除く</small></div>}</div>
          <Button type="button" className="save-button" onClick={save} disabled={createOrder.isPending}><Send size={17} />{createOrder.isPending ? "保存中…" : "この注文を保存"}</Button>
          <p className="save-hint"><ShieldCheck size={13} /> 保存データは認証済みスタッフのみ閲覧できます</p>
        </div>
        <div className="quick-info"><div className="quick-info-head"><Truck size={17} /><strong>送料表（税込・表示額をそのまま加算）</strong></div><div className="shipping-mini-grid">{shippingOptions.map(([region, amount]) => <span key={region}><b>{region}</b><em>{yen(amount)}</em></span>)}</div></div>
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
  const [printOrderIds, setPrintOrderIds] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: api.orders.list });
  const itemHandedOver = useMutation({ mutationFn: api.orders.setItemHandedOver, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }), onError: (error: Error) => toast.error("引き渡し状態を更新できませんでした", { description: error.message }) });
  const orders = (ordersQuery.data ?? []) as StoredOrder[];
  const filtered = orders.filter(order => {
    const matchesQuery = `${order.phone} ${order.customerName}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || (status === "done" ? order.handedOver : !order.handedOver);
    return matchesQuery && matchesStatus;
  });
  const groups = useMemo(() => Array.from(new Set(filtered.map(order => order.phone))).map(phone => ({ phone, orders: filtered.filter(order => order.phone === phone) })), [filtered]);
  const selectedOrders = filtered.filter(order => printOrderIds.includes(String(order.id)));
  const printGroups = Array.from(new Set(selectedOrders.map(order => order.phone))).map(phone => ({
    phone,
    orders: selectedOrders.filter(order => order.phone === phone),
  }));

  const togglePrintOrder = (id: string) => {
    setPrintOrderIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };
  const selectAllFiltered = () => {
    const ids = filtered.map(order => String(order.id));
    setPrintOrderIds(ids);
  };
  const clearPrintSelection = () => setPrintOrderIds([]);
  const printSelected = () => {
    if (!selectedOrders.length) {
      toast.error("印刷する注文を選択してください");
      return;
    }
    setTimeout(() => window.print(), 120);
  };
  const print = (phone: string) => {
    setPrintOrderIds(filtered.filter(order => order.phone === phone).map(order => String(order.id)));
    setTimeout(() => window.print(), 120);
  };

  return (
    <div className="saved-view">
      <div className="saved-header"><div><p className="eyebrow cyan">SAVED ORDERS / HISTORY</p><h2>保存済み注文</h2><p className="section-note">電話番号ごとに注文をまとめて、受け渡し状況を更新できます。</p></div><Button type="button" className="new-order-button" onClick={onNewOrder}><Plus size={17} /> 新しい注文</Button></div>
      <div className="saved-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="電話番号・お名前で検索" /></div><div className="filter-tabs"><button className={status === "all" ? "active" : ""} onClick={() => setStatus("all")}>すべて <b>{orders.length}</b></button><button className={status === "open" ? "active" : ""} onClick={() => setStatus("open")}>未受け渡し <b>{orders.filter(order => !order.handedOver).length}</b></button><button className={status === "done" ? "active" : ""} onClick={() => setStatus("done")}>渡し済み <b>{orders.filter(order => order.handedOver).length}</b></button></div><Button variant="ghost" size="icon" type="button" onClick={() => ordersQuery.refetch()} aria-label="更新"><RefreshCw size={17} className={ordersQuery.isFetching ? "spin" : ""} /></Button></div>
      <div className="print-selection-toolbar">
        <div className="print-selection-count">{selectedOrders.length}件選択中</div>
        <div className="print-selection-actions">
          <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered} disabled={!filtered.length}>全て選択</Button>
          <Button type="button" variant="ghost" size="sm" onClick={clearPrintSelection} disabled={!printOrderIds.length}>選択解除</Button>
          <Button type="button" size="sm" onClick={printSelected} disabled={!selectedOrders.length}><Printer size={15} /> 選択した注文を印刷</Button>
        </div>
      </div>
      {ordersQuery.isLoading ? <div className="empty-state"><RefreshCw className="spin" /><p>注文を読み込んでいます…</p></div> : groups.length === 0 ? <div className="empty-state"><ClipboardList size={35} /><h3>該当する注文はありません</h3><p>新しい注文を入力するか、検索条件を変更してください。</p></div> : <div className="order-groups">{groups.map(group => { const first = group.orders[0]; const openCount = group.orders.filter(order => !order.handedOver).length; return <article className="order-group" key={group.phone}><div className="group-head"><div className="group-person"><div className="avatar">{first.customerName.slice(0, 1) || "?"}</div><div><p className="eyebrow">PHONE / 注文番号</p><h3>{group.phone}</h3><span>{first.customerName} ・ {group.orders.length}件の注文</span></div></div><div className="group-actions"><span className={`status-pill ${openCount ? "open" : "done"}`}><span />{openCount ? `${openCount}件 未受け渡し` : "すべて渡し済み"}</span><Button variant="outline" size="sm" type="button" onClick={() => print(group.phone)}><Printer size={15} /> A4印刷</Button></div></div><div className="group-orders">{group.orders.map(order => <div className="order-row" key={order.id}><div className="order-row-main"><label className="order-print-check" aria-label={`注文 ${order.id} を印刷対象にする`}><input type="checkbox" checked={printOrderIds.includes(String(order.id))} onChange={() => togglePrintOrder(String(order.id))} /><span /></label><div className="order-id">#{String(order.id).padStart(4, "0")}</div><div className="order-main-content"><strong>{order.items.map(item => `${item.name || "商品未入力"} ×${Math.max(1, item.quantity || 1)}`).join(" / ")}</strong><span>{new Date(order.createdAt).toLocaleString("ja-JP")} ・ {order.deliveryEnabled ? `発送 ${order.shippingRegion}` : "会場受け取り"}</span><div className="order-item-handover-list">{order.items.map((item, itemIndex) => <div className="order-item-handover" key={item.id || itemIndex}><span>{item.name || "商品未入力"} ×{Math.max(1, item.quantity || 1)}{item.embroidery ? ` / 刺繍 ${item.embroiderySize || "通常"}` : ""}</span><Button type="button" size="sm" className={item.handedOver ? "handed-button done" : "handed-button"} disabled={itemHandedOver.isPending} onClick={() => itemHandedOver.mutate({ id: String(order.id), itemIndex, handedOver: !item.handedOver })}>{item.handedOver ? <><Check size={14} /> 渡し済み</> : <><PackageCheck size={14} /> 未渡し・渡す</>}</Button></div>)}</div></div></div><div className="order-row-total">{yen(order.totalAmount)}</div></div>)}</div></article>; })}</div>}
      {printGroups.map(({ phone, orders: groupPrintOrders }) => {
        const printCustomer = groupPrintOrders[0];
        return <div className="print-sheet" key={phone}>
          <div className="print-brand"><div className="print-mark">✦</div><div><strong>大会注文管理</strong><span>ORDER RECEIPT / A4</span></div></div>
          <div className="print-title"><div><p>受 注 票</p><h1>{printCustomer.customerName} 様</h1></div><div className="print-status">{groupPrintOrders.every(order => order.handedOver) ? "渡し済み" : groupPrintOrders.some(order => order.items.some(item => item.handedOver)) ? "一部渡し済み" : "未受け渡し"}</div></div>
          <div className="print-customer"><div><span>電話番号 / 注文番号</span><strong>{printCustomer.phone}</strong></div><div><span>住所</span><strong>{printCustomer.address || "—"}</strong></div></div>
          {groupPrintOrders.map(order => <div className="print-order" key={order.id}>
            <div className="print-order-head"><strong>注文 #{String(order.id).padStart(4, "0")}</strong><span>{new Date(order.createdAt).toLocaleString("ja-JP")}</span></div>
            {order.items.map(item => <div className="print-item" key={item.id}><span>{item.name} × {Math.max(1, item.quantity || 1)}点{item.embroidery ? ` / 刺繍：${item.embroideryText || "あり"}（サイズ：${item.embroiderySize || "通常"}・${item.embroideryColor}・${item.embroideryCharacterCount ?? 1}文字）` : ""}<small>単価：{yen(item.price + (item.embroidery ? item.embroideryPrice : 0))} ／ {item.handedOver ? "渡し済み" : "未渡し"}</small></span><strong>{yen((item.price + (item.embroidery ? item.embroideryPrice : 0)) * Math.max(1, item.quantity || 1))}</strong></div>)}
            {order.deliveryEnabled && <div className="print-item"><span>送料（{order.shippingRegion}）</span><strong>{yen(order.shippingAmount)}</strong></div>}
            <div className="print-total"><span>注文合計</span><strong>{yen(order.totalAmount)}</strong></div>
          </div>)}
          <div className="print-footer">ご注文内容をご確認ください。ありがとうございました。</div>
        </div>;
      })}
    </div>
  );
}

function ProductTagAdmin({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["productTags"], queryFn: api.productTags.list });
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const save = useMutation({
    mutationFn: () => editingId ? api.productTags.update({ id: editingId, name: name.trim(), price: Math.max(0, Number(price) || 0) }) : api.productTags.create({ name: name.trim(), price: Math.max(0, Number(price) || 0) }),
    onSuccess: () => { toast.success(editingId ? "商品タグを更新しました" : "商品タグを追加しました"); setEditingId(""); setName(""); setPrice(""); queryClient.invalidateQueries({ queryKey: ["productTags"] }); },
    onError: (e: Error) => toast.error("保存できません", { description: e.message }),
  });
  const remove = useMutation({ mutationFn: api.productTags.remove, onSuccess: () => { toast.success("商品タグを削除しました"); queryClient.invalidateQueries({ queryKey: ["productTags"] }); }, onError: (e: Error) => toast.error(e.message) });
  const beginEdit = (tag: ApiProductTag) => { setEditingId(tag.id); setName(tag.name); setPrice(String(tag.price)); };
  return <section className="staff-admin-panel product-tag-admin"><div className="staff-admin-heading"><div><p className="eyebrow cyan">SHARED PRODUCT TAGS</p><h2>商品名・価格タグ管理</h2><p className="section-note">ここで登録したタグは、全スタッフの新規注文画面で共通利用できます。</p></div><Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button></div>
    <form className="staff-create-form tag-create-form" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; save.mutate(); }}><input value={name} onChange={e => setName(e.target.value)} placeholder="商品名" required /><input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="税込価格" required /><Button type="submit" disabled={save.isPending}><Plus size={15} />{editingId ? "変更を保存" : "タグを追加"}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(""); setName(""); setPrice(""); }}>キャンセル</Button>}</form>
    <div className="staff-list">{query.isLoading ? <p>読み込み中…</p> : query.data?.length ? query.data.map(tag => <div className="staff-row" key={tag.id}><div><strong>{tag.name}</strong><span>{yen(tag.price)}</span></div><Button size="sm" variant="outline" onClick={() => beginEdit(tag)}><Pencil size={14} /> 編集</Button><Button size="sm" variant="outline" onClick={() => { if (window.confirm(`「${tag.name}」を削除しますか？`)) remove.mutate(tag.id); }} disabled={remove.isPending}><Trash2 size={14} /> 削除</Button></div>) : <p className="section-note">商品タグはまだ登録されていません。</p>}</div>
  </section>;
}

export default function Home() {
  const queryClient = useQueryClient();
  // 認証状態は初回とログイン状態の更新時だけ確認し、毎分の定期通信を止める。
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.auth.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: false
  });
  // ログイン済みなら初期設定状態の確認は不要。
  const setup = useQuery({
    queryKey: ["auth", "setup"],
    queryFn: api.auth.setupStatus,
    retry: false,
    // 未ログイン端末ではme確認と並行して初期設定状態を取得し、ログイン画面の待ち時間を短縮。
    enabled: !getToken(),
    staleTime: 5 * 60 * 1000
  });
  const [email, setEmail] = useState("hs.0319yu@gmail.com");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("管理者");
  const [setupKey, setSetupKey] = useState("");
  const [showStaff, setShowStaff] = useState(false);
  const [showTags, setShowTags] = useState(false);
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
  if (!me.data) return <div className="auth-screen"><form className="auth-card" autoComplete="on" onSubmit={event => { event.preventDefault(); if (setup.data?.needsSetup) bootstrap.mutate({ setupKey, email, name, password }); else login.mutate({ email, password }); }}>
    <div className="brand-lockup"><div className="brand-symbol">✦</div><div><strong>大会注文管理</strong><span>PRIVATE STAFF ACCESS</span></div></div>
    <p className="eyebrow cyan">SECURE SIGN IN</p><h1>{setup.data?.needsSetup ? "管理者の初期登録" : "スタッフログイン"}</h1>
    <p className="auth-description">登録済みのスタッフのみ利用できます。アカウント情報を入力してください。</p>
    {setup.data?.needsSetup && <><label className="field"><span className="field-label">管理者名</span><input value={name} onChange={e => setName(e.target.value)} required /></label><label className="field"><span className="field-label">初期設定キー</span><input value={setupKey} onChange={e => setSetupKey(e.target.value)} required autoComplete="off" /></label></>}
    <label className="field"><span className="field-label">メールアドレス</span><input type="email" name="username" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required readOnly={Boolean(setup.data?.needsSetup)} /></label>
    <label className="field"><span className="field-label">パスワード（12文字以上）</span><input type="password" name="password" value={password} onChange={e => setPassword(e.target.value)} minLength={12} required autoComplete={setup.data?.needsSetup ? "new-password" : "current-password"} /></label>
    <Button className="save-button" type="submit" disabled={login.isPending || bootstrap.isPending}>{setup.data?.needsSetup ? "管理者アカウントを作成" : "ログイン"}</Button>
    <p className="auth-footnote"><ShieldCheck size={14} /> 通信はHTTPS・パスワードはハッシュ化して保存</p>
  </form></div>;
  return <div className="app-shell"><header className="topbar"><div className="brand-lockup"><div className="brand-symbol">✦</div><div><strong>大会注文管理</strong><span>SECURE STAFF CONSOLE</span></div></div><nav className="view-switch"><button className={mainView === "new" ? "active" : ""} onClick={() => setMainView("new")}><Plus size={16} /> 新規注文</button><button className={mainView === "saved" ? "active" : ""} onClick={() => setMainView("saved")}><ClipboardList size={16} /> 保存済み <span>注文</span></button></nav><div className="staff-menu"><div className="staff-avatar">{me.data.name?.slice(0, 1) ?? "S"}</div><div className="staff-name"><strong>{me.data.name ?? "スタッフ"}</strong><span>{me.data.role === "admin" ? "管理者" : "認証済み"}</span></div>{me.data.role === "admin" && <><Button variant="outline" size="sm" type="button" onClick={() => { setShowStaff(v => !v); setShowTags(false); }}>スタッフ管理</Button><Button variant="outline" size="sm" type="button" onClick={() => { setShowTags(v => !v); setShowStaff(false); }}><Tag size={14} /> 商品タグ管理</Button></>}<Button variant="ghost" size="icon" type="button" onClick={() => logout.mutate()} aria-label="ログアウト"><LogOut size={16} /></Button></div></header>
    {showStaff && me.data.role === "admin" && <section className="staff-admin-panel"><div className="staff-admin-heading"><div><p className="eyebrow cyan">ADMIN / STAFF</p><h2>スタッフアカウント管理</h2></div><Button variant="ghost" size="icon" onClick={() => setShowStaff(false)}><X size={18} /></Button></div><form className="staff-create-form" onSubmit={event => { event.preventDefault(); createStaff.mutate({ email: newStaffEmail, name: newStaffName, password: newStaffPassword }); }}><input type="text" placeholder="スタッフ名" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} required /><input type="email" placeholder="メールアドレス" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} required /><input type="password" placeholder="初期パスワード（12文字以上）" value={newStaffPassword} onChange={e => setNewStaffPassword(e.target.value)} minLength={12} required /><Button type="submit" disabled={createStaff.isPending}><Plus size={15} /> スタッフ追加</Button></form><div className="staff-list">{staffQuery.data?.map(staff => <div className="staff-row" key={staff.id}><div><strong>{staff.name}</strong><span>{staff.email} · {staff.role === "admin" ? "管理者" : "スタッフ"}</span></div><span className={staff.isActive ? "staff-active" : "staff-disabled"}>{staff.isActive ? "有効" : "停止中"}</span>{staff.role !== "admin" && <Button size="sm" variant="outline" onClick={() => changeStaff.mutate({ id: staff.id, active: !staff.isActive })}>{staff.isActive ? "利用停止" : "再有効化"}</Button>}</div>)}</div></section>}
    {showTags && me.data.role === "admin" && <ProductTagAdmin onClose={() => setShowTags(false)} />}
    <main className="main-shell">{mainView === "new" ? <NewOrder onSaved={() => { queryClient.invalidateQueries({ queryKey: ["orders"] }); setMainView("saved"); }} /> : <SavedOrders onNewOrder={() => setMainView("new")} />}</main><footer className="app-footer"><span><ShieldCheck size={13} /> 個人情報は認証済みスタッフ専用</span><span>大会注文管理 / v1.1</span></footer></div>;
}
