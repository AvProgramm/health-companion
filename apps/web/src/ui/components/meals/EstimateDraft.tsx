import { useEffect, useRef, useState } from 'react';
import { Field } from '../shared/Field';
import { requestEstimate } from '../../../api/estimate';
import { estimatedFood, type NutritionEstimate } from '../../../domain/nutrition/estimates';
import { buildFoodVersion } from '../../../domain/nutrition/foods';
import { NUTRIENT_KEYS } from '../../../domain/nutrition/types';
import type { FoodVersion } from '../../../domain/nutrition/types';
import { Sparkle } from '@phosphor-icons/react';
import { EstimateResult } from './EstimateResult';
import { errorText } from '../../format';

// A container before the food, as the photo reader and people write it: "bowl of dal", "2 cups of rice" keeps its own amount
const CONTAINER_OF = /^(bowl|cup|plate|glass|can|slice|spoon|mug)s? of (.+)$/i;

interface EstimateDraftProps {
  name: string;
  portionText: string;
  hideNumbers: boolean;
  onUse: (food: FoodVersion) => Promise<void>;
  onEdit: (food: FoodVersion) => void;
}

/** Offer a food-only request and keep its result unsaved until confirmation. */
export function EstimateDraft({ name: initialName, portionText: initialPortion, hideNumbers, onUse, onEdit }: EstimateDraftProps) {
  // "bowl of dal": the container is the portion, not part of the food's name
  const contained = initialPortion === '' ? CONTAINER_OF.exec(initialName) : null;
  const [name, setName] = useState(contained?.[2] ?? initialName);
  const [portionText, setPortionText] = useState(contained ? `1 ${contained[1]}` : initialPortion);
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const foodId = useRef(crypto.randomUUID());

  // Ignore a late response because its draft row may have been removed.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Fetch the estimate as soon as the food is identified, so nobody has to ask for it; it is still only a proposal
  useEffect(() => {
    if (name.trim() !== '') void loadEstimate();
    // Run once for the food this row started with; later edits are sent by the button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fetch a proposal without writing a food or meal. */
  async function loadEstimate() {
    setBusy(true);
    setError(null);
    setEstimate(null);
    try {
      const result = await requestEstimate({ name: name.trim(), portionText: portionText.trim() });
      if (mounted.current) setEstimate(result);
    } catch (problem) {
      if (mounted.current) setError(errorText(problem));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  /** Save only the food version the user has explicitly accepted. */
  async function accept(unknown = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const food = unknown
        ? buildFoodVersion({ name, aliases: [], basis: { amount: 1, unit: 'piece' },
            nutrients: Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, null])), sourceKind: 'user_estimate' }, foodId.current)
        : estimatedFood(name, estimate!, foodId.current);
      await onUse(food);
    } catch (problem) {
      if (mounted.current) setError(errorText(problem));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  // Reuse the inputs before lookup and inside the collapsed result editor.
  const inputFields = <>
      <div className="estimate-fields">
      <Field label="Food to estimate">
        <input className="input" maxLength={80} value={name} disabled={busy} onChange={(event) => { setName(event.target.value); setEstimate(null); }} />
      </Field>
      <Field label="Portion text">
        <input className="input" maxLength={80} placeholder="Typical serving, or e.g. 150 g" value={portionText} disabled={busy} onChange={(event) => { setPortionText(event.target.value); setEstimate(null); }} />
      </Field>
      </div>
      <button type="button" className="button button-secondary estimate-trigger" disabled={busy || name.trim() === ''} onClick={loadEstimate}>{estimate === null ? 'Estimate nutrition' : 'Estimate again'}</button>
  </>;

  return (
    <div className="estimate-panel">
      <p className="lookup-caption"><Sparkle size={18} /> Nutrition lookup <span>Food name and portion only</span></p>
      {estimate === null ? inputFields : <details className="estimate-inputs"><summary>{name} · {portionText.trim() || 'Typical serving'} <span>Change</span></summary>{inputFields}</details>}
      {busy && <div className="skeleton estimate-loading" role="status" aria-label="Looking up nutrition" />}
      {error !== null && <p className="field-error" role="status">{error}</p>}
      {estimate !== null && <EstimateResult estimate={estimate} hideNumbers={hideNumbers} typicalServing={portionText.trim() === ''}
        busy={busy} onAccept={() => accept()} onEdit={() => onEdit(estimatedFood(name, estimate, foodId.current))} />}
      <details className="manual-options"><summary>Log without an estimate</summary>
      <button type="button" className="button button-quiet" disabled={busy || name.trim() === ''} onClick={() => accept(true)}>Log with unknown values</button>
      <p className="hint">Adds an unknown serving to the draft. Review the amount before saving.</p>
      </details>
    </div>
  );
}
