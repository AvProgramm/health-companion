# AI contribution log

This log records who wrote what, so the Friday walkthrough is honest. Yash fills in the "I changed" and "I verified" columns after each milestone review.

| Commit / milestone | AI wrote | Yash wrote or changed | Yash rejected | How verified |
|---|---|---|---|---|
| M1 docs + fixtures | Claude: .gitignore, ADR-001, test log, this log. The fixtures were copied unchanged from the build kit. | | | |
| M1 app | Claude: scaffold, units, scale, revisions, storage, page, service worker (at Yash's request, "code on my behalf", 7 Nov). Explain-back pending. | | | |

| M3a (Codex, 7 Nov) | AGENTS reading order, optional FastAPI/Groq/database estimates, strict proposal validation, draft confirmation/manual fallback, ranges, tests, proxy/CI and walkthrough. | Review and explain-back pending. | | Automated app/hook/service checks, production build and live OFF browser flow; live Groq/USDA and phone pending. |

| M3a live-provider follow-up (Codex, 7 Nov) | Account-supported Groq model fix with regression test, key-free future-integration handoff, VS Code/phone startup guide and current milestone status. | Yash configured the local credentials; phone check pending. | | Live USDA and Groq through preview pass; npm run check passes. Tavily/HF not called. |

| M3a UI/retrieval follow-up (Codex, 7 Nov) | All-null estimate regressions, bounded Tavily evidence, citation-checked Groq/HF pipeline, responsive shell, local Geist/Phosphor, compact proposal view and updated handoff. | Yash supplied screenshots and requested retrieval/backup coverage; explain-back and phone check pending. | | Live Tavily/Groq and browser save flow; automated failures/quotas/citations; 320/390/1440 px review. Live HF returns 402. |

| M4 Task A and Gym UI (Codex, 7 Nov) | Offline dataset importer/provenance, pure search/review, immutable schema-v4 choices, backup checker, confirmation UI, chosen-pool wiring, CSS depth/SVG targets/ring/chips, tests and walkthrough. | Ranking remains Yash's unchanged function; review/explain-back pending. | | Check + build; fake-IDB migration/round trip; browser 375/1440 px; server-stopped cached search/add/reload/plan/remove. Physical phone pending. |

| Compact Gym setup (Codex, 7 Nov) | Failing UI regressions, without/with-equipment controls, conditional gear chips suggested from added exercises, removed capability form, walkthrough and test-log update. | Yash requested simplification after reporting the previous version works on his phone. Ranking and domain filters unchanged. | | Full check + build; browser 375/1440 px and bodyweight/band planning. New phone controls pending. |

| Target-duration planner (Codex, 7 Nov, explicitly authorised) | Updated Yash's ranking to coverage/duration/preference/IDs, twelve-card cap, bounded DP, truthful partial-plan UI, independent oracle/regression tests and explain-back walkthrough. | Yash authorised this ranking change after reporting 15/60; review pending. Training loop and injury rules untouched. | | Check + build, original and mixed-pool exhaustive oracle tests; browser 15/60 shortfall and 60/60 with twelve unique blocks at 375/1440 px. New phone gate pending. |

| Repeated rounds (Codex, 7 Nov, explicitly authorised) | Pure remainder/Dijkstra scheduling, compact block counts, removal of artificial input cap, visible repeat toggle, display-only compact ring labels, failing tests and explain-back/handoff. | Yash requested repeated rounds and a Claude Code handoff; review pending. | | Check + build; independent reachability oracle; browser variable/large targets, repeat off and cached cold reload with preview stopped. Physical phone pending. |

| M4 router harness (Claude Code, 7 Nov) | 108 fictional families (6 classes x 18), seeded family split with sealed test, majority/keyword/TF-IDF baselines, metrics with abstention and critical errors, frozen MiniLM pooling/cache, runner, check script, README and walkthrough. Stubs and expectedFailure tests for Yash's Dataset, forward, loop, score and confusion matrix. | Training loop reserved for Yash; MiniLM download awaiting his approval. | | Router tests (22 pass, 5 expected failures, 1 skipped), validation baselines run, Yash's tests proven passable with a deleted reference. |

| M4 router training (Claude Code, 8 Nov) | VectorDataset, forward, train_model, score and confusion_matrix in Yash's FIT3181 style; wider learning-rate grid on validation; one sealed test run and the no-ship write-up. | Originally reserved for Yash. On 8 Nov he told Claude to complete it in his style and that he would cross-check. Cross-check and explain-back pending. | | 33 router tests, runner proven on a stand-in split, sealed test once: head 0.721, keyword 0.735, TF-IDF 0.723. |
