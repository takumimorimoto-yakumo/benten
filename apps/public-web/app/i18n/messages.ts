/**
 * Public-Web copy for every supported locale. This is the only public-Web file
 * registered for non-Latin text (see catalog-manifest.json); keep all localized
 * strings here. Strings moved from the legacy app keep their meaning; they are
 * restated, never reworded into advice, quotes, or valuations.
 */
import type { AnnualExclusionReason, AnnualProvenance, ProviderName, ProviderReferenceKind, ProviderRightsV1, UnverifiedReason, VerifiedFactName } from "@benten/registry";
import type { PublicWebLocale } from "./locales";

type ExclusionKey = "etf" | "non_sec_listing" | "private" | "preferred" | "unspecified";
type InstrumentKind = ProviderRightsV1["instrument_kind"];
type RightsStatus = ProviderRightsV1["status"];

/** Provider vocabulary shared by the provider and product pages (the former Home page's other keys are gone). */
export type HomeMessages = {
  providers: {
    names: Record<ProviderName, string>; instrumentKinds: Record<InstrumentKind, string>; rightsStatus: Record<RightsStatus, string>;
  };
};

type LegacyFieldKey = "company_name" | "metrics_fiscal_year" | "revenue" | "op_income" | "gross_profit" | "net_income_parent" | "total_assets" | "total_equity" | "total_liabilities" | "long_term_debt" | "operating_cf" | "investing_cf" | "fcf";
type LegacyGroupKey = "entity" | "income" | "balance" | "cashflow";

export type Messages = {
  metadata: { title: string; description: string };
  site: { skipToContent: string; primaryNavigation: string; disclaimer: string; language: string; currentLanguage: (language: string) => string; preview: string };
  footer: { disclaimer: string; walletNotice: string };
  home: HomeMessages;
  dossier: {
    underlyingCompany: string;
    coverage: { sourceVerified: string; legacyOnly: string; noCoverage: string; noData: string };
    verified: {
      heading: string; description: string; none: string; factColumn: string; valueColumn: string; periodColumn: string; sourceColumn: string;
      concept: string; form: string; filed: string; accession: string; authority: string; unit: string; scale: (value: string) => string;
      duration: string; instant: string; fromTo: (start: string, end: string) => string; asOf: (date: string) => string;
      filedLink: (form: string, date: string) => string; openFiling: (company: string, year: string, form: string) => string; opensNewTab: string;
      /**
       * A fiscal year named by the month it ends ("Year ended Feb 2026"), never
       * by a fiscal-year number: issuers number their years differently. Used
       * only through `fiscalYearLabel` (`i18n/fiscal-year.ts`).
       */
      fiscalYearEnded: (month: string) => string;
      /** The same year on a chart's time axis, where the full label does not fit. */
      fiscalYearAxis: (month: string) => string;
      labels: Record<VerifiedFactName, string>;
    };
    annual: {
      heading: string; description: (firstYear: string) => string; annualReport: string; noAnnualReport: string; statusColumn: string; citedFiling: string;
      /** The mark of an `unverified_or_derived` value: shown, but not a reported value. */
      notVerified: string;
      provenance: Record<AnnualProvenance, string>; reasons: Record<UnverifiedReason, string>; excluded: Record<AnnualExclusionReason, string>;
      originally: (value: string, date: string) => string;
    };
    legacy: { heading: string; sourceUnknown: string; unverified: string; note: (asOf: string, source: string) => string; source: string; unavailable: string; valueColumn: string; fields: Record<LegacyFieldKey, string>; groups: Record<LegacyGroupKey, string> };
    registry: { heading: string; note: string; source: string; asOf: (date: string) => string; underlyingTicker: string; secRegistrant: string; secRegistrantValue: (name: string, cik: string) => string; tokenSymbol: string; tokenName: string; mint: string; issuer: string; issuerVerified: string; tokenDecimals: string; yes: string; no: string };
    exclusion: { heading: string; labels: Record<ExclusionKey, string>; explanations: Record<ExclusionKey, string> };
    noData: { heading: string; body: (ticker: string) => string };
    purchase: { heading: string; jumpLink: string; unsupportedHeading: (symbol: string) => string; unsupportedBody: string };
  };
};

export const LOCALE_LABELS: Record<PublicWebLocale, string> = {"en": "English", "ja": "日本語", "ko": "한국어", "zh-Hans": "简体中文", "zh-Hant": "繁體中文"};

const en: Messages = {
  metadata: { title: "Benten — Open-source financial facts for Solana xStocks", description: "Open-source financial facts for Solana xStocks." },
  site: { skipToContent: "Skip to content", primaryNavigation: "Primary navigation", disclaimer: "Disclaimer", language: "Language", currentLanguage: (language) => `Current language: ${language}`, preview: "Development preview" },
  footer: { disclaimer: "Factual data only. Not investment advice, a recommendation, or a valuation.", walletNotice: "Benten never signs or sends transactions. Purchases are approved and sent by your own wallet." },
  home: {
    providers: {
      names: { prestocks: "PreStocks" },
      instrumentKinds: { tracker_certificate: "Tracker certificate", economic_exposure_instrument: "Economic exposure instrument", unknown: "Unknown" },
      rightsStatus: { public_source_verified: "Public source verified", provider_terms_observed: "Provider terms observed", provider_claim_only: "Provider claim only", unknown: "Unknown" },
    },
  },
  dossier: {
    underlyingCompany: "Underlying company",
    coverage: { sourceVerified: "Source verified", legacyOnly: "Legacy snapshot", noCoverage: "No Benten filing coverage", noData: "No current financial row" },
    verified: { heading: "Verified facts", description: "Values reported in SEC EDGAR filings, each with its exact period and filing.", none: "Benten has no SEC EDGAR verified facts for this token.", factColumn: "Fact", valueColumn: "Value", periodColumn: "Period", sourceColumn: "Source", concept: "XBRL concept", form: "Form", filed: "Filed", accession: "Accession number", authority: "Source authority", unit: "Unit", scale: (value) => `scale ${value}`, duration: "duration", instant: "instant", fromTo: (start, end) => `${start} to ${end}`, asOf: (date) => `As of ${date}`, filedLink: (form, date) => `${form}, filed ${date}`, openFiling: (company, year, form) => `Open ${company} ${form} (${year})`, opensNewTab: "(opens in a new tab)", fiscalYearEnded: (month) => `Year ended ${month}`, fiscalYearAxis: (month) => month, labels: { revenue: "Revenue", net_income_parent: "Net income attributable to parent", total_assets: "Total assets", total_liabilities: "Total liabilities", operating_cf: "Operating cash flow" } },
    annual: { heading: "Annual history", description: (firstYear) => `Five facts for each fiscal year (from ${firstYear}). Each year shows the annual report that covers it, and each value the filing it cites.`, annualReport: "Annual report", noAnnualReport: "This year has no annual report of its own.", statusColumn: "Status", citedFiling: "Cited filing", notVerified: "Not verified against the filing", provenance: { annual_report: "Reported in this year's annual report", restated_in_later_report: "Restated in a later annual report", reported_in_later_report: "Reported only in a later annual report" }, reasons: { derived_by_source: "Calculated by the data source; no filing reports it", reported_under_unlisted_concept: "Reported under a concept Benten does not accept", value_not_reported_in_filings: "No filing reports this value", implausible_revenue_concept: "Revenue is below the year's net income or operating cash flow", ambiguous_period: "The reported period is ambiguous", period_mismatch: "The reported period does not match the fiscal year" }, excluded: { not_in_source: "Not in the source data", unsafe_value: "Not shown: the value cannot be shown exactly", no_annual_report_to_cite: "Not shown: no annual report to cite" }, originally: (value, date) => `Originally ${value} in the annual report filed ${date}` },
    legacy: { heading: "Legacy snapshot", sourceUnknown: "Source unknown", unverified: "Unverified", note: (asOf, source) => `As of ${asOf}. Source: ${source}. Filing date, unit, source, and reported-versus-calculated status are unverified for these values.`, source: "Benten legacy financial snapshot; filing source, unit, and fact kind unverified", unavailable: "The registry record remains available, but no current legacy snapshot is present.", valueColumn: "Value", fields: { company_name: "Company name", metrics_fiscal_year: "Fiscal year", revenue: "Revenue", op_income: "Operating income", gross_profit: "Gross profit", net_income_parent: "Net income (parent)", total_assets: "Total assets", total_equity: "Total equity", total_liabilities: "Total liabilities", long_term_debt: "Long-term debt", operating_cf: "Operating cash flow", investing_cf: "Investing cash flow", fcf: "Free cash flow" }, groups: { entity: "Entity", income: "Income statement", balance: "Balance sheet", cashflow: "Cash flow" } },
    registry: { heading: "Registry record", note: "Static registry facts about the token itself, from the Benten xStocks registry.", source: "Registry source", asOf: (date) => `As of ${date}`, underlyingTicker: "Underlying ticker", secRegistrant: "SEC registrant", secRegistrantValue: (name, cik) => `${name} (CIK ${cik})`, tokenSymbol: "Token symbol", tokenName: "Token name", mint: "Mint", issuer: "Issuer", issuerVerified: "Issuer verified", tokenDecimals: "Token decimals", yes: "Yes", no: "No" },
    exclusion: { heading: "No current Benten financial coverage", labels: { etf: "Exchange-traded fund", non_sec_listing: "Non-SEC listing", private: "Private company", preferred: "Preferred share class", unspecified: "Unspecified" }, explanations: { etf: "Exchange-traded fund — this ticker has no company-level SEC financial statements in current Benten coverage.", non_sec_listing: "Listed outside the SEC reporting regime covered by Benten.", private: "Private company — no Benten SEC filing coverage is currently available.", preferred: "Preferred share class without its own filing set in current Benten coverage.", unspecified: "No SEC financial statement coverage is currently available in Benten for this ticker." } },
    noData: { heading: "No current financial row", body: (ticker) => `${ticker} is filing-eligible, but the current Benten snapshot has no financial row for it.` },
    purchase: { heading: "Purchase", jumpLink: "Buy NVDAx with USDC", unsupportedHeading: (symbol) => `Purchase not available for ${symbol}`, unsupportedBody: "Benten supports buying only NVDAx with USDC, through one fixed pool. Benten offers no purchase for this token." },
  },
};

const ja: Messages = {
  metadata: { title: "Benten — Solana xStocksのオープンな財務データ", description: "Solana xStocksのオープンな財務データ。" },
  site: { skipToContent: "本文へ移動", primaryNavigation: "主要ナビゲーション", disclaimer: "免責事項", language: "言語", currentLanguage: (language) => `現在の言語: ${language}`, preview: "開発中のプレビュー" },
  footer: { disclaimer: "事実情報のみを提供します。投資助言、推奨、または評価ではありません。", walletNotice: "Bentenがトランザクションに署名したり送信したりすることはありません。購入はご自身のウォレットで承認され、送信されます。" },
  home: {
    providers: {
      names: { prestocks: "PreStocks" },
      instrumentKinds: { tracker_certificate: "トラッカー証券", economic_exposure_instrument: "経済的エクスポージャー商品", unknown: "不明" },
      rightsStatus: { public_source_verified: "公開情報で確認済み", provider_terms_observed: "プロバイダー規約を確認", provider_claim_only: "プロバイダーの主張のみ", unknown: "不明" },
    },
  },
  dossier: {
    underlyingCompany: "原資産の企業",
    coverage: { sourceVerified: "出典確認済み", legacyOnly: "レガシースナップショット", noCoverage: "Bentenの提出書類対象外", noData: "現在の財務データなし" },
    verified: { heading: "出典確認済みの財務データ", description: "SEC EDGARの提出書類で報告された値です。それぞれに期間と提出書類を示します。", none: "このトークンには、SEC EDGARで出典を確認した財務データがBentenにありません。", factColumn: "項目", valueColumn: "値", periodColumn: "期間", sourceColumn: "出典", concept: "XBRL要素", form: "様式", filed: "提出日", accession: "受付番号", authority: "出典機関", unit: "単位", scale: (value) => `スケール ${value}`, duration: "期間", instant: "時点", fromTo: (start, end) => `${start} から ${end}`, asOf: (date) => `${date} 時点`, filedLink: (form, date) => `${form}、提出日 ${date}`, openFiling: (company, year, form) => `${company} ${form}（${year}）を開く`, opensNewTab: "（新しいタブで開きます）", fiscalYearEnded: (month) => `${month}期`, fiscalYearAxis: (month) => `${month}期`, labels: { revenue: "売上高", net_income_parent: "親会社に帰属する純利益", total_assets: "資産合計", total_liabilities: "負債合計", operating_cf: "営業キャッシュフロー" } },
    annual: { heading: "年度別の財務データ", description: (firstYear) => `${firstYear}以降の各会計年度について5項目を示します。各年度にはその年度の年次報告書を、各値には出典の提出書類を示します。`, annualReport: "年次報告書", noAnnualReport: "この年度には独自の年次報告書がありません。", statusColumn: "状態", citedFiling: "出典の提出書類", notVerified: "提出書類と照合されていません", provenance: { annual_report: "この年度の年次報告書で報告", restated_in_later_report: "後の年次報告書で修正再表示", reported_in_later_report: "後の年次報告書でのみ報告" }, reasons: { derived_by_source: "データ提供元による算出値で、提出書類には報告されていません", reported_under_unlisted_concept: "Bentenが採用していない要素で報告されています", value_not_reported_in_filings: "この値を報告する提出書類がありません", implausible_revenue_concept: "売上高が同年度の純利益または営業キャッシュフローを下回っています", ambiguous_period: "報告期間が特定できません", period_mismatch: "報告期間が会計年度と一致しません" }, excluded: { not_in_source: "元データにありません", unsafe_value: "正確に表示できない値のため掲載していません", no_annual_report_to_cite: "出典となる年次報告書がないため掲載していません" }, originally: (value, date) => `当初の値 ${value}（${date} 提出の年次報告書）` },
    legacy: { heading: "レガシースナップショット", sourceUnknown: "出典不明", unverified: "未確認", note: (asOf, source) => `${asOf} 時点。出典: ${source}。これらの値について、提出日、単位、出典、報告値か計算値かの状態は未確認です。`, source: "Benten 従来版財務スナップショット。提出書類の出典、単位、値の種別は未確認", unavailable: "レジストリの登録情報は利用できますが、現在のレガシースナップショットはありません。", valueColumn: "値", fields: { company_name: "企業名", metrics_fiscal_year: "会計年度", revenue: "売上高", op_income: "営業利益", gross_profit: "売上総利益", net_income_parent: "純利益（親会社）", total_assets: "資産合計", total_equity: "資本合計", total_liabilities: "負債合計", long_term_debt: "長期債務", operating_cf: "営業キャッシュフロー", investing_cf: "投資キャッシュフロー", fcf: "フリーキャッシュフロー" }, groups: { entity: "企業情報", income: "損益計算書", balance: "貸借対照表", cashflow: "キャッシュフロー" } },
    registry: { heading: "レジストリの登録情報", note: "Benten xStocksレジストリに収録された、トークン自体に関する静的な登録情報です。", source: "レジストリの出典", asOf: (date) => `${date} 時点`, underlyingTicker: "原資産のティッカー", secRegistrant: "SEC登録名", secRegistrantValue: (name, cik) => `${name}（CIK ${cik}）`, tokenSymbol: "トークンシンボル", tokenName: "トークン名", mint: "Mint", issuer: "発行者", issuerVerified: "発行者確認済み", tokenDecimals: "トークンの小数桁数", yes: "はい", no: "いいえ" },
    exclusion: { heading: "現在のBenten財務カバレッジなし", labels: { etf: "上場投資信託（ETF）", non_sec_listing: "SEC 報告制度対象外の上場銘柄", private: "非公開企業", preferred: "優先株式クラス", unspecified: "未指定" }, explanations: { etf: "上場投資信託です。このティッカーに対応する会社単位のSEC財務諸表は、現在のBenten収録対象にありません。", non_sec_listing: "Bentenが対象とするSEC報告制度の範囲外で上場しています。", private: "非公開企業です。現在Bentenで利用できるSEC提出書類の収録対象ではありません。", preferred: "現在のBenten収録対象に独自の提出書類セットがない優先株式クラスです。", unspecified: "このティッカーに対するSEC財務諸表は、現在のBenten収録対象にありません。" } },
    noData: { heading: "現在の財務データなし", body: (ticker) => `${ticker} は提出書類の収録対象ですが、現在のBentenスナップショットには財務データがありません。` },
    purchase: { heading: "購入", jumpLink: "USDCでNVDAxを購入", unsupportedHeading: (symbol) => `${symbol} は購入できません`, unsupportedBody: "Bentenが対応している購入は、1つの固定プールを通じてUSDCでNVDAxを購入することだけです。このトークンの購入は提供していません。" },
  },
};

const ko: Messages = {
  metadata: { title: "Benten — Solana xStocks의 오픈 재무 데이터", description: "Solana xStocks의 오픈 재무 데이터입니다." },
  site: { skipToContent: "본문으로 건너뛰기", primaryNavigation: "기본 탐색", disclaimer: "면책 조항", language: "언어", currentLanguage: (language) => `현재 언어: ${language}`, preview: "개발 중 미리보기" },
  footer: { disclaimer: "사실 데이터만 제공합니다. 투자 조언, 추천 또는 가치평가가 아닙니다.", walletNotice: "Benten은 트랜잭션에 서명하거나 전송하지 않습니다. 구매는 본인의 지갑에서 승인되고 전송됩니다." },
  home: {
    providers: {
      names: { prestocks: "PreStocks" },
      instrumentKinds: { tracker_certificate: "트래커 증권", economic_exposure_instrument: "경제적 익스포저 상품", unknown: "알 수 없음" },
      rightsStatus: { public_source_verified: "공개 출처로 확인됨", provider_terms_observed: "제공자 약관 확인됨", provider_claim_only: "제공자 주장만 있음", unknown: "알 수 없음" },
    },
  },
  dossier: {
    underlyingCompany: "기초자산 기업",
    coverage: { sourceVerified: "출처 확인됨", legacyOnly: "기존 스냅샷", noCoverage: "Benten 공시 수록 대상 아님", noData: "현재 재무 데이터 없음" },
    verified: { heading: "출처가 확인된 재무 데이터", description: "SEC EDGAR 제출 공시에 보고된 값이며, 각 값의 정확한 기간과 제출 공시를 함께 표시합니다.", none: "Benten에는 이 토큰에 대해 SEC EDGAR로 출처가 확인된 재무 데이터가 없습니다.", factColumn: "항목", valueColumn: "값", periodColumn: "기간", sourceColumn: "출처", concept: "XBRL 요소", form: "양식", filed: "제출일", accession: "접수 번호", authority: "출처 기관", unit: "단위", scale: (value) => `스케일 ${value}`, duration: "기간", instant: "시점", fromTo: (start, end) => `${start}부터 ${end}까지`, asOf: (date) => `${date} 기준`, filedLink: (form, date) => `${form}, 제출일 ${date}`, openFiling: (company, year, form) => `${company} ${form}(${year}) 열기`, opensNewTab: "(새 탭에서 열림)", fiscalYearEnded: (month) => `${month} 결산`, fiscalYearAxis: (month) => month, labels: { revenue: "매출액", net_income_parent: "지배기업에 귀속되는 순이익", total_assets: "자산총계", total_liabilities: "부채총계", operating_cf: "영업활동 현금흐름" } },
    annual: { heading: "연도별 재무 데이터", description: (firstYear) => `${firstYear} 이후 각 회계연도의 5개 항목입니다. 연도마다 해당 연도의 연차 보고서를, 값마다 인용한 제출 공시를 표시합니다.`, annualReport: "연차 보고서", noAnnualReport: "이 연도에는 자체 연차 보고서가 없습니다.", statusColumn: "상태", citedFiling: "인용한 제출 공시", notVerified: "제출 공시와 대조되지 않은 값", provenance: { annual_report: "해당 연도 연차 보고서에 보고됨", restated_in_later_report: "이후 연차 보고서에서 재작성됨", reported_in_later_report: "이후 연차 보고서에만 보고됨" }, reasons: { derived_by_source: "데이터 제공처가 산출한 값으로, 제출 공시에 보고되지 않았습니다", reported_under_unlisted_concept: "Benten이 채택하지 않은 요소로 보고되었습니다", value_not_reported_in_filings: "이 값을 보고한 제출 공시가 없습니다", implausible_revenue_concept: "매출액이 같은 연도의 순이익 또는 영업활동 현금흐름보다 작습니다", ambiguous_period: "보고 기간이 명확하지 않습니다", period_mismatch: "보고 기간이 회계연도와 일치하지 않습니다" }, excluded: { not_in_source: "원본 데이터에 없습니다", unsafe_value: "정확히 표시할 수 없는 값이어서 표시하지 않습니다", no_annual_report_to_cite: "인용할 연차 보고서가 없어 표시하지 않습니다" }, originally: (value, date) => `최초 값 ${value} (${date} 제출 연차 보고서)` },
    legacy: { heading: "기존 스냅샷", sourceUnknown: "출처 불명", unverified: "미확인", note: (asOf, source) => `${asOf} 기준. 출처: ${source}. 이 값의 제출일, 단위, 출처 및 보고값인지 계산값인지의 상태는 확인되지 않았습니다.`, source: "Benten 기존 재무 스냅샷. 공시 출처, 단위 및 값의 유형은 미확인", unavailable: "레지스트리 등록 정보는 이용할 수 있지만 현재 기존 스냅샷은 없습니다.", valueColumn: "값", fields: { company_name: "기업명", metrics_fiscal_year: "회계연도", revenue: "매출액", op_income: "영업이익", gross_profit: "매출총이익", net_income_parent: "순이익(지배기업)", total_assets: "자산총계", total_equity: "자본총계", total_liabilities: "부채총계", long_term_debt: "장기부채", operating_cf: "영업활동 현금흐름", investing_cf: "투자활동 현금흐름", fcf: "잉여현금흐름" }, groups: { entity: "기업 정보", income: "손익계산서", balance: "재무상태표", cashflow: "현금흐름" } },
    registry: { heading: "레지스트리 등록 정보", note: "Benten xStocks 레지스트리에 수록된 토큰 자체에 관한 정적 등록 정보입니다.", source: "레지스트리 출처", asOf: (date) => `${date} 기준`, underlyingTicker: "기초자산 티커", secRegistrant: "SEC 등록명", secRegistrantValue: (name, cik) => `${name} (CIK ${cik})`, tokenSymbol: "토큰 심볼", tokenName: "토큰 이름", mint: "Mint", issuer: "발행자", issuerVerified: "발행자 확인됨", tokenDecimals: "토큰 소수 자릿수", yes: "예", no: "아니요" },
    exclusion: { heading: "현재 Benten 재무 데이터 없음", labels: { etf: "상장지수펀드(ETF)", non_sec_listing: "SEC 보고 제도 대상 외 상장 종목", private: "비공개 기업", preferred: "우선주 종류", unspecified: "미지정" }, explanations: { etf: "상장지수펀드입니다. 이 티커의 기업 단위 SEC 재무제표는 현재 Benten 수록 대상에 없습니다.", non_sec_listing: "Benten이 다루는 SEC 보고 제도의 범위 밖에 상장된 종목입니다.", private: "비공개 기업입니다. 현재 Benten에서 이용 가능한 SEC 제출 공시 수록 대상이 아닙니다.", preferred: "현재 Benten 수록 대상에 독립적인 제출 공시 묶음이 없는 우선주 종류입니다.", unspecified: "이 티커의 SEC 재무제표는 현재 Benten 수록 대상에 없습니다." } },
    noData: { heading: "현재 재무 데이터 없음", body: (ticker) => `${ticker}는 공시 수록 대상이지만 현재 Benten 스냅샷에는 해당 재무 데이터가 없습니다.` },
    purchase: { heading: "구매", jumpLink: "USDC로 NVDAx 구매", unsupportedHeading: (symbol) => `${symbol}은(는) 구매할 수 없습니다`, unsupportedBody: "Benten은 하나의 고정된 풀을 통해 USDC로 NVDAx를 구매하는 것만 지원합니다. 이 토큰의 구매는 제공하지 않습니다." },
  },
};

const zhHans: Messages = {
  metadata: { title: "Benten — Solana xStocks 的开源财务数据", description: "Solana xStocks 的开源财务数据。" },
  site: { skipToContent: "跳到正文", primaryNavigation: "主导航", disclaimer: "免责声明", language: "语言", currentLanguage: (language) => `当前语言：${language}`, preview: "开发预览" },
  footer: { disclaimer: "仅提供事实数据，不构成投资建议、推荐或估值。", walletNotice: "Benten 从不签名或发送交易。购买由你自己的钱包批准并发送。" },
  home: {
    providers: {
      names: { prestocks: "PreStocks" },
      instrumentKinds: { tracker_certificate: "跟踪凭证", economic_exposure_instrument: "经济敞口工具", unknown: "未知" },
      rightsStatus: { public_source_verified: "已由公开来源核实", provider_terms_observed: "已查阅提供方条款", provider_claim_only: "仅为提供方主张", unknown: "未知" },
    },
  },
  dossier: {
    underlyingCompany: "底层企业",
    coverage: { sourceVerified: "已核对来源", legacyOnly: "旧版快照", noCoverage: "不在 Benten 披露文件收录范围内", noData: "当前无财务记录" },
    verified: { heading: "已核对来源的财务数据", description: "SEC EDGAR 披露文件中申报的数值，每项均注明确切期间和对应文件。", none: "Benten 没有此代币经 SEC EDGAR 核对来源的财务数据。", factColumn: "项目", valueColumn: "数值", periodColumn: "期间", sourceColumn: "来源", concept: "XBRL 元素", form: "表格", filed: "提交日期", accession: "提交编号", authority: "来源机构", unit: "单位", scale: (value) => `缩放系数 ${value}`, duration: "期间", instant: "时点", fromTo: (start, end) => `${start} 至 ${end}`, asOf: (date) => `截至 ${date}`, filedLink: (form, date) => `${form}，提交日期 ${date}`, openFiling: (company, year, form) => `打开 ${company} ${form}（${year}）`, opensNewTab: "（在新标签页中打开）", fiscalYearEnded: (month) => `截至${month}的财年`, fiscalYearAxis: (month) => month, labels: { revenue: "营业收入", net_income_parent: "归属于母公司的净利润", total_assets: "资产总额", total_liabilities: "负债总额", operating_cf: "经营活动现金流量" } },
    annual: { heading: "逐年财务数据", description: (firstYear) => `每个财年的五项数据（自${firstYear}起）。每一年注明涵盖该年的年度报告，每个数值注明其引用的文件。`, annualReport: "年度报告", noAnnualReport: "该年度没有自己的年度报告。", statusColumn: "状态", citedFiling: "引用的文件", notVerified: "未与文件核对", provenance: { annual_report: "见于该年度的年度报告", restated_in_later_report: "在后续年度报告中重述", reported_in_later_report: "仅见于后续年度报告" }, reasons: { derived_by_source: "由数据来源计算得出，文件中未申报", reported_under_unlisted_concept: "以 Benten 不采用的元素申报", value_not_reported_in_filings: "没有文件申报此数值", implausible_revenue_concept: "营业收入低于同年的净利润或经营活动现金流量", ambiguous_period: "申报期间不明确", period_mismatch: "申报期间与财年不一致" }, excluded: { not_in_source: "来源数据中没有", unsafe_value: "数值无法精确显示，未予显示", no_annual_report_to_cite: "没有可引用的年度报告，未予显示" }, originally: (value, date) => `原始数值 ${value}（${date} 提交的年度报告）` },
    legacy: { heading: "旧版快照", sourceUnknown: "来源不明", unverified: "未经核实", note: (asOf, source) => `截至 ${asOf}。来源：${source}。这些数值的提交日期、单位、来源，以及属于报告值还是计算值的状态均未经核实。`, source: "Benten 旧版财务快照；披露文件来源、单位和数值类型未经核实", unavailable: "注册表记录仍可使用，但当前没有旧版快照。", valueColumn: "数值", fields: { company_name: "企业名称", metrics_fiscal_year: "财年", revenue: "营业收入", op_income: "营业利润", gross_profit: "毛利润", net_income_parent: "净利润（母公司）", total_assets: "资产总额", total_equity: "权益总额", total_liabilities: "负债总额", long_term_debt: "长期债务", operating_cf: "经营活动现金流量", investing_cf: "投资活动现金流量", fcf: "自由现金流" }, groups: { entity: "企业信息", income: "利润表", balance: "资产负债表", cashflow: "现金流量" } },
    registry: { heading: "注册表记录", note: "来自 Benten xStocks 注册表、有关代币本身的静态登记信息。", source: "注册表来源", asOf: (date) => `截至 ${date}`, underlyingTicker: "底层资产代码", secRegistrant: "SEC 注册名称", secRegistrantValue: (name, cik) => `${name}（CIK ${cik}）`, tokenSymbol: "代币符号", tokenName: "代币名称", mint: "Mint", issuer: "发行方", issuerVerified: "已确认发行方", tokenDecimals: "代币小数位数", yes: "是", no: "否" },
    exclusion: { heading: "当前无 Benten 财务数据", labels: { etf: "交易所交易基金（ETF）", non_sec_listing: "SEC 报告制度范围外的上市标的", private: "非上市公司", preferred: "优先股类别", unspecified: "未指定" }, explanations: { etf: "这是交易所交易基金，此代码的企业层面 SEC 财务报表不在当前 Benten 收录范围内。", non_sec_listing: "该标的在 Benten 覆盖的 SEC 报告制度范围之外上市。", private: "这是非上市公司，当前不在 Benten 的 SEC 披露文件收录范围内。", preferred: "该优先股类别在当前 Benten 收录范围内没有独立披露文件集。", unspecified: "此代码的 SEC 财务报表当前不在 Benten 收录范围内。" } },
    noData: { heading: "当前无财务记录", body: (ticker) => `${ticker} 属于披露文件收录范围，但当前 Benten 快照中没有其财务记录。` },
    purchase: { heading: "购买", jumpLink: "用 USDC 购买 NVDAx", unsupportedHeading: (symbol) => `${symbol} 不提供购买`, unsupportedBody: "Benten 仅支持通过一个固定池用 USDC 购买 NVDAx，不提供此代币的购买。" },
  },
};

const zhHant: Messages = {
  metadata: { title: "Benten — Solana xStocks 的開源財務資料", description: "Solana xStocks 的開源財務資料。" },
  site: { skipToContent: "跳到正文", primaryNavigation: "主要導覽", disclaimer: "免責聲明", language: "語言", currentLanguage: (language) => `目前語言：${language}`, preview: "開發預覽" },
  footer: { disclaimer: "僅提供事實資料，不構成投資建議、推薦或估值。", walletNotice: "Benten 從不簽署或傳送交易。購買由你自己的錢包核准並傳送。" },
  home: {
    providers: {
      names: { prestocks: "PreStocks" },
      instrumentKinds: { tracker_certificate: "追蹤憑證", economic_exposure_instrument: "經濟曝險工具", unknown: "未知" },
      rightsStatus: { public_source_verified: "已由公開來源查核", provider_terms_observed: "已查閱提供方條款", provider_claim_only: "僅為提供方主張", unknown: "未知" },
    },
  },
  dossier: {
    underlyingCompany: "底層企業",
    coverage: { sourceVerified: "已核對來源", legacyOnly: "舊版快照", noCoverage: "不在 Benten 揭露文件收錄範圍內", noData: "目前無財務紀錄" },
    verified: { heading: "已核對來源的財務資料", description: "SEC EDGAR 揭露文件中申報的數值，每項均註明確切期間與對應文件。", none: "Benten 沒有此代幣經 SEC EDGAR 核對來源的財務資料。", factColumn: "項目", valueColumn: "數值", periodColumn: "期間", sourceColumn: "來源", concept: "XBRL 元素", form: "表格", filed: "提交日期", accession: "提交編號", authority: "來源機構", unit: "單位", scale: (value) => `縮放係數 ${value}`, duration: "期間", instant: "時點", fromTo: (start, end) => `${start} 至 ${end}`, asOf: (date) => `截至 ${date}`, filedLink: (form, date) => `${form}，提交日期 ${date}`, openFiling: (company, year, form) => `開啟 ${company} ${form}（${year}）`, opensNewTab: "（在新分頁中開啟）", fiscalYearEnded: (month) => `截至${month}的財年`, fiscalYearAxis: (month) => month, labels: { revenue: "營收", net_income_parent: "歸屬於母公司的淨利", total_assets: "資產總額", total_liabilities: "負債總額", operating_cf: "營業活動現金流量" } },
    annual: { heading: "逐年財務資料", description: (firstYear) => `每個財年的五項資料（自${firstYear}起）。每一年註明涵蓋該年的年度報告，每個數值註明其引用的文件。`, annualReport: "年度報告", noAnnualReport: "該年度沒有自己的年度報告。", statusColumn: "狀態", citedFiling: "引用的文件", notVerified: "未與文件核對", provenance: { annual_report: "見於該年度的年度報告", restated_in_later_report: "在後續年度報告中重編", reported_in_later_report: "僅見於後續年度報告" }, reasons: { derived_by_source: "由資料來源計算得出，文件中未申報", reported_under_unlisted_concept: "以 Benten 不採用的元素申報", value_not_reported_in_filings: "沒有文件申報此數值", implausible_revenue_concept: "營收低於同年的淨利或營業活動現金流量", ambiguous_period: "申報期間不明確", period_mismatch: "申報期間與財年不一致" }, excluded: { not_in_source: "來源資料中沒有", unsafe_value: "數值無法精確顯示，未予顯示", no_annual_report_to_cite: "沒有可引用的年度報告，未予顯示" }, originally: (value, date) => `原始數值 ${value}（${date} 提交的年度報告）` },
    legacy: { heading: "舊版快照", sourceUnknown: "來源不明", unverified: "未經核實", note: (asOf, source) => `截至 ${asOf}。來源：${source}。這些數值的提交日期、單位、來源，以及屬於報告值還是計算值的狀態均未經核實。`, source: "Benten 舊版財務快照；揭露文件來源、單位及數值類型未經核實", unavailable: "登錄表紀錄仍可使用，但目前沒有舊版快照。", valueColumn: "數值", fields: { company_name: "企業名稱", metrics_fiscal_year: "會計年度", revenue: "營收", op_income: "營業利益", gross_profit: "毛利", net_income_parent: "淨利（母公司）", total_assets: "資產總額", total_equity: "權益總額", total_liabilities: "負債總額", long_term_debt: "長期債務", operating_cf: "營業活動現金流量", investing_cf: "投資活動現金流量", fcf: "自由現金流" }, groups: { entity: "企業資訊", income: "損益表", balance: "資產負債表", cashflow: "現金流量" } },
    registry: { heading: "登錄表紀錄", note: "來自 Benten xStocks 登錄表、有關代幣本身的靜態登錄資訊。", source: "登錄表來源", asOf: (date) => `截至 ${date}`, underlyingTicker: "底層資產代碼", secRegistrant: "SEC 登記名稱", secRegistrantValue: (name, cik) => `${name}（CIK ${cik}）`, tokenSymbol: "代幣符號", tokenName: "代幣名稱", mint: "Mint", issuer: "發行方", issuerVerified: "已確認發行方", tokenDecimals: "代幣小數位數", yes: "是", no: "否" },
    exclusion: { heading: "目前無 Benten 財務資料", labels: { etf: "交易所交易基金（ETF）", non_sec_listing: "SEC 報告制度範圍外的上市標的", private: "非上市公司", preferred: "特別股類別", unspecified: "未指定" }, explanations: { etf: "這是交易所交易基金，此代碼的企業層級 SEC 財務報表不在目前 Benten 收錄範圍內。", non_sec_listing: "該標的在 Benten 涵蓋的 SEC 報告制度範圍之外上市。", private: "這是非上市公司，目前不在 Benten 的 SEC 揭露文件收錄範圍內。", preferred: "該特別股類別在目前 Benten 收錄範圍內沒有獨立揭露文件集。", unspecified: "此代碼的 SEC 財務報表目前不在 Benten 收錄範圍內。" } },
    noData: { heading: "目前無財務紀錄", body: (ticker) => `${ticker} 屬於揭露文件收錄範圍，但目前 Benten 快照中沒有其財務紀錄。` },
    purchase: { heading: "購買", jumpLink: "用 USDC 購買 NVDAx", unsupportedHeading: (symbol) => `${symbol} 不提供購買`, unsupportedBody: "Benten 僅支援透過一個固定池以 USDC 購買 NVDAx，不提供此代幣的購買。" },
  },
};

export const MESSAGES: Record<PublicWebLocale, Messages> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function messagesFor(locale: PublicWebLocale): Messages {
  return MESSAGES[locale];
}

/*
 * Provider instrument, company, and not-found copy. Kept as its own block so
 * that these pages add keys without rewriting the catalog above. Nothing here
 * names a quote, NAV, price, advice, a recommendation, or buying, except the
 * one statement on a provider page that Benten offers no purchase.
 */
type ProviderEntry = import("@benten/registry").ProviderAssetEntryV1;
type BindingStatus = ProviderEntry["company_binding"]["binding_status"];
type RedemptionKind = ProviderRightsV1["redemption_kind"];
type ProviderUnknownCode = import("@benten/registry").ProviderUnknownCode;
type ProviderUnknownBlock = import("@benten/registry").ProviderUnknownBlock;
/** Restriction codes this catalog has reviewed; any other provider code is shown as written. */
export type KnownRestrictionCode = "provider_terms_not_reviewed" | "no_public_source_verification";
type NotFoundScope = import("../lib/not-found").NotFoundScope;

export type ReferenceMessages = {
  companyPageLink: (name: string) => string;
  terms: {
    bindingStatus: Record<BindingStatus, string>; redemption: Record<Exclude<RedemptionKind, "unknown">, string>; restrictions: Record<KnownRestrictionCode, string>;
    unknownCodes: Record<ProviderUnknownCode, string>; blocks: Record<ProviderUnknownBlock, string>; referenceKinds: Record<ProviderReferenceKind, string>;
    unknownValue: string; noValue: string;
  };
  provider: {
    lede: (provider: string) => string;
    identity: { heading: string; note: string; provider: string; symbol: string; displayName: string; instrument: string; mint: string; tokenProgram: string; notReported: string; providerPage: string; openOn: (provider: string) => string };
    company: { heading: string; note: string; company: string; binding: string; noFilingCoverage: string };
    rights: { heading: string; note: (provider: string) => string; status: string; equity: string; voting: string; redemption: string; restrictions: string; terms: (provider: string) => string };
    values: { heading: string; note: (provider: string, date: string) => string; kind: string; value: string; currency: string; asOf: string; fetched: string; caption: (symbol: string) => string; supplyHeading: string; supply: string; supplyNote: string };
    unknowns: { heading: string; note: string; blocks: (list: string) => string };
    sources: { heading: string; note: string; observed: (date: string) => string; fetched: (date: string) => string; opensNewTab: string };
    purchase: { heading: string; body: (symbol: string) => string };
    metadata: { title: (symbol: string, provider: string) => string; description: (name: string, provider: string) => string };
  };
  company: {
    status: { private: string; usListed: string };
    lede: { multiple: (name: string) => string; single: (name: string) => string };
    notice: { heading: string; body: string; bodySingle: string };
    instrumentsHeading: (count: string) => string;
    instrumentsHeadingSingle: string;
    caption: (name: string) => string;
    column: { instrument: string; provider: string; kind: string; rights: string; reference: string; unknowns: string };
    rights: { claimedBy: (provider: string) => string; equity: (value: string) => string; voting: (value: string) => string; redemption: (value: string) => string; notRecorded: string };
    referenceNouns: Record<ProviderReferenceKind, string>;
    reference: { publishes: (list: string) => string; sentenceSeparator: string; currencyUnknown: string; asOfUnknown: string; none: string; xstock: string };
    xstockProvider: string;
    xstockKind: string;
    unknowns: { noFilingCoverage: (reason: string) => string; none: string };
    sources: { heading: string; noSec: (name: string) => string };
    method: { heading: string; body: (name: string, revision: string, date: string) => string };
    metadata: { title: (name: string) => string; description: (name: string) => string };
  };
  notFound: { title: string; body: Record<NotFoundScope, string>; back: Record<NotFoundScope, string> };
};

const referencesEn: ReferenceMessages = {
  companyPageLink: (name) => `See every instrument linked to ${name}`,
  terms: {
    bindingStatus: { public_source_verified: "Public source verified", provider_claim_only: "Provider claim only", unknown: "Unknown" },
    redemption: { provider_terms: "Under the provider's terms", conditional: "Conditional", none: "None" },
    restrictions: { provider_terms_not_reviewed: "Provider terms not reviewed by Benten", no_public_source_verification: "No public source verification" },
    unknownCodes: { source_as_of_unknown: "Provider as-of time unknown", currency_unknown: "Currency unknown", rights_unknown: "Rights unknown", company_binding_unknown: "Company link unknown", chain_identity_unknown: "On-chain identity unverified", provider_catalog_mismatch: "Provider catalog mismatch", redistribution_pending: "Redistribution review pending", execution_quote_unavailable: "Provider publishes no execution terms", asset_not_found: "Asset not found" },
    blocks: { display: "display", comparison: "comparison", release: "release" },
    referenceKinds: { prestock_mark_reference: "Mark reference", prestock_token_reference: "Token reference", prestock_implied_valuation_reference: "Implied valuation reference" },
    unknownValue: "unknown", noValue: "no",
  },
  provider: {
    lede: (provider) => `${provider} issues this instrument and describes it. It is not an xStock. Benten shows what ${provider} publishes and has not verified it.`,
    identity: { heading: "Identity", note: "The on-chain identity, as the provider reports it.", provider: "Provider", symbol: "Symbol", displayName: "Name", instrument: "Instrument kind", mint: "Mint address", tokenProgram: "Token program", notReported: "Not reported by the provider", providerPage: "Provider page", openOn: (provider) => `Open this instrument on ${provider}` },
    company: { heading: "Underlying company", note: "The company the provider names for this instrument.", company: "Company", binding: "Company link", noFilingCoverage: "Benten has no SEC filing coverage for this private company." },
    rights: { heading: "Rights, as the provider states", note: (provider) => `Claimed by ${provider}, not verified by Benten.`, status: "Rights status", equity: "Equity ownership", voting: "Voting rights", redemption: "Redemption", restrictions: "Restrictions", terms: (provider) => `${provider} terms` },
    values: { heading: "Reference values", note: (provider, date) => `Each value is a provider reference: a number ${provider} published, fetched by Benten on ${date}. Benten does not convert, combine or verify these values.`, kind: "Reference", value: "Provider reference", currency: "Currency", asOf: "Provider as-of", fetched: "Fetched", caption: (symbol) => `Provider references for ${symbol}`, supplyHeading: "Supply, as the provider reports it", supply: "Provider-reported supply", supplyNote: "A count of units, not a value in a currency." },
    unknowns: { heading: "Unknowns", note: "What Benten does not know about this instrument. Each unknown keeps the record from the uses it lists.", blocks: (list) => `Blocks ${list}` },
    sources: { heading: "Sources", note: "Where Benten read this record.", observed: (date) => `Observed ${date}`, fetched: (date) => `Fetched by Benten on ${date}`, opensNewTab: "(opens in a new tab)" },
    purchase: { heading: "No purchase through Benten", body: (symbol) => `Benten offers no purchase for ${symbol}. This page shows the provider's own records only.` },
    metadata: { title: (symbol, provider) => `${symbol} from ${provider}`, description: (name, provider) => `Identity, rights claims, reference values and unknowns for ${name}, as published by ${provider}.` },
  },
  company: {
    status: { private: "Private company", usListed: "US-listed company" },
    lede: {
      multiple: (name) => `Every Solana instrument that Benten's reviewed company map links to ${name}. Each comes from a different provider and carries its own rights. They are listed together, not as substitutes.`,
      single: (name) => `The Solana instrument that Benten's reviewed company map links to ${name}. Benten links no other instrument to this company.`,
    },
    notice: { heading: "Not interchangeable", body: "Holding one of these instruments gives you none of the rights of another. Their reference values are not compared here, because currency and as-of time are unknown. Open an instrument to see its full record.", bodySingle: "Benten has not verified this provider's rights claim. Open the instrument to see its full record." },
    instrumentsHeading: (count) => `Instruments (${count})`,
    instrumentsHeadingSingle: "Instrument",
    caption: (name) => `Instruments linked to ${name}`,
    column: { instrument: "Instrument", provider: "Provider", kind: "Instrument kind", rights: "Rights status", reference: "Reference semantics", unknowns: "Unknowns" },
    rights: { claimedBy: (provider) => `Claimed by ${provider}, not verified by Benten`, equity: (value) => `Equity ownership: ${value}`, voting: (value) => `Voting rights: ${value}`, redemption: (value) => `Redemption: ${value}`, notRecorded: "Not recorded by Benten" },
    referenceNouns: { prestock_mark_reference: "a mark reference", prestock_token_reference: "a token reference", prestock_implied_valuation_reference: "an implied valuation reference" },
    reference: { publishes: (list) => `Publishes ${list}`, sentenceSeparator: " ", currencyUnknown: "Currency unknown.", asOfUnknown: "Provider as-of unknown.", none: "Publishes no reference value for this instrument", xstock: "Registry identity only. No reference value is shown." },
    xstockProvider: "xStocks",
    xstockKind: "xStock",
    unknowns: { noFilingCoverage: (reason) => `No Benten filing coverage: ${reason}`, none: "None recorded" },
    sources: { heading: "Primary sources", noSec: (name) => `Benten has no SEC filing coverage for ${name}, a private company.` },
    method: { heading: "How this list is made", body: (name, revision, date) => `Instruments are linked to ${name} by an explicit, reviewed company map (revision ${revision}), not by matching names. Provider records fetched ${date}.` },
    metadata: { title: (name) => `${name} instruments on Solana`, description: (name) => `Every Solana instrument Benten links to ${name}, with each provider's rights claim and what is unknown.` },
  },
  notFound: {
    title: "Page not found",
    body: {
      company: "Benten has no company page at this address. Company pages exist only for the companies in Benten's reviewed company map, and their addresses are lowercase.",
      provider: "Benten has no provider instrument page at this address. Pages exist only for the instruments in Benten's provider records, spelled exactly.",
      stock: "Benten's registry has no xStock at this address.",
      page: "Benten has no page at this address.",
    },
    back: { company: "Other-provider instruments", provider: "Other-provider instruments", stock: "All xStocks", page: "Benten home" },
  },
};

const referencesJa: ReferenceMessages = {
  companyPageLink: (name) => `${name}に対応付けたすべての商品を見る`,
  terms: {
    bindingStatus: { public_source_verified: "公開情報で確認済み", provider_claim_only: "プロバイダーの主張のみ", unknown: "不明" },
    redemption: { provider_terms: "プロバイダーの規約による", conditional: "条件付き", none: "なし" },
    restrictions: { provider_terms_not_reviewed: "プロバイダーの規約はBentenで未確認", no_public_source_verification: "公開情報による検証なし" },
    unknownCodes: { source_as_of_unknown: "プロバイダーの基準時点が不明", currency_unknown: "通貨が不明", rights_unknown: "権利内容が不明", company_binding_unknown: "企業との対応関係が不明", chain_identity_unknown: "オンチェーンの識別情報が未検証", provider_catalog_mismatch: "プロバイダーのカタログと不一致", redistribution_pending: "再配布の可否を確認中", execution_quote_unavailable: "プロバイダーは取引実行の条件を公開していません", asset_not_found: "資産が見つかりません" },
    blocks: { display: "表示", comparison: "比較", release: "公開" },
    referenceKinds: { prestock_mark_reference: "マーク参考値", prestock_token_reference: "トークン参考値", prestock_implied_valuation_reference: "推定評価額の参考値" },
    unknownValue: "不明", noValue: "なし",
  },
  provider: {
    lede: (provider) => `${provider}が発行し、自ら説明している商品です。xStocksではありません。Bentenは${provider}が公表した内容を示しており、検証はしていません。`,
    identity: { heading: "識別情報", note: "プロバイダーが報告しているオンチェーンの識別情報です。", provider: "プロバイダー", symbol: "シンボル", displayName: "名称", instrument: "商品の種別", mint: "Mintアドレス", tokenProgram: "トークンプログラム", notReported: "プロバイダーは報告していません", providerPage: "プロバイダーのページ", openOn: (provider) => `${provider}でこの商品を開く` },
    company: { heading: "原資産の企業", note: "プロバイダーがこの商品について挙げている企業です。", company: "企業", binding: "企業との対応関係", noFilingCoverage: "この非公開企業について、BentenはSEC提出書類を収録していません。" },
    rights: { heading: "権利（プロバイダーの記載）", note: (provider) => `${provider}による主張で、Bentenは検証していません。`, status: "権利の状態", equity: "株式の所有", voting: "議決権", redemption: "償還", restrictions: "制限事項", terms: (provider) => `${provider}の規約` },
    values: { heading: "参考値", note: (provider, date) => `いずれも${provider}が公表したプロバイダー参考値で、Bentenが${date}に取得しました。Bentenはこれらの値を換算、合算、検証していません。`, kind: "参考値の種類", value: "プロバイダー参考値", currency: "通貨", asOf: "プロバイダーの基準時点", fetched: "取得日", caption: (symbol) => `${symbol}のプロバイダー参考値`, supplyHeading: "供給量（プロバイダーの報告）", supply: "プロバイダーが報告した供給量", supplyNote: "単位の数量であり、通貨建ての値ではありません。" },
    unknowns: { heading: "不明な点", note: "この商品についてBentenが把握していないことです。各項目は、示した用途での利用を妨げます。", blocks: (list) => `妨げる用途: ${list}` },
    sources: { heading: "出典", note: "Bentenがこの記録を読み取った場所です。", observed: (date) => `${date} に確認`, fetched: (date) => `Bentenが ${date} に取得`, opensNewTab: "（新しいタブで開きます）" },
    purchase: { heading: "Bentenでは購入できません", body: (symbol) => `Bentenは${symbol}の購入に対応していません。このページはプロバイダー自身の記録を示すだけです。` },
    metadata: { title: (symbol, provider) => `${provider}の${symbol}`, description: (name, provider) => `${provider}が公表する${name}の識別情報、権利に関する主張、参考値、不明な点。` },
  },
  company: {
    status: { private: "非公開企業", usListed: "米国上場企業" },
    lede: {
      multiple: (name) => `Bentenが確認済みの企業マップで${name}に対応付けている、Solana上のすべての金融商品です。提供元はそれぞれ異なり、権利内容も商品ごとに異なります。代わりになるものとしてではなく、並べて掲載しています。`,
      single: (name) => `Bentenが確認済みの企業マップで${name}に対応付けている、Solana上の金融商品です。Bentenはこの企業に他の商品を対応付けていません。`,
    },
    notice: { heading: "相互に代替できません", body: "いずれかの商品を保有しても、他の商品の権利は得られません。通貨と基準時点が不明なため、ここでは参考値を比較しません。各商品を開くと、登録情報の全体を確認できます。", bodySingle: "Bentenはこのプロバイダーによる権利の主張を検証していません。商品を開くと、登録情報の全体を確認できます。" },
    instrumentsHeading: (count) => `金融商品（${count}）`,
    instrumentsHeadingSingle: "金融商品",
    caption: (name) => `${name}に対応付けた金融商品`,
    column: { instrument: "商品", provider: "提供元", kind: "商品の種類", rights: "権利の状態", reference: "参考値の性質", unknowns: "不明な点" },
    rights: { claimedBy: (provider) => `${provider}による主張で、Bentenは検証していません`, equity: (value) => `株式の所有: ${value}`, voting: (value) => `議決権: ${value}`, redemption: (value) => `償還: ${value}`, notRecorded: "Bentenは記録していません" },
    referenceNouns: { prestock_mark_reference: "マーク参考値", prestock_token_reference: "トークン参考値", prestock_implied_valuation_reference: "推定評価額の参考値" },
    reference: { publishes: (list) => `${list}を公表しています`, sentenceSeparator: "", currencyUnknown: "通貨は不明です。", asOfUnknown: "プロバイダーの基準時点は不明です。", none: "この商品の参考値は公表されていません", xstock: "レジストリの識別情報のみです。参考値は表示しません。" },
    xstockProvider: "xStocks",
    xstockKind: "xStock",
    unknowns: { noFilingCoverage: (reason) => `Bentenの提出書類対象外: ${reason}`, none: "記録なし" },
    sources: { heading: "一次情報源", noSec: (name) => `Bentenは非公開企業である${name}のSEC提出書類を収録していません。` },
    method: { heading: "この一覧の作り方", body: (name, revision, date) => `金融商品は名称の照合ではなく、確認済みの明示的な企業マップ（リビジョン${revision}）で${name}に対応付けています。プロバイダーの記録の取得日: ${date}。` },
    metadata: { title: (name) => `Solana上の${name}関連の金融商品`, description: (name) => `Bentenが${name}に対応付けているSolana上のすべての金融商品と、各プロバイダーによる権利の主張、不明な点。` },
  },
  notFound: {
    title: "ページが見つかりません",
    body: {
      company: "このアドレスに企業ページはありません。企業ページは、Bentenが確認済みの企業マップに載っている企業にだけあり、アドレスはすべて小文字です。",
      provider: "このアドレスにプロバイダーの商品ページはありません。ページは、Bentenのプロバイダー記録にある商品にだけあり、表記が完全に一致する必要があります。",
      stock: "このアドレスに対応するxStockは、Bentenのレジストリにありません。",
      page: "このアドレスにBentenのページはありません。",
    },
    back: { company: "他プロバイダーの商品", provider: "他プロバイダーの商品", stock: "すべてのxStocks", page: "Bentenのホーム" },
  },
};

const referencesKo: ReferenceMessages = {
  companyPageLink: (name) => `${name}에 연결된 모든 상품 보기`,
  terms: {
    bindingStatus: { public_source_verified: "공개 출처로 확인됨", provider_claim_only: "제공자 주장만 있음", unknown: "알 수 없음" },
    redemption: { provider_terms: "제공자 약관에 따름", conditional: "조건부", none: "없음" },
    restrictions: { provider_terms_not_reviewed: "제공자 약관을 Benten이 검토하지 않음", no_public_source_verification: "공개 출처 검증 없음" },
    unknownCodes: { source_as_of_unknown: "제공자 기준 시점 알 수 없음", currency_unknown: "통화 알 수 없음", rights_unknown: "권리 내용 알 수 없음", company_binding_unknown: "기업 연결 관계 알 수 없음", chain_identity_unknown: "온체인 식별 정보 미검증", provider_catalog_mismatch: "제공자 카탈로그 불일치", redistribution_pending: "재배포 검토 진행 중", execution_quote_unavailable: "제공자는 거래 실행 조건을 공개하지 않습니다", asset_not_found: "자산을 찾을 수 없음" },
    blocks: { display: "표시", comparison: "비교", release: "공개" },
    referenceKinds: { prestock_mark_reference: "마크 참고 값", prestock_token_reference: "토큰 참고 값", prestock_implied_valuation_reference: "추정 기업가치 참고 값" },
    unknownValue: "알 수 없음", noValue: "없음",
  },
  provider: {
    lede: (provider) => `${provider}가 직접 발행하고 설명하는 상품입니다. xStocks가 아닙니다. Benten은 ${provider}가 공개한 내용을 보여 줄 뿐 검증하지 않았습니다.`,
    identity: { heading: "식별 정보", note: "제공자가 보고한 온체인 식별 정보입니다.", provider: "제공자", symbol: "심볼", displayName: "이름", instrument: "상품 유형", mint: "Mint 주소", tokenProgram: "토큰 프로그램", notReported: "제공자가 보고하지 않음", providerPage: "제공자 페이지", openOn: (provider) => `${provider}에서 이 상품 열기` },
    company: { heading: "기초 기업", note: "제공자가 이 상품에 대해 밝힌 기업입니다.", company: "기업", binding: "기업 연결 상태", noFilingCoverage: "이 비상장 기업에 대해 Benten은 SEC 제출 서류를 수록하지 않습니다." },
    rights: { heading: "권리(제공자 설명)", note: (provider) => `${provider}의 주장이며 Benten은 검증하지 않았습니다.`, status: "권리 상태", equity: "지분 소유", voting: "의결권", redemption: "상환", restrictions: "제한 사항", terms: (provider) => `${provider} 약관` },
    values: { heading: "참고 값", note: (provider, date) => `모두 ${provider}가 공개한 제공자 참고 값이며, Benten이 ${date}에 수집했습니다. Benten은 이 값을 환산하거나 합산하거나 검증하지 않습니다.`, kind: "참고 값 종류", value: "제공자 참고 값", currency: "통화", asOf: "제공자 기준 시점", fetched: "수집일", caption: (symbol) => `${symbol}의 제공자 참고 값`, supplyHeading: "공급량(제공자 보고)", supply: "제공자가 보고한 공급량", supplyNote: "단위 수량이며 통화로 표시한 값이 아닙니다." },
    unknowns: { heading: "알 수 없는 점", note: "Benten이 이 상품에 대해 알지 못하는 점입니다. 각 항목은 표시된 용도를 막습니다.", blocks: (list) => `막는 용도: ${list}` },
    sources: { heading: "출처", note: "Benten이 이 기록을 읽은 곳입니다.", observed: (date) => `${date} 확인`, fetched: (date) => `Benten이 ${date}에 수집`, opensNewTab: "(새 탭에서 열림)" },
    purchase: { heading: "Benten에서는 구매할 수 없음", body: (symbol) => `Benten은 ${symbol} 구매를 지원하지 않습니다. 이 페이지는 제공자 자체 기록만 보여 줍니다.` },
    metadata: { title: (symbol, provider) => `${provider}의 ${symbol}`, description: (name, provider) => `${provider}가 공개한 ${name}의 식별 정보, 권리 주장, 참고 값, 알 수 없는 점.` },
  },
  company: {
    status: { private: "비공개 기업", usListed: "미국 상장 기업" },
    lede: {
      multiple: (name) => `Benten이 검토한 기업 매핑에서 ${name}에 연결한 모든 Solana 상품입니다. 상품마다 제공자가 다르고 권리도 각각 다릅니다. 서로 대신하는 것으로서가 아니라 나란히 보여 줍니다.`,
      single: (name) => `Benten이 검토한 기업 매핑에서 ${name}에 연결한 Solana 상품입니다. Benten은 이 기업에 다른 상품을 연결하지 않았습니다.`,
    },
    notice: { heading: "서로 대체할 수 없음", body: "이 중 한 상품을 보유해도 다른 상품의 권리는 전혀 얻지 못합니다. 통화와 기준 시점을 알 수 없으므로 여기서는 참고 값을 비교하지 않습니다. 각 상품을 열어 전체 기록을 확인하세요.", bodySingle: "Benten은 이 제공자의 권리 주장을 검증하지 않았습니다. 상품을 열어 전체 기록을 확인하세요." },
    instrumentsHeading: (count) => `상품 (${count})`,
    instrumentsHeadingSingle: "상품",
    caption: (name) => `${name}에 연결된 상품`,
    column: { instrument: "상품", provider: "제공자", kind: "상품 종류", rights: "권리 상태", reference: "참고 값의 성격", unknowns: "알 수 없는 점" },
    rights: { claimedBy: (provider) => `${provider}의 주장이며 Benten은 검증하지 않음`, equity: (value) => `지분 소유: ${value}`, voting: (value) => `의결권: ${value}`, redemption: (value) => `상환: ${value}`, notRecorded: "Benten에 기록 없음" },
    referenceNouns: { prestock_mark_reference: "마크 참고 값", prestock_token_reference: "토큰 참고 값", prestock_implied_valuation_reference: "추정 기업가치 참고 값" },
    reference: { publishes: (list) => `${list} 공개`, sentenceSeparator: " ", currencyUnknown: "통화 알 수 없음.", asOfUnknown: "제공자 기준 시점 알 수 없음.", none: "이 상품에 대해 공개된 참고 값 없음", xstock: "레지스트리 식별 정보만 있습니다. 참고 값은 표시하지 않습니다." },
    xstockProvider: "xStocks",
    xstockKind: "xStock",
    unknowns: { noFilingCoverage: (reason) => `Benten 공시 수록 대상 아님: ${reason}`, none: "기록 없음" },
    sources: { heading: "1차 출처", noSec: (name) => `Benten은 비공개 기업인 ${name}의 SEC 공시를 수록하지 않습니다.` },
    method: { heading: "이 목록을 만드는 방법", body: (name, revision, date) => `상품은 이름 대조가 아니라 검토된 명시적 기업 매핑(리비전 ${revision})으로 ${name}에 연결됩니다. 제공자 기록은 ${date}에 수집했습니다.` },
    metadata: { title: (name) => `Solana의 ${name} 관련 상품`, description: (name) => `Benten이 ${name}에 연결한 모든 Solana 상품과 각 제공자의 권리 주장, 알 수 없는 점.` },
  },
  notFound: {
    title: "페이지를 찾을 수 없음",
    body: {
      company: "이 주소에는 기업 페이지가 없습니다. 기업 페이지는 Benten이 검토한 기업 매핑에 있는 기업에만 있으며, 주소는 모두 소문자입니다.",
      provider: "이 주소에는 제공자 상품 페이지가 없습니다. 페이지는 Benten의 제공자 기록에 있는 상품에만 있으며, 표기가 정확히 일치해야 합니다.",
      stock: "Benten 레지스트리에는 이 주소에 해당하는 xStock이 없습니다.",
      page: "이 주소에는 Benten 페이지가 없습니다.",
    },
    back: { company: "다른 제공자의 상품", provider: "다른 제공자의 상품", stock: "전체 xStocks", page: "Benten 홈" },
  },
};

const referencesZhHans: ReferenceMessages = {
  companyPageLink: (name) => `查看关联到 ${name} 的全部金融工具`,
  terms: {
    bindingStatus: { public_source_verified: "已由公开来源核实", provider_claim_only: "仅为提供方主张", unknown: "未知" },
    redemption: { provider_terms: "依提供方条款", conditional: "附条件", none: "无" },
    restrictions: { provider_terms_not_reviewed: "Benten 尚未审阅提供方条款", no_public_source_verification: "没有公开来源核实" },
    unknownCodes: { source_as_of_unknown: "提供方基准时点未知", currency_unknown: "币种未知", rights_unknown: "权利内容未知", company_binding_unknown: "公司对应关系未知", chain_identity_unknown: "链上标识未经核实", provider_catalog_mismatch: "提供方目录不一致", redistribution_pending: "再分发审核待定", execution_quote_unavailable: "提供方未公布交易执行条件", asset_not_found: "未找到该资产" },
    blocks: { display: "展示", comparison: "比较", release: "发布" },
    referenceKinds: { prestock_mark_reference: "标记参考值", prestock_token_reference: "代币参考值", prestock_implied_valuation_reference: "隐含估值参考值" },
    unknownValue: "未知", noValue: "无",
  },
  provider: {
    lede: (provider) => `这项产品由 ${provider} 发行并自行说明，不是 xStocks。Benten 展示 ${provider} 公布的内容，并未核实。`,
    identity: { heading: "标识信息", note: "提供方报告的链上标识信息。", provider: "提供方", symbol: "代号", displayName: "名称", instrument: "产品类型", mint: "Mint 地址", tokenProgram: "代币程序", notReported: "提供方未报告", providerPage: "提供方页面", openOn: (provider) => `在 ${provider} 打开这项产品` },
    company: { heading: "标的公司", note: "提供方为这项产品指明的公司。", company: "公司", binding: "公司对应关系", noFilingCoverage: "对于这家非上市公司，Benten 没有收录任何 SEC 披露文件。" },
    rights: { heading: "权利（提供方的说法）", note: (provider) => `由 ${provider} 主张，未经 Benten 核实。`, status: "权利状态", equity: "股权所有权", voting: "投票权", redemption: "赎回", restrictions: "限制事项", terms: (provider) => `${provider} 条款` },
    values: { heading: "参考值", note: (provider, date) => `以下均为 ${provider} 公布的提供方参考值，由 Benten 于 ${date} 抓取。Benten 不换算、不合并，也不核实这些数值。`, kind: "参考值类型", value: "提供方参考值", currency: "币种", asOf: "提供方基准时点", fetched: "抓取日期", caption: (symbol) => `${symbol} 的提供方参考值`, supplyHeading: "供应量（提供方报告）", supply: "提供方报告的供应量", supplyNote: "这是单位数量，不是以币种计的数值。" },
    unknowns: { heading: "未知事项", note: "Benten 对这项产品尚不掌握的信息。每一项都会阻止所列用途。", blocks: (list) => `阻止的用途：${list}` },
    sources: { heading: "来源", note: "Benten 读取这份记录的位置。", observed: (date) => `${date} 查看`, fetched: (date) => `Benten 于 ${date} 抓取`, opensNewTab: "（在新标签页中打开）" },
    purchase: { heading: "无法通过 Benten 购买", body: (symbol) => `Benten 不支持购买 ${symbol}。本页仅展示提供方自己的记录。` },
    metadata: { title: (symbol, provider) => `${provider} 的 ${symbol}`, description: (name, provider) => `${provider} 公布的 ${name} 标识信息、权利主张、参考值与未知事项。` },
  },
  company: {
    status: { private: "非上市公司", usListed: "美国上市公司" },
    lede: {
      multiple: (name) => `Benten 经审核的公司映射表关联到 ${name} 的全部 Solana 金融工具。每种工具来自不同的提供方，各自附带不同的权利。此处将它们并列展示，而非作为可相互替代的工具。`,
      single: (name) => `Benten 经审核的公司映射表关联到 ${name} 的 Solana 金融工具。Benten 未将其他工具关联到这家公司。`,
    },
    notice: { heading: "不可相互替代", body: "持有其中一种工具，并不会让你获得另一种工具的任何权利。由于币种和基准时点未知，此处不比较它们的参考值。打开某个工具即可查看其完整记录。", bodySingle: "Benten 未核实该提供方关于权利的主张。打开该工具即可查看其完整记录。" },
    instrumentsHeading: (count) => `金融工具（${count}）`,
    instrumentsHeadingSingle: "金融工具",
    caption: (name) => `关联到 ${name} 的金融工具`,
    column: { instrument: "工具", provider: "提供方", kind: "工具类型", rights: "权利状态", reference: "参考值性质", unknowns: "未知事项" },
    rights: { claimedBy: (provider) => `由 ${provider} 主张，未经 Benten 核实`, equity: (value) => `股权所有权：${value}`, voting: (value) => `投票权：${value}`, redemption: (value) => `赎回：${value}`, notRecorded: "Benten 未记录" },
    referenceNouns: { prestock_mark_reference: "标记参考值", prestock_token_reference: "代币参考值", prestock_implied_valuation_reference: "隐含估值参考值" },
    reference: { publishes: (list) => `公布${list}`, sentenceSeparator: "", currencyUnknown: "币种未知。", asOfUnknown: "提供方基准时点未知。", none: "未就此工具公布参考值", xstock: "仅有注册表标识信息，不显示参考值。" },
    xstockProvider: "xStocks",
    xstockKind: "xStock",
    unknowns: { noFilingCoverage: (reason) => `不在 Benten 披露文件收录范围内：${reason}`, none: "无记录" },
    sources: { heading: "一手来源", noSec: (name) => `Benten 未收录非上市公司 ${name} 的 SEC 披露文件。` },
    method: { heading: "此列表的编制方式", body: (name, revision, date) => `金融工具通过经审核的明确公司映射表（第 ${revision} 版）关联到 ${name}，而不是通过名称匹配。提供方记录获取于 ${date}。` },
    metadata: { title: (name) => `${name} 在 Solana 上的金融工具`, description: (name) => `Benten 关联到 ${name} 的全部 Solana 金融工具，以及各提供方关于权利的主张和未知事项。` },
  },
  notFound: {
    title: "找不到页面",
    body: {
      company: "此地址没有公司页面。只有 Benten 经审核的公司映射表中的公司才有页面，且地址均为小写。",
      provider: "此地址没有提供方产品页面。只有 Benten 提供方记录中的产品才有页面，且拼写必须完全一致。",
      stock: "Benten 注册表中没有与此地址对应的 xStock。",
      page: "此地址没有 Benten 页面。",
    },
    back: { company: "其他提供方的产品", provider: "其他提供方的产品", stock: "所有 xStocks", page: "Benten 首页" },
  },
};

const referencesZhHant: ReferenceMessages = {
  companyPageLink: (name) => `查看關聯到 ${name} 的全部金融工具`,
  terms: {
    bindingStatus: { public_source_verified: "已由公開來源查核", provider_claim_only: "僅為提供方主張", unknown: "未知" },
    redemption: { provider_terms: "依提供方條款", conditional: "附條件", none: "無" },
    restrictions: { provider_terms_not_reviewed: "Benten 尚未審閱提供方條款", no_public_source_verification: "沒有公開來源查核" },
    unknownCodes: { source_as_of_unknown: "提供方基準時點未知", currency_unknown: "幣別未知", rights_unknown: "權利內容未知", company_binding_unknown: "公司對應關係未知", chain_identity_unknown: "鏈上識別資訊未經查核", provider_catalog_mismatch: "提供方目錄不一致", redistribution_pending: "再散布審核待定", execution_quote_unavailable: "提供方未公布交易執行條件", asset_not_found: "找不到該資產" },
    blocks: { display: "顯示", comparison: "比較", release: "發布" },
    referenceKinds: { prestock_mark_reference: "標記參考值", prestock_token_reference: "代幣參考值", prestock_implied_valuation_reference: "隱含估值參考值" },
    unknownValue: "未知", noValue: "無",
  },
  provider: {
    lede: (provider) => `這項產品由 ${provider} 發行並自行說明，不是 xStocks。Benten 呈現 ${provider} 公布的內容，並未查核。`,
    identity: { heading: "識別資訊", note: "提供方報告的鏈上識別資訊。", provider: "提供方", symbol: "代號", displayName: "名稱", instrument: "產品類型", mint: "Mint 位址", tokenProgram: "代幣程式", notReported: "提供方未報告", providerPage: "提供方頁面", openOn: (provider) => `在 ${provider} 開啟這項產品` },
    company: { heading: "標的公司", note: "提供方為這項產品指明的公司。", company: "公司", binding: "公司對應關係", noFilingCoverage: "對於這家非上市公司，Benten 沒有收錄任何 SEC 揭露文件。" },
    rights: { heading: "權利（提供方的說法）", note: (provider) => `由 ${provider} 主張，未經 Benten 查核。`, status: "權利狀態", equity: "股權所有權", voting: "表決權", redemption: "贖回", restrictions: "限制事項", terms: (provider) => `${provider} 條款` },
    values: { heading: "參考值", note: (provider, date) => `以下均為 ${provider} 公布的提供方參考值，由 Benten 於 ${date} 擷取。Benten 不換算、不合併，也不查核這些數值。`, kind: "參考值類型", value: "提供方參考值", currency: "幣別", asOf: "提供方基準時點", fetched: "擷取日期", caption: (symbol) => `${symbol} 的提供方參考值`, supplyHeading: "供給量（提供方報告）", supply: "提供方報告的供給量", supplyNote: "這是單位數量，不是以幣別計的數值。" },
    unknowns: { heading: "未知事項", note: "Benten 對這項產品尚未掌握的資訊。每一項都會阻止所列用途。", blocks: (list) => `阻止的用途：${list}` },
    sources: { heading: "來源", note: "Benten 讀取這份紀錄的位置。", observed: (date) => `${date} 查看`, fetched: (date) => `Benten 於 ${date} 擷取`, opensNewTab: "（在新分頁中開啟）" },
    purchase: { heading: "無法透過 Benten 購買", body: (symbol) => `Benten 不支援購買 ${symbol}。本頁僅呈現提供方自己的紀錄。` },
    metadata: { title: (symbol, provider) => `${provider} 的 ${symbol}`, description: (name, provider) => `${provider} 公布的 ${name} 識別資訊、權利主張、參考值與未知事項。` },
  },
  company: {
    status: { private: "非上市公司", usListed: "美國上市公司" },
    lede: {
      multiple: (name) => `Benten 經審核的公司對應表關聯到 ${name} 的全部 Solana 金融工具。每種工具來自不同的提供方，各自附帶不同的權利。此處將它們並列呈現，而非作為可相互替代的工具。`,
      single: (name) => `Benten 經審核的公司對應表關聯到 ${name} 的 Solana 金融工具。Benten 未將其他工具關聯到這家公司。`,
    },
    notice: { heading: "不可相互替代", body: "持有其中一種工具，並不會讓你取得另一種工具的任何權利。由於幣別與基準時點未知，此處不比較它們的參考值。開啟某個工具即可查看其完整紀錄。", bodySingle: "Benten 未查核該提供方關於權利的主張。開啟該工具即可查看其完整紀錄。" },
    instrumentsHeading: (count) => `金融工具（${count}）`,
    instrumentsHeadingSingle: "金融工具",
    caption: (name) => `關聯到 ${name} 的金融工具`,
    column: { instrument: "工具", provider: "提供方", kind: "工具類型", rights: "權利狀態", reference: "參考值性質", unknowns: "未知事項" },
    rights: { claimedBy: (provider) => `由 ${provider} 主張，未經 Benten 查核`, equity: (value) => `股權所有權：${value}`, voting: (value) => `表決權：${value}`, redemption: (value) => `贖回：${value}`, notRecorded: "Benten 未記錄" },
    referenceNouns: { prestock_mark_reference: "標記參考值", prestock_token_reference: "代幣參考值", prestock_implied_valuation_reference: "隱含估值參考值" },
    reference: { publishes: (list) => `公布${list}`, sentenceSeparator: "", currencyUnknown: "幣別未知。", asOfUnknown: "提供方基準時點未知。", none: "未就此工具公布參考值", xstock: "僅有登錄表識別資訊，不顯示參考值。" },
    xstockProvider: "xStocks",
    xstockKind: "xStock",
    unknowns: { noFilingCoverage: (reason) => `不在 Benten 揭露文件收錄範圍內：${reason}`, none: "無紀錄" },
    sources: { heading: "第一手來源", noSec: (name) => `Benten 未收錄非上市公司 ${name} 的 SEC 揭露文件。` },
    method: { heading: "此清單的編製方式", body: (name, revision, date) => `金融工具透過經審核的明確公司對應表（第 ${revision} 版）關聯到 ${name}，而非透過名稱比對。提供方紀錄取得於 ${date}。` },
    metadata: { title: (name) => `${name} 在 Solana 上的金融工具`, description: (name) => `Benten 關聯到 ${name} 的全部 Solana 金融工具，以及各提供方關於權利的主張與未知事項。` },
  },
  notFound: {
    title: "找不到頁面",
    body: {
      company: "此位址沒有公司頁面。只有 Benten 經審核的公司對應表中的公司才有頁面，且位址均為小寫。",
      provider: "此位址沒有提供方產品頁面。只有 Benten 提供方紀錄中的產品才有頁面，且拼寫必須完全一致。",
      stock: "Benten 登錄表中沒有與此位址對應的 xStock。",
      page: "此位址沒有 Benten 頁面。",
    },
    back: { company: "其他提供方的產品", provider: "其他提供方的產品", stock: "所有 xStocks", page: "Benten 首頁" },
  },
};

export const REFERENCE_MESSAGES: Record<PublicWebLocale, ReferenceMessages> = { en: referencesEn, ja: referencesJa, ko: referencesKo, "zh-Hans": referencesZhHans, "zh-Hant": referencesZhHant };

export function referenceMessagesFor(locale: PublicWebLocale): ReferenceMessages {
  return REFERENCE_MESSAGES[locale];
}

/**
 * A fiscal year that the source names only by its own label ("FY2026") and
 * records no period end for, as in the legacy snapshot. Every other fiscal
 * year is named by the month it ends (`fiscalYearLabel`); this one cannot be,
 * so the label is quoted as the source's and the missing period end is
 * stated. Used only through `sourceFiscalYearLabel` in `fiscal-year.ts`.
 */
export type SourceFiscalYearMessages = {
  /** Inside a sentence ("As of ..."). */
  asOf: (label: string) => string;
  /** A table value. */
  value: (label: string) => string;
};

export const SOURCE_FISCAL_YEAR_MESSAGES: Record<PublicWebLocale, SourceFiscalYearMessages> = {
  en: { asOf: (label) => `the fiscal year the source labels ${label} (the source records no period end)`, value: (label) => `${label} (source label; period end not recorded)` },
  ja: { asOf: (label) => `出典が${label}と表記する会計年度（出典に期末の記録なし）`, value: (label) => `${label}（出典の表記。期末の記録なし）` },
  ko: { asOf: (label) => `출처가 ${label}(으)로 표기한 회계연도(출처에 결산일 기록 없음)`, value: (label) => `${label}(출처 표기, 결산일 기록 없음)` },
  "zh-Hans": { asOf: (label) => `来源标为 ${label} 的财年（来源未记录期末）`, value: (label) => `${label}（来源标注，未记录期末）` },
  "zh-Hant": { asOf: (label) => `來源標為 ${label} 的財年（來源未記錄期末）`, value: (label) => `${label}（來源標註，未記錄期末）` },
};
