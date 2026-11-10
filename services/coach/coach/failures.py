"""Name the ways a search or model provider can fail, so every caller falls back the same way."""
import httpx

# What a provider that is slow, refuses, or sends a garbled reply can raise: a timeout, any HTTP
# error, and the four errors that reading an unexpected reply produces. Anything else is a bug
# in our own code and is left to surface.
PROVIDER_FAILURES = (TimeoutError, httpx.HTTPError, ValueError, KeyError, IndexError, TypeError)
