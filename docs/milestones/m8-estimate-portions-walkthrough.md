# Preserve portions and pace automatic estimates

## Explain it back

The composer deliberately leaves the mass of a bowl unknown. Its review row therefore has no numeric storage quantity for "2 bowls of dal". The old display helper removed the leading 2, then the estimate card filled in "1 bowl". That lost information before any provider was called.

`domain/nutrition/estimateInput.ts` now reads the original row text using the existing number/correction grammar. It separates a recognised container from the food and preserves its count: "2 bowls of dal" becomes food "dal", portion "2 bowl". A bare "12 almonds" remains 12 pieces and "150 g rice" remains 150 g. "bowl noodles" has no "of", so it remains a food name. An explicit review amount wins. No container-to-gram conversion or nutrient arithmetic is added.

The estimate card receives that prepared input; it no longer has its own container parser. Known saved-food names are passed through unchanged. Automatic estimates still fill proposals and require confirmation.

`api/estimate.ts` chains row requests in this tab. A second row waits for the first request to settle, including response validation. Success and failure both release the queue, so one missing food cannot block all later rows. Each network call retains its existing timeout; waiting rows can therefore take longer when providers are slow. Other tabs and devices have their own queues. This paces requests, not a promise of provider quota availability.

## Verification

Failing tests first reproduced the count loss through `parseEntry`, `toDraftRow` and `DraftCard`, and proved that requests previously started together. Regression cases cover counted bowls, half bowls, cups, pieces, grams and a food name containing "bowl". The queue test holds the first request open, checks the second has not started, then fails the first and checks the second is sent. Neither test accepts an estimate or saves a meal.

Phone: reload the rebuilt preview twice. Review "2 bowls of dal, 12 almonds". Check the food names and portions before accepting either estimate. Confirm that a provider failure leaves manual entry available and later rows still finish. Nutrition values remain estimates; a correct request portion is not evidence that a model recognised the food or serving accurately.


## Preserve the container at the service boundary too

The live browser exposed a second loss: `request_model` replaced any count with the text "1", so the model no longer knew whether it meant a bowl or a cup. The old portion parser also recognised bowls but not cups, glasses, cans, slices, spoons or mugs.

`coach/portions.py` now owns that grammar for both database lookup and model requests. It preserves the numeric count on the existing piece/serving basis and supplies "1 bowl", "1 cup", etc. to the model before code multiplies nutrients and ranges. Bare pieces still use "1". No density or container weight is invented. A prompt rule makes the named container take precedence over a generic serving. Tests first failed for the erased plate name and lost container counts; the final suite has 203 coach tests. Grams and millilitres retain their physical units.

The live pre-service-fix browser check showed the corrected request and a range-labelled, unsaved estimate. Its generic "For 2 pieces" line describes the internal serving basis, not two literal pieces of dal. Serving-size assumptions still need review; a container count is not a measured weight.
