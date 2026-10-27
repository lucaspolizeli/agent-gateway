import { toast } from "sonner";

export type Verdict = {
  tone: "ok" | "warn" | "error";
  message: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

const announcers: Record<Verdict["tone"], typeof toast.success> = {
  ok: toast.success,
  warn: toast.warning,
  error: toast.error,
};

export function announce(verdict: Verdict) {
  announcers[verdict.tone](verdict.message, { description: verdict.description, action: verdict.action });
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Toasts how a mutation ended. Takes the `mutateAsync` promise rather than `mutate` callbacks, which React Query
 * drops when the component that started the mutation unmounts (a removed row, a renamed server's editor).
 * Resolves to the data, or undefined when the request failed.
 */
export async function withFeedback<T>(run: Promise<T>, judge: string | ((data: T) => Verdict)): Promise<T | undefined> {
  let data: T;
  try {
    data = await run;
  } catch (error) {
    announce({ tone: "error", message: messageOf(error) });
    return undefined;
  }
  if (typeof judge === "string") {
    announce({ tone: "ok", message: judge });
  } else {
    announce(judge(data));
  }
  return data;
}
