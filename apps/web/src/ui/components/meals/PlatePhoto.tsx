import { useEffect, useState, type ChangeEvent } from 'react';
import { Camera } from '@phosphor-icons/react';
import { dishLabel, type DishFacts, type DishGuess } from '../../../domain/dish/dishModel';
import { loadDishFacts, modelIsKept, recogniseDish } from '../../../vision/recogniseDish';
import { readAutoPhoto, writeAutoPhoto } from '../../preferences';
import { useBusy } from '../../hooks/useBusy';
import { ErrorLine } from '../shared/NoticeLine';
import { PhotoFoodsReader } from './PhotoFoodsReader';

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
 * Offer a checked food list from a photo, with an optional on-device fallback.
 *
 * The suggestions never send the photo anywhere. Listing every food with AI sends a small
 * copy, and only when tapped. Either way a pick only fills the entry box, and the normal
 * review and confirmation still decide whether anything is saved. A hosted request does not
 * need the local model to be bundled or downloaded.
 */
export function PlatePhoto({ onPick, onEntry }: { onPick: (dish: string) => void; onEntry: (entry: string) => void }) {
  const [autoRead, setAutoRead] = useState(readAutoPhoto);
  const [facts, setFacts] = useState<DishFacts | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // The chosen photo, kept so it can be sent on request
  const [photo, setPhoto] = useState<{ file: Blob; revision: number } | null>(null);
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

  /** Preview the chosen photo without downloading a model or uploading the image. */
  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    // Allow choosing the same photo again later
    event.target.value = '';

    // Ignore a cancelled camera, because there is nothing to read
    if (photo === undefined) return;
    setGuesses(null);
    setDownloaded(null);
    setPhoto(previous => ({ file: photo, revision: (previous?.revision ?? 0) + 1 }));
    setPreviewUrl(URL.createObjectURL(photo));
  }

  /** Keep automatic uploads under the device owner's control. */
  function handleAutoPhoto(enabled: boolean) {
    writeAutoPhoto(enabled);
    setAutoRead(enabled);
  }

  /** Read the plate locally only when the fallback is requested. */
  async function handleLocal() {
    // Ignore an absent photo or model because local recognition needs both.
    if (photo === null || facts === null) return;
    await run(async () => {
      setGuesses(await recogniseDish(photo.file, facts, setDownloaded));
      // The model has now been fetched, so the warning no longer applies
      setKept(true);
    });
  }

  // A kept model passes through the download step too, so only a real download is announced
  const busyLabel = !kept && downloaded !== null && downloaded < 100 ? `Downloading the food model, ${downloaded}%` : 'Looking at your plate…';

  return (
    <section className="card ai-card" aria-labelledby="plate-heading">
      <div><p className="eyebrow">FOOD FROM A PHOTO</p><h2 id="plate-heading" className="heading">Photo of your plate</h2></div>
      <label className={`button plate-button${busy ? ' plate-button-busy' : ''}`}>
        <Camera size={20} />Take or choose a photo
        <input className="visually-hidden" type="file" accept="image/*" disabled={busy} onChange={handlePhoto} />
      </label>
      <p className="hint">Choose a photo, then ask AI to list its foods. Check the names and amounts before using them. Nothing is saved here.</p>
      <label className="choice">
        <input type="checkbox" checked={autoRead} onChange={event => handleAutoPhoto(event.target.checked)} />
        Use AI automatically for photos on this device
      </label>
      <p className="hint">When enabled, choosing a photo sends a small redrawn copy to hosted AI. No diary or profile is sent. Turn this off to ask before each upload.</p>
      {previewUrl !== null && <img className="plate-preview" src={previewUrl} alt="The photo you chose" />}

      {photo !== null && <PhotoFoodsReader key={photo.revision} photo={photo.file} autoRead={autoRead} onEntry={onEntry} />}
      {facts !== null && <details>
        <summary>On-device fallback: one dish at a time</summary>
        <p className="hint">This model keeps the photo on this device. It suggests one dish, so it cannot list every food or count pieces.</p>
        {!kept && <p className="hint">The on-device fallback downloads the food model once, {megabytes(facts.modelBytes)}, and keeps it on this device.</p>}
        {photo !== null && <button type="button" className="button button-secondary local-photo-button" disabled={busy} onClick={() => void handleLocal()}>
          {busy ? busyLabel : 'Suggest a dish on this device'}
        </button>}
        <ErrorLine error={error} />
        {guesses !== null && <div className="ai-reply" aria-live="polite">
          <p className="body">{guesses[0]!.probability < UNSURE_BELOW ? 'Not sure about this one. Pick the closest, or type it yourself.' : 'Which is it?'}</p>
          <div className="dish-guesses">{guesses.map(guess => <button type="button" key={guess.dish} className="button button-secondary dish-guess" onClick={() => onPick(guess.dish.replace(/_/g, ' '))}>
            <span>{dishLabel(guess.dish)}</span><span className="hint numbers">{percent(guess.probability)}</span>
          </button>)}</div>
          <p className="hint">Suggestions only, from {facts.dishes.length} food names. If yours is not here, type it in the box below.</p>
        </div>}

      </details>}
    </section>
  );
}
