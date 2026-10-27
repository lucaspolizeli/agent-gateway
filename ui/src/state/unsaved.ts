import { useEffect, useId } from "react";

export const UNSAVED_MESSAGE = "Descartar alterações não salvas?";

const dirtyForms = new Set<string>();

/** Asks before anything that would drop edits: a navigation, or an action that replaces the form. */
export function confirmLeave(): boolean {
  if (dirtyForms.size === 0) {
    return true;
  }
  return window.confirm(UNSAVED_MESSAGE);
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
