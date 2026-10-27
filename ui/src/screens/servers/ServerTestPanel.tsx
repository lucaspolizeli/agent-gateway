import { CircleCheckIcon, CircleXIcon, PlugZapIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ServerTestResult } from "../../contract.ts";
import { plural } from "../../domain/format.ts";

/** Select values cannot be empty, so testing without a profile's secrets has its own value. */
export const NO_PROFILE = "~none";

type ControlsProps = {
  profiles: string[];
  profile: string;
  onProfileChange: (profile: string) => void;
  disabled: boolean;
  onRun: () => void;
};

export function TestControls({ profiles, profile, onProfileChange, disabled, onRun }: ControlsProps) {
  return (
    <>
      <Select value={profile} onValueChange={onProfileChange}>
        <SelectTrigger aria-label="Profile secrets used for the test" className="w-44">
          <span className="text-muted-foreground">Secrets from</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PROFILE}>no profile</SelectItem>
          {profiles.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" disabled={disabled} onClick={onRun}>
        <PlugZapIcon />
        Test connection
      </Button>
    </>
  );
}

export function TestResultView({ result }: { result: ServerTestResult }) {
  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>Failed after {result.durationMs} ms</AlertTitle>
        <AlertDescription className="font-mono text-xs whitespace-pre-wrap">{result.error}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <CircleCheckIcon className="text-success" />
      <AlertTitle>
        Connected in {result.durationMs} ms · {plural(result.tools.length, "tool", "tools")}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 w-full space-y-1">
          {result.tools.map((tool) => (
            <li key={tool.name} className="flex min-w-0 gap-2">
              <span className="font-mono text-foreground">{tool.name}</span>
              {tool.description !== undefined && <span className="truncate">{tool.description}</span>}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
