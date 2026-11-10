# Hosting preparation checks: 10 Nov 2026

This is a local checkpoint, not a hosted or physical-phone result. Original code is MIT with separate third-party notices. Yash confirmed Gemini Free Tier and kept diary sharing off. No billing, deployment, new account, database or model download occurred.

| Check | Result | Evidence and limit |
|---|---|---|
| Failing tests first | PASS | Health was 404, deployment-policy helper absent; new tests failed before implementation. Earlier privacy tests caught an enabled switch, browser fetch and accepted server context. |
| Full check | PASS | TypeScript/web/hook checks; 221 coach, 9 importer, 33 router and 92 vision tests. |
| Production build | PASS | Existing large-chunk warning remains; not a Linux/cloud build. |
| Local defaults and exact deployment allowlists | PASS | Six new coach tests cover startup health, defaults, configured hosts/origins and rejected wildcard/non-origin settings. |
| Example and notice checks | PASS locally | Vercel JSON parsed; exercise index path exists; copied font/icon licences exactly match installed upstream licences and exist in build output. |
| Deployment examples | NOT TESTED on hosts | Vercel rewrite deliberately uses a reserved .invalid destination until the real Render hostname exists. |
| Live restarted service/proxy | PASS | Health 200 with no-store; Firebase config 200 without printing values; fictional diary context 403; unrelated origin 403 and host 400; generic typed greeting 200. |
| Seven physical-phone steps | NOT TESTED | Needs Yash; laptop checks are not phone evidence. |

Use deploy/README.md tomorrow. Hosted dependency installation, memory/cold start, provider availability, correct rewrite headers and HTTPS mobile-data/offline use remain unverified. The clean Git deployment excludes local model weights. Origin checks do not authenticate public visitors or limit model spending.
