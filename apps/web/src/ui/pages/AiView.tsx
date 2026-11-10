import { useEffect, useState } from 'react';
import type { FoodVersion } from '../../domain/nutrition/types';
import type { Profile } from '../../domain/profile/profile';
import { deviceZone, localDateIn } from '../../domain/shared/dates';
import { loadWeekLines } from '../../data/diary/loadWeek';
import { AiChat } from '../components/ai/AiChat';
import { ErrorLine } from '../components/shared/NoticeLine';

interface AiViewProps {
  db: IDBDatabase;
  foods: ReadonlyMap<string, FoodVersion>;
  profile: Profile;
  onDraftEntry: (entry: string) => void;
}

/**
 * Every AI helper in one chat: the Coach, who also plans sessions, and the Nutritionist.
 *
 * Only the typed message is sent, and nothing here can save anything: an answer becomes
 * a draft or a plan the person still checks.
 */
export function AiView({ db, foods, profile, onDraftEntry }: AiViewProps) {
  const [library, setLibrary] = useState<typeof import('../../data/exerciseLibrary') | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the bundled exercise library a session is chosen from, as the Gym tab does
  useEffect(() => {
    let cancelled = false;
    import('../../data/exerciseLibrary').then(value => { if (!cancelled) setLibrary(value); }, () => { if (!cancelled) setError('The bundled exercise library could not load. Reload this tab.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <header className="masthead">
        <h1 className="title">AI</h1>
        <p className="status">One chat for questions, food ideas and sessions. Your diary stays on this device.</p>
      </header>

      <ErrorLine error={error} />
      {library !== null && <AiChat context={{ entries: library.EXERCISE_ENTRIES, profile }} onDraft={onDraftEntry} loadDiary={() => loadWeekLines(db, localDateIn(deviceZone(), new Date()), foods)} />}
    </>
  );
}
