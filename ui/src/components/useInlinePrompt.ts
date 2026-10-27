import { useCallback, useEffect, useRef } from "react";

/**
 * Inline prompts replace their trigger, which would drop keyboard focus on the page body. This moves focus
 * to `entry` when the prompt opens and back to `trigger` when it closes.
 */
export function useInlinePrompt(open: boolean) {
  const trigger = useRef<HTMLButtonElement>(null);
  const entry = useRef<HTMLElement | null>(null);
  const entryRef = useCallback((node: HTMLElement | null) => {
    entry.current = node;
  }, []);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      entry.current?.focus();
    } else if (wasOpen.current) {
      trigger.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    return () => {
      // A confirmed removal unmounts the trigger with its row, so focus falls back to the page content.
      queueMicrotask(() => {
        if (document.activeElement === null || document.activeElement === document.body) {
          document.querySelector<HTMLElement>("main")?.focus();
        }
      });
    };
  }, []);
  return { trigger, entryRef };
}
