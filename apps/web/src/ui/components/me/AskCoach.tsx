import { askCoach } from '../../../api/coach';
import { citesText } from '../../format';
import { AskCard } from '../shared/AskCard';

/**
 * Display a question box answered only from reviewed health guidance.
 *
 * Only the typed question is sent. Every claim is checked against the cards it cites,
 * and the diary is never involved.
 */
export function AskCoach() {
  return (
    <AskCard headingId="coach-heading" inputId="coach-question" eyebrow="AI COACH" heading="Ask about food, sleep or activity"
      label="Your question" placeholder="How much sodium is too much in a day?" maxLength={300} buttonText="Ask"
      hint="Sends only this question. Leave out names and personal details. Your diary stays on this device."
      emptyError="Type a question first." ask={askCoach} modelMode="answer">
      {reply => reply.claims.length > 0 && <ul className="items">{reply.claims.map(claim => <li key={claim.text} className="body">{claim.text} <span className="hint numbers">{citesText(claim.cites)}</span></li>)}</ul>}
    </AskCard>
  );
}
