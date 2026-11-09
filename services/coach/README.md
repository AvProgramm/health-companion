# Laptop nutrition estimates

Run from the repository root with Python 3.13. The diary never depends on this service.

```powershell
python -m venv services/coach/.venv
services/coach/.venv/Scripts/python.exe -m pip install -r services/coach/requirements.txt
```

Copy `.env.example` to the root `.env` only if `.env` does not already exist. Add `GROQ_API_KEY` there. `GEMINI_API_KEY` and `USDA_API_KEY` are optional: with both model keys, whichever of Groq and Gemini is available answers, and without USDA the database stage uses Open Food Facts only. Never put any key in `apps/web`, a `VITE_*` variable, a screenshot, or Git. Restart the service after changing `.env`.

```powershell
services/coach/.venv/Scripts/python.exe -m uvicorn coach.app:app --app-dir services/coach --host 127.0.0.1 --port 8000 --no-access-log
```

In a second terminal:

```powershell
npm --prefix apps/web run build
npm --prefix apps/web run preview
```

Keep USB forwarding `4173 → 127.0.0.1:4173`; only the laptop needs port 8000. Open `http://localhost:4173` on the phone and reload twice. Vite dev and preview both proxy `/api` to loopback. Restart an already-running preview after changing its config.

`npm run check` runs app, hook and coach tests. On Linux/macOS, create the same `.venv` and use `.venv/bin/python` for installation/startup; the check script finds it automatically. CI installs the Python dependencies independently.

## Data flow

`POST /api/estimate` accepts exactly `{ name, portionText }`. Extra fields are rejected and validation errors do not echo submitted data. No diary store or export is read by this service. Access logging is disabled in the startup command; request bodies and provider errors are not logged by app code.

1. Query USDA (if configured) and Open Food Facts concurrently, filtering for all name tokens and deduplicating source IDs.
2. Scale only compatible physical units, average known values independently per nutrient, and retain their min/max spread and every used record. Missing values stay null. The spread is not a confidence interval, and a single match has identical bounds.
3. If there is no usable match for the requested basis, Tavily retrieves up to three relevant public nutrition snippets (at most 1,800 characters each). Web content is untrusted evidence, never instructions. The first available hosted model then proposes nutrition from the food/portion and public evidence. Require every nutrient key, finite non-negative values or null, and matching ranges. Server-owned provenance labels it `ai_estimate`; it is never described as database verified.
4. A failed database can still fall back to retrieval and a hosted model. Groq, Gemini and the optional Hugging Face adapter wait in one queue (`coach/availability.py`): the model at the front is asked first and one that fails moves to the back, so none of them is a fixed first choice. Exhausting every model becomes an actionable unavailable response. Each stage has a deadline. With no key, no model request is made.

Counts and unclear portions are never converted into grams without evidence. The current database stage handles g/kg and explicitly identified mL/L records; pieces and free-form portions use the model fallback. A blank/unclear portion asks the model to assume one piece and explain its size/recipe. Review that assumption before accepting. MyFCD and database serving-weight mapping are deferred.

Groq uses a strict JSON schema, followed by our own independent validation. Gemini and Hugging Face use JSON object output plus the same validation. All-null proposals are rejected on the service and browser boundaries. Individual unknowns remain null; genuine zero values remain valid. A range a model writes around a nutrient it left null is dropped and the nutrient stays unknown (`tidy_unknown_ranges`). The default model is `openai/gpt-oss-20b`; change `GROQ_MODEL` in `.env` if needed. Gemini defaults to `gemini-3.5-flash-lite`; change `GEMINI_MODEL` the same way.

Sources: [USDA API guide](https://fdc.nal.usda.gov/api-guide/), [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/), [Groq JSON output](https://console.groq.com/docs/structured-outputs), [Groq model](https://console.groq.com/docs/models), [Gemini OpenAI compatibility](https://aistudio.google.com/docs/openai).

Tavily/Hugging Face configuration is documented in `docs/handoff/integrations.md`. Both stages are optional: blank tokens skip their requests. Hugging Face currently returns HTTP 402 on this laptop; the adapter is covered by synthetic tests, but live hosted inference is unavailable. No model weights are downloaded.

Each lookup stage has a 4-second total deadline, followed by up to 8 seconds per model; the browser allows 35 seconds overall. The model sees only the selected name/portion and bounded public source excerpts. Source IDs are checked against those excerpts before real URLs are attached. A cited web page does not make an AI proposal database-verified. Never log provider exception URLs because USDA keys are query parameters.

## Trainer, Coach and Nutritionist

`POST /api/trainer`, `/api/coach` and `/api/nutritionist` accept only what the person typed or picked on that card. They use the same queue, asking whichever of Groq and Gemini has a key and is nearest the front, and each reply names the model that wrote it (`answeredBy`, shown as "Answered by …" on the card). A model that replies with an error such as out of tokens hands over at once. A timeout ends that request, because the browser cannot wait for a second model, and moves the model to the back for the next one. With no key or a busy provider, the Trainer falls back to a balanced library set, and the Coach and Nutritionist show the reviewed cards themselves.

Retrieval reads `knowledge/cards.json`, and fuses word search with the MiniLM encoder. The encoder comes from the pinned Hugging Face cache by default; set `MINILM_DIR` to a folder holding `tokenizer.json` and `onnx/model_quint8_avx2.onnx` to use another copy. If it is missing, the service carries on with word search alone. `python -m coach.rag.evaluate dev` compares the designs on the development questions; the sealed result is in `eval/results/retrieval_final.json`.

`python -m coach.mcp_server` serves two read-only tools over stdio (see the root `.mcp.json`).
