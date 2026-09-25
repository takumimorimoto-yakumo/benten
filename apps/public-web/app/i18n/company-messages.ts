/**
 * Copy of Explore (`/`), the companies list (`/companies`) and the company
 * page (`/company/{slug}`) for every supported locale (app IA sections 4.2
 * to 4.4 and 7). Registered for non-Latin text in catalog-manifest.json.
 *
 * Words that name buying appear only in the strings the pages render inside
 * `data-cta="buy"` or `data-term="buy-in-benten"` (`buyInBenten`,
 * `explore.capability`, `company.capability.buy`, `company.cta`); tests scan
 * everything else against the forbidden vocabulary.
 */
import type { DirectoryGroup } from "@/features/explore/directory-view";
import type { ProductProvider } from "@/features/references/company-view";
import type { PublicWebLocale } from "./locales";

type InstrumentKind = "tracker_certificate" | "economic_exposure_instrument" | "unknown";

export type CompanyCopy = {
  groups: { heading: Record<DirectoryGroup, (count: string) => string>; name: Record<DirectoryGroup, string>; order: string };
  providers: Record<ProductProvider, string>;
  buyInBenten: string;
  explore: {
    title: string; description: string; heading: string;
    capability: (symbol: string, name: string) => string; noBuyable: string;
    search: {
      label: string; placeholder: string; listLabel: string; count: (count: string) => string; single: string;
      chooseOne: (count: string) => string; noMatch: (query: string) => string; seeAll: string; noScript: string;
    };
    seeAll: (count: string) => string; fundsLine: (examples: string) => string;
  };
  companies: {
    title: string; description: string; heading: string; lead: string; filter: string; all: string;
    unlinkedHeading: (count: string) => string; unlinkedNote: string; fundsNote: string;
  };
  company: {
    title: (name: string) => string; description: (name: string) => string;
    status: { us_listed: string; private: string };
    secRegistrant: (name: string) => string;
    waysHeading: (count: string) => string;
    notice: { title: string; body: string };
    from: (provider: string) => string;
    own: {
      xstock: string;
      kind: Record<InstrumentKind, (provider: string) => string>;
      rights: { unknownBoth: string; noEquityUnknownVoting: string; unknownEquityNoVoting: string; neither: string };
      notVerified: string;
    };
    capability: { buy: string; compare: string };
    cta: (symbol: string) => string;
    facts: { heading: string; notVerified: (name: string) => string; record: (symbol: string) => string };
    sources: { heading: string; private: (name: string) => string };
    method: {
      heading: string;
      reviewed: (name: string, revision: string, reviewedOn: string, fetchedOn: string) => string;
      generated: (name: string, cik: string, revision: string, generatedOn: string, checkedOn: string) => string;
      approved: string;
    };
  };
  notFound: { company: string; back: string };
};

const en: CompanyCopy = {
  groups: {
    heading: { private: (count) => `Private companies (${count})`, "us-listed": (count) => `US-listed companies (${count})`, funds: (count) => `Funds and other xStocks (${count})` },
    name: { private: "Private", "us-listed": "US-listed", funds: "Funds and other" },
    order: "A to Z",
  },
  providers: { xstocks: "xStocks", prestocks: "PreStocks" },
  buyInBenten: "Buy in Benten",
  explore: {
    title: "Explore", description: "See which companies you can hold on Solana, in your own wallet.",
    heading: "See which companies you can hold on Solana, in your own wallet.",
    capability: (symbol, name) => `You can buy one token inside Benten: ${symbol} (${name}). Everything else is shown so you can check it.`,
    noBuyable: "Everything here is shown so you can check it.",
    search: {
      label: "Search a company or ticker", placeholder: "NVIDIA, OpenAI, TSLA", listLabel: "Suggestions",
      count: (count) => `${count} suggestions. Use the up and down arrow keys to choose one.`, single: "1 suggestion. Press Enter to open it.",
      chooseOne: (count) => `${count} suggestions match. Choose one from the list.`, noMatch: (query) => `No company or ticker matches "${query}".`,
      seeAll: "See all companies", noScript: "Without JavaScript, searching opens the list of all companies.",
    },
    seeAll: (count) => `See all ${count}`, fundsLine: (examples) => `For example ${examples}.`,
  },
  companies: {
    title: "All companies", description: "Every company and fund Benten shows, A to Z.", heading: "All companies",
    lead: "Every company and fund Benten shows, A to Z. Open a company to see how to hold it on Solana.", filter: "Show", all: "All",
    unlinkedHeading: (count) => `US-listed tokens without a company page (${count})`,
    unlinkedNote: "Benten could not link these tokens to exactly one SEC company, so they have no company page. Their token pages stay open.",
    fundsNote: "These have no single company behind them, so each opens its token page.",
  },
  company: {
    title: (name) => `${name} on Solana`, description: (name) => `Ways to hold ${name} on Solana: each token, who issues it and what it gives you.`,
    status: { us_listed: "US-listed company. SEC filer.", private: "Private company. No SEC filings." },
    secRegistrant: (name) => `SEC registrant: ${name}`,
    waysHeading: (count) => `Ways to hold on Solana (${count})`,
    notice: { title: "Not interchangeable", body: "Each token comes from a different issuer and gives different rights. Holding one gives you none of the rights of another." },
    from: (provider) => `From ${provider}`,
    own: {
      xstock: "A token that tracks this company's shares. Benten has not verified the rights it gives you.",
      kind: {
        economic_exposure_instrument: (provider) => `${provider} says this token gives economic exposure to the company.`,
        tracker_certificate: (provider) => `${provider} says this token is a tracker certificate on the company.`,
        unknown: (provider) => `${provider} does not say what kind of instrument this token is.`,
      },
      rights: { unknownBoth: "Ownership and voting rights are unknown.", noEquityUnknownVoting: "It is not a share. Voting rights are unknown.", unknownEquityNoVoting: "Ownership is unknown. It gives no voting rights.", neither: "It is not a share and gives no voting rights." },
      notVerified: "Benten has not verified this.",
    },
    capability: { buy: "Buy in Benten.", compare: "Compare only. Benten cannot build a swap for this token." },
    cta: (symbol) => `Buy ${symbol}`,
    facts: { heading: "From SEC filings", notVerified: (name) => `SEC facts for ${name} are not yet verified by Benten.`, record: (symbol) => `See the ${symbol} token record` },
    sources: { heading: "Primary sources", private: (name) => `Benten has no SEC filing coverage for ${name}, a private company.` },
    method: {
      heading: "How Benten links these",
      reviewed: (name, revision, reviewedOn, fetchedOn) => `Benten links the tokens on this page to ${name} through a company map that a person reviewed on ${reviewedOn} (revision ${revision}). Nothing is matched by name. Provider records were fetched on ${fetchedOn}.`,
      generated: (name, cik, revision, generatedOn, checkedOn) => `Benten links the token on this page to ${name} through a company map generated on ${generatedOn} (revision ${revision}) from SEC EDGAR's ticker list, SEC filings and the Benten registry. Its CIK (${cik}) and filings were checked against SEC EDGAR on ${checkedOn}.`,
      approved: "A person has reviewed this map.",
    },
  },
  notFound: {
    company: "Benten has no company page at this address. Company pages exist for the private and US-listed companies Benten links tokens to, and their addresses are lowercase.",
    back: "All companies",
  },
};

const ja: CompanyCopy = {
  groups: {
    heading: { private: (count) => `非上場企業（${count}）`, "us-listed": (count) => `米国上場企業（${count}）`, funds: (count) => `ファンドとその他のxStocks（${count}）` },
    name: { private: "非上場", "us-listed": "米国上場", funds: "ファンドなど" },
    order: "アルファベット順",
  },
  providers: { xstocks: "xStocks", prestocks: "PreStocks" },
  buyInBenten: "Bentenで購入できます",
  explore: {
    title: "探す", description: "Solanaで、自分のウォレットに保有できる企業を探します。",
    heading: "Solanaで、自分のウォレットに保有できる企業を探す。",
    capability: (symbol, name) => `Benten内で購入できるのは1つのトークンだけです：${symbol}（${name}）。そのほかは確認のために表示しています。`,
    noBuyable: "ここに表示している内容は、確認のためのものです。",
    search: {
      label: "企業名またはティッカーで検索", placeholder: "NVIDIA、OpenAI、TSLA", listLabel: "候補",
      count: (count) => `候補が${count}件あります。上下の矢印キーで選べます。`, single: "候補が1件あります。Enterキーで開きます。",
      chooseOne: (count) => `${count}件の候補があります。一覧から選んでください。`, noMatch: (query) => `「${query}」に一致する企業やティッカーはありません。`,
      seeAll: "すべての企業を見る", noScript: "JavaScriptが無効な場合、検索するとすべての企業の一覧が開きます。",
    },
    seeAll: (count) => `すべて（${count}）を見る`, fundsLine: (examples) => `例：${examples}`,
  },
  companies: {
    title: "すべての企業", description: "Bentenが表示する企業とファンドを、アルファベット順に並べています。", heading: "すべての企業",
    lead: "Bentenが表示するすべての企業とファンドを、アルファベット順に並べています。企業を開くと、Solanaで保有する方法を確認できます。", filter: "表示", all: "すべて",
    unlinkedHeading: (count) => `企業ページのない米国上場トークン（${count}）`,
    unlinkedNote: "これらのトークンは、SECの1つの企業に確実に結び付けられなかったため、企業ページがありません。トークンのページは表示できます。",
    fundsNote: "これらには単一の企業がないため、それぞれのトークンのページが開きます。",
  },
  company: {
    title: (name) => `Solana上の${name}`, description: (name) => `Solanaで${name}を保有する方法。トークンごとの発行元と、得られる内容を示します。`,
    status: { us_listed: "米国上場企業。SECに書類を提出しています。", private: "非上場企業。SECへの提出書類はありません。" },
    secRegistrant: (name) => `SEC登録名: ${name}`,
    waysHeading: (count) => `Solanaで保有する方法（${count}）`,
    notice: { title: "互いの代わりにはなりません", body: "トークンごとに発行元と権利が異なります。1つを保有しても、別のトークンの権利は得られません。" },
    from: (provider) => `発行元：${provider}`,
    own: {
      xstock: "この企業の株式に連動するトークンです。どのような権利が得られるかは、Bentenでは確認していません。",
      kind: {
        economic_exposure_instrument: (provider) => `${provider}によると、このトークンは企業への経済的エクスポージャーを提供します。`,
        tracker_certificate: (provider) => `${provider}によると、このトークンは企業に連動するトラッカー証券です。`,
        unknown: (provider) => `${provider}は、このトークンがどの種類の商品かを示していません。`,
      },
      rights: { unknownBoth: "所有権と議決権があるかは不明です。", noEquityUnknownVoting: "株式ではありません。議決権は不明です。", unknownEquityNoVoting: "所有権は不明です。議決権はありません。", neither: "株式ではなく、議決権もありません。" },
      notVerified: "Bentenはこの内容を確認していません。",
    },
    capability: { buy: "Bentenで購入できます。", compare: "比較のみ。Bentenはこのトークンのスワップを作成できません。" },
    cta: (symbol) => `${symbol}を購入`,
    facts: { heading: "SECの提出書類から", notVerified: (name) => `${name}のSECの財務データは、Bentenでまだ確認していません。`, record: (symbol) => `${symbol}のトークン情報を見る` },
    sources: { heading: "一次情報", private: (name) => `${name}は非上場企業のため、BentenにはSECの提出書類がありません。` },
    method: {
      heading: "Bentenの結び付け方",
      reviewed: (name, revision, reviewedOn, fetchedOn) => `このページのトークンは、人が${reviewedOn}に確認した企業マップ（リビジョン${revision}）で${name}に結び付けています。名前の照合は使っていません。プロバイダーの記録は${fetchedOn}に取得しました。`,
      generated: (name, cik, revision, generatedOn, checkedOn) => `このページのトークンは、SEC EDGARのティッカー一覧、SECへの提出書類、Bentenのレジストリから${generatedOn}に生成した企業マップ（リビジョン${revision}）で${name}に結び付けています。CIK（${cik}）と提出書類は${checkedOn}にSEC EDGARと照合済みです。`,
      approved: "このマップは人が確認済みです。",
    },
  },
  notFound: {
    company: "このアドレスに企業ページはありません。企業ページは、Bentenがトークンを結び付けている非上場企業と米国上場企業にあり、アドレスは小文字です。",
    back: "すべての企業",
  },
};

const ko: CompanyCopy = {
  groups: {
    heading: { private: (count) => `비상장 기업 (${count})`, "us-listed": (count) => `미국 상장 기업 (${count})`, funds: (count) => `펀드 및 기타 xStocks (${count})` },
    name: { private: "비상장", "us-listed": "미국 상장", funds: "펀드 및 기타" },
    order: "알파벳순",
  },
  providers: { xstocks: "xStocks", prestocks: "PreStocks" },
  buyInBenten: "Benten에서 구매 가능",
  explore: {
    title: "탐색", description: "Solana에서 내 지갑으로 보유할 수 있는 기업을 찾아보세요.",
    heading: "Solana에서 내 지갑으로 보유할 수 있는 기업을 찾아보세요.",
    capability: (symbol, name) => `Benten 안에서 구매할 수 있는 토큰은 ${symbol}(${name}) 하나입니다. 나머지는 확인할 수 있도록 보여 줍니다.`,
    noBuyable: "여기에 보이는 내용은 확인할 수 있도록 보여 주는 것입니다.",
    search: {
      label: "기업명 또는 티커 검색", placeholder: "NVIDIA, OpenAI, TSLA", listLabel: "후보",
      count: (count) => `후보 ${count}개. 위아래 화살표 키로 선택하세요.`, single: "후보 1개. Enter 키를 누르면 열립니다.",
      chooseOne: (count) => `후보가 ${count}개 있습니다. 목록에서 하나를 선택하세요.`, noMatch: (query) => `"${query}"와(과) 일치하는 기업이나 티커가 없습니다.`,
      seeAll: "모든 기업 보기", noScript: "JavaScript가 없으면 검색할 때 모든 기업 목록이 열립니다.",
    },
    seeAll: (count) => `전체 ${count}개 보기`, fundsLine: (examples) => `예: ${examples}`,
  },
  companies: {
    title: "모든 기업", description: "Benten이 보여 주는 모든 기업과 펀드를 알파벳순으로 정리했습니다.", heading: "모든 기업",
    lead: "Benten이 보여 주는 모든 기업과 펀드를 알파벳순으로 정리했습니다. 기업을 열면 Solana에서 보유하는 방법을 볼 수 있습니다.", filter: "표시", all: "전체",
    unlinkedHeading: (count) => `기업 페이지가 없는 미국 상장 토큰 (${count})`,
    unlinkedNote: "Benten이 이 토큰들을 하나의 SEC 기업에 연결하지 못해 기업 페이지가 없습니다. 토큰 페이지는 볼 수 있습니다.",
    fundsNote: "단일 기업이 없으므로 각각 토큰 페이지가 열립니다.",
  },
  company: {
    title: (name) => `Solana의 ${name}`, description: (name) => `Solana에서 ${name}을(를) 보유하는 방법: 토큰별 발행사와 얻는 내용.`,
    status: { us_listed: "미국 상장 기업. SEC에 공시를 제출합니다.", private: "비상장 기업. SEC 제출 공시가 없습니다." },
    secRegistrant: (name) => `SEC 등록명: ${name}`,
    waysHeading: (count) => `Solana에서 보유하는 방법 (${count})`,
    notice: { title: "서로 대체할 수 없습니다", body: "토큰마다 발행사와 권리가 다릅니다. 하나를 보유해도 다른 토큰의 권리는 얻지 못합니다." },
    from: (provider) => `발행: ${provider}`,
    own: {
      xstock: "이 기업의 주식을 추종하는 토큰입니다. 어떤 권리를 얻는지는 Benten이 확인하지 않았습니다.",
      kind: {
        economic_exposure_instrument: (provider) => `${provider}에 따르면 이 토큰은 기업에 대한 경제적 익스포저를 제공합니다.`,
        tracker_certificate: (provider) => `${provider}에 따르면 이 토큰은 기업을 추종하는 트래커 증권입니다.`,
        unknown: (provider) => `${provider}은(는) 이 토큰이 어떤 종류의 상품인지 밝히지 않습니다.`,
      },
      rights: { unknownBoth: "소유권과 의결권이 있는지는 알 수 없습니다.", noEquityUnknownVoting: "주식이 아닙니다. 의결권은 알 수 없습니다.", unknownEquityNoVoting: "소유권은 알 수 없습니다. 의결권은 없습니다.", neither: "주식이 아니며 의결권도 없습니다." },
      notVerified: "Benten은 이 내용을 확인하지 않았습니다.",
    },
    capability: { buy: "Benten에서 구매할 수 있습니다.", compare: "비교만 가능합니다. Benten은 이 토큰의 스왑을 만들 수 없습니다." },
    cta: (symbol) => `${symbol} 구매`,
    facts: { heading: "SEC 제출 공시에서", notVerified: (name) => `Benten은 아직 ${name}의 SEC 재무 데이터를 확인하지 않았습니다.`, record: (symbol) => `${symbol} 토큰 기록 보기` },
    sources: { heading: "1차 출처", private: (name) => `${name}은(는) 비상장 기업이므로 Benten에 SEC 제출 공시가 없습니다.` },
    method: {
      heading: "Benten의 연결 방법",
      reviewed: (name, revision, reviewedOn, fetchedOn) => `이 페이지의 토큰은 사람이 ${reviewedOn}에 검토한 기업 맵(리비전 ${revision})으로 ${name}에 연결됩니다. 이름으로 대조하지 않습니다. 발행사 기록은 ${fetchedOn}에 가져왔습니다.`,
      generated: (name, cik, revision, generatedOn, checkedOn) => `이 페이지의 토큰은 SEC EDGAR 티커 목록, SEC 제출 공시, Benten 레지스트리로 ${generatedOn}에 생성한 기업 맵(리비전 ${revision})으로 ${name}에 연결됩니다. CIK(${cik})와 제출 공시는 ${checkedOn}에 SEC EDGAR와 대조했습니다.`,
      approved: "이 맵은 사람이 검토했습니다.",
    },
  },
  notFound: {
    company: "이 주소에는 기업 페이지가 없습니다. 기업 페이지는 Benten이 토큰을 연결한 비상장 기업과 미국 상장 기업에만 있으며, 주소는 소문자입니다.",
    back: "모든 기업",
  },
};

const zhHans: CompanyCopy = {
  groups: {
    heading: { private: (count) => `非上市公司（${count}）`, "us-listed": (count) => `美国上市公司（${count}）`, funds: (count) => `基金及其他 xStocks（${count}）` },
    name: { private: "非上市", "us-listed": "美国上市", funds: "基金及其他" },
    order: "按字母顺序",
  },
  providers: { xstocks: "xStocks", prestocks: "PreStocks" },
  buyInBenten: "可在 Benten 购买",
  explore: {
    title: "探索", description: "看看哪些公司可以在 Solana 上用你自己的钱包持有。",
    heading: "看看哪些公司可以在 Solana 上用你自己的钱包持有。",
    capability: (symbol, name) => `在 Benten 内只能购买一种代币：${symbol}（${name}）。其余内容仅供你核对。`,
    noBuyable: "这里显示的内容仅供你核对。",
    search: {
      label: "搜索公司或代码", placeholder: "NVIDIA、OpenAI、TSLA", listLabel: "候选",
      count: (count) => `共 ${count} 个候选。可用上下方向键选择。`, single: "有 1 个候选。按 Enter 打开。",
      chooseOne: (count) => `有 ${count} 个候选。请从列表中选择一个。`, noMatch: (query) => `没有与“${query}”匹配的公司或代码。`,
      seeAll: "查看全部公司", noScript: "未启用 JavaScript 时，搜索会打开全部公司列表。",
    },
    seeAll: (count) => `查看全部 ${count} 个`, fundsLine: (examples) => `例如 ${examples}`,
  },
  companies: {
    title: "全部公司", description: "Benten 显示的全部公司和基金，按字母顺序排列。", heading: "全部公司",
    lead: "Benten 显示的全部公司和基金，按字母顺序排列。打开一家公司，即可查看在 Solana 上持有的方式。", filter: "显示", all: "全部",
    unlinkedHeading: (count) => `没有公司页面的美国上市代币（${count}）`,
    unlinkedNote: "Benten 无法将这些代币对应到唯一一家 SEC 公司，因此没有公司页面。它们的代币页面仍可查看。",
    fundsNote: "这些没有单一的公司，因此各自打开代币页面。",
  },
  company: {
    title: (name) => `${name} 在 Solana 上`, description: (name) => `在 Solana 上持有 ${name} 的方式：每种代币的发行方及其内容。`,
    status: { us_listed: "美国上市公司。向 SEC 提交文件。", private: "非上市公司。没有 SEC 披露文件。" },
    secRegistrant: (name) => `SEC 注册名称：${name}`,
    waysHeading: (count) => `在 Solana 上持有的方式（${count}）`,
    notice: { title: "不可互换", body: "每种代币的发行方和权利都不同。持有其中一种，并不会获得另一种的任何权利。" },
    from: (provider) => `发行方：${provider}`,
    own: {
      xstock: "跟踪这家公司股票的代币。Benten 尚未核实它给予你的权利。",
      kind: {
        economic_exposure_instrument: (provider) => `${provider} 称，此代币提供对该公司的经济敞口。`,
        tracker_certificate: (provider) => `${provider} 称，此代币是跟踪该公司的跟踪凭证。`,
        unknown: (provider) => `${provider} 未说明此代币属于哪类工具。`,
      },
      rights: { unknownBoth: "是否具有所有权和投票权不明。", noEquityUnknownVoting: "它不是股票。投票权不明。", unknownEquityNoVoting: "所有权不明。没有投票权。", neither: "它不是股票，也没有投票权。" },
      notVerified: "Benten 未核实此内容。",
    },
    capability: { buy: "可在 Benten 购买。", compare: "仅供比较。Benten 无法为此代币构建兑换。" },
    cta: (symbol) => `购买 ${symbol}`,
    facts: { heading: "来自 SEC 披露文件", notVerified: (name) => `Benten 尚未核实 ${name} 的 SEC 财务数据。`, record: (symbol) => `查看 ${symbol} 代币记录` },
    sources: { heading: "原始来源", private: (name) => `${name} 是非上市公司，Benten 没有其 SEC 披露文件。` },
    method: {
      heading: "Benten 如何关联这些代币",
      reviewed: (name, revision, reviewedOn, fetchedOn) => `本页代币通过人工于 ${reviewedOn} 审核的公司映射（修订版 ${revision}）关联到 ${name}，不按名称匹配。发行方记录于 ${fetchedOn} 获取。`,
      generated: (name, cik, revision, generatedOn, checkedOn) => `本页代币通过 ${generatedOn} 根据 SEC EDGAR 代码列表、SEC 提交文件和 Benten 注册表生成的公司映射（修订版 ${revision}）关联到 ${name}。其 CIK（${cik}）和提交文件已于 ${checkedOn} 与 SEC EDGAR 核对。`,
      approved: "此映射已经人工审核。",
    },
  },
  notFound: {
    company: "此地址没有公司页面。公司页面只为 Benten 关联了代币的非上市公司和美国上市公司而设，地址为小写。",
    back: "全部公司",
  },
};

const zhHant: CompanyCopy = {
  groups: {
    heading: { private: (count) => `非上市公司（${count}）`, "us-listed": (count) => `美國上市公司（${count}）`, funds: (count) => `基金及其他 xStocks（${count}）` },
    name: { private: "非上市", "us-listed": "美國上市", funds: "基金及其他" },
    order: "依字母順序",
  },
  providers: { xstocks: "xStocks", prestocks: "PreStocks" },
  buyInBenten: "可在 Benten 購買",
  explore: {
    title: "探索", description: "看看哪些公司可以在 Solana 上用你自己的錢包持有。",
    heading: "看看哪些公司可以在 Solana 上用你自己的錢包持有。",
    capability: (symbol, name) => `在 Benten 內只能購買一種代幣：${symbol}（${name}）。其餘內容僅供你核對。`,
    noBuyable: "這裡顯示的內容僅供你核對。",
    search: {
      label: "搜尋公司或代碼", placeholder: "NVIDIA、OpenAI、TSLA", listLabel: "候選",
      count: (count) => `共 ${count} 個候選。可用上下方向鍵選擇。`, single: "有 1 個候選。按 Enter 開啟。",
      chooseOne: (count) => `有 ${count} 個候選。請從清單中選擇一個。`, noMatch: (query) => `沒有與「${query}」相符的公司或代碼。`,
      seeAll: "查看全部公司", noScript: "未啟用 JavaScript 時，搜尋會開啟全部公司清單。",
    },
    seeAll: (count) => `查看全部 ${count} 個`, fundsLine: (examples) => `例如 ${examples}`,
  },
  companies: {
    title: "全部公司", description: "Benten 顯示的全部公司與基金，依字母順序排列。", heading: "全部公司",
    lead: "Benten 顯示的全部公司與基金，依字母順序排列。開啟一家公司，即可查看在 Solana 上持有的方式。", filter: "顯示", all: "全部",
    unlinkedHeading: (count) => `沒有公司頁面的美國上市代幣（${count}）`,
    unlinkedNote: "Benten 無法將這些代幣對應到唯一一家 SEC 公司，因此沒有公司頁面。它們的代幣頁面仍可查看。",
    fundsNote: "這些沒有單一公司，因此各自開啟代幣頁面。",
  },
  company: {
    title: (name) => `${name} 在 Solana 上`, description: (name) => `在 Solana 上持有 ${name} 的方式：每種代幣的發行方及其內容。`,
    status: { us_listed: "美國上市公司。向 SEC 提交文件。", private: "非上市公司。沒有 SEC 揭露文件。" },
    secRegistrant: (name) => `SEC 登記名稱：${name}`,
    waysHeading: (count) => `在 Solana 上持有的方式（${count}）`,
    notice: { title: "不可互換", body: "每種代幣的發行方與權利都不同。持有其中一種，並不會獲得另一種的任何權利。" },
    from: (provider) => `發行方：${provider}`,
    own: {
      xstock: "追蹤這家公司股票的代幣。Benten 尚未核實它給予你的權利。",
      kind: {
        economic_exposure_instrument: (provider) => `${provider} 表示，此代幣提供對該公司的經濟曝險。`,
        tracker_certificate: (provider) => `${provider} 表示，此代幣是追蹤該公司的追蹤憑證。`,
        unknown: (provider) => `${provider} 未說明此代幣屬於哪類工具。`,
      },
      rights: { unknownBoth: "是否具有所有權與投票權不明。", noEquityUnknownVoting: "它不是股票。投票權不明。", unknownEquityNoVoting: "所有權不明。沒有投票權。", neither: "它不是股票，也沒有投票權。" },
      notVerified: "Benten 未核實此內容。",
    },
    capability: { buy: "可在 Benten 購買。", compare: "僅供比較。Benten 無法為此代幣建立兌換。" },
    cta: (symbol) => `購買 ${symbol}`,
    facts: { heading: "來自 SEC 揭露文件", notVerified: (name) => `Benten 尚未核實 ${name} 的 SEC 財務資料。`, record: (symbol) => `查看 ${symbol} 代幣紀錄` },
    sources: { heading: "原始來源", private: (name) => `${name} 是非上市公司，Benten 沒有其 SEC 揭露文件。` },
    method: {
      heading: "Benten 如何關聯這些代幣",
      reviewed: (name, revision, reviewedOn, fetchedOn) => `本頁代幣透過人工於 ${reviewedOn} 審核的公司對應表（修訂版 ${revision}）關聯到 ${name}，不依名稱比對。發行方紀錄於 ${fetchedOn} 取得。`,
      generated: (name, cik, revision, generatedOn, checkedOn) => `本頁代幣透過 ${generatedOn} 根據 SEC EDGAR 代碼清單、SEC 提交文件和 Benten 登錄表產生的公司對應表（修訂版 ${revision}）連結到 ${name}。其 CIK（${cik}）和提交文件已於 ${checkedOn} 與 SEC EDGAR 核對。`,
      approved: "此對應表已經人工審核。",
    },
  },
  notFound: {
    company: "此位址沒有公司頁面。公司頁面只為 Benten 關聯了代幣的非上市公司與美國上市公司而設，位址為小寫。",
    back: "全部公司",
  },
};

export const COMPANY_MESSAGES: Record<PublicWebLocale, CompanyCopy> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function companyMessagesFor(locale: PublicWebLocale): CompanyCopy {
  return COMPANY_MESSAGES[locale];
}
