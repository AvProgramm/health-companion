import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BODY_AREAS, EMPTY_PROFILE, type BodyArea, type Profile, type ProfileSnapshot } from '../domain/profile/profile';
import type { Capability } from '../domain/training/catalogue';
import { errorText } from './useSave';

/** Describe the saved version and the sole confirmed-save boundary. */
interface ProfileEditorProps {
  snapshot: ProfileSnapshot | null;
  onSave: (profile: Profile, operationKey: string, expectedVersion: number) => Promise<void>;
}

// Draw broad selectable areas, not a clinical injury diagnosis or a left/right assessment.
const MAP_ZONES: readonly [BodyArea, number][] = [['neck', 30], ['shoulders', 43], ['elbows', 65], ['wrists', 87], ['back', 76], ['hips', 100], ['knees', 130], ['ankles', 159]];

/** Display opt-in, device-only adaptations and save only on explicit confirmation. */
export function ProfileEditor({ snapshot, onSave }: ProfileEditorProps) {
  // Keep edits separate from the confirmed version used by the planners.
  const [draft, setDraft] = useState<Profile>(snapshot?.value ?? EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  useEffect(() => { setDraft(snapshot?.value ?? EMPTY_PROFILE); keys.current.clear(); }, [snapshot]);

  /** Toggle one local area without writing a profile or sending a request. */
  function toggleArea(area: BodyArea) {
    if (busy) return;
    setDraft(value => ({ ...value, avoidAreas: BODY_AREAS.filter(item => item === area ? !value.avoidAreas.includes(item) : value.avoidAreas.includes(item)) }));
  }

  /** Confirm the current draft with a stable retry key and the screen's expected version. */
  async function confirm(event: FormEvent) {
    event.preventDefault();
    // Ignore a repeated click because the current confirmation is still in flight.
    if (busy) return;
    const expectedVersion = snapshot?.version ?? 0;
    const action = `${expectedVersion}:${JSON.stringify(draft)}`;
    const operationKey = keys.current.get(action) ?? crypto.randomUUID();
    keys.current.set(action, operationKey);
    setBusy(true);
    setMessage(null);
    try {
      await onSave(draft, operationKey, expectedVersion);
      setMessage('Profile saved on this device.');
      keys.current.delete(action);
    } catch (problem) {
      setMessage(errorText(problem));
    } finally { setBusy(false); }
  }

  return <section className="card" aria-labelledby="profile-heading">
    <p className="eyebrow">ONLY ON THIS DEVICE</p><h2 className="heading" id="profile-heading">My adaptations</h2>
    <p className="hint">Choose areas to avoid and the movements you cannot do. These filters are not an assessment of what is medically suitable for you.</p>
    <form className="form" onSubmit={confirm}>
      <fieldset className="fieldset" disabled={busy}><legend className="label">Areas to avoid</legend>
        <div className="profile-areas"><svg viewBox="0 0 100 180" className="profile-map" role="group" aria-label="Selectable body areas">
          <circle cx="50" cy="15" r="11" className="profile-body" /><path d="M38 32 L62 32 L68 94 L61 104 L63 166 L53 166 L50 115 L47 166 L37 166 L39 104 L32 94 Z M34 37 L21 70 L20 94 M66 37 L79 70 L80 94" className="profile-body" />
          {MAP_ZONES.map(([area, vertical]) => <g role="button" tabIndex={busy ? -1 : 0} aria-label={`${area} on body map`} aria-pressed={draft.avoidAreas.includes(area)} aria-disabled={busy} key={area}
            className={draft.avoidAreas.includes(area) ? 'profile-zone selected' : 'profile-zone'} onClick={() => toggleArea(area)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleArea(area); } }}>
            <rect x={area === 'elbows' || area === 'wrists' ? 10 : 32} y={vertical - 7} width={area === 'elbows' || area === 'wrists' ? 80 : 36} height="14" rx="6" /></g>)}
        </svg><div className="row">{BODY_AREAS.map(area => <label className="choice" key={area}><input type="checkbox" checked={draft.avoidAreas.includes(area)} onChange={() => toggleArea(area)} />Avoid {area}</label>)}</div></div>
      </fieldset>
      <fieldset className="fieldset" disabled={busy}><legend className="label">Movement options</legend>
        <label className="choice"><input type="checkbox" name="seatedOnly" checked={draft.seatedOnly} onChange={event => setDraft({ ...draft, seatedOnly: event.target.checked })} />Seated only</label>
        {(['pull_up', 'jumping'] as const).map((capability: Capability) => <label className="choice" key={capability}><input type="checkbox" checked={draft.unableTo.includes(capability)} onChange={event => setDraft({ ...draft, unableTo: (['pull_up', 'jumping'] as const).filter(item => item === capability ? event.target.checked : draft.unableTo.includes(item)) })} />Cannot do {capability === 'pull_up' ? 'pull-ups' : 'jumping'}</label>)}
        <label className="choice"><input type="checkbox" checked={draft.diabetes} onChange={event => setDraft({ ...draft, diabetes: event.target.checked })} />Diabetes display priorities</label>
        <p className="hint">Opt in to show carbohydrate, added sugar and fibre first. This changes display only; it provides no dosing or glucose targets.</p>
      </fieldset>
      <div className="row"><button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : 'Save adaptations'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => { setDraft({ ...EMPTY_PROFILE, body: draft.body }); setMessage('Cleared the draft. Save to confirm this change.'); }}>Clear draft</button></div>
      <p className="hint">Saved changes apply to manual plans, ready-made days and the device check on Trainer replies. They are never sent to the Coach or Trainer. Backups include this profile and its history; keep the file private.</p>
      {message && <p className="notice" role="status">{message}</p>}
    </form>
  </section>;
}
