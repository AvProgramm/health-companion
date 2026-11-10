import { useEffect, useState, type ChangeEvent } from 'react';
import { Camera } from '@phosphor-icons/react';
import { dishLabel, type DishFacts, type DishGuess } from '../../../domain/dish/dishModel';
import { loadDishFacts, modelIsKept, recogniseDish } from '../../../vision/recogniseDish';
import { useBusy } from '../../hooks/useBusy';
import { ErrorLine } from '../shared/NoticeLine';

// Below this the first guess was right less than about two times in three on the validation photos (experiments/vision/results/global_bands.json)
const UNSURE_BELOW = 0.5;

/** Return a probability as a whole percentage for display only. */
function percent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

/** Return a file size in whole megabytes for display only. */
function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/**
 * Suggest dishes from a photo of a plate, using a model that runs on this device.
 *
 * The photo never leaves the phone. A pick only fills the entry box, and the normal
 * review and confirmation still decide whether anything is saved. The card stays hidden
 * in a build with no model.
 */
export function PlatePhoto({ onPick }: { onPick: (dish: string) => void }) {
  const [facts, setFacts] = useState<DishFacts | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<DishGuess[] | null>(null);
  const { busy, error, run } = useBusy();
  const [kept, setKept] = useState(true);
  const [downloaded, setDownloaded] = useState<number | null>(null);

  // Find out once whether this build includes a model, and whether this device already has it
  useEffect(() => {
    let cancelled = false;
    loadDishFacts().then(value => { if (!cancelled) setFacts(value); }, () => {});
    modelIsKept().then(value => { if (!cancelled) setKept(value); }, () => {});
    return () => { cancelled = true; };
  }, []);

  // Release the preview's memory when it is replaced or the card goes away
  useEffect(() => () => { if (previewUrl !== null) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  /** Read the chosen photo, and show the suggestions. */
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    // Allow choosing the same photo again later
    event.target.value = '';

    // Ignore a cancelled camera, because there is nothing to read
    if (photo === undefined || facts === null) return;
    setGuesses(null);
    setDownloaded(null);
    setPreviewUrl(URL.createObjectURL(photo));
    await run(async () => {
      setGuesses(await recogniseDish(photo, facts, setDownloaded));
      // The model has now been fetched, so the warning no longer applies
      setKept(true);
    });
  }

  // Stay out of the way until a model is confirmed to be here
  if (facts === null) return null;

  // A kept model passes through the download step too, so only a real download is announced
  const busyLabel = !kept && downloaded !== null && downloaded < 100 ? `Downloading the food model, ${downloaded}%` : 'Looking at your plate…';

  return (
    <section className="card ai-card" aria-labelledby="plate-heading">
      <div><p className="eyebrow">ON THIS DEVICE</p><h2 id="plate-heading" className="heading">Photo of your plate</h2></div>
      <label className={`button plate-button${busy ? ' plate-button-busy' : ''}`}>
        <Camera size={20} />{busy ? busyLabel : 'Take or choose a photo'}
        <input className="visually-hidden" type="file" accept="image/*" disabled={busy} onChange={handlePhoto} />
      </label>
      <p className="hint">The photo stays on this device. Only the dish you pick is used for an estimate.</p>
      {!kept && <p className="hint">The first photo downloads the food model once, {megabytes(facts.modelBytes)}, and keeps it on this device.</p>}

      <ErrorLine error={error} />
      {previewUrl !== null && <img className="plate-preview" src={previewUrl} alt="The photo you chose" />}

      {guesses !== null && <div className="ai-reply" aria-live="polite">
        <p className="body">{guesses[0]!.probability < UNSURE_BELOW ? 'Not sure about this one. Pick the closest, or type it yourself.' : 'Which is it?'}</p>
        <div className="dish-guesses">{guesses.map(guess => <button type="button" key={guess.dish} className="button button-secondary dish-guess" onClick={() => onPick(guess.dish.replace(/_/g, ' '))}>
          <span>{dishLabel(guess.dish)}</span><span className="hint numbers">{percent(guess.probability)}</span>
        </button>)}</div>
        <p className="hint">Suggestions only, from {facts.dishes.length} food names. If yours is not here, type it in the box below.</p>
      </div>}
    </section>
  );
}
