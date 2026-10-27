import { useEffect, useId, useSyncExternalStore } from "react";

const dirtyForms = new Set<string>();

type LeaveRequest = { resolve: (leave: boolean) => void };

let request: LeaveRequest | undefined;
const listeners = new Set<() => void>();

function publish(next: LeaveRequest | undefined) {
  request = next;
  for (const listener of listeners) {
    listener();
  }
}

export function hasUnsavedChanges(): boolean {
  return dirtyForms.size > 0;
}

/**
 * Asks before anything that would drop edits: a navigation, or an action that replaces the form. Resolves at
 * once when nothing is dirty; otherwise `UnsavedChangesDialog` answers.
 */
export function confirmLeave(): Promise<boolean> {
  if (!hasUnsavedChanges()) {
    return Promise.resolve(true);
  }
  request?.resolve(false);
  return new Promise((resolve) => publish({ resolve }));
}

/** The pending question, for the one dialog that renders it. */
export function useLeaveRequest() {
  const pending = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => request,
  );
  return {
    open: pending !== undefined,
    answer: (leave: boolean) => {
      const current = request;
      publish(undefined);
      current?.resolve(leave);
    },
  };
}

/** Registers a form with unsaved edits: in-app navigation asks first, and closing the tab warns. */
export function useUnsavedGuard(dirty: boolean) {
  const id = useId();
  useEffect(() => {
    if (!dirty) {
      return;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    dirtyForms.add(id);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      dirtyForms.delete(id);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty, id]);
}
