"use client";
import Link from "next/link";
import { useEffect } from "react";
import { messagesFor } from "@/lib/i18n/messages";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { useEffect(() => undefined, []); const copy = messagesFor("en").error; return <><h1 className="page-title">{copy.heading}</h1><p className="page-lede">{copy.body}</p><p><button className="button button--primary" type="button" onClick={reset}>{copy.retry}</button> <Link href="/">{copy.home}</Link></p></>; }
