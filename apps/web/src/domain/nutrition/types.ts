/**
 * Shapes for food labels and their nutrients.
 */
import type { Quantity } from '../shared/units';

// A label can leave a nutrient blank; null keeps it unknown instead of becoming 0
export type NutrientValue = number | null;

// Every tracked nutrient, in the order a nutrition panel lists them. This is the one
// list the app derives the others from, so adding a nutrient is a change here.
// unsatfat_g is monounsaturated plus polyunsaturated fat; sodium is in milligrams.
export const NUTRIENT_KEYS = [
  'kcal', 'protein_g', 'carbs_g', 'fibre_g', 'total_sugar_g', 'added_sugar_g',
  'fat_g', 'satfat_g', 'unsatfat_g', 'sodium_mg',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

// Where a food's numbers came from, shown as a badge beside every row
export type SourceKind = 'label' | 'user_estimate' | 'fixture' | 'database' | 'ai_estimate' | 'web_estimate';

/** Describe the spread of known estimates on the same basis. */
export interface NutrientRange { low: number; high: number }

/**
 * One version of a food's label.
 *
 * Nutrients are given per basis quantity (e.g. per 250 mL). A missing key means
 * the label did not say, which is treated the same as null.
 */
export interface FoodVersion {
  id: string;
  version: number;
  name: string;
  // Other names the composer should recognise, e.g. "milo" for "Milo powder"
  aliases?: string[];
  basis: Quantity;
  nutrients: Partial<Record<NutrientKey, NutrientValue>>;
  range?: Partial<Record<NutrientKey, NutrientRange | null>>;
  source: { kind: SourceKind; reference?: string };
}
