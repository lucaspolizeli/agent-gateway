import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  label: ReactNode;
  title: string;
  triggerClassName?: string;
  wide?: boolean;
  children: (close: () => void) => ReactNode;
};

/** A trigger button and a panel under it; closes on Escape (refocusing the trigger) and on clicks outside. */
export function Popover({ label, title, triggerClassName, wide, children }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (anchor.current !== null && !anchor.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
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
        <div className={panelClass} role="dialog" aria-label={title}>
          <div className="popover-title">{title}</div>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
