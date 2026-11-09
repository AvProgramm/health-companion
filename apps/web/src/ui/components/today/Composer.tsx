import type { FormEvent } from 'react';
import { Plus } from '@phosphor-icons/react';

interface ComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  // True while an entry waits for review below, which folds this box away
  reviewing: boolean;
  onSubmit: (event: FormEvent) => void;
  onAddManually: () => void;
}

/**
 * Show the quick-entry box, which only collects text for the page to read.
 */
export function Composer({ text, onTextChange, reviewing, onSubmit, onAddManually }: ComposerProps) {
  return (
    <details className="composer-card card" open={!reviewing}>
      <summary><span className="composer-symbol"><Plus size={20} /></span><span><strong>Quick entry</strong><span className="hint">{reviewing ? 'Your entry is ready to review' : 'Food, movement or rest'}</span></span><span className="composer-toggle">{reviewing ? 'Expand' : 'Start here'}</span></summary>
      <form className="composer" onSubmit={onSubmit}>
        <label htmlFor="composer" className="label">What would you like to log?</label>
        <textarea
          id="composer"
          className="input composer-input"
          rows={2}
          value={text}
          placeholder={'2 weetabix and 300 ml milk\nrow 3x8 at 5kg each hand · slept 23:30 to 7'}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter makes a new line
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="row">
          <button type="submit" className="button">Review entry</button>
          <button type="button" className="button button-secondary" onClick={onAddManually}>
            Add manually
          </button>
        </div>
        <p className="hint">Nothing is saved until you confirm.</p>
      </form>
    </details>
  );
}
