/** A button that removes itself (Discard, Reload) would drop focus on the page body, so focus moves to the form's first field. */
export function focusFirstField(form: HTMLFormElement | null) {
  form
    ?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button[role="checkbox"]:not([disabled])')
    ?.focus();
}
