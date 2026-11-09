import type { Notice } from '../../hooks/useSave';

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

/**
 * Show an error sentence, or nothing when there is no error.
 */
export function ErrorLine({ error }: { error: string | null }) {
  return <NoticeLine notice={error === null ? null : { kind: 'error', text: error }} />;
}
