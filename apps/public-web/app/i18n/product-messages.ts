/**
 * Product-page copy for every supported locale (app IA sections 4.5, 4.6, 5,
 * 6.3 and 7): the Pyth reference price, the xStock and provider product
 * pages, their evidence pages and the buy flow frame. Registered for
 * non-Latin text in catalog-manifest.json.
 *
 * Route and pool wording is not here: it reaches pages as loader data from
 * the purchase catalog (`app/lib/purchase-frame.server.ts`), so no DEX name
 * enters a static client chunk.
 */
import type { PythFeedRole } from "@/features/pricing/pyth-feed-index-source";
import type { PublicWebLocale } from "./locales";

export type ProductCopy = {
  price: {
    label: string; loading: string; needsJavaScript: string; at: (time: string) => string; lastUpdate: (time: string) => string; notLive: string;
    feed: (name: string) => string; basis: Record<PythFeedRole, string>; confidence: (amount: string) => string; tooOld: (time: string) => string;
    noFeed: string; unavailable: string; tryAgain: string;
  };
  product: {
    byProvider: (name: string, provider: string) => string; company: (name: string) => string; xstockProvider: string;
    whatYouOwn: { heading: string; xstock: (underlying: string) => string; prestocks: (provider: string, company: string) => string; prestocksRights: (equity: string, voting: string) => string };
    route: { heading: string; liquidity: (amount: string, date: string) => string; fees: (slippage: string) => string; copyPool: { copy: string; copied: string; unavailable: string } };
    capability: { buyable: string; buy: (symbol: string) => string; notBuyableHeading: string; notBuyableBody: string; compareOnlyHeading: string; compareOnlyBody: (symbol: string) => string };
    identity: { heading: string; mint: string; issuer: string; decimals: string; provider: string; copy: { copy: string; copied: string; unavailable: string }; evidence: string };
    metadata: { description: (symbol: string, name: string) => string };
  };
  evidence: {
    heading: (symbol: string) => string; lead: string; back: (symbol: string) => string;
    metadata: { title: (symbol: string) => string; description: (symbol: string) => string };
  };
  flow: { close: string; step: (current: string, total: string, label: string) => string; steps: { amount: string; review: string; result: string }; metadataTitle: (heading: string) => string };
};

const en: ProductCopy = {
  price: {
    label: "Pyth reference price", loading: "Reading the Pyth reference price...", needsJavaScript: "Showing the Pyth reference price needs JavaScript.",
    at: (time) => `at ${time}`, lastUpdate: (time) => `Last Pyth update ${time}`, notLive: "Not live. Benten does not use it for any value.",
    feed: (name) => `Pyth ${name}`, basis: { xstock_underlying_share: "for one underlying share", xstock_token: "for the token itself", private_company_index: "Pyth index for the company" },
    confidence: (amount) => `Pyth confidence ±${amount}`, tooOld: (time) => `Not shown: the last Pyth update was ${time}.`,
    noFeed: "No Pyth price feed for this token", unavailable: "Pyth reference price unavailable right now", tryAgain: "Try again",
  },
  product: {
    byProvider: (name, provider) => `${name}, by ${provider}`, company: (name) => `Company: ${name}`, xstockProvider: "xStocks",
    whatYouOwn: {
      heading: "What you own",
      xstock: (underlying) => `A token that tracks one ${underlying} share, after the display multiplier the issuer sets on the token. It is not the share itself and carries no voting rights. The issuer does not allow it to be sold or delivered to US persons.`,
      prestocks: (provider, company) => `${provider} says this token gives economic exposure to ${company} through a special-purpose vehicle. It is not a share. Benten has not verified this.`,
      prestocksRights: (equity, voting) => `As the provider states: equity ownership ${equity}, voting rights ${voting}.`,
    },
    route: { heading: "Route and fees", liquidity: (amount, date) => `The pool held about ${amount} of liquidity when the route was checked on mainnet on ${date}. The preview shows what your amount receives now.`, fees: (slippage) => `The pool fee, the slippage tolerance (${slippage}) and the minimum you receive are shown in the swap preview before you approve. Your wallet shows the network fee in SOL.`, copyPool: { copy: "Copy address", copied: "Copied", unavailable: "Copy unavailable" } },
    capability: {
      buyable: "Buy in Benten", buy: (symbol) => `Buy ${symbol}`,
      notBuyableHeading: "Not buyable in Benten", notBuyableBody: "Benten builds purchases only for a fixed list of xStocks, each through one fixed pool.",
      compareOnlyHeading: "Compare only", compareOnlyBody: (symbol) => `Benten does not offer buying ${symbol}. Benten will offer it only when it can show its terms before you approve.`,
    },
    identity: { heading: "Token identity", mint: "Mint", issuer: "Issuer", decimals: "Decimals", provider: "Provider", copy: { copy: "Copy mint", copied: "Copied", unavailable: "Copy unavailable" }, evidence: "Evidence and sources" },
    metadata: { description: (symbol, name) => `${symbol} (${name}): what you own, its Pyth reference price and its exact token identity.` },
  },
  evidence: {
    heading: (symbol) => `Evidence for ${symbol}`, lead: "Every record Benten uses for this token, with its source.", back: (symbol) => `Back to ${symbol}`,
    metadata: { title: (symbol) => `Evidence for ${symbol}`, description: (symbol) => `Registry record, sources and unknowns Benten uses for ${symbol}.` },
  },
  flow: { close: "Close", step: (current, total, label) => `Step ${current} of ${total}: ${label}`, steps: { amount: "Amount", review: "Review", result: "Result" }, metadataTitle: (heading) => heading },
};

const ja: ProductCopy = {
  price: {
    label: "Pyth 参考価格", loading: "Pyth 参考価格を読み込んでいます…", needsJavaScript: "Pyth 参考価格の表示にはJavaScriptが必要です。",
    at: (time) => `${time}時点`, lastUpdate: (time) => `Pythの最終更新 ${time}`, notLive: "最新ではありません。Bentenはこの値をどの評価額にも使いません。",
    feed: (name) => `Pyth ${name}`, basis: { xstock_underlying_share: "原株1株あたり", xstock_token: "トークンそのもの", private_company_index: "Pythの企業インデックス" },
    confidence: (amount) => `Pythの信頼区間 ±${amount}`, tooOld: (time) => `表示していません。Pythの最終更新は${time}です。`,
    noFeed: "このトークンのPyth価格フィードはありません", unavailable: "現在、Pyth 参考価格を取得できません", tryAgain: "再試行",
  },
  product: {
    byProvider: (name, provider) => `${name}（${provider}）`, company: (name) => `企業: ${name}`, xstockProvider: "xStocks",
    whatYouOwn: {
      heading: "保有するもの",
      xstock: (underlying) => `${underlying}の株式1株に連動するトークンです（発行体がトークンに設定する表示倍率を適用した後）。株式そのものではなく、議決権はありません。発行体は、米国人への販売と引き渡しを認めていません。`,
      prestocks: (provider, company) => `${provider}によると、このトークンは特別目的事業体を通じて${company}への経済的なエクスポージャーを提供します。株式ではありません。Bentenはこれを検証していません。`,
      prestocksRights: (equity, voting) => `提供元の説明: 株式の所有 ${equity}、議決権 ${voting}。`,
    },
    route: { heading: "経路と手数料", liquidity: (amount, date) => `このプールの流動性は、${date}にメインネットで経路を確認した時点で約${amount}でした。いまの金額で受け取れる量はプレビューに表示されます。`, fees: (slippage) => `プール手数料、スリッページ許容幅（${slippage}）、最低受取額は、承認する前にスワップのプレビューに表示されます。ネットワーク手数料(SOL)はウォレットに表示されます。`, copyPool: { copy: "アドレスをコピー", copied: "コピーしました", unavailable: "コピーできません" } },
    capability: {
      buyable: "Bentenで購入できます", buy: (symbol) => `${symbol}を購入`,
      notBuyableHeading: "Bentenでは購入できません", notBuyableBody: "Bentenが購入を組み立てるのは、決められた一部のxStocksを、それぞれ1つの固定プールを通じて購入する場合だけです。",
      compareOnlyHeading: "比較のみ", compareOnlyBody: (symbol) => `Bentenは${symbol}の購入を提供していません。承認の前に条件を示せるようになった場合にだけ提供します。`,
    },
    identity: { heading: "トークンの識別情報", mint: "Mint", issuer: "発行体", decimals: "小数桁数", provider: "提供元", copy: { copy: "Mintをコピー", copied: "コピーしました", unavailable: "コピーできません" }, evidence: "根拠と出典" },
    metadata: { description: (symbol, name) => `${symbol}（${name}）: 保有するもの、Pyth 参考価格、正確なトークンの識別情報。` },
  },
  evidence: {
    heading: (symbol) => `${symbol}の根拠`, lead: "このトークンについてBentenが使うすべての記録と、その出典です。", back: (symbol) => `${symbol}に戻る`,
    metadata: { title: (symbol) => `${symbol}の根拠`, description: (symbol) => `${symbol}についてBentenが使うレジストリの記録、出典、不明点。` },
  },
  flow: { close: "閉じる", step: (current, total, label) => `ステップ ${current}/${total}：${label}`, steps: { amount: "金額", review: "確認", result: "結果" }, metadataTitle: (heading) => heading },
};

const ko: ProductCopy = {
  price: {
    label: "Pyth 참고 가격", loading: "Pyth 참고 가격을 불러오는 중…", needsJavaScript: "Pyth 참고 가격을 표시하려면 JavaScript가 필요합니다.",
    at: (time) => `${time} 기준`, lastUpdate: (time) => `Pyth 마지막 업데이트 ${time}`, notLive: "실시간이 아닙니다. Benten은 이 값을 어떤 평가액에도 사용하지 않습니다.",
    feed: (name) => `Pyth ${name}`, basis: { xstock_underlying_share: "기초 주식 1주 기준", xstock_token: "토큰 자체 기준", private_company_index: "Pyth 기업 지수" },
    confidence: (amount) => `Pyth 신뢰 구간 ±${amount}`, tooOld: (time) => `표시하지 않습니다. Pyth 마지막 업데이트는 ${time}입니다.`,
    noFeed: "이 토큰에는 Pyth 가격 피드가 없습니다", unavailable: "지금은 Pyth 참고 가격을 가져올 수 없습니다", tryAgain: "다시 시도",
  },
  product: {
    byProvider: (name, provider) => `${name}, ${provider} 발행`, company: (name) => `기업: ${name}`, xstockProvider: "xStocks",
    whatYouOwn: {
      heading: "보유하게 되는 것",
      xstock: (underlying) => `발행사가 토큰에 설정한 표시 배수를 적용한 뒤 ${underlying} 주식 1주를 추종하는 토큰입니다. 주식 자체가 아니며 의결권이 없습니다. 발행사는 미국인에게 판매하거나 인도하는 것을 허용하지 않습니다.`,
      prestocks: (provider, company) => `${provider}에 따르면 이 토큰은 특수목적법인을 통해 ${company}에 대한 경제적 익스포저를 제공합니다. 주식이 아닙니다. Benten은 이를 검증하지 않았습니다.`,
      prestocksRights: (equity, voting) => `제공자 설명: 지분 소유 ${equity}, 의결권 ${voting}.`,
    },
    route: { heading: "경로와 수수료", liquidity: (amount, date) => `${date}에 메인넷에서 경로를 확인했을 때 이 풀의 유동성은 약 ${amount}였습니다. 지금 금액으로 받는 양은 미리보기에 표시됩니다.`, fees: (slippage) => `풀 수수료, 슬리피지 허용 범위(${slippage}), 최소 수령량은 승인하기 전에 스왑 미리보기에 표시됩니다. 네트워크 수수료(SOL)는 지갑에 표시됩니다.`, copyPool: { copy: "주소 복사", copied: "복사했습니다", unavailable: "복사할 수 없습니다" } },
    capability: {
      buyable: "Benten에서 구매할 수 있습니다", buy: (symbol) => `${symbol} 구매`,
      notBuyableHeading: "Benten에서 구매할 수 없습니다", notBuyableBody: "Benten은 정해진 일부 xStocks를 각각 하나의 고정된 풀을 통해 구매하는 경우에만 구매를 구성합니다.",
      compareOnlyHeading: "비교만 가능", compareOnlyBody: (symbol) => `Benten은 ${symbol}의 구매를 제공하지 않습니다. 승인 전에 조건을 보여 줄 수 있을 때에만 제공합니다.`,
    },
    identity: { heading: "토큰 식별 정보", mint: "Mint", issuer: "발행사", decimals: "소수 자릿수", provider: "제공자", copy: { copy: "Mint 복사", copied: "복사했습니다", unavailable: "복사할 수 없습니다" }, evidence: "근거와 출처" },
    metadata: { description: (symbol, name) => `${symbol}(${name}): 보유하게 되는 것, Pyth 참고 가격, 정확한 토큰 식별 정보.` },
  },
  evidence: {
    heading: (symbol) => `${symbol}의 근거`, lead: "이 토큰에 대해 Benten이 사용하는 모든 기록과 그 출처입니다.", back: (symbol) => `${symbol}(으)로 돌아가기`,
    metadata: { title: (symbol) => `${symbol}의 근거`, description: (symbol) => `${symbol}에 대해 Benten이 사용하는 레지스트리 기록, 출처, 알 수 없는 사항.` },
  },
  flow: { close: "닫기", step: (current, total, label) => `${total}단계 중 ${current}단계: ${label}`, steps: { amount: "금액", review: "확인", result: "결과" }, metadataTitle: (heading) => heading },
};

const zhHans: ProductCopy = {
  price: {
    label: "Pyth 参考价格", loading: "正在读取 Pyth 参考价格…", needsJavaScript: "显示 Pyth 参考价格需要 JavaScript。",
    at: (time) => `截至 ${time}`, lastUpdate: (time) => `Pyth 最后更新于 ${time}`, notLive: "非实时。Benten 不会用它计算任何价值。",
    feed: (name) => `Pyth ${name}`, basis: { xstock_underlying_share: "按一股标的股票", xstock_token: "按代币本身", private_company_index: "Pyth 公司指数" },
    confidence: (amount) => `Pyth 置信区间 ±${amount}`, tooOld: (time) => `不显示：Pyth 最后更新于 ${time}。`,
    noFeed: "此代币没有 Pyth 价格源", unavailable: "暂时无法获取 Pyth 参考价格", tryAgain: "重试",
  },
  product: {
    byProvider: (name, provider) => `${name}，由 ${provider} 提供`, company: (name) => `公司：${name}`, xstockProvider: "xStocks",
    whatYouOwn: {
      heading: "你持有的是什么",
      xstock: (underlying) => `一种代币，在应用发行人为该代币设定的显示倍数后，跟踪一股 ${underlying} 股票。它不是股票本身，不附带投票权。发行人不允许将其出售或交付给美国人士。`,
      prestocks: (provider, company) => `${provider} 称，此代币通过特殊目的载体提供对 ${company} 的经济敞口。它不是股票。Benten 未核实这一点。`,
      prestocksRights: (equity, voting) => `提供方的说明：股权 ${equity}，投票权 ${voting}。`,
    },
    route: { heading: "路径与费用", liquidity: (amount, date) => `${date}在主网核对该路径时，此池的流动性约为 ${amount}。按你现在的金额可收到的数量显示在预览中。`, fees: (slippage) => `池手续费、滑点容忍度（${slippage}）和最低到账数量会在你批准前显示在兑换预览中。网络费（SOL）显示在你的钱包中。`, copyPool: { copy: "复制地址", copied: "已复制", unavailable: "无法复制" } },
    capability: {
      buyable: "可在 Benten 中购买", buy: (symbol) => `购买 ${symbol}`,
      notBuyableHeading: "无法在 Benten 中购买", notBuyableBody: "Benten 只为通过各自的一个固定池购买指定的几种 xStocks 构建交易。",
      compareOnlyHeading: "仅供比较", compareOnlyBody: (symbol) => `Benten 不提供 ${symbol} 的购买。只有在批准前能展示其条款时才会提供。`,
    },
    identity: { heading: "代币身份", mint: "Mint", issuer: "发行人", decimals: "小数位数", provider: "提供方", copy: { copy: "复制 Mint", copied: "已复制", unavailable: "无法复制" }, evidence: "依据与来源" },
    metadata: { description: (symbol, name) => `${symbol}（${name}）：你持有的是什么、Pyth 参考价格和准确的代币身份。` },
  },
  evidence: {
    heading: (symbol) => `${symbol} 的依据`, lead: "Benten 就此代币使用的每一条记录及其来源。", back: (symbol) => `返回 ${symbol}`,
    metadata: { title: (symbol) => `${symbol} 的依据`, description: (symbol) => `Benten 就 ${symbol} 使用的登记记录、来源和未知事项。` },
  },
  flow: { close: "关闭", step: (current, total, label) => `第 ${current} 步，共 ${total} 步：${label}`, steps: { amount: "金额", review: "确认", result: "结果" }, metadataTitle: (heading) => heading },
};

const zhHant: ProductCopy = {
  price: {
    label: "Pyth 參考價格", loading: "正在讀取 Pyth 參考價格…", needsJavaScript: "顯示 Pyth 參考價格需要 JavaScript。",
    at: (time) => `截至 ${time}`, lastUpdate: (time) => `Pyth 最後更新於 ${time}`, notLive: "非即時。Benten 不會用它計算任何價值。",
    feed: (name) => `Pyth ${name}`, basis: { xstock_underlying_share: "按一股標的股票", xstock_token: "按代幣本身", private_company_index: "Pyth 公司指數" },
    confidence: (amount) => `Pyth 信賴區間 ±${amount}`, tooOld: (time) => `不顯示：Pyth 最後更新於 ${time}。`,
    noFeed: "此代幣沒有 Pyth 價格來源", unavailable: "暫時無法取得 Pyth 參考價格", tryAgain: "重試",
  },
  product: {
    byProvider: (name, provider) => `${name}，由 ${provider} 提供`, company: (name) => `公司：${name}`, xstockProvider: "xStocks",
    whatYouOwn: {
      heading: "你持有的是什麼",
      xstock: (underlying) => `一種代幣，在套用發行人為該代幣設定的顯示倍數後，追蹤一股 ${underlying} 股票。它不是股票本身，不附帶投票權。發行人不允許將其出售或交付給美國人士。`,
      prestocks: (provider, company) => `${provider} 表示，此代幣透過特殊目的載體提供對 ${company} 的經濟曝險。它不是股票。Benten 未核實這一點。`,
      prestocksRights: (equity, voting) => `提供方的說明：股權 ${equity}，投票權 ${voting}。`,
    },
    route: { heading: "路徑與費用", liquidity: (amount, date) => `${date}在主網核對該路徑時，此池的流動性約為 ${amount}。按你現在的金額可收到的數量顯示在預覽中。`, fees: (slippage) => `池手續費、滑點容忍度（${slippage}）和最低到帳數量會在你核准前顯示在兌換預覽中。網路費（SOL）顯示在你的錢包中。`, copyPool: { copy: "複製地址", copied: "已複製", unavailable: "無法複製" } },
    capability: {
      buyable: "可在 Benten 中購買", buy: (symbol) => `購買 ${symbol}`,
      notBuyableHeading: "無法在 Benten 中購買", notBuyableBody: "Benten 只為透過各自的一個固定池購買指定的幾種 xStocks 建立交易。",
      compareOnlyHeading: "僅供比較", compareOnlyBody: (symbol) => `Benten 不提供 ${symbol} 的購買。只有在核准前能展示其條款時才會提供。`,
    },
    identity: { heading: "代幣身分", mint: "Mint", issuer: "發行人", decimals: "小數位數", provider: "提供方", copy: { copy: "複製 Mint", copied: "已複製", unavailable: "無法複製" }, evidence: "依據與來源" },
    metadata: { description: (symbol, name) => `${symbol}（${name}）：你持有的是什麼、Pyth 參考價格和準確的代幣身分。` },
  },
  evidence: {
    heading: (symbol) => `${symbol} 的依據`, lead: "Benten 就此代幣使用的每一筆紀錄及其來源。", back: (symbol) => `返回 ${symbol}`,
    metadata: { title: (symbol) => `${symbol} 的依據`, description: (symbol) => `Benten 就 ${symbol} 使用的登記紀錄、來源和未知事項。` },
  },
  flow: { close: "關閉", step: (current, total, label) => `第 ${current} 步，共 ${total} 步：${label}`, steps: { amount: "金額", review: "確認", result: "結果" }, metadataTitle: (heading) => heading },
};

export const PRODUCT_MESSAGES: Record<PublicWebLocale, ProductCopy> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function productMessagesFor(locale: PublicWebLocale): ProductCopy {
  return PRODUCT_MESSAGES[locale];
}
