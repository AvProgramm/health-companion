import { askNutritionist } from '../../../api/nutritionist';
import { citesText } from '../../format';
import { AskCard } from '../shared/AskCard';

/**
 * Display food ideas for a typed goal, each grounded in reviewed guidance.
 *
 * Only the typed goal is sent. A suggestion fills a draft on Today, where the person
 * still reviews it, gets an estimate and confirms before anything is saved.
 */
export function NutritionistCard({ onDraft }: { onDraft: (entry: string) => void }) {
  return (
    <AskCard headingId="nutritionist-heading" inputId="nutritionist-goal" eyebrow="AI NUTRITIONIST" heading="Ideas for what to eat"
      label="What are you looking for?" placeholder="A breakfast with more fibre and less sugar" maxLength={200} buttonText="Suggest ideas"
      hint="Sends only what you type here. Leave out names and personal details. Your diary stays on this device."
      emptyError="Tell the Nutritionist what you are looking for." ask={askNutritionist} modelModes={['suggestions']}>
      {reply => reply.suggestions.length > 0 && <ul className="items">{reply.suggestions.map(suggestion => <li key={suggestion.entry} className="suggestion">
        <div><strong>{suggestion.title}</strong><p className="hint">{suggestion.entry}</p><p className="hint">{suggestion.why.text} <span className="numbers">{citesText(suggestion.why.cites)}</span></p></div>
        <button type="button" className="button button-secondary" onClick={() => onDraft(suggestion.entry)}>Use as draft</button>
      </li>)}</ul>}
    </AskCard>
  );
}
