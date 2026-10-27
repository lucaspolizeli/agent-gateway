import { DownloadIcon, ExternalLinkIcon, LockIcon, SearchIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";
import type { SkillOrigin, SkillSet } from "../../contract.ts";
import type { UserSkill } from "../../api/client.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { withFeedback } from "../../components/feedback.ts";
import { LoadingRows, QueryState } from "../../components/QueryState.tsx";
import { originDetail, originHints, originKinds, originLabels, type OriginKind } from "../../domain/skillOrigin.ts";
import { hrefFor } from "../../router.ts";
import { useImportSkill, useUserSkills } from "../../state/skills.ts";
import { defaultImportTarget, importedVerdict } from "./ImportDialog.tsx";

type Filter = OriginKind | "all";

const ALL: Filter = "all";

const originVariants: Record<OriginKind, ComponentProps<typeof Badge>["variant"]> = {
  hub: "default",
  managed: "secondary",
  unmanaged: "warning",
};

function isFilter(value: string): value is Filter {
  return value === ALL || originKinds.some((kind) => kind === value);
}

function matches(skill: UserSkill, filter: Filter, needle: string): boolean {
  if (filter !== ALL && skill.origin.kind !== filter) {
    return false;
  }
  if (needle === "") {
    return true;
  }
  return `${skill.name} ${skill.description} ${originDetail(skill.origin)}`.toLowerCase().includes(needle);
}

export function UserSkillsView({ sets }: { sets: SkillSet[] }) {
  const skills = useUserSkills();
  const [filter, setFilter] = useState<Filter>(ALL);
  const [search, setSearch] = useState("");
  return (
    <QueryState query={skills} loading={<LoadingRows rows={6} />}>
      {(all) => {
        const needle = search.trim().toLowerCase();
        const shown = all.filter((skill) => matches(skill, filter, needle)).sort((a, b) => a.name.localeCompare(b.name));
        const counts = new Map<Filter, number>([[ALL, all.length]]);
        for (const kind of originKinds) {
          counts.set(kind, all.filter((skill) => skill.origin.kind === kind).length);
        }
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                aria-label="Filter by origin"
                value={filter}
                onValueChange={(value) => {
                  if (isFilter(value)) {
                    setFilter(value);
                  }
                }}
              >
                <ToggleGroupItem value={ALL} className="px-3">
                  All <span className="text-muted-foreground tabular-nums">{counts.get(ALL)}</span>
                </ToggleGroupItem>
                {originKinds.map((kind) => (
                  <ToggleGroupItem key={kind} value={kind} className="px-3">
                    {originLabels[kind]} <span className="text-muted-foreground tabular-nums">{counts.get(kind)}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <span className="flex-1" />
              <div className="relative w-full sm:w-64">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  className="pl-8"
                  aria-label="Search skills"
                  placeholder="Search skills"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <OriginLegend />
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Skill</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Empty className="p-6">
                          <EmptyHeader>
                            <EmptyTitle>No skills here</EmptyTitle>
                            <EmptyDescription>No user-level skill matches the filter.</EmptyDescription>
                          </EmptyHeader>
                          <EmptyContent>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFilter(ALL);
                                setSearch("");
                              }}
                            >
                              Clear filters
                            </Button>
                          </EmptyContent>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  )}
                  {shown.map((skill) => (
                    <SkillRow key={`${skill.origin.kind}:${skill.name}`} skill={skill} sets={sets} />
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        );
      }}
    </QueryState>
  );
}

function OriginLegend() {
  return (
    <dl className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
      {originKinds.map((kind) => (
        <div key={kind} className="flex items-start gap-2">
          <dt>
            <Badge variant={originVariants[kind]}>{originLabels[kind]}</Badge>
          </dt>
          <dd>{originHints[kind]}</dd>
        </div>
      ))}
    </dl>
  );
}

function SkillRow({ skill, sets }: { skill: UserSkill; sets: SkillSet[] }) {
  return (
    <TableRow>
      <TableCell className="max-w-0 pl-4 whitespace-normal">
        <div className="font-medium">{skill.name}</div>
        <div className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</div>
      </TableCell>
      <TableCell className="w-[38%] max-w-0">
        <OriginCell origin={skill.origin} />
      </TableCell>
      <TableCell className="w-px pr-4 text-right">
        <RowAction skill={skill} sets={sets} />
      </TableCell>
    </TableRow>
  );
}

function OriginCell({ origin }: { origin: SkillOrigin }) {
  const detail = originDetail(origin);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={originVariants[origin.kind]} tabIndex={0}>
            {origin.kind === "managed" && <LockIcon data-icon="inline-start" />}
            {originLabels[origin.kind]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{originHints[origin.kind]}</TooltipContent>
      </Tooltip>
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={detail}>
        {detail}
      </span>
    </div>
  );
}

function RowAction({ skill, sets }: { skill: UserSkill; sets: SkillSet[] }) {
  switch (skill.origin.kind) {
    case "hub":
      return (
        <Button variant="ghost" size="sm" asChild>
          <a href={hrefFor({ screen: "skills", view: "hub", set: skill.origin.set, skill: skill.name })}>
            <ExternalLinkIcon />
            Open
          </a>
        </Button>
      );
    case "managed":
      return <span className="text-xs whitespace-nowrap text-muted-foreground">updated by the skills CLI</span>;
    case "unmanaged":
      return <ImportButton name={skill.name} path={skill.origin.path} sets={sets} />;
  }
}

function ImportButton({ name, path, sets }: { name: string; path: string; sets: SkillSet[] }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(() => defaultImportTarget(sets));
  const run = useImportSkill();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <DownloadIcon />
          Import
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await withFeedback(run.mutateAsync({ name, path, toSet: target }), () =>
              importedVerdict(name, target),
            );
            if (done !== undefined) {
              setOpen(false);
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={`import-${name}`}>Import {name} into</FieldLabel>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id={`import-${name}`} className="w-full">
                <SelectValue placeholder="Skill set" />
              </SelectTrigger>
              <SelectContent>
                {sets.map((set) => (
                  <SelectItem key={set.name} value={set.name}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={target === "" || run.isPending}>
              {run.isPending && <Spinner />}
              Import
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
