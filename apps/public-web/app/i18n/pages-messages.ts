/**
 * Copy of the static information pages for every supported locale: About,
 * the four learn topics and the three legal documents (app IA sections 4.1,
 * 7 and 8.12). Their titles in the footer and the side lists are in
 * pages-nav-messages.ts. Registered for non-Latin text in
 * catalog-manifest.json.
 *
 * Every statement is a fact about how Benten works, taken from the code and
 * the repository's own documents; figures that are configuration (freshness
 * windows, record limits) arrive as `PageFacts`, and labels other screens
 * own (Activity, the wallet menu) arrive as `PageLabels`, so a page never
 * restates a value or a label on its own. The purchase notice is the one
 * test-guarded copy (`PURCHASE_NOTICE_COPY`).
 *
 * Vocabulary (IA section 7): a text that needs a price word, a buying word
 * or a negated section 7.1 word (for example "not investment advice") says
 * so with its `vocabulary` marks; every other text contains none of them.
 * `tests/static-pages.test.tsx` enforces this per locale.
 */
import type { LearnTopic, LegalDocument, PublicWebLocale } from "./locales";
import { negation, price, purchase, type PageText } from "./pages-nav-messages";

export type { PageText, Vocabulary } from "./pages-nav-messages";


/** An issuer document a section's statements come from; titles and addresses are in `STATIC_PAGE_CONFIG.sources`. */
export type PageSourceKey = "xstocks-legal-overview" | "backed-restricted-countries" | "xstocks-multipliers";

export type PageLinkTarget = { readonly kind: "about" } | { readonly kind: "learn"; readonly topic: LearnTopic } | { readonly kind: "legal"; readonly document: LegalDocument };

export type PageSection = {
  readonly id: string;
  readonly heading: PageText;
  readonly body?: readonly PageText[];
  readonly items?: readonly PageText[];
  /** The items are steps in order. */
  readonly ordered?: boolean;
  /** The section is set apart on a quiet surface (one per page at most). */
  readonly quiet?: boolean;
  readonly after?: readonly PageText[];
  readonly link?: { readonly label: string; readonly target: PageLinkTarget };
  /** The primary sources of the section's statements, listed after it. */
  readonly sources?: readonly PageSourceKey[];
};

export type StaticPageCopy = {
  readonly title: string;
  readonly description: string;
  readonly heading: PageText;
  readonly lead: readonly PageText[];
  readonly sections: readonly PageSection[];
};

/** Configuration values the pages state; they come from the owning config modules. */
export type PageFacts = {
  readonly staleAfterSeconds: number;
  readonly maxDisplayAgeHours: number;
  readonly maxValueConfidencePercent: string;
  readonly activityMaxRecords: number;
  readonly rateLimitWindowSeconds: number;
};

/** Labels owned by other screens, repeated exactly. */
export type PageLabels = {
  readonly clearHistory: string;
  readonly checkAgain: string;
  readonly disconnect: string;
};

type PurchaseNotice = { readonly heading: string; readonly usPersons: string; readonly noEligibilityCheck: string; readonly noAvailabilityGuarantee: string; readonly notAdvice: string };

/**
 * The purchase notice ("Before you buy") as the buy flow shows it
 * (purchase-messages.ts). Copied, not imported, so no static page loads the
 * purchase catalog; `tests/static-pages.test.tsx` requires both to be equal.
 */
export const PURCHASE_NOTICE_COPY: Record<PublicWebLocale, PurchaseNotice> = {
  en: { heading: "Before you buy", usPersons: "The issuer does not offer or sell NVDAx to US persons, and transfers may only be made to non-US persons.", noEligibilityCheck: "Benten does not check whether you are eligible.", noAvailabilityGuarantee: "Availability from any country is not guaranteed.", notAdvice: "This is not investment advice." },
  ja: { heading: "購入の前に", usPersons: "発行体は米国人にNVDAxを提供・販売しません。引き渡しは米国人でない人にだけ行います。", noEligibilityCheck: "Bentenはあなたに購入資格があるかを確認しません。", noAvailabilityGuarantee: "どの国からの利用も保証されていません。", notAdvice: "これは投資助言ではありません。" },
  ko: { heading: "구매 전에", usPersons: "발행사는 미국인에게 NVDAx를 제공하거나 판매하지 않으며, 인도는 미국인이 아닌 사람에게만 이루어집니다.", noEligibilityCheck: "Benten은 귀하의 구매 자격을 확인하지 않습니다.", noAvailabilityGuarantee: "어느 국가에서든 이용 가능성은 보장되지 않습니다.", notAdvice: "이것은 투자 자문이 아닙니다." },
  "zh-Hans": { heading: "购买之前", usPersons: "发行人不向美国人士发售或出售 NVDAx，只能交付给非美国人士。", noEligibilityCheck: "Benten 不会核实你是否具备购买资格。", noAvailabilityGuarantee: "不保证在任何国家或地区均可使用。", notAdvice: "这不是投资建议。" },
  "zh-Hant": { heading: "購買之前", usPersons: "發行人不向美國人士發售或出售 NVDAx，只能交付給非美國人士。", noEligibilityCheck: "Benten 不會核實你是否具備購買資格。", noAvailabilityGuarantee: "不保證在任何國家或地區皆可使用。", notAdvice: "這不是投資建議。" },
};

export type PagesCopy = {
  readonly about: StaticPageCopy & { readonly sourceCode: string; readonly mcpAddress: string };
  readonly learn: Record<LearnTopic, StaticPageCopy>;
  readonly legal: Record<LegalDocument, StaticPageCopy>;
};

/** The purchase notice's four sentences, each with the marks its words need. */
function noticeItems(notice: PurchaseNotice): PageText[] {
  // The eligibility sentence names buying in some locales (ja), so it carries the purchase mark in all.
  return [purchase(notice.usPersons), purchase(notice.noEligibilityCheck), notice.noAvailabilityGuarantee, negation(notice.notAdvice)];
}

const en = (f: PageFacts, l: PageLabels): PagesCopy => ({
  about: {
    title: "About Benten",
    description: "What Benten is, what it never does, where its data comes from, and how its code is licensed.",
    heading: "About Benten",
    lead: ["Benten shows which companies you can hold on Solana, through which token, and what that token is. It starts from the company, not from a token list."],
    sections: [
      {
        id: "what",
        heading: "What Benten does",
        items: [
          "For each company it lists the Solana tokens that reference it, each with its provider and a short statement of what the token gives you.",
          "It shows facts with their sources: SEC filings for US-listed companies, and the provider's own statements where there are no filings.",
          "It shows each token's exact identity, its mint address, so you can check it in your wallet.",
          purchase("It lets you buy one token, NVIDIA (NVDAx), through one fixed route. You approve and send the purchase in your own wallet."),
        ],
      },
      {
        id: "never",
        heading: "What Benten never does",
        quiet: true,
        items: [
          "It never holds your keys, your seed phrase or your funds.",
          "It never signs a transaction.",
          "It never sends a transaction. Your wallet sends it after you approve.",
          "It never ranks companies or tokens.",
          negation(PURCHASE_NOTICE_COPY.en.notAdvice),
        ],
      },
      {
        id: "sources",
        heading: "Where the data comes from",
        items: [
          "SEC EDGAR: names and reported figures of US-listed companies, each with the filing it comes from.",
          "The xStocks token list: each xStock's symbol, mint and the company or fund it tracks.",
          "PreStocks: its private-company tokens and what PreStocks says each one is.",
          price("Pyth: reference prices, read from Pyth price accounts on Solana."),
          "Solana: token identities, your token balances and your transactions, read from the network.",
        ],
        after: ["Benten does not verify, audit or guarantee this data. It can be incomplete, delayed or corrected later."],
      },
      {
        id: "records",
        heading: "Your records stay in this browser",
        body: [purchase("Benten keeps your purchase records only in the browser where you made the purchase. A wallet app's built-in browser and your phone's browser keep separate records.")],
        link: { label: "Privacy", target: { kind: "legal", document: "privacy" } },
      },
      {
        id: "connect",
        heading: "Use Benten from Claude or ChatGPT",
        body: ["Chat apps that accept a remote MCP server can use Benten's tools at the address below. It needs no account and no key, and it reads the same public data as these pages."],
        ordered: true,
        items: [
          "In Claude, open Settings, then Connectors, choose Add custom connector, and paste the address.",
          "In ChatGPT, turn on developer mode under Settings, Apps and connectors, Advanced. Then create a connector with the address and no authentication.",
        ],
        after: [purchase("When you ask the chat to buy NVDAx, it can give you a link to the Benten buy page with your amount filled in. You connect your own wallet and approve there. The chat never signs or sends anything.")],
      },
      {
        id: "source-code",
        heading: "Open source",
        body: ["Benten's source code is licensed under the MIT License."],
      },
    ],
    sourceCode: "View the source code",
    mcpAddress: "MCP server address",
  },
  learn: {
    xstocks: {
      title: "What an xStock is",
      description: "What an xStock token tracks, what you hold and do not hold, and how its display multiplier works.",
      heading: "What an xStock is",
      lead: ["An xStock is a Solana token that tracks one share of a listed company or of a fund. xStocks are issued by Backed Assets (JE) Limited, a company in Jersey."],
      sections: [
        {
          id: "own",
          heading: "What you hold",
          body: [
            "You hold a token, not the share itself. The issuer describes each xStock as a tracker certificate that gives economic exposure to the share and no shareholder voting rights.",
            "A token's identity is its mint address. Two tokens with the same name are different tokens if their mints differ. Each product page in Benten shows the full mint so you can compare it with your wallet.",
          ],
          sources: ["xstocks-legal-overview"],
        },
        {
          id: "restrictions",
          heading: "Who may hold it",
          body: [
            "The issuer states that xStocks may not be offered, sold or delivered to US persons or in the United States, and may be delivered only to people who are not US persons.",
            "Benten does not check whether you are eligible, and it does not guarantee that it can be used from your country.",
          ],
          sources: ["backed-restricted-countries", "xstocks-legal-overview"],
        },
        {
          id: "multiplier",
          heading: "The display multiplier",
          body: [
            "Solana xStocks use a token feature called Scaled UI Amount, NVDAx included. The issuer sets a multiplier on the token, and wallets show your raw token amount multiplied by it.",
            "The raw amount in your account does not change when the multiplier changes. The issuer can schedule a new multiplier to take effect at a set time, so the amount your wallet shows can change without any transfer.",
            "Benten keeps raw amounts as the record and reads the multiplier from the token when it shows an amount. One token tracks one share after this multiplier.",
          ],
          sources: ["xstocks-multipliers"],
        },
        {
          id: "in-benten",
          heading: "xStocks in Benten",
          body: [purchase("Benten lists the xStocks in its registry and lets you buy one of them, NVDAx. Every other xStock is shown so you can check it.")],
        },
      ],
    },
    prestocks: {
      title: "What a PreStocks token is",
      description: "What PreStocks says its tokens are, what is unknown about them, and which token controls to check.",
      heading: "What a PreStocks token is",
      lead: ["A PreStocks token is a Solana token that PreStocks issues for a private company, such as OpenAI or SpaceX."],
      sections: [
        {
          id: "claim",
          heading: "What PreStocks says",
          body: [
            price("PreStocks describes each token as backed 1:1 by exposure through a special-purpose vehicle (SPV) that tracks the price of the underlying private company."),
            "An SPV is a separate legal entity set up for a specific purpose. The token is not a share of the company, and Benten has not verified PreStocks' description.",
          ],
        },
        {
          id: "unknown",
          heading: "What Benten does not know",
          items: [
            "Whether the token gives equity ownership, voting rights or a way to redeem it. Benten has not reviewed PreStocks' terms and records these as unknown.",
            "The currency and the time of the figures PreStocks publishes for each token. Benten shows those figures only on the token's evidence page, with these unknowns stated.",
          ],
        },
        {
          id: "controls",
          heading: "Token controls to check",
          body: ["A Solana token made with the Token-2022 program can carry extensions set on its mint. Two of them change what holding the token means:"],
          items: [
            "Transfer fee: part of every transfer is withheld as a fee, so the receiver gets less than was sent.",
            "Permanent delegate: an address chosen by the issuer can transfer or burn tokens from any holder's account without the holder's approval.",
          ],
          after: ["You can see a token's extensions by opening its mint address in a Solana explorer. This page does not state which PreStocks tokens carry them."],
        },
        {
          id: "in-benten",
          heading: "PreStocks tokens in Benten",
          body: [purchase("Benten shows PreStocks tokens for comparison only and does not offer buying them. It will offer one only when it can show its terms before you approve.")],
        },
      ],
    },
    "reference-prices": {
      title: "What a Pyth reference price is",
      description: "Where a Pyth reference price comes from, what it is not, and what its time, confidence and staleness mean.",
      heading: price("What a Pyth reference price is"),
      lead: [price("Next to some tokens Benten shows a Pyth reference price: a price observation published through Pyth, with the time it was published and its confidence.")],
      sections: [
        {
          id: "source",
          heading: "Where it comes from",
          body: [
            price("Pyth is a network that publishes price data collected from its data publishers. Benten reads Pyth's price accounts on Solana and shows the price of the named feed, such as Pyth NVDA/USD."),
            price("For an xStock, the feed can be for one share of the underlying company rather than for the token itself. Benten says which, next to the price."),
          ],
        },
        {
          id: "not",
          heading: "What it is not",
          body: [
            negation("It is not a quote, not a net asset value and not the price you pay."),
            price("What you pay and receive in a swap is set by the pool and shown in the swap preview before you approve. Benten never shows the reference price in the swap preview, so the two cannot be mixed up."),
          ],
        },
        {
          id: "time",
          heading: "Time and confidence",
          body: [
            price("Every reference price carries the time Pyth published it. Benten shows that time beside the price."),
            price("Pyth also publishes a confidence interval, shown as plus or minus an amount. It is the range around the price that Pyth's data supports; a wider range means its publishers agree less."),
          ],
        },
        {
          id: "stale",
          heading: "When it is not live",
          body: [
            price(`A price whose last update is older than ${f.staleAfterSeconds} seconds is not live. Benten shows it as "Last Pyth update" with its time and does not use it for any value.`),
            price("Feeds for US shares do not update while their market is closed, so on weekends and holidays you see the last update from before the close."),
            price(`If a feed has not updated for more than ${f.maxDisplayAgeHours} hours, Benten does not show its price at all.`),
            price(`Holdings shows a value (quantity times the reference price) only when the price is live, its confidence is within ${f.maxValueConfidencePercent}% of the price, and Benten has verified how one token relates to the feed. Otherwise it says why no value is shown.`),
          ],
        },
        {
          id: "none",
          heading: "When there is none",
          body: [price("Some tokens have no Pyth feed, and a read can fail. Benten then says so in words. It never shows a zero, a dash in place of a number, or another figure instead.")],
        },
      ],
    },
    "self-custody": {
      title: "Your wallet, your approval",
      description: "How buying in Benten works with your own wallet, why Benten cannot act for you, and how to check that a transaction is finalized.",
      heading: "Your wallet, your approval",
      lead: ["In Benten, your wallet does the signing and the sending. Benten prepares a transaction and asks your wallet to show it to you. Nothing happens unless you approve."],
      sections: [
        {
          id: "approve",
          heading: "How an approval works",
          ordered: true,
          items: [
            "Benten builds one unsigned swap from the swap preview you reviewed and passes it to your wallet.",
            "Your wallet shows the transaction and the network fee in SOL.",
            "If you approve, your wallet signs the transaction and sends it to Solana.",
          ],
        },
        {
          id: "cannot",
          heading: "What Benten cannot do",
          quiet: true,
          items: [
            "Benten holds no keys, so it cannot sign or send a transaction for you.",
            "Benten cannot cancel or reverse a transaction after your wallet sends it.",
            "Connecting shares your wallet address with this page and lets Benten ask your wallet for approval. It does not let Benten move funds.",
          ],
        },
        {
          id: "once",
          heading: "One request, sent once",
          body: [
            purchase("Benten asks your wallet to send once and never resends. If you are not sure whether a purchase was sent, do not buy again: check your wallet's activity or Solana Explorer first."),
            purchase("If your wallet reports an error, the transaction may or may not have been sent. Benten then marks the purchase as unknown and does not ask your wallet to send it again."),
          ],
        },
        {
          id: "finalized",
          heading: "Checking that it arrived",
          body: [
            "Solana marks a transaction finalized once the network has confirmed it to the level at which it is not rolled back.",
            purchase("Benten shows a purchase as done only when its transaction is finalized, and it measures what you received from that finalized transaction's token balances."),
            `On Activity, ${l.checkAgain} asks Solana once for the status of the signature. You can also open the signature in Solana Explorer. Activity keeps the signature in this browser, so you can check again later.`,
          ],
        },
      ],
    },
  },
  legal: {
    terms: {
      title: "Terms of use",
      description: "The conditions of using Benten, as it works today.",
      heading: "Terms of use",
      lead: ["This page describes how Benten can be used as it works today. It is a plain summary, not a reviewed legal agreement, and it can change."],
      sections: [
        { id: "service", heading: "What Benten provides", body: ["Benten is an information and tooling service. It shows public data about companies and Solana tokens, and it can prepare a swap to NVDAx, paid with USDC, SOL or SKR, for your own wallet to approve."] },
        { id: "no-warranty", heading: "No warranty", body: ["Benten is provided as it is, without any warranty. Its data comes from public sources that Benten does not verify, audit or guarantee, and it can be incomplete, delayed, wrong or corrected later. Any part of the service can change, pause or stop at any time."] },
        { id: "not-advice", heading: negation("Not investment advice"), body: [negation("Nothing in Benten is investment advice, a recommendation, a valuation or an offer to buy or sell any asset.")] },
        {
          id: "availability",
          heading: "Where Benten can be used",
          body: [
            "Benten does not guarantee that it can be used from any country, and it does not check whether you may hold a token where you live.",
            "Token issuers set their own restrictions. The issuer of NVDAx does not allow it to be sold or delivered to US persons. You are responsible for the rules that apply to you.",
          ],
        },
        {
          id: "approval",
          heading: "Your approval is your decision",
          body: [
            "You decide whether to approve each transaction in your own wallet. Check the swap preview and your wallet's request before you approve. Benten cannot cancel or reverse a transaction after your wallet sends it.",
            purchase("Any decision to buy, sell or hold an asset is made at your own discretion and risk."),
          ],
        },
        { id: "others", heading: "Services run by others", body: ["Your wallet, the Solana network, Pyth, token issuers such as xStocks and PreStocks, and the other sources Benten reads are run by others under their own terms. Benten does not control them."] },
        { id: "disclaimer", heading: "Disclaimer", body: ["The disclaimer applies to every use of Benten."], link: { label: "Disclaimer", target: { kind: "legal", document: "disclaimer" } } },
      ],
    },
    privacy: {
      title: "Privacy",
      description: "What Benten keeps in your browser, what passes through its server, who else receives your requests, and how to delete your records.",
      heading: "Privacy",
      lead: ["Benten has no accounts, and its pages set no cookies. This page lists what Benten keeps, where it is kept, and who else receives your requests."],
      sections: [
        {
          id: "browser",
          heading: "Kept in this browser only",
          body: ["Benten keeps these in your browser's storage on this device. They are not sent to Benten."],
          items: [
            purchase(`Your purchase records, at most ${f.activityMaxRecords}: for each purchase the wallet address, the Solana network, the tokens and amounts, the times, the signature once your wallet provides it, and the status.`),
            `The name of the wallet you last connected, such as Phantom, so the page can reconnect it after a reload. It is not your address, and ${l.disconnect} removes it.`,
            `On Android, after you connect through Mobile Wallet Adapter, that library keeps your wallet app's approval so the page can reconnect without asking again: your wallet address, the Solana network and an approval token from your wallet app. ${l.disconnect} removes it.`,
            "For one visit, the address of a page that failed to load, so Benten reloads it only once. It is removed when a page loads.",
          ],
          after: [
            "Benten does not store your language. The language is part of the page address, such as /ja.",
            "Holdings are read again when you refresh and kept only in the open page's memory. They are not saved.",
          ],
        },
        {
          id: "server",
          heading: "What passes through Benten's server",
          body: ["Two kinds of requests pass through Benten's server:"],
          items: [
            purchase("Solana reads: the balance of the token you pay with, the swap preview, your holdings and the status of a purchase. The server forwards each read to a Solana RPC provider. These requests contain your wallet address, and a transaction's signature when one is checked."),
            price("Reference prices: the page asks the server for the Pyth feeds it shows, and the server reads them from Solana. These requests contain no wallet information."),
          ],
          after: [
            "Benten's server code does not write request or response bodies to logs. It forwards Solana reads without your cookies or identifying headers.",
            `To limit heavy use, the server counts Solana reads per network address in its memory, for ${f.rateLimitWindowSeconds} seconds at a time. The service that hosts Benten may keep its own connection records, which Benten's code does not control.`,
          ],
        },
        {
          id: "others",
          heading: "Others who receive your requests",
          items: [
            "The Solana RPC provider chosen by whoever runs this site receives the forwarded Solana reads, including your wallet address.",
            "Your wallet receives each transaction you are asked to approve and, if you approve, sends it to Solana through its own connection. Your wallet's own privacy terms apply to it.",
            "The Solana network makes every sent transaction public and permanent, including your wallet address and the amounts.",
            "Solana Explorer receives your request when you open one of its links.",
            "On Android, connecting a wallet through Mobile Wallet Adapter can show that library's own screens, and they load the Inter Tight font from Google Fonts. Google then receives a request with your network address and this site's address, but no wallet information.",
          ],
        },
        {
          id: "delete",
          heading: "Deleting your records",
          items: [
            purchase(`On Activity, ${l.clearHistory} removes your purchase records from this browser.`),
            `${l.disconnect} in the wallet menu removes the remembered wallet name and, on Android, the Mobile Wallet Adapter approval.`,
            "Clearing this site's data in your browser settings removes everything Benten keeps in this browser.",
            "Nothing sent to Solana can be removed, by Benten or by anyone else.",
          ],
        },
      ],
    },
    disclaimer: {
      title: "Disclaimer",
      description: "Benten provides information and tools. What it shows is factual data, with its limits.",
      heading: "Disclaimer",
      lead: [negation("Benten is an information and tooling service. It does not provide investment advice, recommendations, valuations or forward-looking predictions of any kind, and nothing it presents is an offer, solicitation or endorsement to buy, sell or hold any asset.")],
      sections: [
        { id: "data", heading: "About the data", body: ["The financial facts and data Benten makes available are drawn from public disclosures made by the underlying companies. Benten does not verify, audit or guarantee the accuracy, completeness or timeliness of that data, and it may be incomplete, delayed or subject to correction."] },
        {
          id: "decisions",
          heading: "Your decisions",
          body: [
            purchase("Any decision to buy, sell, hold or otherwise act on any asset, including any tokenized instrument Benten refers to, is made solely at your own discretion and risk."),
            negation("Benten and its contributors accept no liability for any loss or damage arising from reliance on information provided through this service."),
          ],
        },
        { id: "before-you-buy", heading: purchase(PURCHASE_NOTICE_COPY.en.heading), body: [purchase("Before every purchase, the buy flow shows these four sentences:")], items: noticeItems(PURCHASE_NOTICE_COPY.en) },
      ],
    },
  },
});

const ja = (f: PageFacts, l: PageLabels): PagesCopy => ({
  about: {
    title: "Bentenについて",
    description: "Bentenとは何か、Bentenが決してしないこと、データの出どころ、コードのライセンス。",
    heading: "Bentenについて",
    lead: ["Bentenは、どの企業をSolana上で保有できるか、どのトークンを通じてか、そのトークンが何かを示します。トークンの一覧からではなく、企業から始めます。"],
    sections: [
      {
        id: "what",
        heading: "Bentenがすること",
        items: [
          "企業ごとに、その企業を参照するSolanaのトークンを並べ、提供元と、そのトークンで何が得られるかの短い説明を示します。",
          "事実を出典とともに示します。米国上場企業はSECへの提出書類、提出書類がない場合は提供元自身の説明です。",
          "各トークンの正確な識別情報であるミントアドレスを示すので、ウォレットで確かめられます。",
          purchase("1つのトークン、NVIDIA（NVDAx）だけを、1つの固定経路で購入できます。購入はご自身のウォレットで承認し、送信します。"),
        ],
      },
      {
        id: "never",
        heading: "Bentenが決してしないこと",
        quiet: true,
        items: [
          "鍵、シードフレーズ、資金を預かることはありません。",
          "トランザクションに署名することはありません。",
          "トランザクションを送信することはありません。承認した後、送信するのはあなたのウォレットです。",
          "企業やトークンを順位付けすることはありません。",
          negation(PURCHASE_NOTICE_COPY.ja.notAdvice),
        ],
      },
      {
        id: "sources",
        heading: "データの出どころ",
        items: [
          "SEC EDGAR: 米国上場企業の名称と報告された数値。それぞれ出典の提出書類つきです。",
          "xStocksのトークン一覧: 各xStockのシンボル、ミント、連動する企業またはファンド。",
          "PreStocks: 同社の非上場企業トークンと、各トークンについての同社の説明。",
          price("Pyth: 参考価格。Solana上のPythの価格アカウントから読み取ります。"),
          "Solana: トークンの識別情報、あなたのトークン残高とトランザクション。ネットワークから読み取ります。",
        ],
        after: ["Bentenはこれらのデータを検証、監査、保証しません。不完全であったり、遅れていたり、後から訂正されたりすることがあります。"],
      },
      {
        id: "records",
        heading: "記録はこのブラウザに残ります",
        body: [purchase("Bentenは、購入の記録を購入したブラウザの中にだけ保存します。ウォレットアプリ内のブラウザとスマートフォンのブラウザでは、記録は別々です。")],
        link: { label: "プライバシー", target: { kind: "legal", document: "privacy" } },
      },
      {
        id: "connect",
        heading: "ClaudeやChatGPTからBentenを使う",
        body: ["リモートMCPサーバーを追加できるチャットアプリから、下のアドレスでBentenのツールを使えます。アカウントもキーもいりません。このサイトと同じ公開データを読みます。"],
        ordered: true,
        items: [
          "Claudeでは、設定のコネクタを開き、カスタムコネクタを追加を選んで、アドレスを貼り付けます。",
          "ChatGPTでは、設定のアプリとコネクタにある詳細設定で開発者モードをオンにします。次に、アドレスを指定して認証なしのコネクタを作成します。",
        ],
        after: [purchase("チャットでNVDAxの購入を頼むと、金額を入力済みのBentenの購入画面へのリンクを受け取れます。ウォレットの接続と承認は、その画面で自分で行います。チャットが署名や送信をすることはありません。")],
      },
      {
        id: "source-code",
        heading: "オープンソース",
        body: ["Bentenのソースコードは MIT License のもとで提供されています。"],
      },
    ],
    sourceCode: "ソースコードを見る",
    mcpAddress: "MCPサーバーのアドレス",
  },
  learn: {
    xstocks: {
      title: "xStockとは",
      description: "xStockトークンが何に連動するか、何を保有し何を保有しないか、表示倍率のしくみ。",
      heading: "xStockとは",
      lead: ["xStockは、上場企業またはファンドの1株に連動するSolanaのトークンです。発行体は、ジャージーの会社であるBacked Assets (JE) Limitedです。"],
      sections: [
        {
          id: "own",
          heading: "保有するもの",
          body: [
            "保有するのはトークンであり、株式そのものではありません。発行体は各xStockを、株式への経済的なエクスポージャーを与え、株主の議決権は与えないトラッカー証書と説明しています。",
            "トークンの識別情報はミントアドレスです。同じ名前でもミントが違えば別のトークンです。Bentenの各商品ページはミントを省略せずに示すので、ウォレットの表示と比べられます。",
          ],
          sources: ["xstocks-legal-overview"],
        },
        {
          id: "restrictions",
          heading: "保有できる人",
          body: [
            "発行体は、xStocksを米国人に対して、または米国内で提供・販売・引き渡しすることはできず、米国人でない人にだけ引き渡せると定めています。",
            "Bentenはあなたに資格があるかを確認しません。また、あなたの国からBentenを利用できることも保証しません。",
          ],
          sources: ["backed-restricted-countries", "xstocks-legal-overview"],
        },
        {
          id: "multiplier",
          heading: "表示倍率",
          body: [
            "SolanaのxStocksは Scaled UI Amount というトークン機能を使っており、NVDAxも同じです。発行体がトークンに倍率を設定し、ウォレットはトークンの生の数量にその倍率を掛けて表示します。",
            "倍率が変わっても、アカウントにある生の数量は変わりません。発行体は新しい倍率を決まった時刻から有効にするよう予定できるため、送金がなくてもウォレットに表示される数量が変わることがあります。",
            "Bentenは生の数量を記録として保ち、数量を表示するときにトークンから倍率を読み取ります。この倍率を適用した後のトークン1つが株式1株に連動します。",
          ],
          sources: ["xstocks-multipliers"],
        },
        {
          id: "in-benten",
          heading: "BentenでのxStocks",
          body: [purchase("BentenはレジストリにあるxStocksを一覧にし、そのうちNVDAxだけを購入できるようにしています。ほかのxStockは確認のために表示しています。")],
        },
      ],
    },
    prestocks: {
      title: "PreStocksトークンとは",
      description: "PreStocksが自社のトークンをどう説明しているか、何がわかっていないか、確かめるべきトークンの制御。",
      heading: "PreStocksトークンとは",
      lead: ["PreStocksトークンは、PreStocksがOpenAIやSpaceXなどの非上場企業について発行するSolanaのトークンです。"],
      sections: [
        {
          id: "claim",
          heading: "PreStocksの説明",
          body: [
            price("PreStocksは、各トークンが、非上場企業の価格に連動する特別目的事業体（SPV）を通じたエクスポージャーによって1:1で裏付けられていると説明しています。"),
            "SPVとは、特定の目的のために設立される別の法人です。トークンはその企業の株式ではありません。BentenはPreStocksの説明を検証していません。",
          ],
        },
        {
          id: "unknown",
          heading: "Bentenにわからないこと",
          items: [
            "トークンが株式の所有、議決権、償還の手段を与えるかどうか。BentenはPreStocksの条件を確認しておらず、これらを不明として記録しています。",
            "PreStocksが各トークンについて公表している数値の通貨と時点。Bentenはこれらの数値をトークンの根拠ページにだけ、不明な点を明記して表示します。",
          ],
        },
        {
          id: "controls",
          heading: "確かめるべきトークンの制御",
          body: ["Token-2022プログラムで作られたSolanaのトークンは、ミントに設定された拡張機能を持つことがあります。そのうち2つは、トークンを保有する意味を変えます。"],
          items: [
            "送金手数料: 送金のたびに一部が手数料として差し引かれ、受け取る側には送った量より少なく届きます。",
            "永続デリゲート（permanent delegate）: 発行体が選んだアドレスが、保有者の承認なしに、どの保有者のアカウントからでもトークンを移動または焼却できます。",
          ],
          after: ["トークンの拡張機能は、ミントアドレスをSolanaのエクスプローラーで開くと確認できます。このページでは、どのPreStocksトークンがこれらを持つかは述べていません。"],
        },
        {
          id: "in-benten",
          heading: "BentenでのPreStocksトークン",
          body: [purchase("BentenはPreStocksトークンを比較のためだけに表示し、購入は提供していません。承認の前に条件を示せるようになった場合にだけ提供します。")],
        },
      ],
    },
    "reference-prices": {
      title: "Pyth 参考価格とは",
      description: "Pyth 参考価格の出どころ、それが何でないか、時刻・信頼区間・古さが意味すること。",
      heading: price("Pyth 参考価格とは"),
      lead: [price("Bentenは一部のトークンの横にPyth 参考価格を表示します。Pythを通じて公表された価格の観測値で、公表された時刻と信頼区間がついています。")],
      sections: [
        {
          id: "source",
          heading: "出どころ",
          body: [
            price("Pythは、データ提供者から集めた価格データを公表するネットワークです。BentenはSolana上のPythの価格アカウントを読み取り、Pyth NVDA/USDのように名前を示したフィードの価格を表示します。"),
            price("xStockの場合、フィードがトークンそのものではなく、原株1株についてのものであることがあります。Bentenはどちらなのかを価格の横に示します。"),
          ],
        },
        {
          id: "not",
          heading: price("参考価格ではないもの"),
          body: [
            negation("これは気配値でも基準価額でもなく、あなたが支払う価格でもありません。"),
            price("スワップで支払う量と受け取る量はプールが決め、承認の前にスワッププレビューに表示されます。Bentenはスワッププレビューに参考価格を表示しないので、両者が混同されることはありません。"),
          ],
        },
        {
          id: "time",
          heading: "時刻と信頼区間",
          body: [
            price("参考価格には、Pythが公表した時刻がついています。Bentenはその時刻を価格の横に表示します。"),
            price("Pythは信頼区間も公表しており、プラスマイナスの幅で示されます。Pythのデータが支える価格の周りの範囲で、幅が広いほどデータ提供者の値のばらつきが大きいことを意味します。"),
          ],
        },
        {
          id: "stale",
          heading: "最新ではないとき",
          body: [
            price(`最後の更新から${f.staleAfterSeconds}秒を超えた価格は最新ではありません。Bentenはそれを「Pythの最終更新」として時刻とともに表示し、どの評価額にも使いません。`),
            price("米国株のフィードは市場が閉まっている間は更新されないため、週末や休日には取引終了前の最後の更新が表示されます。"),
            price(`フィードが${f.maxDisplayAgeHours}時間を超えて更新されていない場合、Bentenはその価格をまったく表示しません。`),
            price(`保有タブが評価額（数量×参考価格）を表示するのは、価格が最新で、信頼区間が価格の${f.maxValueConfidencePercent}%以内で、トークン1つとフィードの関係をBentenが確認している場合だけです。それ以外の場合は、評価額を表示しない理由を示します。`),
          ],
        },
        {
          id: "none",
          heading: price("参考価格がないとき"),
          body: [price("Pythのフィードがないトークンがあり、読み取りが失敗することもあります。その場合、Bentenはそのことを言葉で示します。ゼロや、数値の代わりのダッシュ、別の数値を表示することはありません。")],
        },
      ],
    },
    "self-custody": {
      title: "ウォレットでの承認",
      description: "Bentenでの購入がご自身のウォレットでどう行われるか、Bentenが代わりに実行できない理由、トランザクションの確定の確かめ方。",
      heading: "ウォレットでの承認",
      lead: ["Bentenでは、署名と送信を行うのはあなたのウォレットです。Bentenはトランザクションを用意し、あなたに見せるようウォレットに依頼します。あなたが承認しない限り、何も起こりません。"],
      sections: [
        {
          id: "approve",
          heading: "承認の流れ",
          ordered: true,
          items: [
            "Bentenは、あなたが確認したスワッププレビューから未署名のスワップを1つ組み立て、ウォレットに渡します。",
            "ウォレットがトランザクションと、SOL建てのネットワーク手数料を表示します。",
            "承認すると、ウォレットがトランザクションに署名し、Solanaに送信します。",
          ],
        },
        {
          id: "cannot",
          heading: "Bentenにできないこと",
          quiet: true,
          items: [
            "Bentenは鍵を持たないため、あなたの代わりにトランザクションに署名したり送信したりできません。",
            "ウォレットが送信した後のトランザクションを、Bentenが取り消したり元に戻したりすることはできません。",
            "接続すると、ウォレットのアドレスがこのページに伝わり、Bentenがウォレットに承認を依頼できるようになります。Bentenが資金を動かせるようになるわけではありません。",
          ],
        },
        {
          id: "once",
          heading: "依頼は1回、送信も1回",
          body: [
            purchase("Bentenはウォレットに1回だけ送信を依頼し、再送信は決してしません。購入が送信されたかわからないときは、もう一度購入しないでください。先にウォレットのアクティビティかSolana Explorerを確認してください。"),
            purchase("ウォレットがエラーを報告した場合、トランザクションが送信されたかどうかはわかりません。Bentenはその購入を不明として記録し、ウォレットに再び送信を依頼することはありません。"),
          ],
        },
        {
          id: "finalized",
          heading: "届いたことの確かめ方",
          body: [
            "Solanaは、ネットワークが取り消されない段階まで承認したトランザクションを、ファイナライズ済み（finalized）とします。",
            purchase("Bentenが購入を完了として表示するのは、そのトランザクションがファイナライズされたときだけです。受け取った数量は、ファイナライズされたトランザクションのトークン残高から測ります。"),
            `履歴タブの「${l.checkAgain}」は、署名の状態をSolanaに1回問い合わせます。署名はSolana Explorerで開くこともできます。署名はこのブラウザの履歴に残るので、後からもう一度確認できます。`,
          ],
        },
      ],
    },
  },
  legal: {
    terms: {
      title: "利用条件",
      description: "現在の動作に即した、Bentenを利用する条件。",
      heading: "利用条件",
      lead: ["このページは、現在の動作に即してBentenをどう利用できるかを説明するものです。法的な確認を経た契約文ではなく、平易な要約であり、変更されることがあります。"],
      sections: [
        { id: "service", heading: "Bentenが提供するもの", body: ["Bentenは情報とツールを提供するサービスです。企業とSolanaのトークンについて公開データを示し、USDC、SOLまたはSKRで支払うNVDAxへのスワップを、あなたのウォレットが承認するために用意できます。"] },
        { id: "no-warranty", heading: "無保証", body: ["Bentenは現状のまま、いかなる保証もなく提供されます。データはBentenが検証、監査、保証しない公開情報に由来し、不完全、遅延、誤り、後日の訂正がありえます。サービスのどの部分も、いつでも変更、一時停止、終了されることがあります。"] },
        { id: "not-advice", heading: negation("投資助言ではありません"), body: [negation("Bentenのどの内容も、投資助言、推奨、評価、または資産の売買の申し込みではありません。")] },
        {
          id: "availability",
          heading: "利用できる地域",
          body: [
            "Bentenは、どの国からでも利用できることを保証しません。また、お住まいの地域であなたがトークンを保有できるかも確認しません。",
            "トークンの発行体はそれぞれ制限を定めています。NVDAxの発行体は、米国人への販売と引き渡しを認めていません。あなたに適用される規則に従うのは、あなた自身の責任です。",
          ],
        },
        {
          id: "approval",
          heading: "承認するかはあなたが決めます",
          body: [
            "各トランザクションを承認するかどうかは、ご自身のウォレットであなたが決めます。承認の前に、スワッププレビューとウォレットの依頼内容を確認してください。ウォレットが送信した後のトランザクションを、Bentenが取り消したり元に戻したりすることはできません。",
            purchase("資産を購入、売却、保有する判断は、すべてあなた自身の裁量と責任で行われます。"),
          ],
        },
        { id: "others", heading: "他者が運営するサービス", body: ["あなたのウォレット、Solanaネットワーク、Pyth、xStocksやPreStocksなどのトークン発行体、そのほかBentenが読み取る情報源は、それぞれの条件のもとで他者が運営しています。Bentenはそれらを管理していません。"] },
        { id: "disclaimer", heading: "免責事項", body: ["Bentenのあらゆる利用に免責事項が適用されます。"], link: { label: "免責事項", target: { kind: "legal", document: "disclaimer" } } },
      ],
    },
    privacy: {
      title: "プライバシー",
      description: "Bentenがブラウザに保存するもの、サーバーを通るもの、ほかに要求を受け取る相手、記録の消し方。",
      heading: "プライバシー",
      lead: ["Bentenにはアカウントがなく、ページはCookieを設定しません。このページでは、Bentenが保存するもの、その場所、ほかにあなたの要求を受け取る相手を示します。"],
      sections: [
        {
          id: "browser",
          heading: "このブラウザにだけ保存するもの",
          body: ["Bentenは次のものを、この端末のブラウザのストレージに保存します。Bentenに送られることはありません。"],
          items: [
            purchase(`購入の記録（最大${f.activityMaxRecords}件）: 購入ごとに、ウォレットアドレス、Solanaのネットワーク、トークンと数量、時刻、ウォレットが返した後の署名、状態。`),
            `最後に接続したウォレットの名前（Phantomなど）。再読み込みの後に再接続するためのもので、アドレスではありません。「${l.disconnect}」で削除されます。`,
            `Androidでは、Mobile Wallet Adapterで接続すると、確認なしで再接続できるよう、そのライブラリがウォレットアプリの承認を保存します。内容はウォレットアドレス、Solanaのネットワーク、ウォレットアプリが発行した承認トークンです。「${l.disconnect}」で削除されます。`,
            "1回の訪問の間だけ、読み込みに失敗したページのアドレス。再読み込みを1回だけにするためのもので、ページが読み込まれると削除されます。",
          ],
          after: [
            "Bentenは言語を保存しません。言語は /ja のようにページのアドレスの一部です。",
            "保有しているトークンは更新のたびに読み直し、開いているページのメモリにだけ置きます。保存はしません。",
          ],
        },
        {
          id: "server",
          heading: "Bentenのサーバーを通るもの",
          body: ["次の2種類の要求がBentenのサーバーを通ります。"],
          items: [
            purchase("Solanaの読み取り: 支払いに使うトークンの残高、スワッププレビュー、保有トークン、購入の状態。サーバーは各読み取りをSolanaのRPC提供者に中継します。これらの要求にはウォレットアドレスが含まれ、状態を確認するときはトランザクションの署名も含まれます。"),
            price("参考価格: ページが表示するPythのフィードをサーバーに要求し、サーバーがSolanaから読み取ります。これらの要求にウォレットの情報は含まれません。"),
          ],
          after: [
            "Bentenのサーバーのコードは、要求や応答の本文をログに書きません。Solanaの読み取りは、Cookieや識別につながるヘッダーを付けずに中継します。",
            `過度な利用を抑えるため、サーバーはネットワークアドレスごとのSolanaの読み取り回数を、${f.rateLimitWindowSeconds}秒単位でメモリ上に数えます。Bentenをホストするサービスが独自に接続の記録を残す場合があり、それはBentenのコードの管理外です。`,
          ],
        },
        {
          id: "others",
          heading: "ほかに要求を受け取る相手",
          items: [
            "このサイトの運営者が選んだSolanaのRPC提供者は、中継されたSolanaの読み取りを、ウォレットアドレスを含めて受け取ります。",
            "あなたのウォレットは、承認を求められた各トランザクションを受け取り、承認されると自身の接続を通じてSolanaに送信します。ウォレットにはウォレット自身のプライバシー条件が適用されます。",
            "Solanaネットワークでは、送信されたトランザクションはすべて、ウォレットアドレスと数量を含めて公開され、残り続けます。",
            "Solana Explorerは、そのリンクを開いたときにあなたの要求を受け取ります。",
            "Androidでは、Mobile Wallet Adapterでウォレットを接続するときに、そのライブラリ自身の画面が表示されることがあり、その画面はGoogle FontsからInter Tightという書体を読み込みます。このときGoogleは、あなたのネットワークアドレスとこのサイトのアドレスを含む要求を受け取りますが、ウォレットの情報は受け取りません。",
          ],
        },
        {
          id: "delete",
          heading: "記録の消し方",
          items: [
            purchase(`履歴タブの「${l.clearHistory}」で、このブラウザから購入の記録を削除できます。`),
            `ウォレットメニューの「${l.disconnect}」で、記憶したウォレットの名前と、AndroidではMobile Wallet Adapterの承認が削除されます。`,
            "ブラウザの設定でこのサイトのデータを消去すると、Bentenがこのブラウザに保存したものがすべて削除されます。",
            "Solanaに送信されたものは、Bentenにもほかの誰にも削除できません。",
          ],
        },
      ],
    },
    disclaimer: {
      title: "免責事項",
      description: "Bentenは情報とツールを提供します。示すのは事実のデータと、その限界です。",
      heading: "免責事項",
      lead: [negation("Bentenは情報とツールを提供するサービスです。いかなる種類の投資助言、推奨、評価、将来予測も提供せず、示すものはいずれも、資産の売買や保有の申し込み、勧誘、または支持ではありません。")],
      sections: [
        { id: "data", heading: "データについて", body: ["Bentenが提供する財務上の事実とデータは、対象企業が行った公開開示に基づいています。Bentenはそのデータの正確性、完全性、適時性を検証、監査、保証しません。データは不完全であったり、遅れていたり、訂正されたりすることがあります。"] },
        {
          id: "decisions",
          heading: "あなたの判断",
          body: [
            purchase("Bentenが言及するトークン化された商品を含め、資産を購入、売却、保有する、またはその他の行動をとる判断は、すべてあなた自身の裁量と責任で行われます。"),
            negation("Bentenとその貢献者は、このサービスを通じて提供された情報に依拠したことで生じたいかなる損失や損害についても、責任を負いません。"),
          ],
        },
        { id: "before-you-buy", heading: purchase(PURCHASE_NOTICE_COPY.ja.heading), body: [purchase("購入のたびに、購入画面は次の4つの文を表示します。")], items: noticeItems(PURCHASE_NOTICE_COPY.ja) },
      ],
    },
  },
});

const ko = (f: PageFacts, l: PageLabels): PagesCopy => ({
  about: {
    title: "Benten 소개",
    description: "Benten이 무엇인지, 절대 하지 않는 일, 데이터의 출처, 코드의 라이선스.",
    heading: "Benten 소개",
    lead: ["Benten은 Solana에서 어떤 기업을, 어떤 토큰을 통해 보유할 수 있는지, 그리고 그 토큰이 무엇인지 보여 줍니다. 토큰 목록이 아니라 기업에서 시작합니다."],
    sections: [
      {
        id: "what",
        heading: "Benten이 하는 일",
        items: [
          "기업마다 그 기업을 참조하는 Solana 토큰을 나열하고, 각 토큰의 제공사와 그 토큰으로 무엇을 얻는지에 대한 짧은 설명을 보여 줍니다.",
          "사실을 출처와 함께 보여 줍니다. 미국 상장 기업은 SEC 제출 서류이고, 제출 서류가 없으면 제공사 자신의 설명입니다.",
          "각 토큰의 정확한 식별 정보인 민트 주소를 보여 주므로 지갑에서 확인할 수 있습니다.",
          purchase("하나의 토큰, NVIDIA(NVDAx)만 하나의 고정 경로로 구매할 수 있습니다. 구매는 본인의 지갑에서 승인하고 전송합니다."),
        ],
      },
      {
        id: "never",
        heading: "Benten이 절대 하지 않는 일",
        quiet: true,
        items: [
          "키, 시드 문구, 자금을 보관하지 않습니다.",
          "트랜잭션에 서명하지 않습니다.",
          "트랜잭션을 전송하지 않습니다. 승인한 뒤 전송하는 것은 본인의 지갑입니다.",
          "기업이나 토큰의 순위를 매기지 않습니다.",
          negation(PURCHASE_NOTICE_COPY.ko.notAdvice),
        ],
      },
      {
        id: "sources",
        heading: "데이터의 출처",
        items: [
          "SEC EDGAR: 미국 상장 기업의 이름과 보고된 수치. 각각 출처가 된 제출 서류와 함께 보여 줍니다.",
          "xStocks 토큰 목록: 각 xStock의 심볼, 민트, 추종하는 기업 또는 펀드.",
          "PreStocks: 이 회사의 비상장 기업 토큰과 각 토큰에 대한 이 회사의 설명.",
          price("Pyth: 참고 가격. Solana의 Pyth 가격 계정에서 읽습니다."),
          "Solana: 토큰 식별 정보, 본인의 토큰 잔액과 트랜잭션. 네트워크에서 읽습니다.",
        ],
        after: ["Benten은 이 데이터를 검증, 감사, 보증하지 않습니다. 불완전하거나 늦거나 나중에 정정될 수 있습니다."],
      },
      {
        id: "records",
        heading: "기록은 이 브라우저에 남습니다",
        body: [purchase("Benten은 구매 기록을 구매한 브라우저 안에만 보관합니다. 지갑 앱의 내장 브라우저와 휴대전화의 브라우저는 기록을 따로 보관합니다.")],
        link: { label: "개인정보", target: { kind: "legal", document: "privacy" } },
      },
      {
        id: "connect",
        heading: "Claude나 ChatGPT에서 Benten 사용하기",
        body: ["원격 MCP 서버를 추가할 수 있는 채팅 앱에서 아래 주소로 Benten의 도구를 사용할 수 있습니다. 계정이나 키가 필요 없으며, 이 사이트와 같은 공개 데이터를 읽습니다."],
        ordered: true,
        items: [
          "Claude에서는 설정의 커넥터를 열고 사용자 지정 커넥터 추가를 선택한 뒤 주소를 붙여 넣습니다.",
          "ChatGPT에서는 설정의 앱 및 커넥터에 있는 고급 설정에서 개발자 모드를 켭니다. 그런 다음 주소를 입력하고 인증 없이 커넥터를 만듭니다.",
        ],
        after: [purchase("채팅에서 NVDAx 구매를 요청하면 금액이 입력된 Benten 구매 화면 링크를 받을 수 있습니다. 지갑 연결과 승인은 그 화면에서 직접 합니다. 채팅은 서명하거나 전송하지 않습니다.")],
      },
      {
        id: "source-code",
        heading: "오픈 소스",
        body: ["Benten의 소스 코드는 MIT License로 제공됩니다."],
      },
    ],
    sourceCode: "소스 코드 보기",
    mcpAddress: "MCP 서버 주소",
  },
  learn: {
    xstocks: {
      title: "xStock이란",
      description: "xStock 토큰이 무엇을 추종하는지, 무엇을 보유하고 무엇을 보유하지 않는지, 표시 배수의 작동 방식.",
      heading: "xStock이란",
      lead: ["xStock은 상장 기업 또는 펀드의 1주를 추종하는 Solana 토큰입니다. 발행사는 저지(Jersey) 회사인 Backed Assets (JE) Limited입니다."],
      sections: [
        {
          id: "own",
          heading: "보유하는 것",
          body: [
            "보유하는 것은 토큰이며 주식 자체가 아닙니다. 발행사는 각 xStock을 주식에 대한 경제적 노출을 제공하고 주주 의결권은 부여하지 않는 트래커 증서라고 설명합니다.",
            "토큰의 식별 정보는 민트 주소입니다. 이름이 같아도 민트가 다르면 다른 토큰입니다. Benten의 각 상품 페이지는 민트를 줄이지 않고 보여 주므로 지갑의 표시와 비교할 수 있습니다.",
          ],
          sources: ["xstocks-legal-overview"],
        },
        {
          id: "restrictions",
          heading: "보유할 수 있는 사람",
          body: [
            "발행사는 xStocks를 미국인에게 또는 미국 내에서 제공·판매·인도할 수 없으며, 미국인이 아닌 사람에게만 인도할 수 있다고 밝힙니다.",
            "Benten은 귀하에게 자격이 있는지 확인하지 않으며, 귀하의 국가에서 Benten을 이용할 수 있다고 보장하지도 않습니다.",
          ],
          sources: ["backed-restricted-countries", "xstocks-legal-overview"],
        },
        {
          id: "multiplier",
          heading: "표시 배수",
          body: [
            "Solana의 xStocks는 Scaled UI Amount라는 토큰 기능을 사용하며, NVDAx도 마찬가지입니다. 발행사가 토큰에 배수를 설정하고, 지갑은 토큰의 원시 수량에 그 배수를 곱해 표시합니다.",
            "배수가 바뀌어도 계정에 있는 원시 수량은 바뀌지 않습니다. 발행사는 새 배수가 정해진 시각부터 적용되도록 예약할 수 있으므로, 전송이 없어도 지갑에 표시되는 수량이 바뀔 수 있습니다.",
            "Benten은 원시 수량을 기록으로 유지하고, 수량을 표시할 때 토큰에서 배수를 읽습니다. 이 배수를 적용한 뒤의 토큰 1개가 주식 1주를 추종합니다.",
          ],
          sources: ["xstocks-multipliers"],
        },
        {
          id: "in-benten",
          heading: "Benten의 xStocks",
          body: [purchase("Benten은 레지스트리에 있는 xStocks를 나열하고, 그중 NVDAx만 구매할 수 있게 합니다. 다른 xStock은 확인할 수 있도록 보여 줍니다.")],
        },
      ],
    },
    prestocks: {
      title: "PreStocks 토큰이란",
      description: "PreStocks가 자사 토큰을 어떻게 설명하는지, 무엇이 알려지지 않았는지, 확인해야 할 토큰 제어 기능.",
      heading: "PreStocks 토큰이란",
      lead: ["PreStocks 토큰은 PreStocks가 OpenAI나 SpaceX 같은 비상장 기업에 대해 발행하는 Solana 토큰입니다."],
      sections: [
        {
          id: "claim",
          heading: "PreStocks의 설명",
          body: [
            price("PreStocks는 각 토큰이 비상장 기업의 가격을 추종하는 특수목적법인(SPV)을 통한 익스포저로 1:1 뒷받침된다고 설명합니다."),
            "SPV는 특정한 목적을 위해 설립된 별도의 법인입니다. 토큰은 그 기업의 주식이 아니며, Benten은 PreStocks의 설명을 검증하지 않았습니다.",
          ],
        },
        {
          id: "unknown",
          heading: "Benten이 알지 못하는 것",
          items: [
            "토큰이 지분 소유, 의결권, 상환 방법을 주는지 여부. Benten은 PreStocks의 조건을 검토하지 않았으며 이를 알 수 없음으로 기록합니다.",
            "PreStocks가 각 토큰에 대해 공개하는 수치의 통화와 시점. Benten은 이 수치를 토큰의 근거 페이지에만, 알 수 없는 점을 밝혀 보여 줍니다.",
          ],
        },
        {
          id: "controls",
          heading: "확인해야 할 토큰 제어 기능",
          body: ["Token-2022 프로그램으로 만든 Solana 토큰은 민트에 설정된 확장 기능을 가질 수 있습니다. 그중 두 가지는 토큰을 보유한다는 의미를 바꿉니다."],
          items: [
            "전송 수수료: 전송할 때마다 일부가 수수료로 떼어지므로 받는 쪽에는 보낸 양보다 적게 도착합니다.",
            "영구 위임자(permanent delegate): 발행사가 정한 주소가 보유자의 승인 없이 어떤 보유자의 계정에서든 토큰을 옮기거나 소각할 수 있습니다.",
          ],
          after: ["토큰의 확장 기능은 민트 주소를 Solana 탐색기에서 열면 확인할 수 있습니다. 이 페이지는 어떤 PreStocks 토큰이 이를 가지는지 밝히지 않습니다."],
        },
        {
          id: "in-benten",
          heading: "Benten의 PreStocks 토큰",
          body: [purchase("Benten은 PreStocks 토큰을 비교용으로만 보여 주며 구매를 제공하지 않습니다. 승인 전에 조건을 보여 줄 수 있을 때에만 제공합니다.")],
        },
      ],
    },
    "reference-prices": {
      title: "Pyth 참고 가격이란",
      description: "Pyth 참고 가격의 출처, 그것이 아닌 것, 시각과 신뢰 구간과 오래됨이 뜻하는 것.",
      heading: price("Pyth 참고 가격이란"),
      lead: [price("Benten은 일부 토큰 옆에 Pyth 참고 가격을 보여 줍니다. Pyth를 통해 공개된 가격 관측값으로, 공개된 시각과 신뢰 구간이 함께 있습니다.")],
      sections: [
        {
          id: "source",
          heading: "출처",
          body: [
            price("Pyth는 데이터 제공자에게서 모은 가격 데이터를 공개하는 네트워크입니다. Benten은 Solana의 Pyth 가격 계정을 읽고, Pyth NVDA/USD처럼 이름을 밝힌 피드의 가격을 보여 줍니다."),
            price("xStock의 경우 피드가 토큰 자체가 아니라 기초 기업 주식 1주에 대한 것일 수 있습니다. Benten은 어느 쪽인지 가격 옆에 밝힙니다."),
          ],
        },
        {
          id: "not",
          heading: price("참고 가격이 아닌 것"),
          body: [
            negation("이것은 호가도, 순자산가치도, 귀하가 지불하는 가격도 아닙니다."),
            price("스왑에서 지불하고 받는 양은 풀이 정하며, 승인 전에 스왑 미리보기에 표시됩니다. Benten은 스왑 미리보기에 참고 가격을 표시하지 않으므로 둘이 섞일 수 없습니다."),
          ],
        },
        {
          id: "time",
          heading: "시각과 신뢰 구간",
          body: [
            price("모든 참고 가격에는 Pyth가 공개한 시각이 있습니다. Benten은 그 시각을 가격 옆에 보여 줍니다."),
            price("Pyth는 신뢰 구간도 공개하며, 플러스 마이너스 금액으로 표시됩니다. Pyth의 데이터가 뒷받침하는 가격 주변의 범위이며, 범위가 넓을수록 데이터 제공자들의 값이 덜 일치한다는 뜻입니다."),
          ],
        },
        {
          id: "stale",
          heading: "최신이 아닐 때",
          body: [
            price(`마지막 업데이트가 ${f.staleAfterSeconds}초보다 오래된 가격은 최신이 아닙니다. Benten은 이를 'Pyth 마지막 업데이트'로 시각과 함께 보여 주며, 어떤 평가액에도 사용하지 않습니다.`),
            price("미국 주식 피드는 시장이 닫혀 있는 동안 업데이트되지 않으므로, 주말과 휴일에는 마감 전의 마지막 업데이트가 보입니다."),
            price(`피드가 ${f.maxDisplayAgeHours}시간 넘게 업데이트되지 않으면 Benten은 그 가격을 전혀 보여 주지 않습니다.`),
            price(`보유 탭은 가격이 최신이고, 신뢰 구간이 가격의 ${f.maxValueConfidencePercent}% 이내이며, 토큰 1개와 피드의 관계를 Benten이 확인한 경우에만 평가액(수량 × 참고 가격)을 보여 줍니다. 그렇지 않으면 평가액을 보여 주지 않는 이유를 밝힙니다.`),
          ],
        },
        {
          id: "none",
          heading: price("참고 가격이 없을 때"),
          body: [price("Pyth 피드가 없는 토큰이 있고, 읽기가 실패할 수도 있습니다. 그러면 Benten은 그 사실을 말로 밝힙니다. 0이나 숫자 대신 대시, 또는 다른 수치를 보여 주지 않습니다.")],
        },
      ],
    },
    "self-custody": {
      title: "지갑에서 하는 승인",
      description: "Benten에서의 구매가 본인의 지갑으로 어떻게 이루어지는지, Benten이 대신 실행할 수 없는 이유, 트랜잭션 확정을 확인하는 방법.",
      heading: "지갑에서 하는 승인",
      lead: ["Benten에서는 서명과 전송을 본인의 지갑이 합니다. Benten은 트랜잭션을 준비하고 지갑에 그것을 보여 주도록 요청합니다. 승인하지 않으면 아무 일도 일어나지 않습니다."],
      sections: [
        {
          id: "approve",
          heading: "승인이 이루어지는 순서",
          ordered: true,
          items: [
            "Benten은 확인한 스왑 미리보기로 서명되지 않은 스왑 하나를 만들어 지갑에 넘깁니다.",
            "지갑이 트랜잭션과 SOL로 된 네트워크 수수료를 보여 줍니다.",
            "승인하면 지갑이 트랜잭션에 서명하고 Solana로 전송합니다.",
          ],
        },
        {
          id: "cannot",
          heading: "Benten이 할 수 없는 일",
          quiet: true,
          items: [
            "Benten은 키를 갖고 있지 않으므로 귀하를 대신해 트랜잭션에 서명하거나 전송할 수 없습니다.",
            "지갑이 전송한 뒤의 트랜잭션을 Benten이 취소하거나 되돌릴 수 없습니다.",
            "연결하면 지갑 주소가 이 페이지에 전달되고, Benten이 지갑에 승인을 요청할 수 있게 됩니다. Benten이 자금을 옮길 수 있게 되는 것은 아닙니다.",
          ],
        },
        {
          id: "once",
          heading: "요청은 한 번, 전송도 한 번",
          body: [
            purchase("Benten은 지갑에 한 번만 전송을 요청하며 다시 보내지 않습니다. 구매가 전송되었는지 확실하지 않으면 다시 구매하지 마세요. 먼저 지갑의 활동 기록이나 Solana Explorer를 확인하세요."),
            purchase("지갑이 오류를 보고하면 트랜잭션이 전송되었는지 알 수 없습니다. Benten은 그 구매를 알 수 없음으로 표시하고, 지갑에 다시 전송을 요청하지 않습니다."),
          ],
        },
        {
          id: "finalized",
          heading: "도착했는지 확인하기",
          body: [
            "Solana는 네트워크가 되돌려지지 않는 단계까지 확인한 트랜잭션을 확정됨(finalized)으로 표시합니다.",
            purchase("Benten은 트랜잭션이 확정되었을 때에만 구매를 완료로 표시하며, 받은 수량은 확정된 트랜잭션의 토큰 잔액으로 측정합니다."),
            `활동 탭의 '${l.checkAgain}'은 서명의 상태를 Solana에 한 번 묻습니다. 서명을 Solana Explorer에서 열 수도 있습니다. 활동 기록은 이 브라우저에 서명을 보관하므로 나중에 다시 확인할 수 있습니다.`,
          ],
        },
      ],
    },
  },
  legal: {
    terms: {
      title: "이용 조건",
      description: "현재 작동 방식에 따른 Benten 이용 조건.",
      heading: "이용 조건",
      lead: ["이 페이지는 현재 작동 방식에 따라 Benten을 어떻게 이용할 수 있는지 설명합니다. 법적 검토를 거친 계약서가 아니라 알기 쉬운 요약이며, 바뀔 수 있습니다."],
      sections: [
        { id: "service", heading: "Benten이 제공하는 것", body: ["Benten은 정보와 도구를 제공하는 서비스입니다. 기업과 Solana 토큰에 대한 공개 데이터를 보여 주고, USDC, SOL 또는 SKR로 지불하는 NVDAx로의 스왑을 본인의 지갑이 승인하도록 준비할 수 있습니다."] },
        { id: "no-warranty", heading: "보증 없음", body: ["Benten은 있는 그대로, 어떠한 보증도 없이 제공됩니다. 데이터는 Benten이 검증, 감사, 보증하지 않는 공개 출처에서 나오며, 불완전하거나 늦거나 틀리거나 나중에 정정될 수 있습니다. 서비스의 어느 부분이든 언제든 바뀌거나 일시 중지되거나 종료될 수 있습니다."] },
        { id: "not-advice", heading: negation("투자 자문이 아닙니다"), body: [negation("Benten의 어떤 내용도 투자 자문, 추천, 가치평가, 또는 자산을 사고팔자는 제안이 아닙니다.")] },
        {
          id: "availability",
          heading: "이용할 수 있는 지역",
          body: [
            "Benten은 어느 국가에서든 이용할 수 있다고 보장하지 않으며, 거주하는 곳에서 귀하가 토큰을 보유할 수 있는지도 확인하지 않습니다.",
            "토큰 발행사는 각자 제한을 정합니다. NVDAx의 발행사는 미국인에게 판매하거나 인도하는 것을 허용하지 않습니다. 귀하에게 적용되는 규칙을 따르는 것은 귀하의 책임입니다.",
          ],
        },
        {
          id: "approval",
          heading: "승인은 귀하가 결정합니다",
          body: [
            "각 트랜잭션을 승인할지는 본인의 지갑에서 귀하가 결정합니다. 승인 전에 스왑 미리보기와 지갑의 요청 내용을 확인하세요. 지갑이 전송한 뒤의 트랜잭션을 Benten이 취소하거나 되돌릴 수 없습니다.",
            purchase("자산을 구매, 판매, 보유하는 결정은 전적으로 귀하의 재량과 위험 부담으로 이루어집니다."),
          ],
        },
        { id: "others", heading: "다른 곳이 운영하는 서비스", body: ["귀하의 지갑, Solana 네트워크, Pyth, xStocks와 PreStocks 같은 토큰 발행사, 그 밖에 Benten이 읽는 출처는 각자의 조건에 따라 다른 곳이 운영합니다. Benten은 이를 관리하지 않습니다."] },
        { id: "disclaimer", heading: "면책 조항", body: ["Benten의 모든 이용에는 면책 조항이 적용됩니다."], link: { label: "면책 조항", target: { kind: "legal", document: "disclaimer" } } },
      ],
    },
    privacy: {
      title: "개인정보",
      description: "Benten이 브라우저에 보관하는 것, 서버를 거치는 것, 요청을 받는 다른 곳, 기록을 지우는 방법.",
      heading: "개인정보",
      lead: ["Benten에는 계정이 없고, 페이지는 쿠키를 설정하지 않습니다. 이 페이지는 Benten이 보관하는 것, 보관 위치, 그리고 요청을 받는 다른 곳을 밝힙니다."],
      sections: [
        {
          id: "browser",
          heading: "이 브라우저에만 보관하는 것",
          body: ["Benten은 다음을 이 기기의 브라우저 저장소에 보관합니다. Benten으로 전송되지 않습니다."],
          items: [
            purchase(`구매 기록(최대 ${f.activityMaxRecords}건): 구매마다 지갑 주소, Solana 네트워크, 토큰과 수량, 시각, 지갑이 돌려준 뒤의 서명, 상태.`),
            `마지막으로 연결한 지갑의 이름(예: Phantom). 새로고침 뒤 다시 연결하기 위한 것이며 주소가 아닙니다. '${l.disconnect}'으로 삭제됩니다.`,
            `Android에서 Mobile Wallet Adapter로 연결하면, 다시 묻지 않고 재연결할 수 있도록 그 라이브러리가 지갑 앱의 승인을 저장합니다. 내용은 지갑 주소, Solana 네트워크, 지갑 앱이 발급한 승인 토큰입니다. '${l.disconnect}'으로 삭제됩니다.`,
            "한 번의 방문 동안만, 불러오지 못한 페이지의 주소. 새로고침을 한 번만 하기 위한 것이며, 페이지를 불러오면 삭제됩니다.",
          ],
          after: [
            "Benten은 언어를 저장하지 않습니다. 언어는 /ko처럼 페이지 주소의 일부입니다.",
            "보유 토큰은 새로고침할 때마다 다시 읽고, 열려 있는 페이지의 메모리에만 둡니다. 저장하지 않습니다.",
          ],
        },
        {
          id: "server",
          heading: "Benten 서버를 거치는 것",
          body: ["다음 두 종류의 요청이 Benten 서버를 거칩니다."],
          items: [
            purchase("Solana 읽기: 결제에 사용하는 토큰의 잔액, 스왑 미리보기, 보유 토큰, 구매 상태. 서버는 각 읽기를 Solana RPC 제공자에게 중계합니다. 이 요청에는 지갑 주소가 들어 있고, 상태를 확인할 때는 트랜잭션의 서명도 들어 있습니다."),
            price("참고 가격: 페이지가 보여 주는 Pyth 피드를 서버에 요청하고, 서버가 Solana에서 읽습니다. 이 요청에는 지갑 정보가 들어 있지 않습니다."),
          ],
          after: [
            "Benten 서버 코드는 요청이나 응답의 본문을 로그에 기록하지 않습니다. Solana 읽기는 쿠키나 식별할 수 있는 헤더 없이 중계합니다.",
            `과도한 이용을 막기 위해 서버는 네트워크 주소별 Solana 읽기 횟수를 ${f.rateLimitWindowSeconds}초 단위로 메모리에서 셉니다. Benten을 호스팅하는 서비스가 자체적으로 접속 기록을 남길 수 있으며, 이는 Benten 코드가 관리하지 않습니다.`,
          ],
        },
        {
          id: "others",
          heading: "요청을 받는 다른 곳",
          items: [
            "이 사이트 운영자가 고른 Solana RPC 제공자는 중계된 Solana 읽기를 지갑 주소와 함께 받습니다.",
            "귀하의 지갑은 승인을 요청받은 각 트랜잭션을 받고, 승인하면 자체 연결을 통해 Solana로 전송합니다. 지갑에는 지갑 자체의 개인정보 조건이 적용됩니다.",
            "Solana 네트워크에서는 전송된 모든 트랜잭션이 지갑 주소와 수량을 포함해 공개되고 영구히 남습니다.",
            "Solana Explorer는 그 링크를 열 때 귀하의 요청을 받습니다.",
            "Android에서 Mobile Wallet Adapter로 지갑을 연결하면 그 라이브러리 자체의 화면이 표시될 수 있으며, 이 화면은 Google Fonts에서 Inter Tight 글꼴을 불러옵니다. 이때 Google은 귀하의 네트워크 주소와 이 사이트의 주소가 담긴 요청을 받지만, 지갑 정보는 받지 않습니다.",
          ],
        },
        {
          id: "delete",
          heading: "기록 지우기",
          items: [
            purchase(`활동 탭의 '${l.clearHistory}'로 이 브라우저에서 구매 기록을 삭제할 수 있습니다.`),
            `지갑 메뉴의 '${l.disconnect}'으로 기억된 지갑 이름과, Android에서는 Mobile Wallet Adapter 승인이 삭제됩니다.`,
            "브라우저 설정에서 이 사이트의 데이터를 지우면 Benten이 이 브라우저에 보관한 모든 것이 삭제됩니다.",
            "Solana로 전송된 것은 Benten도, 다른 누구도 삭제할 수 없습니다.",
          ],
        },
      ],
    },
    disclaimer: {
      title: "면책 조항",
      description: "Benten은 정보와 도구를 제공합니다. 보여 주는 것은 사실 데이터와 그 한계입니다.",
      heading: "면책 조항",
      lead: [negation("Benten은 정보와 도구를 제공하는 서비스입니다. 어떤 종류의 투자 자문, 추천, 가치평가, 미래 예측도 제공하지 않으며, 보여 주는 어떤 것도 자산을 사거나 팔거나 보유하라는 제안, 권유 또는 지지가 아닙니다.")],
      sections: [
        { id: "data", heading: "데이터에 대하여", body: ["Benten이 제공하는 재무 사실과 데이터는 해당 기업의 공개 공시에서 가져온 것입니다. Benten은 그 데이터의 정확성, 완전성, 적시성을 검증, 감사, 보증하지 않으며, 데이터는 불완전하거나 늦거나 정정될 수 있습니다."] },
        {
          id: "decisions",
          heading: "귀하의 결정",
          body: [
            purchase("Benten이 언급하는 토큰화된 상품을 포함해 자산을 구매, 판매, 보유하거나 그 밖의 행동을 하는 결정은 전적으로 귀하의 재량과 위험 부담으로 이루어집니다."),
            negation("Benten과 그 기여자는 이 서비스를 통해 제공된 정보에 의존해 생긴 어떠한 손실이나 손해에 대해서도 책임을 지지 않습니다."),
          ],
        },
        { id: "before-you-buy", heading: purchase(PURCHASE_NOTICE_COPY.ko.heading), body: [purchase("구매할 때마다 구매 화면은 다음 네 문장을 보여 줍니다.")], items: noticeItems(PURCHASE_NOTICE_COPY.ko) },
      ],
    },
  },
});

const zhHans = (f: PageFacts, l: PageLabels): PagesCopy => ({
  about: {
    title: "关于 Benten",
    description: "Benten 是什么、它从不做的事、数据来源，以及代码的许可。",
    heading: "关于 Benten",
    lead: ["Benten 显示你可以在 Solana 上持有哪些公司、通过哪种代币，以及这种代币是什么。它从公司出发，而不是从代币列表出发。"],
    sections: [
      {
        id: "what",
        heading: "Benten 做什么",
        items: [
          "为每家公司列出引用它的 Solana 代币，并注明每种代币的提供方，以及一句话说明这种代币给你什么。",
          "展示附带来源的事实：美国上市公司来自 SEC 文件；没有文件时，来自提供方自己的说明。",
          "显示每种代币的准确身份，即它的铸币地址，便于你在钱包中核对。",
          purchase("只允许你通过一条固定路径购买一种代币：NVIDIA（NVDAx）。购买由你在自己的钱包中批准并发送。"),
        ],
      },
      {
        id: "never",
        heading: "Benten 从不做的事",
        quiet: true,
        items: [
          "从不保管你的密钥、助记词或资金。",
          "从不为交易签名。",
          "从不发送交易。你批准后，由你的钱包发送。",
          "从不对公司或代币排名。",
          negation(PURCHASE_NOTICE_COPY["zh-Hans"].notAdvice),
        ],
      },
      {
        id: "sources",
        heading: "数据来源",
        items: [
          "SEC EDGAR：美国上市公司的名称和报告的数字，每项都附有来源文件。",
          "xStocks 代币列表：每种 xStock 的代码、铸币地址，以及它跟踪的公司或基金。",
          "PreStocks：该公司的非上市公司代币，以及它对每种代币的说明。",
          price("Pyth：参考价格，从 Solana 上的 Pyth 价格账户读取。"),
          "Solana：代币身份、你的代币余额和你的交易，从网络读取。",
        ],
        after: ["Benten 不核实、不审计、不保证这些数据。它们可能不完整、有延迟或之后被更正。"],
      },
      {
        id: "records",
        heading: "记录留在这个浏览器中",
        body: [purchase("Benten 只把购买记录保存在你进行购买的浏览器中。钱包应用的内置浏览器和手机浏览器的记录是分开的。")],
        link: { label: "隐私", target: { kind: "legal", document: "privacy" } },
      },
      {
        id: "connect",
        heading: "在 Claude 或 ChatGPT 中使用 Benten",
        body: ["支持添加远程 MCP 服务器的聊天应用，可以通过下面的地址使用 Benten 的工具。无需账户或密钥，读取的是与本站相同的公开数据。"],
        ordered: true,
        items: [
          "在 Claude 中，打开设置中的连接器，选择添加自定义连接器，然后粘贴该地址。",
          "在 ChatGPT 中，在设置的应用与连接器下的高级设置里开启开发者模式，然后用该地址创建一个无需身份验证的连接器。",
        ],
        after: [purchase("当你在聊天中要求购买 NVDAx 时，它可以给你一个已填好金额的 Benten 购买页面链接。你在该页面自行连接钱包并批准。聊天不会签名或发送任何内容。")],
      },
      {
        id: "source-code",
        heading: "开源",
        body: ["Benten 的源代码采用 MIT License 许可。"],
      },
    ],
    sourceCode: "查看源代码",
    mcpAddress: "MCP 服务器地址",
  },
  learn: {
    xstocks: {
      title: "什么是 xStock",
      description: "xStock 代币跟踪什么、你持有什么和不持有什么，以及显示倍数如何运作。",
      heading: "什么是 xStock",
      lead: ["xStock 是跟踪一家上市公司或一只基金的一股的 Solana 代币。发行人是泽西公司 Backed Assets (JE) Limited。"],
      sections: [
        {
          id: "own",
          heading: "你持有的是什么",
          body: [
            "你持有的是代币，而不是股票本身。发行人将每个 xStock 描述为一种跟踪凭证，提供对该股票的经济敞口，不赋予股东投票权。",
            "代币的身份是它的铸币地址。名称相同但铸币地址不同，就是不同的代币。Benten 的每个产品页面都显示完整的铸币地址，便于你与钱包中的显示比较。",
          ],
          sources: ["xstocks-legal-overview"],
        },
        {
          id: "restrictions",
          heading: "谁可以持有",
          body: [
            "发行人规定，xStocks 不得向美国人士或在美国境内发售、出售或交付，只能交付给非美国人士。",
            "Benten 不核实你是否具备资格，也不保证你所在的国家或地区可以使用 Benten。",
          ],
          sources: ["backed-restricted-countries", "xstocks-legal-overview"],
        },
        {
          id: "multiplier",
          heading: "显示倍数",
          body: [
            "Solana 上的 xStocks 使用名为 Scaled UI Amount 的代币功能，NVDAx 也是如此。发行人为代币设定一个倍数，钱包显示的是代币原始数量乘以该倍数。",
            "倍数变化时，你账户中的原始数量不会改变。发行人可以安排新的倍数在设定的时间生效，因此即使没有任何转账，钱包显示的数量也可能改变。",
            "Benten 以原始数量作为记录，并在显示数量时从代币读取倍数。应用这个倍数后，一个代币跟踪一股。",
          ],
          sources: ["xstocks-multipliers"],
        },
        {
          id: "in-benten",
          heading: "Benten 中的 xStocks",
          body: [purchase("Benten 列出其登记册中的 xStocks，其中只有 NVDAx 可以购买。其他 xStock 仅供你查看。")],
        },
      ],
    },
    prestocks: {
      title: "什么是 PreStocks 代币",
      description: "PreStocks 如何说明其代币、哪些情况未知，以及应当查看的代币控制功能。",
      heading: "什么是 PreStocks 代币",
      lead: ["PreStocks 代币是 PreStocks 为 OpenAI、SpaceX 等非上市公司发行的 Solana 代币。"],
      sections: [
        {
          id: "claim",
          heading: "PreStocks 的说法",
          body: [
            price("PreStocks 称，每种代币由通过特殊目的载体（SPV）获得的敞口 1:1 支持，该敞口跟踪相关非上市公司的价格。"),
            "SPV 是为特定目的设立的独立法律实体。代币不是该公司的股票，Benten 未核实 PreStocks 的说法。",
          ],
        },
        {
          id: "unknown",
          heading: "Benten 不知道的情况",
          items: [
            "代币是否带来股权、投票权或赎回方式。Benten 未审阅 PreStocks 的条款，并将这些记录为未知。",
            "PreStocks 为每种代币公布的数字的币种和时间。Benten 只在代币的证据页面上显示这些数字，并注明这些未知之处。",
          ],
        },
        {
          id: "controls",
          heading: "应当查看的代币控制功能",
          body: ["用 Token-2022 程序创建的 Solana 代币，可以带有设置在铸币账户上的扩展功能。其中两项会改变持有代币的含义："],
          items: [
            "转账手续费：每次转账都会扣留一部分作为手续费，因此接收方收到的少于发送的数量。",
            "永久委托（permanent delegate）：发行人指定的地址可以在未经持有人批准的情况下，从任何持有人的账户转移或销毁代币。",
          ],
          after: ["在 Solana 浏览器中打开铸币地址，即可查看代币的扩展功能。本页不说明哪些 PreStocks 代币带有这些功能。"],
        },
        {
          id: "in-benten",
          heading: "Benten 中的 PreStocks 代币",
          body: [purchase("Benten 仅为比较而显示 PreStocks 代币，不提供购买。只有在批准前能展示其条款时才会提供。")],
        },
      ],
    },
    "reference-prices": {
      title: "什么是 Pyth 参考价格",
      description: "Pyth 参考价格从何而来、它不是什么，以及时间、置信区间和过时的含义。",
      heading: price("什么是 Pyth 参考价格"),
      lead: [price("Benten 在部分代币旁显示 Pyth 参考价格：通过 Pyth 发布的价格观测值，附有发布时间和置信区间。")],
      sections: [
        {
          id: "source",
          heading: "来源",
          body: [
            price("Pyth 是一个发布从其数据发布者处收集的价格数据的网络。Benten 读取 Solana 上的 Pyth 价格账户，并显示具名价格源的价格，例如 Pyth NVDA/USD。"),
            price("对于 xStock，价格源可能针对相关公司的一股，而不是代币本身。Benten 会在价格旁注明是哪一种。"),
          ],
        },
        {
          id: "not",
          heading: "它不是什么",
          body: [
            negation("它不是报价，不是净值，也不是你支付的价格。"),
            price("兑换中你支付和收到的数量由资金池决定，并在你批准前显示在兑换预览中。Benten 从不在兑换预览中显示参考价格，因此两者不会混淆。"),
          ],
        },
        {
          id: "time",
          heading: "时间和置信区间",
          body: [
            price("每个参考价格都带有 Pyth 发布它的时间。Benten 在价格旁显示这个时间。"),
            price("Pyth 还发布置信区间，以正负金额表示。它是 Pyth 数据所支持的价格上下范围；范围越宽，说明数据发布者之间的一致程度越低。"),
          ],
        },
        {
          id: "stale",
          heading: "不是最新时",
          body: [
            price(`最后一次更新超过 ${f.staleAfterSeconds} 秒的价格不是最新的。Benten 以"Pyth 最后更新"及其时间显示它，并且不将其用于任何估值。`),
            price("美股价格源在市场休市期间不会更新，因此在周末和节假日，你看到的是收盘前的最后一次更新。"),
            price(`如果价格源超过 ${f.maxDisplayAgeHours} 小时没有更新，Benten 完全不显示其价格。`),
            price(`只有当价格是最新的、置信区间在价格的 ${f.maxValueConfidencePercent}% 以内，并且 Benten 已核实一个代币与价格源的对应关系时，持仓页面才显示估值（数量乘以参考价格）。否则会说明为何不显示估值。`),
          ],
        },
        {
          id: "none",
          heading: price("没有参考价格时"),
          body: [price("有些代币没有 Pyth 价格源，读取也可能失败。此时 Benten 会用文字说明。它从不显示零、代替数字的横线或其他数字。")],
        },
      ],
    },
    "self-custody": {
      title: "在钱包中批准",
      description: "在 Benten 中的购买如何通过你自己的钱包完成、为什么 Benten 无法代你执行，以及如何确认交易已最终确定。",
      heading: "在钱包中批准",
      lead: ["在 Benten 中，签名和发送都由你的钱包完成。Benten 准备一笔交易，并请钱包将它展示给你。除非你批准，否则什么都不会发生。"],
      sections: [
        {
          id: "approve",
          heading: "批准的步骤",
          ordered: true,
          items: [
            "Benten 根据你查看过的兑换预览构建一笔未签名的兑换，并交给你的钱包。",
            "你的钱包显示这笔交易以及以 SOL 计的网络费用。",
            "如果你批准，钱包会为交易签名并将其发送到 Solana。",
          ],
        },
        {
          id: "cannot",
          heading: "Benten 做不到的事",
          quiet: true,
          items: [
            "Benten 不持有任何密钥，因此无法代你为交易签名或发送交易。",
            "你的钱包发送交易后，Benten 无法取消或撤回它。",
            "连接钱包会让本页面获得你的钱包地址，并让 Benten 可以请钱包批准。这并不会让 Benten 能够转移资金。",
          ],
        },
        {
          id: "once",
          heading: "一次请求，只发送一次",
          body: [
            purchase("Benten 只请钱包发送一次，从不重新发送。如果你不确定某次购买是否已发送，请不要再次购买：先查看钱包的活动记录或 Solana Explorer。"),
            purchase("如果钱包报告错误，交易可能已经发送，也可能没有。Benten 会将这次购买标记为未知，并且不会再次请钱包发送。"),
          ],
        },
        {
          id: "finalized",
          heading: "确认已到账",
          body: [
            "当网络将一笔交易确认到不会被回滚的程度时，Solana 将其标记为已最终确定（finalized）。",
            purchase("只有在交易已最终确定时，Benten 才将购买显示为完成，并根据该已最终确定交易的代币余额计算你收到的数量。"),
            `在活动页面上，"${l.checkAgain}"会向 Solana 查询一次签名的状态。你也可以在 Solana Explorer 中打开该签名。活动记录会在此浏览器中保存签名，方便你之后再次查看。`,
          ],
        },
      ],
    },
  },
  legal: {
    terms: {
      title: "使用条件",
      description: "按照 Benten 当前的运作方式说明的使用条件。",
      heading: "使用条件",
      lead: ["本页按照 Benten 当前的运作方式，说明可以如何使用它。它是一份简明的摘要，不是经过法律审阅的协议，并且可能会变更。"],
      sections: [
        { id: "service", heading: "Benten 提供什么", body: ["Benten 是一项提供信息和工具的服务。它显示关于公司和 Solana 代币的公开数据，并可以准备一种兑换（用 USDC、SOL 或 SKR 支付，兑换为 NVDAx），供你自己的钱包批准。"] },
        { id: "no-warranty", heading: "不作保证", body: ["Benten 按现状提供，不附带任何保证。其数据来自 Benten 不核实、不审计、不保证的公开来源，可能不完整、有延迟、有误或之后被更正。服务的任何部分都可能随时变更、暂停或终止。"] },
        { id: "not-advice", heading: negation("不是投资建议"), body: [negation("Benten 中的任何内容都不是投资建议、推荐、估值，也不是买入或卖出任何资产的要约。")] },
        {
          id: "availability",
          heading: "可以在哪里使用",
          body: [
            "Benten 不保证在任何国家或地区都可以使用，也不核实你在居住地是否可以持有某种代币。",
            "代币发行人各自设定限制。NVDAx 的发行人不允许将其出售或交付给美国人士。遵守适用于你的规则是你自己的责任。",
          ],
        },
        {
          id: "approval",
          heading: "是否批准由你决定",
          body: [
            "每笔交易是否批准，由你在自己的钱包中决定。批准前请查看兑换预览和钱包中的请求。你的钱包发送交易后，Benten 无法取消或撤回它。",
            purchase("购买、出售或持有任何资产的决定，都由你自行判断并自担风险。"),
          ],
        },
        { id: "others", heading: "由他人运营的服务", body: ["你的钱包、Solana 网络、Pyth、xStocks 和 PreStocks 等代币发行人，以及 Benten 读取的其他来源，都由他人按照各自的条款运营。Benten 不控制它们。"] },
        { id: "disclaimer", heading: "免责声明", body: ["免责声明适用于对 Benten 的所有使用。"], link: { label: "免责声明", target: { kind: "legal", document: "disclaimer" } } },
      ],
    },
    privacy: {
      title: "隐私",
      description: "Benten 在你的浏览器中保存什么、什么会经过其服务器、还有谁会收到你的请求，以及如何删除你的记录。",
      heading: "隐私",
      lead: ["Benten 没有账户，其页面不设置 Cookie。本页列出 Benten 保存什么、保存在哪里，以及还有谁会收到你的请求。"],
      sections: [
        {
          id: "browser",
          heading: "只保存在此浏览器中",
          body: ["Benten 把以下内容保存在此设备的浏览器存储中。它们不会发送给 Benten。"],
          items: [
            purchase(`你的购买记录（最多 ${f.activityMaxRecords} 条）：每次购买的钱包地址、Solana 网络、代币和数量、时间、钱包返回后的签名，以及状态。`),
            `你上次连接的钱包名称（例如 Phantom），以便页面在重新加载后重新连接。它不是你的地址，"${l.disconnect}"会将其删除。`,
            `在 Android 上通过 Mobile Wallet Adapter 连接后，该库会保存你的钱包应用的授权，以便页面无需再次询问即可重新连接：包括你的钱包地址、Solana 网络和钱包应用发放的授权令牌。"${l.disconnect}"会将其删除。`,
            "仅在一次访问期间，保存加载失败的页面地址，以便 Benten 只重新加载一次。页面加载后即删除。",
          ],
          after: [
            "Benten 不保存你的语言。语言是页面地址的一部分，例如 /zh-Hans。",
            "持仓在你每次刷新时重新读取，只保留在打开页面的内存中，不会保存。",
          ],
        },
        {
          id: "server",
          heading: "经过 Benten 服务器的内容",
          body: ["有两类请求经过 Benten 的服务器："],
          items: [
            purchase("Solana 读取：你用于支付的代币余额、兑换预览、你的持仓以及购买的状态。服务器将每次读取转发给一个 Solana RPC 提供方。这些请求包含你的钱包地址；查看状态时，还包含交易的签名。"),
            price("参考价格：页面向服务器请求其显示的 Pyth 价格源，服务器从 Solana 读取。这些请求不包含任何钱包信息。"),
          ],
          after: [
            "Benten 的服务器代码不会把请求或响应的正文写入日志。转发 Solana 读取时，不附带你的 Cookie 或可识别身份的请求头。",
            `为限制过度使用，服务器会在内存中按网络地址统计 Solana 读取次数，每次统计 ${f.rateLimitWindowSeconds} 秒。托管 Benten 的服务可能会保留自己的连接记录，这不受 Benten 代码控制。`,
          ],
        },
        {
          id: "others",
          heading: "还有谁会收到你的请求",
          items: [
            "本网站运营者选择的 Solana RPC 提供方会收到转发的 Solana 读取，包括你的钱包地址。",
            "你的钱包会收到每笔请你批准的交易；如果你批准，它会通过自己的连接将交易发送到 Solana。钱包自身的隐私条款适用于钱包。",
            "Solana 网络会公开并永久保留每笔已发送的交易，包括你的钱包地址和数量。",
            "你打开 Solana Explorer 的链接时，它会收到你的请求。",
            "在 Android 上通过 Mobile Wallet Adapter 连接钱包时，可能会显示该库自带的界面，这些界面会从 Google Fonts 加载 Inter Tight 字体。此时 Google 会收到包含你的网络地址和本网站地址的请求，但不会收到钱包信息。",
          ],
        },
        {
          id: "delete",
          heading: "删除你的记录",
          items: [
            purchase(`在活动页面上，"${l.clearHistory}"会从此浏览器中删除你的购买记录。`),
            `钱包菜单中的"${l.disconnect}"会删除记住的钱包名称，在 Android 上还会删除 Mobile Wallet Adapter 的授权。`,
            "在浏览器设置中清除本网站的数据，会删除 Benten 在此浏览器中保存的所有内容。",
            "已发送到 Solana 的内容，Benten 和其他任何人都无法删除。",
          ],
        },
      ],
    },
    disclaimer: {
      title: "免责声明",
      description: "Benten 提供信息和工具。它显示的是事实数据及其局限。",
      heading: "免责声明",
      lead: [negation("Benten 是一项提供信息和工具的服务。它不提供任何形式的投资建议、推荐、估值或前瞻性预测，它展示的任何内容都不是买入、卖出或持有任何资产的要约、招揽或认可。")],
      sections: [
        { id: "data", heading: "关于数据", body: ["Benten 提供的财务事实和数据取自相关公司的公开披露。Benten 不核实、不审计、不保证这些数据的准确性、完整性或及时性，数据可能不完整、有延迟或被更正。"] },
        {
          id: "decisions",
          heading: "你的决定",
          body: [
            purchase("购买、出售、持有或以其他方式处置任何资产（包括 Benten 提及的任何代币化工具）的决定，完全由你自行判断并自担风险。"),
            negation("对于因依赖本服务提供的信息而产生的任何损失或损害，Benten 及其贡献者概不负责。"),
          ],
        },
        { id: "before-you-buy", heading: purchase(PURCHASE_NOTICE_COPY["zh-Hans"].heading), body: [purchase("每次购买前，购买流程都会显示以下四句话：")], items: noticeItems(PURCHASE_NOTICE_COPY["zh-Hans"]) },
      ],
    },
  },
});

const zhHant = (f: PageFacts, l: PageLabels): PagesCopy => ({
  about: {
    title: "關於 Benten",
    description: "Benten 是什麼、它從不做的事、資料來源，以及程式碼的授權。",
    heading: "關於 Benten",
    lead: ["Benten 顯示你可以在 Solana 上持有哪些公司、透過哪種代幣，以及這種代幣是什麼。它從公司出發，而不是從代幣清單出發。"],
    sections: [
      {
        id: "what",
        heading: "Benten 做什麼",
        items: [
          "為每家公司列出參照它的 Solana 代幣，並註明每種代幣的提供方，以及一句話說明這種代幣給你什麼。",
          "展示附有來源的事實：美國上市公司來自 SEC 文件；沒有文件時，來自提供方自己的說明。",
          "顯示每種代幣的準確身分，也就是它的鑄幣地址，方便你在錢包中核對。",
          purchase("只讓你透過一條固定路徑購買一種代幣：NVIDIA（NVDAx）。購買由你在自己的錢包中核准並傳送。"),
        ],
      },
      {
        id: "never",
        heading: "Benten 從不做的事",
        quiet: true,
        items: [
          "從不保管你的金鑰、助記詞或資金。",
          "從不為交易簽署。",
          "從不傳送交易。你核准後，由你的錢包傳送。",
          "從不對公司或代幣排名。",
          negation(PURCHASE_NOTICE_COPY["zh-Hant"].notAdvice),
        ],
      },
      {
        id: "sources",
        heading: "資料來源",
        items: [
          "SEC EDGAR：美國上市公司的名稱和申報的數字，每項都附有來源文件。",
          "xStocks 代幣清單：每種 xStock 的代號、鑄幣地址，以及它追蹤的公司或基金。",
          "PreStocks：該公司的非上市公司代幣，以及它對每種代幣的說明。",
          price("Pyth：參考價格，從 Solana 上的 Pyth 價格帳戶讀取。"),
          "Solana：代幣身分、你的代幣餘額和你的交易，從網路讀取。",
        ],
        after: ["Benten 不核實、不稽核、不保證這些資料。它們可能不完整、有延遲或之後被更正。"],
      },
      {
        id: "records",
        heading: "紀錄留在這個瀏覽器中",
        body: [purchase("Benten 只把購買紀錄保存在你進行購買的瀏覽器中。錢包應用程式的內建瀏覽器和手機瀏覽器的紀錄是分開的。")],
        link: { label: "隱私", target: { kind: "legal", document: "privacy" } },
      },
      {
        id: "connect",
        heading: "在 Claude 或 ChatGPT 中使用 Benten",
        body: ["支援新增遠端 MCP 伺服器的聊天應用程式，可以透過下方的網址使用 Benten 的工具。不需要帳戶或金鑰，讀取的是與本站相同的公開資料。"],
        ordered: true,
        items: [
          "在 Claude 中，開啟設定中的連接器，選擇新增自訂連接器，然後貼上該網址。",
          "在 ChatGPT 中，於設定的應用程式與連接器下的進階設定開啟開發者模式，然後用該網址建立一個不需要驗證的連接器。",
        ],
        after: [purchase("當你在聊天中要求購買 NVDAx 時，它可以提供一個已填好金額的 Benten 購買頁面連結。你在該頁面自行連接錢包並核准。聊天不會簽署或傳送任何內容。")],
      },
      {
        id: "source-code",
        heading: "開放原始碼",
        body: ["Benten 的原始碼採用 MIT License 授權。"],
      },
    ],
    sourceCode: "查看原始碼",
    mcpAddress: "MCP 伺服器網址",
  },
  learn: {
    xstocks: {
      title: "什麼是 xStock",
      description: "xStock 代幣追蹤什麼、你持有什麼和不持有什麼，以及顯示倍數如何運作。",
      heading: "什麼是 xStock",
      lead: ["xStock 是追蹤一家上市公司或一檔基金的一股的 Solana 代幣。發行人是澤西公司 Backed Assets (JE) Limited。"],
      sections: [
        {
          id: "own",
          heading: "你持有的是什麼",
          body: [
            "你持有的是代幣，而不是股票本身。發行人將每個 xStock 描述為一種追蹤憑證，提供對該股票的經濟曝險，不賦予股東投票權。",
            "代幣的身分是它的鑄幣地址。名稱相同但鑄幣地址不同，就是不同的代幣。Benten 的每個產品頁面都顯示完整的鑄幣地址，方便你與錢包中的顯示比較。",
          ],
          sources: ["xstocks-legal-overview"],
        },
        {
          id: "restrictions",
          heading: "誰可以持有",
          body: [
            "發行人規定，xStocks 不得向美國人士或在美國境內發售、出售或交付，只能交付給非美國人士。",
            "Benten 不核實你是否具備資格，也不保證你所在的國家或地區可以使用 Benten。",
          ],
          sources: ["backed-restricted-countries", "xstocks-legal-overview"],
        },
        {
          id: "multiplier",
          heading: "顯示倍數",
          body: [
            "Solana 上的 xStocks 使用名為 Scaled UI Amount 的代幣功能，NVDAx 也是如此。發行人為代幣設定一個倍數，錢包顯示的是代幣原始數量乘以該倍數。",
            "倍數改變時，你帳戶中的原始數量不會改變。發行人可以安排新的倍數在設定的時間生效，因此即使沒有任何轉帳，錢包顯示的數量也可能改變。",
            "Benten 以原始數量作為紀錄，並在顯示數量時從代幣讀取倍數。套用這個倍數後，一個代幣追蹤一股。",
          ],
          sources: ["xstocks-multipliers"],
        },
        {
          id: "in-benten",
          heading: "Benten 中的 xStocks",
          body: [purchase("Benten 列出其登記冊中的 xStocks，其中只有 NVDAx 可以購買。其他 xStock 僅供你查看。")],
        },
      ],
    },
    prestocks: {
      title: "什麼是 PreStocks 代幣",
      description: "PreStocks 如何說明其代幣、哪些情況未知，以及應當查看的代幣控制功能。",
      heading: "什麼是 PreStocks 代幣",
      lead: ["PreStocks 代幣是 PreStocks 為 OpenAI、SpaceX 等非上市公司發行的 Solana 代幣。"],
      sections: [
        {
          id: "claim",
          heading: "PreStocks 的說法",
          body: [
            price("PreStocks 表示，每種代幣由透過特殊目的載體（SPV）取得的曝險 1:1 支持，該曝險追蹤相關非上市公司的價格。"),
            "SPV 是為特定目的設立的獨立法律實體。代幣不是該公司的股票，Benten 未核實 PreStocks 的說法。",
          ],
        },
        {
          id: "unknown",
          heading: "Benten 不知道的情況",
          items: [
            "代幣是否帶來股權、投票權或贖回方式。Benten 未審閱 PreStocks 的條款，並將這些記錄為未知。",
            "PreStocks 為每種代幣公布的數字的幣別和時間。Benten 只在代幣的證據頁面上顯示這些數字，並註明這些未知之處。",
          ],
        },
        {
          id: "controls",
          heading: "應當查看的代幣控制功能",
          body: ["用 Token-2022 程式建立的 Solana 代幣，可以帶有設定在鑄幣帳戶上的擴充功能。其中兩項會改變持有代幣的意義："],
          items: [
            "轉帳手續費：每次轉帳都會扣留一部分作為手續費，因此接收方收到的少於傳送的數量。",
            "永久委派（permanent delegate）：發行人指定的地址可以在未經持有人核准的情況下，從任何持有人的帳戶轉移或銷毀代幣。",
          ],
          after: ["在 Solana 瀏覽器中開啟鑄幣地址，即可查看代幣的擴充功能。本頁不說明哪些 PreStocks 代幣帶有這些功能。"],
        },
        {
          id: "in-benten",
          heading: "Benten 中的 PreStocks 代幣",
          body: [purchase("Benten 僅為比較而顯示 PreStocks 代幣，不提供購買。只有在核准前能展示其條款時才會提供。")],
        },
      ],
    },
    "reference-prices": {
      title: "什麼是 Pyth 參考價格",
      description: "Pyth 參考價格從何而來、它不是什麼，以及時間、信賴區間和過時的意義。",
      heading: price("什麼是 Pyth 參考價格"),
      lead: [price("Benten 在部分代幣旁顯示 Pyth 參考價格：透過 Pyth 發布的價格觀測值，附有發布時間和信賴區間。")],
      sections: [
        {
          id: "source",
          heading: "來源",
          body: [
            price("Pyth 是一個發布從其資料發布者處收集的價格資料的網路。Benten 讀取 Solana 上的 Pyth 價格帳戶，並顯示具名價格來源的價格，例如 Pyth NVDA/USD。"),
            price("對於 xStock，價格來源可能針對相關公司的一股，而不是代幣本身。Benten 會在價格旁註明是哪一種。"),
          ],
        },
        {
          id: "not",
          heading: "它不是什麼",
          body: [
            negation("它不是報價，不是淨值，也不是你支付的價格。"),
            price("兌換中你支付和收到的數量由資金池決定，並在你核准前顯示在兌換預覽中。Benten 從不在兌換預覽中顯示參考價格，因此兩者不會混淆。"),
          ],
        },
        {
          id: "time",
          heading: "時間和信賴區間",
          body: [
            price("每個參考價格都帶有 Pyth 發布它的時間。Benten 在價格旁顯示這個時間。"),
            price("Pyth 也發布信賴區間，以正負金額表示。它是 Pyth 資料所支持的價格上下範圍；範圍越寬，表示資料發布者之間的一致程度越低。"),
          ],
        },
        {
          id: "stale",
          heading: "不是最新時",
          body: [
            price(`最後一次更新超過 ${f.staleAfterSeconds} 秒的價格不是最新的。Benten 以「Pyth 最後更新」及其時間顯示它，並且不將其用於任何估值。`),
            price("美股價格來源在市場休市期間不會更新，因此在週末和假日，你看到的是收盤前的最後一次更新。"),
            price(`如果價格來源超過 ${f.maxDisplayAgeHours} 小時沒有更新，Benten 完全不顯示其價格。`),
            price(`只有當價格是最新的、信賴區間在價格的 ${f.maxValueConfidencePercent}% 以內，並且 Benten 已核實一個代幣與價格來源的對應關係時，持有頁面才顯示估值（數量乘以參考價格）。否則會說明為何不顯示估值。`),
          ],
        },
        {
          id: "none",
          heading: price("沒有參考價格時"),
          body: [price("有些代幣沒有 Pyth 價格來源，讀取也可能失敗。此時 Benten 會用文字說明。它從不顯示零、代替數字的橫線或其他數字。")],
        },
      ],
    },
    "self-custody": {
      title: "在錢包中核准",
      description: "在 Benten 中的購買如何透過你自己的錢包完成、為什麼 Benten 無法代你執行，以及如何確認交易已最終確定。",
      heading: "在錢包中核准",
      lead: ["在 Benten 中，簽署和傳送都由你的錢包完成。Benten 準備一筆交易，並請錢包將它展示給你。除非你核准，否則什麼都不會發生。"],
      sections: [
        {
          id: "approve",
          heading: "核准的步驟",
          ordered: true,
          items: [
            "Benten 根據你查看過的兌換預覽建立一筆未簽署的兌換，並交給你的錢包。",
            "你的錢包顯示這筆交易以及以 SOL 計的網路費用。",
            "如果你核准，錢包會為交易簽署並將其傳送到 Solana。",
          ],
        },
        {
          id: "cannot",
          heading: "Benten 做不到的事",
          quiet: true,
          items: [
            "Benten 不持有任何金鑰，因此無法代你為交易簽署或傳送交易。",
            "你的錢包傳送交易後，Benten 無法取消或撤回它。",
            "連接錢包會讓本頁面取得你的錢包地址，並讓 Benten 可以請錢包核准。這並不會讓 Benten 能夠轉移資金。",
          ],
        },
        {
          id: "once",
          heading: "一次請求，只傳送一次",
          body: [
            purchase("Benten 只請錢包傳送一次，從不重新傳送。如果你不確定某次購買是否已傳送，請不要再次購買：先查看錢包的活動紀錄或 Solana Explorer。"),
            purchase("如果錢包顯示錯誤，交易可能已經傳送，也可能沒有。Benten 會將這次購買標記為未知，並且不會再次請錢包傳送。"),
          ],
        },
        {
          id: "finalized",
          heading: "確認已到帳",
          body: [
            "當網路將一筆交易確認到不會被回滾的程度時，Solana 將其標記為已最終確定（finalized）。",
            purchase("只有在交易已最終確定時，Benten 才將購買顯示為完成，並根據該已最終確定交易的代幣餘額計算你收到的數量。"),
            `在活動頁面上，「${l.checkAgain}」會向 Solana 查詢一次簽章的狀態。你也可以在 Solana Explorer 中開啟該簽章。活動紀錄會在此瀏覽器中保存簽章，方便你之後再次查看。`,
          ],
        },
      ],
    },
  },
  legal: {
    terms: {
      title: "使用條件",
      description: "依照 Benten 目前的運作方式說明的使用條件。",
      heading: "使用條件",
      lead: ["本頁依照 Benten 目前的運作方式，說明可以如何使用它。它是一份簡明的摘要，不是經過法律審閱的協議，並且可能會變更。"],
      sections: [
        { id: "service", heading: "Benten 提供什麼", body: ["Benten 是一項提供資訊和工具的服務。它顯示關於公司和 Solana 代幣的公開資料，並可以準備一種兌換（用 USDC、SOL 或 SKR 支付，兌換為 NVDAx），供你自己的錢包核准。"] },
        { id: "no-warranty", heading: "不作保證", body: ["Benten 按現狀提供，不附帶任何保證。其資料來自 Benten 不核實、不稽核、不保證的公開來源，可能不完整、有延遲、有誤或之後被更正。服務的任何部分都可能隨時變更、暫停或終止。"] },
        { id: "not-advice", heading: negation("不是投資建議"), body: [negation("Benten 中的任何內容都不是投資建議、推薦、估值，也不是買入或賣出任何資產的要約。")] },
        {
          id: "availability",
          heading: "可以在哪裡使用",
          body: [
            "Benten 不保證在任何國家或地區皆可使用，也不核實你在居住地是否可以持有某種代幣。",
            "代幣發行人各自設定限制。NVDAx 的發行人不允許將其出售或交付給美國人士。遵守適用於你的規則是你自己的責任。",
          ],
        },
        {
          id: "approval",
          heading: "是否核准由你決定",
          body: [
            "每筆交易是否核准，由你在自己的錢包中決定。核准前請查看兌換預覽和錢包中的請求。你的錢包傳送交易後，Benten 無法取消或撤回它。",
            purchase("購買、出售或持有任何資產的決定，都由你自行判斷並自負風險。"),
          ],
        },
        { id: "others", heading: "由他人營運的服務", body: ["你的錢包、Solana 網路、Pyth、xStocks 和 PreStocks 等代幣發行人，以及 Benten 讀取的其他來源，都由他人依照各自的條款營運。Benten 不控制它們。"] },
        { id: "disclaimer", heading: "免責聲明", body: ["免責聲明適用於對 Benten 的所有使用。"], link: { label: "免責聲明", target: { kind: "legal", document: "disclaimer" } } },
      ],
    },
    privacy: {
      title: "隱私",
      description: "Benten 在你的瀏覽器中保存什麼、什麼會經過其伺服器、還有誰會收到你的請求，以及如何刪除你的紀錄。",
      heading: "隱私",
      lead: ["Benten 沒有帳戶，其頁面不設定 Cookie。本頁列出 Benten 保存什麼、保存在哪裡，以及還有誰會收到你的請求。"],
      sections: [
        {
          id: "browser",
          heading: "只保存在此瀏覽器中",
          body: ["Benten 把以下內容保存在此裝置的瀏覽器儲存空間中。它們不會傳送給 Benten。"],
          items: [
            purchase(`你的購買紀錄（最多 ${f.activityMaxRecords} 筆）：每次購買的錢包地址、Solana 網路、代幣和數量、時間、錢包傳回後的簽章，以及狀態。`),
            `你上次連接的錢包名稱（例如 Phantom），以便頁面在重新載入後重新連接。它不是你的地址，「${l.disconnect}」會將其刪除。`,
            `在 Android 上透過 Mobile Wallet Adapter 連接後，該程式庫會儲存你的錢包應用程式的授權，以便頁面無需再次詢問即可重新連接：包括你的錢包地址、Solana 網路和錢包應用程式發放的授權權杖。「${l.disconnect}」會將其刪除。`,
            "僅在一次造訪期間，保存載入失敗的頁面地址，以便 Benten 只重新載入一次。頁面載入後即刪除。",
          ],
          after: [
            "Benten 不保存你的語言。語言是頁面地址的一部分，例如 /zh-Hant。",
            "持有的代幣在你每次重新整理時重新讀取，只保留在開啟頁面的記憶體中，不會保存。",
          ],
        },
        {
          id: "server",
          heading: "經過 Benten 伺服器的內容",
          body: ["有兩類請求經過 Benten 的伺服器："],
          items: [
            purchase("Solana 讀取：你用於支付的代幣餘額、兌換預覽、你持有的代幣以及購買的狀態。伺服器將每次讀取轉送給一個 Solana RPC 提供方。這些請求包含你的錢包地址；查看狀態時，還包含交易的簽章。"),
            price("參考價格：頁面向伺服器請求其顯示的 Pyth 價格來源，伺服器從 Solana 讀取。這些請求不包含任何錢包資訊。"),
          ],
          after: [
            "Benten 的伺服器程式碼不會把請求或回應的內文寫入日誌。轉送 Solana 讀取時，不附帶你的 Cookie 或可識別身分的標頭。",
            `為限制過度使用，伺服器會在記憶體中依網路地址統計 Solana 讀取次數，每次統計 ${f.rateLimitWindowSeconds} 秒。託管 Benten 的服務可能會保留自己的連線紀錄，這不受 Benten 程式碼控制。`,
          ],
        },
        {
          id: "others",
          heading: "還有誰會收到你的請求",
          items: [
            "本網站營運者選擇的 Solana RPC 提供方會收到轉送的 Solana 讀取，包括你的錢包地址。",
            "你的錢包會收到每筆請你核准的交易；如果你核准，它會透過自己的連線將交易傳送到 Solana。錢包本身的隱私條款適用於錢包。",
            "Solana 網路會公開並永久保留每筆已傳送的交易，包括你的錢包地址和數量。",
            "你開啟 Solana Explorer 的連結時，它會收到你的請求。",
            "在 Android 上透過 Mobile Wallet Adapter 連接錢包時，可能會顯示該程式庫自帶的畫面，這些畫面會從 Google Fonts 載入 Inter Tight 字型。此時 Google 會收到包含你的網路位址和本網站位址的請求，但不會收到錢包資訊。",
          ],
        },
        {
          id: "delete",
          heading: "刪除你的紀錄",
          items: [
            purchase(`在活動頁面上，「${l.clearHistory}」會從此瀏覽器中刪除你的購買紀錄。`),
            `錢包選單中的「${l.disconnect}」會刪除記住的錢包名稱，在 Android 上還會刪除 Mobile Wallet Adapter 的授權。`,
            "在瀏覽器設定中清除本網站的資料，會刪除 Benten 在此瀏覽器中保存的所有內容。",
            "已傳送到 Solana 的內容，Benten 和其他任何人都無法刪除。",
          ],
        },
      ],
    },
    disclaimer: {
      title: "免責聲明",
      description: "Benten 提供資訊和工具。它顯示的是事實資料及其限制。",
      heading: "免責聲明",
      lead: [negation("Benten 是一項提供資訊和工具的服務。它不提供任何形式的投資建議、推薦、估值或前瞻性預測，它展示的任何內容都不是買入、賣出或持有任何資產的要約、招攬或認可。")],
      sections: [
        { id: "data", heading: "關於資料", body: ["Benten 提供的財務事實和資料取自相關公司的公開揭露。Benten 不核實、不稽核、不保證這些資料的準確性、完整性或及時性，資料可能不完整、有延遲或被更正。"] },
        {
          id: "decisions",
          heading: "你的決定",
          body: [
            purchase("購買、出售、持有或以其他方式處置任何資產（包括 Benten 提及的任何代幣化工具）的決定，完全由你自行判斷並自負風險。"),
            negation("對於因依賴本服務提供的資訊而產生的任何損失或損害，Benten 及其貢獻者概不負責。"),
          ],
        },
        { id: "before-you-buy", heading: purchase(PURCHASE_NOTICE_COPY["zh-Hant"].heading), body: [purchase("每次購買前，購買流程都會顯示以下四句話：")], items: noticeItems(PURCHASE_NOTICE_COPY["zh-Hant"]) },
      ],
    },
  },
});

const CATALOGS: Record<PublicWebLocale, (facts: PageFacts, labels: PageLabels) => PagesCopy> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function pagesMessagesFor(locale: PublicWebLocale, facts: PageFacts, labels: PageLabels): PagesCopy {
  return CATALOGS[locale](facts, labels);
}
