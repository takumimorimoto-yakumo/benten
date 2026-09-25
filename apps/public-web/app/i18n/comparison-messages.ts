/**
 * Copy of the price comparison panel on xStock product pages and of the
 * Pyth reference check line on the purchase and sale review steps, for
 * every supported locale. Registered for non-Latin text in
 * catalog-manifest.json.
 *
 * Vocabulary (app IA section 7): every price word is rendered inside
 * `data-term="pyth-reference-price"` or `data-term="onchain-trade-price"`.
 * A difference is stated as the difference between two observations; no
 * text ranks, rates, recommends or forecasts.
 */
import type { PublicWebLocale } from "./locales";

export type ComparisonCopy = {
  readonly heading: string;
  readonly lead: (symbol: string) => string;
  readonly row: {
    readonly underlying: (feed: string) => string;
    readonly token: (feed: string) => string;
    readonly trade: (date: string) => string;
  };
  readonly feed: {
    readonly published: (time: string) => string;
    readonly lastUpdate: (time: string) => string;
    readonly confidence: (amount: string) => string;
    readonly reading: string;
    readonly needsJavaScript: string;
    readonly unavailable: string;
    readonly tryAgain: string;
    readonly noAccount: string;
    readonly tooOld: (time: string) => string;
  };
  readonly session: {
    readonly alwaysOpen: string;
    readonly open: (closes: string) => string;
    readonly openNoClose: string;
    readonly closed: (opens: string) => string;
    readonly closedNoOpen: string;
    readonly publishedOutside: string;
  };
  readonly trade: {
    readonly perShare: (amount: string) => string;
    readonly perToken: (amount: string) => string;
    readonly noPerShare: string;
  };
  readonly tokenGap: {
    readonly value: (token: string, underlying: string, percent: string) => string;
    readonly unit: string;
    readonly tokenNotLive: (token: string, seconds: string) => string;
    readonly underlyingNotLive: (underlying: string, seconds: string) => string;
    readonly noTokenFeed: (symbol: string) => string;
  };
  readonly tradeGap: {
    readonly value: (underlying: string, percent: string) => string;
    readonly note: (tradeDate: string, pythTime: string) => string;
    readonly underlyingNotShown: (underlying: string) => string;
  };
  readonly sources: (scheduleDate: string) => string;
  readonly referenceCheck: {
    readonly checked: (feed: string, price: string, time: string) => string;
    readonly value: (amount: string) => string;
  };
};

const en: ComparisonCopy = {
  heading: "Pyth and on-chain comparison",
  lead: (symbol) => `Three separate observations for ${symbol}. Each difference is between two observations and says nothing about what either will be.`,
  row: {
    underlying: (feed) => `Pyth ${feed}, for one underlying share`,
    token: (feed) => `Pyth ${feed}, for the token itself`,
    trade: (date) => `Last on-chain trade price, ${date}, near the NYSE close`,
  },
  feed: {
    published: (time) => `published ${time}`,
    lastUpdate: (time) => `Last update on Solana ${time}`,
    confidence: (amount) => `Pyth confidence ±${amount}`,
    reading: "Reading the Pyth price...",
    needsJavaScript: "Showing the Pyth price needs JavaScript.",
    unavailable: "Pyth price unavailable right now",
    tryAgain: "Try again",
    noAccount: "Pyth publishes no Solana price account for this feed",
    tooOld: (time) => `Not shown: its Solana price account was last updated ${time}.`,
  },
  session: {
    alwaysOpen: "Pyth schedule: every day, all hours",
    open: (closes) => `Pyth schedule: regular session open, closes ${closes}`,
    openNoClose: "Pyth schedule: regular session open",
    closed: (opens) => `Pyth schedule: regular session closed, opens ${opens}`,
    closedNoOpen: "Pyth schedule: regular session closed",
    publishedOutside: "Published outside the regular session of Pyth's schedule.",
  },
  trade: {
    perShare: (amount) => `${amount} USDC for one underlying share`,
    perToken: (amount) => `${amount} USDC per token, before the display multiplier`,
    noPerShare: "No value for one share: the token's display multiplier at that trade is unknown.",
  },
  tokenGap: {
    value: (token, underlying, percent) => `Difference, Pyth ${token} vs Pyth ${underlying}: ${percent}`,
    unit: "The token feed is compared as Pyth publishes it. Benten has not verified whether it prices one token before or after the display multiplier, so the difference can include the multiplier.",
    tokenNotLive: (token, seconds) => `Pyth ${token} is not compared: its Solana price account was not updated in the last ${seconds} seconds.`,
    underlyingNotLive: (underlying, seconds) => `Not compared: the Pyth ${underlying} price account on Solana was not updated in the last ${seconds} seconds.`,
    noTokenFeed: (symbol) => `Benten's reviewed feed map has no Pyth feed for the ${symbol} token itself.`,
  },
  tradeGap: {
    value: (underlying, percent) => `Difference, last on-chain trade vs Pyth ${underlying}: ${percent}`,
    note: (tradeDate, pythTime) => `The trade's USDC per token divided by the display multiplier then in effect gives USDC for one share. The trade is from ${tradeDate}; the Pyth price was published ${pythTime}.`,
    underlyingNotShown: (underlying) => `The last on-chain trade is not compared: no Pyth ${underlying} price is shown.`,
  },
  sources: (scheduleDate) => `Sources: Pyth price accounts on Solana, read without a key by Benten's API; Pyth's published market schedules as of ${scheduleDate}; Benten's bundled series of on-chain trades.`,
  referenceCheck: {
    checked: (feed, price, time) => `Checked against the Pyth reference price ${feed}: ${price}, published ${time}.`,
    value: (amount) => `Value of this amount at that price: ${amount}.`,
  },
};

const ja: ComparisonCopy = {
  heading: "Pythとオンチェーンの比較",
  lead: (symbol) => `${symbol}についての、互いに独立した3つの観測値です。差はそれぞれ2つの観測値の差であり、今後どうなるかを示すものではありません。`,
  row: {
    underlying: (feed) => `Pyth ${feed}（原株1株あたり）`,
    token: (feed) => `Pyth ${feed}（トークンそのもの）`,
    trade: (date) => `最後のオンチェーン取引価格（${date}、NYSEの取引終了時刻付近）`,
  },
  feed: {
    published: (time) => `${time}に公表`,
    lastUpdate: (time) => `Solana上の最終更新 ${time}`,
    confidence: (amount) => `Pythの信頼区間 ±${amount}`,
    reading: "Pythの価格を読み込んでいます…",
    needsJavaScript: "Pythの価格の表示にはJavaScriptが必要です。",
    unavailable: "現在、Pythの価格を取得できません",
    tryAgain: "再試行",
    noAccount: "このフィードについて、PythはSolana上の価格アカウントを公開していません",
    tooOld: (time) => `表示していません。Solana上の価格アカウントの最終更新は${time}です。`,
  },
  session: {
    alwaysOpen: "Pythのスケジュール: 毎日、終日",
    open: (closes) => `Pythのスケジュール: 通常取引時間中（終了 ${closes}）`,
    openNoClose: "Pythのスケジュール: 通常取引時間中",
    closed: (opens) => `Pythのスケジュール: 通常取引時間外（開始 ${opens}）`,
    closedNoOpen: "Pythのスケジュール: 通常取引時間外",
    publishedOutside: "Pythのスケジュールの通常取引時間外に公表された値です。",
  },
  trade: {
    perShare: (amount) => `原株1株あたり ${amount} USDC`,
    perToken: (amount) => `トークン1枚あたり ${amount} USDC（表示倍率の適用前）`,
    noPerShare: "1株あたりの値はありません。その取引の時点のトークンの表示倍率が不明です。",
  },
  tokenGap: {
    value: (token, underlying, percent) => `Pyth ${token}とPyth ${underlying}の差: ${percent}`,
    unit: "トークンのフィードは、Pythが公表するとおりに比較しています。そのフィードが表示倍率の適用前と適用後のどちらでトークン1枚を評価しているかはBentenでは確認していないため、差には表示倍率が含まれることがあります。",
    tokenNotLive: (token, seconds) => `Pyth ${token}は比較していません。Solana上の価格アカウントが直近${seconds}秒以内に更新されていません。`,
    underlyingNotLive: (underlying, seconds) => `比較していません。Solana上のPyth ${underlying}の価格アカウントが直近${seconds}秒以内に更新されていません。`,
    noTokenFeed: (symbol) => `Bentenが確認したフィード対応表には、${symbol}トークンそのもののPythフィードがありません。`,
  },
  tradeGap: {
    value: (underlying, percent) => `最後のオンチェーン取引とPyth ${underlying}の差: ${percent}`,
    note: (tradeDate, pythTime) => `取引のトークン1枚あたりのUSDCを当時の表示倍率で割った値が、1株あたりのUSDCです。取引は${tradeDate}、Pythの価格は${pythTime}に公表されたものです。`,
    underlyingNotShown: (underlying) => `最後のオンチェーン取引は比較していません。Pyth ${underlying}の価格を表示していません。`,
  },
  sources: (scheduleDate) => `出典: Solana上のPythの価格アカウント（BentenのAPIがキーなしで読み取り）、Pythが公表する取引スケジュール（${scheduleDate}時点）、Bentenが同梱するオンチェーン取引の系列。`,
  referenceCheck: {
    checked: (feed, price, time) => `Pyth 参考価格 ${feed}と照合済み: ${price}（${time}に公表）。`,
    value: (amount) => `この数量のその価格での評価額: ${amount}。`,
  },
};

const ko: ComparisonCopy = {
  heading: "Pyth와 온체인 비교",
  lead: (symbol) => `${symbol}에 대한 서로 독립적인 세 가지 관측값입니다. 각 차이는 두 관측값의 차이이며, 앞으로 어떻게 될지를 나타내지 않습니다.`,
  row: {
    underlying: (feed) => `Pyth ${feed}, 기초 주식 1주 기준`,
    token: (feed) => `Pyth ${feed}, 토큰 자체 기준`,
    trade: (date) => `마지막 온체인 거래 가격, ${date}, NYSE 마감 무렵`,
  },
  feed: {
    published: (time) => `${time} 공표`,
    lastUpdate: (time) => `Solana 최종 업데이트 ${time}`,
    confidence: (amount) => `Pyth 신뢰 구간 ±${amount}`,
    reading: "Pyth 가격을 읽는 중...",
    needsJavaScript: "Pyth 가격을 표시하려면 JavaScript가 필요합니다.",
    unavailable: "지금은 Pyth 가격을 가져올 수 없습니다",
    tryAgain: "다시 시도",
    noAccount: "Pyth는 이 피드의 Solana 가격 계정을 공개하지 않습니다",
    tooOld: (time) => `표시하지 않음: Solana 가격 계정의 마지막 업데이트는 ${time}입니다.`,
  },
  session: {
    alwaysOpen: "Pyth 일정: 매일, 하루 종일",
    open: (closes) => `Pyth 일정: 정규 거래 시간 중, ${closes} 종료`,
    openNoClose: "Pyth 일정: 정규 거래 시간 중",
    closed: (opens) => `Pyth 일정: 정규 거래 시간 외, ${opens} 시작`,
    closedNoOpen: "Pyth 일정: 정규 거래 시간 외",
    publishedOutside: "Pyth 일정의 정규 거래 시간 외에 공표된 값입니다.",
  },
  trade: {
    perShare: (amount) => `기초 주식 1주당 ${amount} USDC`,
    perToken: (amount) => `토큰 1개당 ${amount} USDC, 표시 배율 적용 전`,
    noPerShare: "1주당 값이 없습니다: 그 거래 시점의 토큰 표시 배율을 알 수 없습니다.",
  },
  tokenGap: {
    value: (token, underlying, percent) => `차이, Pyth ${token} 대 Pyth ${underlying}: ${percent}`,
    unit: "토큰 피드는 Pyth가 공표한 그대로 비교합니다. Benten은 이 피드가 표시 배율 적용 전과 후 중 어느 기준으로 토큰 1개를 나타내는지 확인하지 않았으므로, 차이에 표시 배율이 포함될 수 있습니다.",
    tokenNotLive: (token, seconds) => `Pyth ${token}은 비교하지 않습니다: Solana 가격 계정이 최근 ${seconds}초 안에 업데이트되지 않았습니다.`,
    underlyingNotLive: (underlying, seconds) => `비교하지 않음: Solana의 Pyth ${underlying} 가격 계정이 최근 ${seconds}초 안에 업데이트되지 않았습니다.`,
    noTokenFeed: (symbol) => `Benten이 검토한 피드 대응표에는 ${symbol} 토큰 자체의 Pyth 피드가 없습니다.`,
  },
  tradeGap: {
    value: (underlying, percent) => `차이, 마지막 온체인 거래 대 Pyth ${underlying}: ${percent}`,
    note: (tradeDate, pythTime) => `거래의 토큰 1개당 USDC를 당시 표시 배율로 나눈 값이 1주당 USDC입니다. 거래는 ${tradeDate}, Pyth 가격은 ${pythTime}에 공표되었습니다.`,
    underlyingNotShown: (underlying) => `마지막 온체인 거래는 비교하지 않습니다: Pyth ${underlying} 가격이 표시되지 않았습니다.`,
  },
  sources: (scheduleDate) => `출처: Solana의 Pyth 가격 계정(Benten API가 키 없이 읽음), Pyth가 공표한 거래 일정(${scheduleDate} 기준), Benten에 포함된 온체인 거래 계열.`,
  referenceCheck: {
    checked: (feed, price, time) => `Pyth 참고 가격 ${feed}와 대조 완료: ${price}, ${time} 공표.`,
    value: (amount) => `그 가격 기준 이 수량의 평가액: ${amount}.`,
  },
};

const zhHans: ComparisonCopy = {
  heading: "Pyth 与链上对比",
  lead: (symbol) => `关于 ${symbol} 的三个相互独立的观测值。每个差值都是两个观测值之间的差，不说明任何一个今后会怎样。`,
  row: {
    underlying: (feed) => `Pyth ${feed}，按一股标的股票`,
    token: (feed) => `Pyth ${feed}，按代币本身`,
    trade: (date) => `最近一笔链上交易价格，${date}，接近纽交所收盘`,
  },
  feed: {
    published: (time) => `发布于 ${time}`,
    lastUpdate: (time) => `Solana 上最后更新 ${time}`,
    confidence: (amount) => `Pyth 置信区间 ±${amount}`,
    reading: "正在读取 Pyth 价格…",
    needsJavaScript: "显示 Pyth 价格需要 JavaScript。",
    unavailable: "目前无法获取 Pyth 价格",
    tryAgain: "重试",
    noAccount: "Pyth 未在 Solana 上为此喂价公开价格账户",
    tooOld: (time) => `未显示：其 Solana 价格账户最后更新于 ${time}。`,
  },
  session: {
    alwaysOpen: "Pyth 时间表：每天，全天",
    open: (closes) => `Pyth 时间表：常规交易时段内，${closes} 结束`,
    openNoClose: "Pyth 时间表：常规交易时段内",
    closed: (opens) => `Pyth 时间表：常规交易时段外，${opens} 开始`,
    closedNoOpen: "Pyth 时间表：常规交易时段外",
    publishedOutside: "该值发布于 Pyth 时间表的常规交易时段之外。",
  },
  trade: {
    perShare: (amount) => `每股标的股票 ${amount} USDC`,
    perToken: (amount) => `每枚代币 ${amount} USDC，未计显示倍数`,
    noPerShare: "没有每股的值：该笔交易时代币的显示倍数未知。",
  },
  tokenGap: {
    value: (token, underlying, percent) => `差值，Pyth ${token} 对 Pyth ${underlying}：${percent}`,
    unit: "代币喂价按 Pyth 发布的原样比较。Benten 尚未确认该喂价是按显示倍数之前还是之后的一枚代币计，因此差值可能包含显示倍数。",
    tokenNotLive: (token, seconds) => `未比较 Pyth ${token}：其 Solana 价格账户在最近 ${seconds} 秒内没有更新。`,
    underlyingNotLive: (underlying, seconds) => `未比较：Solana 上的 Pyth ${underlying} 价格账户在最近 ${seconds} 秒内没有更新。`,
    noTokenFeed: (symbol) => `Benten 审核的喂价对应表中没有 ${symbol} 代币本身的 Pyth 喂价。`,
  },
  tradeGap: {
    value: (underlying, percent) => `差值，最近一笔链上交易对 Pyth ${underlying}：${percent}`,
    note: (tradeDate, pythTime) => `交易的每枚代币 USDC 除以当时生效的显示倍数，即为每股的 USDC。交易发生于 ${tradeDate}，Pyth 价格发布于 ${pythTime}。`,
    underlyingNotShown: (underlying) => `未比较最近一笔链上交易：没有显示 Pyth ${underlying} 价格。`,
  },
  sources: (scheduleDate) => `来源：Solana 上的 Pyth 价格账户（由 Benten 的 API 无密钥读取）；Pyth 发布的交易时间表（截至 ${scheduleDate}）；Benten 内置的链上交易序列。`,
  referenceCheck: {
    checked: (feed, price, time) => `已与 Pyth 参考价格 ${feed} 核对：${price}，发布于 ${time}。`,
    value: (amount) => `按该价格计的此数量价值：${amount}。`,
  },
};

const zhHant: ComparisonCopy = {
  heading: "Pyth 與鏈上對比",
  lead: (symbol) => `關於 ${symbol} 的三個相互獨立的觀測值。每個差值都是兩個觀測值之間的差，不說明任何一個今後會怎樣。`,
  row: {
    underlying: (feed) => `Pyth ${feed}，按一股標的股票`,
    token: (feed) => `Pyth ${feed}，按代幣本身`,
    trade: (date) => `最近一筆鏈上交易價格，${date}，接近紐交所收盤`,
  },
  feed: {
    published: (time) => `發布於 ${time}`,
    lastUpdate: (time) => `Solana 上最後更新 ${time}`,
    confidence: (amount) => `Pyth 信賴區間 ±${amount}`,
    reading: "正在讀取 Pyth 價格…",
    needsJavaScript: "顯示 Pyth 價格需要 JavaScript。",
    unavailable: "目前無法取得 Pyth 價格",
    tryAgain: "重試",
    noAccount: "Pyth 未在 Solana 上為此餵價公開價格帳戶",
    tooOld: (time) => `未顯示：其 Solana 價格帳戶最後更新於 ${time}。`,
  },
  session: {
    alwaysOpen: "Pyth 時間表：每天，全天",
    open: (closes) => `Pyth 時間表：常規交易時段內，${closes} 結束`,
    openNoClose: "Pyth 時間表：常規交易時段內",
    closed: (opens) => `Pyth 時間表：常規交易時段外，${opens} 開始`,
    closedNoOpen: "Pyth 時間表：常規交易時段外",
    publishedOutside: "該值發布於 Pyth 時間表的常規交易時段之外。",
  },
  trade: {
    perShare: (amount) => `每股標的股票 ${amount} USDC`,
    perToken: (amount) => `每枚代幣 ${amount} USDC，未計顯示倍數`,
    noPerShare: "沒有每股的值：該筆交易時代幣的顯示倍數未知。",
  },
  tokenGap: {
    value: (token, underlying, percent) => `差值，Pyth ${token} 對 Pyth ${underlying}：${percent}`,
    unit: "代幣餵價按 Pyth 發布的原樣比較。Benten 尚未確認該餵價是按顯示倍數之前還是之後的一枚代幣計，因此差值可能包含顯示倍數。",
    tokenNotLive: (token, seconds) => `未比較 Pyth ${token}：其 Solana 價格帳戶在最近 ${seconds} 秒內沒有更新。`,
    underlyingNotLive: (underlying, seconds) => `未比較：Solana 上的 Pyth ${underlying} 價格帳戶在最近 ${seconds} 秒內沒有更新。`,
    noTokenFeed: (symbol) => `Benten 審核的餵價對應表中沒有 ${symbol} 代幣本身的 Pyth 餵價。`,
  },
  tradeGap: {
    value: (underlying, percent) => `差值，最近一筆鏈上交易對 Pyth ${underlying}：${percent}`,
    note: (tradeDate, pythTime) => `交易的每枚代幣 USDC 除以當時生效的顯示倍數，即為每股的 USDC。交易發生於 ${tradeDate}，Pyth 價格發布於 ${pythTime}。`,
    underlyingNotShown: (underlying) => `未比較最近一筆鏈上交易：沒有顯示 Pyth ${underlying} 價格。`,
  },
  sources: (scheduleDate) => `來源：Solana 上的 Pyth 價格帳戶（由 Benten 的 API 無金鑰讀取）；Pyth 發布的交易時間表（截至 ${scheduleDate}）；Benten 內建的鏈上交易序列。`,
  referenceCheck: {
    checked: (feed, price, time) => `已與 Pyth 參考價格 ${feed} 核對：${price}，發布於 ${time}。`,
    value: (amount) => `按該價格計的此數量價值：${amount}。`,
  },
};

export const COMPARISON_MESSAGES: Record<PublicWebLocale, ComparisonCopy> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function comparisonMessagesFor(locale: PublicWebLocale): ComparisonCopy {
  return COMPARISON_MESSAGES[locale];
}
