import { useEffect, useState } from 'react';
import type { Profile } from '../../domain/profile/profile';
import { AskCoach } from '../components/me/AskCoach';
import { NutritionistCard } from '../components/meals/NutritionistCard';
import { TrainerCard } from '../components/training/TrainerCard';
import { ErrorLine } from '../components/shared/NoticeLine';

interface AiViewProps {
  profile: Profile;
  onDraftEntry: (entry: string) => void;
}

/**
 * Every AI helper in one place: the Coach, the Nutritionist and the Trainer.
 *
 * Each sends only what is typed or picked on its own card, and none of them can save
 * anything: their answers become drafts or plans the person still checks.
 */
export function AiView({ profile, onDraftEntry }: AiViewProps) {
  const [library, setLibrary] = useState<typeof import('../../data/exerciseLibrary') | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the bundled exercise library the Trainer chooses from, as the Gym tab does
  useEffect(() => {
    let cancelled = false;
    import('../../data/exerciseLibrary').then(value => { if (!cancelled) setLibrary(value); }, () => { if (!cancelled) setError('The bundled exercise library could not load. Reload this tab.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <header className="masthead">
        <h1 className="title">AI</h1>
        <p className="status">Ask, plan and get ideas. Each card sends only what you type on it, and your diary stays on this device.</p>
      </header>

      <AskCoach />
      <NutritionistCard onDraft={onDraftEntry} />
      <ErrorLine error={error} />
      {library !== null && <TrainerCard entries={library.EXERCISE_ENTRIES} profile={profile} />}
    </>
  );
}
