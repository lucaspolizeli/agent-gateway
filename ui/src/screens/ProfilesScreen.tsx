import { LayersIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Fragment, useState } from "react";
import type { GatewayConfig, ProfileStatus, ResolvedProfileView } from "../contract.ts";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chain } from "../components/Chain.tsx";
import { ConfirmAction } from "../components/ConfirmAction.tsx";
import { withFeedback } from "../components/feedback.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { ErrorBox, QueryState } from "../components/QueryState.tsx";
import { RunningBadge } from "../components/RunningBadge.tsx";
import { DetailPlaceholder, ListLink, ListPane, SplitView } from "../components/SplitView.tsx";
import { plural } from "../domain/format.ts";
import { profileState } from "../domain/health.ts";
import { emptyProfile } from "../domain/profiles.ts";
import { hintFor, profileNameProblem } from "../domain/validation.ts";
import { hrefFor, navigate, profileTabs, type ProfileTab } from "../router.ts";
import { useConfig, useConfigEdit } from "../state/config.ts";
import { useGatewayHealth } from "../state/health.ts";
import { useProfiles } from "../state/profiles.ts";
import { useSkillSets } from "../state/skills.ts";
import { confirmLeave } from "../state/unsaved.ts";
import { ProfileSpecEditor } from "./profiles/ProfileSpecEditor.tsx";
import { SecretsEditor } from "./profiles/SecretsEditor.tsx";
import { ToolsPanel } from "./profiles/ToolsPanel.tsx";

type Props = { selected?: string; tab?: ProfileTab };

export function ProfilesScreen({ selected, tab }: Props) {
  const config = useConfig();
  const profiles = useProfiles();
  const health = useGatewayHealth();
  const [creating, setCreating] = useState(false);
  const existing = Object.keys(config.data?.profiles ?? {});
  return (
    <>
      <PageHeader
        title="Profiles"
        description="One profile per company: servers, skills, tools and secrets, inherited along the chain."
        actions={<NewProfileDialog open={creating} onOpenChange={setCreating} existing={existing} />}
      />
      <QueryState query={config}>
        {(data) => (
          <SplitView
            list={
              <ProfileList
                config={data}
                views={profiles.data ?? []}
                statuses={health.statuses}
                selected={selected}
                onCreate={() => setCreating(true)}
              />
            }
            detail={<DetailPane config={data} selected={selected} tab={tab ?? "composition"} onCreate={() => setCreating(true)} />}
          />
        )}
      </QueryState>
    </>
  );
}

type NewProfileProps = { open: boolean; onOpenChange: (open: boolean) => void; existing: string[] };

function NewProfileDialog({ open, onOpenChange, existing }: NewProfileProps) {
  const [name, setName] = useState("");
  const create = useConfigEdit();
  const trimmed = name.trim();
  let problem = profileNameProblem(trimmed);
  if (problem === undefined && existing.includes(trimmed)) {
    problem = "A profile with this name already exists. Choose another name.";
  }
  const hint = hintFor(trimmed, problem);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setName("");
        create.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon />
          New profile
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (problem !== undefined || !(await confirmLeave())) {
              return;
            }
            const created = await withFeedback(
              create.mutateAsync({ op: "upsertProfile", name: trimmed, profile: emptyProfile }),
              `Profile ${trimmed} created.`,
            );
            if (created !== undefined) {
              onOpenChange(false);
              void navigate({ screen: "profiles", profile: trimmed }, { confirmed: true });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New profile</DialogTitle>
            <DialogDescription>A profile groups servers, skills and secrets. It can extend other profiles.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={hint !== undefined || create.error !== null}>
            <FieldLabel htmlFor="new-profile-name">Name</FieldLabel>
            <Input
              id="new-profile-name"
              autoFocus
              placeholder="new-company"
              value={name}
              aria-invalid={hint !== undefined}
              onChange={(event) => {
                setName(event.target.value);
                create.reset();
              }}
            />
            <FieldError>{hint ?? create.error?.message}</FieldError>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={problem !== undefined || create.isPending}>
              {create.isPending && <Spinner />}
              Create profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ListProps = {
  config: GatewayConfig;
  views: ResolvedProfileView[];
  statuses: Map<string, ProfileStatus>;
  selected?: string;
  onCreate: () => void;
};

function ProfileList({ config, views, statuses, selected, onCreate }: ListProps) {
  const names = Object.keys(config.profiles).sort();
  return (
    <ListPane label="Profiles">
      {names.length === 0 && (
        <DetailPlaceholder
          className="min-h-0 border-0 p-4"
          icon={<LayersIcon />}
          title="No profiles yet"
          description="Create your first profile."
          action={
            <Button type="button" size="sm" onClick={onCreate}>
              <PlusIcon />
              New profile
            </Button>
          }
        />
      )}
      {names.map((name) => {
        const view = views.find((candidate) => candidate.name === name);
        const missing = view?.missingSecrets.length ?? 0;
        return (
          <ListLink key={name} href={hrefFor({ screen: "profiles", profile: name })} current={name === selected}>
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
              <RunningBadge state={profileState(statuses.get(name))} />
            </span>
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <Chain chain={view?.chain ?? [name]} />
              </span>
              {missing > 0 && <Badge variant="warning">{plural(missing, "missing secret", "missing secrets")}</Badge>}
            </span>
          </ListLink>
        );
      })}
    </ListPane>
  );
}

type PaneProps = { config: GatewayConfig; selected?: string; tab: ProfileTab; onCreate: () => void };

function DetailPane({ config, selected, tab, onCreate }: PaneProps) {
  if (selected === undefined) {
    return (
      <DetailPlaceholder
        icon={<LayersIcon />}
        title="Select a profile"
        description="See a profile's composition, exposed tools and secrets."
        action={
          <Button type="button" variant="outline" onClick={onCreate}>
            <PlusIcon />
            New profile
          </Button>
        }
      />
    );
  }
  if (config.profiles[selected] === undefined) {
    return (
      <DetailPlaceholder
        icon={<LayersIcon />}
        title={`Profile ${selected} does not exist`}
        description="It may have been removed or renamed outside the UI."
      />
    );
  }
  return <ProfileDetail key={selected} name={selected} config={config} tab={tab} />;
}

export const profileTabLabels: Record<ProfileTab, string> = { composition: "Composition", tools: "Tools", secrets: "Secrets" };

function isTab(value: string): value is ProfileTab {
  return profileTabs.some((tab) => tab === value);
}

type DetailProps = { name: string; config: GatewayConfig; tab: ProfileTab };

function ProfileDetail({ name, config, tab }: DetailProps) {
  const profiles = useProfiles();
  const skillSets = useSkillSets();
  const health = useGatewayHealth();
  const remove = useConfigEdit(() => void navigate({ screen: "profiles" }, { confirmed: true }));
  const spec = config.profiles[name] ?? emptyProfile;
  const view = profiles.data?.find((candidate) => candidate.name === name);
  const status = health.statuses.get(name);
  const missing = view?.missingSecrets ?? [];
  const chain = view?.chain ?? [name];
  const counts: Record<ProfileTab, { count: number; variant: "secondary" | "warning" }> = {
    composition: { count: 0, variant: "secondary" },
    tools: { count: status?.tools.length ?? 0, variant: "secondary" },
    secrets: { count: missing.length, variant: "warning" },
  };

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <Breadcrumb>
          <BreadcrumbList>
            {chain.map((profile, index) => (
              <Fragment key={profile}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {profile !== name && <BreadcrumbLink href={hrefFor({ screen: "profiles", profile })}>{profile}</BreadcrumbLink>}
                  {profile === name && <BreadcrumbPage>{profile}</BreadcrumbPage>}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <CardTitle className="flex items-center gap-2 text-lg">
          {name}
          <RunningBadge state={profileState(status)} />
        </CardTitle>
        <CardAction>
          <ConfirmAction
            label={
              <>
                <Trash2Icon />
                Remove profile
              </>
            }
            title={`Remove profile ${name}?`}
            description="Its secrets stay on disk. Removal fails if another profile extends it or a project uses it."
            confirmLabel="Remove"
            disabled={remove.isPending}
            onConfirm={async () => {
              if (await confirmLeave()) {
                await withFeedback(remove.mutateAsync({ op: "removeProfile", name }), `Profile ${name} removed.`);
              }
            }}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs
          value={tab}
          onValueChange={(next) => {
            if (isTab(next)) {
              void navigate({ screen: "profiles", profile: name, tab: next });
            }
          }}
        >
          <TabsList>
            {profileTabs.map((id) => (
              <TabsTrigger key={id} value={id}>
                {profileTabLabels[id]}
                {counts[id].count > 0 && (
                  <Badge variant={counts[id].variant} className="h-4 px-1.5 tabular-nums">
                    {counts[id].count}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {skillSets.error !== null && (
            <ErrorBox title="Skill sets unavailable" message={skillSets.error.message} />
          )}
          <TabsContent value="composition" className="pt-2">
            <ProfileSpecEditor
              name={name}
              spec={spec}
              config={config}
              view={view}
              skillSets={(skillSets.data ?? []).map((set) => set.name)}
            />
          </TabsContent>
          <TabsContent value="tools" className="pt-2">
            <ToolsPanel profile={name} />
          </TabsContent>
          <TabsContent value="secrets" className="pt-2">
            <SecretsEditor profile={name} missing={missing} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
