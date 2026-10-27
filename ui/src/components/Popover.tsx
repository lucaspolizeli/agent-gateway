import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  label: ReactNode;
  title: string;
  triggerClassName?: string;
  wide?: boolean;
  children: (close: () => void) => ReactNode;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A trigger button and a dialog under it. Focus moves into the dialog, Tab stays inside it, and closing it from
 * the keyboard or from a button inside returns focus to the trigger. A click outside closes it without moving focus.
 */
export function Popover({ label, title, triggerClassName, wide, children }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const dialog = panel.current;
    if (dialog !== null && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (anchor.current !== null && !anchor.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key === "Tab" && dialog !== null) {
        keepFocusInside(event, dialog);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  let panelClass = "popover";
  if (wide === true) {
    panelClass = "popover popover-wide";
  }

  return (
    <div className="popover-anchor" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div ref={panel} className={panelClass} role="dialog" aria-label={title} tabIndex={-1}>
          <div className="popover-title">{title}</div>
          {children(close)}
        </div>
      )}
    </div>
  );
}

function keepFocusInside(event: KeyboardEvent, dialog: HTMLElement) {
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items.at(-1);
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  } else if (!dialog.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}
