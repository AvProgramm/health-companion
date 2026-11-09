/**
 * Display which hosted model wrote this reply.
 *
 * Shown only where the words on screen are a model's. A reply from an older service
 * names nobody, so the badge then says only that an AI wrote it.
 */
export function AnsweredBy({ name }: { name: string | null | undefined }) {
  return <span className="badge badge-estimate">Answered by {name ?? 'the AI'}</span>;
}
