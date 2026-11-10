import { useEffect, useRef, useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { readPhotoFoods } from '../../../api/photo';
import { photoEntry, type PhotoReply } from '../../../domain/dish/photoReply';
import { shrinkPhoto } from '../../../vision/shrinkPhoto';
import { useBusy } from '../../hooks/useBusy';
import { ErrorLine } from '../shared/NoticeLine';

/**
 * Offer to send one photo to a hosted vision model, which lists every food it sees.
 *
 * Send only after a tap or the device owner's remembered opt-in, and only a small copy of this
 * photo. The list only fills the entry box, so the normal estimate and confirmation still
 * decide what is saved.
 */
export function PhotoFoodsReader({ photo, autoRead, onEntry }: { photo: Blob; autoRead: boolean; onEntry: (entry: string) => void }) {
  const attempted = useRef(false);
  const allowed = useRef(autoRead);
  allowed.current = autoRead;
  const [reply, setReply] = useState<PhotoReply | null>(null);
  const { busy, error, setError, run } = useBusy();

  // Forget the last list when a new photo arrives, because it described another plate
  useEffect(() => { setReply(null); setError(null); }, [photo, setError]);

  // Start at most once for this photo, even if an opt-in changes or effects are replayed.
  useEffect(() => {
    if (autoRead && !attempted.current) handleAsk(true);
  }, [autoRead]);

  /** Shrink the photo, send it, and show the foods that came back. */
  function handleAsk(automatic = false) {
    attempted.current = true;
    void run(async () => {
      const image = await shrinkPhoto(photo);
      // Ignore a withdrawn opt-in because shrinking may finish after it was turned off.
      if (automatic && !allowed.current) return;
      setReply(await readPhotoFoods(image));
    });
  }

  return (
    <div className="ai-reply" aria-live="polite">
      <button type="button" className="button" disabled={busy} onClick={() => handleAsk()}>
        <Sparkle size={18} />{busy ? 'Reading every food…' : 'List every food with AI'}
      </button>
      <p className="hint">Sends a small copy of this photo, and nothing else, to a hosted AI model. {autoRead ? 'Automatic reading is enabled on this device.' : 'Only when you tap.'}</p>
      <ErrorLine error={error} />

      {reply !== null && <>
        {reply.mode === 'foods' && <span className="badge badge-estimate">AI photo reader</span>}
        <p className="body">{reply.message}</p>
        {reply.foods.length > 0 && <>
          <ul className="items">{reply.foods.map(food => <li key={food.entry} className="body">{food.entry}</li>)}</ul>
          <button type="button" className="button" onClick={() => onEntry(photoEntry(reply.foods))}>Put these in the entry box</button>
        </>}
      </>}
    </div>
  );
}
