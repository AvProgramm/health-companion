import { useEffect, useRef, useState } from 'react';
import { requestEstimate } from '../api/estimate';
import { estimatedFood, type NutritionEstimate } from '../domain/nutrition/estimates';
import { buildFoodVersion } from '../domain/nutrition/foods';
import { SUMMARY_NUTRIENTS } from '../domain/nutrition/day';
import type { FoodVersion } from '../domain/nutrition/types';
import { formatQuantity, formatTotal } from './format';

interface EstimateDraftProps {
  name: string;
  portionText: string;
  hideNumbers: boolean;
  onUse: (food: FoodVersion) => Promise<void>;
  onEdit: (food: FoodVersion) => void;
}

/** Offer a food-only request and keep its result unsaved until confirmation. */
export function EstimateDraft({ name: initialName, portionText: initialPortion, hideNumbers, onUse, onEdit }: EstimateDraftProps) {
  const [name, setName] = useState(initialName);
  const [portionText, setPortionText] = useState(initialPortion);
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

  /** Fetch a proposal without writing a food or meal. */
  async function loadEstimate() {
    setBusy(true);
    setError(null);
    setEstimate(null);
    try {
      const result = await requestEstimate({ name: name.trim(), portionText: portionText.trim() });
      if (mounted.current) setEstimate(result);
    } catch (problem) {
      if (mounted.current) setError(problem instanceof Error ? problem.message : String(problem));
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
            nutrients: Object.fromEntries(SUMMARY_NUTRIENTS.map((key) => [key, null])), sourceKind: 'user_estimate' }, foodId.current)
        : estimatedFood(name, estimate!, foodId.current);
      await onUse(food);
    } catch (problem) {
      if (mounted.current) setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="estimate-panel">
      <p className="hint">Optional lookup: only this food name and portion text go to the laptop and food providers.</p>
      <label className="field">
        <span className="label">Food to estimate</span>
        <input className="input" maxLength={80} value={name} disabled={busy} onChange={(event) => { setName(event.target.value); setEstimate(null); }} />
      </label>
      <label className="field">
        <span className="label">Portion text</span>
        <input className="input" maxLength={80} placeholder="e.g. 150 g or 2 pieces" value={portionText} disabled={busy} onChange={(event) => { setPortionText(event.target.value); setEstimate(null); }} />
      </label>
      <button type="button" className="button button-secondary" disabled={busy || name.trim() === ''} onClick={loadEstimate}>Estimate nutrition</button>
      {busy && <div className="skeleton estimate-loading" role="status" aria-label="Looking up nutrition" />}
      {error !== null && <p className="field-error" role="status">{error}</p>}
      {estimate !== null && (
        <div aria-live="polite">
          <p className="badge">{estimate.sourceKind === 'database' ? 'Database estimate' : 'AI estimate'} · Not saved</p>
          {!hideNumbers && <p className="numbers">Estimated: {formatTotal({ known: estimate.nutrients.kcal ?? 0,
            unknownItems: estimate.nutrients.kcal == null ? 1 : 0,
            ...(estimate.range.kcal == null ? {} : { range: estimate.range.kcal }) }, 'kcal')}</p>}
          <p className="hint">For {formatQuantity(estimate.basis)}. {estimate.reason}</p>
          <ul className="estimate-sources">
            {estimate.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.provider}: {source.description}</a></li>)}
          </ul>
          <div className="actions">
            <button type="button" className="button" disabled={busy} onClick={() => accept()}>Use estimate</button>
            <button type="button" className="button button-secondary" disabled={busy} onClick={() => onEdit(estimatedFood(name, estimate, foodId.current))}>Edit</button>
          </div>
          <p className="hint">Use estimate saves this food on your device. Review the portion, then save the meal separately.</p>
        </div>
      )}
      <button type="button" className="button button-quiet" disabled={busy || name.trim() === ''} onClick={() => accept(true)}>Log with unknown values</button>
      <p className="hint">Unknown-value logging adds one piece to the draft. Set the amount before saving the meal. You can replace it with an estimated food later.</p>
    </div>
  );
}
