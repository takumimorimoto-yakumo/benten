/**
 * Copy of the price and financials charts (company and product pages) for
 * every supported locale. Registered for non-Latin text in
 * catalog-manifest.json.
 *
 * Vocabulary (app IA section 7): the price is always "on-chain trade price"
 * (what executed swaps paid), never a quote, a NAV or a Pyth value. Price
 * words appear only inside the chart section, which carries
 * `data-term="onchain-trade-price"`. No text ranks, rates or forecasts.
 */
import type { FinancialMetric, PriceGapReason } from "@/features/charts/chart-data";
import type { ChartRange } from "@/features/charts/chart-config";
import type { ChartContent } from "@/features/charts/chart-model";
import type { PublicWebLocale } from "./locales";


export type ChartsCopy = {
  readonly heading: {
    readonly company: (symbol: string, company: string) => string;
    readonly companyFigures: (company: string) => string;
    readonly product: (symbol: string) => string;
  };
  readonly fixture: string;
  readonly range: { readonly label: string; readonly short: Record<ChartRange, string>; readonly long: Record<ChartRange, string> };
  readonly legend: { readonly label: string; readonly price: (symbol: string) => string; readonly revenue: string; readonly netIncome: string; readonly beforeListing: string };
  readonly listed: { readonly xstock: (date: string) => string; readonly token: (symbol: string, date: string) => string };
  readonly source: { readonly priceBefore: string; readonly priceAfter: string; readonly financials: string };
  readonly readout: {
    /** What pointing or tapping shows, by what the chart draws: the price line only, the annual figures only, or both. */
    readonly hint: Record<ChartContent, string>;
    readonly price: string;
    /** The unit of a day's value: USDC per token, before the display multiplier. */
    readonly perToken: (symbol: string) => string;
    /** What a day's value is: one executed trade near the close (never a quote). */
    readonly tradeNote: string;
    /** A pool by its DEX's name. */
    readonly pool: (dex: string) => string;
    readonly day: (date: string) => string;
    readonly swap: string;
    readonly slot: (slot: string) => string;
    readonly gap: Record<PriceGapReason, string>;
    readonly metric: Record<FinancialMetric, string>;
    readonly yearEnded: (date: string) => string;
    readonly filed: (form: string, date: string) => string;
    readonly openFiling: (form: string) => string;
    readonly accession: (accession: string) => string;
    /** An `unverified_or_derived` figure: listed, never drawn. */
    readonly notVerified: string;
  };
  readonly state: {
    readonly loading: string;
    readonly needsJavaScript: string;
    readonly error: string;
    readonly retry: string;
    readonly emptyRange: string;
    readonly noPriceSeries: (symbol: string) => string;
    readonly noFiguresInRange: string;
    readonly gaps: (days: string) => string;
    /** Under the legend: the line is per token, not one share's price. */
    readonly perToken: (symbol: string) => string;
  };
  readonly table: {
    readonly show: string;
    readonly figuresCaption: string;
    readonly priceCaption: (symbol: string) => string;
    readonly fiscalYear: string;
    readonly yearEnded: string;
    readonly filing: string;
    readonly date: string;
    readonly value: string;
    readonly swap: string;
    readonly notShown: string;
    /** The link to the series' data file, where the page does not list the days itself. */
    readonly priceFile: string;
  };
  readonly summary: {
    readonly figures: (company: string, first: string, last: string) => string;
    readonly price: (symbol: string, from: string, to: string) => string;
    readonly table: string;
  };
  readonly delta: {
    readonly value: (percent: string) => string;
    readonly note: (tradeDate: string, pythTime: string, company: string) => string;
    /** The last trade has no value for one share: no difference is shown. */
    readonly unavailable: string;
  };
  readonly opensNewTab: string;
};

const en: ChartsCopy = {
  heading: {
    company: (symbol, company) => `${symbol} on-chain trades and ${company} annual figures`,
    companyFigures: (company) => `${company} annual figures`,
    product: (symbol) => `${symbol} on-chain trade price`,
  },
  fixture: "Sample data for review. These are not real trades or filings.",
  range: { label: "Period", short: { "3M": "3M", "1Y": "1Y", all: "All" }, long: { "3M": "3 months", "1Y": "1 year", all: "All history" } },
  legend: { label: "Legend", price: (symbol) => `${symbol} price per token (on-chain trades, right axis)`, revenue: "Revenue (left axis)", netIncome: "Net income (left axis)", beforeListing: "Before the series" },
  listed: { xstock: (date) => `On-chain series from ${date}`, token: (symbol, date) => `${symbol} first traded on ${date}` },
  source: { priceBefore: "Price: executed swaps on Solana (", priceAfter: ").", financials: "Financials: SEC filings." },
  readout: {
    hint: {
      price: "Tap or point at the chart to see one day's trade.",
      figures: "Tap or point at the chart to see one year's figures.",
      both: "Tap or point at the chart to see one day's trade or one year's figures.",
    },
    price: "On-chain trade price",
    perToken: (symbol) => `USDC per ${symbol} token`,
    tradeNote: "The price an executed trade paid: the one swap nearest the NYSE close.",
    pool: (dex) => `${dex} pool`,
    day: (date) => `${date}, near the NYSE close`,
    swap: "Open in Solana Explorer",
    slot: (slot) => `Slot ${slot}`,
    gap: { no_single_swap_in_search_window: "No trade near the close could be shown to be a single swap in this pool.", verification_budget_exhausted: "There were more trades near the close than could be checked.", ledger_instructions_unavailable: "The ledger did not give the details needed to check this day's trades.", signature_page_limit: "The pool's list of transactions near the close was too long to read." },
    metric: { revenue: "Revenue", net_income_parent: "Net income" },
    yearEnded: (date) => `Period end ${date}`,
    filed: (form, date) => `${form} filed ${date}`,
    openFiling: (form) => `Open the ${form}`,
    accession: (accession) => `Accession ${accession}`,
    notVerified: "Not verified against the filing.",
  },
  state: {
    loading: "Loading the chart...",
    needsJavaScript: "The chart needs JavaScript. The same data is in the table below.",
    error: "The chart could not load. The same data is in the table below.",
    retry: "Try again",
    emptyRange: "No trades or annual figures fall in this period.",
    noPriceSeries: (symbol) => `No on-chain trade data for ${symbol} yet.`,
    noFiguresInRange: "No fiscal year with reported figures falls in this period.",
    gaps: (days) => (days === "1" ? "1 day in this period has no value." : `${days} days in this period have no value.`),
    perToken: (symbol) => `Values are USDC per ${symbol} token, before the token's display multiplier: not the price of one underlying share.`,
  },
  table: {
    show: "Show the data as a table",
    figuresCaption: "Annual figures from SEC filings (USD)",
    priceCaption: (symbol) => `${symbol} on-chain trade price by day`,
    fiscalYear: "Fiscal year",
    yearEnded: "Period end",
    filing: "Filing",
    date: "NYSE session",
    value: "USDC per token",
    swap: "Swap",
    notShown: "Not shown",
    priceFile: "Daily prices as a data file (JSON)",
  },
  summary: {
    figures: (company, first, last) => `${company} revenue and net income for each fiscal year (${first} to ${last}).`,
    price: (symbol, from, to) => `${symbol} on-chain trade price for each day from ${from} to ${to}.`,
    table: "The same data is in the table below the chart.",
  },
  delta: {
    value: (percent) => `On-chain price vs Pyth reference: ${percent}`,
    note: (tradeDate, pythTime, company) => `Last on-chain trade: ${tradeDate}, near the NYSE close. Its price per token divided by the display multiplier then in effect gives USDC for one ${company} share; the Pyth reference price (${pythTime}) is in USD for one share.`,
    unavailable: "No comparison with the Pyth reference price: the token's display multiplier history is unavailable, so the last on-chain trade has no value for one share.",
  },
  opensNewTab: "(opens in a new tab)",
};

const ja: ChartsCopy = {
  heading: {
    company: (symbol, company) => `${symbol}のオンチェーン取引と${company}の年次業績`,
    companyFigures: (company) => `${company}の年次業績`,
    product: (symbol) => `${symbol}のオンチェーン取引価格`,
  },
  fixture: "確認用のサンプルデータです。実際の取引や提出書類ではありません。",
  range: { label: "期間", short: { "3M": "3か月", "1Y": "1年", all: "全期間" }, long: { "3M": "3か月", "1Y": "1年", all: "全期間" } },
  legend: { label: "凡例", price: (symbol) => `${symbol}のトークン1枚あたりの価格（オンチェーン取引、右軸）`, revenue: "売上高（左軸）", netIncome: "純利益（左軸）", beforeListing: "系列の開始前" },
  listed: { xstock: (date) => `オンチェーン系列の開始日 ${date}`, token: (symbol, date) => `${symbol}の最初の取引日 ${date}` },
  source: { priceBefore: "価格: Solana上で実行されたスワップ（", priceAfter: "）。", financials: "業績: SECへの提出書類。" },
  readout: {
    hint: {
      price: "チャートをタップするか指し示すと、その日の取引を表示します。",
      figures: "チャートをタップするか指し示すと、その年の業績を表示します。",
      both: "チャートをタップするか指し示すと、その日の取引かその年の業績を表示します。",
    },
    price: "オンチェーン取引価格",
    perToken: (symbol) => `${symbol}トークン1枚あたりのUSDC`,
    tradeNote: "約定した取引の価格です。NYSEの取引終了時刻に最も近いスワップ1件です。",
    pool: (dex) => `${dex}のプール`,
    day: (date) => `${date}、NYSEの取引終了時刻付近`,
    swap: "Solana Explorerで開く",
    slot: (slot) => `スロット ${slot}`,
    gap: { no_single_swap_in_search_window: "取引終了時刻付近に、このプールで単独のスワップと確認できる取引はありません。", verification_budget_exhausted: "取引終了時刻付近の取引が多く、すべてを確認できませんでした。", ledger_instructions_unavailable: "この日の取引を確認するための詳細を台帳から取得できませんでした。", signature_page_limit: "取引終了時刻付近のプールの取引一覧が長く、読み切れませんでした。" },
    metric: { revenue: "売上高", net_income_parent: "純利益" },
    yearEnded: (date) => `期末日 ${date}`,
    filed: (form, date) => `${form}の提出日 ${date}`,
    openFiling: (form) => `${form}を開く`,
    accession: (accession) => `受付番号 ${accession}`,
    notVerified: "提出書類との照合が済んでいない値です。",
  },
  state: {
    loading: "チャートを読み込んでいます…",
    needsJavaScript: "チャートの表示にはJavaScriptが必要です。同じデータを下の表で確認できます。",
    error: "チャートを読み込めませんでした。同じデータを下の表で確認できます。",
    retry: "再試行",
    emptyRange: "この期間には取引も年次業績もありません。",
    noPriceSeries: (symbol) => `${symbol}のオンチェーン取引データはまだありません。`,
    noFiguresInRange: "この期間に、業績が報告された年度はありません。",
    gaps: (days) => `この期間のうち${days}日は値がありません。`,
    perToken: (symbol) => `値は${symbol}トークン1枚あたりのUSDCで、トークンの表示倍率を反映する前のものです。原株1株の価格ではありません。`,
  },
  table: {
    show: "データを表で見る",
    figuresCaption: "SECへの提出書類による年次業績（USD）",
    priceCaption: (symbol) => `${symbol}の日次のオンチェーン取引価格`,
    fiscalYear: "会計年度",
    yearEnded: "期末日",
    filing: "提出書類",
    date: "NYSEの取引日",
    value: "トークン1枚あたりのUSDC",
    swap: "スワップ",
    notShown: "表示なし",
    priceFile: "日次の価格をデータファイル（JSON）で見る",
  },
  summary: {
    figures: (company, first, last) => `${company}の${first}から${last}までの各年度の売上高と純利益。`,
    price: (symbol, from, to) => `${symbol}の${from}から${to}までの日ごとのオンチェーン取引価格。`,
    table: "同じデータをチャートの下の表で確認できます。",
  },
  delta: {
    value: (percent) => `オンチェーン価格とPyth 参考価格の差: ${percent}`,
    note: (tradeDate, pythTime, company) => `最後のオンチェーン取引: ${tradeDate}、NYSEの取引終了時刻付近。そのトークン1枚あたりの価格を当時の表示倍率で割った値が${company}株式1株あたりのUSDCです。Pyth 参考価格（${pythTime}）は1株あたりのUSDです。`,
    unavailable: "Pyth 参考価格との差は表示していません。トークンの表示倍率の履歴がないため、最後のオンチェーン取引に1株あたりの値がありません。",
  },
  opensNewTab: "（新しいタブで開きます）",
};

const ko: ChartsCopy = {
  heading: {
    company: (symbol, company) => `${symbol} 온체인 거래와 ${company} 연간 실적`,
    companyFigures: (company) => `${company} 연간 실적`,
    product: (symbol) => `${symbol} 온체인 거래 가격`,
  },
  fixture: "검토용 샘플 데이터입니다. 실제 거래나 제출 서류가 아닙니다.",
  range: { label: "기간", short: { "3M": "3개월", "1Y": "1년", all: "전체" }, long: { "3M": "3개월", "1Y": "1년", all: "전체 기간" } },
  legend: { label: "범례", price: (symbol) => `${symbol} 토큰 1개당 가격(온체인 거래, 오른쪽 축)`, revenue: "매출(왼쪽 축)", netIncome: "순이익(왼쪽 축)", beforeListing: "계열 시작 전" },
  listed: { xstock: (date) => `온체인 계열 시작일 ${date}`, token: (symbol, date) => `${symbol} 첫 거래일 ${date}` },
  source: { priceBefore: "가격: Solana에서 실행된 스왑(", priceAfter: ").", financials: "실적: SEC 제출 서류." },
  readout: {
    hint: {
      price: "차트를 탭하거나 가리키면 그날의 거래를 보여 줍니다.",
      figures: "차트를 탭하거나 가리키면 그해의 실적을 보여 줍니다.",
      both: "차트를 탭하거나 가리키면 그날의 거래나 그해의 실적을 보여 줍니다.",
    },
    price: "온체인 거래 가격",
    perToken: (symbol) => `${symbol} 토큰 1개당 USDC`,
    tradeNote: "체결된 거래의 가격입니다. NYSE 장 마감에 가장 가까운 스왑 1건입니다.",
    pool: (dex) => `${dex} 풀`,
    day: (date) => `${date}, NYSE 장 마감 무렵`,
    swap: "Solana Explorer에서 열기",
    slot: (slot) => `슬롯 ${slot}`,
    gap: { no_single_swap_in_search_window: "마감 무렵 이 풀에서 단일 스왑으로 확인된 거래가 없습니다.", verification_budget_exhausted: "마감 무렵 거래가 많아 모두 확인하지 못했습니다.", ledger_instructions_unavailable: "이날의 거래를 확인하는 데 필요한 세부 정보를 원장에서 받지 못했습니다.", signature_page_limit: "마감 무렵 풀의 거래 목록이 너무 길어 모두 읽지 못했습니다." },
    metric: { revenue: "매출", net_income_parent: "순이익" },
    yearEnded: (date) => `결산일 ${date}`,
    filed: (form, date) => `${form} 제출일 ${date}`,
    openFiling: (form) => `${form} 열기`,
    accession: (accession) => `접수 번호 ${accession}`,
    notVerified: "제출 서류와 대조하지 않은 값입니다.",
  },
  state: {
    loading: "차트를 불러오는 중입니다…",
    needsJavaScript: "차트를 표시하려면 JavaScript가 필요합니다. 같은 데이터를 아래 표에서 볼 수 있습니다.",
    error: "차트를 불러오지 못했습니다. 같은 데이터를 아래 표에서 볼 수 있습니다.",
    retry: "다시 시도",
    emptyRange: "이 기간에는 거래도 연간 실적도 없습니다.",
    noPriceSeries: (symbol) => `${symbol}의 온체인 거래 데이터가 아직 없습니다.`,
    noFiguresInRange: "이 기간에 실적이 보고된 연도가 없습니다.",
    gaps: (days) => `이 기간 중 ${days}일은 값이 없습니다.`,
    perToken: (symbol) => `값은 ${symbol} 토큰 1개당 USDC이며, 토큰의 표시 배수를 반영하기 전의 값입니다. 기초 주식 1주의 가격이 아닙니다.`,
  },
  table: {
    show: "데이터를 표로 보기",
    figuresCaption: "SEC 제출 서류의 연간 실적(USD)",
    priceCaption: (symbol) => `${symbol}의 일별 온체인 거래 가격`,
    fiscalYear: "회계 연도",
    yearEnded: "결산일",
    filing: "제출 서류",
    date: "NYSE 거래일",
    value: "토큰 1개당 USDC",
    swap: "스왑",
    notShown: "표시 안 함",
    priceFile: "일별 가격을 데이터 파일(JSON)로 보기",
  },
  summary: {
    figures: (company, first, last) => `${company}의 ${first}부터 ${last}까지 연도별 매출과 순이익.`,
    price: (symbol, from, to) => `${symbol}의 ${from}부터 ${to}까지 일별 온체인 거래 가격.`,
    table: "같은 데이터를 차트 아래 표에서 볼 수 있습니다.",
  },
  delta: {
    value: (percent) => `온체인 가격과 Pyth 참고 가격의 차이: ${percent}`,
    note: (tradeDate, pythTime, company) => `마지막 온체인 거래: ${tradeDate}, NYSE 장 마감 무렵. 토큰 1개당 가격을 당시 표시 배수로 나눈 값이 ${company} 주식 1주당 USDC이며, Pyth 참고 가격(${pythTime})은 1주당 USD입니다.`,
    unavailable: "Pyth 참고 가격과의 차이는 표시하지 않습니다. 토큰의 표시 배수 이력이 없어 마지막 온체인 거래에 1주당 값이 없습니다.",
  },
  opensNewTab: "(새 탭에서 열림)",
};

const zhHans: ChartsCopy = {
  heading: {
    company: (symbol, company) => `${symbol} 链上交易与 ${company} 年度业绩`,
    companyFigures: (company) => `${company} 年度业绩`,
    product: (symbol) => `${symbol} 链上交易价格`,
  },
  fixture: "用于审阅的示例数据，并非真实交易或申报文件。",
  range: { label: "期间", short: { "3M": "3个月", "1Y": "1年", all: "全部" }, long: { "3M": "3个月", "1Y": "1年", all: "全部期间" } },
  legend: { label: "图例", price: (symbol) => `${symbol} 每枚代币价格（链上交易，右轴）`, revenue: "营业收入（左轴）", netIncome: "净利润（左轴）", beforeListing: "序列开始前" },
  listed: { xstock: (date) => `链上序列起始日 ${date}`, token: (symbol, date) => `${symbol} 首次交易日 ${date}` },
  source: { priceBefore: "价格：在 Solana 上执行的兑换（", priceAfter: "）。", financials: "业绩：SEC 申报文件。" },
  readout: {
    hint: {
      price: "点按或指向图表，可查看某一天的交易。",
      figures: "点按或指向图表，可查看某一年的业绩。",
      both: "点按或指向图表，可查看某一天的交易或某一年的业绩。",
    },
    price: "链上交易价格",
    perToken: (symbol) => `每枚 ${symbol} 代币的 USDC`,
    tradeNote: "这是一笔已执行交易的价格：最接近 NYSE 收盘时的一笔兑换。",
    pool: (dex) => `${dex} 池`,
    day: (date) => `${date}，接近 NYSE 收盘时`,
    swap: "在 Solana Explorer 中打开",
    slot: (slot) => `槽位 ${slot}`,
    gap: { no_single_swap_in_search_window: "收盘前后，此池中没有可确认为单笔兑换的交易。", verification_budget_exhausted: "收盘前后的交易过多，未能全部核对。", ledger_instructions_unavailable: "账本未返回核对这一天交易所需的详细信息。", signature_page_limit: "收盘前后此池的交易列表过长，未能读完。" },
    metric: { revenue: "营业收入", net_income_parent: "净利润" },
    yearEnded: (date) => `财年截止日 ${date}`,
    filed: (form, date) => `${form} 提交日 ${date}`,
    openFiling: (form) => `打开 ${form}`,
    accession: (accession) => `受理编号 ${accession}`,
    notVerified: "未与申报文件核对的数值。",
  },
  state: {
    loading: "正在加载图表…",
    needsJavaScript: "显示图表需要 JavaScript。可在下方表格中查看相同数据。",
    error: "无法加载图表。可在下方表格中查看相同数据。",
    retry: "重试",
    emptyRange: "此期间没有交易，也没有年度业绩。",
    noPriceSeries: (symbol) => `暂无 ${symbol} 的链上交易数据。`,
    noFiguresInRange: "此期间没有已报告业绩的年度。",
    gaps: (days) => `此期间有 ${days} 天没有数值。`,
    perToken: (symbol) => `数值为每枚 ${symbol} 代币的 USDC，未反映代币的显示倍数，并非一股标的股票的价格。`,
  },
  table: {
    show: "以表格查看数据",
    figuresCaption: "来自 SEC 申报文件的年度业绩（USD）",
    priceCaption: (symbol) => `${symbol} 每日链上交易价格`,
    fiscalYear: "财年",
    yearEnded: "财年截止日",
    filing: "申报文件",
    date: "NYSE 交易日",
    value: "每枚代币 USDC",
    swap: "兑换",
    notShown: "不显示",
    priceFile: "以数据文件（JSON）查看每日价格",
  },
  summary: {
    figures: (company, first, last) => `${company} 各财年的营业收入和净利润（${first}至${last}）。`,
    price: (symbol, from, to) => `${symbol} 从 ${from} 到 ${to} 每天的链上交易价格。`,
    table: "可在图表下方的表格中查看相同数据。",
  },
  delta: {
    value: (percent) => `链上价格与 Pyth 参考价格之差：${percent}`,
    note: (tradeDate, pythTime, company) => `最近一次链上交易：${tradeDate}，接近 NYSE 收盘时。其每枚代币价格除以当时的显示倍数，即为每股 ${company} 股票的 USDC；Pyth 参考价格（${pythTime}）为每股 USD。`,
    unavailable: "未显示与 Pyth 参考价格的差：代币的显示倍数历史不可用，因此最近一次链上交易没有每股数值。",
  },
  opensNewTab: "（在新标签页中打开）",
};

const zhHant: ChartsCopy = {
  heading: {
    company: (symbol, company) => `${symbol} 鏈上交易與 ${company} 年度業績`,
    companyFigures: (company) => `${company} 年度業績`,
    product: (symbol) => `${symbol} 鏈上交易價格`,
  },
  fixture: "供審閱的範例資料，並非真實交易或申報文件。",
  range: { label: "期間", short: { "3M": "3個月", "1Y": "1年", all: "全部" }, long: { "3M": "3個月", "1Y": "1年", all: "全部期間" } },
  legend: { label: "圖例", price: (symbol) => `${symbol} 每枚代幣價格（鏈上交易，右軸）`, revenue: "營業收入（左軸）", netIncome: "淨利（左軸）", beforeListing: "序列開始前" },
  listed: { xstock: (date) => `鏈上序列起始日 ${date}`, token: (symbol, date) => `${symbol} 首次交易日 ${date}` },
  source: { priceBefore: "價格：在 Solana 上執行的兌換（", priceAfter: "）。", financials: "業績：SEC 申報文件。" },
  readout: {
    hint: {
      price: "點按或指向圖表，即可查看某一天的交易。",
      figures: "點按或指向圖表，即可查看某一年的業績。",
      both: "點按或指向圖表，即可查看某一天的交易或某一年的業績。",
    },
    price: "鏈上交易價格",
    perToken: (symbol) => `每枚 ${symbol} 代幣的 USDC`,
    tradeNote: "這是一筆已執行交易的價格：最接近 NYSE 收盤時的一筆兌換。",
    pool: (dex) => `${dex} 池`,
    day: (date) => `${date}，接近 NYSE 收盤時`,
    swap: "在 Solana Explorer 中開啟",
    slot: (slot) => `槽位 ${slot}`,
    gap: { no_single_swap_in_search_window: "收盤前後，此池中沒有可確認為單筆兌換的交易。", verification_budget_exhausted: "收盤前後的交易過多，未能全部核對。", ledger_instructions_unavailable: "帳本未傳回核對這一天交易所需的詳細資訊。", signature_page_limit: "收盤前後此池的交易清單過長，未能讀完。" },
    metric: { revenue: "營業收入", net_income_parent: "淨利" },
    yearEnded: (date) => `財年截止日 ${date}`,
    filed: (form, date) => `${form} 提交日 ${date}`,
    openFiling: (form) => `開啟 ${form}`,
    accession: (accession) => `受理編號 ${accession}`,
    notVerified: "未與申報文件核對的數值。",
  },
  state: {
    loading: "正在載入圖表…",
    needsJavaScript: "顯示圖表需要 JavaScript。可在下方表格查看相同資料。",
    error: "無法載入圖表。可在下方表格查看相同資料。",
    retry: "重試",
    emptyRange: "此期間沒有交易，也沒有年度業績。",
    noPriceSeries: (symbol) => `目前沒有 ${symbol} 的鏈上交易資料。`,
    noFiguresInRange: "此期間沒有已報告業績的年度。",
    gaps: (days) => `此期間有 ${days} 天沒有數值。`,
    perToken: (symbol) => `數值為每枚 ${symbol} 代幣的 USDC，未反映代幣的顯示倍數，並非一股標的股票的價格。`,
  },
  table: {
    show: "以表格查看資料",
    figuresCaption: "來自 SEC 申報文件的年度業績（USD）",
    priceCaption: (symbol) => `${symbol} 每日鏈上交易價格`,
    fiscalYear: "財年",
    yearEnded: "財年截止日",
    filing: "申報文件",
    date: "NYSE 交易日",
    value: "每枚代幣 USDC",
    swap: "兌換",
    notShown: "不顯示",
    priceFile: "以資料檔（JSON）查看每日價格",
  },
  summary: {
    figures: (company, first, last) => `${company} 各財年的營業收入與淨利（${first}至${last}）。`,
    price: (symbol, from, to) => `${symbol} 從 ${from} 到 ${to} 每天的鏈上交易價格。`,
    table: "可在圖表下方的表格查看相同資料。",
  },
  delta: {
    value: (percent) => `鏈上價格與 Pyth 參考價格之差：${percent}`,
    note: (tradeDate, pythTime, company) => `最近一次鏈上交易：${tradeDate}，接近 NYSE 收盤時。其每枚代幣價格除以當時的顯示倍數，即為每股 ${company} 股票的 USDC；Pyth 參考價格（${pythTime}）為每股 USD。`,
    unavailable: "未顯示與 Pyth 參考價格的差：代幣的顯示倍數歷史無法取得，因此最近一次鏈上交易沒有每股數值。",
  },
  opensNewTab: "（在新分頁中開啟）",
};

export const CHARTS_MESSAGES: Record<PublicWebLocale, ChartsCopy> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function chartsMessagesFor(locale: PublicWebLocale): ChartsCopy {
  return CHARTS_MESSAGES[locale];
}
