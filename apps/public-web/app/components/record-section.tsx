import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * One titled section of a record page: a Card whose title is the section's
 * `h2` and whose description says where the content comes from. The same
 * frame as the Dossier's registry record.
 */
export function RecordSection({ id, heading, description, children, ...attributes }: {
  id: string;
  heading: ReactNode;
  description?: ReactNode;
  children: ReactNode;
} & Readonly<Record<`data-${string}`, string>>) {
  const headingId = `${id}-heading`;
  return (
    <Card aria-labelledby={headingId} role="region" id={id} {...attributes}>
      <CardHeader>
        <CardTitle><h2 id={headingId}>{heading}</h2></CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
