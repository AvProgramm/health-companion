import type { Notice } from './useSave';

/**
 * Show a save outcome; errors are announced immediately, other notices politely.
 */
export function NoticeLine({ notice }: { notice: Notice | null }) {
  if (notice === null) {
    return null;
  }
  return (
    <p className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      {notice.text}
    </p>
  );
}
