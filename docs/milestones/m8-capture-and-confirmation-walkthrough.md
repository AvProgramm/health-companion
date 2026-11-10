# Explain photo, barcode and automatic nutrition review

## Say it in the interview

"Each capture method produces a draft. The photo model lists foods and portions; a barcode fetches a packaged-food label; typed text follows the grammar. Nutrition lookups run automatically for foods with no usable saved values. I show the source and uncertainty, then ask the person to accept the food and separately confirm the meal."

## Photo path

`PlatePhoto.tsx` creates a local preview. `PhotoFoodsReader.tsx` redraws the selected image through `vision/shrinkPhoto.ts` as a small JPEG without the original metadata, then calls `/api/photo`. Upload requires the explicit button or the remembered automatic-photo opt-in. That preference defaults off and is a device choice, independent of Google sign-in.

The server's `photo.py` asks a hosted vision model for food names, amounts and permitted units, not nutrients. It checks item shapes, names and bounds and caps the list at eight foods. The checked strings become composer text only when the person chooses "Put these in the entry box". That action does not save a meal. Names and counts still need human review: the model previously confused tempeh with fried chicken. It cannot reliably infer grams from a photograph.

The on-device SigLIP2 model is a separate fallback. It predicts one label for the whole image, not every food, object count or package text. Its download is explicit and its model is cached after download. The photo action no longer waits for that large download. A new React selection key prevents an old response appearing under a replacement photo. See `m8-photo-flow-walkthrough.md` for the consent and late-reply details.

## Barcode path

The barcode card is on Today beside photo capture; Foods is the saved-food list. Only the barcode digits go to the optional service. `coach/barcode.py` uses Open Food Facts. Missing products, missing fields and an unreachable service must remain understandable outcomes. Database label values still need checking against the packet, because records and serving bases can differ. Nothing is saved just by looking up a code.

## Automatic estimates

`EstimateDraft.tsx` begins lookup when an unknown-food row opens. `api/estimate.ts` sends only its name and portion text and serialises requests in this tab to reduce bursts. Both successful and failed calls release the next queued row. A slow row can delay later rows; this queue is not a provider-quota guarantee.

The service checks composition data first, searches bounded public evidence on a miss and asks an available model only when needed. Database spreads describe the matching records; they are not statistical confidence intervals. AI proposals need usable values and genuine low/high bounds. Missing nutrients remain null, even if others are known. Energy is checked against 4P + 4C + 9F within the configured tolerance. This rejects contradictions; it cannot prove that a recipe or serving assumption is correct.

For multiple servings, the service asks for one item/container and scales values and bounds in code. `domain/nutrition/estimateInput.ts` preserves the original container count; `coach/portions.py` preserves the named container at the model boundary. See `m8-estimate-portions-walkthrough.md`. No density is invented to turn a bowl into grams.

"Use estimate" confirms a food version; "Save meal" is the separate diary write. Manual editing and unknown logging are fallbacks. Editing drops unsupported database provenance/ranges rather than pretending the edited numbers are still published label facts.

## Demo limitations

A model passing every numeric check can still use the wrong food or portion. Compare the Weetabix demo estimate with its packet and use a checked saved food for the reliable offline backup. Explain the uncertainty instead of presenting the estimate as measured nutrition.

Free-provider availability, package-database coverage and photo recognition are separate from UI correctness. Keep the recorded video as a fallback. Positive plate recognition and physical-phone capture require Yash's report; existing unit tests and a laptop screenshot do not establish those results.
