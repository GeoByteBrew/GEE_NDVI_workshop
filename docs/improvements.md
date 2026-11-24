# What we improved

*Français : [improvements.fr.md](improvements.fr.md)*

This script builds on the Women in GIS workshop "Intro to Google Earth Engine – NDVI". Below are the main refinements: for each point, what the workshop version did, why it matters, and what this version does.

## 1. Scale factors (the most important methodological point)

**Workshop version.** The `SR_B*` bands of Landsat Collection 2 Level-2 are stored as integers (DN). Reflectance is `DN × 0.0000275 − 0.2`. NDVI was computed directly on the DN.

**Why it matters.** The ratio is not invariant to the −0.2 offset. NDVI computed on DN actually equals:

```
NDVI_raw = (NIR − R) / (NIR + R + 0.4)
```

Example for a dense forest pixel (R = 0.04, NIR = 0.45):

| | Red | NIR | NDVI |
|---|---|---|---|
| Raw DN | 9,091 | 23,636 | 0.46 |
| Reflectance | 0.04 | 0.45 | 0.84 |

Without scaling, NDVI values are underestimated and compressed. Visualisation parameters (`min: 7464, max: 12575`) were also in DN units.

**In this version.** Scaling inside `prepL8`, applied to every image before NDVI is computed. Visualisation in reflectance (`min: 0, max: 0.3`).

## 2. Exporting a single image

**Workshop version.** `Export.image.toDrive({image: ndvi, ...})` where `ndvi` is an `ImageCollection`.

**Why it matters.** `Export.image` expects a single `ee.Image`, so the task does not complete.

**In this version.** Export `input` (median NDVI), and add an export of the classes.

## 3. Ordered K-Means clusters

**Workshop version.** The palette goes from light to dark green and the legend shows 0 to 5, which suggests an NDVI order. K-Means cluster numbers are arbitrary.

**Why it matters.** The map and legend can be hard to interpret, and the order can change between runs.

**In this version.** Mean NDVI per cluster (`Reducer.mean().group`), sort, then `remap`: 0 = lowest NDVI, 5 = highest. `seed: 42` for reproducible sampling.

## 4. Composite on the study-area collection

**Workshop version.** `landsatColl.filterDate(...).mean()` on a collection with no spatial filter.

**In this version.** Composite on the collection filtered with `filterBounds(forests)`, using `median()` instead of `mean()`, which is more robust to leftover cloud residue.

## 5. Empty months in the time series

**Workshop version.** A month without any clear image can produce a band-less image through `mean()`.

**In this version.** An `n_images` property and an `n_images > 0` filter.

## 6. Chart reducer matches the title

**Workshop version.** `ee.Reducer.max()` with the title "Average NDVI". Note also that `scale` only sets the computation resolution — it does not turn the region into a single point.

**In this version.** `ee.Reducer.mean()`.

## 7. Other refinements

- Hand-drawn imports (`point`, `Maine`) removed so the script runs without drawing first.
- Unused single image from another area (California, T1) removed.
- End date set to `2026-01-01` so all of 2025 is included (GEE excludes the end date).
- `clipToCollection` used instead of `clip` on a FeatureCollection.
- Duplicate NDVI line removed.
- Legends factored into a single `makeLegend` function.

## 8. Google Drive folder name

**Tip.** If export fails with `Permission denied to create object in folder`, GEE resolves the `folder` parameter by name. A read-only shared folder with the same name can block the write.

**In this version.** A unique folder name (`GEE_NDVI_workshop`).

## 9. QGIS tips

- Use **Properties** (layer properties), not "Processing", for symbology.
- CRS spelling: **EPSG:4326**.
- TIGER shapefile field: `STATEFP`.
- When clipping, avoid `0` as NoData (it is a valid NDVI); use e.g. `-9999`.
