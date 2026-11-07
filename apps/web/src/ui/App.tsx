import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DEMO_MILK } from '../data/demoFoods';
import { foodKey, totalNutrient } from '../domain/aggregate';
import { deviceZone, localDateIn } from '../domain/dates';
import { startMeal } from '../domain/revisions';
import type { FoodVersion, MealRevision } from '../domain/types';
import { commitRevision, confirmMeal, ensureFood, latestMeal, listFoods, listRevisions, openDiary, type CommitResult } from '../storage/db';
import { readDurability, requestDurability, type Durability } from '../storage/persistence';
import { formatTime, formatTotal } from './format';

// The one component of the Milestone 1 test meal
const MILK_COMPONENT_ID = 'milk';

type Notice = { kind: 'saved' | 'conflict' | 'error'; text: string };

// What the status line says for each answer the browser can give
const DURABILITY_TEXT: Record<Durability, string> = {
  persistent: 'Saved on this device.',
  'best-effort': 'Saved on this device. Chrome may clear it if the phone runs low on storage, so a backup option comes next.',
  unknown: 'Saved on this device. This browser did not say whether it will keep the data.',
};

/**
 * The Milestone 1 page: save one milk amount, correct it, and see it survive a restart.
 */
export function App() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [foods, setFoods] = useState<Map<string, FoodVersion>>(new Map());
  const [history, setHistory] = useState<MealRevision[]>([]);
  const [amountText, setAmountText] = useState('300');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [durability, setDurability] = useState<Durability>('unknown');

  // One key per intended save: a double tap or retry reuses it, and only a success replaces it
  const pendingKey = useRef(crypto.randomUUID());

  // The newest revision is the one the page shows and corrects
  const latest = history.at(-1);

  useEffect(() => {
    let cancelled = false;

    // Open the diary, make sure the demo label exists, and load what was saved before
    async function load() {
      try {
        const opened = await openDiary();
        await ensureFood(opened, DEMO_MILK);
        if (cancelled) {
          opened.close();
          return;
        }
        setDb(opened);
        await reload(opened);
        setDurability(await readDurability());
      } catch (error) {
        setLoadError(errorText(error));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Read the saved foods and the latest meal's history back from the database.
   */
  async function reload(database: IDBDatabase) {
    const savedFoods = await listFoods(database);
    setFoods(new Map(savedFoods.map((food) => [foodKey(food.id, food.version), food])));

    const header = await latestMeal(database);
    const revisions = header === undefined ? [] : await listRevisions(database, header.mealId);
    setHistory(revisions);

    // Start the input from the saved amount, so a correction begins from what is stored
    const savedAmount = revisions.at(-1)?.components[0]?.served.amount;
    if (savedAmount !== undefined) {
      setAmountText(String(savedAmount));
    }
  }

  /**
   * Save the first amount, or a correction of the saved one.
   */
  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (db === null || busy) {
      return;
    }

    // Check the typed amount before building a request
    const amount = Number(amountText);
    if (amountText.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      setNotice({ kind: 'error', text: 'Enter the amount in millilitres, for example 250.' });
      return;
    }

    setBusy(true);
    try {
      const now = new Date();
      const zone = deviceZone();
      let result: CommitResult;

      if (latest === undefined) {
        // First save: build revision 1 of a new meal
        const first = startMeal({
          mealId: crypto.randomUUID(),
          localDate: localDateIn(zone, now),
          zone,
          savedAt: now.toISOString(),
          operationKey: pendingKey.current,
          components: [
            {
              id: MILK_COMPONENT_ID,
              foodId: DEMO_MILK.id,
              foodVersion: DEMO_MILK.version,
              served: { amount, unit: 'mL' },
              eatenFraction: 1,
              active: true,
            },
          ],
        });
        result = await confirmMeal(db, first);
        // Ask to keep the diary once there is something worth keeping
        setDurability(await requestDurability());
      } else {
        // Correction: based on the revision currently on screen
        result = await commitRevision(db, {
          mealId: latest.mealId,
          expectedRevision: latest.revision,
          componentId: MILK_COMPONENT_ID,
          amount: { amount, unit: 'mL' },
          operationKey: pendingKey.current,
          savedAt: now.toISOString(),
        });
      }

      if (result.status === 'conflict') {
        setNotice({
          kind: 'conflict',
          text: `This changed since you opened it. Now showing revision ${result.latest.revision}; check it and save again.`,
        });
      } else {
        const verb = result.replayed ? 'Already saved as' : 'Saved';
        setNotice({ kind: 'saved', text: `${verb} revision ${result.revision.revision}.` });
        pendingKey.current = crypto.randomUUID();
      }
      await reload(db);
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  if (loadError !== null) {
    return (
      <main className="page">
        <section className="card">
          <h1 className="title">The diary could not open</h1>
          <p className="notice notice-error" role="alert">{loadError}</p>
        </section>
      </main>
    );
  }

  const milkAmount = latest?.components[0]?.served.amount;

  return (
    <main className="page">
      <header className="masthead">
        <p className="eyebrow">{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
        <h1 className="title">Health Companion</h1>
        <p className="status" role="status">
          {latest === undefined ? 'Nothing saved yet. Everything you enter stays on this device.' : DURABILITY_TEXT[durability]}
        </p>
      </header>

      <section className="card" aria-labelledby="food-heading">
        <h2 id="food-heading" className="heading">{DEMO_MILK.name}</h2>
        <p className="source">
          Label: 110.8 kcal · 8.5 g protein · 0 g added sugar per 250 mL <span className="badge">fictional fixture</span>
        </p>

        {latest === undefined ? (
          <p className="empty">Nothing logged yet. Enter how much you drank and save it.</p>
        ) : (
          <dl className="readout">
            <div>
              <dt>Revision</dt>
              <dd>{latest.revision}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{milkAmount} mL</dd>
            </div>
            <div>
              <dt>Energy</dt>
              <dd>{formatTotal(totalNutrient(latest, foods, 'kcal'), 'kcal')}</dd>
            </div>
            <div>
              <dt>Protein</dt>
              <dd>{formatTotal(totalNutrient(latest, foods, 'protein_g'), 'g')}</dd>
            </div>
            <div>
              <dt>Added sugar</dt>
              <dd>{formatTotal(totalNutrient(latest, foods, 'added_sugar_g'), 'g')}</dd>
            </div>
          </dl>
        )}

        <form className="entry" onSubmit={handleSave}>
          <label htmlFor="amount" className="label">Amount (mL)</label>
          <div className="entry-row">
            <input
              id="amount"
              className="input"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
            />
            <button type="submit" className="button" disabled={busy || db === null}>
              {busy ? 'Saving…' : latest === undefined ? 'Save milk' : 'Save correction'}
            </button>
          </div>
        </form>

        {notice !== null && (
          <p className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}
      </section>

      {history.length > 0 && (
        <section className="card" aria-labelledby="history-heading">
          <h2 id="history-heading" className="heading">History</h2>
          <ol className="history">
            {[...history].reverse().map((revision) => (
              <li key={revision.revision}>
                <span className="history-main">
                  Revision {revision.revision} · {revision.components[0]?.served.amount} mL
                </span>
                <span className="history-meta">
                  {formatTime(revision.savedAt)} · {revision.supersedes === null ? 'first save' : `replaces revision ${revision.supersedes}`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="footnote">Milestone 1 test page. Nothing leaves this device.</footer>
    </main>
  );
}

/**
 * Return an error as a sentence the page can show.
 */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
