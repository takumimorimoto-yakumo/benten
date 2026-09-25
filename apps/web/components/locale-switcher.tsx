"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LOCALES, localizedPath, type Locale } from "@/lib/i18n/config";
import { LOCALE_LABELS, messagesFor } from "@/lib/i18n/messages";
export function LocaleSwitcher({ locale, pathname, navigation = false }: { locale: Locale; pathname: string; navigation?: boolean }) {
  const [hash, setHash] = useState(""); const currentPathname = usePathname() ?? pathname; const copy = messagesFor(locale).navigation;
  useEffect(() => { const update = () => setHash(window.location.hash); update(); window.addEventListener("hashchange", update); return () => window.removeEventListener("hashchange", update); }, []);
  const options = <><span className="language-switcher__label">{copy.language}</span><div className="language-switcher__options">{LOCALES.map((candidate) => {
    const target = localizedPath(candidate, currentPathname); const label = LOCALE_LABELS[candidate];
    if (candidate === locale || !target) return <span key={candidate} lang={candidate} aria-current={candidate === locale ? "page" : undefined} className="language-switcher__current">{label}{candidate === locale ? <span className="sr-only"> {copy.currentLanguage(label)}</span> : null}</span>;
    return <a key={candidate} lang={candidate} href={`${target}${hash}`}>{label}</a>;
  })}</div></>;
  return navigation ? <nav className="language-switcher" aria-label={copy.language}>{options}</nav> : <div className="language-switcher" role="group" aria-label={copy.language}>{options}</div>;
}
