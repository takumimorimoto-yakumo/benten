/**
 * Purchase island copy for every supported locale. Ported unchanged in meaning
 * from the legacy app's `purchase` namespace (design contract section 7); the
 * copy-button and new-tab strings restate the legacy shared wording. Imported
 * only by the purchase island, so none of it reaches the static page graph.
 * Registered for non-Latin text in catalog-manifest.json.
 */
import type { PublicWebLocale } from "./locales";


type PurchaseErrorCopy = { title: string; body: string };
export type PurchaseCopy = {
  heading: string; jumpLink: string; routeLine: (pool: string) => string; poolLabel: string; noScript: string;
  copyValue: { copy: string; copied: string; unavailable: string }; opensNewTab: string;
  unsupported: { heading: (symbol: string) => string; body: string };
  notice: { heading: string; usPersons: string; noEligibilityCheck: string; noAvailabilityGuarantee: string; notAdvice: string };
  wallet: { detecting: string; notDetectedTitle: string; notDetectedBody: string; listLabel: string; connect: string; connectNamed: (name: string) => string; connecting: string; connected: string; address: (address: string) => string; disconnect: string; unsupported: (name: string) => string; connectRejected: string; connectFailed: string; payTokensHint: string; payTokenSelectedHint: (symbol: string) => string };
  balance: { usdc: (amount: string) => string; loading: string; unavailable: string };
  amount: { label: string; helperRaw: (raw: string) => string; helperSeparator: string; errorEmpty: string; errorFormat: string; errorPrecision: string; errorZero: string; errorOverBalance: (balance: string) => string; errorOverLimit: (limit: string) => string };
  pay: {
    label: string; balance: (amount: string) => string; balanceLoading: (symbol: string) => string; balanceUnavailable: (symbol: string) => string; solReserve: (reserve: string) => string;
    amountLabel: (symbol: string) => string; helperRaw: (raw: string, symbol: string, decimals: string) => string; errorEmpty: (symbol: string) => string; errorPrecision: (symbol: string, decimals: string) => string; errorOverBalance: (balance: string) => string;
    route: (symbol: string) => string; firstLeg: string; firstLegValue: (pay: string, usdc: string) => string; usdcIn: string; usdcInNote: string; limitBasis: (usdc: string, limit: string) => string; firstLegFee: (amount: string) => string; nvdaxPoolFee: string; nvdaxPoolImpact: string; accountCreation: string;
    overLimit: { title: string; body: (usdc: string, limit: string) => string }; paid: (symbol: string) => string; solPaidNote: string; usdcLeft: string;
  };
  action: { preview: string; previewing: string; approve: string; approving: string; refresh: string; tryAgain: string; checkAgain: string; startNew: string };
  preview: { heading: string; headingExpired: string; youPay: string; consumed: (amount: string, raw: string) => string; expected: string; minimum: string; minimumNote: string; poolFee: string; protocolShare: (amount: string) => string; slippage: string; priceImpact: string; priceImpactBelow: string; expires: string; expiresIn: (time: string) => string; expiresAt: (time: string) => string; expired: string; raw: (value: string) => string; rawOnly: (raw: string) => string; multiplierNote: (time: string) => string; multiplierUnavailable: string; accountCreation: string; networkFee: string; ready: (time: string) => string; tenSecondsLeft: string };
  trail: { label: string; reviewed: string; approveNow: string; approveBody: string; approved: string; sent: string; confirmed: string; finalized: string; notSeenYet: string; stateDone: string; stateCurrent: string; stateNotYet: string; keepOpen: string; signature: string; waitingApproval: string; announceSent: string; announceConfirmed: string; readingResult: string };
  status: { sent: string; view: string };
  result: { heading: string; receivedLabel: string; received: (delta: string) => string; usdcPaid: string; source: string; explorer: string; explorerCheck: string; copySignature: string; unreadable: string };
  /** The sale flow (NVDAx to USDC in the same fixed pool); the shared wallet, trail and error copy is reused. */
  sell: {
    heading: string; routeLine: (pool: string) => string; noScript: string; noticeHeading: string;
    amountLabel: string; balance: (amount: string) => string; balanceLoading: string; balanceUnavailable: string; limitLoading: string; limitUnavailable: string;
    max: (amount: string, limit: string) => string; helperRaw: (raw: string) => string;
    errorEmpty: string; errorPrecision: string; errorOverLimit: (max: string, limit: string) => string; errorOverBalance: (balance: string) => string; errorNotReady: string;
    youSell: string; consumed: (amount: string, raw: string) => string; expected: string; minimum: string; minimumNote: string; accountCreation: string;
    overLimit: { title: string; body: (usdc: string, limit: string) => string };
    /** A sale stopped by a failed check (pool, quote, reference price or transaction); no retry from the panel. */
    routeCheck: PurchaseErrorCopy;
    /** The display multiplier changed after the amount was converted; the terms are read again. */
    termsChanged: PurchaseErrorCopy;
    startNew: string; resultHeading: string; receivedLabel: string; received: (amount: string) => string; soldLabel: string;
  };
  error: { expired: { title: string; body: (time: string) => string }; rejected: PurchaseErrorCopy; notEnoughSol: { title: string; body: (withDeposit: boolean) => string }; simulationFailed: PurchaseErrorCopy; routeCheck: PurchaseErrorCopy; relayBusy: PurchaseErrorCopy; relayUnavailable: PurchaseErrorCopy; trackingRelay: PurchaseErrorCopy; walletUnknown: PurchaseErrorCopy & { explorer: string }; earlierRequest: PurchaseErrorCopy; failedOnChain: PurchaseErrorCopy; dropped: PurchaseErrorCopy; notFinalized: { title: string; body: (minutes: string) => string }; technicalDetails: string };
};

const purchaseEn = (s: string): PurchaseCopy => ({
  heading: `Buy ${s}`, jumpLink: `Buy ${s}`,
  routeLine: (pool) => `One fixed route: Meteora DLMM pool ${pool}. You approve and send in your own wallet. Benten never signs or holds funds.`, poolLabel: "Pool address", noScript: "Buying requires JavaScript and a wallet.",
  copyValue: { copy: "Copy address", copied: "Copied", unavailable: "Copy unavailable" }, opensNewTab: "(opens in a new tab)",
  unsupported: { heading: (symbol) => `Purchase not available for ${symbol}`, body: "Benten supports buying only a fixed list of xStocks, each through one fixed pool. Benten offers no purchase for this token." },
  notice: { heading: "Before you buy", usPersons: "The issuer does not offer or sell xStocks to US persons, and transfers may only be made to non-US persons.", noEligibilityCheck: "Benten does not check whether you are eligible.", noAvailabilityGuarantee: "Availability from any country is not guaranteed.", notAdvice: "This is not investment advice." },
  wallet: { detecting: "Looking for a Solana wallet...", notDetectedTitle: "No Solana wallet found", notDetectedBody: "This browser has no Solana wallet that supports Wallet Standard. Install or unlock one, then reload this page.", listLabel: "Wallets found in this browser", connect: "Connect wallet", connectNamed: (name) => `Connect ${name}`, connecting: "Waiting for your wallet...", connected: "Wallet connected", address: (address) => `Address ${address}`, disconnect: "Disconnect", unsupported: (name) => `${name} cannot send Solana mainnet transactions from this page. Choose another wallet.`, connectRejected: "Connection was cancelled in your wallet. Nothing changed.", connectFailed: "Your wallet did not connect. Nothing changed. Try again or choose another wallet.", payTokensHint: "Pay with USDC, SOL or SKR from your own wallet. Connect a wallet to choose.", payTokenSelectedHint: (symbol) => `This link pays with ${symbol} from your own wallet. Connect a wallet to continue.` },
  balance: { usdc: (amount) => `USDC balance ${amount}`, loading: "Reading your USDC balance...", unavailable: "Your USDC balance could not be read." },
  amount: { label: "USDC to pay", helperRaw: (raw) => `${raw} raw units. USDC uses 6 decimals.`, helperSeparator: "Use . as the decimal separator.", errorEmpty: "Enter an amount of USDC.", errorFormat: "Enter digits only, with . as the decimal separator.", errorPrecision: "USDC has at most 6 decimal places.", errorZero: "Enter an amount above zero.", errorOverBalance: (balance) => `This is more than your USDC balance of ${balance}.`, errorOverLimit: (limit) => `The limit is ${limit} USDC per transaction.` },
  pay: {
    label: "Pay with", balance: (amount) => `Balance ${amount}`, balanceLoading: (symbol) => `Reading your ${symbol} balance...`, balanceUnavailable: (symbol) => `Your ${symbol} balance could not be read.`, solReserve: (reserve) => `${reserve} SOL stays in your wallet for the network fee and account deposits.`,
    amountLabel: (symbol) => `${symbol} to pay`, helperRaw: (raw, symbol, decimals) => `${raw} raw units. ${symbol} uses ${decimals} decimals.`, errorEmpty: (symbol) => `Enter an amount of ${symbol}.`, errorPrecision: (symbol, decimals) => `${symbol} has at most ${decimals} decimal places.`, errorOverBalance: (balance) => `This is more than the ${balance} you can use.`,
    route: (symbol) => `${symbol} to USDC to ${s}: two fixed Meteora DLMM pools, in one transaction you approve in your wallet.`, firstLeg: "First pool: expected USDC", firstLegValue: (pay, usdc) => `${pay} = ${usdc}`, usdcIn: `USDC into the ${s} pool`, usdcInNote: "The first pool's minimum after slippage. Any USDC above it stays in your wallet.", limitBasis: (usdc, limit) => `Limit check: the first pool expects to return ${usdc} USDC for this amount. The limit is ${limit} USDC per transaction.`, firstLegFee: (amount) => `Pool fee ${amount}`, nvdaxPoolFee: `${s} pool fee`, nvdaxPoolImpact: `${s} pool price impact`, accountCreation: `This transaction may also create the token accounts it needs: ${s}, USDC, and wrapped SOL when paying with SOL. Your wallet shows any one-time SOL deposit; the wrapped SOL account is closed and its deposit returned in the same transaction.`,
    overLimit: { title: "Above the per-transaction limit", body: (usdc, limit) => `The first pool expects to return ${usdc} USDC for this amount, above the limit of ${limit} USDC per transaction. Enter a smaller amount. Nothing was signed or sent.` }, paid: (symbol) => `${symbol} paid`, solPaidNote: "SOL paid is the change in your wallet's SOL balance, so it includes the network fee and any account deposit.", usdcLeft: "USDC left in your wallet",
  },
  action: { preview: "Preview swap", previewing: "Preparing preview...", approve: "Approve in wallet", approving: "Waiting for approval...", refresh: "Refresh preview", tryAgain: "Try again", checkAgain: "Check again", startNew: "Start a new purchase" },
  preview: { heading: "Swap preview", headingExpired: "Expired swap preview", youPay: "You pay", consumed: (amount, raw) => `Used by the pool: ${amount} USDC (raw ${raw})`, expected: "Expected to receive", minimum: "Minimum you receive", minimumNote: "The transaction fails instead of giving you less than this.", poolFee: "Pool fee", protocolShare: (amount) => `Includes protocol share ${amount}`, slippage: "Slippage tolerance", priceImpact: "Price impact", priceImpactBelow: "<0.01%", expires: "Preview expires", expiresIn: (time) => `in ${time}`, expiresAt: (time) => `at ${time}`, expired: "Expired", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw units`, multiplierNote: (time) => `${s} amounts use the display multiplier read from the mint at ${time}.`, multiplierUnavailable: `The ${s} display multiplier could not be read. ${s} amounts are shown in raw units only.`, accountCreation: `This transaction also creates your ${s} token account. Your wallet shows the one-time SOL deposit.`, networkFee: "Your wallet shows the network fee in SOL. Benten asks your wallet to send once and never resends.", ready: (time) => `Swap preview ready. It expires at ${time}.`, tenSecondsLeft: "The swap preview expires in 10 seconds." },
  trail: { label: "Progress", reviewed: "Preview reviewed", approveNow: "Approve in your wallet", approveBody: "Check the amounts in your wallet, then approve or reject.", approved: "Approved in wallet", sent: "Sent", confirmed: "Confirmed", finalized: "Finalized", notSeenYet: "Not seen yet", stateDone: "done", stateCurrent: "current", stateNotYet: "not yet", keepOpen: "You can leave this screen. Benten keeps checking while Benten is open, and Activity keeps the signature. Do not buy again.", signature: "Signature", waitingApproval: "Waiting for approval in your wallet.", announceSent: "Sent.", announceConfirmed: "Confirmed.", readingResult: "Reading the finalized transaction..." },
  status: { sent: "Purchase sent. Tracking until finalized.", view: "View" },
  result: { heading: "Purchase result", receivedLabel: `${s} received`, received: (delta) => `${s} received: ${delta}.`, usdcPaid: "USDC paid", source: "Measured from the finalized transaction's token balances for your wallet.", explorer: "View on Solana Explorer", explorerCheck: "Check on Solana Explorer", copySignature: "Copy signature", unreadable: "The transaction is finalized, but its token balances could not be read. Check it on Solana Explorer." },
  sell: {
    heading: "Sell NVDAx for USDC", routeLine: (pool) => `One fixed route, the reverse of buying: Meteora DLMM pool ${pool}. You approve and send in your own wallet. Benten never signs or holds funds.`, noScript: "Selling requires JavaScript and a wallet.", noticeHeading: "Before you sell",
    amountLabel: "NVDAx to sell", balance: (amount) => `NVDAx balance ${amount}`, balanceLoading: "Reading your NVDAx balance...", balanceUnavailable: "Your NVDAx balance could not be read.", limitLoading: "Reading the per-sale limit...", limitUnavailable: "The per-sale limit could not be read. Reload this page to try again.",
    max: (amount, limit) => `Up to ${amount} NVDAx in one sale: your balance or about ${limit} USDC, whichever is smaller.`, helperRaw: (raw) => `${raw} raw units at the current display multiplier. NVDAx uses 8 decimals.`,
    errorEmpty: "Enter an amount of NVDAx.", errorPrecision: "NVDAx has at most 8 decimal places.", errorOverLimit: (max, limit) => `One sale may use at most ${max} NVDAx, about ${limit} USDC. Enter a smaller amount.`, errorOverBalance: (balance) => `This is more than your NVDAx balance of ${balance}.`, errorNotReady: "Your balance and the per-sale limit are still being read.",
    youSell: "You sell", consumed: (amount, raw) => `Used by the pool: ${amount} NVDAx (raw ${raw})`, expected: "Expected USDC", minimum: "Minimum USDC you receive", minimumNote: "The transaction fails instead of giving you less USDC than this.", accountCreation: "Your wallet will also create your USDC token account, which needs a small refundable SOL deposit.",
    overLimit: { title: "Above the per-sale limit", body: (usdc, limit) => `The pool expects to return ${usdc} USDC for this amount, above the limit of ${limit} USDC per sale. Enter a smaller amount. Nothing was signed or sent.` },
    routeCheck: { title: "Sale paused: a check failed", body: "The pool, the expected USDC or the Pyth reference value did not pass Benten's checks, for example because the Pyth reference is not current, so Benten stopped before building a transaction. Nothing was signed or sent." },
    termsChanged: { title: "The NVDAx display multiplier changed", body: "The multiplier your amount was converted with is no longer in effect, so Benten stopped before building a transaction. Nothing was signed or sent. Benten reads the current terms again: check the amount, then refresh the preview." },
    startNew: "Start a new sale", resultHeading: "Sale result", receivedLabel: "USDC received", received: (amount) => `USDC received: ${amount}.`, soldLabel: "NVDAx sold",
  },
  error: {
    expired: { title: "This preview expired", body: (time) => `Pool conditions may have changed since ${time}. Nothing was signed or sent. Refresh the preview to see current terms before approving.` },
    rejected: { title: "You rejected the request in your wallet", body: "Nothing was sent. You can approve this preview again until it expires, or refresh it." },
    notEnoughSol: { title: "Not enough SOL for network fees", body: (withDeposit) => `This wallet needs a small amount of SOL for the network fee${withDeposit ? " and the token account deposit" : ""}. Add SOL in your wallet, then refresh the preview. Nothing was signed or sent.` },
    simulationFailed: { title: "The swap could not be prepared", body: "A test run of this transaction failed, so Benten did not ask your wallet to approve it. Nothing was signed or sent. Try a different amount or refresh the preview." },
    routeCheck: { title: "Purchase paused: route check failed", body: "The pool no longer matches the verified route, so Benten stopped before building a transaction. Nothing was signed or sent." },
    relayBusy: { title: "The Solana network connection is busy", body: "Benten could not read the network just now. Nothing was signed or sent. Wait a few seconds, then try again." },
    relayUnavailable: { title: "The Solana network connection is unavailable", body: "Benten could not read the network just now. Nothing was signed or sent. Wait a few seconds, then try again." },
    trackingRelay: { title: "Benten could not check the status", body: "Your transaction was already sent. Do not buy again. Check again in a moment, or check it on Solana Explorer." },
    walletUnknown: { title: "Your wallet reported an error", body: "Benten cannot tell whether your wallet sent the transaction, so this preview cannot be approved again. Check your wallet's activity and this wallet on Solana Explorer before you try again. A new purchase starts from a new preview.", explorer: "Check this wallet on Solana Explorer" },
    earlierRequest: { title: "An earlier request may have been sent", body: "Your wallet reported an error for an earlier request, and Benten cannot tell whether it was sent. Check your wallet's activity and Solana Explorer before you approve this one." },
    failedOnChain: { title: "The transaction failed on the network", body: `It was processed but did not complete, so no ${s} was bought. The network fee may still have been charged. A common cause is the pool moving beyond your slippage tolerance.` },
    dropped: { title: "This transaction expired without being processed", body: "The network no longer accepts it, so it will not complete. No USDC left your wallet for it." },
    notFinalized: { title: "Not finalized yet", body: (minutes) => `Benten stopped checking after ${minutes} minutes. The transaction may still finalize. Do not buy again until you have checked.` },
    technicalDetails: "Technical details",
  },
});

const purchaseJa = (s: string): PurchaseCopy => ({
  heading: `${s}を購入`, jumpLink: `${s}を購入`,
  routeLine: (pool) => `固定ルートは1つです: Meteora DLMM プール ${pool}。承認と送信はご自身のウォレットで行います。Bentenは署名せず、資金を預かりません。`, poolLabel: "プールアドレス", noScript: "購入にはJavaScriptとウォレットが必要です。",
  copyValue: { copy: "アドレスをコピー", copied: "コピーしました", unavailable: "コピーできません" }, opensNewTab: "（新しいタブで開きます）",
  unsupported: { heading: (symbol) => `${symbol} は購入できません`, body: "Bentenが対応している購入は、決められた一部のxStocksを、それぞれ1つの固定プールを通じて購入することだけです。このトークンの購入は提供していません。" },
  notice: { heading: "購入の前に", usPersons: "発行体は米国人にxStocksを提供・販売しません。引き渡しは米国人でない人にだけ行います。", noEligibilityCheck: "Bentenはあなたに購入資格があるかを確認しません。", noAvailabilityGuarantee: "どの国からの利用も保証されていません。", notAdvice: "これは投資助言ではありません。" },
  wallet: { detecting: "Solanaウォレットを探しています…", notDetectedTitle: "Solanaウォレットが見つかりません", notDetectedBody: "このブラウザにWallet Standard対応のSolanaウォレットがありません。ウォレットをインストールまたはロック解除してから、このページを再読み込みしてください。", listLabel: "このブラウザで見つかったウォレット", connect: "ウォレットを接続", connectNamed: (name) => `${name}を接続`, connecting: "ウォレットの応答を待っています…", connected: "ウォレット接続済み", address: (address) => `アドレス ${address}`, disconnect: "接続を解除", unsupported: (name) => `${name}はこのページからSolanaメインネットのトランザクションを送信できません。別のウォレットを選んでください。`, connectRejected: "ウォレットで接続がキャンセルされました。何も変更されていません。", connectFailed: "ウォレットが接続されませんでした。何も変更されていません。もう一度試すか、別のウォレットを選んでください。", payTokensHint: "USDC・SOL・SKRのいずれかで、ご自身のウォレットから支払えます。ウォレットを接続すると選べます。", payTokenSelectedHint: (symbol) => `このリンクは${symbol}での支払いです。ご自身のウォレットから支払います。続けるにはウォレットを接続してください。` },
  balance: { usdc: (amount) => `USDC残高 ${amount}`, loading: "USDC残高を読み取っています…", unavailable: "USDC残高を読み取れませんでした。" },
  amount: { label: "支払うUSDC", helperRaw: (raw) => `${raw} raw単位。USDCは小数点以下6桁です。`, helperSeparator: "小数点には . を使ってください。", errorEmpty: "USDCの数量を入力してください。", errorFormat: "数字と小数点 . だけで入力してください。", errorPrecision: "USDCは小数点以下6桁までです。", errorZero: "0より大きい数量を入力してください。", errorOverBalance: (balance) => `USDC残高 ${balance} を超えています。`, errorOverLimit: (limit) => `1回の取引の上限は ${limit} USDCです。` },
  pay: {
    label: "支払いに使うトークン", balance: (amount) => `残高 ${amount}`, balanceLoading: (symbol) => `${symbol}残高を読み取っています…`, balanceUnavailable: (symbol) => `${symbol}残高を読み取れませんでした。`, solReserve: (reserve) => `ネットワーク手数料とアカウントのデポジットのため、${reserve} SOLはウォレットに残します。`,
    amountLabel: (symbol) => `支払う${symbol}`, helperRaw: (raw, symbol, decimals) => `${raw} raw単位。${symbol}は小数点以下${decimals}桁です。`, errorEmpty: (symbol) => `${symbol}の数量を入力してください。`, errorPrecision: (symbol, decimals) => `${symbol}は小数点以下${decimals}桁までです。`, errorOverBalance: (balance) => `使える額 ${balance} を超えています。`,
    route: (symbol) => `${symbol}からUSDC、USDCから${s}へ: 2つの固定されたMeteora DLMMプールを、ウォレットで承認する1つのトランザクションで通ります。`, firstLeg: "1つ目のプール: 受け取る見込みのUSDC", firstLegValue: (pay, usdc) => `${pay} = ${usdc}`, usdcIn: `${s}プールに入れるUSDC`, usdcInNote: "1つ目のプールのスリッページ後の最低額です。これを超えたUSDCはウォレットに残ります。", limitBasis: (usdc, limit) => `上限の確認: 1つ目のプールはこの数量で ${usdc} USDCを返す見込みです。上限は1回の取引で ${limit} USDCです。`, firstLegFee: (amount) => `プール手数料 ${amount}`, nvdaxPoolFee: `${s}プールの手数料`, nvdaxPoolImpact: `${s}プールの価格インパクト`, accountCreation: `このトランザクションは、必要なトークンアカウント(${s}、USDC、SOLで支払う場合はラップドSOL)も作成することがあります。1回限りのSOLのデポジットはウォレットに表示されます。ラップドSOLのアカウントは同じトランザクション内で閉じられ、そのデポジットは戻ります。`,
    overLimit: { title: "1回の取引の上限を超えています", body: (usdc, limit) => `1つ目のプールはこの数量で ${usdc} USDCを返す見込みで、1回の取引の上限 ${limit} USDCを超えています。数量を減らしてください。署名も送信もされていません。` }, paid: (symbol) => `支払った${symbol}`, solPaidNote: "支払ったSOLはウォレットのSOL残高の変化なので、ネットワーク手数料とアカウントのデポジットを含みます。", usdcLeft: "ウォレットに残ったUSDC",
  },
  action: { preview: "スワップをプレビュー", previewing: "プレビューを準備しています…", approve: "ウォレットで承認", approving: "承認を待っています…", refresh: "プレビューを更新", tryAgain: "もう一度試す", checkAgain: "もう一度確認", startNew: "新しい購入を始める" },
  preview: { heading: "スワップのプレビュー", headingExpired: "期限切れのスワップのプレビュー", youPay: "支払う額", consumed: (amount, raw) => `プールが使う額: ${amount} USDC (raw ${raw})`, expected: "受け取る見込み", minimum: "最低受取額", minimumNote: "これより少なくなる場合、トランザクションは失敗します。", poolFee: "プール手数料", protocolShare: (amount) => `うちプロトコル分 ${amount}`, slippage: "スリッページ許容幅", priceImpact: "価格インパクト", priceImpactBelow: "<0.01%", expires: "プレビューの期限", expiresIn: (time) => `残り ${time}`, expiresAt: (time) => `${time} まで`, expired: "期限切れ", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw単位`, multiplierNote: (time) => `${s}の数量は、${time} にmintから読み取った表示倍率を使っています。`, multiplierUnavailable: `${s}の表示倍率を読み取れませんでした。${s}の数量はraw単位だけで表示しています。`, accountCreation: `このトランザクションは${s}のトークンアカウントも作成します。1回限りのSOLのデポジットはウォレットに表示されます。`, networkFee: "ネットワーク手数料(SOL)はウォレットに表示されます。Bentenはウォレットに1回だけ送信を依頼し、再送信しません。", ready: (time) => `スワップのプレビューができました。期限は ${time} です。`, tenSecondsLeft: "スワップのプレビューはあと10秒で期限切れになります。" },
  trail: { label: "進行状況", reviewed: "プレビューを確認", approveNow: "ウォレットで承認してください", approveBody: "ウォレットで数量を確認し、承認または拒否してください。", approved: "ウォレットで承認", sent: "送信済み", confirmed: "確認済み", finalized: "確定済み", notSeenYet: "まだ確認できていません", stateDone: "完了", stateCurrent: "進行中", stateNotYet: "未完了", keepOpen: "この画面を離れても大丈夫です。Bentenを開いている間は確認を続け、署名は「履歴」に残ります。もう一度購入しないでください。", signature: "署名", waitingApproval: "ウォレットでの承認を待っています。", announceSent: "送信されました。", announceConfirmed: "確認されました。", readingResult: "確定したトランザクションを読み取っています…" },
  status: { sent: "購入を送信しました。確定まで確認を続けます。", view: "表示" },
  result: { heading: "購入結果", receivedLabel: `受け取った${s}`, received: (delta) => `受け取った${s}: ${delta}。`, usdcPaid: "支払ったUSDC", source: "確定したトランザクションのトークン残高から、あなたのウォレットについて算出しています。", explorer: "Solana Explorerで見る", explorerCheck: "Solana Explorerで確認", copySignature: "署名をコピー", unreadable: "トランザクションは確定しましたが、トークン残高を読み取れませんでした。Solana Explorerで確認してください。" },
  sell: {
    heading: "NVDAxを売却してUSDCを受け取る", routeLine: (pool) => `固定ルートは1つで、購入の逆方向です: Meteora DLMM プール ${pool}。承認と送信はご自身のウォレットで行います。Bentenは署名せず、資金を預かりません。`, noScript: "売却にはJavaScriptとウォレットが必要です。", noticeHeading: "売却の前に",
    amountLabel: "売却するNVDAx", balance: (amount) => `NVDAx残高 ${amount}`, balanceLoading: "NVDAx残高を読み取っています…", balanceUnavailable: "NVDAx残高を読み取れませんでした。", limitLoading: "1回あたりの上限を読み取っています…", limitUnavailable: "1回あたりの上限を読み取れませんでした。ページを再読み込みしてください。",
    max: (amount, limit) => `1回の売却は最大 ${amount} NVDAxです（保有量と約 ${limit} USDC 相当のうち小さい方）。`, helperRaw: (raw) => `現在の表示倍率で ${raw} raw単位。NVDAxは小数点以下8桁です。`,
    errorEmpty: "NVDAxの数量を入力してください。", errorPrecision: "NVDAxは小数点以下8桁までです。", errorOverLimit: (max, limit) => `1回の売却で使えるのは最大 ${max} NVDAx（約 ${limit} USDC）です。少ない数量を入力してください。`, errorOverBalance: (balance) => `NVDAx残高 ${balance} を超えています。`, errorNotReady: "残高と1回あたりの上限をまだ読み取っています。",
    youSell: "売却する数量", consumed: (amount, raw) => `プールが使う数量: ${amount} NVDAx (raw ${raw})`, expected: "受け取る見込みのUSDC", minimum: "受け取る最小USDC", minimumNote: "これより少ないUSDCになる場合、トランザクションは失敗します。", accountCreation: "ウォレットはあなたのUSDCトークンアカウントも作成します。少額の返還されるSOLのデポジットが必要です。",
    overLimit: { title: "1回あたりの上限を超えています", body: (usdc, limit) => `この数量では約 ${usdc} USDCを受け取る見込みで、1回あたりの上限 ${limit} USDCを超えます。少ない数量を入力してください。署名も送信もしていません。` },
    routeCheck: { title: "売却を停止しました: 確認に失敗しました", body: "プール、受け取る見込みのUSDC、Pythの参照値のいずれかがBentenの確認を通らなかったため（Pythの参照値が最新でない場合など）、Bentenはトランザクションを作成する前に停止しました。署名も送信もされていません。" },
    termsChanged: { title: "NVDAxの表示倍率が変わりました", body: "数量の換算に使った倍率がすでに適用されていないため、Bentenはトランザクションを作成する前に停止しました。署名も送信もされていません。現在の条件を読み直すので、数量を確認してからプレビューを更新してください。" },
    startNew: "新しい売却を始める", resultHeading: "売却結果", receivedLabel: "受け取ったUSDC", received: (amount) => `受け取ったUSDC: ${amount}。`, soldLabel: "売却したNVDAx",
  },
  error: {
    expired: { title: "このプレビューは期限切れです", body: (time) => `${time} 以降、プールの状況が変わっている可能性があります。署名も送信もされていません。承認する前にプレビューを更新して、現在の条件を確認してください。` },
    rejected: { title: "ウォレットでリクエストを拒否しました", body: "何も送信されていません。期限までこのプレビューをもう一度承認するか、更新できます。" },
    notEnoughSol: { title: "ネットワーク手数料のSOLが足りません", body: (withDeposit) => `このウォレットには、ネットワーク手数料${withDeposit ? "とトークンアカウントのデポジット" : ""}のための少額のSOLが必要です。ウォレットでSOLを追加してから、プレビューを更新してください。署名も送信もされていません。` },
    simulationFailed: { title: "スワップを準備できませんでした", body: "このトランザクションのテスト実行が失敗したため、Bentenはウォレットに承認を求めませんでした。署名も送信もされていません。別の数量を試すか、プレビューを更新してください。" },
    routeCheck: { title: "購入を停止しました: ルートの確認に失敗しました", body: "プールが確認済みのルートと一致しなくなったため、Bentenはトランザクションを作成する前に停止しました。署名も送信もされていません。" },
    relayBusy: { title: "Solanaネットワークへの接続が混み合っています", body: "Bentenは今ネットワークを読み取れませんでした。署名も送信もされていません。数秒待ってから、もう一度試してください。" },
    relayUnavailable: { title: "Solanaネットワークに接続できません", body: "Bentenは今ネットワークを読み取れませんでした。署名も送信もされていません。数秒待ってから、もう一度試してください。" },
    trackingRelay: { title: "状態を確認できませんでした", body: "トランザクションはすでに送信されています。もう一度購入しないでください。少し待ってからもう一度確認するか、Solana Explorerで確認してください。" },
    walletUnknown: { title: "ウォレットがエラーを報告しました", body: "ウォレットがトランザクションを送信したかどうかBentenには判断できないため、このプレビューはもう一度承認できません。もう一度試す前に、ウォレットの履歴とSolana Explorerでこのウォレットを確認してください。新しい購入は新しいプレビューから始まります。", explorer: "Solana Explorerでこのウォレットを確認" },
    earlierRequest: { title: "以前の依頼が送信済みかもしれません", body: "以前の依頼でウォレットがエラーを報告しており、送信されたかどうかBentenには判断できません。この依頼を承認する前に、ウォレットの履歴とSolana Explorerを確認してください。" },
    failedOnChain: { title: "ネットワーク上でトランザクションが失敗しました", body: `処理はされましたが完了しなかったため、${s}は購入されていません。ネットワーク手数料は請求されている場合があります。よくある原因は、プールがスリッページ許容幅を超えて動いたことです。` },
    dropped: { title: "このトランザクションは処理されないまま期限切れになりました", body: "ネットワークはこのトランザクションをもう受け付けないため、完了することはありません。このトランザクションでUSDCはウォレットから出ていません。" },
    notFinalized: { title: "まだ確定していません", body: (minutes) => `Bentenは${minutes}分後に確認を停止しました。トランザクションはまだ確定する可能性があります。確認するまでもう一度購入しないでください。` },
    technicalDetails: "技術的な詳細",
  },
});

const purchaseKo = (s: string): PurchaseCopy => ({
  heading: `${s} 구매`, jumpLink: `${s} 구매`,
  routeLine: (pool) => `고정된 경로 하나: Meteora DLMM 풀 ${pool}. 승인과 전송은 본인의 지갑에서 합니다. Benten은 서명하지 않으며 자금을 보관하지 않습니다.`, poolLabel: "풀 주소", noScript: "구매하려면 JavaScript와 지갑이 필요합니다.",
  copyValue: { copy: "주소 복사", copied: "복사했습니다", unavailable: "복사할 수 없습니다" }, opensNewTab: "(새 탭에서 열림)",
  unsupported: { heading: (symbol) => `${symbol}은(는) 구매할 수 없습니다`, body: "Benten은 정해진 일부 xStocks를 각각 하나의 고정된 풀을 통해 구매하는 것만 지원합니다. 이 토큰의 구매는 제공하지 않습니다." },
  notice: { heading: "구매 전에", usPersons: "발행사는 미국인에게 xStocks를 제공하거나 판매하지 않으며, 인도는 미국인이 아닌 사람에게만 이루어집니다.", noEligibilityCheck: "Benten은 귀하의 구매 자격을 확인하지 않습니다.", noAvailabilityGuarantee: "어느 국가에서든 이용 가능성은 보장되지 않습니다.", notAdvice: "이것은 투자 자문이 아닙니다." },
  wallet: { detecting: "Solana 지갑을 찾는 중…", notDetectedTitle: "Solana 지갑을 찾을 수 없습니다", notDetectedBody: "이 브라우저에 Wallet Standard를 지원하는 Solana 지갑이 없습니다. 지갑을 설치하거나 잠금을 해제한 뒤 이 페이지를 새로고침하세요.", listLabel: "이 브라우저에서 찾은 지갑", connect: "지갑 연결", connectNamed: (name) => `${name} 연결`, connecting: "지갑의 응답을 기다리는 중…", connected: "지갑 연결됨", address: (address) => `주소 ${address}`, disconnect: "연결 해제", unsupported: (name) => `${name}은(는) 이 페이지에서 Solana 메인넷 트랜잭션을 보낼 수 없습니다. 다른 지갑을 선택하세요.`, connectRejected: "지갑에서 연결이 취소되었습니다. 아무것도 바뀌지 않았습니다.", connectFailed: "지갑이 연결되지 않았습니다. 아무것도 바뀌지 않았습니다. 다시 시도하거나 다른 지갑을 선택하세요.", payTokensHint: "USDC, SOL, SKR 중 하나로 본인의 지갑에서 직접 지불할 수 있습니다. 지갑을 연결하면 선택할 수 있습니다.", payTokenSelectedHint: (symbol) => `이 링크는 ${symbol}(으)로 지불합니다. 본인의 지갑에서 지불합니다. 계속하려면 지갑을 연결하세요.` },
  balance: { usdc: (amount) => `USDC 잔액 ${amount}`, loading: "USDC 잔액을 읽는 중…", unavailable: "USDC 잔액을 읽을 수 없습니다." },
  amount: { label: "지불할 USDC", helperRaw: (raw) => `${raw} raw 단위. USDC는 소수점 이하 6자리입니다.`, helperSeparator: "소수점은 . 를 사용하세요.", errorEmpty: "USDC 수량을 입력하세요.", errorFormat: "숫자와 소수점 . 만 입력하세요.", errorPrecision: "USDC는 소수점 이하 6자리까지입니다.", errorZero: "0보다 큰 수량을 입력하세요.", errorOverBalance: (balance) => `USDC 잔액 ${balance}보다 많습니다.`, errorOverLimit: (limit) => `거래 1회 한도는 ${limit} USDC입니다.` },
  pay: {
    label: "결제 토큰", balance: (amount) => `잔액 ${amount}`, balanceLoading: (symbol) => `${symbol} 잔액을 읽는 중...`, balanceUnavailable: (symbol) => `${symbol} 잔액을 읽을 수 없습니다.`, solReserve: (reserve) => `네트워크 수수료와 계정 보증금을 위해 ${reserve} SOL은 지갑에 남겨 둡니다.`,
    amountLabel: (symbol) => `지불할 ${symbol}`, helperRaw: (raw, symbol, decimals) => `${raw} raw 단위. ${symbol}은(는) 소수점 이하 ${decimals}자리입니다.`, errorEmpty: (symbol) => `${symbol} 수량을 입력하세요.`, errorPrecision: (symbol, decimals) => `${symbol}은(는) 소수점 이하 ${decimals}자리까지입니다.`, errorOverBalance: (balance) => `사용할 수 있는 ${balance}을(를) 초과합니다.`,
    route: (symbol) => `${symbol}에서 USDC, USDC에서 ${s}로: 두 개의 고정된 Meteora DLMM 풀을 지갑에서 승인하는 하나의 트랜잭션으로 거칩니다.`, firstLeg: "첫 번째 풀: 예상 USDC", firstLegValue: (pay, usdc) => `${pay} = ${usdc}`, usdcIn: `${s} 풀에 들어가는 USDC`, usdcInNote: "첫 번째 풀의 슬리피지 적용 후 최소 금액입니다. 이를 넘는 USDC는 지갑에 남습니다.", limitBasis: (usdc, limit) => `한도 확인: 첫 번째 풀은 이 수량에 대해 ${usdc} USDC를 돌려줄 것으로 예상합니다. 한도는 거래당 ${limit} USDC입니다.`, firstLegFee: (amount) => `풀 수수료 ${amount}`, nvdaxPoolFee: `${s} 풀 수수료`, nvdaxPoolImpact: `${s} 풀 가격 영향`, accountCreation: `이 트랜잭션은 필요한 토큰 계정(${s}, USDC, SOL로 지불할 때는 래핑된 SOL)도 생성할 수 있습니다. 1회성 SOL 예치금은 지갑에 표시됩니다. 래핑된 SOL 계정은 같은 트랜잭션 안에서 닫히고 예치금은 돌아옵니다.`,
    overLimit: { title: "거래당 한도를 초과했습니다", body: (usdc, limit) => `첫 번째 풀은 이 수량에 대해 ${usdc} USDC를 돌려줄 것으로 예상하며, 이는 거래당 한도 ${limit} USDC를 초과합니다. 더 적은 수량을 입력하세요. 서명되거나 전송된 것은 없습니다.` }, paid: (symbol) => `지불한 ${symbol}`, solPaidNote: "지불한 SOL은 지갑의 SOL 잔액 변화이므로 네트워크 수수료와 계정 보증금이 포함됩니다.", usdcLeft: "지갑에 남은 USDC",
  },
  action: { preview: "스왑 미리보기", previewing: "미리보기를 준비하는 중…", approve: "지갑에서 승인", approving: "승인을 기다리는 중…", refresh: "미리보기 새로고침", tryAgain: "다시 시도", checkAgain: "다시 확인", startNew: "새 구매 시작" },
  preview: { heading: "스왑 미리보기", headingExpired: "만료된 스왑 미리보기", youPay: "지불 금액", consumed: (amount, raw) => `풀이 사용하는 금액: ${amount} USDC (raw ${raw})`, expected: "예상 수령량", minimum: "최소 수령량", minimumNote: "이보다 적게 받게 되면 트랜잭션은 실패합니다.", poolFee: "풀 수수료", protocolShare: (amount) => `프로토콜 몫 ${amount} 포함`, slippage: "슬리피지 허용 범위", priceImpact: "가격 영향", priceImpactBelow: "<0.01%", expires: "미리보기 만료", expiresIn: (time) => `${time} 남음`, expiresAt: (time) => `${time}까지`, expired: "만료됨", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw 단위`, multiplierNote: (time) => `${s} 수량은 ${time}에 mint에서 읽은 표시 배율을 사용합니다.`, multiplierUnavailable: `${s} 표시 배율을 읽을 수 없습니다. ${s} 수량은 raw 단위로만 표시합니다.`, accountCreation: `이 트랜잭션은 ${s} 토큰 계정도 생성합니다. 1회성 SOL 예치금은 지갑에 표시됩니다.`, networkFee: "네트워크 수수료(SOL)는 지갑에 표시됩니다. Benten은 지갑에 한 번만 전송을 요청하며 다시 보내지 않습니다.", ready: (time) => `스왑 미리보기가 준비되었습니다. ${time}에 만료됩니다.`, tenSecondsLeft: "스왑 미리보기가 10초 후 만료됩니다." },
  trail: { label: "진행 상황", reviewed: "미리보기 확인", approveNow: "지갑에서 승인하세요", approveBody: "지갑에서 수량을 확인한 뒤 승인하거나 거부하세요.", approved: "지갑에서 승인됨", sent: "전송됨", confirmed: "확인됨", finalized: "최종 확정됨", notSeenYet: "아직 확인되지 않음", stateDone: "완료", stateCurrent: "진행 중", stateNotYet: "대기", keepOpen: "이 화면을 떠나도 됩니다. Benten이 열려 있는 동안 계속 확인하며, 서명은 활동에 남습니다. 다시 구매하지 마세요.", signature: "서명", waitingApproval: "지갑에서 승인을 기다리고 있습니다.", announceSent: "전송되었습니다.", announceConfirmed: "확인되었습니다.", readingResult: "최종 확정된 트랜잭션을 읽는 중…" },
  status: { sent: "구매를 전송했습니다. 최종 확정될 때까지 확인합니다.", view: "보기" },
  result: { heading: "구매 결과", receivedLabel: `받은 ${s}`, received: (delta) => `받은 ${s}: ${delta}.`, usdcPaid: "지불한 USDC", source: "최종 확정된 트랜잭션의 토큰 잔액에서 귀하의 지갑 기준으로 측정했습니다.", explorer: "Solana Explorer에서 보기", explorerCheck: "Solana Explorer에서 확인", copySignature: "서명 복사", unreadable: "트랜잭션은 최종 확정되었지만 토큰 잔액을 읽을 수 없습니다. Solana Explorer에서 확인하세요." },
  sell: {
    heading: "NVDAx를 판매하고 USDC 받기", routeLine: (pool) => `고정된 경로 하나, 구매의 반대 방향: Meteora DLMM 풀 ${pool}. 승인과 전송은 본인의 지갑에서 합니다. Benten은 서명하지 않으며 자금을 보관하지 않습니다.`, noScript: "판매하려면 JavaScript와 지갑이 필요합니다.", noticeHeading: "판매 전에",
    amountLabel: "판매할 NVDAx", balance: (amount) => `NVDAx 잔액 ${amount}`, balanceLoading: "NVDAx 잔액을 읽는 중…", balanceUnavailable: "NVDAx 잔액을 읽을 수 없습니다.", limitLoading: "1회 한도를 읽는 중…", limitUnavailable: "1회 한도를 읽을 수 없습니다. 페이지를 새로고침하세요.",
    max: (amount, limit) => `1회 판매는 최대 ${amount} NVDAx입니다(보유량과 약 ${limit} USDC 상당 중 작은 쪽).`, helperRaw: (raw) => `현재 표시 배율 기준 ${raw} raw 단위. NVDAx는 소수점 이하 8자리입니다.`,
    errorEmpty: "NVDAx 수량을 입력하세요.", errorPrecision: "NVDAx는 소수점 이하 최대 8자리입니다.", errorOverLimit: (max, limit) => `1회 판매에 사용할 수 있는 수량은 최대 ${max} NVDAx(약 ${limit} USDC)입니다. 더 적은 수량을 입력하세요.`, errorOverBalance: (balance) => `NVDAx 잔액 ${balance}을(를) 초과합니다.`, errorNotReady: "잔액과 1회 한도를 아직 읽는 중입니다.",
    youSell: "판매 수량", consumed: (amount, raw) => `풀이 사용하는 수량: ${amount} NVDAx (raw ${raw})`, expected: "받을 것으로 예상되는 USDC", minimum: "받는 최소 USDC", minimumNote: "이보다 적은 USDC가 되면 트랜잭션은 실패합니다.", accountCreation: "지갑이 USDC 토큰 계정도 만듭니다. 돌려받는 소액의 SOL 예치금이 필요합니다.",
    overLimit: { title: "1회 한도 초과", body: (usdc, limit) => `이 수량으로는 약 ${usdc} USDC를 받을 것으로 예상되어 1회 한도 ${limit} USDC를 초과합니다. 더 적은 수량을 입력하세요. 서명하거나 전송한 것은 없습니다.` },
    routeCheck: { title: "판매 중지: 확인 실패", body: "풀, 받을 것으로 예상되는 USDC 또는 Pyth 참조 값이 Benten의 확인을 통과하지 못해(예: Pyth 참조 값이 최신이 아닌 경우) Benten은 트랜잭션을 만들기 전에 중지했습니다. 서명되거나 전송된 것은 없습니다." },
    termsChanged: { title: "NVDAx 표시 배율이 바뀌었습니다", body: "수량 환산에 사용한 배율이 더 이상 적용되지 않아 Benten은 트랜잭션을 만들기 전에 중지했습니다. 서명되거나 전송된 것은 없습니다. 현재 조건을 다시 읽으니 수량을 확인한 뒤 미리보기를 새로 고치세요." },
    startNew: "새 판매 시작", resultHeading: "판매 결과", receivedLabel: "받은 USDC", received: (amount) => `받은 USDC: ${amount}.`, soldLabel: "판매한 NVDAx",
  },
  error: {
    expired: { title: "이 미리보기는 만료되었습니다", body: (time) => `${time} 이후 풀 상황이 바뀌었을 수 있습니다. 서명되거나 전송된 것은 없습니다. 승인하기 전에 미리보기를 새로고침해 현재 조건을 확인하세요.` },
    rejected: { title: "지갑에서 요청을 거부했습니다", body: "아무것도 전송되지 않았습니다. 만료 전까지 이 미리보기를 다시 승인하거나 새로고침할 수 있습니다." },
    notEnoughSol: { title: "네트워크 수수료에 필요한 SOL이 부족합니다", body: (withDeposit) => `이 지갑에는 네트워크 수수료${withDeposit ? "와 토큰 계정 예치금" : ""}에 쓸 소량의 SOL이 필요합니다. 지갑에 SOL을 추가한 뒤 미리보기를 새로고침하세요. 서명되거나 전송된 것은 없습니다.` },
    simulationFailed: { title: "스왑을 준비할 수 없습니다", body: "이 트랜잭션의 테스트 실행이 실패하여 Benten은 지갑에 승인을 요청하지 않았습니다. 서명되거나 전송된 것은 없습니다. 다른 수량을 시도하거나 미리보기를 새로고침하세요." },
    routeCheck: { title: "구매 중지: 경로 확인 실패", body: "풀이 더 이상 확인된 경로와 일치하지 않아 Benten은 트랜잭션을 만들기 전에 중지했습니다. 서명되거나 전송된 것은 없습니다." },
    relayBusy: { title: "Solana 네트워크 연결이 혼잡합니다", body: "Benten이 지금 네트워크를 읽지 못했습니다. 서명되거나 전송된 것은 없습니다. 몇 초 기다린 뒤 다시 시도하세요." },
    relayUnavailable: { title: "Solana 네트워크에 연결할 수 없습니다", body: "Benten이 지금 네트워크를 읽지 못했습니다. 서명되거나 전송된 것은 없습니다. 몇 초 기다린 뒤 다시 시도하세요." },
    trackingRelay: { title: "상태를 확인할 수 없습니다", body: "트랜잭션은 이미 전송되었습니다. 다시 구매하지 마세요. 잠시 후 다시 확인하거나 Solana Explorer에서 확인하세요." },
    walletUnknown: { title: "지갑에서 오류가 보고되었습니다", body: "지갑이 트랜잭션을 전송했는지 Benten은 알 수 없으므로 이 미리보기는 다시 승인할 수 없습니다. 다시 시도하기 전에 지갑의 활동 내역과 Solana Explorer에서 이 지갑을 확인하세요. 새 구매는 새 미리보기에서 시작됩니다.", explorer: "Solana Explorer에서 이 지갑 확인" },
    earlierRequest: { title: "이전 요청이 이미 전송되었을 수 있습니다", body: "이전 요청에서 지갑이 오류를 보고했으며, 전송되었는지 Benten은 알 수 없습니다. 이 요청을 승인하기 전에 지갑의 활동 내역과 Solana Explorer를 확인하세요." },
    failedOnChain: { title: "네트워크에서 트랜잭션이 실패했습니다", body: `트랜잭션은 처리되었지만 완료되지 않아 ${s}는 구매되지 않았습니다. 네트워크 수수료는 청구되었을 수 있습니다. 흔한 원인은 풀이 슬리피지 허용 범위를 넘어 움직인 경우입니다.` },
    dropped: { title: "이 트랜잭션은 처리되지 않고 만료되었습니다", body: "네트워크가 더 이상 이 트랜잭션을 받지 않으므로 완료되지 않습니다. 이 트랜잭션으로 지갑에서 USDC가 나가지 않았습니다." },
    notFinalized: { title: "아직 최종 확정되지 않았습니다", body: (minutes) => `Benten은 ${minutes}분 후 확인을 중단했습니다. 트랜잭션은 아직 최종 확정될 수 있습니다. 확인하기 전에는 다시 구매하지 마세요.` },
    technicalDetails: "기술 세부 정보",
  },
});

const purchaseZhHans = (s: string): PurchaseCopy => ({
  heading: `购买 ${s}`, jumpLink: `购买 ${s}`,
  routeLine: (pool) => `唯一的固定路径：Meteora DLMM 池 ${pool}。你在自己的钱包中批准并发送。Benten 从不签名，也不持有资金。`, poolLabel: "池地址", noScript: "购买需要 JavaScript 和钱包。",
  copyValue: { copy: "复制地址", copied: "已复制", unavailable: "无法复制" }, opensNewTab: "（在新标签页中打开）",
  unsupported: { heading: (symbol) => `${symbol} 不提供购买`, body: "Benten 仅支持通过各自的一个固定池购买指定的几种 xStocks，不提供此代币的购买。" },
  notice: { heading: "购买之前", usPersons: "发行人不向美国人士发售或出售 xStocks，只能交付给非美国人士。", noEligibilityCheck: "Benten 不会核实你是否具备购买资格。", noAvailabilityGuarantee: "不保证在任何国家或地区均可使用。", notAdvice: "这不是投资建议。" },
  wallet: { detecting: "正在查找 Solana 钱包…", notDetectedTitle: "未找到 Solana 钱包", notDetectedBody: "此浏览器中没有支持 Wallet Standard 的 Solana 钱包。请安装或解锁钱包，然后重新加载此页面。", listLabel: "在此浏览器中找到的钱包", connect: "连接钱包", connectNamed: (name) => `连接 ${name}`, connecting: "正在等待钱包响应…", connected: "钱包已连接", address: (address) => `地址 ${address}`, disconnect: "断开连接", unsupported: (name) => `${name} 无法从此页面发送 Solana 主网交易。请选择其他钱包。`, connectRejected: "已在钱包中取消连接。未做任何更改。", connectFailed: "钱包未能连接。未做任何更改。请重试或选择其他钱包。", payTokensHint: "可用 USDC、SOL 或 SKR 从你自己的钱包支付。连接钱包即可选择。", payTokenSelectedHint: (symbol) => `此链接使用 ${symbol} 支付，从你自己的钱包支付。请连接钱包以继续。` },
  balance: { usdc: (amount) => `USDC 余额 ${amount}`, loading: "正在读取 USDC 余额…", unavailable: "无法读取 USDC 余额。" },
  amount: { label: "要支付的 USDC", helperRaw: (raw) => `${raw} 个 raw 单位。USDC 有 6 位小数。`, helperSeparator: "请使用 . 作为小数点。", errorEmpty: "请输入 USDC 数量。", errorFormat: "请只输入数字，并使用 . 作为小数点。", errorPrecision: "USDC 最多 6 位小数。", errorZero: "请输入大于零的数量。", errorOverBalance: (balance) => `超过了你的 USDC 余额 ${balance}。`, errorOverLimit: (limit) => `每笔交易的上限为 ${limit} USDC。` },
  pay: {
    label: "支付代币", balance: (amount) => `余额 ${amount}`, balanceLoading: (symbol) => `正在读取你的 ${symbol} 余额…`, balanceUnavailable: (symbol) => `无法读取你的 ${symbol} 余额。`, solReserve: (reserve) => `为支付网络费用和账户押金，${reserve} SOL 会留在你的钱包中。`,
    amountLabel: (symbol) => `支付的 ${symbol}`, helperRaw: (raw, symbol, decimals) => `${raw} 个原始单位。${symbol} 使用 ${decimals} 位小数。`, errorEmpty: (symbol) => `请输入 ${symbol} 数量。`, errorPrecision: (symbol, decimals) => `${symbol} 最多 ${decimals} 位小数。`, errorOverBalance: (balance) => `超过了你可用的 ${balance}。`,
    route: (symbol) => `${symbol} 兑换为 USDC，再兑换为 ${s}：经过两个固定的 Meteora DLMM 池，在你钱包中批准的同一笔交易内完成。`, firstLeg: "第一个池：预计收到的 USDC", firstLegValue: (pay, usdc) => `${pay} = ${usdc}`, usdcIn: `进入 ${s} 池的 USDC`, usdcInNote: "第一个池扣除滑点后的最低数额。超出部分的 USDC 留在你的钱包中。", limitBasis: (usdc, limit) => `上限核对：第一个池预计为此数量返回 ${usdc} USDC。每笔交易上限为 ${limit} USDC。`, firstLegFee: (amount) => `池手续费 ${amount}`, nvdaxPoolFee: `${s} 池手续费`, nvdaxPoolImpact: `${s} 池价格影响`, accountCreation: `此交易可能还会创建所需的代币账户：${s}、USDC，以及用 SOL 支付时的包装 SOL。钱包会显示一次性的 SOL 押金；包装 SOL 账户会在同一笔交易内关闭，其押金会退回。`,
    overLimit: { title: "超过每笔交易上限", body: (usdc, limit) => `第一个池预计为此数量返回 ${usdc} USDC，超过每笔交易 ${limit} USDC 的上限。请输入更小的数量。没有签名或发送任何内容。` }, paid: (symbol) => `支付的 ${symbol}`, solPaidNote: "支付的 SOL 是你钱包 SOL 余额的变化，因此包含网络费用和账户押金。", usdcLeft: "留在钱包中的 USDC",
  },
  action: { preview: "预览兑换", previewing: "正在准备预览…", approve: "在钱包中批准", approving: "正在等待批准…", refresh: "刷新预览", tryAgain: "重试", checkAgain: "再次检查", startNew: "开始新的购买" },
  preview: { heading: "兑换预览", headingExpired: "已过期的兑换预览", youPay: "你支付", consumed: (amount, raw) => `池实际使用：${amount} USDC（raw ${raw}）`, expected: "预计收到", minimum: "最少收到", minimumNote: "如果少于此数量，交易将失败，而不会让你收到更少。", poolFee: "池手续费", protocolShare: (amount) => `含协议分成 ${amount}`, slippage: "滑点容差", priceImpact: "价格影响", priceImpactBelow: "<0.01%", expires: "预览有效期", expiresIn: (time) => `剩余 ${time}`, expiresAt: (time) => `至 ${time}`, expired: "已过期", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw 单位`, multiplierNote: (time) => `${s} 数量使用 ${time} 从 mint 读取的显示倍数。`, multiplierUnavailable: `无法读取 ${s} 的显示倍数。${s} 数量仅以 raw 单位显示。`, accountCreation: `此交易还会创建你的 ${s} 代币账户。钱包会显示一次性的 SOL 押金。`, networkFee: "网络手续费（SOL）会显示在钱包中。Benten 只请求钱包发送一次，绝不重新发送。", ready: (time) => `兑换预览已就绪，将于 ${time} 过期。`, tenSecondsLeft: "兑换预览将在 10 秒后过期。" },
  trail: { label: "进度", reviewed: "已查看预览", approveNow: "请在钱包中批准", approveBody: "在钱包中核对数量，然后批准或拒绝。", approved: "已在钱包中批准", sent: "已发送", confirmed: "已确认", finalized: "已最终确定", notSeenYet: "尚未看到", stateDone: "已完成", stateCurrent: "进行中", stateNotYet: "未开始", keepOpen: "你可以离开此画面。Benten 打开期间会持续检查，签名会保留在“记录”中。请勿再次购买。", signature: "签名", waitingApproval: "正在等待你在钱包中批准。", announceSent: "已发送。", announceConfirmed: "已确认。", readingResult: "正在读取已最终确定的交易…" },
  status: { sent: "已发送购买。正在持续检查，直至最终确定。", view: "查看" },
  result: { heading: "购买结果", receivedLabel: `收到的 ${s}`, received: (delta) => `收到的 ${s}：${delta}。`, usdcPaid: "支付的 USDC", source: "根据已最终确定交易中你的钱包的代币余额计算。", explorer: "在 Solana Explorer 查看", explorerCheck: "在 Solana Explorer 核对", copySignature: "复制签名", unreadable: "交易已最终确定，但无法读取其代币余额。请在 Solana Explorer 核对。" },
  sell: {
    heading: "卖出 NVDAx 换取 USDC", routeLine: (pool) => `一条固定路线，与购买方向相反：Meteora DLMM 池 ${pool}。在你自己的钱包中批准并发送。Benten 从不签名，也不持有资金。`, noScript: "卖出需要 JavaScript 和钱包。", noticeHeading: "卖出之前",
    amountLabel: "要卖出的 NVDAx", balance: (amount) => `NVDAx 余额 ${amount}`, balanceLoading: "正在读取你的 NVDAx 余额…", balanceUnavailable: "无法读取你的 NVDAx 余额。", limitLoading: "正在读取每次卖出的上限…", limitUnavailable: "无法读取每次卖出的上限。请重新加载此页面。",
    max: (amount, limit) => `每次最多卖出 ${amount} NVDAx（取你的余额与约 ${limit} USDC 等值中较小者）。`, helperRaw: (raw) => `按当前显示倍数为 ${raw} raw 单位。NVDAx 使用 8 位小数。`,
    errorEmpty: "请输入 NVDAx 数量。", errorPrecision: "NVDAx 最多有 8 位小数。", errorOverLimit: (max, limit) => `每次卖出最多可使用 ${max} NVDAx（约 ${limit} USDC）。请输入较小的数量。`, errorOverBalance: (balance) => `超过了你的 NVDAx 余额 ${balance}。`, errorNotReady: "仍在读取你的余额和每次卖出的上限。",
    youSell: "你卖出", consumed: (amount, raw) => `池使用的数量：${amount} NVDAx（raw ${raw}）`, expected: "预计收到的 USDC", minimum: "你至少收到的 USDC", minimumNote: "如果少于此数量的 USDC，交易将失败。", accountCreation: "你的钱包还会创建你的 USDC 代币账户，需要少量可退还的 SOL 押金。",
    overLimit: { title: "超过每次卖出的上限", body: (usdc, limit) => `按此数量，池预计给出 ${usdc} USDC，超过每次 ${limit} USDC 的上限。请输入较小的数量。未签名也未发送任何内容。` },
    routeCheck: { title: "卖出已暂停：检查未通过", body: "池、预计收到的 USDC 或 Pyth 参考值未通过 Benten 的检查（例如 Pyth 参考值不是最新的），因此 Benten 在创建交易之前停止。未签名也未发送任何内容。" },
    termsChanged: { title: "NVDAx 显示倍数已变化", body: "用于换算你输入数量的倍数已不再生效，因此 Benten 在创建交易之前停止。未签名也未发送任何内容。Benten 会重新读取当前条件，请确认数量后刷新预览。" },
    startNew: "开始新的卖出", resultHeading: "卖出结果", receivedLabel: "收到的 USDC", received: (amount) => `收到的 USDC：${amount}。`, soldLabel: "卖出的 NVDAx",
  },
  error: {
    expired: { title: "此预览已过期", body: (time) => `自 ${time} 以来，池的状况可能已发生变化。未签名也未发送任何内容。请在批准前刷新预览，查看当前条件。` },
    rejected: { title: "你在钱包中拒绝了请求", body: "未发送任何内容。在过期前你可以再次批准此预览，或刷新它。" },
    notEnoughSol: { title: "SOL 不足以支付网络手续费", body: (withDeposit) => `此钱包需要少量 SOL 用于网络手续费${withDeposit ? "和代币账户押金" : ""}。请在钱包中添加 SOL，然后刷新预览。未签名也未发送任何内容。` },
    simulationFailed: { title: "无法准备此兑换", body: "此交易的测试运行失败，因此 Benten 没有请求钱包批准。未签名也未发送任何内容。请尝试其他数量或刷新预览。" },
    routeCheck: { title: "购买已暂停：路径检查失败", body: "该池已不再与已验证的路径一致，因此 Benten 在创建交易之前停止。未签名也未发送任何内容。" },
    relayBusy: { title: "Solana 网络连接繁忙", body: "Benten 暂时无法读取网络。未签名也未发送任何内容。请等待几秒后重试。" },
    relayUnavailable: { title: "Solana 网络连接不可用", body: "Benten 暂时无法读取网络。未签名也未发送任何内容。请等待几秒后重试。" },
    trackingRelay: { title: "Benten 无法检查状态", body: "你的交易已经发送。请勿再次购买。请稍后再次检查，或在 Solana Explorer 核对。" },
    walletUnknown: { title: "你的钱包报告了错误", body: "Benten 无法判断你的钱包是否已发送该交易，因此无法再次批准此预览。再次尝试之前，请先查看钱包的活动记录，并在 Solana Explorer 核对此钱包。新的购买将从新的预览开始。", explorer: "在 Solana Explorer 核对此钱包" },
    earlierRequest: { title: "之前的请求可能已被发送", body: "你的钱包对之前的一个请求报告了错误，Benten 无法判断它是否已发送。批准本次请求之前，请先查看钱包的活动记录和 Solana Explorer。" },
    failedOnChain: { title: "交易在网络上失败", body: `交易已被处理但未完成，因此没有购买任何 ${s}。网络手续费可能仍已扣除。常见原因是池的变动超出了你的滑点容差。` },
    dropped: { title: "此交易未被处理即已过期", body: "网络已不再接受此交易，因此它不会完成。没有 USDC 因此交易离开你的钱包。" },
    notFinalized: { title: "尚未最终确定", body: (minutes) => `Benten 在 ${minutes} 分钟后停止检查。交易仍可能最终确定。在核对之前请勿再次购买。` },
    technicalDetails: "技术细节",
  },
});

const purchaseZhHant = (s: string): PurchaseCopy => ({
  heading: `購買 ${s}`, jumpLink: `購買 ${s}`,
  routeLine: (pool) => `唯一的固定路徑：Meteora DLMM 池 ${pool}。你在自己的錢包中核准並傳送。Benten 從不簽署，也不持有資金。`, poolLabel: "池地址", noScript: "購買需要 JavaScript 與錢包。",
  copyValue: { copy: "複製位址", copied: "已複製", unavailable: "無法複製" }, opensNewTab: "（在新分頁中開啟）",
  unsupported: { heading: (symbol) => `${symbol} 不提供購買`, body: "Benten 僅支援透過各自的一個固定池購買指定的幾種 xStocks，不提供此代幣的購買。" },
  notice: { heading: "購買之前", usPersons: "發行人不向美國人士發售或出售 xStocks，只能交付給非美國人士。", noEligibilityCheck: "Benten 不會核實你是否具備購買資格。", noAvailabilityGuarantee: "不保證在任何國家或地區皆可使用。", notAdvice: "這不是投資建議。" },
  wallet: { detecting: "正在尋找 Solana 錢包…", notDetectedTitle: "找不到 Solana 錢包", notDetectedBody: "此瀏覽器中沒有支援 Wallet Standard 的 Solana 錢包。請安裝或解鎖錢包，然後重新載入此頁面。", listLabel: "在此瀏覽器中找到的錢包", connect: "連接錢包", connectNamed: (name) => `連接 ${name}`, connecting: "正在等待錢包回應…", connected: "錢包已連接", address: (address) => `地址 ${address}`, disconnect: "中斷連接", unsupported: (name) => `${name} 無法從此頁面傳送 Solana 主網交易。請選擇其他錢包。`, connectRejected: "已在錢包中取消連接。未做任何變更。", connectFailed: "錢包未能連接。未做任何變更。請重試或選擇其他錢包。", payTokensHint: "可用 USDC、SOL 或 SKR 從你自己的錢包支付。連接錢包即可選擇。", payTokenSelectedHint: (symbol) => `此連結使用 ${symbol} 支付，從你自己的錢包支付。請連接錢包以繼續。` },
  balance: { usdc: (amount) => `USDC 餘額 ${amount}`, loading: "正在讀取 USDC 餘額…", unavailable: "無法讀取 USDC 餘額。" },
  amount: { label: "要支付的 USDC", helperRaw: (raw) => `${raw} 個 raw 單位。USDC 有 6 位小數。`, helperSeparator: "請使用 . 作為小數點。", errorEmpty: "請輸入 USDC 數量。", errorFormat: "請只輸入數字，並使用 . 作為小數點。", errorPrecision: "USDC 最多 6 位小數。", errorZero: "請輸入大於零的數量。", errorOverBalance: (balance) => `超過了你的 USDC 餘額 ${balance}。`, errorOverLimit: (limit) => `每筆交易的上限為 ${limit} USDC。` },
  pay: {
    label: "支付代幣", balance: (amount) => `餘額 ${amount}`, balanceLoading: (symbol) => `正在讀取你的 ${symbol} 餘額…`, balanceUnavailable: (symbol) => `無法讀取你的 ${symbol} 餘額。`, solReserve: (reserve) => `為支付網路費用和帳戶押金，${reserve} SOL 會留在你的錢包中。`,
    amountLabel: (symbol) => `支付的 ${symbol}`, helperRaw: (raw, symbol, decimals) => `${raw} 個原始單位。${symbol} 使用 ${decimals} 位小數。`, errorEmpty: (symbol) => `請輸入 ${symbol} 數量。`, errorPrecision: (symbol, decimals) => `${symbol} 最多 ${decimals} 位小數。`, errorOverBalance: (balance) => `超過了你可用的 ${balance}。`,
    route: (symbol) => `${symbol} 兌換為 USDC，再兌換為 ${s}：經過兩個固定的 Meteora DLMM 池，在你錢包中核准的同一筆交易內完成。`, firstLeg: "第一個池：預計收到的 USDC", firstLegValue: (pay, usdc) => `${pay} = ${usdc}`, usdcIn: `進入 ${s} 池的 USDC`, usdcInNote: "第一個池扣除滑價後的最低數額。超出部分的 USDC 留在你的錢包中。", limitBasis: (usdc, limit) => `上限核對：第一個池預計為此數量返回 ${usdc} USDC。每筆交易上限為 ${limit} USDC。`, firstLegFee: (amount) => `池手續費 ${amount}`, nvdaxPoolFee: `${s} 池手續費`, nvdaxPoolImpact: `${s} 池價格影響`, accountCreation: `此交易可能還會建立所需的代幣帳戶：${s}、USDC，以及用 SOL 支付時的包裝 SOL。錢包會顯示一次性的 SOL 押金；包裝 SOL 帳戶會在同一筆交易內關閉，其押金會退回。`,
    overLimit: { title: "超過每筆交易上限", body: (usdc, limit) => `第一個池預計為此數量返回 ${usdc} USDC，超過每筆交易 ${limit} USDC 的上限。請輸入更小的數量。沒有簽署或傳送任何內容。` }, paid: (symbol) => `支付的 ${symbol}`, solPaidNote: "支付的 SOL 是你錢包 SOL 餘額的變化，因此包含網路費用和帳戶押金。", usdcLeft: "留在錢包中的 USDC",
  },
  action: { preview: "預覽兌換", previewing: "正在準備預覽…", approve: "在錢包中核准", approving: "正在等待核准…", refresh: "重新整理預覽", tryAgain: "重試", checkAgain: "再次檢查", startNew: "開始新的購買" },
  preview: { heading: "兌換預覽", headingExpired: "已過期的兌換預覽", youPay: "你支付", consumed: (amount, raw) => `池實際使用：${amount} USDC（raw ${raw}）`, expected: "預計收到", minimum: "最少收到", minimumNote: "如果少於此數量，交易將失敗，而不會讓你收到更少。", poolFee: "池手續費", protocolShare: (amount) => `含協議分成 ${amount}`, slippage: "滑價容差", priceImpact: "價格影響", priceImpactBelow: "<0.01%", expires: "預覽有效期", expiresIn: (time) => `剩餘 ${time}`, expiresAt: (time) => `至 ${time}`, expired: "已過期", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw 單位`, multiplierNote: (time) => `${s} 數量使用 ${time} 從 mint 讀取的顯示倍數。`, multiplierUnavailable: `無法讀取 ${s} 的顯示倍數。${s} 數量僅以 raw 單位顯示。`, accountCreation: `此交易還會建立你的 ${s} 代幣帳戶。錢包會顯示一次性的 SOL 押金。`, networkFee: "網路手續費（SOL）會顯示在錢包中。Benten 只請求錢包傳送一次，絕不重新傳送。", ready: (time) => `兌換預覽已就緒，將於 ${time} 過期。`, tenSecondsLeft: "兌換預覽將在 10 秒後過期。" },
  trail: { label: "進度", reviewed: "已查看預覽", approveNow: "請在錢包中核准", approveBody: "在錢包中核對數量，然後核准或拒絕。", approved: "已在錢包中核准", sent: "已傳送", confirmed: "已確認", finalized: "已最終確定", notSeenYet: "尚未看到", stateDone: "已完成", stateCurrent: "進行中", stateNotYet: "未開始", keepOpen: "你可以離開此畫面。Benten 開啟期間會持續檢查，簽章會保留在「紀錄」中。請勿再次購買。", signature: "簽章", waitingApproval: "正在等待你在錢包中核准。", announceSent: "已傳送。", announceConfirmed: "已確認。", readingResult: "正在讀取已最終確定的交易…" },
  status: { sent: "已傳送購買。正在持續檢查，直至最終確定。", view: "查看" },
  result: { heading: "購買結果", receivedLabel: `收到的 ${s}`, received: (delta) => `收到的 ${s}：${delta}。`, usdcPaid: "支付的 USDC", source: "根據已最終確定交易中你的錢包的代幣餘額計算。", explorer: "在 Solana Explorer 查看", explorerCheck: "在 Solana Explorer 核對", copySignature: "複製簽章", unreadable: "交易已最終確定，但無法讀取其代幣餘額。請在 Solana Explorer 核對。" },
  sell: {
    heading: "賣出 NVDAx 換取 USDC", routeLine: (pool) => `一條固定路線，與購買方向相反：Meteora DLMM 池 ${pool}。在你自己的錢包中核准並傳送。Benten 從不簽署，也不持有資金。`, noScript: "賣出需要 JavaScript 和錢包。", noticeHeading: "賣出之前",
    amountLabel: "要賣出的 NVDAx", balance: (amount) => `NVDAx 餘額 ${amount}`, balanceLoading: "正在讀取你的 NVDAx 餘額…", balanceUnavailable: "無法讀取你的 NVDAx 餘額。", limitLoading: "正在讀取每次賣出的上限…", limitUnavailable: "無法讀取每次賣出的上限。請重新載入此頁面。",
    max: (amount, limit) => `每次最多賣出 ${amount} NVDAx（取你的餘額與約 ${limit} USDC 等值中較小者）。`, helperRaw: (raw) => `依目前顯示倍數為 ${raw} raw 單位。NVDAx 使用 8 位小數。`,
    errorEmpty: "請輸入 NVDAx 數量。", errorPrecision: "NVDAx 最多有 8 位小數。", errorOverLimit: (max, limit) => `每次賣出最多可使用 ${max} NVDAx（約 ${limit} USDC）。請輸入較小的數量。`, errorOverBalance: (balance) => `超過你的 NVDAx 餘額 ${balance}。`, errorNotReady: "仍在讀取你的餘額和每次賣出的上限。",
    youSell: "你賣出", consumed: (amount, raw) => `池使用的數量：${amount} NVDAx（raw ${raw}）`, expected: "預計收到的 USDC", minimum: "你至少收到的 USDC", minimumNote: "如果少於此數量的 USDC，交易將失敗。", accountCreation: "你的錢包也會建立你的 USDC 代幣帳戶，需要少量可退還的 SOL 押金。",
    overLimit: { title: "超過每次賣出的上限", body: (usdc, limit) => `依此數量，池預計給出 ${usdc} USDC，超過每次 ${limit} USDC 的上限。請輸入較小的數量。未簽署也未傳送任何內容。` },
    routeCheck: { title: "賣出已暫停：檢查未通過", body: "池、預計收到的 USDC 或 Pyth 參考值未通過 Benten 的檢查（例如 Pyth 參考值不是最新的），因此 Benten 在建立交易之前停止。未簽署也未傳送任何內容。" },
    termsChanged: { title: "NVDAx 顯示倍數已變更", body: "用於換算你輸入數量的倍數已不再生效，因此 Benten 在建立交易之前停止。未簽署也未傳送任何內容。Benten 會重新讀取目前條件，請確認數量後重新整理預覽。" },
    startNew: "開始新的賣出", resultHeading: "賣出結果", receivedLabel: "收到的 USDC", received: (amount) => `收到的 USDC：${amount}。`, soldLabel: "賣出的 NVDAx",
  },
  error: {
    expired: { title: "此預覽已過期", body: (time) => `自 ${time} 以來，池的狀況可能已改變。未簽署也未傳送任何內容。請在核准前重新整理預覽，查看目前條件。` },
    rejected: { title: "你在錢包中拒絕了請求", body: "未傳送任何內容。在過期前你可以再次核准此預覽，或重新整理它。" },
    notEnoughSol: { title: "SOL 不足以支付網路手續費", body: (withDeposit) => `此錢包需要少量 SOL 用於網路手續費${withDeposit ? "和代幣帳戶押金" : ""}。請在錢包中加入 SOL，然後重新整理預覽。未簽署也未傳送任何內容。` },
    simulationFailed: { title: "無法準備此兌換", body: "此交易的測試執行失敗，因此 Benten 沒有請求錢包核准。未簽署也未傳送任何內容。請嘗試其他數量或重新整理預覽。" },
    routeCheck: { title: "購買已暫停：路徑檢查失敗", body: "該池已不再與已驗證的路徑一致，因此 Benten 在建立交易之前停止。未簽署也未傳送任何內容。" },
    relayBusy: { title: "Solana 網路連線繁忙", body: "Benten 暫時無法讀取網路。未簽署也未傳送任何內容。請等待幾秒後重試。" },
    relayUnavailable: { title: "Solana 網路連線無法使用", body: "Benten 暫時無法讀取網路。未簽署也未傳送任何內容。請等待幾秒後重試。" },
    trackingRelay: { title: "Benten 無法檢查狀態", body: "你的交易已經傳送。請勿再次購買。請稍後再次檢查，或在 Solana Explorer 核對。" },
    walletUnknown: { title: "你的錢包回報了錯誤", body: "Benten 無法判斷你的錢包是否已傳送該交易，因此無法再次核准此預覽。再次嘗試之前，請先查看錢包的活動紀錄，並在 Solana Explorer 核對此錢包。新的購買將從新的預覽開始。", explorer: "在 Solana Explorer 核對此錢包" },
    earlierRequest: { title: "先前的請求可能已被傳送", body: "你的錢包對先前的一個請求回報了錯誤，Benten 無法判斷它是否已傳送。核准本次請求之前，請先查看錢包的活動紀錄和 Solana Explorer。" },
    failedOnChain: { title: "交易在網路上失敗", body: `交易已被處理但未完成，因此沒有購買任何 ${s}。網路手續費可能仍已扣除。常見原因是池的變動超出了你的滑價容差。` },
    dropped: { title: "此交易未被處理即已過期", body: "網路已不再接受此交易，因此它不會完成。沒有 USDC 因此交易離開你的錢包。" },
    notFinalized: { title: "尚未最終確定", body: (minutes) => `Benten 在 ${minutes} 分鐘後停止檢查。交易仍可能最終確定。在核對之前請勿再次購買。` },
    technicalDetails: "技術細節",
  },
});

/** Each locale's copy for one product, given the product's display symbol (a routes-table value, for example `METAx`). */
export const PURCHASE_MESSAGE_BUILDERS: Record<PublicWebLocale, (symbol: string) => PurchaseCopy> = { en: purchaseEn, ja: purchaseJa, ko: purchaseKo, "zh-Hans": purchaseZhHans, "zh-Hant": purchaseZhHant };

/** The symbol of the default product (NVDA): the copy when no product is named. The routes table test pins it. */
export const DEFAULT_PURCHASE_SYMBOL = "NVDAx";

/** Every locale's copy for the default product. */
export const PURCHASE_MESSAGES: Record<PublicWebLocale, PurchaseCopy> = {
  en: purchaseEn(DEFAULT_PURCHASE_SYMBOL), ja: purchaseJa(DEFAULT_PURCHASE_SYMBOL), ko: purchaseKo(DEFAULT_PURCHASE_SYMBOL),
  "zh-Hans": purchaseZhHans(DEFAULT_PURCHASE_SYMBOL), "zh-Hant": purchaseZhHant(DEFAULT_PURCHASE_SYMBOL),
};

/** The purchase copy of `locale` for the product whose display symbol is `symbol` (default NVDAx). */
export function purchaseMessagesFor(locale: PublicWebLocale, symbol: string = DEFAULT_PURCHASE_SYMBOL): PurchaseCopy {
  return symbol === DEFAULT_PURCHASE_SYMBOL ? PURCHASE_MESSAGES[locale] : PURCHASE_MESSAGE_BUILDERS[locale](symbol);
}
