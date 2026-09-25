export type VerifiedFactName = "revenue" | "net_income_parent" | "total_assets" | "total_liabilities" | "operating_cf";
export interface FilingSource {
    source_ref: string;
    form: "10-K";
    accession_number: string;
    filed_at: string;
    filing_url: string;
    source_authority: "SEC EDGAR";
}
export interface VerifiedPeriod {
    period_ref: string;
    fiscal_year: number;
    fiscal_month: number;
    period_kind: "FY";
    fact_period_type: "duration" | "instant";
    period_start: string | null;
    period_end: string;
}
export interface VerifiedReportedFact {
    kind: "verified_reported";
    value: number;
    currency: "USD";
    unit: "currency";
    scale: 1;
    period_ref: string;
    source_ref: string;
    source_concept: string;
}
export interface VerifiedFactSet {
    kind: "source_verified";
    periods: Record<string, VerifiedPeriod>;
    source_refs: Record<string, FilingSource>;
    facts: Partial<Record<VerifiedFactName, VerifiedReportedFact>>;
}
export interface VerifiedOverlayRecord {
    identity: {
        underlying_company: string;
        source: FilingSource;
    };
    fundamentals: VerifiedFactSet | null;
    statements: {
        pl: VerifiedFactSet | null;
        bs: VerifiedFactSet | null;
        cf: VerifiedFactSet | null;
    };
}
export interface VerifiedOverlayV2 {
    schema_version: "2.0";
    records: Record<string, VerifiedOverlayRecord>;
}
export interface SnapshotManifestV2 {
    schema_version: "2.0";
    artifact_revision: string;
    published_at: string;
    registry_as_of: string;
    registry_source_url: "https://docs.xstocks.fi/developers";
    financial_source_authority: "SEC EDGAR";
    registry_snapshot_sha256: string;
    legacy_financial_snapshot_sha256: string;
    verified_overlay_sha256: string;
    verified_annual_sha256: string;
    /** Revision 2.2: raw-byte SHA-256 of each statement artifact. */
    verified_statements_sha256: {
        pl: string;
        bs: string;
        cf: string;
        per_share: string;
    };
    record_counts: {
        registry: number;
        eligible: number;
        snapshot_available: number;
        source_verified: number;
        annual_years: number;
        /** Revision 2.2: published statement years, summed over the four statement artifacts. */
        statement_years: number;
    };
}
/** A manifest published before revision 2.2. */
export type SnapshotManifestV2BeforeStatements = Omit<SnapshotManifestV2, "verified_statements_sha256" | "record_counts"> & {
    record_counts: Omit<SnapshotManifestV2["record_counts"], "statement_years">;
};
export declare function validateVerifiedOverlay(input: unknown, eligibleTickers?: ReadonlySet<string>): VerifiedOverlayV2;
export declare function validateSnapshotManifest(input: unknown): SnapshotManifestV2;
export declare function validateSnapshotManifestBeforeStatements(input: unknown): SnapshotManifestV2BeforeStatements;
