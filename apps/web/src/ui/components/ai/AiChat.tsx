import { useState, type FormEvent } from 'react';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { errorText } from '../../format';
import { ErrorLine } from '../shared/NoticeLine';
import { askAi, type ChatAnswer, type TrainerContext } from './askAi';
import { chatMemory } from './chatMemory';
import { ChatReply } from './ChatReply';

// The longest message every helper accepts
const MAX_LENGTH = 200;
// Things to try, shown before the first message
const EXAMPLES: readonly string[] = ['How much sodium is too much in a day?', 'Breakfast ideas with more fibre', 'A 30 minute workout with no equipment'];
// What the sharing switch means, said before and after it is switched on
const SHARING_OFF = 'Off, so your diary stays on this device. When on, each message also sends a short summary of your last seven days: one line per day of food, training and sleep. It goes to only one AI provider, which does not keep it by default. Your profile and photos are not sent.';
const SHARING_ON = 'On. Each message now also sends a short summary of your last seven days: one line per day of food (energy total and food names), training and sleep. It goes to only one AI provider, which does not keep it by default, and only while you are signed in. Your profile and photos are not sent. Switch this off to send only your messages.';

/** One message and what came back: an answer, an error, or nothing yet. */
interface Turn {
  id: number;
  text: string;
  answer: ChatAnswer | null;
  error: string | null;
}

/**
 * Display one chat where the Coach and the Nutritionist answer.
 *
 * A question goes with the last few messages of this chat, so a follow-up makes sense, and
 * with a summary of the last seven days only while the person has switched sharing on. The
 * chat lives in this screen's memory only: it is never saved, and it can only hand a draft to Today.
 */
export function AiChat({ context, onDraft, loadDiary }: { context: TrainerContext; onDraft: (entry: string) => void; loadDiary: () => Promise<string[]> }) {
  // Off until the person switches it on, and off again whenever this screen is reopened
  const [shareDiary, setShareDiary] = useState(false);
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const busy = turns.some(turn => turn.answer === null && turn.error === null);
  const { unableTo, avoidAreas, seatedOnly } = context.profile;
  const adapted = seatedOnly || avoidAreas.length > 0 || unableTo.length > 0;

  /** Add the message to the thread, then fill in its reply or what went wrong. */
  async function send(message: string) {
    const id = turns.length;
    setTurns(previous => [...previous, { id, text: message, answer: null, error: null }]);
    setText('');
    const settle = (change: Partial<Turn>) => setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, ...change } : turn));
    try {
      settle({ answer: await askAi(message, context, shareDiary ? await loadDiary() : [], chatMemory(turns)) });
    } catch (problem) {
      settle({ error: errorText(problem) });
    }
  }

  /** Send the typed message. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Ignore an empty box or a second message while one is waiting, because each reply is asked for alone
    if (text.trim() === '' || busy) return;
    void send(text.trim());
  }

  return (
    <section className="card ai-card chat" aria-labelledby="chat-heading">
      <div><p className="eyebrow">COACH AND NUTRITIONIST</p><h2 id="chat-heading" className="heading">Ask about food, sleep, activity or a session</h2></div>

      {turns.length === 0 && <div className="chat-examples">{EXAMPLES.map(example => <button type="button" key={example} className="button button-secondary" onClick={() => void send(example)}>{example}</button>)}</div>}

      <div className="chat-thread" aria-live="polite">{turns.map(turn => <div key={turn.id} className="chat-turn">
        <p className="chat-message">{turn.text}</p>
        {turn.answer !== null && <ChatReply answer={turn.answer} adapted={adapted} onDraft={onDraft} />}
        <ErrorLine error={turn.error} />
        {turn.answer === null && turn.error === null && <div className="skeleton skeleton-card" role="status" aria-label="Thinking" />}
      </div>)}</div>

      <label className="choice"><input type="checkbox" checked={shareDiary} onChange={event => setShareDiary(event.target.checked)} /><span>Share my last 7 days with the AI</span></label>
      <p className="hint">{shareDiary ? SHARING_ON : SHARING_OFF}</p>

      <form className="chat-form" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="chat-input">Your message</label>
        <textarea id="chat-input" className="input ai-input" maxLength={MAX_LENGTH} rows={2} value={text} placeholder="Type a message" onChange={event => setText(event.target.value)} />
        <button type="submit" className="button" disabled={busy} aria-label="Send"><PaperPlaneRight size={20} weight="fill" /></button>
      </form>
      <p className="hint">Sends the message you type with the last few messages of this chat, so a follow-up makes sense. Leave out names and personal details. Your saved profile stays on this device, and nothing here is saved.</p>
      <p className="hint">Answers without sources are general information from the AI, not checked against reviewed guidance.</p>
    </section>
  );
}
