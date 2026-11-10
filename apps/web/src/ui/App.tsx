import { useCallback, useEffect, useMemo, useState } from 'react';
import { House, Barbell, BowlFood, UserCircle, Leaf, ShieldCheck, Sparkle } from '@phosphor-icons/react';
import { EMPTY_PROFILE, type Profile, type ProfileSnapshot } from '../domain/profile/profile';
import { readProfile, saveProfile } from '../data/storage/profileRepo';
import { foodKey } from '../domain/nutrition/aggregate';
import { latestVersions } from '../domain/nutrition/foods';
import type { FoodVersion } from '../domain/nutrition/types';
import { listFoods, saveFoodVersion } from '../data/storage/foodsRepo';
import { openDiary } from '../data/storage/connection';
import { readDurability, requestDurability, type Durability } from '../data/storage/persistence';
import { AiView } from './pages/AiView';
import { FirstRunSetup } from './pages/FirstRunSetup';
import { FoodsView } from './pages/FoodsView';
import { GymView } from './pages/GymView';
import { MeView } from './pages/MeView';
import { readHideNumbers, writeHideNumbers } from './preferences';
import { TodayView } from './pages/TodayView';
import { errorText } from './format';
import { ErrorLine } from './components/shared/NoticeLine';

type Tab = 'today' | 'gym' | 'foods' | 'ai' | 'me';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'gym', label: 'Gym' },
  { id: 'foods', label: 'Foods' },
  { id: 'ai', label: 'AI' },
  { id: 'me', label: 'Me' },
];

/**
 * The app shell: opens the diary, holds the saved foods and settings, and switches tabs.
 */
export function App() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [savedProfile, setSavedProfile] = useState<ProfileSnapshot | null>(null);
  const profile = savedProfile?.value ?? EMPTY_PROFILE;
  const [allFoods, setAllFoods] = useState<FoodVersion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  // Text the Nutritionist handed to the entry box; moving between tabs clears it
  const [draftEntry, setDraftEntry] = useState('');
  // Set when someone chooses to restore a backup rather than fill in the first-run screen
  const [restoringBackup, setRestoringBackup] = useState(false);
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
        const [saved, loadedProfile] = await Promise.all([listFoods(opened), readProfile(opened)]);
        if (cancelled) {
          opened.close();
          return;
        }
        setDb(opened);
        setAllFoods(saved);
        setSavedProfile(loadedProfile);
        const current = await readDurability();
        setDurability(current === 'best-effort' ? await requestDurability() : current);
      } catch (problem) {
        setLoadError(errorText(problem));
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
    setSavedProfile(await readProfile(db));
    setDiaryVersion((version) => version + 1);
  }, [db]);

  /** Confirm one local profile edit and reload the actual latest version, including retry or conflict. */
  const handleSaveProfile = useCallback(async (value: Profile, operationKey: string, expectedVersion: number) => {
    if (db === null) throw new Error('Wait for the diary to open before saving adaptations.');
    const result = await saveProfile(db, { id: 'local', version: expectedVersion + 1, operationKey, savedAt: new Date().toISOString(), value }, expectedVersion);
    setSavedProfile(await readProfile(db));
    if (result.status === 'conflict') throw new Error('Adaptations changed in another screen. Review the reloaded profile and save again.');
  }, [db]);

  // Refresh after another tab changes the profile; remount plan screens by saved revision below.
  useEffect(() => {
    if (db === null) return;
    const reload = () => { readProfile(db).then(latest => setSavedProfile(previous => JSON.stringify(previous) === JSON.stringify(latest) ? previous : latest), problem => setLoadError(errorText(problem))); };
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [db]);

  if (loadError !== null) {
    return (
      <main className="page">
        <section className="card">
          <h1 className="title">The diary could not open</h1>
          <ErrorLine error={loadError} />
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

  // Nothing else opens until height and weight are saved, unless a backup is being restored
  if (savedProfile?.value.body == null && !restoringBackup) {
    return <FirstRunSetup hideNumbers={hideNumbers} currentYear={new Date().getFullYear()} onRestoreInstead={() => { setRestoringBackup(true); setTab('me'); }}
      onSave={(body, operationKey) => handleSaveProfile({ ...profile, body }, operationKey, savedProfile?.version ?? 0)} />;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to diary</a>
      <header className="brandbar">
        <span className="brand-mark"><Leaf size={24} weight="bold" /></span>
        <div><span className="brand-name">Health Companion</span><span className="brand-caption">A little balance, every day.</span></div>
      </header>
      <main id="main-content" className="page">
        {tab === 'today' && (
          <TodayView key={diaryVersion} db={db} foods={foods} currentFoods={currentFoods} hideNumbers={hideNumbers} durability={durability} diabetes={profile.diabetes} initialEntry={draftEntry} body={profile.body ?? null} onSaveFood={handleSaveFood} />
        )}
        {tab === 'gym' && <GymView key={`${diaryVersion}:${savedProfile?.version ?? 0}`} db={db} profile={profile} hideNumbers={hideNumbers} />}
        {tab === 'foods' && <FoodsView currentFoods={currentFoods} hideNumbers={hideNumbers} onSaveFood={handleSaveFood} />}
        {tab === 'ai' && <AiView key={savedProfile?.version ?? 0} db={db} foods={foods} profile={profile} onDraftEntry={(entry) => { setDraftEntry(entry); setTab('today'); }} />}
        {tab === 'me' && (
          <MeView
            db={db}
            durability={durability}
            foodCount={currentFoods.length}
            profileSnapshot={savedProfile}
            onSaveProfile={handleSaveProfile}
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
        <span className="nav-caption">YOUR SPACE</span>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="tab"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => { setDraftEntry(''); setTab(item.id); }}
          >
            {item.id === 'today' && <House size={22} weight={tab === item.id ? 'fill' : 'regular'} />}
            {item.id === 'gym' && <Barbell size={22} weight={tab === item.id ? 'fill' : 'regular'} />}
            {item.id === 'foods' && <BowlFood size={22} weight={tab === item.id ? 'fill' : 'regular'} />}
            {item.id === 'ai' && <Sparkle size={22} weight={tab === item.id ? 'fill' : 'regular'} />}
            {item.id === 'me' && <UserCircle size={22} weight={tab === item.id ? 'fill' : 'regular'} />}
            <span>{item.label}</span>
          </button>
        ))}
        <div className="nav-footer"><ShieldCheck size={20} /><span>Your diary stays<br />on this device.</span></div>
      </nav>
    </div>
  );
}
