/**
 * 大会注文アプリ API
 * 保存先：大会注文アプリ_DB
 *
 * WorkerからJSONで受け取る action：
 * auth.setupStatus / auth.bootstrapAdmin / auth.login / auth.me / auth.logout
 * auth.staffList / auth.createStaff / auth.setStaffActive
 * orders.list / orders.create / orders.setHandedOver / orders.setItemHandedOver
 */

const TAIKAI_ADMIN_EMAIL = 'hs.0319yu@gmail.com';
const TAIKAI_SESSION_HOURS = 6;

// ---------- 共通処理 ----------
function apiResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function apiDb_() {
  const id = PropertiesService.getScriptProperties().getProperty('TAIKAIORDER_SPREADSHEET_ID');
  if (!id) throw new Error('データベースIDが設定されていません。');
  return SpreadsheetApp.openById(id);
}
function apiBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}
function apiText_(value) { return String(value == null ? '' : value).trim(); }
function apiNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}
function apiUuid_() { return Utilities.getUuid(); }
function apiFindStaff_(email) {
  const sheet = apiDb_().getSheetByName('スタッフ');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  // 全スタッフ行を毎回読み込まず、メール列だけを検索して該当行のみ取得する。
  const match = sheet.getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(apiText_(email))
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();

  if (!match) return null;
  const row = match.getRow();
  return { row: row, data: sheet.getRange(row, 1, 1, 7).getValues()[0] };
}
// ---------- 都道府県別送料 ----------
const TAIKAI_SHIPPING_RATES = {
  '北海道': 1500,

  '青森県': 880,
  '岩手県': 880,
  '宮城県': 880,
  '秋田県': 880,
  '山形県': 880,
  '福島県': 880,

  '東京都': 880,
  '神奈川県': 880,
  '埼玉県': 880,
  '千葉県': 880,
  '茨城県': 880,
  '栃木県': 880,
  '群馬県': 880,
  '山梨県': 880,

  '新潟県': 880,
  '長野県': 880,
  '富山県': 880,
  '石川県': 880,
  '福井県': 880,

  '愛知県': 880,
  '岐阜県': 880,
  '静岡県': 880,
  '三重県': 880,

  '大阪府': 880,
  '兵庫県': 880,
  '京都府': 880,
  '滋賀県': 880,
  '奈良県': 880,
  '和歌山県': 880,

  '鳥取県': 700,
  '島根県': 700,
  '岡山県': 700,
  '広島県': 700,
  '山口県': 700,

  '徳島県': 700,
  '香川県': 700,
  '愛媛県': 700,
  '高知県': 700,

  '福岡県': 700,
  '佐賀県': 700,
  '長崎県': 700,
  '熊本県': 700,
  '大分県': 700,
  '宮崎県': 700,
  '鹿児島県': 700,

  '沖縄県': 2860
};

function apiShippingList_() {
  return {
    success: true,
    shippingRates: TAIKAI_SHIPPING_RATES
  };
}
// ---------- パスワード ----------
function apiHashPassword_(password, salt) {
  let value = salt + ':' + password;
  for (let i = 0; i < 5000; i++) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    value = Utilities.base64Encode(bytes);
  }
  return value;
}
function apiPasswordRecord_(password) {
  const salt = apiUuid_() + apiUuid_();
  return { salt: salt, hash: apiHashPassword_(password, salt) };
}
function apiVerifyPassword_(password, salt, hash) { return apiHashPassword_(password, salt) === hash; }

// ---------- セッション ----------
function apiCreateSession_(staff) {
  const token = apiUuid_() + apiUuid_() + apiUuid_();
  const session = { staffId: staff[0], email: staff[1], name: staff[2], role: staff[3] };
  CacheService.getScriptCache().put('TAIKAI_SESSION_' + token, JSON.stringify(session), TAIKAI_SESSION_HOURS * 60 * 60);
  return token;
}
function apiGetSession_(token) {
  if (!token) return null;
  const value = CacheService.getScriptCache().get('TAIKAI_SESSION_' + token);
  return value ? JSON.parse(value) : null;
}
function apiRequireSession_(body) {
  const session = apiGetSession_(apiText_(body.token));
  if (!session) throw new Error('ログイン期限が切れています。再ログインしてください。');
  return session;
}
function apiRequireAdmin_(body) {
  const session = apiRequireSession_(body);
  if (session.role !== 'admin') throw new Error('管理者権限が必要です。');
  return session;
}

// ---------- 認証 API ----------
function apiSetupStatus_() {
  const sheet = apiDb_().getSheetByName('スタッフ');
  return { success: true, setupRequired: sheet.getLastRow() <= 1 };
}
function apiBootstrapAdmin_(body) {
  const props = PropertiesService.getScriptProperties();
  const expectedKey = props.getProperty('TAIKAIORDER_SETUP_KEY');
  if (!expectedKey) throw new Error('初回登録キーが設定されていません。');
  if (String(body.setupKey || '') !== expectedKey) throw new Error('初回登録キーが違います。');
  const email = apiText_(body.email).toLowerCase();
  const name = apiText_(body.name);
  const password = String(body.password || '');
  if (email !== TAIKAI_ADMIN_EMAIL) throw new Error('管理者メールアドレスが一致しません。');
  if (!name) throw new Error('管理者名を入力してください。');
  if (password.length < 12) throw new Error('パスワードは12文字以上にしてください。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = apiDb_().getSheetByName('スタッフ');
    if (sheet.getLastRow() > 1) throw new Error('管理者の初期登録は既に完了しています。');
    const record = apiPasswordRecord_(password);
    props.setProperty('TAIKAI_PASSWORD_' + email, JSON.stringify(record));
    sheet.appendRow([apiUuid_(), email, name, 'admin', true, apiNow_(), '']);
    props.deleteProperty('TAIKAIORDER_SETUP_KEY');
    return { success: true, message: '管理者を登録しました。' };
  } finally { lock.releaseLock(); }
}
function apiLogin_(body) {
  const email = apiText_(body.email).toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) throw new Error('メールアドレスとパスワードを入力してください。');
  const cache = CacheService.getScriptCache();
  const rateKey = 'TAIKAI_LOGIN_FAIL_' + email;
  const failures = Number(cache.get(rateKey) || 0);
  if (failures >= 8) throw new Error('ログイン試行回数が上限に達しました。15分後に再試行してください。');
  const found = apiFindStaff_(email);
  if (!found || found.data[4] !== true) {
    cache.put(rateKey, String(failures + 1), 900);
    throw new Error('メールアドレスまたはパスワードが違います。');
  }
  const recordText = PropertiesService.getScriptProperties().getProperty('TAIKAI_PASSWORD_' + email);
  if (!recordText) throw new Error('パスワード情報がありません。管理者に確認してください。');
  const record = JSON.parse(recordText);
  if (!apiVerifyPassword_(password, record.salt, record.hash)) {
    cache.put(rateKey, String(failures + 1), 900);
    throw new Error('メールアドレスまたはパスワードが違います。');
  }
  cache.remove(rateKey);
  apiDb_().getSheetByName('スタッフ').getRange(found.row, 7).setValue(apiNow_());
  const token = apiCreateSession_(found.data);
  return { success: true, token: token, user: { id: found.data[0], email: found.data[1], name: found.data[2], role: found.data[3] } };
}
function apiMe_(body) { return { success: true, user: apiRequireSession_(body) }; }
function apiLogout_(body) {
  const token = apiText_(body.token);
  if (token) CacheService.getScriptCache().remove('TAIKAI_SESSION_' + token);
  return { success: true };
}

// ---------- スタッフ管理 API ----------
function apiStaffList_(body) {
  apiRequireAdmin_(body);
  const values = apiDb_().getSheetByName('スタッフ').getDataRange().getValues();
  const staff = values.slice(1).map(row => ({ id: row[0], email: row[1], name: row[2], role: row[3], active: row[4] === true, createdAt: row[5], lastLogin: row[6] }));
  return { success: true, staff: staff };
}
function apiCreateStaff_(body) {
  apiRequireAdmin_(body);
  const email = apiText_(body.email).toLowerCase();
  const name = apiText_(body.name);
  const password = String(body.password || '');
  const role = body.role === 'admin' ? 'admin' : 'staff';
  if (!email || !email.includes('@')) throw new Error('正しいメールアドレスを入力してください。');
  if (!name) throw new Error('氏名を入力してください。');
  if (password.length < 12) throw new Error('パスワードは12文字以上にしてください。');
  if (apiFindStaff_(email)) throw new Error('このメールアドレスは既に登録されています。');
  const record = apiPasswordRecord_(password);
  apiDb_().getSheetByName('スタッフ').appendRow([apiUuid_(), email, name, role, true, apiNow_(), '']);
  PropertiesService.getScriptProperties().setProperty('TAIKAI_PASSWORD_' + email, JSON.stringify(record));
  return { success: true, message: 'スタッフを登録しました。' };
}
function apiSetStaffActive_(body) {
  apiRequireAdmin_(body);
  const id = apiText_(body.staffId);
  const active = body.active === true;
  const sheet = apiDb_().getSheetByName('スタッフ');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (apiText_(values[i][0]) === id) {
      if (values[i][1] === TAIKAI_ADMIN_EMAIL && !active) throw new Error('管理者アカウントは停止できません。');
      sheet.getRange(i + 1, 5).setValue(active);
      return { success: true };
    }
  }
  throw new Error('スタッフが見つかりません。');
}
function setupProductTags() {
  apiEnsureTagSheet_();
}
// ---------- 商品タグ管理 ----------

function apiEnsureTagSheet_() {
  const ss = apiDb_();
  let sheet = ss.getSheetByName('商品タグ');

  if (!sheet) {
    sheet = ss.insertSheet('商品タグ');
    sheet.appendRow([
      'tagId',
      '商品名',
      '価格',
      '有効',
      '更新日時'
    ]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

// 全スタッフがタグを取得

// 全スタッフがタグを取得
function apiTagsList_(body) {
  apiRequireSession_(body);

  const sheet = apiEnsureTagSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return { success: true, tags: [] };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const tags = [];

  values.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = String(row[1] || '').trim();

    if (!name) return;

    // タグIDが空欄なら自動発行
    let id = String(row[0] || '').trim();

    if (!id) {
      id = apiUuid_();
      sheet.getRange(rowNumber, 1).setValue(id);
    }

    // 有効欄が空欄ならTRUEにする
    let active = row[3];

    if (active === '' || active == null) {
      active = true;
      sheet.getRange(rowNumber, 4).setValue(true);
    }

    // 無効の商品は表示しない
    if (active === false || String(active).toUpperCase() === 'FALSE') {
      return;
    }

    tags.push({
      id: id,
      name: name,
      price: Math.max(0, Number(row[2]) || 0),
      active: true
    });
  });

  return {
    success: true,
    tags: tags
  };
}


// タグ追加
function apiTagsCreate_(body) {
  apiRequireAdmin_(body);

  const name = apiText_(body.name);
  const price = Math.max(0, Number(body.price) || 0);

  if (!name) throw new Error('商品名を入力してください。');

  const sheet = apiEnsureTagSheet_();
  const id = apiUuid_();

  sheet.appendRow([
    id,
    name,
    price,
    true,
    apiNow_()
  ]);

  return { success: true, id: id };
}

// タグ編集
function apiTagsUpdate_(body) {
  apiRequireAdmin_(body);

  const id = apiText_(body.tagId);
  const name = apiText_(body.name);
  const price = Math.max(0, Number(body.price) || 0);

  if (!id) throw new Error('タグIDがありません。');
  if (!name) throw new Error('商品名を入力してください。');

  const sheet = apiEnsureTagSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) throw new Error('タグが見つかりません。');

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      sheet.getRange(i + 2, 2, 1, 4).setValues([[
        name,
        price,
        true,
        apiNow_()
      ]]);

      return { success: true };
    }
  }

  throw new Error('タグが見つかりません。');
}

// タグ削除
function apiTagsDelete_(body) {
  apiRequireAdmin_(body);

  const id = apiText_(body.tagId);
  const sheet = apiEnsureTagSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) throw new Error('タグが見つかりません。');

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      sheet.deleteRow(i + 2);
      return { success: true };
    }
  }

  throw new Error('タグが見つかりません。');
}

// ---------- 注文 API ----------
function apiOrdersList_(body) {
  apiRequireSession_(body);
  const values = apiDb_().getSheetByName('注文').getDataRange().getValues();
  const orders = values.slice(1).filter(row => row[0]).map(row => {
    let items = [];
    try { items = JSON.parse(row[4] || '[]'); } catch (e) { items = []; }
    const legacyOrderHandedOver = row[9] === true;
    items = items.map(item => ({
      ...item,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      handedOver: typeof item.handedOver === 'boolean' ? item.handedOver : legacyOrderHandedOver
    }));
    const allHandedOver = items.length > 0 && items.every(item => item.handedOver === true);
    return {
      id: row[0], phone: row[1], customerName: row[2], address: row[3], items: items,
      deliveryEnabled: row[5] === true, shippingRegion: row[6], shippingAmount: Number(row[7] || 0),
      totalAmount: Number(row[8] || 0), handedOver: allHandedOver, notes: row[10],
      createdBy: row[11], createdAt: row[12], updatedAt: row[13]
    };
  });
  orders.reverse();
  return { success: true, orders: orders };
}
function apiCreateOrder_(body) {
  const session = apiRequireSession_(body);
  const order = body.order || {};

  const customerName = apiText_(order.customerName);
  const phone = apiText_(order.phone);
  const sourceItems = Array.isArray(order.items) ? order.items : [];

  if (!customerName) {
    throw new Error('お客様名を入力してください。');
  }

  if (!sourceItems.length) {
    throw new Error('商品を1つ以上入力してください。');
  }

  // 商品・刺繍料金を計算
  const items = sourceItems.map(item => {
    const quantity = Math.max(
      1,
      Math.floor(Number(item.quantity) || 1)
    );

    const embroidery = item.embroidery === true;

    // 刺繍文字数。空白は文字数に含めない。
    const embroideryText = String(item.embroideryText || '');
    const embroideryCharacterCount = Array.from(
      embroideryText.replace(/\s/g, '')
    ).length;

    // 1文字あたりの刺繍単価
    const embroideryUnitPrice = Math.max(
      0,
      Number(
        item.embroideryUnitPrice != null
          ? item.embroideryUnitPrice
          : item.embroideryPrice
      ) || 0
    );

    // 刺繍料金 = 1文字単価 × 文字数
    const embroideryPrice = embroidery
      ? embroideryUnitPrice * embroideryCharacterCount
      : 0;

    return {
      ...item,
      quantity: quantity,
      embroidery: embroidery,
      embroideryText: embroideryText,
      embroideryCharacterCount: embroideryCharacterCount,
      embroideryUnitPrice: embroideryUnitPrice,
      embroideryPrice: embroideryPrice,
      handedOver: false
    };
  });

  // 送料
  const deliveryEnabled = order.deliveryEnabled === true;
  const shippingRegion = apiText_(order.shippingRegion);

  let shippingAmount = 0;

  if (deliveryEnabled) {
    if (!Object.prototype.hasOwnProperty.call(
      TAIKAI_SHIPPING_RATES,
      shippingRegion
    )) {
      throw new Error('配送先の都道府県を選択してください。');
    }

    // 画面から送られた送料ではなく、送料マスターから確定
    shippingAmount = TAIKAI_SHIPPING_RATES[shippingRegion];
  }

  // 商品合計
  const calculatedItems = items.reduce((sum, item) => {
    const price = Math.max(0, Number(item.price) || 0);
    const embroideryPrice = Math.max(
      0,
      Number(item.embroideryPrice) || 0
    );

    return sum + (price + embroideryPrice) * item.quantity;
  }, 0);

  const totalAmount = calculatedItems + shippingAmount;

  const now = apiNow_();

  const orderId =
    'TK-' +
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss') +
    '-' +
    Math.floor(Math.random() * 1000);

  apiDb_().getSheetByName('注文').appendRow([
    orderId,
    phone,
    customerName,
    apiText_(order.address),
    JSON.stringify(items),
    deliveryEnabled,
    deliveryEnabled ? shippingRegion : '',
    shippingAmount,
    totalAmount,
    false,
    apiText_(order.notes),
    session.name,
    now,
    now
  ]);

  return {
    success: true,
    orderId: orderId,
    totalAmount: totalAmount,
    shippingAmount: shippingAmount
  };
}
// 互換用：注文全体の一括切り替え。既存画面・既存データとの互換性を維持する。
function apiSetHandedOver_(body) {
  apiRequireSession_(body);
  const id = apiText_(body.orderId);
  const handedOver = body.handedOver === true;
  const sheet = apiDb_().getSheetByName('注文');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (apiText_(values[i][0]) === id) {
      let items = [];
      try { items = JSON.parse(values[i][4] || '[]'); } catch (e) { items = []; }
      items = items.map(item => ({ ...item, handedOver: handedOver }));
      sheet.getRange(i + 1, 5).setValue(JSON.stringify(items));
      sheet.getRange(i + 1, 10).setValue(handedOver);
      sheet.getRange(i + 1, 14).setValue(apiNow_());
      return { success: true };
    }
  }
  throw new Error('注文が見つかりません。');
}

// 商品明細ごとの引き渡し状態を更新する。
function apiSetItemHandedOver_(body) {
  apiRequireSession_(body);
  const id = apiText_(body.orderId);
  const itemIndex = Number(body.itemIndex);
  const handedOver = body.handedOver === true;
  if (!Number.isInteger(itemIndex) || itemIndex < 0) throw new Error('商品指定が正しくありません。');
  const sheet = apiDb_().getSheetByName('注文');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (apiText_(values[i][0]) !== id) continue;
    let items = [];
    try { items = JSON.parse(values[i][4] || '[]'); } catch (e) { items = []; }
    if (itemIndex >= items.length) throw new Error('商品が見つかりません。');
    items[itemIndex] = { ...items[itemIndex], handedOver: handedOver };
    const allHandedOver = items.length > 0 && items.every(item => item.handedOver === true);
    sheet.getRange(i + 1, 5).setValue(JSON.stringify(items));
    sheet.getRange(i + 1, 10).setValue(allHandedOver);
    sheet.getRange(i + 1, 14).setValue(apiNow_());
    return { success: true, handedOver: handedOver, orderHandedOver: allHandedOver };
  }
  throw new Error('注文が見つかりません。');
}

// ---------- Gemini画像OCR API ----------
function apiParseOrderImage_(body, background) {
  // 通常APIではログイン確認。バックグラウンド処理では実行トリガーが処理する。
  if (!background) apiRequireSession_(body);

  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません。');

  let imageBase64 = String(body.imageBase64 || '');
  const mimeType = String(body.mimeType || 'image/jpeg').toLowerCase();

  if (!imageBase64) throw new Error('画像データがありません。');

  // data URL形式で届いた場合にも対応
  if (imageBase64.indexOf('base64,') !== -1) {
    imageBase64 = imageBase64.split('base64,').pop();
  }

  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)) {
    throw new Error('対応していない画像形式です。');
  }

  const prompt = `
あなたは大会注文書を正確にデータ化する専門の読み取り担当です。
画像全体を確認し、注文書に記載された内容だけをJSONで返してください。

【最重要ルール】
1. 商品行を上から順番に、抜けなくすべて items に入れる。似た商品名でも勝手に統合しない。
2. 商品名は省略せず、品番・サイズ・色・左右・仕様など、画像に書かれた識別情報を含める。
3. 商品名・単価・数量・刺繍代を別々に読む。列の位置を確認し、隣の列の数字を混同しない。
4. 「単価」と「金額／小計／合計」を混同しない。price には単価欄の金額だけを入れる。単価欄がなく、合計金額しかない場合は推測せず 0 にする。
5. 数字は桁・カンマ・円記号を確認する。読み取れない金額は 0、数量は 0 にする。
6. 数量が空欄・不明の場合は 0 にする。数量を1と推測しない。
7. お客様名・電話番号・郵便番号・住所は、文字や数字を補完せず、読めた範囲をそのまま記録する。
8. 刺繍の有無・文字・色・サイズ・刺繍価格は明記されている場合だけ反映する。
9. 刺繍サイズは「通常」「2.5cm」「3cm」のいずれか。明記がなければ「通常」。
10. 配送・送料・備考は明記されている内容だけを反映する。
11. 判読に自信がない値を作らない。recognizedText には判読できた文字を行ごとに簡潔に転記する。
12. JSON以外の文章、Markdown、コードフェンスは一切出力しない。

【金額と数量の確認】
- 価格欄が「単価」「販売価格」の場合、その金額を price に入れる。
- 「数量」「個数」の欄を quantity に入れる。
- 行の右端にある金額が小計の場合、price に小計を入れない。
- 1行に商品名とサイズ違いが複数並ぶ場合、注文行ごとに分ける。
- 同じ商品が複数行にある場合も、画像どおり別々の行として残す。
`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      recognizedText: { type: 'STRING' },
      customerName: { type: 'STRING' },
      phone: { type: 'STRING' },
      postalCode: { type: 'STRING' },
      address: { type: 'STRING' },
      deliveryEnabled: { type: 'BOOLEAN' },
      shippingRegion: { type: 'STRING' },
      notes: { type: 'STRING' },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            price: { type: 'NUMBER' },
            quantity: { type: 'INTEGER' },
            embroidery: { type: 'BOOLEAN' },
            embroideryText: { type: 'STRING' },
            embroiderySize: { type: 'STRING', enum: ['通常', '2.5cm', '3cm'] },
            embroideryColor: { type: 'STRING' },
            embroideryPrice: { type: 'NUMBER' }
          },
          required: ['name', 'price', 'quantity', 'embroidery', 'embroideryText', 'embroiderySize', 'embroideryColor', 'embroideryPrice']
        }
      }
    },
    required: ['recognizedText', 'customerName', 'phone', 'postalCode', 'address', 'deliveryEnabled', 'shippingRegion', 'notes', 'items']
  };

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: imageBase64
          }
        }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
      thinkingConfig: { thinkingLevel: 'low' },
      maxOutputTokens: 4096
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const responseText = response.getContentText();

  if (status !== 200) {
    throw new Error('Gemini APIエラー (' + status + '): ' + responseText.substring(0, 1000));
  }

  const geminiResult = JSON.parse(responseText);
  const parts = geminiResult.candidates &&
    geminiResult.candidates[0] &&
    geminiResult.candidates[0].content &&
    geminiResult.candidates[0].content.parts;

  if (!parts || !parts.length || !parts[0].text) {
    throw new Error('Geminiから画像読み取り結果が返ってきませんでした。');
  }

  let resultText = parts.map(p => p.text || '').join('').trim();
  resultText = resultText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(resultText);
  } catch (e) {
    throw new Error('Geminiの読み取り結果をJSONとして解析できませんでした。');
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return {
    success: true,
    recognizedText: String(parsed.recognizedText || ''),
    customerName: String(parsed.customerName || ''),
    phone: String(parsed.phone || ''),
    postalCode: String(parsed.postalCode || ''),
    address: String(parsed.address || ''),
    deliveryEnabled: parsed.deliveryEnabled === true,
    shippingRegion: String(parsed.shippingRegion || ''),
    notes: String(parsed.notes || ''),
    items: items
      .filter(item => item && String(item.name || '').trim())
      .map(item => ({
        name: String(item.name || '').trim(),
        price: Math.max(0, Number(item.price) || 0),
        quantity: item.quantity == null || item.quantity === '' || Number(item.quantity) <= 0
          ? null
          : Math.max(1, Math.floor(Number(item.quantity) || 1)),
        embroidery: item.embroidery === true,
        embroideryText: String(item.embroideryText || ''),
        embroiderySize: ['通常', '2.5cm', '3cm'].includes(String(item.embroiderySize || ''))
          ? String(item.embroiderySize)
          : '通常',
        embroideryColor: String(item.embroideryColor || ''),
        embroideryPrice: Math.max(0, Number(item.embroideryPrice) || 0)
      }))
  };
}
// ★ここに追加する★

// ---------- 非同期OCRジョブ管理 ----------
// OCRジョブ シートの列：
// A jobId / B staffId / C status / D driveFileId / E mimeType
// F resultJson / G error / H createdAt / I updatedAt


function apiEnsureOcrSheet_() {
  const ss = apiDb_();
  let sheet = ss.getSheetByName('OCRジョブ');

  if (!sheet) {
    sheet = ss.insertSheet('OCRジョブ');
    sheet.appendRow([
      'jobId', 'staffId', 'status', 'driveFileId', 'mimeType',
      'resultJson', 'error', 'createdAt', 'updatedAt', 'attempts'
    ]);
    sheet.setFrozenRows(1);
  } else if (!sheet.getRange(1, 10).getValue()) {
    sheet.getRange(1, 10).setValue('attempts');
  }

  return sheet;
}


function apiEnsureOcrTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(
    trigger => trigger.getHandlerFunction() === 'processOcrQueue_'
  );

  if (!exists) {
    ScriptApp.newTrigger('processOcrQueue_')
      .timeBased()
      .everyMinutes(1)
      .create();
  }

  // OCR履歴の定期整理トリガーも、初回セットアップ時または初回OCR時に1つだけ作成する。
  apiEnsureOcrCleanupTrigger_();
}

/**
 * OCR履歴の自動整理トリガーを1日1回作成する。
 * 実行時刻はApps Scriptプロジェクトのタイムゾーンで午前3時ごろ。
 */
function apiEnsureOcrCleanupTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(
    trigger => trigger.getHandlerFunction() === 'cleanupOldOcrJobs_'
  );

  if (!exists) {
    ScriptApp.newTrigger('cleanupOldOcrJobs_')
      .timeBased()
      .everyDays(1)
      .atHour(3)
      .create();
  }
}

/**
 * 完了・失敗から30日以上経過したOCRジョブだけを削除する。
 * queued / processing は日数に関係なく削除しない。
 * 注文シートやスタッフシートには一切触れない。
 */
function cleanupOldOcrJobs_() {
  const sheet = apiDb_().getSheetByName('OCRジョブ');
  if (!sheet) {
    Logger.log('OCRジョブシートがないため、整理をスキップしました。');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rowsToDelete = [];

  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][2] || '');
    if (status !== 'done' && status !== 'failed') continue;

    // I列の更新日時（完了・失敗日時）を優先。なければH列の作成日時を使う。
    const timestampValue = values[i][8] || values[i][7];
    if (!timestampValue) continue;

    const timestamp = timestampValue instanceof Date
      ? timestampValue.getTime()
      : new Date(timestampValue).getTime();

    if (Number.isFinite(timestamp) && timestamp < cutoff) {
      rowsToDelete.push(i + 2);
    }
  }

  if (!rowsToDelete.length) {
    Logger.log('削除対象のOCR履歴はありません。');
    return;
  }

  // 連続した行をまとめ、下の行から削除して行番号のずれを防ぐ。
  const blocks = [];
  let start = rowsToDelete[0];
  let end = start;

  for (let i = 1; i < rowsToDelete.length; i++) {
    if (rowsToDelete[i] === end + 1) {
      end = rowsToDelete[i];
    } else {
      blocks.push({ start: start, count: end - start + 1 });
      start = rowsToDelete[i];
      end = start;
    }
  }
  blocks.push({ start: start, count: end - start + 1 });

  for (let i = blocks.length - 1; i >= 0; i--) {
    sheet.deleteRows(blocks[i].start, blocks[i].count);
  }

  Logger.log(rowsToDelete.length + '件の古いOCR履歴を削除しました。');
}

// 初回だけApps Scriptエディタから手動実行する
function setupOcrSystem() {
  apiEnsureOcrSheet_();

  // Driveへのアクセス権限を事前に確認
  DriveApp.getRootFolder().getName();

  // OCR処理用トリガーを1つだけ作成
  apiEnsureOcrTrigger_();

  Logger.log('OCRシステムの準備が完了しました。');
}

// 画像を受け取り、ジョブとして登録する
function apiStartOrderImage_(body) {
  const session = apiRequireSession_(body);

  let imageBase64 = String(body.imageBase64 || '');
  const mimeType = String(body.mimeType || 'image/jpeg').toLowerCase();

  if (!imageBase64) throw new Error('画像データがありません。');

  if (imageBase64.indexOf('base64,') !== -1) {
    imageBase64 = imageBase64.split('base64,').pop();
  }

  if (![
    'image/jpeg', 'image/png', 'image/webp',
    'image/heic', 'image/heif'
  ].includes(mimeType)) {
    throw new Error('対応していない画像形式です。');
  }

  if (imageBase64.length > 8 * 1024 * 1024) {
    throw new Error('画像サイズが大きすぎます。6MB以下にしてください。');
  }

  const bytes = Utilities.base64Decode(imageBase64);
  const extension = mimeType.split('/')[1] || 'jpg';
  const blob = Utilities.newBlob(
    bytes,
    mimeType,
    'taikai_ocr_' + Utilities.getUuid() + '.' + extension
  );

  let file = null;

  try {
    file = DriveApp.createFile(blob);

    const jobId = Utilities.getUuid();
    const sheet = apiEnsureOcrSheet_();
    const now = new Date();

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      sheet.appendRow([
        jobId,
        session.staffId,
        'queued',
        file.getId(),
        mimeType,
        '',
        '',
        now,
        now
      ]);
    } finally {
      lock.releaseLock();
    }

    // 定期トリガーを保険として維持
apiEnsureOcrTrigger_();

// 今回の画像を早期処理する一回限りのトリガー
apiScheduleOcrWorker_();





    return {
  success: true,
  jobId: jobId,
  status: 'queued'
};

  } catch (error) {
    if (file) {
      try { file.setTrashed(true); } catch (e) {}
    }
    throw error;
  }
}

/**
 * OCR処理を早期に開始するための一回限りのトリガー
 * 既存の1分間隔トリガーは保険として残す。
 */
function apiScheduleOcrWorker_() {
  ScriptApp.newTrigger('processOcrQueue_')
    .timeBased()
    .after(1000)
    .create();
}

// ログイン中のスタッフが自分のジョブ結果を確認する
function apiGetOrderImageResult_(body) {
  const session = apiRequireSession_(body);
  const jobId = apiText_(body.jobId);

  if (!jobId) throw new Error('ジョブ番号がありません。');

  const sheet = apiEnsureOcrSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('読み取りジョブが見つかりません。');

  // A列のjobIdだけを検索し、対象ジョブの1行だけ取得する。
  const match = sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(jobId)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  if (!match) throw new Error('読み取りジョブが見つかりません。');

  const row = sheet.getRange(match.getRow(), 1, 1, 10).getValues()[0];
  if (String(row[1]) !== String(session.staffId)) {
    throw new Error('この読み取り結果を確認する権限がありません。');
  }

  const status = String(row[2] || '');
  if (status === 'done') {
    return {
      success: true,
      status: 'done',
      result: JSON.parse(String(row[5] || '{}'))
    };
  }

  if (status === 'failed') {
    return {
      success: true,
      status: 'failed',
      error: String(row[6] || '画像の読み取りに失敗しました。')
    };
  }

  return { success: true, status: status || 'queued' };
}

// 1分ごとに実行。待機中のジョブを1件ずつ処理する。
function processOcrQueue_() {
  const sheet = apiEnsureOcrSheet_();
  const lock = LockService.getScriptLock();

  let job = null;
  let jobRow = 0;

  lock.waitLock(10000);

  try {
    const values = sheet.getDataRange().getValues();
    const now = Date.now();

    for (let i = 1; i < values.length; i++) {
      const status = String(values[i][2] || '');
      const updatedAt = values[i][8]
        ? new Date(values[i][8]).getTime()
        : 0;

      // 異常終了などで10分以上止まったジョブは再処理対象に戻す
      const stale = status === 'processing' &&
        updatedAt > 0 &&
        now - updatedAt > 10 * 60 * 1000;

      if (status === 'queued' || stale) {
        jobRow = i + 1;
               job = {
          jobId: String(values[i][0]),
          driveFileId: String(values[i][3]),
          mimeType: String(values[i][4] || 'image/jpeg'),
          attempts: Number(values[i][9] || 0)
        };

        sheet.getRange(jobRow, 10).setValue(job.attempts + 1);

        sheet.getRange(jobRow, 3).setValue('processing');
        sheet.getRange(jobRow, 9).setValue(new Date());
        break;
      }
    }
  } finally {
    lock.releaseLock();
  }

  if (!job) return;

  let file = null;

  try {
    file = DriveApp.getFileById(job.driveFileId);

    const imageBase64 = Utilities.base64Encode(
      file.getBlob().getBytes()
    );

    // 既存のGemini OCR処理をそのまま利用
    const result = apiParseOrderImage_({
      imageBase64: imageBase64,
      mimeType: job.mimeType
    }, true);

    sheet.getRange(jobRow, 3).setValue('done');
    sheet.getRange(jobRow, 6).setValue(JSON.stringify(result));
    sheet.getRange(jobRow, 7).setValue('');
    sheet.getRange(jobRow, 9).setValue(new Date());

    
  } catch (error) {
    const errorMessage = String(
      error && error.message ? error.message : error
    );

    const attemptCount = job.attempts + 1;

    const temporaryError =
      /Gemini APIエラー \((429|500|502|503|504)\)/.test(errorMessage);

    
if (temporaryError && attemptCount < 3) {
  sheet.getRange(jobRow, 3).setValue('queued');
  sheet.getRange(jobRow, 7).setValue(
    '再試行予定 (' + attemptCount + '/3): ' +
    errorMessage.substring(0, 1500)
  );

  // 一時エラーなら早期に再試行
  apiScheduleOcrWorker_();
}
else {
      sheet.getRange(jobRow, 3).setValue('failed');
      sheet.getRange(jobRow, 7).setValue(
        errorMessage.substring(0, 2000)
      );

      // 最終失敗時だけ画像を削除
      if (file) {
        try { file.setTrashed(true); } catch (e) {}
      }
    }

    sheet.getRange(jobRow, 9).setValue(new Date());

  } finally {
    // 成功時だけ画像を削除
    // 再試行時は画像を残す
    const currentStatus = sheet.getRange(jobRow, 3).getValue();

    if (currentStatus === 'done' && file) {
      try { file.setTrashed(true); } catch (e) {
        Logger.log('一時画像の削除に失敗: ' + e);
      }
    }
  }

  }





// ---------- API入口 ----------
function doPost(e) {
  try {
    const body = apiBody_(e);
    const action = apiText_(body.action);
    let result;
    switch (action) {
      case 'auth.setupStatus': result = apiSetupStatus_(); break;
      case 'auth.bootstrapAdmin': result = apiBootstrapAdmin_(body); break;
      case 'auth.login': result = apiLogin_(body); break;
      case 'auth.me': result = apiMe_(body); break;
      case 'auth.logout': result = apiLogout_(body); break;
      case 'auth.staffList': result = apiStaffList_(body); break;
      case 'auth.createStaff': result = apiCreateStaff_(body); break;
      case 'auth.setStaffActive': result = apiSetStaffActive_(body); break;
      case 'orders.list': result = apiOrdersList_(body); break;
      case 'ai.startImage': result = apiStartOrderImage_(body); break;
case 'ai.getImageResult': result = apiGetOrderImageResult_(body); break;
      case 'orders.create': result = apiCreateOrder_(body); break;
      case 'orders.setHandedOver': result = apiSetHandedOver_(body); break;
      case 'orders.setItemHandedOver': result = apiSetItemHandedOver_(body); break;
      case 'shipping.list':
  result = apiShippingList_();
  break;

case 'tags.list':
  result = apiTagsList_(body);
  break;

case 'tags.create':
  result = apiTagsCreate_(body);
  break;

case 'tags.update':
  result = apiTagsUpdate_(body);
  break;

case 'tags.delete':
  result = apiTagsDelete_(body);
  break;
      default: throw new Error('未対応のAPIです: ' + action);
    }
    return apiResponse_(result);
  } catch (error) {
    return apiResponse_({ success: false, message: error.message || String(error) });
  }
}
function authorizeExternalRequest() {
  const response = UrlFetchApp.fetch('https://www.google.com');
  Logger.log(response.getResponseCode());
}

// OCRを手動で1回実行するための関数
function runOcrQueueNow() {
  processOcrQueue_();
}

function debugProductTags() {
  const id = PropertiesService
    .getScriptProperties()
    .getProperty('TAIKAIORDER_SPREADSHEET_ID');

  if (!id) {
    Logger.log('エラー：DBのIDが設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(id);
  Logger.log('接続DB名：' + ss.getName());

  const sheet = ss.getSheetByName('商品タグ');

  if (!sheet) {
    Logger.log('エラー：商品タグシートがありません');
    return;
  }

  Logger.log('最終行：' + sheet.getLastRow());

  const values = sheet.getDataRange().getDisplayValues();

  values.forEach(function(row, index) {
    Logger.log('行' + (index + 1) + '：' + row.join(' / '));
  });
}

