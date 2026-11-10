import { askCoach } from '../../../api/coach';
import { citesText } from '../../format';
import { AskCard } from '../shared/AskCard';

// A checked answer from the cards, or the model's own labelled answer
const MODEL_MODES = ['answer', 'general'] as const;

/**
 * Display a question box answered from reviewed health guidance where it exists.
 *
 * Only the typed question is sent. A claim from the cards is checked against the cards
 * it cites; with no card on the topic the model answers itself, labelled as unchecked.
 * The diary is never involved.
 */
export function AskCoach() {
  return (
    <AskCard headingId="coach-heading" inputId="coach-question" eyebrow="AI COACH" heading="Ask anything about food, sleep or activity"
      label="Your question" placeholder="How much sodium is too much in a day?" maxLength={300} buttonText="Ask"
      hint="Sends only this question. Leave out names and personal details. Your diary stays on this device."
      emptyError="Type a question first." ask={askCoach} modelModes={MODEL_MODES}>
      {reply => reply.claims.length > 0 && <ul className="items">{reply.claims.map(claim => <li key={claim.text} className="body">{claim.text}{claim.cites.length > 0 && <> <span className="hint numbers">{citesText(claim.cites)}</span></>}</li>)}</ul>}
    </AskCard>
  );
}
