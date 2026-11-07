import type { NutritionEstimate } from '../domain/nutrition/estimates';
import { NUTRIENT_KEYS } from '../domain/nutrition/types';
import { formatQuantity, formatTotal, NUTRIENT_LABELS, SOURCE_LABELS } from './format';

// Every tracked nutrient after energy, so nothing a source gave is hidden; unknown ones say so
const DETAIL_NUTRIENTS = NUTRIENT_KEYS.filter((key) => key !== 'kcal');

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
      {!hideNumbers && <p className="estimate-energy numbers">{kcal == null ? 'Energy unknown' : formatTotal({ known: kcal, knownItems: 1, unknownItems: 0,
        ...(estimate.range.kcal == null ? {} : { range: estimate.range.kcal }) }, 'kcal')}</p>}
      <p className="hint">{typicalServing ? 'For 1 typical serving. Review the assumptions below.' : `For ${formatQuantity(estimate.basis)}.`}</p>
      {!hideNumbers && (
        <div className="estimate-macros">
          {DETAIL_NUTRIENTS.map((key) => {
            const value = estimate.nutrients[key];
            const range = estimate.range[key];
            return (
              <span key={key}>
                {NUTRIENT_LABELS[key].label}
                <strong>{value == null ? 'Unknown' : `${value.toFixed(1)} ${NUTRIENT_LABELS[key].unit}`}</strong>
                {value != null && range != null && range.low !== range.high && (
                  <small className="numbers">{range.low.toFixed(1)}–{range.high.toFixed(1)}</small>
                )}
              </span>
            );
          })}
        </div>
      )}
      <div className="actions"><button type="button" className="button" disabled={busy} onClick={onAccept}>Use estimate</button><button type="button" className="button button-secondary" disabled={busy} onClick={onEdit}>Edit</button></div>
      <details className="estimate-details"><summary>Sources and assumptions · {[...new Set(estimate.sources.map((source) => source.provider))].join(' + ')}</summary>
        <p className="hint">{estimate.reason}</p><ul className="estimate-sources">{estimate.sources.map((source, index) => <li key={`${source.url}-${index}`}>{source.provider}: {source.description}</li>)}</ul>
        <p className="hint">Use estimate saves this food. Save the meal separately after reviewing the portion.</p>
      </details>
    </div>
  );
}
