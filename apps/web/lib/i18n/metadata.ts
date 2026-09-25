import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";
export function metadataFor(locale: Locale): Metadata { const copy = messagesFor(locale).metadata; return { title: copy.title, description: copy.description }; }
export function stockMetadataFor(locale: Locale, ticker: string): Metadata { const base = messagesFor(locale).metadata.title; return { title: `${ticker} | ${base}`, description: messagesFor(locale).metadata.description }; }
export function providerMetadataFor(locale: Locale, symbol: string, providerName: string): Metadata { const copy = messagesFor(locale).providers.metadata; return { title: `${copy.title(symbol, providerName)} | ${messagesFor(locale).metadata.title}`, description: copy.description(symbol, providerName) }; }
export function companyMetadataFor(locale: Locale, name: string): Metadata { const copy = messagesFor(locale).company.metadata; return { title: `${copy.title(name)} | ${messagesFor(locale).metadata.title}`, description: copy.description(name) }; }
