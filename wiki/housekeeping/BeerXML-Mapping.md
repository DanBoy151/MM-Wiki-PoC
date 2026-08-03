Reference for how `Templates/Recipe-Template.md` maps to the [BeerXML 1.0](http://www.beerxml.com/) `<RECIPE>` schema, used by `Tools/beerxml-convert.js`. Fixed units: fermentables in **kg**, hops/misc in **g** (converted to/from BeerXML's mandatory kg by the script), volumes in **L**, temperatures in **°C**.

## Recipe frontmatter → `RECIPE`

| Template field | BeerXML element | Notes |
|---|---|---|
| filename / `# Heading` | `NAME` | Taken from the file's first `# ` heading, falling back to the filename |
| `type` | `TYPE` | `All Grain` \| `Extract` \| `Partial Mash` |
| `brewer` | `BREWER` | |
| `style` | `STYLE` block | Resolved from the linked style page — see below |
| `batch_size_l` | `BATCH_SIZE` | liters |
| `boil_size_l` | `BOIL_SIZE` | liters |
| `boil_time_min` | `BOIL_TIME` | minutes |
| `efficiency_pct` | `EFFICIENCY` | percent |
| `og` / `fg` | `OG` / `FG` | specific gravity, e.g. `1.050` |
| `ibu` | `IBU` | |
| `srm` | `EST_COLOR` | SRM |
| `abv` | `EST_ABV` | percent |
| `primary_age_days` | `PRIMARY_AGE` | days |
| `primary_temp_c` | `PRIMARY_TEMP` | °C |
| `carbonation_type` | `FORCED_CARBONATION` | `keg`/`forced` → `TRUE`, `bottle` → `FALSE` |
| `priming_sugar_name` | `PRIMING_SUGAR_NAME` | |
| `priming_sugar_equiv_kg` | `PRIMING_SUGAR_EQUIV` | |
| `taste_rating` | `TASTE_RATING` | 0-50 |
| `## Tasting Notes` body | `TASTE_NOTES` | |
| `## Brewer's Notes` body | `NOTES` | |
| `event`, `placement` | — | wiki-only, no BeerXML equivalent; dropped on export, left blank on import |

## `## Fermentables` table → `FERMENTABLES/FERMENTABLE`

| Column | Element |
|---|---|
| Name | `NAME` |
| Amount (kg) | `AMOUNT` |
| Type | `TYPE` (Grain \| Sugar \| Extract \| Dry Extract \| Adjunct) |
| Yield (%) | `YIELD` |
| Color (SRM) | `COLOR` |
| Add After Boil | `ADD_AFTER_BOIL` (TRUE/FALSE) |

## `## Hops` table → `HOPS/HOP`

| Column | Element |
|---|---|
| Name | `NAME` |
| Amount (g) | `AMOUNT` (converted to kg) |
| Alpha (%) | `ALPHA` |
| Use | `USE` (Boil \| Dry Hop \| Mash \| First Wort \| Aroma) |
| Time (min) | `TIME` |
| Form | `FORM` (Pellet \| Plug \| Leaf) |

## `## Yeast` table → `YEASTS/YEAST`

| Column | Element |
|---|---|
| Name | `NAME` |
| Lab | `LABORATORY` |
| Product ID | `PRODUCT_ID` |
| Type | `TYPE` (Ale \| Lager \| Wheat \| Wine \| Champagne) |
| Form | `FORM` (Liquid \| Dry \| Slant \| Culture) |
| Attenuation (%) | `ATTENUATION` |

## `## Misc / Water Agents` table → `MISCS/MISC`

| Column | Element |
|---|---|
| Name | `NAME` |
| Type | `TYPE` (Spice \| Fining \| Water Agent \| Herb \| Flavor \| Other) |
| Use | `USE` (Boil \| Mash \| Primary \| Secondary \| Bottling) |
| Time (min) | `TIME` |
| Amount | `AMOUNT` |

## `## Mash Steps` table → `MASH/MASH_STEPS/MASH_STEP`

| Column | Element |
|---|---|
| Step Name | `NAME` |
| Type | `TYPE` (Infusion \| Temperature \| Decoction) |
| Step Temp (C) | `STEP_TEMP` |
| Step Time (min) | `STEP_TIME` |
| Ramp Time (min) | `RAMP_TIME` |

## `STYLE` block resolution

The `style:` frontmatter is an Obsidian wikilink to a style page (e.g. `beer/bjcp-styles/21-style-ipa/American-IPA.md`). On `to-xml`, the converter:
1. Resolves the link to its file.
2. Reads `STYLE_NAME` from the filename and `CATEGORY`/`CATEGORY_NUMBER` from the parent folder name (`21-style-ipa` → category `IPA`, number `21`).
3. Parses that page's existing `## Vital Statistics` section (`OG: x – y`, `IBUs: x – y`, `FG: x – y`, `SRM: x – y`, `ABV: x – y%`) into `OG_MIN`/`OG_MAX`, `IBU_MIN`/`IBU_MAX`, `FG_MIN`/`FG_MAX`, `COLOR_MIN`/`COLOR_MAX`, `ABV_MIN`/`ABV_MAX`.

This avoids duplicating style ranges in every recipe page — they're read live from the style library built out under `beer/bjcp-styles/`.

## Known limitations

- `EQUIPMENT` and `WATERS` XML blocks are not modeled by the template and are ignored on import, omitted on export.
- BeerXML fields with no template column (hop `HSI`, yeast `FLOCCULATION`/`BEST_FOR`/`MAX_REUSE`, fermentable `MOISTURE`/`DIASTATIC_POWER`, etc.) are dropped on import and left absent on export.
- Only styles that exist as wiki pages with a `## Vital Statistics` section in the documented format resolve to a full `STYLE` block; an unresolved link falls back to an empty `STYLE` block with just the name.
