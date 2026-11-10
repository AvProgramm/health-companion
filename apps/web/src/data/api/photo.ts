import { readPhotoReply, type PhotoReply } from '../../domain/dish/photoReply';
import { postJson, type ServiceMessages } from './post';

// A model reading a photo is slower than one reading a question, plus the upload
const PHOTO_TIMEOUT_MS = 30000;
// What the person reads whenever the service cannot be reached
const OFFLINE = 'The photo reader is offline. The suggestions on this device and your diary still work.';

// What each kind of failure means for someone waiting on the list
const MESSAGES: ServiceMessages = {
  slow: 'The photo reader took too long to answer. Try again, or type what you ate.',
  unreachable: OFFLINE,
  notRunning: OFFLINE,
  busy: 'The photo reader has no answer right now. Try again shortly, or type what you ate.',
  failed: (status) => `The photo reader returned an error (HTTP ${status}). Type what you ate instead.`,
};

/** Ask a hosted vision model to list the foods, sending only this one shrunk photo. */
export async function readPhotoFoods(image: string): Promise<PhotoReply> {
  return readPhotoReply(await postJson('/api/photo', { image }, PHOTO_TIMEOUT_MS, MESSAGES));
}
