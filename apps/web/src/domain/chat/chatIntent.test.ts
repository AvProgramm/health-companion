import { describe, expect, it } from 'vitest';
import { chatIntent } from './chatIntent';

describe('chatIntent', () => {
  it.each([
    'How much sodium is too much in a day?',
    'why do I feel tired after lunch',
    'Is it bad to exercise before bed?',
    'how many exercises should a beginner do',
    'tell me about fibre',
  ])('sends a general question to the Coach: %s', (text) => {
    expect(chatIntent(text)).toEqual({ kind: 'coach' });
  });

  it.each([
    'What should I eat for breakfast?',
    'breakfast ideas with more fibre',
    'suggest a high protein snack',
    'give me something to eat after the gym',
    'I need dinner ideas',
  ])('sends a request for food ideas to the Nutritionist: %s', (text) => {
    expect(chatIntent(text).kind).toBe('nutritionist');
  });

  it('reads a session with its length, place and difficulty', () => {
    expect(chatIntent('Give me a hard 30 min workout with dumbbells')).toEqual({ kind: 'trainer', minutes: 30, setting: 'home', difficulty: 'hard' });
    expect(chatIntent('easy gym session for an hour')).toEqual({ kind: 'trainer', minutes: 60, setting: 'gym', difficulty: 'easy' });
    expect(chatIntent('1.5 hours leg day at the gym')).toEqual({ kind: 'trainer', minutes: 90, setting: 'gym', difficulty: 'medium' });
  });

  it('assumes 45 minutes, no equipment and medium when a session names none', () => {
    expect(chatIntent('I want to build muscle')).toEqual({ kind: 'trainer', minutes: 45, setting: 'bodyweight', difficulty: 'medium' });
  });

  it('prefers no equipment when the message says so, even at a gym', () => {
    expect(chatIntent('gym workout with no equipment').kind === 'trainer' && chatIntent('gym workout with no equipment')).toMatchObject({ setting: 'bodyweight' });
  });

  it('keeps the length within what the service accepts', () => {
    expect(chatIntent('workout for 9000 minutes')).toMatchObject({ minutes: 600 });
    expect(chatIntent('workout for 0 minutes')).toMatchObject({ minutes: 1 });
  });
});
