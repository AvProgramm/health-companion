import { useEffect, useId, useRef, type ReactNode } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A bottom sheet dialog: closes on Escape, on the close button or on the backdrop,
 * and returns focus to whatever opened it.
 */
export function Sheet({ title, onClose, children }: SheetProps) {
  const headingId = useId();
  const panel = useRef<HTMLDivElement>(null);

  // Keep the latest close handler without re-running the focus effect on every render
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // Move focus into the sheet, and remember where it came from
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-head">
          <h2 id={headingId} className="heading">{title}</h2>
          <button type="button" className="button button-quiet" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
