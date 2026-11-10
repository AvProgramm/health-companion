import type { CoachReply, CoachSource } from '../../../domain/coach/coachReply';
import type { NutritionistReply } from '../../../domain/nutrition/nutritionistReply';
import { citesText } from '../../format';
import { SourceLine } from '../shared/SourceLine';
import { PlanResultView } from '../training/PlanResultView';
import type { ChatAnswer } from './askAi';

// A session covers push, pull, legs and core
const AREA_COUNT = 4;

/**
 * Display the reviewed cards behind a reply as plain text.
 *
 * A model's reply keeps them one tap away; when the cards are the reply, they are shown outright.
 */
function Sources({ sources, open }: { sources: CoachSource[]; open: boolean }) {
  // Ignore an empty list, because a general answer has no cards behind it
  if (sources.length === 0) return null;
  const list = <ul className="items">{sources.map(source => <SourceLine key={source.number} source={source} />)}</ul>;
  return open ? list : <details><summary className="hint">Sources</summary>{list}</details>;
}

/** Display the Coach's sentences, each with the cards it cites when it has any. */
function CoachAnswer({ reply }: { reply: CoachReply }) {
  // A general answer reads as conversation; the chat's footer says once that such answers are unchecked
  if (reply.mode === 'general') {
    return <>{reply.claims.map(claim => <p key={claim.text} className="body">{claim.text}</p>)}</>;
  }

  return (
    <>
      <p className="body">{reply.message}</p>
      {reply.claims.length > 0 && <ul className="items">{reply.claims.map(claim => <li key={claim.text} className="body">{claim.text}{claim.cites.length > 0 && <> <span className="hint numbers">{citesText(claim.cites)}</span></>}</li>)}</ul>}
      <Sources sources={reply.sources} open={reply.mode === 'excerpts'} />
    </>
  );
}

/** Display food ideas, each of which can only become a draft on Today. */
function NutritionistAnswer({ reply, onDraft }: { reply: NutritionistReply; onDraft: (entry: string) => void }) {
  return (
    <>
      <p className="body">{reply.message}</p>
      {reply.suggestions.length > 0 && <ul className="items">{reply.suggestions.map(suggestion => <li key={suggestion.entry} className="suggestion">
        <div><strong>{suggestion.title}</strong><p className="hint">{suggestion.entry}</p><p className="hint">{suggestion.why.text} <span className="numbers">{citesText(suggestion.why.cites)}</span></p></div>
        <button type="button" className="button button-secondary" onClick={() => onDraft(suggestion.entry)}>Use as draft</button>
      </li>)}</ul>}
      <Sources sources={reply.sources} open={reply.mode === 'excerpts'} />
    </>
  );
}

/**
 * Display one reply in the chat, named by the role that wrote it.
 *
 * The role is shown rather than the hosted model, because the person is talking to a
 * Coach or a Nutritionist, whichever model happens to be answering today.
 */
export function ChatReply({ answer, adapted, onDraft }: { answer: ChatAnswer; adapted: boolean; onDraft: (entry: string) => void }) {
  return (
    <div className="ai-reply chat-reply">
      <span className="badge badge-estimate">{answer.role}</span>
      {answer.kind === 'coach' && <CoachAnswer reply={answer.reply} />}
      {answer.kind === 'nutritionist' && <NutritionistAnswer reply={answer.reply} onDraft={onDraft} />}
      {answer.kind === 'trainer' && <>
        {answer.reply.source === 'library' && <span className="badge badge-warn">Picked from the library</span>}
        <p className="body">{answer.reply.reason}</p>
        {answer.reply.source !== 'refused' && <>
          <p className="hint">{answer.assumed}</p>
          {adapted && <p className="hint">Adapted on this device to your saved adaptations.</p>}
          <PlanResultView result={answer.result} minutesText={String(answer.minutes)} areaCount={AREA_COUNT} />
        </>}
      </>}
    </div>
  );
}
