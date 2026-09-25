import type { FundamentalsField, ProviderAssetEntryV1, ProviderName, ProviderReferenceKind, ProviderRightsV1, ProviderUnderlyingKind, ProviderUnknownBlock, ProviderUnknownCode } from "@benten/registry";
import type { Locale } from "@/lib/i18n/config";

type FactName = "revenue" | "net_income_parent" | "total_assets" | "total_liabilities" | "operating_cf";
type Exclusion = "etf" | "non_sec_listing" | "private" | "preferred" | "unspecified";
type InstrumentKind = ProviderRightsV1["instrument_kind"];
type RightsStatus = ProviderRightsV1["status"];
type BindingStatus = ProviderAssetEntryV1["company_binding"]["binding_status"];
type RedemptionKind = ProviderRightsV1["redemption_kind"];
/** Restriction codes observed in the reviewed provider artifact; unknown codes fall back to the raw code. */
type RestrictionCode = "provider_terms_not_reviewed" | "no_public_source_verification";

export const LOCALE_LABELS: Record<Locale, string> = { en: "English", ja: "日本語", ko: "한국어", "zh-Hans": "简体中文", "zh-Hant": "繁體中文" };

type PurchaseErrorCopy = { title: string; body: string };
export type PurchaseCopy = {
  heading: string; jumpLink: string; routeLine: (pool: string) => string; poolLabel: string;
  unsupported: { heading: (symbol: string) => string; body: string };
  notice: { heading: string; usPersons: string; noEligibilityCheck: string; noAvailabilityGuarantee: string; notAdvice: string };
  wallet: { detecting: string; notDetectedTitle: string; notDetectedBody: string; listLabel: string; connect: string; connectNamed: (name: string) => string; connecting: string; connected: string; address: (address: string) => string; disconnect: string; unsupported: (name: string) => string; connectRejected: string; connectFailed: string };
  balance: { usdc: (amount: string) => string; loading: string; unavailable: string };
  amount: { label: string; helperRaw: (raw: string) => string; helperSeparator: string; errorEmpty: string; errorFormat: string; errorPrecision: string; errorZero: string; errorOverBalance: (balance: string) => string; errorOverLimit: (limit: string) => string };
  action: { preview: string; previewing: string; approve: string; approving: string; refresh: string; tryAgain: string; checkAgain: string; startNew: string };
  preview: { heading: string; headingExpired: string; youPay: string; consumed: (amount: string, raw: string) => string; expected: string; minimum: string; minimumNote: string; poolFee: string; protocolShare: (amount: string) => string; slippage: string; priceImpact: string; priceImpactBelow: string; expires: string; expiresIn: (time: string) => string; expiresAt: (time: string) => string; expired: string; raw: (value: string) => string; rawOnly: (raw: string) => string; multiplierNote: (time: string) => string; multiplierUnavailable: string; accountCreation: string; networkFee: string; ready: (time: string) => string; tenSecondsLeft: string };
  trail: { label: string; reviewed: string; approveNow: string; approveBody: string; approved: string; sent: string; confirmed: string; finalized: string; notSeenYet: string; stateDone: string; stateCurrent: string; stateNotYet: string; keepOpen: string; signature: string; waitingApproval: string; announceSent: string; announceConfirmed: string; readingResult: string };
  result: { heading: string; receivedLabel: string; received: (delta: string) => string; usdcPaid: string; source: string; explorer: string; explorerCheck: string; copySignature: string; unreadable: string };
  error: { expired: { title: string; body: (time: string) => string }; rejected: PurchaseErrorCopy; notEnoughSol: { title: string; body: (withDeposit: boolean) => string }; simulationFailed: PurchaseErrorCopy; routeCheck: PurchaseErrorCopy; relayBusy: PurchaseErrorCopy; relayUnavailable: PurchaseErrorCopy; trackingRelay: PurchaseErrorCopy; walletUnknown: PurchaseErrorCopy & { explorer: string }; earlierRequest: PurchaseErrorCopy; failedOnChain: PurchaseErrorCopy; dropped: PurchaseErrorCopy; notFinalized: { title: string; body: (minutes: string) => string }; technicalDetails: string };
};

const purchaseEn: PurchaseCopy = {
  heading: "Buy NVDAx with USDC", jumpLink: "Buy NVDAx with USDC",
  routeLine: (pool) => `One fixed route: Meteora DLMM pool ${pool}. You approve and send in your own wallet. Benten never signs or holds funds.`, poolLabel: "Pool address",
  unsupported: { heading: (symbol) => `Purchase not available for ${symbol}`, body: "Benten supports buying only NVDAx with USDC, through one fixed pool. Benten offers no purchase for this token." },
  notice: { heading: "Before you buy", usPersons: "The issuer prohibits US persons from buying or holding NVDAx.", noEligibilityCheck: "Benten does not check whether you are eligible.", noAvailabilityGuarantee: "Availability from any country is not guaranteed.", notAdvice: "This is not investment advice." },
  wallet: { detecting: "Looking for a Solana wallet...", notDetectedTitle: "No Solana wallet found", notDetectedBody: "This browser has no Solana wallet that supports Wallet Standard. Install or unlock one, then reload this page.", listLabel: "Wallets found in this browser", connect: "Connect wallet", connectNamed: (name) => `Connect ${name}`, connecting: "Waiting for your wallet...", connected: "Wallet connected", address: (address) => `Address ${address}`, disconnect: "Disconnect", unsupported: (name) => `${name} cannot send Solana mainnet transactions from this page. Choose another wallet.`, connectRejected: "Connection was cancelled in your wallet. Nothing changed.", connectFailed: "Your wallet did not connect. Nothing changed. Try again or choose another wallet." },
  balance: { usdc: (amount) => `USDC balance ${amount}`, loading: "Reading your USDC balance...", unavailable: "Your USDC balance could not be read." },
  amount: { label: "USDC to pay", helperRaw: (raw) => `${raw} raw units. USDC uses 6 decimals.`, helperSeparator: "Use . as the decimal separator.", errorEmpty: "Enter an amount of USDC.", errorFormat: "Enter digits only, with . as the decimal separator.", errorPrecision: "USDC has at most 6 decimal places.", errorZero: "Enter an amount above zero.", errorOverBalance: (balance) => `This is more than your USDC balance of ${balance}.`, errorOverLimit: (limit) => `The limit is ${limit} USDC per transaction.` },
  action: { preview: "Preview swap", previewing: "Preparing preview...", approve: "Approve in wallet", approving: "Waiting for approval...", refresh: "Refresh preview", tryAgain: "Try again", checkAgain: "Check again", startNew: "Start a new purchase" },
  preview: { heading: "Swap preview", headingExpired: "Expired swap preview", youPay: "You pay", consumed: (amount, raw) => `Used by the pool: ${amount} USDC (raw ${raw})`, expected: "Expected to receive", minimum: "Minimum you receive", minimumNote: "The transaction fails instead of giving you less than this.", poolFee: "Pool fee", protocolShare: (amount) => `Includes protocol share ${amount}`, slippage: "Slippage tolerance", priceImpact: "Price impact", priceImpactBelow: "<0.01%", expires: "Preview expires", expiresIn: (time) => `in ${time}`, expiresAt: (time) => `at ${time}`, expired: "Expired", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw units`, multiplierNote: (time) => `NVDAx amounts use the display multiplier read from the mint at ${time}.`, multiplierUnavailable: "The NVDAx display multiplier could not be read. NVDAx amounts are shown in raw units only.", accountCreation: "This transaction also creates your NVDAx token account. Your wallet shows the one-time SOL deposit.", networkFee: "Your wallet shows the network fee in SOL. Benten asks your wallet to send once and never resends.", ready: (time) => `Swap preview ready. It expires at ${time}.`, tenSecondsLeft: "The swap preview expires in 10 seconds." },
  trail: { label: "Progress", reviewed: "Preview reviewed", approveNow: "Approve in your wallet", approveBody: "Check the amounts in your wallet, then approve or reject.", approved: "Approved in wallet", sent: "Sent", confirmed: "Confirmed", finalized: "Finalized", notSeenYet: "Not seen yet", stateDone: "done", stateCurrent: "current", stateNotYet: "not yet", keepOpen: "Keep this page open until it is finalized. Do not buy again.", signature: "Signature", waitingApproval: "Waiting for approval in your wallet.", announceSent: "Sent.", announceConfirmed: "Confirmed.", readingResult: "Reading the finalized transaction..." },
  result: { heading: "Purchase result", receivedLabel: "NVDAx received", received: (delta) => `NVDAx received: ${delta}.`, usdcPaid: "USDC paid", source: "Measured from the finalized transaction's token balances for your wallet.", explorer: "View on Solana Explorer", explorerCheck: "Check on Solana Explorer", copySignature: "Copy signature", unreadable: "The transaction is finalized, but its token balances could not be read. Check it on Solana Explorer." },
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
    failedOnChain: { title: "The transaction failed on the network", body: "It was processed but did not complete, so no NVDAx was bought. The network fee may still have been charged. A common cause is the pool moving beyond your slippage tolerance." },
    dropped: { title: "This transaction expired without being processed", body: "The network no longer accepts it, so it will not complete. No USDC left your wallet for it." },
    notFinalized: { title: "Not finalized yet", body: (minutes) => `Benten stopped checking after ${minutes} minutes. The transaction may still finalize. Do not buy again until you have checked.` },
    technicalDetails: "Technical details",
  },
};

const purchaseJa: PurchaseCopy = {
  heading: "USDCでNVDAxを購入", jumpLink: "USDCでNVDAxを購入",
  routeLine: (pool) => `固定ルートは1つです: Meteora DLMM プール ${pool}。承認と送信はご自身のウォレットで行います。Bentenは署名せず、資金を預かりません。`, poolLabel: "プールアドレス",
  unsupported: { heading: (symbol) => `${symbol} は購入できません`, body: "Bentenが対応している購入は、1つの固定プールを通じてUSDCでNVDAxを購入することだけです。このトークンの購入は提供していません。" },
  notice: { heading: "購入の前に", usPersons: "発行体は米国人によるNVDAxの購入と保有を禁止しています。", noEligibilityCheck: "Bentenはあなたに購入資格があるかを確認しません。", noAvailabilityGuarantee: "どの国からの利用も保証されていません。", notAdvice: "これは投資助言ではありません。" },
  wallet: { detecting: "Solanaウォレットを探しています…", notDetectedTitle: "Solanaウォレットが見つかりません", notDetectedBody: "このブラウザにWallet Standard対応のSolanaウォレットがありません。ウォレットをインストールまたはロック解除してから、このページを再読み込みしてください。", listLabel: "このブラウザで見つかったウォレット", connect: "ウォレットを接続", connectNamed: (name) => `${name}を接続`, connecting: "ウォレットの応答を待っています…", connected: "ウォレット接続済み", address: (address) => `アドレス ${address}`, disconnect: "接続を解除", unsupported: (name) => `${name}はこのページからSolanaメインネットのトランザクションを送信できません。別のウォレットを選んでください。`, connectRejected: "ウォレットで接続がキャンセルされました。何も変更されていません。", connectFailed: "ウォレットが接続されませんでした。何も変更されていません。もう一度試すか、別のウォレットを選んでください。" },
  balance: { usdc: (amount) => `USDC残高 ${amount}`, loading: "USDC残高を読み取っています…", unavailable: "USDC残高を読み取れませんでした。" },
  amount: { label: "支払うUSDC", helperRaw: (raw) => `${raw} raw単位。USDCは小数点以下6桁です。`, helperSeparator: "小数点には . を使ってください。", errorEmpty: "USDCの数量を入力してください。", errorFormat: "数字と小数点 . だけで入力してください。", errorPrecision: "USDCは小数点以下6桁までです。", errorZero: "0より大きい数量を入力してください。", errorOverBalance: (balance) => `USDC残高 ${balance} を超えています。`, errorOverLimit: (limit) => `1回の取引の上限は ${limit} USDCです。` },
  action: { preview: "スワップをプレビュー", previewing: "プレビューを準備しています…", approve: "ウォレットで承認", approving: "承認を待っています…", refresh: "プレビューを更新", tryAgain: "もう一度試す", checkAgain: "もう一度確認", startNew: "新しい購入を始める" },
  preview: { heading: "スワップのプレビュー", headingExpired: "期限切れのスワップのプレビュー", youPay: "支払う額", consumed: (amount, raw) => `プールが使う額: ${amount} USDC (raw ${raw})`, expected: "受け取る見込み", minimum: "最低受取額", minimumNote: "これより少なくなる場合、トランザクションは失敗します。", poolFee: "プール手数料", protocolShare: (amount) => `うちプロトコル分 ${amount}`, slippage: "スリッページ許容幅", priceImpact: "価格インパクト", priceImpactBelow: "<0.01%", expires: "プレビューの期限", expiresIn: (time) => `残り ${time}`, expiresAt: (time) => `${time} まで`, expired: "期限切れ", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw単位`, multiplierNote: (time) => `NVDAxの数量は、${time} にmintから読み取った表示倍率を使っています。`, multiplierUnavailable: "NVDAxの表示倍率を読み取れませんでした。NVDAxの数量はraw単位だけで表示しています。", accountCreation: "このトランザクションはNVDAxのトークンアカウントも作成します。1回限りのSOLのデポジットはウォレットに表示されます。", networkFee: "ネットワーク手数料(SOL)はウォレットに表示されます。Bentenはウォレットに1回だけ送信を依頼し、再送信しません。", ready: (time) => `スワップのプレビューができました。期限は ${time} です。`, tenSecondsLeft: "スワップのプレビューはあと10秒で期限切れになります。" },
  trail: { label: "進行状況", reviewed: "プレビューを確認", approveNow: "ウォレットで承認してください", approveBody: "ウォレットで数量を確認し、承認または拒否してください。", approved: "ウォレットで承認", sent: "送信済み", confirmed: "確認済み", finalized: "確定済み", notSeenYet: "まだ確認できていません", stateDone: "完了", stateCurrent: "進行中", stateNotYet: "未完了", keepOpen: "確定するまでこのページを開いたままにしてください。もう一度購入しないでください。", signature: "署名", waitingApproval: "ウォレットでの承認を待っています。", announceSent: "送信されました。", announceConfirmed: "確認されました。", readingResult: "確定したトランザクションを読み取っています…" },
  result: { heading: "購入結果", receivedLabel: "受け取ったNVDAx", received: (delta) => `受け取ったNVDAx: ${delta}。`, usdcPaid: "支払ったUSDC", source: "確定したトランザクションのトークン残高から、あなたのウォレットについて算出しています。", explorer: "Solana Explorerで見る", explorerCheck: "Solana Explorerで確認", copySignature: "署名をコピー", unreadable: "トランザクションは確定しましたが、トークン残高を読み取れませんでした。Solana Explorerで確認してください。" },
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
    failedOnChain: { title: "ネットワーク上でトランザクションが失敗しました", body: "処理はされましたが完了しなかったため、NVDAxは購入されていません。ネットワーク手数料は請求されている場合があります。よくある原因は、プールがスリッページ許容幅を超えて動いたことです。" },
    dropped: { title: "このトランザクションは処理されないまま期限切れになりました", body: "ネットワークはこのトランザクションをもう受け付けないため、完了することはありません。このトランザクションでUSDCはウォレットから出ていません。" },
    notFinalized: { title: "まだ確定していません", body: (minutes) => `Bentenは${minutes}分後に確認を停止しました。トランザクションはまだ確定する可能性があります。確認するまでもう一度購入しないでください。` },
    technicalDetails: "技術的な詳細",
  },
};

const purchaseKo: PurchaseCopy = {
  heading: "USDC로 NVDAx 구매", jumpLink: "USDC로 NVDAx 구매",
  routeLine: (pool) => `고정된 경로 하나: Meteora DLMM 풀 ${pool}. 승인과 전송은 본인의 지갑에서 합니다. Benten은 서명하지 않으며 자금을 보관하지 않습니다.`, poolLabel: "풀 주소",
  unsupported: { heading: (symbol) => `${symbol}은(는) 구매할 수 없습니다`, body: "Benten은 하나의 고정된 풀을 통해 USDC로 NVDAx를 구매하는 것만 지원합니다. 이 토큰의 구매는 제공하지 않습니다." },
  notice: { heading: "구매 전에", usPersons: "발행사는 미국인의 NVDAx 구매 및 보유를 금지합니다.", noEligibilityCheck: "Benten은 귀하의 구매 자격을 확인하지 않습니다.", noAvailabilityGuarantee: "어느 국가에서든 이용 가능성은 보장되지 않습니다.", notAdvice: "이것은 투자 자문이 아닙니다." },
  wallet: { detecting: "Solana 지갑을 찾는 중…", notDetectedTitle: "Solana 지갑을 찾을 수 없습니다", notDetectedBody: "이 브라우저에 Wallet Standard를 지원하는 Solana 지갑이 없습니다. 지갑을 설치하거나 잠금을 해제한 뒤 이 페이지를 새로고침하세요.", listLabel: "이 브라우저에서 찾은 지갑", connect: "지갑 연결", connectNamed: (name) => `${name} 연결`, connecting: "지갑의 응답을 기다리는 중…", connected: "지갑 연결됨", address: (address) => `주소 ${address}`, disconnect: "연결 해제", unsupported: (name) => `${name}은(는) 이 페이지에서 Solana 메인넷 트랜잭션을 보낼 수 없습니다. 다른 지갑을 선택하세요.`, connectRejected: "지갑에서 연결이 취소되었습니다. 아무것도 바뀌지 않았습니다.", connectFailed: "지갑이 연결되지 않았습니다. 아무것도 바뀌지 않았습니다. 다시 시도하거나 다른 지갑을 선택하세요." },
  balance: { usdc: (amount) => `USDC 잔액 ${amount}`, loading: "USDC 잔액을 읽는 중…", unavailable: "USDC 잔액을 읽을 수 없습니다." },
  amount: { label: "지불할 USDC", helperRaw: (raw) => `${raw} raw 단위. USDC는 소수점 이하 6자리입니다.`, helperSeparator: "소수점은 . 를 사용하세요.", errorEmpty: "USDC 수량을 입력하세요.", errorFormat: "숫자와 소수점 . 만 입력하세요.", errorPrecision: "USDC는 소수점 이하 6자리까지입니다.", errorZero: "0보다 큰 수량을 입력하세요.", errorOverBalance: (balance) => `USDC 잔액 ${balance}보다 많습니다.`, errorOverLimit: (limit) => `거래 1회 한도는 ${limit} USDC입니다.` },
  action: { preview: "스왑 미리보기", previewing: "미리보기를 준비하는 중…", approve: "지갑에서 승인", approving: "승인을 기다리는 중…", refresh: "미리보기 새로고침", tryAgain: "다시 시도", checkAgain: "다시 확인", startNew: "새 구매 시작" },
  preview: { heading: "스왑 미리보기", headingExpired: "만료된 스왑 미리보기", youPay: "지불 금액", consumed: (amount, raw) => `풀이 사용하는 금액: ${amount} USDC (raw ${raw})`, expected: "예상 수령량", minimum: "최소 수령량", minimumNote: "이보다 적게 받게 되면 트랜잭션은 실패합니다.", poolFee: "풀 수수료", protocolShare: (amount) => `프로토콜 몫 ${amount} 포함`, slippage: "슬리피지 허용 범위", priceImpact: "가격 영향", priceImpactBelow: "<0.01%", expires: "미리보기 만료", expiresIn: (time) => `${time} 남음`, expiresAt: (time) => `${time}까지`, expired: "만료됨", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw 단위`, multiplierNote: (time) => `NVDAx 수량은 ${time}에 mint에서 읽은 표시 배율을 사용합니다.`, multiplierUnavailable: "NVDAx 표시 배율을 읽을 수 없습니다. NVDAx 수량은 raw 단위로만 표시합니다.", accountCreation: "이 트랜잭션은 NVDAx 토큰 계정도 생성합니다. 1회성 SOL 예치금은 지갑에 표시됩니다.", networkFee: "네트워크 수수료(SOL)는 지갑에 표시됩니다. Benten은 지갑에 한 번만 전송을 요청하며 다시 보내지 않습니다.", ready: (time) => `스왑 미리보기가 준비되었습니다. ${time}에 만료됩니다.`, tenSecondsLeft: "스왑 미리보기가 10초 후 만료됩니다." },
  trail: { label: "진행 상황", reviewed: "미리보기 확인", approveNow: "지갑에서 승인하세요", approveBody: "지갑에서 수량을 확인한 뒤 승인하거나 거부하세요.", approved: "지갑에서 승인됨", sent: "전송됨", confirmed: "확인됨", finalized: "최종 확정됨", notSeenYet: "아직 확인되지 않음", stateDone: "완료", stateCurrent: "진행 중", stateNotYet: "대기", keepOpen: "최종 확정될 때까지 이 페이지를 열어 두세요. 다시 구매하지 마세요.", signature: "서명", waitingApproval: "지갑에서 승인을 기다리고 있습니다.", announceSent: "전송되었습니다.", announceConfirmed: "확인되었습니다.", readingResult: "최종 확정된 트랜잭션을 읽는 중…" },
  result: { heading: "구매 결과", receivedLabel: "받은 NVDAx", received: (delta) => `받은 NVDAx: ${delta}.`, usdcPaid: "지불한 USDC", source: "최종 확정된 트랜잭션의 토큰 잔액에서 귀하의 지갑 기준으로 측정했습니다.", explorer: "Solana Explorer에서 보기", explorerCheck: "Solana Explorer에서 확인", copySignature: "서명 복사", unreadable: "트랜잭션은 최종 확정되었지만 토큰 잔액을 읽을 수 없습니다. Solana Explorer에서 확인하세요." },
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
    failedOnChain: { title: "네트워크에서 트랜잭션이 실패했습니다", body: "트랜잭션은 처리되었지만 완료되지 않아 NVDAx는 구매되지 않았습니다. 네트워크 수수료는 청구되었을 수 있습니다. 흔한 원인은 풀이 슬리피지 허용 범위를 넘어 움직인 경우입니다." },
    dropped: { title: "이 트랜잭션은 처리되지 않고 만료되었습니다", body: "네트워크가 더 이상 이 트랜잭션을 받지 않으므로 완료되지 않습니다. 이 트랜잭션으로 지갑에서 USDC가 나가지 않았습니다." },
    notFinalized: { title: "아직 최종 확정되지 않았습니다", body: (minutes) => `Benten은 ${minutes}분 후 확인을 중단했습니다. 트랜잭션은 아직 최종 확정될 수 있습니다. 확인하기 전에는 다시 구매하지 마세요.` },
    technicalDetails: "기술 세부 정보",
  },
};

const purchaseZhHans: PurchaseCopy = {
  heading: "用 USDC 购买 NVDAx", jumpLink: "用 USDC 购买 NVDAx",
  routeLine: (pool) => `唯一的固定路径：Meteora DLMM 池 ${pool}。你在自己的钱包中批准并发送。Benten 从不签名，也不持有资金。`, poolLabel: "池地址",
  unsupported: { heading: (symbol) => `${symbol} 不提供购买`, body: "Benten 仅支持通过一个固定池用 USDC 购买 NVDAx，不提供此代币的购买。" },
  notice: { heading: "购买之前", usPersons: "发行方禁止美国人士购买或持有 NVDAx。", noEligibilityCheck: "Benten 不会核实你是否具备购买资格。", noAvailabilityGuarantee: "不保证在任何国家或地区均可使用。", notAdvice: "这不是投资建议。" },
  wallet: { detecting: "正在查找 Solana 钱包…", notDetectedTitle: "未找到 Solana 钱包", notDetectedBody: "此浏览器中没有支持 Wallet Standard 的 Solana 钱包。请安装或解锁钱包，然后重新加载此页面。", listLabel: "在此浏览器中找到的钱包", connect: "连接钱包", connectNamed: (name) => `连接 ${name}`, connecting: "正在等待钱包响应…", connected: "钱包已连接", address: (address) => `地址 ${address}`, disconnect: "断开连接", unsupported: (name) => `${name} 无法从此页面发送 Solana 主网交易。请选择其他钱包。`, connectRejected: "已在钱包中取消连接。未做任何更改。", connectFailed: "钱包未能连接。未做任何更改。请重试或选择其他钱包。" },
  balance: { usdc: (amount) => `USDC 余额 ${amount}`, loading: "正在读取 USDC 余额…", unavailable: "无法读取 USDC 余额。" },
  amount: { label: "要支付的 USDC", helperRaw: (raw) => `${raw} 个 raw 单位。USDC 有 6 位小数。`, helperSeparator: "请使用 . 作为小数点。", errorEmpty: "请输入 USDC 数量。", errorFormat: "请只输入数字，并使用 . 作为小数点。", errorPrecision: "USDC 最多 6 位小数。", errorZero: "请输入大于零的数量。", errorOverBalance: (balance) => `超过了你的 USDC 余额 ${balance}。`, errorOverLimit: (limit) => `每笔交易的上限为 ${limit} USDC。` },
  action: { preview: "预览兑换", previewing: "正在准备预览…", approve: "在钱包中批准", approving: "正在等待批准…", refresh: "刷新预览", tryAgain: "重试", checkAgain: "再次检查", startNew: "开始新的购买" },
  preview: { heading: "兑换预览", headingExpired: "已过期的兑换预览", youPay: "你支付", consumed: (amount, raw) => `池实际使用：${amount} USDC（raw ${raw}）`, expected: "预计收到", minimum: "最少收到", minimumNote: "如果少于此数量，交易将失败，而不会让你收到更少。", poolFee: "池手续费", protocolShare: (amount) => `含协议分成 ${amount}`, slippage: "滑点容差", priceImpact: "价格影响", priceImpactBelow: "<0.01%", expires: "预览有效期", expiresIn: (time) => `剩余 ${time}`, expiresAt: (time) => `至 ${time}`, expired: "已过期", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw 单位`, multiplierNote: (time) => `NVDAx 数量使用 ${time} 从 mint 读取的显示倍数。`, multiplierUnavailable: "无法读取 NVDAx 的显示倍数。NVDAx 数量仅以 raw 单位显示。", accountCreation: "此交易还会创建你的 NVDAx 代币账户。钱包会显示一次性的 SOL 押金。", networkFee: "网络手续费（SOL）会显示在钱包中。Benten 只请求钱包发送一次，绝不重新发送。", ready: (time) => `兑换预览已就绪，将于 ${time} 过期。`, tenSecondsLeft: "兑换预览将在 10 秒后过期。" },
  trail: { label: "进度", reviewed: "已查看预览", approveNow: "请在钱包中批准", approveBody: "在钱包中核对数量，然后批准或拒绝。", approved: "已在钱包中批准", sent: "已发送", confirmed: "已确认", finalized: "已最终确定", notSeenYet: "尚未看到", stateDone: "已完成", stateCurrent: "进行中", stateNotYet: "未开始", keepOpen: "在最终确定之前请保持此页面打开。请勿再次购买。", signature: "签名", waitingApproval: "正在等待你在钱包中批准。", announceSent: "已发送。", announceConfirmed: "已确认。", readingResult: "正在读取已最终确定的交易…" },
  result: { heading: "购买结果", receivedLabel: "收到的 NVDAx", received: (delta) => `收到的 NVDAx：${delta}。`, usdcPaid: "支付的 USDC", source: "根据已最终确定交易中你的钱包的代币余额计算。", explorer: "在 Solana Explorer 查看", explorerCheck: "在 Solana Explorer 核对", copySignature: "复制签名", unreadable: "交易已最终确定，但无法读取其代币余额。请在 Solana Explorer 核对。" },
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
    failedOnChain: { title: "交易在网络上失败", body: "交易已被处理但未完成，因此没有购买任何 NVDAx。网络手续费可能仍已扣除。常见原因是池的变动超出了你的滑点容差。" },
    dropped: { title: "此交易未被处理即已过期", body: "网络已不再接受此交易，因此它不会完成。没有 USDC 因此交易离开你的钱包。" },
    notFinalized: { title: "尚未最终确定", body: (minutes) => `Benten 在 ${minutes} 分钟后停止检查。交易仍可能最终确定。在核对之前请勿再次购买。` },
    technicalDetails: "技术细节",
  },
};

const purchaseZhHant: PurchaseCopy = {
  heading: "用 USDC 購買 NVDAx", jumpLink: "用 USDC 購買 NVDAx",
  routeLine: (pool) => `唯一的固定路徑：Meteora DLMM 池 ${pool}。你在自己的錢包中核准並傳送。Benten 從不簽署，也不持有資金。`, poolLabel: "池地址",
  unsupported: { heading: (symbol) => `${symbol} 不提供購買`, body: "Benten 僅支援透過一個固定池以 USDC 購買 NVDAx，不提供此代幣的購買。" },
  notice: { heading: "購買之前", usPersons: "發行方禁止美國人士購買或持有 NVDAx。", noEligibilityCheck: "Benten 不會核實你是否具備購買資格。", noAvailabilityGuarantee: "不保證在任何國家或地區皆可使用。", notAdvice: "這不是投資建議。" },
  wallet: { detecting: "正在尋找 Solana 錢包…", notDetectedTitle: "找不到 Solana 錢包", notDetectedBody: "此瀏覽器中沒有支援 Wallet Standard 的 Solana 錢包。請安裝或解鎖錢包，然後重新載入此頁面。", listLabel: "在此瀏覽器中找到的錢包", connect: "連接錢包", connectNamed: (name) => `連接 ${name}`, connecting: "正在等待錢包回應…", connected: "錢包已連接", address: (address) => `地址 ${address}`, disconnect: "中斷連接", unsupported: (name) => `${name} 無法從此頁面傳送 Solana 主網交易。請選擇其他錢包。`, connectRejected: "已在錢包中取消連接。未做任何變更。", connectFailed: "錢包未能連接。未做任何變更。請重試或選擇其他錢包。" },
  balance: { usdc: (amount) => `USDC 餘額 ${amount}`, loading: "正在讀取 USDC 餘額…", unavailable: "無法讀取 USDC 餘額。" },
  amount: { label: "要支付的 USDC", helperRaw: (raw) => `${raw} 個 raw 單位。USDC 有 6 位小數。`, helperSeparator: "請使用 . 作為小數點。", errorEmpty: "請輸入 USDC 數量。", errorFormat: "請只輸入數字，並使用 . 作為小數點。", errorPrecision: "USDC 最多 6 位小數。", errorZero: "請輸入大於零的數量。", errorOverBalance: (balance) => `超過了你的 USDC 餘額 ${balance}。`, errorOverLimit: (limit) => `每筆交易的上限為 ${limit} USDC。` },
  action: { preview: "預覽兌換", previewing: "正在準備預覽…", approve: "在錢包中核准", approving: "正在等待核准…", refresh: "重新整理預覽", tryAgain: "重試", checkAgain: "再次檢查", startNew: "開始新的購買" },
  preview: { heading: "兌換預覽", headingExpired: "已過期的兌換預覽", youPay: "你支付", consumed: (amount, raw) => `池實際使用：${amount} USDC（raw ${raw}）`, expected: "預計收到", minimum: "最少收到", minimumNote: "如果少於此數量，交易將失敗，而不會讓你收到更少。", poolFee: "池手續費", protocolShare: (amount) => `含協議分成 ${amount}`, slippage: "滑價容差", priceImpact: "價格影響", priceImpactBelow: "<0.01%", expires: "預覽有效期", expiresIn: (time) => `剩餘 ${time}`, expiresAt: (time) => `至 ${time}`, expired: "已過期", raw: (value) => `raw ${value}`, rawOnly: (raw) => `${raw} raw 單位`, multiplierNote: (time) => `NVDAx 數量使用 ${time} 從 mint 讀取的顯示倍數。`, multiplierUnavailable: "無法讀取 NVDAx 的顯示倍數。NVDAx 數量僅以 raw 單位顯示。", accountCreation: "此交易還會建立你的 NVDAx 代幣帳戶。錢包會顯示一次性的 SOL 押金。", networkFee: "網路手續費（SOL）會顯示在錢包中。Benten 只請求錢包傳送一次，絕不重新傳送。", ready: (time) => `兌換預覽已就緒，將於 ${time} 過期。`, tenSecondsLeft: "兌換預覽將在 10 秒後過期。" },
  trail: { label: "進度", reviewed: "已查看預覽", approveNow: "請在錢包中核准", approveBody: "在錢包中核對數量，然後核准或拒絕。", approved: "已在錢包中核准", sent: "已傳送", confirmed: "已確認", finalized: "已最終確定", notSeenYet: "尚未看到", stateDone: "已完成", stateCurrent: "進行中", stateNotYet: "未開始", keepOpen: "在最終確定之前請保持此頁面開啟。請勿再次購買。", signature: "簽章", waitingApproval: "正在等待你在錢包中核准。", announceSent: "已傳送。", announceConfirmed: "已確認。", readingResult: "正在讀取已最終確定的交易…" },
  result: { heading: "購買結果", receivedLabel: "收到的 NVDAx", received: (delta) => `收到的 NVDAx：${delta}。`, usdcPaid: "支付的 USDC", source: "根據已最終確定交易中你的錢包的代幣餘額計算。", explorer: "在 Solana Explorer 查看", explorerCheck: "在 Solana Explorer 核對", copySignature: "複製簽章", unreadable: "交易已最終確定，但無法讀取其代幣餘額。請在 Solana Explorer 核對。" },
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
    failedOnChain: { title: "交易在網路上失敗", body: "交易已被處理但未完成，因此沒有購買任何 NVDAx。網路手續費可能仍已扣除。常見原因是池的變動超出了你的滑價容差。" },
    dropped: { title: "此交易未被處理即已過期", body: "網路已不再接受此交易，因此它不會完成。沒有 USDC 因此交易離開你的錢包。" },
    notFinalized: { title: "尚未最終確定", body: (minutes) => `Benten 在 ${minutes} 分鐘後停止檢查。交易仍可能最終確定。在核對之前請勿再次購買。` },
    technicalDetails: "技術細節",
  },
};

type CompanyColumns = { instrument: string; provider: string; kind: string; rights: string; reference: string; unknowns: string };
export type CompanyCopy = {
  status: { private: string; usListed: string };
  lede: { multiple: (name: string) => string; single: (name: string) => string };
  notice: { heading: string; body: string; bodySingle: string };
  instrumentsHeading: (count: number) => string;
  caption: (name: string) => string;
  column: CompanyColumns;
  rights: { claimedBy: (provider: string) => string; equity: (value: string) => string; voting: (value: string) => string; redemption: (value: string) => string; notRecorded: string };
  referenceNouns: Record<ProviderReferenceKind, string>;
  reference: { publishes: (list: string) => string; sentenceSeparator: string; currencyUnknown: string; asOfUnknown: string; none: string; xstock: string };
  xstockProvider: string;
  xstockKind: string;
  unknowns: { noFilingCoverage: (reason: string) => string; none: string };
  sources: { heading: string; noSec: (name: string) => string };
  method: { heading: string; body: (name: string, revision: number, date: string) => string };
  metadata: { title: (name: string) => string; description: (name: string) => string };
};

export type MessageCatalog = {
  metadata: { title: string; description: string };
  navigation: { primary: string; mobile: string; howItWorks: string; registry: string; mobileMenu: string; language: string; currentLanguage: (language: string) => string };
  footer: { disclaimer: string; walletUnavailable: string };
  home: { eyebrow: string; heading: string; supporting: string; reassurance: string; lookupLabel: string; resolve: string; resolving: string; tryNvda: string; registryHeading: string; registryDescription: string; ticker: string; name: string; token: string; filingEligibility: string; snapshot: string; available: string; noCurrentRow: string; structuralExclusions: string; browseRegistry: string; registryEntries: (count: string) => string; filingEligible: (count: string) => string; snapshotAvailable: (count: string) => string };
  proof: { label: string; token: string; underlyingCompany: string; filing: string; issuerVerified: string; issuerUnavailable: string; identityVerified: string; noIdentity: string; noCompany: string; filed: (date: string, authority: string) => string; openFiling: (company: string, year: number, form: string) => string; noFilingContext: string };
  facts: { eyebrow: string; heading: string; sourceVerified: string; factLabels: Record<FactName, string>; scale: (value: number) => string; duration: string; instant: string; fromTo: (start: string, end: string) => string; asOf: (date: string) => string; filedLink: (form: string, date: string) => string; opensNewTab: string };
  mcp: { eyebrow: string; heading: string; description: string; copy: string; copied: string; unavailable: string };
  states: { legacyTitle: string; unverified: string; legacyExplanation: string; legacyAsOf: (date: string, fiscalYear: number | null) => string; noDataHeading: string; noData: (ticker: string) => string; ineligibleHeading: string; unknownHeading: string; unknown: string; invalidHeading: string; invalid: string; serviceHeading: string; service: string; outcome: { found: string; noData: string; ineligible: string; service: string; unable: string } };
  exclusions: Record<Exclusion, string> & { explanations: Record<Exclusion, string> };
  badges: { financials: string; noFilings: string };
  stock: { back: string; companyPageLink: (name: string) => string; registryRecord: string; registryNote: string; underlyingTicker: string; tokenSymbol: string; tokenName: string; mint: string; issuer: string; issuerVerified: string; tokenDecimals: string; coverageHeading: string; coverageNote: string; noCoverageHeading: string; noCoverage: string; legacyHeading: string; legacyUnavailable: string; legacyNote: (asOf: string, source: string) => string; legacySource: string; value: string; true: string; false: string };
  legacy: { fields: Record<FundamentalsField, string>; groups: { entity: string; income: string; balance: string; cashflow: string } };
  providers: { nav: string; home: { byCompany: string; eyebrow: string; heading: string; note: string; provider: string; symbol: string; underlyingCompany: string; instrument: string; rights: string; reference: string; observed: string; referenceLabel: string; referenceUnknowns: string; noReference: string; fetched: (date: string) => string }; names: Record<ProviderName, string>; instrumentKinds: Record<InstrumentKind, string>; rightsStatus: Record<RightsStatus, string>; bindingStatus: Record<BindingStatus, string>; redemption: Record<RedemptionKind, string>; restrictions: Record<RestrictionCode, string>; underlyingKinds: Record<ProviderUnderlyingKind, string>; referenceKinds: Record<ProviderReferenceKind, string>; unknownCodes: Record<ProviderUnknownCode, string>; blocks: Record<ProviderUnknownBlock, string>; page: { back: string; companyPageLink: (name: string) => string; identityHeading: string; provider: string; symbol: string; displayName: string; instrument: string; contract: string; copy: string; copied: string; copyUnavailable: string; externalLink: (provider: string) => string; opensNewTab: string; companyHeading: string; company: string; binding: string; noFilingCoverage: string; underlyingKind: string; rightsHeading: string; rightsStatusLabel: string; equityOwnership: string; votingRights: string; redemption: string; unknownValue: string; noValue: string; statementAttribution: (provider: string) => string; terms: string; restrictionsLabel: string; referencesHeading: string; referencesNote: string; referenceColumn: string; valueColumn: string; currencyColumn: string; asOfColumn: string; fetchedColumn: string; supplyHeading: string; supplyReference: string; noReferences: string; unknownsHeading: string; blocksLabel: (blocks: string) => string; notXStock: string }; metadata: { title: (symbol: string, provider: string) => string; description: (name: string, provider: string) => string } };
  company: CompanyCopy;
  notFound: { heading: string; body: string; back: string };
  error: { heading: string; body: string; retry: string; home: string };
  purchase: PurchaseCopy;
};

const companyEn: CompanyCopy = {
  status: { private: "Private company", usListed: "US-listed company" },
  lede: {
    multiple: (name) => `Every Solana instrument that Benten's reviewed company map links to ${name}. Each comes from a different provider and carries its own rights. They are listed together, not as substitutes.`,
    single: (name) => `The Solana instrument that Benten's reviewed company map links to ${name}. Benten links no other instrument to this company.`,
  },
  notice: { heading: "Not interchangeable", body: "Holding one of these instruments gives you none of the rights of another. Their reference values are not compared here, because currency and as-of time are unknown. Open an instrument to see its full record.", bodySingle: "Benten has not verified this provider's rights claim. Open the instrument to see its full record." },
  instrumentsHeading: (count) => `Instruments (${count})`,
  caption: (name) => `Instruments linked to ${name}`,
  column: { instrument: "Instrument", provider: "Provider", kind: "Instrument kind", rights: "Rights status", reference: "Reference semantics", unknowns: "Unknowns" },
  rights: { claimedBy: (provider) => `Claimed by ${provider}, not verified by Benten`, equity: (value) => `Equity ownership: ${value}`, voting: (value) => `Voting rights: ${value}`, redemption: (value) => `Redemption: ${value}`, notRecorded: "Not recorded by Benten" },
  referenceNouns: { prestock_mark_reference: "a mark reference", prestock_token_reference: "a token reference", prestock_implied_valuation_reference: "an implied valuation reference", tessera_auction_price_reference: "an auction reference", tessera_auction_valuation_reference: "an auction valuation reference" },
  reference: { publishes: (list) => `Publishes ${list}`, sentenceSeparator: " ", currencyUnknown: "Currency unknown.", asOfUnknown: "Provider as-of unknown.", none: "Publishes no reference value for this instrument", xstock: "Registry identity only. No reference value is shown." },
  xstockProvider: "xStocks",
  xstockKind: "xStock",
  unknowns: { noFilingCoverage: (reason) => `No Benten filing coverage: ${reason}`, none: "None recorded" },
  sources: { heading: "Primary sources", noSec: (name) => `Benten has no SEC filing coverage for ${name}, a private company.` },
  method: { heading: "How this list is made", body: (name, revision, date) => `Instruments are linked to ${name} by an explicit, reviewed company map (revision ${revision}), not by matching names. Provider records fetched ${date}.` },
  metadata: { title: (name) => `${name} instruments on Solana`, description: (name) => `Every Solana instrument Benten links to ${name}, with each provider's rights claim and what is unknown.` },
};

const companyJa: CompanyCopy = {
  status: { private: "非公開企業", usListed: "米国上場企業" },
  lede: {
    multiple: (name) => `Bentenが確認済みの企業マップで${name}に対応付けている、Solana上のすべての金融商品です。提供元はそれぞれ異なり、権利内容も商品ごとに異なります。代わりになるものとしてではなく、並べて掲載しています。`,
    single: (name) => `Bentenが確認済みの企業マップで${name}に対応付けている、Solana上の金融商品です。Bentenはこの企業に他の商品を対応付けていません。`,
  },
  notice: { heading: "相互に代替できません", body: "いずれかの商品を保有しても、他の商品の権利は得られません。通貨と基準時点が不明なため、ここでは参考値を比較しません。各商品を開くと、登録情報の全体を確認できます。", bodySingle: "Bentenはこのプロバイダーによる権利の主張を検証していません。商品を開くと、登録情報の全体を確認できます。" },
  instrumentsHeading: (count) => `金融商品（${count}）`,
  caption: (name) => `${name}に対応付けた金融商品`,
  column: { instrument: "商品", provider: "提供元", kind: "商品の種類", rights: "権利の状態", reference: "参考値の性質", unknowns: "不明な点" },
  rights: { claimedBy: (provider) => `${provider}による主張で、Bentenは検証していません`, equity: (value) => `株式の所有: ${value}`, voting: (value) => `議決権: ${value}`, redemption: (value) => `償還: ${value}`, notRecorded: "Bentenは記録していません" },
  referenceNouns: { prestock_mark_reference: "マーク参考値", prestock_token_reference: "トークン参考値", prestock_implied_valuation_reference: "推定評価額の参考値", tessera_auction_price_reference: "オークション参考値", tessera_auction_valuation_reference: "オークション評価額の参考値" },
  reference: { publishes: (list) => `${list}を公表しています`, sentenceSeparator: "", currencyUnknown: "通貨は不明です。", asOfUnknown: "プロバイダーの基準時点は不明です。", none: "この商品の参考値は公表されていません", xstock: "レジストリの識別情報のみです。参考値は表示しません。" },
  xstockProvider: "xStocks",
  xstockKind: "xStock",
  unknowns: { noFilingCoverage: (reason) => `Bentenの提出書類対象外: ${reason}`, none: "記録なし" },
  sources: { heading: "一次情報源", noSec: (name) => `Bentenは非公開企業である${name}のSEC提出書類を収録していません。` },
  method: { heading: "この一覧の作り方", body: (name, revision, date) => `金融商品は名称の照合ではなく、確認済みの明示的な企業マップ（リビジョン${revision}）で${name}に対応付けています。プロバイダーの記録の取得日: ${date}。` },
  metadata: { title: (name) => `Solana上の${name}関連の金融商品`, description: (name) => `Bentenが${name}に対応付けているSolana上のすべての金融商品と、各プロバイダーによる権利の主張、不明な点。` },
};

const companyKo: CompanyCopy = {
  status: { private: "비공개 기업", usListed: "미국 상장 기업" },
  lede: {
    multiple: (name) => `Benten이 검토한 기업 매핑에서 ${name}에 연결한 모든 Solana 상품입니다. 상품마다 제공자가 다르고 권리도 각각 다릅니다. 서로 대신하는 것으로서가 아니라 나란히 보여 줍니다.`,
    single: (name) => `Benten이 검토한 기업 매핑에서 ${name}에 연결한 Solana 상품입니다. Benten은 이 기업에 다른 상품을 연결하지 않았습니다.`,
  },
  notice: { heading: "서로 대체할 수 없음", body: "이 중 한 상품을 보유해도 다른 상품의 권리는 전혀 얻지 못합니다. 통화와 기준 시점을 알 수 없으므로 여기서는 참고 값을 비교하지 않습니다. 각 상품을 열어 전체 기록을 확인하세요.", bodySingle: "Benten은 이 제공자의 권리 주장을 검증하지 않았습니다. 상품을 열어 전체 기록을 확인하세요." },
  instrumentsHeading: (count) => `상품 (${count})`,
  caption: (name) => `${name}에 연결된 상품`,
  column: { instrument: "상품", provider: "제공자", kind: "상품 종류", rights: "권리 상태", reference: "참고 값의 성격", unknowns: "알 수 없는 점" },
  rights: { claimedBy: (provider) => `${provider}의 주장이며 Benten은 검증하지 않음`, equity: (value) => `지분 소유: ${value}`, voting: (value) => `의결권: ${value}`, redemption: (value) => `상환: ${value}`, notRecorded: "Benten에 기록 없음" },
  referenceNouns: { prestock_mark_reference: "마크 참고 값", prestock_token_reference: "토큰 참고 값", prestock_implied_valuation_reference: "추정 기업가치 참고 값", tessera_auction_price_reference: "경매 참고 값", tessera_auction_valuation_reference: "경매 기업가치 참고 값" },
  reference: { publishes: (list) => `${list} 공개`, sentenceSeparator: " ", currencyUnknown: "통화 알 수 없음.", asOfUnknown: "제공자 기준 시점 알 수 없음.", none: "이 상품에 대해 공개된 참고 값 없음", xstock: "레지스트리 식별 정보만 있습니다. 참고 값은 표시하지 않습니다." },
  xstockProvider: "xStocks",
  xstockKind: "xStock",
  unknowns: { noFilingCoverage: (reason) => `Benten 공시 수록 대상 아님: ${reason}`, none: "기록 없음" },
  sources: { heading: "1차 출처", noSec: (name) => `Benten은 비공개 기업인 ${name}의 SEC 공시를 수록하지 않습니다.` },
  method: { heading: "이 목록을 만드는 방법", body: (name, revision, date) => `상품은 이름 대조가 아니라 검토된 명시적 기업 매핑(리비전 ${revision})으로 ${name}에 연결됩니다. 제공자 기록 수집일: ${date}.` },
  metadata: { title: (name) => `Solana의 ${name} 관련 상품`, description: (name) => `Benten이 ${name}에 연결한 모든 Solana 상품과 각 제공자의 권리 주장, 알 수 없는 점.` },
};

const companyZhHans: CompanyCopy = {
  status: { private: "非上市公司", usListed: "美国上市公司" },
  lede: {
    multiple: (name) => `Benten 经审核的公司映射表关联到 ${name} 的全部 Solana 金融工具。每种工具来自不同的发行方，各自附带不同的权利。此处将它们并列展示，而非作为可相互替代的工具。`,
    single: (name) => `Benten 经审核的公司映射表关联到 ${name} 的 Solana 金融工具。Benten 未将其他工具关联到这家公司。`,
  },
  notice: { heading: "不可相互替代", body: "持有其中一种工具，并不会让你获得另一种工具的任何权利。由于币种和基准时点未知，此处不比较它们的参考值。打开某个工具即可查看其完整记录。", bodySingle: "Benten 未核实该发行方关于权利的主张。打开该工具即可查看其完整记录。" },
  instrumentsHeading: (count) => `金融工具（${count}）`,
  caption: (name) => `关联到 ${name} 的金融工具`,
  column: { instrument: "工具", provider: "发行方", kind: "工具类型", rights: "权利状态", reference: "参考值性质", unknowns: "未知事项" },
  rights: { claimedBy: (provider) => `由 ${provider} 主张，未经 Benten 核实`, equity: (value) => `股权所有权：${value}`, voting: (value) => `投票权：${value}`, redemption: (value) => `赎回：${value}`, notRecorded: "Benten 未记录" },
  referenceNouns: { prestock_mark_reference: "标记参考值", prestock_token_reference: "代币参考值", prestock_implied_valuation_reference: "隐含估值参考值", tessera_auction_price_reference: "拍卖参考值", tessera_auction_valuation_reference: "拍卖估值参考值" },
  reference: { publishes: (list) => `公布${list}`, sentenceSeparator: "", currencyUnknown: "币种未知。", asOfUnknown: "发行方基准时点未知。", none: "未就此工具公布参考值", xstock: "仅有注册表标识信息，不显示参考值。" },
  xstockProvider: "xStocks",
  xstockKind: "xStock",
  unknowns: { noFilingCoverage: (reason) => `不在 Benten 披露文件收录范围内：${reason}`, none: "无记录" },
  sources: { heading: "一手来源", noSec: (name) => `Benten 未收录非上市公司 ${name} 的 SEC 披露文件。` },
  method: { heading: "此列表的编制方式", body: (name, revision, date) => `金融工具通过经审核的明确公司映射表（第 ${revision} 版）关联到 ${name}，而不是通过名称匹配。发行方记录获取于 ${date}。` },
  metadata: { title: (name) => `${name} 在 Solana 上的金融工具`, description: (name) => `Benten 关联到 ${name} 的全部 Solana 金融工具，以及各发行方关于权利的主张和未知事项。` },
};

const companyZhHant: CompanyCopy = {
  status: { private: "非上市公司", usListed: "美國上市公司" },
  lede: {
    multiple: (name) => `Benten 經審核的公司對應表關聯到 ${name} 的全部 Solana 金融工具。每種工具來自不同的發行方，各自附帶不同的權利。此處將它們並列呈現，而非作為可相互替代的工具。`,
    single: (name) => `Benten 經審核的公司對應表關聯到 ${name} 的 Solana 金融工具。Benten 未將其他工具關聯到這家公司。`,
  },
  notice: { heading: "不可相互替代", body: "持有其中一種工具，並不會讓你取得另一種工具的任何權利。由於幣別與基準時點未知，此處不比較它們的參考值。開啟某個工具即可查看其完整紀錄。", bodySingle: "Benten 未查核該發行方關於權利的主張。開啟該工具即可查看其完整紀錄。" },
  instrumentsHeading: (count) => `金融工具（${count}）`,
  caption: (name) => `關聯到 ${name} 的金融工具`,
  column: { instrument: "工具", provider: "發行方", kind: "工具類型", rights: "權利狀態", reference: "參考值性質", unknowns: "未知事項" },
  rights: { claimedBy: (provider) => `由 ${provider} 主張，未經 Benten 查核`, equity: (value) => `股權所有權：${value}`, voting: (value) => `表決權：${value}`, redemption: (value) => `贖回：${value}`, notRecorded: "Benten 未記錄" },
  referenceNouns: { prestock_mark_reference: "標記參考值", prestock_token_reference: "代幣參考值", prestock_implied_valuation_reference: "隱含估值參考值", tessera_auction_price_reference: "拍賣參考值", tessera_auction_valuation_reference: "拍賣估值參考值" },
  reference: { publishes: (list) => `公布${list}`, sentenceSeparator: "", currencyUnknown: "幣別未知。", asOfUnknown: "發行方基準時點未知。", none: "未就此工具公布參考值", xstock: "僅有登錄表識別資訊，不顯示參考值。" },
  xstockProvider: "xStocks",
  xstockKind: "xStock",
  unknowns: { noFilingCoverage: (reason) => `不在 Benten 揭露文件收錄範圍內：${reason}`, none: "無紀錄" },
  sources: { heading: "第一手來源", noSec: (name) => `Benten 未收錄非上市公司 ${name} 的 SEC 揭露文件。` },
  method: { heading: "此清單的編製方式", body: (name, revision, date) => `金融工具透過經審核的明確公司對應表（第 ${revision} 版）關聯到 ${name}，而非透過名稱比對。發行方紀錄取得於 ${date}。` },
  metadata: { title: (name) => `${name} 在 Solana 上的金融工具`, description: (name) => `Benten 關聯到 ${name} 的全部 Solana 金融工具，以及各發行方關於權利的主張與未知事項。` },
};

const en: MessageCatalog = {
  metadata: { title: "Benten — Open-source financial facts for Solana xStocks", description: "Open-source financial facts for Solana xStocks." },
  navigation: { primary: "Primary navigation", mobile: "Mobile navigation", howItWorks: "How it works", registry: "Registry", mobileMenu: "Menu", language: "Language", currentLanguage: (language) => `Current language: ${language}` },
  footer: { disclaimer: "Factual data only. Not investment advice, a recommendation, or a valuation.", walletUnavailable: "Benten never signs or sends transactions. Purchases are approved and sent by your own wallet." },
  home: { eyebrow: "Public financial facts", heading: "Start with a Solana mint. End at the filing.", supporting: "Resolve token identity, underlying company, and source-backed financial facts for agents. Facts only.", reassurance: "No wallet required.", lookupLabel: "xStocks mint", resolve: "Resolve mint", resolving: "Resolving…", tryNvda: "Try NVDA", registryHeading: "Complete xStocks registry", registryDescription: "Every entry remains below the mint-to-filing journey. Status labels distinguish filing eligibility from current snapshot availability.", ticker: "Ticker", name: "Name", token: "Token", filingEligibility: "Filing eligibility", snapshot: "Snapshot", available: "Available", noCurrentRow: "No current row", structuralExclusions: "Structural exclusions", browseRegistry: "Browse registry", registryEntries: (count) => `${count} registry entries`, filingEligible: (count) => `${count} filing-eligible`, snapshotAvailable: (count) => `${count} snapshot available` },
  proof: { label: "Token to filing proof", token: "Token", underlyingCompany: "Underlying company", filing: "Filing", issuerVerified: "Issuer verified", issuerUnavailable: "Issuer state unavailable", identityVerified: "Identity source verified", noIdentity: "No source-verified company identity", noCompany: "No verified company identity", filed: (date, authority) => `Filed ${date} · ${authority}`, openFiling: (company, year, form) => `Open ${company} ${year} ${form}`, noFilingContext: "No verified filing context in this result." },
  facts: { eyebrow: "Financial facts", heading: "Verified facts", sourceVerified: "Source verified", factLabels: { revenue: "Revenue", net_income_parent: "Net income attributable to parent", total_assets: "Total assets", total_liabilities: "Total liabilities", operating_cf: "Operating cash flow" }, scale: (value) => `scale ${value}`, duration: "duration", instant: "instant", fromTo: (start, end) => `${start} to ${end}`, asOf: (date) => `As of ${date}`, filedLink: (form, date) => `${form}, filed ${date}`, opensNewTab: "(opens in a new tab)" },
  mcp: { eyebrow: "Local MCP", heading: "Use Benten in your agent", description: "Build from this repository, then add the local server to your MCP client.", copy: "Copy local commands", copied: "Copied", unavailable: "Copy unavailable" },
  states: { legacyTitle: "Legacy snapshot", unverified: "Unverified", legacyExplanation: "Filing date, unit, source, and reported-versus-calculated status are unverified for these values.", legacyAsOf: (date, year) => `As of ${date}${year ? ` · FY${year}` : ""}`, noDataHeading: "No current financial row", noData: (ticker) => `${ticker} is filing-eligible, but the current Benten snapshot has no financial row for it.`, ineligibleHeading: "Not filing-eligible", unknownHeading: "Mint not found", unknown: "This mint is not in the current Benten registry.", invalidHeading: "Unable to resolve mint", invalid: "Enter a valid Solana address.", serviceHeading: "Snapshot unavailable", service: "Benten could not read the current public snapshot. Try again.", outcome: { found: "Mint resolved.", noData: "No current financial row.", ineligible: "Not filing-eligible.", service: "Snapshot unavailable.", unable: "Unable to resolve mint." } },
  exclusions: { etf: "Exchange-traded fund", non_sec_listing: "Non-SEC listing", private: "Private company", preferred: "Preferred share class", unspecified: "Unspecified", explanations: { etf: "Exchange-traded fund — this ticker has no company-level SEC financial statements in current Benten coverage.", non_sec_listing: "Listed outside the SEC reporting regime covered by Benten.", private: "Private company — no Benten SEC filing coverage is currently available.", preferred: "Preferred share class without its own filing set in current Benten coverage.", unspecified: "No SEC financial statement coverage is currently available in Benten for this ticker." } },
  badges: { financials: "Financials", noFilings: "No Benten filing coverage" },
  stock: { back: "All xStocks", companyPageLink: (name) => `See every instrument linked to ${name}`, registryRecord: "Registry record", registryNote: "Static registry facts about the token itself, from the Benten xStocks registry.", underlyingTicker: "Underlying ticker", tokenSymbol: "Token symbol", tokenName: "Token name", mint: "Mint", issuer: "Issuer", issuerVerified: "Issuer verified", tokenDecimals: "Token decimals", coverageHeading: "Current Benten coverage", coverageNote: "This token is outside the current filing-eligible coverage for Benten.", noCoverageHeading: "No current Benten financial coverage", noCoverage: "The registry record remains available; Benten has no current filing-eligible financial coverage for this token.", legacyHeading: "Legacy snapshot", legacyUnavailable: "The registry record remains available, but no current legacy snapshot is present.", legacyNote: (asOf, source) => `As of ${asOf}. Source: ${source}. Filing date, unit, source, and reported-versus-calculated status are unverified for these values.`, legacySource: "Benten legacy financial snapshot; filing source, unit, and fact kind unverified", value: "Value", true: "true", false: "false" },
  legacy: { fields: { company_name: "Company name", metrics_fiscal_year: "Fiscal year", revenue: "Revenue", op_income: "Operating income", gross_profit: "Gross profit", net_income_parent: "Net income (parent)", total_assets: "Total assets", total_equity: "Total equity", total_liabilities: "Total liabilities", long_term_debt: "Long-term debt", operating_cf: "Operating cash flow", investing_cf: "Investing cash flow", fcf: "Free cash flow" }, groups: { entity: "Entity", income: "Income statement", balance: "Balance sheet", cashflow: "Cash flow" } },
  providers: { nav: "Other providers", home: { byCompany: "By company:", eyebrow: "Other providers", heading: "Pre-IPO references from other providers", note: "These are provider-reported identities, rights claims, and reference values published by PreStocks and Tessera — not xStocks, not quotes or valuations, and not verified by Benten.", provider: "Provider", symbol: "Symbol", underlyingCompany: "Underlying company", instrument: "Instrument", rights: "Rights", reference: "Reference", observed: "Observed", referenceLabel: "provider reference", referenceUnknowns: "currency unknown · provider as-of unknown", noReference: "No reference available", fetched: (date) => `fetched ${date}` }, names: { prestocks: "PreStocks", tessera: "Tessera" }, instrumentKinds: { tracker_certificate: "Tracker certificate", economic_exposure_instrument: "Economic exposure instrument", loan_participation_token: "Loan participation token", unknown: "Unknown" }, rightsStatus: { public_source_verified: "Public source verified", provider_terms_observed: "Provider terms observed", provider_claim_only: "Provider claim only", unknown: "Unknown" }, bindingStatus: { public_source_verified: "Public source verified", provider_claim_only: "Provider claim only", unknown: "Unknown" }, redemption: { provider_terms: "Provider terms", conditional: "Conditional", none: "None", unknown: "Unknown" }, restrictions: { provider_terms_not_reviewed: "Provider terms not reviewed by Benten", no_public_source_verification: "No public source verification" }, underlyingKinds: { openai: "OpenAI", kalshi: "Kalshi", spacex: "SpaceX" }, referenceKinds: { prestock_mark_reference: "Mark reference", prestock_token_reference: "Token reference", prestock_implied_valuation_reference: "Implied valuation reference", tessera_auction_price_reference: "Auction reference", tessera_auction_valuation_reference: "Auction valuation reference" }, unknownCodes: { source_as_of_unknown: "Provider as-of time unknown", currency_unknown: "Currency unknown", rights_unknown: "Rights unknown", company_binding_unknown: "Company binding unknown", chain_identity_unknown: "On-chain identity unverified", provider_catalog_mismatch: "Provider catalog mismatch", redistribution_pending: "Redistribution review pending", execution_quote_unavailable: "Provider execution reference unavailable", asset_not_found: "Asset not found" }, blocks: { display: "display", comparison: "comparison", release: "release" }, page: { back: "Other-provider references", companyPageLink: (name) => `See every instrument linked to ${name}`, identityHeading: "Identity", provider: "Provider", symbol: "Symbol", displayName: "Display name", instrument: "Instrument kind", contract: "Contract or mint address", copy: "Copy address", copied: "Copied", copyUnavailable: "Copy unavailable", externalLink: (provider) => `Open this instrument on ${provider}`, opensNewTab: "(opens in a new tab)", companyHeading: "Underlying company", company: "Company", binding: "Binding status", noFilingCoverage: "Benten has no SEC filing coverage for this private company.", underlyingKind: "Underlying kind", rightsHeading: "Rights", rightsStatusLabel: "Rights status", equityOwnership: "Equity ownership", votingRights: "Voting rights", redemption: "Redemption", unknownValue: "unknown", noValue: "no", statementAttribution: (provider) => `Statement published by ${provider}:`, terms: "Provider terms", restrictionsLabel: "Restrictions", referencesHeading: "Reference values", referencesNote: "Provider-reported reference values. Not an executable quote, NAV, valuation, or price target.", referenceColumn: "Reference", valueColumn: "Provider-reported value", currencyColumn: "Currency", asOfColumn: "Provider as-of", fetchedColumn: "Fetched", supplyHeading: "Provider-reported supply", supplyReference: "Supply reference", noReferences: "This provider publishes no reference value for this instrument.", unknownsHeading: "Unknowns", blocksLabel: (blocks) => `blocks promotion to verified: ${blocks}`, notXStock: "Not an xStocks token." }, metadata: { title: (symbol, provider) => `${symbol} — ${provider} reference`, description: (name, provider) => `Provider-reported identity, rights claims, and reference values for ${name}, published by ${provider}. Facts only: not a quote, a valuation, or an xStocks token.` } },
  company: companyEn,
  notFound: { heading: "Not in the registry", body: "That ticker is not one of the xStocks tokens Benten knows about. Benten only resolves tickers present in its static allowlist — an unknown input never reaches any data source.", back: "All xStocks" },
  error: { heading: "Unable to load this page", body: "Benten could not load this public page. Try again.", retry: "Try again", home: "Back to home" },
  purchase: purchaseEn,
};

const ja: MessageCatalog = {
  metadata: { title: "Benten — Solana xStocksのオープンな財務データ", description: "Solana xStocksのオープンな財務データ。" },
  navigation: { primary: "主要ナビゲーション", mobile: "モバイルナビゲーション", howItWorks: "仕組み", registry: "レジストリ", mobileMenu: "メニュー", language: "言語", currentLanguage: (language) => `現在の言語: ${language}` },
  footer: { disclaimer: "事実情報のみを提供します。投資助言、推奨、または評価ではありません。", walletUnavailable: "Bentenがトランザクションに署名したり送信したりすることはありません。購入はご自身のウォレットで承認され、送信されます。" },
  home: { eyebrow: "公開財務データ", heading: "Solana の mint から、提出書類へ。", supporting: "トークンの識別情報、原資産の企業、出典に基づく財務データをエージェント向けに照会できます。事実情報のみ。", reassurance: "ウォレットは不要です。", lookupLabel: "xStocks mint", resolve: "mintを照会", resolving: "照会中…", tryNvda: "NVDAを試す", registryHeading: "xStocksレジストリ", registryDescription: "すべてのエントリはmintから提出書類への導線の下に表示されます。提出書類の収録対象と現在のスナップショット収録状況は区別されます。", ticker: "ティッカー", name: "名称", token: "トークン", filingEligibility: "提出書類の収録対象", snapshot: "スナップショット", available: "収録あり", noCurrentRow: "現在のレコードなし", structuralExclusions: "区分による対象外", browseRegistry: "レジストリを見る", registryEntries: (count) => `レジストリ登録 ${count} 件`, filingEligible: (count) => `提出書類の収録対象 ${count} 件`, snapshotAvailable: (count) => `スナップショット収録 ${count} 件` },
  proof: { label: "トークンから提出書類までの根拠", token: "トークン", underlyingCompany: "原資産の企業", filing: "提出書類", issuerVerified: "発行者確認済み", issuerUnavailable: "発行者の状態を確認できません", identityVerified: "企業識別情報の出典確認済み", noIdentity: "出典確認済みの企業識別情報なし", noCompany: "確認済みの企業識別情報なし", filed: (date, authority) => `提出日 ${date} · ${authority}`, openFiling: (company, year, form) => `${company} ${year} ${form} を開く`, noFilingContext: "この結果には、確認済みの提出書類の出典情報がありません。" },
  facts: { eyebrow: "財務データ", heading: "出典確認済みの財務データ", sourceVerified: "出典確認済み", factLabels: { revenue: "売上高", net_income_parent: "親会社に帰属する純利益", total_assets: "資産合計", total_liabilities: "負債合計", operating_cf: "営業キャッシュフロー" }, scale: (value) => `スケール ${value}`, duration: "期間", instant: "時点", fromTo: (start, end) => `${start} から ${end}`, asOf: (date) => `${date} 時点`, filedLink: (form, date) => `${form}、提出日 ${date}`, opensNewTab: "（新しいタブで開きます）" },
  mcp: { eyebrow: "ローカル MCP", heading: "エージェントでBentenを使う", description: "このリポジトリからビルドし、ローカルサーバーをMCPクライアントに追加します。", copy: "ローカルコマンドをコピー", copied: "コピーしました", unavailable: "コピーできません" },
  states: { legacyTitle: "レガシースナップショット", unverified: "未確認", legacyExplanation: "これらの値について、提出日、単位、出典、報告値か計算値かの状態は未確認です。", legacyAsOf: (date, year) => `${date} 時点${year ? ` · FY${year}` : ""}`, noDataHeading: "現在の財務データなし", noData: (ticker) => `${ticker} は提出書類の収録対象ですが、現在のBentenスナップショットには財務データがありません。`, ineligibleHeading: "提出書類の収録対象外", unknownHeading: "mint が見つかりません", unknown: "このmintは現在のBentenレジストリにありません。", invalidHeading: "mintを照会できません", invalid: "有効なSolanaアドレスを入力してください。", serviceHeading: "スナップショットを利用できません", service: "Bentenは現在の公開スナップショットを読み取れませんでした。もう一度お試しください。", outcome: { found: "mint を照会しました。", noData: "現在の財務データなし。", ineligible: "提出書類の収録対象外です。", service: "スナップショットを利用できません。", unable: "mintを照会できません。" } },
  exclusions: { etf: "上場投資信託（ETF）", non_sec_listing: "SEC 報告制度対象外の上場銘柄", private: "非公開企業", preferred: "優先株式クラス", unspecified: "未指定", explanations: { etf: "上場投資信託です。このティッカーに対応する会社単位のSEC財務諸表は、現在のBenten収録対象にありません。", non_sec_listing: "Bentenが対象とするSEC報告制度の範囲外で上場しています。", private: "非公開企業です。現在Bentenで利用できるSEC提出書類の収録対象ではありません。", preferred: "現在のBenten収録対象に独自の提出書類セットがない優先株式クラスです。", unspecified: "このティッカーに対するSEC財務諸表は、現在のBenten収録対象にありません。" } },
  badges: { financials: "財務データ対象", noFilings: "Bentenの提出書類対象外" },
  stock: { back: "すべてのxStocks", companyPageLink: (name) => `${name}に対応付けたすべての金融商品を見る`, registryRecord: "レジストリの登録情報", registryNote: "Benten xStocksレジストリに収録された、トークン自体に関する静的な登録情報です。", underlyingTicker: "原資産のティッカー", tokenSymbol: "トークンシンボル", tokenName: "トークン名", mint: "Mint", issuer: "発行者", issuerVerified: "発行者確認済み", tokenDecimals: "トークンの小数桁数", coverageHeading: "現在のBentenカバレッジ", coverageNote: "このトークンは、Bentenの現在の提出書類収録対象の範囲外です。", noCoverageHeading: "現在のBenten財務カバレッジなし", noCoverage: "レジストリの登録情報は利用できますが、このトークンには現在のBenten提出書類対象の財務カバレッジがありません。", legacyHeading: "レガシースナップショット", legacyUnavailable: "レジストリの登録情報は利用できますが、現在のレガシースナップショットはありません。", legacyNote: (asOf, source) => `${asOf} 時点。出典: ${source}。これらの値について、提出日、単位、出典、報告値か計算値かの状態は未確認です。`, legacySource: "Benten 従来版財務スナップショット。提出書類の出典、単位、値の種別は未確認", value: "値", true: "はい", false: "いいえ" },
  legacy: { fields: { company_name: "企業名", metrics_fiscal_year: "会計年度", revenue: "売上高", op_income: "営業利益", gross_profit: "売上総利益", net_income_parent: "純利益（親会社）", total_assets: "資産合計", total_equity: "資本合計", total_liabilities: "負債合計", long_term_debt: "長期債務", operating_cf: "営業キャッシュフロー", investing_cf: "投資キャッシュフロー", fcf: "フリーキャッシュフロー" }, groups: { entity: "企業情報", income: "損益計算書", balance: "貸借対照表", cashflow: "キャッシュフロー" } },
  providers: { nav: "他プロバイダー", home: { byCompany: "企業別:", eyebrow: "他プロバイダー", heading: "他プロバイダーによる未公開企業の参考情報", note: "PreStocks と Tessera が自社商品について公表している識別情報、権利に関する主張、参考値です。xStocks ではなく、気配値や評価額でもなく、Benten が検証したものでもありません。", provider: "プロバイダー", symbol: "シンボル", underlyingCompany: "原資産の企業", instrument: "商品の種別", rights: "権利", reference: "参考値", observed: "取得時点", referenceLabel: "プロバイダー参考値", referenceUnknowns: "通貨不明・プロバイダー基準時点不明", noReference: "参考値なし", fetched: (date) => `${date} 取得` }, names: { prestocks: "PreStocks", tessera: "Tessera" }, instrumentKinds: { tracker_certificate: "トラッカー証券", economic_exposure_instrument: "経済的エクスポージャー商品", loan_participation_token: "ローン参加トークン", unknown: "不明" }, rightsStatus: { public_source_verified: "公開情報で確認済み", provider_terms_observed: "プロバイダー規約を確認", provider_claim_only: "プロバイダーの主張のみ", unknown: "不明" }, bindingStatus: { public_source_verified: "公開情報で確認済み", provider_claim_only: "プロバイダーの主張のみ", unknown: "不明" }, redemption: { provider_terms: "プロバイダー規約による", conditional: "条件付き", none: "なし", unknown: "不明" }, restrictions: { provider_terms_not_reviewed: "プロバイダー規約は Benten で未確認", no_public_source_verification: "公開情報による検証なし" }, underlyingKinds: { openai: "OpenAI", kalshi: "Kalshi", spacex: "SpaceX" }, referenceKinds: { prestock_mark_reference: "マーク参考値", prestock_token_reference: "トークン参考値", prestock_implied_valuation_reference: "推定評価額の参考値", tessera_auction_price_reference: "オークション参考値", tessera_auction_valuation_reference: "オークション評価額の参考値" }, unknownCodes: { source_as_of_unknown: "プロバイダーの基準時点が不明", currency_unknown: "通貨が不明", rights_unknown: "権利内容が不明", company_binding_unknown: "企業との対応関係が不明", chain_identity_unknown: "オンチェーンの識別情報が未検証", provider_catalog_mismatch: "プロバイダーのカタログが不一致", redistribution_pending: "再配布の可否を確認中", execution_quote_unavailable: "プロバイダーの約定参考値を取得できません", asset_not_found: "資産が見つかりません" }, blocks: { display: "表示", comparison: "比較", release: "リリース" }, page: { back: "他プロバイダーの参考情報", companyPageLink: (name) => `${name}に対応付けたすべての金融商品を見る`, identityHeading: "識別情報", provider: "プロバイダー", symbol: "シンボル", displayName: "表示名", instrument: "商品の種別", contract: "コントラクト／mint アドレス", copy: "アドレスをコピー", copied: "コピーしました", copyUnavailable: "コピーできません", externalLink: (provider) => `${provider} のページでこの商品を開く`, opensNewTab: "（新しいタブで開きます）", companyHeading: "原資産の企業", company: "企業", binding: "対応関係の状態", noFilingCoverage: "この非公開企業について、Benten は SEC 提出書類を収録していません。", underlyingKind: "原資産の区分", rightsHeading: "権利", rightsStatusLabel: "権利情報の状態", equityOwnership: "株式の所有権", votingRights: "議決権", redemption: "償還", unknownValue: "不明", noValue: "なし", statementAttribution: (provider) => `${provider} による記載:`, terms: "プロバイダー規約", restrictionsLabel: "制限事項", referencesHeading: "参考値", referencesNote: "プロバイダーが公表する参考値です。約定可能な気配値、NAV、評価額、目標価格のいずれでもありません。", referenceColumn: "参考値の種類", valueColumn: "プロバイダー公表値", currencyColumn: "通貨", asOfColumn: "プロバイダーの基準時点", fetchedColumn: "取得日", supplyHeading: "プロバイダー公表の供給量", supplyReference: "供給量の参考値", noReferences: "このプロバイダーは、この商品について参考値を公表していません。", unknownsHeading: "不明な項目", blocksLabel: (blocks) => `verified への昇格を妨げる対象: ${blocks}`, notXStock: "xStocks のトークンではありません。" }, metadata: { title: (symbol, provider) => `${symbol} — ${provider} の参考情報`, description: (name, provider) => `${provider} が公表する ${name} の識別情報、権利に関する主張、参考値。事実情報のみで、気配値・評価額・xStocks トークンではありません。` } },
  company: companyJa,
  notFound: { heading: "レジストリに登録されていません", body: "このティッカーはBentenが把握するxStocksトークンに含まれていません。Bentenは静的な許可リストにあるティッカーのみを照会し、未登録の入力がデータソースへ送られることはありません。", back: "すべてのxStocks" },
  error: { heading: "このページを読み込めません", body: "Bentenはこの公開ページを読み込めませんでした。もう一度お試しください。", retry: "再試行", home: "ホームへ戻る" },
  purchase: purchaseJa,
};

const ko: MessageCatalog = {
  metadata: { title: "Benten — Solana xStocks의 오픈 재무 데이터", description: "Solana xStocks의 오픈 재무 데이터입니다." },
  navigation: { primary: "기본 탐색", mobile: "모바일 탐색", howItWorks: "작동 방식", registry: "레지스트리", mobileMenu: "메뉴", language: "언어", currentLanguage: (language) => `현재 언어: ${language}` },
  footer: { disclaimer: "사실 데이터만 제공합니다. 투자 조언, 추천 또는 가치평가가 아닙니다.", walletUnavailable: "Benten은 트랜잭션에 서명하거나 전송하지 않습니다. 구매는 본인의 지갑에서 승인되고 전송됩니다." },
  home: { eyebrow: "공개 재무 데이터", heading: "Solana mint에서 제출 공시까지.", supporting: "에이전트를 위해 토큰 식별 정보, 기초자산 기업 및 출처 기반 재무 데이터를 조회합니다. 사실 데이터만 제공합니다.", reassurance: "지갑이 필요하지 않습니다.", lookupLabel: "xStocks mint", resolve: "mint 조회", resolving: "조회 중…", tryNvda: "NVDA 사용해 보기", registryHeading: "xStocks 전체 레지스트리", registryDescription: "모든 항목은 mint에서 제출 공시까지의 흐름 아래에 남아 있습니다. 공시 수록 대상 여부와 현재 스냅샷 수록 여부를 구분합니다.", ticker: "티커", name: "이름", token: "토큰", filingEligibility: "공시 수록 대상", snapshot: "스냅샷", available: "수록됨", noCurrentRow: "현재 레코드 없음", structuralExclusions: "분류에 따른 제외 항목", browseRegistry: "레지스트리 보기", registryEntries: (count) => `레지스트리 등록 ${count}개`, filingEligible: (count) => `공시 수록 대상 ${count}개`, snapshotAvailable: (count) => `스냅샷 수록 ${count}개` },
  proof: { label: "토큰에서 제출 공시까지의 근거", token: "토큰", underlyingCompany: "기초자산 기업", filing: "제출 공시", issuerVerified: "발행자 확인됨", issuerUnavailable: "발행자 상태를 확인할 수 없음", identityVerified: "기업 식별 정보의 출처 확인됨", noIdentity: "출처가 확인된 기업 식별 정보 없음", noCompany: "확인된 기업 식별 정보 없음", filed: (date, authority) => `제출일 ${date} · ${authority}`, openFiling: (company, year, form) => `${company} ${year} ${form} 열기`, noFilingContext: "이 결과에는 확인된 제출 공시 정보가 없습니다." },
  facts: { eyebrow: "재무 데이터", heading: "출처가 확인된 재무 데이터", sourceVerified: "출처 확인됨", factLabels: { revenue: "매출액", net_income_parent: "지배기업에 귀속되는 순이익", total_assets: "자산총계", total_liabilities: "부채총계", operating_cf: "영업활동 현금흐름" }, scale: (value) => `스케일 ${value}`, duration: "기간", instant: "시점", fromTo: (start, end) => `${start}부터 ${end}까지`, asOf: (date) => `${date} 기준`, filedLink: (form, date) => `${form}, 제출일 ${date}`, opensNewTab: "(새 탭에서 열림)" },
  mcp: { eyebrow: "로컬 MCP", heading: "에이전트에서 Benten 사용하기", description: "이 저장소에서 빌드한 뒤 로컬 서버를 MCP 클라이언트에 추가합니다.", copy: "로컬 명령 복사", copied: "복사됨", unavailable: "복사할 수 없음" },
  states: { legacyTitle: "기존 스냅샷", unverified: "미확인", legacyExplanation: "이 값의 제출일, 단위, 출처 및 보고값인지 계산값인지의 상태는 확인되지 않았습니다.", legacyAsOf: (date, year) => `${date} 기준${year ? ` · FY${year}` : ""}`, noDataHeading: "현재 재무 데이터 없음", noData: (ticker) => `${ticker}는 공시 수록 대상이지만 현재 Benten 스냅샷에는 해당 재무 데이터가 없습니다.`, ineligibleHeading: "공시 수록 대상 아님", unknownHeading: "mint를 찾을 수 없음", unknown: "이 mint는 현재 Benten 레지스트리에 없습니다.", invalidHeading: "mint를 조회할 수 없음", invalid: "유효한 Solana 주소를 입력하세요.", serviceHeading: "스냅샷을 사용할 수 없음", service: "Benten이 현재 공개 스냅샷을 읽을 수 없습니다. 다시 시도하세요.", outcome: { found: "mint 조회가 완료되었습니다.", noData: "현재 재무 데이터 없음.", ineligible: "공시 수록 대상 아님.", service: "스냅샷을 사용할 수 없음.", unable: "mint를 조회할 수 없음." } },
  exclusions: { etf: "상장지수펀드(ETF)", non_sec_listing: "SEC 보고 제도 대상 외 상장 종목", private: "비공개 기업", preferred: "우선주 종류", unspecified: "미지정", explanations: { etf: "상장지수펀드입니다. 이 티커의 기업 단위 SEC 재무제표는 현재 Benten 수록 대상에 없습니다.", non_sec_listing: "Benten이 다루는 SEC 보고 제도의 범위 밖에 상장된 종목입니다.", private: "비공개 기업입니다. 현재 Benten에서 이용 가능한 SEC 제출 공시 수록 대상이 아닙니다.", preferred: "현재 Benten 수록 대상에 독립적인 제출 공시 묶음이 없는 우선주 종류입니다.", unspecified: "이 티커의 SEC 재무제표는 현재 Benten 수록 대상에 없습니다." } },
  badges: { financials: "재무 데이터 대상", noFilings: "Benten 공시 수록 대상 아님" },
  stock: { back: "전체 xStocks", companyPageLink: (name) => `${name}에 연결된 모든 상품 보기`, registryRecord: "레지스트리 등록 정보", registryNote: "Benten xStocks 레지스트리에 수록된 토큰 자체에 관한 정적 등록 정보입니다.", underlyingTicker: "기초자산 티커", tokenSymbol: "토큰 심볼", tokenName: "토큰 이름", mint: "Mint", issuer: "발행자", issuerVerified: "발행자 확인됨", tokenDecimals: "토큰 소수 자릿수", coverageHeading: "현재 Benten 수록 범위", coverageNote: "이 토큰은 현재 Benten의 공시 수록 대상 범위 밖에 있습니다.", noCoverageHeading: "현재 Benten 재무 데이터 없음", noCoverage: "레지스트리 등록 정보는 이용할 수 있지만 이 토큰의 현재 Benten 공시 수록 대상 재무 데이터는 없습니다.", legacyHeading: "기존 스냅샷", legacyUnavailable: "레지스트리 등록 정보는 이용할 수 있지만 현재 기존 스냅샷은 없습니다.", legacyNote: (asOf, source) => `${asOf} 기준. 출처: ${source}. 이 값의 제출일, 단위, 출처 및 보고값인지 계산값인지의 상태는 확인되지 않았습니다.`, legacySource: "Benten 기존 재무 스냅샷. 공시 출처, 단위 및 값의 유형은 미확인", value: "값", true: "예", false: "아니요" },
  legacy: { fields: { company_name: "기업명", metrics_fiscal_year: "회계연도", revenue: "매출액", op_income: "영업이익", gross_profit: "매출총이익", net_income_parent: "순이익(지배기업)", total_assets: "자산총계", total_equity: "자본총계", total_liabilities: "부채총계", long_term_debt: "장기부채", operating_cf: "영업활동 현금흐름", investing_cf: "투자활동 현금흐름", fcf: "잉여현금흐름" }, groups: { entity: "기업 정보", income: "손익계산서", balance: "재무상태표", cashflow: "현금흐름" } },
  providers: { nav: "다른 제공자", home: { byCompany: "기업별:", eyebrow: "다른 제공자", heading: "다른 제공자가 공개한 비상장 기업 참고 정보", note: "PreStocks와 Tessera가 자사 상품에 대해 공개한 식별 정보, 권리 주장, 참고 값입니다. xStocks가 아니며, 호가나 평가액도 아니고, Benten이 검증한 것도 아닙니다.", provider: "제공자", symbol: "심볼", underlyingCompany: "기초 기업", instrument: "상품 유형", rights: "권리", reference: "참고 값", observed: "수집 시점", referenceLabel: "제공자 참고 값", referenceUnknowns: "통화 불명 · 제공자 기준 시점 불명", noReference: "참고 값 없음", fetched: (date) => `${date} 수집` }, names: { prestocks: "PreStocks", tessera: "Tessera" }, instrumentKinds: { tracker_certificate: "트래커 증권", economic_exposure_instrument: "경제적 익스포저 상품", loan_participation_token: "대출 참가 토큰", unknown: "알 수 없음" }, rightsStatus: { public_source_verified: "공개 출처로 확인됨", provider_terms_observed: "제공자 약관 확인됨", provider_claim_only: "제공자 주장만 있음", unknown: "알 수 없음" }, bindingStatus: { public_source_verified: "공개 출처로 확인됨", provider_claim_only: "제공자 주장만 있음", unknown: "알 수 없음" }, redemption: { provider_terms: "제공자 약관에 따름", conditional: "조건부", none: "없음", unknown: "알 수 없음" }, restrictions: { provider_terms_not_reviewed: "제공자 약관을 Benten이 검토하지 않음", no_public_source_verification: "공개 출처 검증 없음" }, underlyingKinds: { openai: "OpenAI", kalshi: "Kalshi", spacex: "SpaceX" }, referenceKinds: { prestock_mark_reference: "마크 참고 값", prestock_token_reference: "토큰 참고 값", prestock_implied_valuation_reference: "추정 기업가치 참고 값", tessera_auction_price_reference: "경매 참고 값", tessera_auction_valuation_reference: "경매 기업가치 참고 값" }, unknownCodes: { source_as_of_unknown: "제공자 기준 시점 알 수 없음", currency_unknown: "통화 알 수 없음", rights_unknown: "권리 내용 알 수 없음", company_binding_unknown: "기업 연결 관계 알 수 없음", chain_identity_unknown: "온체인 식별 정보 미검증", provider_catalog_mismatch: "제공자 카탈로그 불일치", redistribution_pending: "재배포 검토 진행 중", execution_quote_unavailable: "제공자 체결 참고 값을 이용할 수 없음", asset_not_found: "자산을 찾을 수 없음" }, blocks: { display: "표시", comparison: "비교", release: "릴리스" }, page: { back: "다른 제공자 참고 정보", companyPageLink: (name) => `${name}에 연결된 모든 상품 보기`, identityHeading: "식별 정보", provider: "제공자", symbol: "심볼", displayName: "표시 이름", instrument: "상품 유형", contract: "컨트랙트 또는 mint 주소", copy: "주소 복사", copied: "복사했습니다", copyUnavailable: "복사할 수 없습니다", externalLink: (provider) => `${provider}에서 이 상품 열기`, opensNewTab: "(새 탭에서 열립니다)", companyHeading: "기초 기업", company: "기업", binding: "연결 상태", noFilingCoverage: "이 비상장 기업에 대해 Benten은 SEC 제출 서류를 수록하고 있지 않습니다.", underlyingKind: "기초 자산 구분", rightsHeading: "권리", rightsStatusLabel: "권리 정보 상태", equityOwnership: "지분 소유권", votingRights: "의결권", redemption: "상환", unknownValue: "알 수 없음", noValue: "없음", statementAttribution: (provider) => `${provider}의 설명:`, terms: "제공자 약관", restrictionsLabel: "제한 사항", referencesHeading: "참고 값", referencesNote: "제공자가 공개한 참고 값입니다. 체결 가능한 호가, NAV, 기업가치 평가, 목표가가 아닙니다.", referenceColumn: "참고 값 종류", valueColumn: "제공자 공개 값", currencyColumn: "통화", asOfColumn: "제공자 기준 시점", fetchedColumn: "수집일", supplyHeading: "제공자가 공개한 공급량", supplyReference: "공급량 참고 값", noReferences: "이 제공자는 해당 상품의 참고 값을 공개하지 않습니다.", unknownsHeading: "알 수 없는 항목", blocksLabel: (blocks) => `verified 승격을 막는 대상: ${blocks}`, notXStock: "xStocks 토큰이 아닙니다." }, metadata: { title: (symbol, provider) => `${symbol} — ${provider} 참고 정보`, description: (name, provider) => `${provider}가 공개한 ${name}의 식별 정보, 권리 주장, 참고 값. 사실 정보만 제공하며 호가, 평가액, xStocks 토큰이 아닙니다.` } },
  company: companyKo,
  notFound: { heading: "레지스트리에 등록되지 않음", body: "이 티커는 Benten이 인식하는 xStocks 토큰에 포함되지 않습니다. Benten은 정적 허용 목록에 있는 티커만 조회하며, 등록되지 않은 입력은 어떤 데이터 소스에도 전달되지 않습니다.", back: "전체 xStocks" },
  error: { heading: "이 페이지를 불러올 수 없음", body: "Benten이 이 공개 페이지를 불러올 수 없습니다. 다시 시도하세요.", retry: "다시 시도", home: "홈으로" },
  purchase: purchaseKo,
};

const zhHans: MessageCatalog = {
  metadata: { title: "Benten — Solana xStocks 的开源财务数据", description: "Solana xStocks 的开源财务数据。" },
  navigation: { primary: "主导航", mobile: "移动导航", howItWorks: "工作方式", registry: "注册表", mobileMenu: "菜单", language: "语言", currentLanguage: (language) => `当前语言：${language}` },
  footer: { disclaimer: "仅提供事实数据，不构成投资建议、推荐或估值。", walletUnavailable: "Benten 从不签名或发送交易。购买由你自己的钱包批准并发送。" },
  home: { eyebrow: "公开财务数据", heading: "从 Solana mint 到披露文件。", supporting: "为智能体查询代币身份、底层企业和有来源依据的财务数据。仅提供事实数据。", reassurance: "无需钱包。", lookupLabel: "xStocks mint", resolve: "查询 mint", resolving: "查询中…", tryNvda: "试用 NVDA", registryHeading: "完整 xStocks 注册表", registryDescription: "所有条目都保留在 mint 到披露文件的流程下方。状态标签区分披露文件收录范围和当前快照收录情况。", ticker: "代码", name: "名称", token: "代币", filingEligibility: "披露文件收录范围", snapshot: "快照", available: "已收录", noCurrentRow: "当前无记录", structuralExclusions: "按类别排除的项目", browseRegistry: "浏览注册表", registryEntries: (count) => `注册表条目 ${count} 条`, filingEligible: (count) => `披露文件收录范围内 ${count} 条`, snapshotAvailable: (count) => `快照已收录 ${count} 条` },
  proof: { label: "代币与披露文件的关联依据", token: "代币", underlyingCompany: "底层企业", filing: "披露文件", issuerVerified: "已确认发行方", issuerUnavailable: "无法获取发行方状态", identityVerified: "已核对企业身份信息来源", noIdentity: "无已核对来源的企业身份信息", noCompany: "无已核实的企业身份信息", filed: (date, authority) => `提交日期 ${date} · ${authority}`, openFiling: (company, year, form) => `打开 ${company} ${year} ${form}`, noFilingContext: "此结果中没有已核实的披露文件信息。" },
  facts: { eyebrow: "财务数据", heading: "已核对来源的财务数据", sourceVerified: "已核对来源", factLabels: { revenue: "营业收入", net_income_parent: "归属于母公司的净利润", total_assets: "资产总额", total_liabilities: "负债总额", operating_cf: "经营活动现金流量" }, scale: (value) => `缩放系数 ${value}`, duration: "期间", instant: "时点", fromTo: (start, end) => `${start} 至 ${end}`, asOf: (date) => `截至 ${date}`, filedLink: (form, date) => `${form}，提交日期 ${date}`, opensNewTab: "（在新标签页中打开）" },
  mcp: { eyebrow: "本地 MCP", heading: "在智能体中使用 Benten", description: "从此仓库构建后，将本地服务器添加到 MCP 客户端。", copy: "复制本地命令", copied: "已复制", unavailable: "无法复制" },
  states: { legacyTitle: "旧版快照", unverified: "未经核实", legacyExplanation: "这些数值的提交日期、单位、来源，以及属于报告值还是计算值的状态均未经核实。", legacyAsOf: (date, year) => `截至 ${date}${year ? ` · FY${year}` : ""}`, noDataHeading: "当前无财务记录", noData: (ticker) => `${ticker} 属于披露文件收录范围，但当前 Benten 快照中没有其财务记录。`, ineligibleHeading: "不在披露文件收录范围内", unknownHeading: "未找到 mint", unknown: "此 mint 不在当前 Benten 注册表中。", invalidHeading: "无法查询 mint", invalid: "请输入有效的 Solana 地址。", serviceHeading: "快照暂不可用", service: "Benten 无法读取当前公开快照，请重试。", outcome: { found: "mint 查询完成。", noData: "当前无财务记录。", ineligible: "不在披露文件收录范围内。", service: "快照暂不可用。", unable: "无法查询 mint。" } },
  exclusions: { etf: "交易所交易基金（ETF）", non_sec_listing: "SEC 报告制度范围外的上市标的", private: "非上市公司", preferred: "优先股类别", unspecified: "未指定", explanations: { etf: "这是交易所交易基金，此代码的企业层面 SEC 财务报表不在当前 Benten 收录范围内。", non_sec_listing: "该标的在 Benten 覆盖的 SEC 报告制度范围之外上市。", private: "这是非上市公司，当前不在 Benten 的 SEC 披露文件收录范围内。", preferred: "该优先股类别在当前 Benten 收录范围内没有独立披露文件集。", unspecified: "此代码的 SEC 财务报表当前不在 Benten 收录范围内。" } },
  badges: { financials: "财务数据收录对象", noFilings: "不在 Benten 披露文件收录范围内" },
  stock: { back: "所有 xStocks", companyPageLink: (name) => `查看关联到 ${name} 的全部金融工具`, registryRecord: "注册表记录", registryNote: "来自 Benten xStocks 注册表、有关代币本身的静态登记信息。", underlyingTicker: "底层资产代码", tokenSymbol: "代币符号", tokenName: "代币名称", mint: "Mint", issuer: "发行方", issuerVerified: "已确认发行方", tokenDecimals: "代币小数位数", coverageHeading: "当前 Benten 收录范围", coverageNote: "此代币不在当前 Benten 的披露文件收录范围内。", noCoverageHeading: "当前无 Benten 财务数据", noCoverage: "注册表记录仍可使用；此代币当前没有 Benten 披露文件收录范围内的财务数据。", legacyHeading: "旧版快照", legacyUnavailable: "注册表记录仍可使用，但当前没有旧版快照。", legacyNote: (asOf, source) => `截至 ${asOf}。来源：${source}。这些数值的提交日期、单位、来源，以及属于报告值还是计算值的状态均未经核实。`, legacySource: "Benten 旧版财务快照；披露文件来源、单位和数值类型未经核实", value: "数值", true: "是", false: "否" },
  legacy: { fields: { company_name: "企业名称", metrics_fiscal_year: "财年", revenue: "营业收入", op_income: "营业利润", gross_profit: "毛利润", net_income_parent: "净利润（母公司）", total_assets: "资产总额", total_equity: "权益总额", total_liabilities: "负债总额", long_term_debt: "长期债务", operating_cf: "经营活动现金流量", investing_cf: "投资活动现金流量", fcf: "自由现金流" }, groups: { entity: "企业信息", income: "利润表", balance: "资产负债表", cashflow: "现金流量" } },
  providers: { nav: "其他发行方", home: { byCompany: "按公司：", eyebrow: "其他发行方", heading: "其他发行方公布的未上市公司参考信息", note: "以下是 PreStocks 和 Tessera 就自家产品公布的标识信息、权利主张与参考数值。它们不是 xStocks，不是报价或估值，也未经 Benten 核实。", provider: "发行方", symbol: "代号", underlyingCompany: "标的公司", instrument: "产品类型", rights: "权利", reference: "参考值", observed: "抓取时点", referenceLabel: "发行方参考值", referenceUnknowns: "币种未知 · 发行方基准时点未知", noReference: "暂无参考值", fetched: (date) => `抓取于 ${date}` }, names: { prestocks: "PreStocks", tessera: "Tessera" }, instrumentKinds: { tracker_certificate: "跟踪凭证", economic_exposure_instrument: "经济敞口工具", loan_participation_token: "贷款参与代币", unknown: "未知" }, rightsStatus: { public_source_verified: "已由公开来源核实", provider_terms_observed: "已查阅发行方条款", provider_claim_only: "仅为发行方主张", unknown: "未知" }, bindingStatus: { public_source_verified: "已由公开来源核实", provider_claim_only: "仅为发行方主张", unknown: "未知" }, redemption: { provider_terms: "依发行方条款", conditional: "附条件", none: "无", unknown: "未知" }, restrictions: { provider_terms_not_reviewed: "Benten 尚未审阅发行方条款", no_public_source_verification: "没有公开来源核实" }, underlyingKinds: { openai: "OpenAI", kalshi: "Kalshi", spacex: "SpaceX" }, referenceKinds: { prestock_mark_reference: "标记参考值", prestock_token_reference: "代币参考值", prestock_implied_valuation_reference: "隐含估值参考值", tessera_auction_price_reference: "拍卖参考值", tessera_auction_valuation_reference: "拍卖估值参考值" }, unknownCodes: { source_as_of_unknown: "发行方基准时点未知", currency_unknown: "币种未知", rights_unknown: "权利内容未知", company_binding_unknown: "公司对应关系未知", chain_identity_unknown: "链上标识未经核实", provider_catalog_mismatch: "发行方目录不一致", redistribution_pending: "再分发审核待定", execution_quote_unavailable: "发行方成交参考值不可用", asset_not_found: "未找到该资产" }, blocks: { display: "展示", comparison: "比较", release: "发布" }, page: { back: "其他发行方参考信息", companyPageLink: (name) => `查看关联到 ${name} 的全部金融工具`, identityHeading: "标识信息", provider: "发行方", symbol: "代号", displayName: "显示名称", instrument: "产品类型", contract: "合约或 mint 地址", copy: "复制地址", copied: "已复制", copyUnavailable: "无法复制", externalLink: (provider) => `在 ${provider} 打开该产品`, opensNewTab: "（在新标签页中打开）", companyHeading: "标的公司", company: "公司", binding: "对应关系状态", noFilingCoverage: "对于这家未上市公司，Benten 没有收录任何 SEC 提交文件。", underlyingKind: "标的类别", rightsHeading: "权利", rightsStatusLabel: "权利信息状态", equityOwnership: "股权所有权", votingRights: "表决权", redemption: "赎回", unknownValue: "未知", noValue: "无", statementAttribution: (provider) => `${provider} 的说明：`, terms: "发行方条款", restrictionsLabel: "限制事项", referencesHeading: "参考数值", referencesNote: "发行方公布的参考数值。不是可成交报价、净值、估值或目标价。", referenceColumn: "参考值类型", valueColumn: "发行方公布值", currencyColumn: "币种", asOfColumn: "发行方基准时点", fetchedColumn: "抓取日期", supplyHeading: "发行方公布的供应量", supplyReference: "供应量参考值", noReferences: "该发行方未公布这项产品的参考数值。", unknownsHeading: "未知项", blocksLabel: (blocks) => `阻碍升级为 verified：${blocks}`, notXStock: "这不是 xStocks 代币。" }, metadata: { title: (symbol, provider) => `${symbol} — ${provider} 参考信息`, description: (name, provider) => `${provider} 公布的 ${name} 标识信息、权利主张与参考数值。仅提供事实信息，不是报价、估值或 xStocks 代币。` } },
  company: companyZhHans,
  notFound: { heading: "未收录于注册表", body: "此代码不属于 Benten 已知的 xStocks 代币。Benten 仅查询静态允许列表中的代码，未收录的输入不会传递给任何数据源。", back: "所有 xStocks" },
  error: { heading: "无法加载此页面", body: "Benten 无法加载此公开页面，请重试。", retry: "重试", home: "返回首页" },
  purchase: purchaseZhHans,
};

const zhHant: MessageCatalog = {
  metadata: { title: "Benten — Solana xStocks 的開源財務資料", description: "Solana xStocks 的開源財務資料。" },
  navigation: { primary: "主要導覽", mobile: "行動導覽", howItWorks: "運作方式", registry: "登錄表", mobileMenu: "選單", language: "語言", currentLanguage: (language) => `目前語言：${language}` },
  footer: { disclaimer: "僅提供事實資料，不構成投資建議、推薦或估值。", walletUnavailable: "Benten 從不簽署或傳送交易。購買由你自己的錢包核准並傳送。" },
  home: { eyebrow: "公開財務資料", heading: "從 Solana mint 到揭露文件。", supporting: "為代理程式查詢代幣身分、底層企業及有來源依據的財務資料。僅提供事實資料。", reassurance: "無需錢包。", lookupLabel: "xStocks mint", resolve: "查詢 mint", resolving: "查詢中…", tryNvda: "試用 NVDA", registryHeading: "完整 xStocks 登錄表", registryDescription: "所有項目都保留在 mint 到揭露文件的流程下方。狀態標籤區分揭露文件收錄範圍與目前快照收錄情況。", ticker: "代碼", name: "名稱", token: "代幣", filingEligibility: "揭露文件收錄範圍", snapshot: "快照", available: "已收錄", noCurrentRow: "目前無紀錄", structuralExclusions: "依類別排除的項目", browseRegistry: "瀏覽登錄表", registryEntries: (count) => `登錄表項目 ${count} 筆`, filingEligible: (count) => `揭露文件收錄範圍內 ${count} 筆`, snapshotAvailable: (count) => `快照已收錄 ${count} 筆` },
  proof: { label: "代幣與揭露文件的關聯依據", token: "代幣", underlyingCompany: "底層企業", filing: "揭露文件", issuerVerified: "已確認發行方", issuerUnavailable: "無法取得發行方狀態", identityVerified: "已核對企業身分資訊來源", noIdentity: "無已核對來源的企業身分資訊", noCompany: "無已核實的企業身分資訊", filed: (date, authority) => `提交日期 ${date} · ${authority}`, openFiling: (company, year, form) => `開啟 ${company} ${year} ${form}`, noFilingContext: "此結果中沒有已核實的揭露文件資訊。" },
  facts: { eyebrow: "財務資料", heading: "已核對來源的財務資料", sourceVerified: "已核對來源", factLabels: { revenue: "營收", net_income_parent: "歸屬於母公司的淨利", total_assets: "資產總額", total_liabilities: "負債總額", operating_cf: "營業活動現金流量" }, scale: (value) => `縮放係數 ${value}`, duration: "期間", instant: "時點", fromTo: (start, end) => `${start} 至 ${end}`, asOf: (date) => `截至 ${date}`, filedLink: (form, date) => `${form}，提交日期 ${date}`, opensNewTab: "（在新分頁中開啟）" },
  mcp: { eyebrow: "本機 MCP", heading: "在代理程式中使用 Benten", description: "從此儲存庫建置後，將本機伺服器加入 MCP 用戶端。", copy: "複製本機命令", copied: "已複製", unavailable: "無法複製" },
  states: { legacyTitle: "舊版快照", unverified: "未經核實", legacyExplanation: "這些數值的提交日期、單位、來源，以及屬於報告值還是計算值的狀態均未經核實。", legacyAsOf: (date, year) => `截至 ${date}${year ? ` · FY${year}` : ""}`, noDataHeading: "目前無財務紀錄", noData: (ticker) => `${ticker} 屬於揭露文件收錄範圍，但目前 Benten 快照中沒有其財務紀錄。`, ineligibleHeading: "不在揭露文件收錄範圍內", unknownHeading: "找不到 mint", unknown: "此 mint 不在目前 Benten 登錄表中。", invalidHeading: "無法查詢 mint", invalid: "請輸入有效的 Solana 位址。", serviceHeading: "快照目前無法使用", service: "Benten 無法讀取目前公開快照，請再試一次。", outcome: { found: "mint 查詢完成。", noData: "目前無財務紀錄。", ineligible: "不在揭露文件收錄範圍內。", service: "快照目前無法使用。", unable: "無法查詢 mint。" } },
  exclusions: { etf: "交易所交易基金（ETF）", non_sec_listing: "SEC 報告制度範圍外的上市標的", private: "非上市公司", preferred: "特別股類別", unspecified: "未指定", explanations: { etf: "這是交易所交易基金，此代碼的企業層級 SEC 財務報表不在目前 Benten 收錄範圍內。", non_sec_listing: "該標的在 Benten 涵蓋的 SEC 報告制度範圍之外上市。", private: "這是非上市公司，目前不在 Benten 的 SEC 揭露文件收錄範圍內。", preferred: "該特別股類別在目前 Benten 收錄範圍內沒有獨立揭露文件集。", unspecified: "此代碼的 SEC 財務報表目前不在 Benten 收錄範圍內。" } },
  badges: { financials: "財務資料收錄對象", noFilings: "不在 Benten 揭露文件收錄範圍內" },
  stock: { back: "所有 xStocks", companyPageLink: (name) => `查看關聯到 ${name} 的全部金融工具`, registryRecord: "登錄表紀錄", registryNote: "來自 Benten xStocks 登錄表、有關代幣本身的靜態登錄資訊。", underlyingTicker: "底層資產代碼", tokenSymbol: "代幣符號", tokenName: "代幣名稱", mint: "Mint", issuer: "發行方", issuerVerified: "已確認發行方", tokenDecimals: "代幣小數位數", coverageHeading: "目前 Benten 收錄範圍", coverageNote: "此代幣不在目前 Benten 的揭露文件收錄範圍內。", noCoverageHeading: "目前無 Benten 財務資料", noCoverage: "登錄表紀錄仍可使用；此代幣目前沒有 Benten 揭露文件收錄範圍內的財務資料。", legacyHeading: "舊版快照", legacyUnavailable: "登錄表紀錄仍可使用，但目前沒有舊版快照。", legacyNote: (asOf, source) => `截至 ${asOf}。來源：${source}。這些數值的提交日期、單位、來源，以及屬於報告值還是計算值的狀態均未經核實。`, legacySource: "Benten 舊版財務快照；揭露文件來源、單位及數值類型未經核實", value: "數值", true: "是", false: "否" },
  legacy: { fields: { company_name: "企業名稱", metrics_fiscal_year: "會計年度", revenue: "營收", op_income: "營業利益", gross_profit: "毛利", net_income_parent: "淨利（母公司）", total_assets: "資產總額", total_equity: "權益總額", total_liabilities: "負債總額", long_term_debt: "長期債務", operating_cf: "營業活動現金流量", investing_cf: "投資活動現金流量", fcf: "自由現金流" }, groups: { entity: "企業資訊", income: "損益表", balance: "資產負債表", cashflow: "現金流量" } },
  providers: { nav: "其他發行方", home: { byCompany: "依公司：", eyebrow: "其他發行方", heading: "其他發行方公布的未上市公司參考資訊", note: "以下是 PreStocks 與 Tessera 就自家產品公布的識別資訊、權利主張與參考數值。它們不是 xStocks，不是報價或估值，也未經 Benten 查核。", provider: "發行方", symbol: "代號", underlyingCompany: "標的公司", instrument: "產品類型", rights: "權利", reference: "參考值", observed: "擷取時點", referenceLabel: "發行方參考值", referenceUnknowns: "幣別未知 · 發行方基準時點未知", noReference: "暫無參考值", fetched: (date) => `擷取於 ${date}` }, names: { prestocks: "PreStocks", tessera: "Tessera" }, instrumentKinds: { tracker_certificate: "追蹤憑證", economic_exposure_instrument: "經濟曝險工具", loan_participation_token: "貸款參與代幣", unknown: "未知" }, rightsStatus: { public_source_verified: "已由公開來源查核", provider_terms_observed: "已查閱發行方條款", provider_claim_only: "僅為發行方主張", unknown: "未知" }, bindingStatus: { public_source_verified: "已由公開來源查核", provider_claim_only: "僅為發行方主張", unknown: "未知" }, redemption: { provider_terms: "依發行方條款", conditional: "附條件", none: "無", unknown: "未知" }, restrictions: { provider_terms_not_reviewed: "Benten 尚未審閱發行方條款", no_public_source_verification: "沒有公開來源查核" }, underlyingKinds: { openai: "OpenAI", kalshi: "Kalshi", spacex: "SpaceX" }, referenceKinds: { prestock_mark_reference: "標記參考值", prestock_token_reference: "代幣參考值", prestock_implied_valuation_reference: "隱含估值參考值", tessera_auction_price_reference: "拍賣參考值", tessera_auction_valuation_reference: "拍賣估值參考值" }, unknownCodes: { source_as_of_unknown: "發行方基準時點未知", currency_unknown: "幣別未知", rights_unknown: "權利內容未知", company_binding_unknown: "公司對應關係未知", chain_identity_unknown: "鏈上識別資訊未經查核", provider_catalog_mismatch: "發行方目錄不一致", redistribution_pending: "再散布審核待定", execution_quote_unavailable: "發行方成交參考值無法取得", asset_not_found: "找不到該資產" }, blocks: { display: "顯示", comparison: "比較", release: "發布" }, page: { back: "其他發行方參考資訊", companyPageLink: (name) => `查看關聯到 ${name} 的全部金融工具`, identityHeading: "識別資訊", provider: "發行方", symbol: "代號", displayName: "顯示名稱", instrument: "產品類型", contract: "合約或 mint 位址", copy: "複製位址", copied: "已複製", copyUnavailable: "無法複製", externalLink: (provider) => `在 ${provider} 開啟這項產品`, opensNewTab: "（在新分頁中開啟）", companyHeading: "標的公司", company: "公司", binding: "對應關係狀態", noFilingCoverage: "對於這家未上市公司，Benten 沒有收錄任何 SEC 申報文件。", underlyingKind: "標的類別", rightsHeading: "權利", rightsStatusLabel: "權利資訊狀態", equityOwnership: "股權所有權", votingRights: "表決權", redemption: "贖回", unknownValue: "未知", noValue: "無", statementAttribution: (provider) => `${provider} 的說明：`, terms: "發行方條款", restrictionsLabel: "限制事項", referencesHeading: "參考數值", referencesNote: "發行方公布的參考數值。不是可成交報價、淨值、估值或目標價。", referenceColumn: "參考值類型", valueColumn: "發行方公布值", currencyColumn: "幣別", asOfColumn: "發行方基準時點", fetchedColumn: "擷取日期", supplyHeading: "發行方公布的供給量", supplyReference: "供給量參考值", noReferences: "該發行方未公布這項產品的參考數值。", unknownsHeading: "未知項目", blocksLabel: (blocks) => `阻礙升級為 verified：${blocks}`, notXStock: "這不是 xStocks 代幣。" }, metadata: { title: (symbol, provider) => `${symbol} — ${provider} 參考資訊`, description: (name, provider) => `${provider} 公布的 ${name} 識別資訊、權利主張與參考數值。僅提供事實資訊，不是報價、估值或 xStocks 代幣。` } },
  company: companyZhHant,
  notFound: { heading: "未收錄於登錄表", body: "此代碼不屬於 Benten 已知的 xStocks 代幣。Benten 僅查詢靜態允許清單中的代碼，未收錄的輸入不會傳遞給任何資料來源。", back: "所有 xStocks" },
  error: { heading: "無法載入此頁面", body: "Benten 無法載入此公開頁面，請再試一次。", retry: "重試", home: "返回首頁" },
  purchase: purchaseZhHant,
};

export const MESSAGES: Record<Locale, MessageCatalog> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };
export function messagesFor(locale: Locale): MessageCatalog { return MESSAGES[locale]; }

type LegacyPeriodCopy = {
  context: string;
  recordLabel: string;
  statementPeriod: (label: string) => string;
  separateSnapshotNote: string;
  selectedPeriodMismatch: string;
  periodsMixed: string;
};

const LEGACY_PERIOD_MESSAGES: Record<Locale, LegacyPeriodCopy> = {
  en: {
    context: "Legacy statement period context",
    recordLabel: "Record label:",
    statementPeriod: (label) => `Statement period: ${label}`,
    separateSnapshotNote: "This separate legacy financial-statement snapshot does not establish a fiscal year for the fundamentals values above.",
    selectedPeriodMismatch: "The selected statement period differs from the record label.",
    periodsMixed: "Periods differ across statements.",
  },
  ja: {
    context: "レガシー財務諸表の期間情報",
    recordLabel: "レコードラベル:",
    statementPeriod: (label) => `財務諸表の期間: ${label}`,
    separateSnapshotNote: "この別のレガシー財務諸表スナップショットの期間情報は、上記fundamentals値の年度を保証するものではありません。",
    selectedPeriodMismatch: "選択した財務諸表の期間はレコードラベルと異なります。",
    periodsMixed: "財務諸表ごとに期間が異なります。",
  },
  ko: {
    context: "기존 재무제표 기간 정보",
    recordLabel: "레코드 라벨:",
    statementPeriod: (label) => `재무제표 기간: ${label}`,
    separateSnapshotNote: "이 별도 기존 재무제표 스냅샷의 기간 정보는 위 fundamentals 값의 회계연도를 보장하지 않습니다.",
    selectedPeriodMismatch: "선택한 재무제표 기간이 레코드 라벨과 다릅니다.",
    periodsMixed: "재무제표마다 기간이 다릅니다.",
  },
  "zh-Hans": {
    context: "旧版财务报表期间信息",
    recordLabel: "记录标签：",
    statementPeriod: (label) => `财务报表期间：${label}`,
    separateSnapshotNote: "这份独立的旧版财务报表快照期间信息不代表上方 fundamentals 数值的财年。",
    selectedPeriodMismatch: "所选财务报表期间与记录标签不同。",
    periodsMixed: "各财务报表的期间不同。",
  },
  "zh-Hant": {
    context: "舊版財務報表期間資訊",
    recordLabel: "紀錄標籤：",
    statementPeriod: (label) => `財務報表期間：${label}`,
    separateSnapshotNote: "這份獨立的舊版財務報表快照期間資訊不代表上方 fundamentals 數值的會計年度。",
    selectedPeriodMismatch: "所選財務報表期間與紀錄標籤不同。",
    periodsMixed: "各財務報表的期間不同。",
  },
};

export function legacyPeriodMessagesFor(locale: Locale): LegacyPeriodCopy {
  return LEGACY_PERIOD_MESSAGES[locale];
}
