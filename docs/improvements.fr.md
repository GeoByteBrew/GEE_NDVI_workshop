# Ce que nous avons amélioré

*English: [improvements.md](improvements.md)*

Ce script s'appuie sur l'atelier Women in GIS « Intro to Google Earth Engine – NDVI ». Voici les principaux raffinements : pour chaque point, ce que faisait la version atelier, pourquoi c'est important, et ce que fait cette version.

## 1. Facteurs d'échelle (le point méthodologique le plus important)

**Version atelier.** Les bandes `SR_B*` de Landsat Collection 2 Level-2 sont stockées en entiers (DN). La réflectance s'obtient par `DN × 0,0000275 − 0,2`. Le NDVI était calculé directement sur les DN.

**Pourquoi c'est important.** Le ratio n'est pas invariant au décalage de −0,2. Le NDVI calculé sur les DN vaut en réalité :

```
NDVI_brut = (PIR − R) / (PIR + R + 0,4)
```

Exemple pour un pixel de forêt dense (R = 0,04 ; PIR = 0,45) :

| | Rouge | PIR | NDVI |
|---|---|---|---|
| DN bruts | 9 091 | 23 636 | 0,46 |
| Réflectance | 0,04 | 0,45 | 0,84 |

Sans mise à l'échelle, les NDVI sont sous-estimés et compressés. Les paramètres de visualisation (`min: 7464, max: 12575`) étaient aussi exprimés en DN.

**Dans cette version.** Mise à l'échelle dans `prepL8`, appliquée à chaque image avant le calcul du NDVI. Visualisation en réflectance (`min: 0, max: 0.3`).

## 2. Export d'une seule image

**Version atelier.** `Export.image.toDrive({image: ndvi, ...})` où `ndvi` est une `ImageCollection`.

**Pourquoi c'est important.** `Export.image` attend une seule `ee.Image`, donc la tâche ne se termine pas.

**Dans cette version.** Export de `input` (médiane du NDVI) et ajout de l'export des classes.

## 3. Clusters K-Means ordonnés

**Version atelier.** La palette va du vert clair au vert foncé et la légende affiche 0 à 5, ce qui suggère un ordre de NDVI. Or les numéros de K-Means sont arbitraires.

**Pourquoi c'est important.** La carte et la légende peuvent être difficiles à interpréter, et l'ordre peut changer d'une exécution à l'autre.

**Dans cette version.** NDVI moyen par cluster (`Reducer.mean().group`), tri, puis `remap` : 0 = NDVI le plus faible, 5 = le plus élevé. `seed: 42` pour un échantillonnage reproductible.

## 4. Composite sur la collection de la zone d'étude

**Version atelier.** `landsatColl.filterDate(...).mean()` sur une collection sans filtre spatial.

**Dans cette version.** Composite sur la collection filtrée par `filterBounds(forests)`, avec `median()` au lieu de `mean()`, plus robuste aux résidus de nuages.

## 5. Mois vides dans la série temporelle

**Version atelier.** Un mois sans image claire peut produire une image sans bande via `mean()`.

**Dans cette version.** Propriété `n_images` et filtre `n_images > 0`.

## 6. Réducteur aligné avec le titre du graphique

**Version atelier.** `ee.Reducer.max()` avec le titre « Average NDVI ». À noter aussi : `scale` fixe seulement la résolution de calcul — il ne transforme pas la région en un seul point.

**Dans cette version.** `ee.Reducer.mean()`.

## 7. Autres raffinements

- Imports dessinés (`point`, `Maine`) retirés : le script tourne sans dessin préalable.
- Image isolée d'une autre zone (Californie, T1) retirée.
- Date de fin `2026-01-01` pour inclure tout 2025 (GEE exclut la date de fin).
- `clipToCollection` à la place de `clip` sur une FeatureCollection.
- Ligne NDVI dupliquée retirée.
- Légendes factorisées dans une fonction `makeLegend`.

## 8. Nom du dossier Google Drive

**Astuce.** Si l'export échoue avec `Permission denied to create object in folder`, GEE résout le paramètre `folder` par nom. Un dossier partagé en lecture seule portant le même nom peut bloquer l'écriture.

**Dans cette version.** Nom de dossier unique (`GEE_NDVI_workshop`).

## 9. Astuces QGIS

- Utiliser **Properties** (propriétés de la couche), pas « Processing », pour la symbologie.
- Orthographe du SCR : **EPSG:4326**.
- Champ du shapefile TIGER : `STATEFP`.
- Au découpage, éviter `0` comme NoData (valeur NDVI valide) ; utiliser par ex. `-9999`.
