interface MinutesRingProps { used: number; available: number }

/** Display session minutes as a progress ring without changing planner arithmetic. */
export function MinutesRing({ used, available }: MinutesRingProps) {
  const progress = available > 0 ? Math.min(1, Math.max(0, used / available)) : 0;
  return <div className="minutes-ring" role="img" aria-label={`${used} of ${available} minutes planned`}>
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="ring-track" cx="60" cy="60" r="50" /><circle className="ring-value" cx="60" cy="60" r="50" pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - progress)} /></svg>
    <span><strong className="numbers">{used}</strong><small>of {available} min</small></span>
  </div>;
}
