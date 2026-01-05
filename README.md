# VRC Avatar Manager

VRChatのアバターとパラメータを管理・整理するためのWindows用デスクトップアプリケーションです。
ポータブルアプリケーションとして設計されており、インストール不要で `.exe` ファイル単体で動作します。

## 使い方

1. **ダウンロード**: 配布された `VRC Avatar Manager xxxx.exe` を任意のフォルダに保存します。
2. **起動**: exeファイルをダブルクリックして起動します。
3. **ログイン**: VRChatのアカウントでログインします（2段階認証対応）。
4. **利用開始**:
    - 所持しているアバターが一覧表示されます。
    - アバターごとに「使用想定素体」や「お気に入りフォルダ」などを設定して整理できます。

### データの保存場所について
本アプリはポータブル版として動作するため、設定データやログイン情報は **exeファイルと同じフォルダ** に保存されます。

- `vrc-avatar-manager-sessions.json`: ログインセッション情報
- `vrc-avatar-manager-settings.json`: アバターの設定・マッピング情報

USBメモリなどで持ち運ぶ際は、これらのファイルも一緒に移動させることで環境を維持できます。

---

## 技術仕様 (Technical Specifications)

本アプリケーションは、Web技術をベースにしたモダンなデスクトップアプリケーションとして開発されています。

### アーキテクチャ構成
Monorepo構成（Turborepo）を採用し、Frontend、Backend、Electronを管理しています。

- **Frontend (`apps/web`)**: ユーザーインターフェース
- **Backend (`apps/api`)**: VRChat APIとの通信、データ永続化、静的ファイル配信
- **Desktop (`apps/electron`)**: アプリケーションラッパー

### 通信フロー
1. Electronが起動すると、内部で同梱された Backend API サーバーを起動します。
2. Frontend は Electron 内で Backend API サーバー (`http://localhost:{port}`) から配信されます。
3. すべてのデータ通信（VRChat APIへのプロキシ含む）は、同一オリジン (`localhost`) 上で行われるため、Cookieベースのセッション管理が安全かつ正常に動作します。

### 使用技術スタック

#### Frontend
- **Framework**: React 18, Vite
- **Language**: TypeScript
- **Styling**: Vanilla CSS / Tailwind (Project specific)

#### Backend
- **Framework**: Hono (Node.js Adapter)
- **Language**: TypeScript
- **Http Server**: Node.js (v18+) internal server

#### Desktop Wrapper
- **Core**: Electron
- **Builder**: electron-builder (Portable Target)

#### Persistence
- **Storage**: Local JSON files (`fs` module usage)
- **Strategy**: ポータブル稼働を前提とし、`process.env.PORTABLE_EXECUTABLE_DIR` を優先して保存場所を解決するロジックを実装。

## 開発者向け (Development)

### ビルド方法
```bash
# 全体の依存関係インストール
npm install

# アプリケーションのビルド（Web, API, Electronを一括ビルド）
npm run build
```
ビルド成果物は `apps/electron/release/` に出力されます。
