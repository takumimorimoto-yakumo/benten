/**
 * App shell copy for every supported locale: the tab bar and header (with its theme menu), the
 * header wallet, and the Holdings and Activity tab pages (app IA sections 3,
 * 5.4 and 6). Registered for non-Latin text in catalog-manifest.json.
 *
 * The wallet words the purchase panel also shows (connect, the wallet list,
 * no wallet found, rejected or failed connection, disconnect) repeat the
 * purchase catalog exactly, so one action keeps one name across the app; a
 * test compares them. The purchase catalog itself stays out of the shell.
 */
import type { PublicWebLocale } from "./locales";

export type ShellCopy = {
  nav: { explore: string; holdings: string; activity: string; back: string; home: string };
  /** The header's theme menu: its button name and the three choices. */
  theme: { label: string; system: string; light: string; dark: string };
  wallet: {
    connect: string; connecting: string; account: (address: string) => string; menuLabel: string;
    copyAddress: string; addressCopied: string; copyUnavailable: string; switchWallet: string; disconnect: string; disconnectLocked: string;
    detecting: string; listLabel: string; connectNamed: (name: string) => string; notDetectedTitle: string; notDetectedBody: string;
    unsupported: (name: string) => string; connectRejected: string; connectFailed: string; needsJavaScript: string;
    /** Android: a Mobile Wallet Adapter connect found no wallet app on the device. */
    walletAppMissing: string;
  };
  holdings: { title: string; description: string; heading: string; notConnected: string; wallet: string };
  activity: { title: string; description: string; heading: string; lead: string; empty: string; explore: string };
};

/** Compact label of each locale on the header language button. */
export const LOCALE_SHORT_LABELS: Record<PublicWebLocale, string> = { en: "EN", ja: "JA", ko: "KO", "zh-Hans": "简", "zh-Hant": "繁" };

const en: ShellCopy = {
  nav: { explore: "Explore", holdings: "Holdings", activity: "Activity", back: "Back", home: "Benten home" },
  theme: { label: "Theme", system: "System", light: "Light", dark: "Dark" },
  wallet: {
    connect: "Connect wallet", connecting: "Connecting...", account: (address) => `Wallet ${address}`, menuLabel: "Wallet",
    copyAddress: "Copy address", addressCopied: "Address copied", copyUnavailable: "Copy is not available in this browser", switchWallet: "Switch wallet", disconnect: "Disconnect",
    disconnectLocked: "You cannot disconnect while a purchase is in progress.",
    detecting: "Looking for a Solana wallet...", listLabel: "Wallets found in this browser", connectNamed: (name) => `Connect ${name}`,
    notDetectedTitle: "No Solana wallet found", notDetectedBody: "This browser has no Solana wallet that supports Wallet Standard. Install or unlock one, then reload this page.",
    unsupported: (name) => `${name} cannot send Solana mainnet transactions from this page. Choose another wallet.`,
    connectRejected: "Connection was cancelled in your wallet. Nothing changed.", connectFailed: "Your wallet did not connect. Nothing changed. Try again or choose another wallet.",
    needsJavaScript: "Connecting a wallet needs JavaScript.",
    walletAppMissing: "No wallet app on this device answered. Install a Solana wallet app that supports Mobile Wallet Adapter, then try again.",
  },
  holdings: {
    title: "Holdings", description: "The tokens Benten covers in your connected wallet.", heading: "Holdings",
    notConnected: "Connect a wallet to see the tokens Benten covers. Benten only reads; connecting does not let Benten move funds.",
    wallet: "Wallet",
  },
  activity: {
    title: "Activity", description: "Purchases made in Benten from this browser.", heading: "Activity", lead: "Purchases made from this browser.",
    empty: "No purchases from this browser yet. Purchases you make in Benten appear here. Records made in another browser or wallet app are not shown.",
    explore: "Explore companies",
  },
};

const ja: ShellCopy = {
  nav: { explore: "探す", holdings: "保有", activity: "履歴", back: "戻る", home: "Bentenのホーム" },
  theme: { label: "テーマ", system: "システム設定", light: "ライト", dark: "ダーク" },
  wallet: {
    connect: "ウォレットを接続", connecting: "接続中…", account: (address) => `ウォレット ${address}`, menuLabel: "ウォレット",
    copyAddress: "アドレスをコピー", addressCopied: "アドレスをコピーしました", copyUnavailable: "このブラウザではコピーできません", switchWallet: "ウォレットを切り替え", disconnect: "接続を解除",
    disconnectLocked: "購入の処理中は接続を解除できません。",
    detecting: "Solanaウォレットを探しています…", listLabel: "このブラウザで見つかったウォレット", connectNamed: (name) => `${name}を接続`,
    notDetectedTitle: "Solanaウォレットが見つかりません", notDetectedBody: "このブラウザにWallet Standard対応のSolanaウォレットがありません。ウォレットをインストールまたはロック解除してから、このページを再読み込みしてください。",
    unsupported: (name) => `${name}はこのページからSolanaメインネットのトランザクションを送信できません。別のウォレットを選んでください。`,
    connectRejected: "ウォレットで接続がキャンセルされました。何も変更されていません。", connectFailed: "ウォレットが接続されませんでした。何も変更されていません。もう一度試すか、別のウォレットを選んでください。",
    needsJavaScript: "ウォレットの接続にはJavaScriptが必要です。",
    walletAppMissing: "この端末でウォレットアプリが応答しませんでした。Mobile Wallet Adapterに対応したSolanaウォレットアプリをインストールしてから、もう一度試してください。",
  },
  holdings: {
    title: "保有", description: "接続したウォレットにある、Bentenが対象とするトークン。", heading: "保有",
    notConnected: "ウォレットを接続すると、Bentenが対象とするトークンを確認できます。Bentenは読み取るだけで、接続してもBentenが資金を動かすことはできません。",
    wallet: "ウォレット",
  },
  activity: {
    title: "履歴", description: "このブラウザからBentenで行った購入。", heading: "履歴", lead: "このブラウザで行った購入。",
    empty: "このブラウザでの購入はまだありません。Bentenで購入するとここに表示されます。別のブラウザやウォレットアプリで行った記録は表示されません。",
    explore: "企業を探す",
  },
};

const ko: ShellCopy = {
  nav: { explore: "탐색", holdings: "보유", activity: "활동", back: "뒤로", home: "Benten 홈" },
  theme: { label: "테마", system: "시스템 설정", light: "라이트", dark: "다크" },
  wallet: {
    connect: "지갑 연결", connecting: "연결 중…", account: (address) => `지갑 ${address}`, menuLabel: "지갑",
    copyAddress: "주소 복사", addressCopied: "주소를 복사했습니다", copyUnavailable: "이 브라우저에서는 복사할 수 없습니다", switchWallet: "지갑 전환", disconnect: "연결 해제",
    disconnectLocked: "구매가 진행 중일 때는 연결을 해제할 수 없습니다.",
    detecting: "Solana 지갑을 찾는 중…", listLabel: "이 브라우저에서 찾은 지갑", connectNamed: (name) => `${name} 연결`,
    notDetectedTitle: "Solana 지갑을 찾을 수 없습니다", notDetectedBody: "이 브라우저에 Wallet Standard를 지원하는 Solana 지갑이 없습니다. 지갑을 설치하거나 잠금을 해제한 뒤 이 페이지를 새로고침하세요.",
    unsupported: (name) => `${name}은(는) 이 페이지에서 Solana 메인넷 트랜잭션을 보낼 수 없습니다. 다른 지갑을 선택하세요.`,
    connectRejected: "지갑에서 연결이 취소되었습니다. 아무것도 바뀌지 않았습니다.", connectFailed: "지갑이 연결되지 않았습니다. 아무것도 바뀌지 않았습니다. 다시 시도하거나 다른 지갑을 선택하세요.",
    needsJavaScript: "지갑을 연결하려면 JavaScript가 필요합니다.",
    walletAppMissing: "이 기기에서 지갑 앱이 응답하지 않았습니다. Mobile Wallet Adapter를 지원하는 Solana 지갑 앱을 설치한 뒤 다시 시도하세요.",
  },
  holdings: {
    title: "보유", description: "연결한 지갑에 있는, Benten이 다루는 토큰.", heading: "보유",
    notConnected: "지갑을 연결하면 Benten이 다루는 토큰을 볼 수 있습니다. Benten은 읽기만 하며, 연결해도 Benten이 자금을 옮길 수 없습니다.",
    wallet: "지갑",
  },
  activity: {
    title: "활동", description: "이 브라우저에서 Benten으로 한 구매.", heading: "활동", lead: "이 브라우저에서 한 구매.",
    empty: "이 브라우저에서 한 구매가 아직 없습니다. Benten에서 구매하면 여기에 표시됩니다. 다른 브라우저나 지갑 앱에서 만든 기록은 표시되지 않습니다.",
    explore: "기업 탐색",
  },
};

const zhHans: ShellCopy = {
  nav: { explore: "探索", holdings: "持有", activity: "记录", back: "返回", home: "Benten 首页" },
  theme: { label: "主题", system: "跟随系统", light: "浅色", dark: "深色" },
  wallet: {
    connect: "连接钱包", connecting: "正在连接…", account: (address) => `钱包 ${address}`, menuLabel: "钱包",
    copyAddress: "复制地址", addressCopied: "已复制地址", copyUnavailable: "此浏览器无法复制", switchWallet: "切换钱包", disconnect: "断开连接",
    disconnectLocked: "购买进行中时无法断开连接。",
    detecting: "正在查找 Solana 钱包…", listLabel: "在此浏览器中找到的钱包", connectNamed: (name) => `连接 ${name}`,
    notDetectedTitle: "未找到 Solana 钱包", notDetectedBody: "此浏览器中没有支持 Wallet Standard 的 Solana 钱包。请安装或解锁钱包，然后重新加载此页面。",
    unsupported: (name) => `${name} 无法从此页面发送 Solana 主网交易。请选择其他钱包。`,
    connectRejected: "已在钱包中取消连接。未做任何更改。", connectFailed: "钱包未能连接。未做任何更改。请重试或选择其他钱包。",
    needsJavaScript: "连接钱包需要 JavaScript。",
    walletAppMissing: "此设备上没有钱包应用响应。请安装支持 Mobile Wallet Adapter 的 Solana 钱包应用，然后重试。",
  },
  holdings: {
    title: "持有", description: "已连接钱包中 Benten 涵盖的代币。", heading: "持有",
    notConnected: "连接钱包即可查看 Benten 涵盖的代币。Benten 只读取数据；连接后 Benten 也无法转移资金。",
    wallet: "钱包",
  },
  activity: {
    title: "记录", description: "在此浏览器中通过 Benten 进行的购买。", heading: "记录", lead: "在此浏览器中进行的购买。",
    empty: "此浏览器中还没有购买记录。你在 Benten 中的购买会显示在这里。在其他浏览器或钱包应用中产生的记录不会显示。",
    explore: "探索公司",
  },
};

const zhHant: ShellCopy = {
  nav: { explore: "探索", holdings: "持有", activity: "紀錄", back: "返回", home: "Benten 首頁" },
  theme: { label: "主題", system: "跟隨系統", light: "淺色", dark: "深色" },
  wallet: {
    connect: "連接錢包", connecting: "正在連接…", account: (address) => `錢包 ${address}`, menuLabel: "錢包",
    copyAddress: "複製地址", addressCopied: "已複製地址", copyUnavailable: "此瀏覽器無法複製", switchWallet: "切換錢包", disconnect: "中斷連接",
    disconnectLocked: "購買進行中時無法中斷連接。",
    detecting: "正在尋找 Solana 錢包…", listLabel: "在此瀏覽器中找到的錢包", connectNamed: (name) => `連接 ${name}`,
    notDetectedTitle: "找不到 Solana 錢包", notDetectedBody: "此瀏覽器中沒有支援 Wallet Standard 的 Solana 錢包。請安裝或解鎖錢包，然後重新載入此頁面。",
    unsupported: (name) => `${name} 無法從此頁面傳送 Solana 主網交易。請選擇其他錢包。`,
    connectRejected: "已在錢包中取消連接。未做任何變更。", connectFailed: "錢包未能連接。未做任何變更。請重試或選擇其他錢包。",
    needsJavaScript: "連接錢包需要 JavaScript。",
    walletAppMissing: "此裝置上沒有錢包應用程式回應。請安裝支援 Mobile Wallet Adapter 的 Solana 錢包應用程式，然後再試一次。",
  },
  holdings: {
    title: "持有", description: "已連接錢包中 Benten 涵蓋的代幣。", heading: "持有",
    notConnected: "連接錢包即可查看 Benten 涵蓋的代幣。Benten 只讀取資料；連接後 Benten 也無法轉移資金。",
    wallet: "錢包",
  },
  activity: {
    title: "紀錄", description: "在此瀏覽器中透過 Benten 進行的購買。", heading: "紀錄", lead: "在此瀏覽器中進行的購買。",
    empty: "此瀏覽器中還沒有購買紀錄。你在 Benten 中的購買會顯示在這裡。在其他瀏覽器或錢包應用程式中產生的紀錄不會顯示。",
    explore: "探索公司",
  },
};

export const SHELL_MESSAGES: Record<PublicWebLocale, ShellCopy> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function shellMessagesFor(locale: PublicWebLocale): ShellCopy {
  return SHELL_MESSAGES[locale];
}

/**
 * The quiet Share action on company and product pages (app IA sections 3.4
 * and 10: required where there is no URL bar, shown in the browser too). The
 * Web Share sheet where the browser offers one; otherwise Copy link.
 */
export type ShareCopy = { share: string; copyLink: string; copied: string; unavailable: string };

export const SHARE_MESSAGES: Record<PublicWebLocale, ShareCopy> = {
  en: { share: "Share", copyLink: "Copy link", copied: "Link copied", unavailable: "This browser cannot copy the link" },
  ja: { share: "共有", copyLink: "リンクをコピー", copied: "リンクをコピーしました", unavailable: "このブラウザではリンクをコピーできません" },
  ko: { share: "공유", copyLink: "링크 복사", copied: "링크를 복사했습니다", unavailable: "이 브라우저에서는 링크를 복사할 수 없습니다" },
  "zh-Hans": { share: "分享", copyLink: "复制链接", copied: "已复制链接", unavailable: "此浏览器无法复制链接" },
  "zh-Hant": { share: "分享", copyLink: "複製連結", copied: "已複製連結", unavailable: "此瀏覽器無法複製連結" },
};
