# AI contribution log

This log records who wrote what, so the Friday walkthrough is honest. Yash fills in the "I changed" and "I verified" columns after each milestone review.

| Commit / milestone | AI wrote | Yash wrote or changed | Yash rejected | How verified |
|---|---|---|---|---|
| M1 docs + fixtures | Claude: .gitignore, ADR-001, test log, this log. The fixtures were copied unchanged from the build kit. | | | |
| M1 app | Claude: scaffold, units, scale, revisions, storage, page, service worker (at Yash's request, "code on my behalf", 7 Nov). Explain-back pending. | | | |

| M3a (Codex, 7 Nov) | AGENTS reading order, optional FastAPI/Groq/database estimates, strict proposal validation, draft confirmation/manual fallback, ranges, tests, proxy/CI and walkthrough. | Review and explain-back pending. | | Automated app/hook/service checks, production build and live OFF browser flow; live Groq/USDA and phone pending. |

| M3a live-provider follow-up (Codex, 7 Nov) | Account-supported Groq model fix with regression test, key-free future-integration handoff, VS Code/phone startup guide and current milestone status. | Yash configured the local credentials; phone check pending. | | Live USDA and Groq through preview pass; npm run check passes. Tavily/HF not called. |

| M3a UI/retrieval follow-up (Codex, 7 Nov) | All-null estimate regressions, bounded Tavily evidence, citation-checked Groq/HF pipeline, responsive shell, local Geist/Phosphor, compact proposal view and updated handoff. | Yash supplied screenshots and requested retrieval/backup coverage; explain-back and phone check pending. | | Live Tavily/Groq and browser save flow; automated failures/quotas/citations; 320/390/1440 px review. Live HF returns 402. |
