import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { focusFirstField } from "./focusFirstField.ts";

export function StaleNotice({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <Alert variant="warning" role="status">
      <TriangleAlertIcon />
      <AlertTitle>Changed outside the UI</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(event) => {
            const form = event.currentTarget.closest("form");
            onReload();
            focusFirstField(form);
          }}
        >
          <RefreshCwIcon />
          Reload
        </Button>
      </AlertAction>
    </Alert>
  );
}
