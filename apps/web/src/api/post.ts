/** What a failed call should say, so each screen can name its own service and way out. */
export interface ServiceMessages {
  slow: string;
  unreachable: string;
  notRunning: string;
  busy: string;
  failed: (status: number) => string;
}

/**
 * Return the parsed JSON reply from a laptop service, or throw a message the person can act on.
 *
 * Credentials are left out, and only the body the caller builds is ever sent.
 */
export async function postJson(path: string, body: unknown, timeoutMs: number, messages: ServiceMessages): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (problem) {
    // AbortSignal.timeout rejects with a TimeoutError; anything else means no connection
    throw new Error(problem instanceof DOMException && problem.name === 'TimeoutError' ? messages.slow : messages.unreachable);
  }
  if (!response.ok) {
    throw new Error(statusMessage(response.status, messages));
  }
  return response.json();
}

/**
 * Return what an error status means for the person waiting on the reply.
 */
function statusMessage(status: number, messages: ServiceMessages): string {
  // The preview proxy answers 502/504 when nothing is listening on the service port
  if (status === 502 || status === 504) {
    return messages.notRunning;
  }
  // The service answers 503 when every source came back empty or busy
  return status === 503 ? messages.busy : messages.failed(status);
}
