/**
 * Shapes for food labels and their nutrients.
 */
import type { Quantity } from '../shared/units';

// A label can leave a nutrient blank; null keeps it unknown instead of becoming 0
export type NutrientValue = number | null;

export type NutrientKey = 'kcal' | 'protein_g' | 'fat_g' | 'satfat_g' | 'total_sugar_g' | 'added_sugar_g';

// Where a food's numbers came from, shown as a badge beside every row
export type SourceKind = 'label' | 'user_estimate' | 'fixture';

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
  source: { kind: SourceKind; reference?: string };
}
