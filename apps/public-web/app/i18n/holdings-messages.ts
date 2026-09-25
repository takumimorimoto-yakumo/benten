/**
 * Copy of the Holdings and Activity tabs for every supported locale (app IA
 * sections 5.4, 6 and 7). Registered for non-Latin text in
 * catalog-manifest.json. The tab titles, headings, the not-connected line
 * and the empty Activity line stay in the shell catalog; everything the tabs
 * show once they read something is here.
 *
 * Vocabulary (IA section 7): `Pyth reference price`, `Value at Pyth
 * reference prices`, `Pyth confidence`, `Last Pyth update`; the one action
 * name `Buy {symbol}`; no profit, loss, quote or advice words.
 */
import type { ActivityPhase } from "@/features/activity/activity-store";
import type { HoldingValueReason } from "@/features/holdings/holdings-model";
import type { PublicWebLocale } from "./locales";

export type HoldingsCopy = {
  walletLabel: string;
  refresh: string;
  refreshing: string;
  tryAgain: string;
  reading: string;
  readAt: (time: string) => string;
  slots: (splToken: string, token2022: string) => string;
  /** Summary of the collapsed evidence that holds `slots`. */
  slotsDetails: string;
  staleRead: (time: string) => string;
  notRead: string;
  noneHeld: string;
  explore: string;
  /** Accounts of mints Benten does not cover; `unreadable` is how many of them could not be read. */
  otherAccounts: (count: number, unreadable: number) => string;
  frozen: (count: number) => string;
  delegated: (count: number) => string;
  totalLabel: string;
  totalPrices: (from: string, to: string) => string;
  totalNotShown: (without: number, of: number) => string;
  totalIncompleteRead: string;
  listCaption: string;
  columns: { product: string; quantity: string; value: string; price: string; action: string };
  raw: (raw: string) => string;
  quantityUnknown: string;
  readingPrices: string;
  reasons: Record<HoldingValueReason, string>;
  buy: (symbol: string) => string;
  /** The sell flow link (Holdings) and a sale record's heading (Activity). */
  sell: (symbol: string) => string;
  /** `unidentified`: some accounts could not be read far enough to tell whether they hold a covered token. */
  partial: { metadata: string; limit: string; transport: string; unidentified: string };
  errors: {
    body: string; busy: string; unreachable: string; invalid: string; limit: string;
    /** The wallet has more token accounts in one token program than one read accepts (`account_limit`). */
    accountLimit: string;
    /** Why nothing is shown for that wallet; `max` is the per-program limit, already formatted. */
    accountLimitBody: (max: string) => string;
  };
  readOnly: string;
};

export type ActivityCopy = {
  listLabel: string;
  buy: (symbol: string) => string;
  /** The sell flow link (Holdings) and a sale record's heading (Activity). */
  sell: (symbol: string) => string;
  phase: Record<ActivityPhase, string>;
  phaseNote: Record<ActivityPhase, string>;
  /** A sale record's notes where they differ from a purchase's (the phases that warn against trading again). */
  salePhaseNote: Partial<Record<ActivityPhase, string>>;
  wallet: (address: string) => string;
  thisWallet: string;
  started: (time: string) => string;
  entered: (amount: string) => string;
  received: (amount: string) => string;
  paid: (amount: string) => string;
  measured: string;
  resultUnreadable: string;
  rawAmount: (raw: string, symbol: string) => string;
  signature: string;
  copySignature: string;
  signatureCopied: string;
  copyUnavailable: string;
  checkAgain: string;
  checking: string;
  explorer: string;
  explorerWallet: string;
  newTab: string;
  checkResult: {
    finalized: string; failed: string; confirmed: string; not_found: string; finalized_unreadable: string;
    rate_limited: string; unavailable: string; not_saved: string; other_network: string;
  };
  lastChecked: (time: string) => string;
  details: string;
  detail: {
    record: string; started: string; network: string; mainnet: string; otherNetwork: string; route: string;
    expected: string; minimum: string; previewNote: string; finalizedAt: string; lastChecked: string; never: string;
  };
  clear: string;
  clearTitle: string;
  clearBody: string;
  clearConfirm: string;
  clearCancel: string;
  cleared: string;
  clearFailed: string;
  privacyTitle: string;
  privacyBody: string;
  privacyLink: string;
  storageUnavailable: string;
  skipped: (count: number) => string;
};

export type PortfolioCopy = { holdings: HoldingsCopy; activity: ActivityCopy };

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

const en: PortfolioCopy = {
  holdings: {
    walletLabel: "Wallet",
    refresh: "Refresh",
    refreshing: "Reading...",
    tryAgain: "Try again",
    reading: "Reading your token accounts...",
    readAt: (time) => `Read from Solana at ${time}`,
    slots: (splToken, token2022) => `Slots ${splToken} and ${token2022}`,
    slotsDetails: "Solana read details",
    staleRead: (time) => `Read at ${time}. Refresh to update.`,
    notRead: "Refresh to read holdings for this wallet.",
    noneHeld: "This wallet holds none of the tokens Benten covers.",
    explore: "Explore companies",
    otherAccounts: (count, unreadable) => `${count} other ${plural(count, "token account", "token accounts")} in this wallet ${plural(count, "is", "are")} not covered by Benten.${unreadable === 0 ? "" : count === 1 ? " It could not be read." : ` ${unreadable} of them could not be read.`}`,
    frozen: (count) => `${count} ${plural(count, "account is", "accounts are")} frozen`,
    delegated: (count) => `${count} ${plural(count, "account has", "accounts have")} a delegate`,
    totalLabel: "Value at Pyth reference prices",
    totalPrices: (from, to) => (from === to ? `Uses prices from ${from}` : `Uses prices from ${from} to ${to}`),
    totalNotShown: (without, of) => `Total not shown: ${without} of ${of} ${plural(of, "holding has", "holdings have")} no Pyth value.`,
    totalIncompleteRead: "Total not shown: part of this read is missing.",
    listCaption: "Tokens Benten covers in this wallet",
    columns: { product: "Token", quantity: "Quantity", value: "Value at Pyth reference price", price: "Pyth reference price", action: "Action" },
    raw: (raw) => `raw ${raw}`,
    quantityUnknown: "Quantity for display unknown: the token's mint could not be read.",
    readingPrices: "Reading Pyth reference prices...",
    reasons: {
      no_price_feed: "No Pyth price feed for this token",
      unit_basis_unverified: "No Pyth value: Benten has not verified how one token relates to its Pyth feed",
      price_unavailable: "Pyth reference price unavailable right now",
      price_stale: "No value: the last Pyth update is not recent",
      price_too_old: "No value: the last Pyth update is too old to show",
      price_confidence_too_wide: "Pyth confidence too wide to show a value",
      holding_metadata_unavailable: "No value: Benten could not read this token's mint",
      multiplier_unavailable: "No value: Benten could not read this token's display multiplier",
    },
    buy: (symbol) => `Buy ${symbol}`,
    sell: (symbol) => `Sell ${symbol}`,
    partial: {
      metadata: "Some token details could not be read, so some quantities or values are not shown.",
      limit: "This wallet holds more kinds of covered tokens than Benten reads at once; details are not shown.",
      transport: "Part of this read did not answer, so some quantities or values are not shown.",
      unidentified: "Some token accounts could not be read, so a token Benten covers may be missing from this list. No total is shown.",
    },
    errors: {
      body: "Benten could not read this wallet just now. Nothing changed.",
      busy: "Solana reads are busy",
      unreachable: "Solana could not be reached",
      invalid: "The answer from Solana could not be checked",
      limit: "This wallet has more token accounts than Benten reads at once",
      accountLimit: "This wallet has too many token accounts for Benten to read",
      accountLimitBody: (max) => `Benten reads up to ${max} token accounts per token program. This wallet has more, so Benten shows no list rather than an incomplete one. Nothing changed. Your wallet app shows all of its tokens.`,
    },
    readOnly: "Benten only reads this wallet. Nothing here can move funds.",
  },
  activity: {
    listLabel: "Purchases from this browser",
    buy: (symbol) => `Buy ${symbol}`,
    sell: (symbol) => `Sell ${symbol}`,
    phase: {
      opened: "Outcome unknown",
      outcome_unknown: "Outcome unknown",
      sent: "Sent",
      confirmed: "Not finalized yet",
      not_finalized: "Not finalized yet",
      finalized: "Finalized",
      failed: "Failed",
      dropped: "Not processed",
    },
    phaseNote: {
      opened: "Approval was requested in your wallet, and Benten has no signature for it. Check your wallet's activity before you buy again.",
      outcome_unknown: "Your wallet reported an error, and Benten cannot tell whether it sent the transaction. Check your wallet's activity before you buy again.",
      sent: "Do not buy again until you have checked.",
      confirmed: "Do not buy again until you have checked.",
      not_finalized: "Do not buy again until you have checked.",
      finalized: "",
      failed: "The transaction was processed and failed, so the swap did not happen.",
      dropped: "The transaction expired without being processed, so the swap did not happen.",
    },
    salePhaseNote: {
      opened: "Approval was requested in your wallet, and Benten has no signature for it. Check your wallet's activity before you sell again.",
      outcome_unknown: "Your wallet reported an error, and Benten cannot tell whether it sent the transaction. Check your wallet's activity before you sell again.",
      sent: "Do not sell again until you have checked.",
      confirmed: "Do not sell again until you have checked.",
      not_finalized: "Do not sell again until you have checked.",
    },
    wallet: (address) => `Wallet ${address}`,
    thisWallet: "connected",
    started: (time) => `Started ${time}`,
    entered: (amount) => `Amount entered: ${amount}`,
    received: (amount) => `Received ${amount}`,
    paid: (amount) => `Paid ${amount}`,
    measured: "Measured from the finalized transaction's token balances for this wallet.",
    resultUnreadable: "Finalized, but its token balances could not be read. Check it on Solana Explorer.",
    rawAmount: (raw, symbol) => `${raw} raw ${symbol}`,
    signature: "Signature",
    copySignature: "Copy signature",
    signatureCopied: "Signature copied",
    copyUnavailable: "Copy is not available in this browser",
    checkAgain: "Check again",
    checking: "Checking...",
    explorer: "View on Solana Explorer",
    explorerWallet: "Check this wallet on Solana Explorer",
    newTab: "(opens in a new tab)",
    checkResult: {
      finalized: "Finalized. The result is measured from the transaction.",
      failed: "The transaction failed on Solana.",
      confirmed: "Not finalized yet. Do not buy again; check again in a moment.",
      not_found: "Solana has no status for this signature yet. Do not buy again; check again in a moment.",
      finalized_unreadable: "Finalized, but its token balances could not be read.",
      rate_limited: "Solana reads are busy. Nothing changed. Try again in a moment.",
      unavailable: "Benten could not check just now. Nothing changed.",
      not_saved: "Checked, but this browser did not save the result.",
      other_network: "Recorded on another Solana network. Benten checks mainnet records only.",
    },
    lastChecked: (time) => `Last checked ${time}`,
    details: "Details",
    detail: {
      record: "Record",
      started: "Started",
      network: "Network",
      mainnet: "Solana mainnet",
      otherNetwork: "Another Solana network",
      route: "Route (pool)",
      expected: "Expected to receive",
      minimum: "Minimum you receive",
      previewNote: "From the swap preview before approval; not a result.",
      finalizedAt: "Finalized",
      lastChecked: "Last checked",
      never: "Not yet",
    },
    clear: "Clear history on this device",
    clearTitle: "Clear the purchase history on this device?",
    clearBody: "This deletes Benten's records in this browser only. It does not change anything on Solana or in your wallet.",
    clearConfirm: "Clear history",
    clearCancel: "Keep history",
    cleared: "History cleared on this device.",
    clearFailed: "This browser did not let Benten clear the history.",
    privacyTitle: "Kept on this device",
    privacyBody: "Benten keeps these records only in this browser's storage: the wallet address, signature, tokens, amounts and times of each purchase. They are never sent to Benten.",
    privacyLink: "Privacy",
    storageUnavailable: "This browser does not let Benten keep a history. Your purchases are still on the network; check your wallet's activity.",
    skipped: (count) => `${count} ${plural(count, "record", "records")} in this browser could not be read and ${plural(count, "is", "are")} not shown.`,
  },
};

const ja: PortfolioCopy = {
  holdings: {
    walletLabel: "ウォレット",
    refresh: "更新",
    refreshing: "読み取り中…",
    tryAgain: "もう一度試す",
    reading: "トークンアカウントを読み取っています…",
    readAt: (time) => `${time}にSolanaから読み取り`,
    slots: (splToken, token2022) => `スロット ${splToken} と ${token2022}`,
    slotsDetails: "Solanaでの読み取りの詳細",
    staleRead: (time) => `${time}に読み取った内容です。最新にするには更新してください。`,
    notRead: "このウォレットの保有を読み取るには、更新してください。",
    noneHeld: "このウォレットには、Bentenが対象とするトークンがありません。",
    explore: "企業を探す",
    otherAccounts: (count, unreadable) => `このウォレットには、Bentenの対象外のトークンアカウントがほかに${count}件あります。${unreadable > 0 ? `うち${unreadable}件は読み取れませんでした。` : ""}`,
    frozen: (count) => `${count}件のアカウントが凍結されています`,
    delegated: (count) => `${count}件のアカウントに委任先があります`,
    totalLabel: "Pyth 参考価格での評価額",
    totalPrices: (from, to) => (from === to ? `${from}の価格を使用` : `${from}から${to}の価格を使用`),
    totalNotShown: (without, of) => `合計は表示していません: ${of}件中${without}件にPythでの評価額がありません。`,
    totalIncompleteRead: "合計は表示していません: 今回の読み取りに欠けている部分があります。",
    listCaption: "このウォレットにある、Bentenが対象とするトークン",
    columns: { product: "トークン", quantity: "数量", value: "Pyth 参考価格での評価額", price: "Pyth 参考価格", action: "操作" },
    raw: (raw) => `raw ${raw}`,
    quantityUnknown: "表示用の数量は不明です: トークンのミントを読み取れませんでした。",
    readingPrices: "Pyth 参考価格を読み取っています…",
    reasons: {
      no_price_feed: "このトークンのPyth価格フィードはありません",
      unit_basis_unverified: "Pythでの評価額なし: トークン1単位とPythフィードの関係をBentenは確認していません",
      price_unavailable: "現在、Pyth 参考価格を取得できません",
      price_stale: "評価額なし: Pythの最終更新が新しくありません",
      price_too_old: "評価額なし: Pythの最終更新が古すぎるため表示しません",
      price_confidence_too_wide: "Pythの信頼区間が広すぎるため、評価額を表示しません",
      holding_metadata_unavailable: "評価額なし: トークンのミントを読み取れませんでした",
      multiplier_unavailable: "評価額なし: トークンの表示倍率を読み取れませんでした",
    },
    buy: (symbol) => `${symbol}を購入`,
    sell: (symbol) => `${symbol}を売却`,
    partial: {
      metadata: "一部のトークン情報を読み取れなかったため、一部の数量または評価額を表示していません。",
      limit: "このウォレットには、Bentenが一度に読み取れる数を超える種類の対象トークンがあるため、詳細を表示していません。",
      transport: "読み取りの一部に応答がなかったため、一部の数量または評価額を表示していません。",
      unidentified: "一部のトークンアカウントを読み取れなかったため、Bentenの対象トークンがこの一覧から漏れている可能性があります。合計は表示していません。",
    },
    errors: {
      body: "現在、このウォレットを読み取れませんでした。何も変更されていません。",
      busy: "Solanaの読み取りが混み合っています",
      unreachable: "Solanaに接続できませんでした",
      invalid: "Solanaからの応答を確認できませんでした",
      limit: "このウォレットには、Bentenが一度に読み取れる数を超えるトークンアカウントがあります",
      accountLimit: "このウォレットはトークンアカウントが多すぎるため、Bentenでは読み取れません",
      accountLimitBody: (max) => `Bentenが読み取るトークンアカウントは、トークンプログラムごとに${max}件までです。このウォレットはそれを超えているため、不完全な一覧は表示しません。何も変更されていません。すべてのトークンはウォレットアプリで確認できます。`,
    },
    readOnly: "Bentenはこのウォレットを読み取るだけです。ここから資金を動かすことはできません。",
  },
  activity: {
    listLabel: "このブラウザで行った購入",
    buy: (symbol) => `${symbol}を購入`,
    sell: (symbol) => `${symbol}を売却`,
    phase: {
      opened: "結果不明",
      outcome_unknown: "結果不明",
      sent: "送信済み",
      confirmed: "未確定",
      not_finalized: "未確定",
      finalized: "確定済み",
      failed: "失敗",
      dropped: "処理されず",
    },
    phaseNote: {
      opened: "ウォレットに承認を依頼しましたが、Bentenには署名がありません。もう一度購入する前に、ウォレットの履歴を確認してください。",
      outcome_unknown: "ウォレットがエラーを報告しており、トランザクションが送信されたかどうかBentenには判断できません。もう一度購入する前に、ウォレットの履歴を確認してください。",
      sent: "確認するまで、もう一度購入しないでください。",
      confirmed: "確認するまで、もう一度購入しないでください。",
      not_finalized: "確認するまで、もう一度購入しないでください。",
      finalized: "",
      failed: "トランザクションは処理されましたが失敗したため、スワップは行われていません。",
      dropped: "トランザクションは処理されないまま期限切れになったため、スワップは行われていません。",
    },
    salePhaseNote: {
      opened: "ウォレットに承認を依頼しましたが、Bentenには署名がありません。もう一度売却する前に、ウォレットの履歴を確認してください。",
      outcome_unknown: "ウォレットがエラーを報告しており、トランザクションが送信されたかどうかBentenには判断できません。もう一度売却する前に、ウォレットの履歴を確認してください。",
      sent: "確認するまで、もう一度売却しないでください。",
      confirmed: "確認するまで、もう一度売却しないでください。",
      not_finalized: "確認するまで、もう一度売却しないでください。",
    },
    wallet: (address) => `ウォレット ${address}`,
    thisWallet: "接続中",
    started: (time) => `${time}に開始`,
    entered: (amount) => `入力した数量: ${amount}`,
    received: (amount) => `受け取り ${amount}`,
    paid: (amount) => `支払い ${amount}`,
    measured: "確定したトランザクションのトークン残高から、このウォレットについて算出しています。",
    resultUnreadable: "確定しましたが、トークン残高を読み取れませんでした。Solana Explorerで確認してください。",
    rawAmount: (raw, symbol) => `${symbol} raw ${raw}`,
    signature: "署名",
    copySignature: "署名をコピー",
    signatureCopied: "署名をコピーしました",
    copyUnavailable: "このブラウザではコピーできません",
    checkAgain: "状態を確認",
    checking: "確認しています…",
    explorer: "Solana Explorerで見る",
    explorerWallet: "Solana Explorerでこのウォレットを確認",
    newTab: "（新しいタブで開きます）",
    checkResult: {
      finalized: "確定しました。結果はトランザクションから算出しています。",
      failed: "トランザクションはSolana上で失敗しました。",
      confirmed: "まだ確定していません。もう一度購入せず、少し待ってから確認してください。",
      not_found: "この署名の状態はまだSolanaにありません。もう一度購入せず、少し待ってから確認してください。",
      finalized_unreadable: "確定しましたが、トークン残高を読み取れませんでした。",
      rate_limited: "Solanaの読み取りが混み合っています。何も変更されていません。少し待ってからもう一度試してください。",
      unavailable: "現在、確認できませんでした。何も変更されていません。",
      not_saved: "確認しましたが、このブラウザに結果を保存できませんでした。",
      other_network: "別のSolanaネットワークで記録されています。Bentenが確認するのはメインネットの記録だけです。",
    },
    lastChecked: (time) => `最終確認 ${time}`,
    details: "詳細",
    detail: {
      record: "記録",
      started: "開始",
      network: "ネットワーク",
      mainnet: "Solanaメインネット",
      otherNetwork: "別のSolanaネットワーク",
      route: "経路（プール）",
      expected: "受け取り見込み",
      minimum: "最低受け取り数量",
      previewNote: "承認前のスワッププレビューの値で、結果ではありません。",
      finalizedAt: "確定",
      lastChecked: "最終確認",
      never: "まだありません",
    },
    clear: "この端末の履歴を消去",
    clearTitle: "この端末の購入履歴を消去しますか？",
    clearBody: "このブラウザにあるBentenの記録だけを削除します。Solanaやウォレットの内容は何も変わりません。",
    clearConfirm: "履歴を消去",
    clearCancel: "消去しない",
    cleared: "この端末の履歴を消去しました。",
    clearFailed: "このブラウザでは履歴を消去できませんでした。",
    privacyTitle: "この端末に保存しています",
    privacyBody: "Bentenはこれらの記録を、このブラウザの保存領域にだけ保存します。保存するのは各購入のウォレットアドレス、署名、トークン、数量、時刻です。Bentenに送信されることはありません。",
    privacyLink: "プライバシー",
    storageUnavailable: "このブラウザでは、Bentenが履歴を保存できません。購入はネットワーク上に残っています。ウォレットの履歴を確認してください。",
    skipped: (count) => `このブラウザにある${count}件の記録を読み取れなかったため、表示していません。`,
  },
};

const ko: PortfolioCopy = {
  holdings: {
    walletLabel: "지갑",
    refresh: "새로고침",
    refreshing: "읽는 중…",
    tryAgain: "다시 시도",
    reading: "토큰 계정을 읽는 중…",
    readAt: (time) => `${time}에 Solana에서 읽음`,
    slots: (splToken, token2022) => `슬롯 ${splToken}, ${token2022}`,
    slotsDetails: "Solana 읽기 세부 정보",
    staleRead: (time) => `${time}에 읽은 내용입니다. 새로고침하면 최신으로 바뀝니다.`,
    notRead: "이 지갑의 보유를 읽으려면 새로고침하세요.",
    noneHeld: "이 지갑에는 Benten이 다루는 토큰이 없습니다.",
    explore: "기업 탐색",
    otherAccounts: (count, unreadable) => `이 지갑에는 Benten이 다루지 않는 토큰 계정이 ${count}개 더 있습니다.${unreadable > 0 ? ` 그중 ${unreadable}개는 읽을 수 없었습니다.` : ""}`,
    frozen: (count) => `계정 ${count}개가 동결됨`,
    delegated: (count) => `계정 ${count}개에 위임 대상이 있음`,
    totalLabel: "Pyth 참고 가격 기준 평가액",
    totalPrices: (from, to) => (from === to ? `${from} 가격 사용` : `${from}~${to} 가격 사용`),
    totalNotShown: (without, of) => `합계를 표시하지 않음: ${of}개 중 ${without}개에 Pyth 평가액이 없습니다.`,
    totalIncompleteRead: "합계를 표시하지 않음: 이번 읽기에 빠진 부분이 있습니다.",
    listCaption: "이 지갑에 있는, Benten이 다루는 토큰",
    columns: { product: "토큰", quantity: "수량", value: "Pyth 참고 가격 기준 평가액", price: "Pyth 참고 가격", action: "작업" },
    raw: (raw) => `raw ${raw}`,
    quantityUnknown: "표시 수량을 알 수 없음: 토큰의 민트를 읽을 수 없었습니다.",
    readingPrices: "Pyth 참고 가격을 읽는 중…",
    reasons: {
      no_price_feed: "이 토큰에는 Pyth 가격 피드가 없습니다",
      unit_basis_unverified: "Pyth 평가액 없음: 토큰 1단위와 Pyth 피드의 관계를 Benten이 확인하지 않았습니다",
      price_unavailable: "지금은 Pyth 참고 가격을 가져올 수 없습니다",
      price_stale: "평가액 없음: Pyth 마지막 업데이트가 최근이 아닙니다",
      price_too_old: "평가액 없음: Pyth 마지막 업데이트가 너무 오래되어 표시하지 않습니다",
      price_confidence_too_wide: "Pyth 신뢰 구간이 너무 넓어 평가액을 표시하지 않습니다",
      holding_metadata_unavailable: "평가액 없음: 토큰의 민트를 읽을 수 없었습니다",
      multiplier_unavailable: "평가액 없음: 토큰의 표시 배율을 읽을 수 없었습니다",
    },
    buy: (symbol) => `${symbol} 구매`,
    sell: (symbol) => `${symbol} 판매`,
    partial: {
      metadata: "일부 토큰 정보를 읽을 수 없어 일부 수량이나 평가액을 표시하지 않습니다.",
      limit: "이 지갑에는 Benten이 한 번에 읽는 수보다 많은 종류의 대상 토큰이 있어 세부 정보를 표시하지 않습니다.",
      transport: "읽기의 일부가 응답하지 않아 일부 수량이나 평가액을 표시하지 않습니다.",
      unidentified: "일부 토큰 계정을 읽을 수 없어 Benten이 다루는 토큰이 이 목록에서 빠졌을 수 있습니다. 합계는 표시하지 않습니다.",
    },
    errors: {
      body: "지금은 이 지갑을 읽을 수 없습니다. 아무것도 바뀌지 않았습니다.",
      busy: "Solana 읽기가 혼잡합니다",
      unreachable: "Solana에 연결할 수 없습니다",
      invalid: "Solana의 응답을 확인할 수 없습니다",
      limit: "이 지갑에는 Benten이 한 번에 읽는 수보다 많은 토큰 계정이 있습니다",
      accountLimit: "이 지갑은 토큰 계정이 너무 많아 Benten이 읽을 수 없습니다",
      accountLimitBody: (max) => `Benten은 토큰 프로그램마다 토큰 계정을 최대 ${max}개까지 읽습니다. 이 지갑은 이를 넘기 때문에 불완전한 목록을 표시하지 않습니다. 아무것도 바뀌지 않았습니다. 모든 토큰은 지갑 앱에서 확인할 수 있습니다.`,
    },
    readOnly: "Benten은 이 지갑을 읽기만 합니다. 여기에서 자금을 옮길 수 없습니다.",
  },
  activity: {
    listLabel: "이 브라우저에서 한 구매",
    buy: (symbol) => `${symbol} 구매`,
    sell: (symbol) => `${symbol} 판매`,
    phase: {
      opened: "결과 알 수 없음",
      outcome_unknown: "결과 알 수 없음",
      sent: "전송됨",
      confirmed: "아직 최종 확정 안 됨",
      not_finalized: "아직 최종 확정 안 됨",
      finalized: "최종 확정됨",
      failed: "실패",
      dropped: "처리되지 않음",
    },
    phaseNote: {
      opened: "지갑에 승인을 요청했지만 Benten에는 서명이 없습니다. 다시 구매하기 전에 지갑의 활동을 확인하세요.",
      outcome_unknown: "지갑이 오류를 보고했으며, 트랜잭션이 전송되었는지 Benten은 알 수 없습니다. 다시 구매하기 전에 지갑의 활동을 확인하세요.",
      sent: "확인하기 전까지 다시 구매하지 마세요.",
      confirmed: "확인하기 전까지 다시 구매하지 마세요.",
      not_finalized: "확인하기 전까지 다시 구매하지 마세요.",
      finalized: "",
      failed: "트랜잭션이 처리되었지만 실패하여 스왑은 이루어지지 않았습니다.",
      dropped: "트랜잭션이 처리되지 않은 채 만료되어 스왑은 이루어지지 않았습니다.",
    },
    salePhaseNote: {
      opened: "지갑에 승인을 요청했지만 Benten에는 서명이 없습니다. 다시 판매하기 전에 지갑의 활동을 확인하세요.",
      outcome_unknown: "지갑이 오류를 보고했으며, 트랜잭션이 전송되었는지 Benten은 알 수 없습니다. 다시 판매하기 전에 지갑의 활동을 확인하세요.",
      sent: "확인하기 전까지 다시 판매하지 마세요.",
      confirmed: "확인하기 전까지 다시 판매하지 마세요.",
      not_finalized: "확인하기 전까지 다시 판매하지 마세요.",
    },
    wallet: (address) => `지갑 ${address}`,
    thisWallet: "연결됨",
    started: (time) => `${time} 시작`,
    entered: (amount) => `입력한 수량: ${amount}`,
    received: (amount) => `받음 ${amount}`,
    paid: (amount) => `지불 ${amount}`,
    measured: "최종 확정된 트랜잭션의 토큰 잔액에서 이 지갑 기준으로 측정했습니다.",
    resultUnreadable: "최종 확정되었지만 토큰 잔액을 읽을 수 없습니다. Solana Explorer에서 확인하세요.",
    rawAmount: (raw, symbol) => `${symbol} raw ${raw}`,
    signature: "서명",
    copySignature: "서명 복사",
    signatureCopied: "서명을 복사했습니다",
    copyUnavailable: "이 브라우저에서는 복사할 수 없습니다",
    checkAgain: "상태 확인",
    checking: "확인 중…",
    explorer: "Solana Explorer에서 보기",
    explorerWallet: "Solana Explorer에서 이 지갑 확인",
    newTab: "(새 탭에서 열림)",
    checkResult: {
      finalized: "최종 확정되었습니다. 결과는 트랜잭션에서 측정했습니다.",
      failed: "트랜잭션이 Solana에서 실패했습니다.",
      confirmed: "아직 최종 확정되지 않았습니다. 다시 구매하지 말고 잠시 후 다시 확인하세요.",
      not_found: "이 서명의 상태가 아직 Solana에 없습니다. 다시 구매하지 말고 잠시 후 다시 확인하세요.",
      finalized_unreadable: "최종 확정되었지만 토큰 잔액을 읽을 수 없습니다.",
      rate_limited: "Solana 읽기가 혼잡합니다. 아무것도 바뀌지 않았습니다. 잠시 후 다시 시도하세요.",
      unavailable: "지금은 확인할 수 없습니다. 아무것도 바뀌지 않았습니다.",
      not_saved: "확인했지만 이 브라우저에 결과를 저장하지 못했습니다.",
      other_network: "다른 Solana 네트워크에서 기록되었습니다. Benten은 메인넷 기록만 확인합니다.",
    },
    lastChecked: (time) => `마지막 확인 ${time}`,
    details: "자세히",
    detail: {
      record: "기록",
      started: "시작",
      network: "네트워크",
      mainnet: "Solana 메인넷",
      otherNetwork: "다른 Solana 네트워크",
      route: "경로(풀)",
      expected: "예상 수령량",
      minimum: "최소 수령량",
      previewNote: "승인 전 스왑 미리보기의 값이며 결과가 아닙니다.",
      finalizedAt: "최종 확정",
      lastChecked: "마지막 확인",
      never: "아직 없음",
    },
    clear: "이 기기의 기록 지우기",
    clearTitle: "이 기기의 구매 기록을 지울까요?",
    clearBody: "이 브라우저에 있는 Benten 기록만 삭제합니다. Solana나 지갑의 내용은 바뀌지 않습니다.",
    clearConfirm: "기록 지우기",
    clearCancel: "기록 유지",
    cleared: "이 기기의 기록을 지웠습니다.",
    clearFailed: "이 브라우저에서는 기록을 지울 수 없습니다.",
    privacyTitle: "이 기기에 보관됨",
    privacyBody: "Benten은 이 기록을 이 브라우저의 저장 공간에만 보관합니다. 각 구매의 지갑 주소, 서명, 토큰, 수량, 시각입니다. Benten으로 전송되지 않습니다.",
    privacyLink: "개인정보",
    storageUnavailable: "이 브라우저에서는 Benten이 기록을 보관할 수 없습니다. 구매는 네트워크에 남아 있으니 지갑의 활동을 확인하세요.",
    skipped: (count) => `이 브라우저의 기록 ${count}개를 읽을 수 없어 표시하지 않습니다.`,
  },
};

const zhHans: PortfolioCopy = {
  holdings: {
    walletLabel: "钱包",
    refresh: "刷新",
    refreshing: "正在读取…",
    tryAgain: "重试",
    reading: "正在读取你的代币账户…",
    readAt: (time) => `于 ${time} 从 Solana 读取`,
    slots: (splToken, token2022) => `槽位 ${splToken} 和 ${token2022}`,
    slotsDetails: "Solana 读取详情",
    staleRead: (time) => `这是 ${time} 读取的内容。刷新即可更新。`,
    notRead: "刷新即可读取此钱包的持有。",
    noneHeld: "此钱包中没有 Benten 涵盖的代币。",
    explore: "探索公司",
    otherAccounts: (count, unreadable) => `此钱包中还有 ${count} 个 Benten 未涵盖的代币账户。${unreadable > 0 ? `其中 ${unreadable} 个无法读取。` : ""}`,
    frozen: (count) => `${count} 个账户已冻结`,
    delegated: (count) => `${count} 个账户设有委托方`,
    totalLabel: "按 Pyth 参考价格计算的价值",
    totalPrices: (from, to) => (from === to ? `使用 ${from} 的价格` : `使用 ${from} 至 ${to} 的价格`),
    totalNotShown: (without, of) => `未显示合计：${of} 项持有中有 ${without} 项没有 Pyth 价值。`,
    totalIncompleteRead: "未显示合计：本次读取有缺失部分。",
    listCaption: "此钱包中 Benten 涵盖的代币",
    columns: { product: "代币", quantity: "数量", value: "按 Pyth 参考价格计算的价值", price: "Pyth 参考价格", action: "操作" },
    raw: (raw) => `raw ${raw}`,
    quantityUnknown: "显示数量未知：无法读取该代币的铸币账户。",
    readingPrices: "正在读取 Pyth 参考价格…",
    reasons: {
      no_price_feed: "此代币没有 Pyth 价格源",
      unit_basis_unverified: "无 Pyth 价值：Benten 尚未核实 1 个代币与其 Pyth 价格源的关系",
      price_unavailable: "暂时无法获取 Pyth 参考价格",
      price_stale: "无价值：Pyth 最后更新不够新",
      price_too_old: "无价值：Pyth 最后更新过旧，不予显示",
      price_confidence_too_wide: "Pyth 置信区间过宽，不显示价值",
      holding_metadata_unavailable: "无价值：无法读取该代币的铸币账户",
      multiplier_unavailable: "无价值：无法读取该代币的显示倍数",
    },
    buy: (symbol) => `购买 ${symbol}`,
    sell: (symbol) => `卖出 ${symbol}`,
    partial: {
      metadata: "部分代币信息无法读取，因此部分数量或价值未显示。",
      limit: "此钱包中 Benten 涵盖的代币种类超过单次读取上限，因此未显示详情。",
      transport: "部分读取没有响应，因此部分数量或价值未显示。",
      unidentified: "部分代币账户无法读取，因此此列表可能缺少 Benten 涵盖的代币。未显示合计。",
    },
    errors: {
      body: "Benten 目前无法读取此钱包。未做任何更改。",
      busy: "Solana 读取繁忙",
      unreachable: "无法连接 Solana",
      invalid: "无法核对 Solana 的响应",
      limit: "此钱包的代币账户超过 Benten 单次读取上限",
      accountLimit: "此钱包的代币账户过多，Benten 无法读取",
      accountLimitBody: (max) => `Benten 每个代币程序最多读取 ${max} 个代币账户。此钱包超过该数量，因此 Benten 不显示不完整的列表。未做任何更改。你可以在钱包应用中查看所有代币。`,
    },
    readOnly: "Benten 只读取此钱包。这里无法转移资金。",
  },
  activity: {
    listLabel: "在此浏览器中进行的购买",
    buy: (symbol) => `购买 ${symbol}`,
    sell: (symbol) => `卖出 ${symbol}`,
    phase: {
      opened: "结果未知",
      outcome_unknown: "结果未知",
      sent: "已发送",
      confirmed: "尚未最终确定",
      not_finalized: "尚未最终确定",
      finalized: "已最终确定",
      failed: "失败",
      dropped: "未被处理",
    },
    phaseNote: {
      opened: "已在钱包中请求批准，但 Benten 没有它的签名。再次购买前，请先查看钱包的活动记录。",
      outcome_unknown: "钱包报告了错误，Benten 无法判断交易是否已发送。再次购买前，请先查看钱包的活动记录。",
      sent: "确认之前请不要再次购买。",
      confirmed: "确认之前请不要再次购买。",
      not_finalized: "确认之前请不要再次购买。",
      finalized: "",
      failed: "交易已被处理但失败，因此兑换没有发生。",
      dropped: "交易未被处理就已过期，因此兑换没有发生。",
    },
    salePhaseNote: {
      opened: "已在钱包中请求批准，但 Benten 没有它的签名。再次卖出前，请先查看钱包的活动记录。",
      outcome_unknown: "钱包报告了错误，Benten 无法判断交易是否已发送。再次卖出前，请先查看钱包的活动记录。",
      sent: "确认之前请不要再次卖出。",
      confirmed: "确认之前请不要再次卖出。",
      not_finalized: "确认之前请不要再次卖出。",
    },
    wallet: (address) => `钱包 ${address}`,
    thisWallet: "已连接",
    started: (time) => `开始于 ${time}`,
    entered: (amount) => `输入的数量：${amount}`,
    received: (amount) => `收到 ${amount}`,
    paid: (amount) => `支付 ${amount}`,
    measured: "根据已最终确定交易中此钱包的代币余额计算。",
    resultUnreadable: "已最终确定，但无法读取其代币余额。请在 Solana Explorer 上查看。",
    rawAmount: (raw, symbol) => `${symbol} raw ${raw}`,
    signature: "签名",
    copySignature: "复制签名",
    signatureCopied: "已复制签名",
    copyUnavailable: "此浏览器无法复制",
    checkAgain: "查看状态",
    checking: "正在查看…",
    explorer: "在 Solana Explorer 上查看",
    explorerWallet: "在 Solana Explorer 上查看此钱包",
    newTab: "（在新标签页中打开）",
    checkResult: {
      finalized: "已最终确定。结果根据交易计算。",
      failed: "交易在 Solana 上失败。",
      confirmed: "尚未最终确定。请不要再次购买，稍后再查看。",
      not_found: "Solana 上还没有此签名的状态。请不要再次购买，稍后再查看。",
      finalized_unreadable: "已最终确定，但无法读取其代币余额。",
      rate_limited: "Solana 读取繁忙。未做任何更改。请稍后重试。",
      unavailable: "Benten 目前无法查看。未做任何更改。",
      not_saved: "已查看，但此浏览器未保存结果。",
      other_network: "记录于其他 Solana 网络。Benten 只查看主网记录。",
    },
    lastChecked: (time) => `最近查看 ${time}`,
    details: "详情",
    detail: {
      record: "记录",
      started: "开始",
      network: "网络",
      mainnet: "Solana 主网",
      otherNetwork: "其他 Solana 网络",
      route: "路径（资金池）",
      expected: "预计收到",
      minimum: "最少收到",
      previewNote: "来自批准前的兑换预览，不是结果。",
      finalizedAt: "最终确定",
      lastChecked: "最近查看",
      never: "尚无",
    },
    clear: "清除此设备上的记录",
    clearTitle: "要清除此设备上的购买记录吗？",
    clearBody: "这只会删除此浏览器中的 Benten 记录，不会改变 Solana 或钱包中的任何内容。",
    clearConfirm: "清除记录",
    clearCancel: "保留记录",
    cleared: "已清除此设备上的记录。",
    clearFailed: "此浏览器不允许 Benten 清除记录。",
    privacyTitle: "保存在此设备上",
    privacyBody: "Benten 只把这些记录保存在此浏览器的存储中：每次购买的钱包地址、签名、代币、数量和时间。它们不会发送给 Benten。",
    privacyLink: "隐私",
    storageUnavailable: "此浏览器不允许 Benten 保存记录。你的购买仍在网络上，请查看钱包的活动记录。",
    skipped: (count) => `此浏览器中有 ${count} 条记录无法读取，未显示。`,
  },
};

const zhHant: PortfolioCopy = {
  holdings: {
    walletLabel: "錢包",
    refresh: "重新整理",
    refreshing: "正在讀取…",
    tryAgain: "重試",
    reading: "正在讀取你的代幣帳戶…",
    readAt: (time) => `於 ${time} 從 Solana 讀取`,
    slots: (splToken, token2022) => `槽位 ${splToken} 和 ${token2022}`,
    slotsDetails: "Solana 讀取詳情",
    staleRead: (time) => `這是 ${time} 讀取的內容。重新整理即可更新。`,
    notRead: "重新整理即可讀取此錢包的持有。",
    noneHeld: "此錢包中沒有 Benten 涵蓋的代幣。",
    explore: "探索公司",
    otherAccounts: (count, unreadable) => `此錢包中還有 ${count} 個 Benten 未涵蓋的代幣帳戶。${unreadable > 0 ? `其中 ${unreadable} 個無法讀取。` : ""}`,
    frozen: (count) => `${count} 個帳戶已凍結`,
    delegated: (count) => `${count} 個帳戶設有委託方`,
    totalLabel: "以 Pyth 參考價格計算的價值",
    totalPrices: (from, to) => (from === to ? `使用 ${from} 的價格` : `使用 ${from} 至 ${to} 的價格`),
    totalNotShown: (without, of) => `未顯示合計：${of} 項持有中有 ${without} 項沒有 Pyth 價值。`,
    totalIncompleteRead: "未顯示合計：本次讀取有缺漏部分。",
    listCaption: "此錢包中 Benten 涵蓋的代幣",
    columns: { product: "代幣", quantity: "數量", value: "以 Pyth 參考價格計算的價值", price: "Pyth 參考價格", action: "操作" },
    raw: (raw) => `raw ${raw}`,
    quantityUnknown: "顯示數量未知：無法讀取該代幣的鑄幣帳戶。",
    readingPrices: "正在讀取 Pyth 參考價格…",
    reasons: {
      no_price_feed: "此代幣沒有 Pyth 價格來源",
      unit_basis_unverified: "無 Pyth 價值：Benten 尚未核實 1 個代幣與其 Pyth 價格來源的關係",
      price_unavailable: "暫時無法取得 Pyth 參考價格",
      price_stale: "無價值：Pyth 最後更新不夠新",
      price_too_old: "無價值：Pyth 最後更新過舊，不予顯示",
      price_confidence_too_wide: "Pyth 信賴區間過寬，不顯示價值",
      holding_metadata_unavailable: "無價值：無法讀取該代幣的鑄幣帳戶",
      multiplier_unavailable: "無價值：無法讀取該代幣的顯示倍數",
    },
    buy: (symbol) => `購買 ${symbol}`,
    sell: (symbol) => `賣出 ${symbol}`,
    partial: {
      metadata: "部分代幣資訊無法讀取，因此部分數量或價值未顯示。",
      limit: "此錢包中 Benten 涵蓋的代幣種類超過單次讀取上限，因此未顯示詳情。",
      transport: "部分讀取沒有回應，因此部分數量或價值未顯示。",
      unidentified: "部分代幣帳戶無法讀取，因此此列表可能缺少 Benten 涵蓋的代幣。未顯示合計。",
    },
    errors: {
      body: "Benten 目前無法讀取此錢包。未做任何變更。",
      busy: "Solana 讀取繁忙",
      unreachable: "無法連線至 Solana",
      invalid: "無法核對 Solana 的回應",
      limit: "此錢包的代幣帳戶超過 Benten 單次讀取上限",
      accountLimit: "此錢包的代幣帳戶過多，Benten 無法讀取",
      accountLimitBody: (max) => `Benten 每個代幣程式最多讀取 ${max} 個代幣帳戶。此錢包超過該數量，因此 Benten 不顯示不完整的清單。未做任何變更。你可以在錢包應用程式中查看所有代幣。`,
    },
    readOnly: "Benten 只讀取此錢包。這裡無法轉移資金。",
  },
  activity: {
    listLabel: "在此瀏覽器中進行的購買",
    buy: (symbol) => `購買 ${symbol}`,
    sell: (symbol) => `賣出 ${symbol}`,
    phase: {
      opened: "結果未知",
      outcome_unknown: "結果未知",
      sent: "已傳送",
      confirmed: "尚未最終確定",
      not_finalized: "尚未最終確定",
      finalized: "已最終確定",
      failed: "失敗",
      dropped: "未被處理",
    },
    phaseNote: {
      opened: "已在錢包中請求核准，但 Benten 沒有它的簽章。再次購買前，請先查看錢包的活動紀錄。",
      outcome_unknown: "錢包回報了錯誤，Benten 無法判斷交易是否已傳送。再次購買前，請先查看錢包的活動紀錄。",
      sent: "確認之前請不要再次購買。",
      confirmed: "確認之前請不要再次購買。",
      not_finalized: "確認之前請不要再次購買。",
      finalized: "",
      failed: "交易已被處理但失敗，因此兌換沒有發生。",
      dropped: "交易未被處理就已過期，因此兌換沒有發生。",
    },
    salePhaseNote: {
      opened: "已在錢包中請求核准，但 Benten 沒有它的簽章。再次賣出前，請先查看錢包的活動紀錄。",
      outcome_unknown: "錢包回報了錯誤，Benten 無法判斷交易是否已傳送。再次賣出前，請先查看錢包的活動紀錄。",
      sent: "確認之前請不要再次賣出。",
      confirmed: "確認之前請不要再次賣出。",
      not_finalized: "確認之前請不要再次賣出。",
    },
    wallet: (address) => `錢包 ${address}`,
    thisWallet: "已連接",
    started: (time) => `開始於 ${time}`,
    entered: (amount) => `輸入的數量：${amount}`,
    received: (amount) => `收到 ${amount}`,
    paid: (amount) => `支付 ${amount}`,
    measured: "根據已最終確定交易中此錢包的代幣餘額計算。",
    resultUnreadable: "已最終確定，但無法讀取其代幣餘額。請在 Solana Explorer 上查看。",
    rawAmount: (raw, symbol) => `${symbol} raw ${raw}`,
    signature: "簽章",
    copySignature: "複製簽章",
    signatureCopied: "已複製簽章",
    copyUnavailable: "此瀏覽器無法複製",
    checkAgain: "查看狀態",
    checking: "正在查看…",
    explorer: "在 Solana Explorer 上查看",
    explorerWallet: "在 Solana Explorer 上查看此錢包",
    newTab: "（在新分頁中開啟）",
    checkResult: {
      finalized: "已最終確定。結果根據交易計算。",
      failed: "交易在 Solana 上失敗。",
      confirmed: "尚未最終確定。請不要再次購買，稍後再查看。",
      not_found: "Solana 上還沒有此簽章的狀態。請不要再次購買，稍後再查看。",
      finalized_unreadable: "已最終確定，但無法讀取其代幣餘額。",
      rate_limited: "Solana 讀取繁忙。未做任何變更。請稍後重試。",
      unavailable: "Benten 目前無法查看。未做任何變更。",
      not_saved: "已查看，但此瀏覽器未儲存結果。",
      other_network: "紀錄於其他 Solana 網路。Benten 只查看主網紀錄。",
    },
    lastChecked: (time) => `最近查看 ${time}`,
    details: "詳情",
    detail: {
      record: "紀錄",
      started: "開始",
      network: "網路",
      mainnet: "Solana 主網",
      otherNetwork: "其他 Solana 網路",
      route: "路徑（資金池）",
      expected: "預計收到",
      minimum: "最少收到",
      previewNote: "來自核准前的兌換預覽，不是結果。",
      finalizedAt: "最終確定",
      lastChecked: "最近查看",
      never: "尚無",
    },
    clear: "清除此裝置上的紀錄",
    clearTitle: "要清除此裝置上的購買紀錄嗎？",
    clearBody: "這只會刪除此瀏覽器中的 Benten 紀錄，不會改變 Solana 或錢包中的任何內容。",
    clearConfirm: "清除紀錄",
    clearCancel: "保留紀錄",
    cleared: "已清除此裝置上的紀錄。",
    clearFailed: "此瀏覽器不允許 Benten 清除紀錄。",
    privacyTitle: "儲存在此裝置上",
    privacyBody: "Benten 只把這些紀錄儲存在此瀏覽器的儲存空間中：每次購買的錢包地址、簽章、代幣、數量和時間。它們不會傳送給 Benten。",
    privacyLink: "隱私",
    storageUnavailable: "此瀏覽器不允許 Benten 保存紀錄。你的購買仍在網路上，請查看錢包的活動紀錄。",
    skipped: (count) => `此瀏覽器中有 ${count} 筆紀錄無法讀取，未顯示。`,
  },
};

export const PORTFOLIO_MESSAGES: Record<PublicWebLocale, PortfolioCopy> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function portfolioMessagesFor(locale: PublicWebLocale): PortfolioCopy {
  return PORTFOLIO_MESSAGES[locale];
}
