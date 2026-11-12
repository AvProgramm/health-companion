import { afterEach, expect, it, vi } from 'vitest';
import { askCoach } from './coach';

afterEach(() => vi.unstubAllGlobals());

// A fictional general answer, as the service sends it
const REPLY = { mode: 'general', message: 'Fictional message.', claims: [{ text: 'Fictional claim.', cites: [] }], sources: [], answeredBy: 'Groq' };
// One fictional diary line and one fictional earlier exchange
const LINE = '2026-01-05: fictional food logged';
const EARLIER = [{ role: 'user', text: 'Fictional breakfast ideas' }, { role: 'assistant', text: 'Fictional oats.' }] as const;

/** Return a fetch that answers with one status, recording what was sent. */
function answering(status = 200) {
  const fetchMock = vi.fn(async (_path: string, _init: RequestInit) => ({ ok: status === 200, status, json: async () => REPLY }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Return the body and credentials mode of the only request made. */
function sent(fetchMock: ReturnType<typeof answering>) {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0]![1];
  return { body: JSON.parse(String(init.body)), credentials: init.credentials };
}

it('sends a plain question alone, without the session cookie', async () => {
  const fetchMock = answering();
  await askCoach('Fictional question');
  expect(sent(fetchMock)).toEqual({ body: { question: 'Fictional question' }, credentials: 'omit' });
});

it('sends earlier messages without the session cookie', async () => {
  const fetchMock = answering();
  await askCoach('And for dinner?', [], EARLIER);
  expect(sent(fetchMock)).toEqual({ body: { question: 'And for dinner?', history: EARLIER }, credentials: 'omit' });
});

it('sends the session cookie only with diary lines', async () => {
  const fetchMock = answering();
  await askCoach('Fictional question', [LINE]);
  expect(sent(fetchMock)).toEqual({ body: { question: 'Fictional question', context: [LINE] }, credentials: 'same-origin' });
});

it('bounds earlier messages before they leave the device', async () => {
  const fetchMock = answering();
  const long = Array.from({ length: 9 }, (_, number) => ({ role: 'user' as const, text: `${number}`.repeat(600) }));
  await askCoach('Fictional question', [], long);
  const { history } = sent(fetchMock).body;
  expect(history).toHaveLength(6);
  expect(history.every((turn: { text: string }) => turn.text.length === 500)).toBe(true);
});

it('rejects more diary lines than a week before any network request', async () => {
  const fetchMock = answering();
  await expect(askCoach('Fictional question', Array.from({ length: 8 }, () => LINE))).rejects.toThrow('Only the last seven days can be shared.');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('asks the person to sign in again when the session has ended', async () => {
  answering(401);
  await expect(askCoach('Fictional question', [LINE])).rejects.toThrow('Sign in again to share your diary with the AI');
});

it('says the Coach is busy when the service has no answer', async () => {
  answering(503);
  await expect(askCoach('Fictional question', [LINE])).rejects.toThrow('The Coach has no answer right now.');
});
