import type { NutritionEstimate } from '../domain/nutrition/estimates';
import { formatQuantity, formatTotal, SOURCE_LABELS } from './format';

interface EstimateResultProps {
  estimate: NutritionEstimate;
  hideNumbers: boolean;
  typicalServing: boolean;
  busy: boolean;
  onAccept: () => void;
  onEdit: () => void;
}

/** Present a proposal with its primary action beside the nutrition range. */
export function EstimateResult({ estimate, hideNumbers, typicalServing, busy, onAccept, onEdit }: EstimateResultProps) {
  const kcal = estimate.nutrients.kcal;
  return (
    <div className="estimate-result" aria-live="polite">
      <div className="card-head"><span className="badge badge-estimate">{SOURCE_LABELS[estimate.sourceKind]}</span><span className="hint">Not saved</span></div>
      {!hideNumbers && <p className="estimate-energy numbers">{kcal == null ? 'Energy unknown' : formatTotal({ known: kcal, unknownItems: 0,
        ...(estimate.range.kcal == null ? {} : { range: estimate.range.kcal }) }, 'kcal')}</p>}
      <p className="hint">{typicalServing ? 'For 1 typical serving. Review the assumptions below.' : `For ${formatQuantity(estimate.basis)}.`}</p>
      {!hideNumbers && <div className="estimate-macros"><span>Protein <strong>{estimate.nutrients.protein_g == null ? 'Unknown' : `${estimate.nutrients.protein_g.toFixed(1)} g`}</strong></span><span>Fat <strong>{estimate.nutrients.fat_g == null ? 'Unknown' : `${estimate.nutrients.fat_g.toFixed(1)} g`}</strong></span></div>}
      <div className="actions"><button type="button" className="button" disabled={busy} onClick={onAccept}>Use estimate</button><button type="button" className="button button-secondary" disabled={busy} onClick={onEdit}>Edit</button></div>
      <details className="estimate-details"><summary>Sources and assumptions · {[...new Set(estimate.sources.map((source) => source.provider))].join(' + ')}</summary>
        <p className="hint">{estimate.reason}</p><ul className="estimate-sources">{estimate.sources.map((source, index) => <li key={`${source.url}-${index}`}>{source.provider}: {source.description}</li>)}</ul>
        <p className="hint">Use estimate saves this food. Save the meal separately after reviewing the portion.</p>
      </details>
    </div>
  );
}
