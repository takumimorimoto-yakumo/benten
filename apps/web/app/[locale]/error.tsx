"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { isLocale, localizedPath } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";
export default function LocalizedErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { useEffect(() => undefined, []); const params = useParams<{ locale?: string }>(); const locale = isLocale(params.locale) ? params.locale : "en"; const copy = messagesFor(locale).error; return <><h1 className="page-title">{copy.heading}</h1><p className="page-lede">{copy.body}</p><p><button className="button button--primary" type="button" onClick={reset}>{copy.retry}</button> <Link href={localizedPath(locale, "/") ?? "/"}>{copy.home}</Link></p></>; }
