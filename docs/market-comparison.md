# How Health Companion compares (9 Nov 2026)

Sources are at the end. Most market comparisons online are written by app makers, so treat prices and accuracy claims as directional. "Not found" means I did not find it in a quick search, which is not proof it does not exist.

| | Health Companion | MyFitnessPal | Cronometer | Cal AI | Lose It! | Noom | FitSense (friend's app) |
|---|---|---|---|---|---|---|---|
| Price | Free | Free tier; premium about $80 a year | Free tier; Gold about $60 a year | Paid | Free tier; about $40 a year | About $70 a month or $209 a year | Free |
| Account needed | **No** | Yes | Yes | Yes | Yes | Yes | Yes (Firebase) |
| Where the diary lives | **On the phone** | Cloud | Cloud | Cloud | Cloud | Cloud | Cloud (Firestore) |
| Food photo | **Recognised on the phone** | AI scan, premium | Sources disagree | Core feature | Snap It, premium | Not found | Cloud model (Gemini) |
| Barcode | Yes, only the number is sent | Yes | Yes | Not found | Yes | Not found | Yes |
| Food database | Open sources on demand | 20M+ foods | Verified, 80+ nutrients | Not found | Large | Not found | Open Food Facts |
| Unknown shown as unknown | **Yes, everywhere** | Not found | Not found | Not found | Not found | Not found | Not found |
| Evidence-checked AI answers | **Yes, numbers checked in code** | Not found | Not found | Not found | Not found | Coaching focus | RAG with cited sources |
| Training plans | Library, planner, AI Trainer | Limited | No | No | Limited | Limited | AI workouts |
| Injury and wheelchair aware | Yes, on the device | Not found | Not found | Not found | Not found | Not found | **Yes, its strength** |
| Live pose coaching, rep counting | No | Not found | Not found | Not found | Not found | Not found | **Yes, its strength** |
| Malaysian dishes | Yes, 91.8% on held-out photos | Not found | Not found | Not found | Not found | Not found | Yes, by cloud model |

## What is genuinely different

1. **The photo never leaves the phone.** The food model runs in the browser, so there is no server to breach. Every app I could check sends food photos to a cloud model, including FitSense. One report says a Cal AI breach exposed about 3 million users; I could not confirm that from a primary source.
2. **No account and no cloud diary, by design.** Backups are files you hold.
3. **Unknown is never zero.** A missing label value shows as unknown, and "calories left" says "at most" when any item is unknown.
4. **A correction never overwrites history.** Every change is a new version.
5. **AI output is checked by ordinary code.** A Coach claim is dropped if a number in it is not in the card it cites. The Trainer can only pick from a shortlist, and the phone re-checks every pick.
6. **It reports its own failures.** Decision rules are committed before sealed tests, and results are published even when a design loses. The first router did not ship, because it did not beat keyword rules.
7. **A food is a name** (in progress). The global model matches photos against food names, so a new dish needs no retraining, and a country can get its own small LoRA on a shared base.

## Where it is behind

- Food database size, and verified micronutrient depth.
- No wearables or Health Connect, no reminders, no recipes or meal plans.
- No cloud sync, so a lost phone without a backup loses the diary. That is the cost of point 2.
- No live pose coaching. FitSense has this and it is a real strength.
- The AI features need the laptop service until it is hosted.

## Added today because of this comparison

| Feature | From | Notes |
|---|---|---|
| Barcode scanning | FitSense and the market | Read on the device; only the number is looked up; label values are reviewed before saving |
| Daily energy balance | The market | Cardio is shown beside it and never added, to avoid counting the same run twice |
| Weight trend | The market | From the profile's saved versions |
| Cardio with calories | Your request | Uses your own weight, always as a range |
| Sign-up with height and weight | Your request and FitSense | On the device, in your Veritaserum style |
| Seven-day overview | The market | Food, training and sleep side by side; food with no energy value stays visible as ? or + |
| Log again | The market | Fills a draft for today with each food's newest version; nothing saves until it is confirmed |

## Worth adding next

1. **On-device rep counting and form cues**, as in FitSense. It needs a pose model download, so it needs your approval.
2. Android Health Connect, once the app is installable.
3. Reminders. A web app cannot schedule them reliably without a push server, so these wait until the app is installable too.

## Sources

- [Metrical: 9 apps compared](https://metrical.fit/blog/top-calorie-tracking-apps/)
- [kcalm: comparison](https://kcalm.app/blog/best-calorie-tracking-apps-comparison/)
- [fitness-reviewed: AI trackers](https://www.fitness-reviewed.com/articles/best-ai-calorie-tracking-apps-comparison/)
- [Callie: AI tracker ranking](https://www.mycallie.app/en/blog/best-ai-calorie-tracker-apps-2026)
- [Is MyFitnessPal safe?](https://ismyhealthappsafe-site.pages.dev/apps/myfitnesspal/)
- [FitSense on GitHub](https://github.com/Divi19/FitSense)
