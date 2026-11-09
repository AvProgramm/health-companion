interface NoteCardProps {
  text: string;
  onAddManually: () => void;
  onDone: () => void;
}

/**
 * Show a plain reply from the entry box, with a way to enter the food by hand instead.
 */
export function NoteCard({ text, onAddManually, onDone }: NoteCardProps) {
  return (
    <section className="card" aria-live="polite">
      <p className="body">{text}</p>
      <div className="row">
        <button type="button" className="button button-secondary" onClick={onAddManually}>Add manually</button>
        <button type="button" className="button button-quiet" onClick={onDone}>OK</button>
      </div>
    </section>
  );
}
