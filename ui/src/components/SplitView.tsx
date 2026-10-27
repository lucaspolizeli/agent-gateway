import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function SplitView({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">{list}{detail}</div>;
}

export function ListPane({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="gap-0 py-0 lg:sticky lg:top-16">
      <ScrollArea className="max-h-64 lg:max-h-[calc(100svh-6rem)] [&>[data-slot=scroll-area-viewport]]:max-h-[inherit]">
        <nav aria-label={label} className="flex flex-col gap-1 p-2">
          {children}
        </nav>
      </ScrollArea>
    </Card>
  );
}

type ListLinkProps = { href: string; current: boolean; children: ReactNode; className?: string };

export function ListLink({ href, current, children, className }: ListLinkProps) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // A capped list (stacked layout, long set lists) can hide the open item below its fold.
    if (current) {
      link.current?.scrollIntoView({ block: "nearest" });
    }
  }, [current]);
  return (
    <Item
      asChild
      size="sm"
      className={cn(
        "w-full min-w-0 flex-col items-stretch gap-1 px-2.5 py-2 aria-[current=page]:bg-muted aria-[current=page]:ring-1 aria-[current=page]:ring-border",
        className,
      )}
    >
      <a ref={link} href={href} aria-current={current && "page"}>
        {children}
      </a>
    </Item>
  );
}

type PlaceholderProps = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
} & Pick<ComponentProps<"div">, "className">;

export function DetailPlaceholder({ icon, title, description, action, className }: PlaceholderProps) {
  return (
    <Empty className={cn("min-h-64 border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action !== undefined && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
