import type { ReactNode, Ref } from "react";

/**
 * Error notice: tinted attention surface, left rule, an alert icon and a bold
 * title, so meaning never depends on colour alone. Generic, so later forms
 * can reuse it. `announce` renders it as a live alert (default).
 */
export function AlertNotice({ title, children, titleRef, announce = true }: { title: string; children?: ReactNode; titleRef?: Ref<HTMLHeadingElement>; announce?: boolean }) {
  return (
    <div className="alert-notice" role={announce ? "alert" : undefined}>
      <svg className="alert-notice__icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 5.75v5.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="10" cy="14.1" r="1.05" fill="currentColor" />
      </svg>
      <div className="alert-notice__body">
        <h3 className="alert-notice__title" ref={titleRef} tabIndex={-1}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
