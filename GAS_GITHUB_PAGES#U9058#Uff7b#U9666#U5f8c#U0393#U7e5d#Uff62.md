# 大会注文管理：GAS・Googleスプレッドシート版

## 今回の変更
- React画面の注文・認証・スタッフ管理通信をCloudflare Worker経由のGAS APIへ変更
- tRPCサーバーへのブラウザ通信を停止
- 注文一覧の `id` / `orderId` の差をAPIクライアントで吸収
- 注文一覧・引渡更新はGoogle SheetsのGAS APIを使用
- GitHub Pagesの公開パスを `/taikai/` に設定
- 刺繍見本画像を `client/public/private/` に配置
- GitHub Actionsで `dist/public` をPagesへデプロイするworkflowを追加

## 公開先
`https://hs0319yu-cmd.github.io/taikai/`

## API接続先
`https://still-voice-2835taikai-api.hs-0319yu.workers.dev/`

## ビルド
```bash
pnpm install --frozen-lockfile
pnpm build:static
```

生成先は `dist/public`。

## GitHub Pages設定
GitHubリポジトリの Settings → Pages → Build and deployment → Source を `GitHub Actions` にする。
その後、変更を `main` ブランチへpushすると workflow が公開する。

## 注意
- AIメモ自動振り分けは、現行GAS APIに `ai.parseMemo` がないため、画面上は接続準備中の案内にしている。手書きメモ画像の選択・プレビュー・読み取り文字の入力は残している。
- 実運用前に、スタッフ追加・利用停止、実注文登録、注文検索、A4印刷、スマホ表示を必ず確認する。
- 以前の `注文` シートに作った「APIテスト用」行は、動作確認用なので本番利用前にシートから削除する。
- Worker/GASのURLや管理者パスワード、セッショントークンは公開リポジトリに書かない。今回のWorker URLは公開APIエンドポイントとしてフロントに設定している。
