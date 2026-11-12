"""Count recent attempts per key in memory, so guessing and bulk sign-ups are slowed."""
import threading
import time

# The most keys one limiter remembers; a flood of new keys pushes out the oldest instead of growing memory.
MAX_KEYS = 10_000


class AttemptLimiter:
    """
    Block a key once it has made too many attempts inside a sliding window.

    The counts live in this process only, which suits a single free instance:
    a restart forgets them, and nothing about a visitor is written to disk.
    """

    def __init__(self, max_attempts, window_seconds):
        """Initialise an empty limiter with its attempt count and window length."""
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        # Each key maps to the times of its attempts, oldest first; the dictionary keeps keys in arrival order.
        self._attempts = {}
        # Route handlers run on several threads, so every read and write takes this lock.
        self._lock = threading.Lock()

    def is_blocked(self, key):
        """Return whether this key has used every attempt the window allows."""
        with self._lock:
            return len(self._recent(key, time.monotonic())) >= self.max_attempts

    def record(self, key):
        """Store one attempt for this key at the current time."""
        now = time.monotonic()
        with self._lock:
            # Move the key to the end so the least recently active key is dropped first.
            recent = self._recent(key, now)
            self._attempts.pop(key, None)
            self._attempts[key] = [*recent, now]
            self._prune(now)

    def reset(self, key):
        """Forget every attempt for this key, for example after a successful sign-in."""
        with self._lock:
            self._attempts.pop(key, None)

    def _recent(self, key, now):
        """Return this key's attempts that are still inside the window."""
        return [moment for moment in self._attempts.get(key, ()) if now - moment < self.window_seconds]

    def _prune(self, now):
        """
        Remove expired keys once the limiter is full, then the oldest keys if it is still full.

        Dropping the oldest key can end a lockout early during a flood, which is
        the accepted price of a fixed memory bound.
        """
        # Ignore a limiter with room left because scanning every key on each attempt would be wasted work.
        if len(self._attempts) <= MAX_KEYS:
            return
        for key in [key for key, moments in self._attempts.items() if now - moments[-1] >= self.window_seconds]:
            del self._attempts[key]
        while len(self._attempts) > MAX_KEYS:
            del self._attempts[next(iter(self._attempts))]
