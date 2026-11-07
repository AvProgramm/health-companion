import { useCallback, useEffect, useMemo, useState } from 'react';
import { foodKey } from '../domain/nutrition/aggregate';
import { latestVersions } from '../domain/nutrition/foods';
import type { FoodVersion } from '../domain/nutrition/types';
import { listFoods, saveFoodVersion } from '../storage/foodsRepo';
import { openDiary } from '../storage/connection';
import { readDurability, requestDurability, type Durability } from '../storage/persistence';
import { FoodsView } from './FoodsView';
import { MeView } from './MeView';
import { readHideNumbers, writeHideNumbers } from './preferences';
import { TodayView } from './TodayView';

type Tab = 'today' | 'foods' | 'me';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'foods', label: 'Foods' },
  { id: 'me', label: 'Me' },
];

/**
 * The app shell: opens the diary, holds the saved foods and settings, and switches tabs.
 */
export function App() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [allFoods, setAllFoods] = useState<FoodVersion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [durability, setDurability] = useState<Durability>('unknown');
  const [hideNumbers, setHideNumbers] = useState(readHideNumbers);
  // Bumped after a restore or erase, so the Today screen reloads from scratch
  const [diaryVersion, setDiaryVersion] = useState(0);

  // Every food version by key (meals point at exact versions), and the newest of each for pickers
  const foods = useMemo(() => new Map(allFoods.map((food) => [foodKey(food.id, food.version), food])), [allFoods]);
  const currentFoods = useMemo(() => latestVersions(allFoods), [allFoods]);

  useEffect(() => {
    let cancelled = false;

    // Open the diary, load the foods, and ask once per launch to keep the data
    async function load() {
      try {
        const opened = await openDiary();
        const saved = await listFoods(opened);
        if (cancelled) {
          opened.close();
          return;
        }
        setDb(opened);
        setAllFoods(saved);
        const current = await readDurability();
        setDurability(current === 'best-effort' ? await requestDurability() : current);
      } catch (problem) {
        setLoadError(problem instanceof Error ? problem.message : String(problem));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Save a new food version and reload the food list.
   */
  const handleSaveFood = useCallback(
    async (food: FoodVersion) => {
      if (db === null) {
        return;
      }
      await saveFoodVersion(db, food);
      setAllFoods(await listFoods(db));
    },
    [db],
  );

  /**
   * Reload everything after a restore or erase replaced the diary.
   */
  const handleDiaryReplaced = useCallback(async () => {
    if (db === null) {
      return;
    }
    setAllFoods(await listFoods(db));
    setDiaryVersion((version) => version + 1);
  }, [db]);

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

  if (db === null) {
    return (
      <main className="page" aria-busy="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-card" />
      </main>
    );
  }

  return (
    <div className="app">
      <main className="page">
        {tab === 'today' && (
          <TodayView key={diaryVersion} db={db} foods={foods} currentFoods={currentFoods} hideNumbers={hideNumbers} durability={durability} onSaveFood={handleSaveFood} />
        )}
        {tab === 'foods' && <FoodsView currentFoods={currentFoods} hideNumbers={hideNumbers} onSaveFood={handleSaveFood} />}
        {tab === 'me' && (
          <MeView
            db={db}
            durability={durability}
            foodCount={currentFoods.length}
            hideNumbers={hideNumbers}
            onHideNumbersChange={(hide) => {
              setHideNumbers(hide);
              writeHideNumbers(hide);
            }}
            onDiaryReplaced={handleDiaryReplaced}
          />
        )}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="tab"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
