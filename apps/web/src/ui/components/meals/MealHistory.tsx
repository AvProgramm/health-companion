import type { FoodVersion } from '../../../domain/nutrition/types';
import type { MealRevision } from '../../../domain/meals/types';
import { describeChange } from '../../describe';
import { formatTime } from '../../format';

interface MealHistoryProps {
  history: readonly MealRevision[];
  foods: ReadonlyMap<string, FoodVersion>;
}

/**
 * Show every saved revision of a meal in words, newest first.
 */
export function MealHistory({ history, foods }: MealHistoryProps) {
  return (
    <section aria-labelledby="history-heading" className="stack">
      <h3 id="history-heading" className="label">History</h3>
      <ol className="history">
        {[...history].reverse().map((revision) => {
          const previous = history.find((other) => other.revision === revision.revision - 1);
          return (
            <li key={revision.revision}>
              <span className="history-main">{describeChange(previous, revision, foods)}</span>
              <span className="history-meta numbers">Revision {revision.revision} · {formatTime(revision.savedAt)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
