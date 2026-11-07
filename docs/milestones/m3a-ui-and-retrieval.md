# M3a follow-up: compact UI and evidence-assisted fallbacks

## What triggered this change

Yash reported `nasi lemak` with empty portion text returning an AI badge, unknown calories and a Use estimate button. The screenshot also showed a tall form inside a narrow wrapper with large blank sides. Regression tests were added first for an all-null proposal; genuine zero values remain valid.

The earlier all-null model example encouraged an empty response. The prompt now describes an actual estimation task, including a typical serving assumption for a recognisable dish. Groq schema output and both boundary validators reject malformed/empty proposals. General model-only estimates can still fail; no fallback is allowed to invent a valid-looking result in application code.

## Pipeline to explain in the interview

1. `providers.py` queries USDA and Open Food Facts. A compatible result ends the request; no search or model call follows.
2. `retrieval.py` optionally searches Tavily for the selected food and portion. It filters relevant numeric nutrition snippets, public HTTPS URLs and duplicates, then caps source count and excerpt length. It never reads IndexedDB, a backup or diary history.
3. `prompts.py` marks public excerpts as untrusted data and requires serving/recipe assumptions. Groq proposes a draft using the available evidence, not instructions from those pages.
4. `model_client.py` validates the proposal and checks every cited source ID against the supplied evidence. It supplies actual source URLs itself. Web-assisted values keep `ai_estimate` provenance; a web citation is not a database measurement.
5. `huggingface.py` is the final optional hosted-model adapter after Groq errors, quota failures, timeout or an invalid proposal. It downloads no weights and writes no training code. Its live request returned HTTP 402; only synthetic successful-fallback tests pass today.
6. Exhaustion returns unavailable. Manual editing and explicit unknown-value logging remain available. No meal saves until the existing confirmation path is used.

The stage deadlines are 4 + 4 + 8 + 8 seconds, with a 27-second browser deadline. The primary diary remains local. Only the selected food/portion is user data sent to providers; model prompts may also contain bounded public excerpts. Keys remain in the ignored root `.env`.

## UI decisions

The design pass follows Yash's linked [landing-page-design visual system](https://github.com/elayadesign/ai-design-skills/blob/main/skills/landing-page-design/SKILL.md), adapted to a diary rather than a marketing page. Local Geist, Phosphor icons, flat surfaces, named typography, a shared spacing scale and reduced-motion support are bundled with the PWA.

The 520 px whole-app wrapper is removed. Laptops use a navigation sidebar, diary workspace and daily overview; phones use a single column with normal edge padding and a compact dock. Quick entry collapses after parsing. Once an estimate arrives, its inputs collapse while the source badge, range and Use estimate remain visible. Source explanations and alternatives expand on request. Display formatting separates known subtotals, ranges and unknown counts without changing domain arithmetic.

`EstimateDraft` owns request/save state; `EstimateResult` only presents a proposal. Domain modules stay pure. No stores, indexes, backup format or schema version changed. Existing snapshots remain immutable. Dark theme, diet rules, photos and the remaining M3b features are not implemented by this pass.

## Observed verification

- Automated checks cover all-null proposals, real zeros, provider order, lookup avoidance on a database hit, retrieval timeout, Groq quota fallback, malformed/private URLs, citation provenance and complete model exhaustion.
- Live Tavily search returned three public sources for the reported dish. Groq returned five known nutrients with real source citations; added sugar remained null. The browser showed the proposal, accepted its food version and saved the meal only after the separate Save meal action.
- The 390 px browser viewport showed Use estimate above the dock. Today was checked at 390 px; Foods, Me and Gym were checked at 320 px without horizontal overflow. At 1440 px the main area uses the available desktop width.
- Production build bundles the fonts/icons in the offline shell. A physical-phone reload/acceptance check remains for Yash. Do not turn browser viewport checks into a physical-device PASS.

Yash still owns `compareCandidates` and the PyTorch training loop. No Veritaserum implementation was copied.
