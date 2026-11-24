// =====================================================================
// GEE NDVI Workshop – Analysing NDVI with Google Earth Engine
// Builds on the Women in GIS workshop script with refinements below.
// ---------------------------------------------------------------------
// Based on: Women in GIS workshop "Intro to Google Earth Engine –
// Utilizing GEE to Analyze NDVI" (2026-10-15).
// Main improvements (details in docs/improvements.md):
//  1. Landsat C2 L2 scale factors (x0.0000275 - 0.2) are applied,
//     so NDVI is computed on true surface reflectance.
//  2. Hand-drawn imports ('point', 'Maine') removed: runs as is.
//  3. Unused single image from another area removed.
//  4. Composite built from the filtered collection (median).
//  5. K-Means clusters renumbered by mean NDVI
//     (0 = lowest NDVI ... 5 = highest) so the legend is meaningful.
//  6. Months without images are dropped from the time series.
//  7. Chart reducer matches its title: mean.
//  8. Export receives a single ee.Image (not an ImageCollection).
// =====================================================================

Map.setCenter(-70.372, 45.476, 8);


// ---------------------------------------------------------------------
// 1. GEOMETRY
// ---------------------------------------------------------------------

// A single point: [longitude, latitude]
var pt1 = ee.Geometry.Point([-70.7029, 45.3211]);
Map.addLayer(pt1, {color: '00E5F8'}, 'Point');

// Polygon defined by its vertices
var region = ee.Geometry.Polygon([[
  [-70.7029, 45.3211],
  [-70.7029, 45.1511],
  [-70.4118, 45.1511],
  [-70.4118, 45.3211]
]]);
Map.addLayer(region, {color: '00E5F8'}, 'Defined polygon');

// US county boundaries (US Census TIGER 2018)
var counties = ee.FeatureCollection('TIGER/2018/Counties');

// STATEFP = state code (23 Maine, 33 New Hampshire, 50 Vermont).
// Two filters, because several states have an "Essex" or "Franklin" county.
var me = counties.filter(ee.Filter.and(
  ee.Filter.eq('STATEFP', '23'), ee.Filter.eq('NAME', 'Franklin')));
var nh = counties.filter(ee.Filter.and(
  ee.Filter.eq('STATEFP', '33'), ee.Filter.eq('NAME', 'Coos')));
var vt = counties.filter(ee.Filter.and(
  ee.Filter.eq('STATEFP', '50'), ee.Filter.eq('NAME', 'Essex')));

Map.addLayer(me, {color: '560133'}, 'Franklin County');
Map.addLayer(nh, {color: 'FFCCFE'}, 'Coos County');
Map.addLayer(vt, {color: '00AF8E'}, 'Essex County');

// Merge the three counties (order: Essex, Coos, Franklin)
var forests = vt.merge(nh).merge(me);
print('Counties', forests);


// ---------------------------------------------------------------------
// 2. LANDSAT 8: FILTER, MASK CLOUDS, SCALE
// ---------------------------------------------------------------------

var startDate = '2014-01-01';
var endDate   = '2026-01-01';   // end date is excluded -> 2025 included

// Preparation applied to every image
function prepL8(image) {
  var qa = image.select('QA_PIXEL');
  // QA_PIXEL bits: bit 3 = cloud, bit 4 = cloud shadow
  var cloud  = 1 << 3;
  var shadow = 1 << 4;
  var mask = qa.bitwiseAnd(cloud).eq(0)
    .and(qa.bitwiseAnd(shadow).eq(0));

  // Raw digital numbers (DN) -> surface reflectance (0–1)
  var sr = image.select('SR_B.').multiply(0.0000275).add(-0.2);

  // Replace the original bands, apply the mask.
  // addBands/updateMask keep the image properties (including the date).
  return image.addBands(sr, null, true).updateMask(mask);
}

var landsat = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterDate(startDate, endDate)
  .filterBounds(forests)
  .map(prepL8);

print('Number of Landsat images', landsat.size());

// True-colour display (reflectance 0–0.3)
var landsatVisParams = {bands: ['SR_B4', 'SR_B3', 'SR_B2'], min: 0, max: 0.3};
Map.addLayer(landsat, landsatVisParams, 'Landsat collection', false);

// One image: the temporal median of every pixel.
// The median is more robust than the mean to leftover clouds.
var image1 = landsat.median().clip(region);
Map.addLayer(image1, landsatVisParams, 'Landsat composite (region)');


// ---------------------------------------------------------------------
// 3. NDVI
// ---------------------------------------------------------------------

// NDVI = (NIR - Red) / (NIR + Red) -> Landsat 8: NIR = SR_B5, Red = SR_B4
function addNDVI(image) {
  var nd = image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
  return image.addBands(nd).select('NDVI');   // date property is kept
}

var ndviVis = {min: 0, max: 0.9, palette: ['8c510a', 'f6e8c3', '1a9850']};

// For a single image
var ndvi1 = addNDVI(image1);
Map.addLayer(ndvi1, ndviVis, 'NDVI (composite)', false);

// For the whole collection
var ndvi = landsat.map(addNDVI);
Map.addLayer(ndvi.median(), ndviVis, 'NDVI (collection median)');


// ---------------------------------------------------------------------
// 4. UNSUPERVISED CLASSIFICATION (K-MEANS)
// ---------------------------------------------------------------------

var input = ndvi.median();   // single-band NDVI image

var training = input.sample({
  region: forests.geometry(),
  scale: 30,
  numPixels: 5000,
  seed: 42,          // same sample on every run
  tileScale: 4
});

var nClusters = 6;
var clusterer = ee.Clusterer.wekaKMeans(nClusters).train(training);
var clustered = input.cluster(clusterer);   // band name: 'cluster'

// K-Means cluster numbers are arbitrary. Compute the mean NDVI of each
// cluster, then renumber them from lowest to highest.
var stats = input.addBands(clustered).reduceRegion({
  reducer: ee.Reducer.mean().group({groupField: 1, groupName: 'cluster'}),
  geometry: forests.geometry(),
  scale: 100,
  maxPixels: 1e13,
  tileScale: 4
});
var groups = ee.List(stats.get('groups'));
var ids   = groups.map(function (g) { return ee.Dictionary(g).get('cluster'); });
var means = groups.map(function (g) { return ee.Dictionary(g).get('mean'); });
var order = ids.sort(means);   // cluster ids sorted by increasing mean NDVI
print('Clusters sorted by mean NDVI', order, 'Means', means.sort());

var ranked = clustered
  .remap(order, ee.List.sequence(0, order.size().subtract(1)))
  .rename('class');

var palette = ['AFFF2A', '00F407', '00D302', '009503', '007702', '004002'];
var classVis = {min: 0, max: nClusters - 1, palette: palette};

Map.addLayer(ranked.clip(region), classVis, 'NDVI classes (region)');
Map.addLayer(ranked.clipToCollection(forests), classVis, 'NDVI classes (counties)', false);


// ---------------------------------------------------------------------
// 5. TIME SERIES CHARTS (summer months: June–August)
// ---------------------------------------------------------------------

var years  = ee.List.sequence(2014, 2025);
var months = ee.List.sequence(6, 8);

var summerNDVI = ee.ImageCollection.fromImages(
  years.map(function (y) {
    return months.map(function (m) {
      var filtered = ndvi
        .filter(ee.Filter.calendarRange(y, y, 'year'))
        .filter(ee.Filter.calendarRange(m, m, 'month'));
      return filtered.mean().set({
        year: y,
        month: m,
        n_images: filtered.size(),
        'system:time_start': ee.Date.fromYMD(y, m, 1).millis()
      });
    });
  }).flatten()
).filter(ee.Filter.gt('n_images', 0));   // drop months without images

print('Number of summer monthly images', summerNDVI.size());

// One region
var chartRegion = ui.Chart.image.series({
  imageCollection: summerNDVI,
  region: region,
  reducer: ee.Reducer.mean(),
  scale: 100,
  xProperty: 'system:time_start'
})
  .setSeriesNames(['NDVI'])
  .setOptions({
    title: 'Mean monthly NDVI of the region (June–August)',
    hAxis: {title: 'Date', titleTextStyle: {italic: false, bold: true}},
    vAxis: {title: 'NDVI', titleTextStyle: {italic: false, bold: true}},
    lineWidth: 2,
    pointSize: 4,
    colors: ['#3a8f1c']
  });
print(chartRegion);

// Three counties
var chartCounties = ui.Chart.image.seriesByRegion({
  imageCollection: summerNDVI,
  regions: forests,
  reducer: ee.Reducer.mean(),
  band: 'NDVI',
  scale: 500,
  seriesProperty: 'NAME',
  xProperty: 'system:time_start'
})
  .setOptions({
    title: 'Mean monthly NDVI by county (June–August)',
    hAxis: {title: 'Date', titleTextStyle: {italic: false, bold: true}},
    vAxis: {title: 'NDVI', titleTextStyle: {italic: false, bold: true}},
    lineWidth: 2,
    pointSize: 4,
    colors: ['#00AF8E', '#FFCCFE', '#560133']
  });
print(chartCounties);


// ---------------------------------------------------------------------
// 6. LEGENDS
// ---------------------------------------------------------------------

function makeRow(color, name) {
  var colorBox = ui.Label({
    style: {backgroundColor: '#' + color, padding: '8px', margin: '0 0 4px 0'}
  });
  var description = ui.Label({value: name, style: {margin: '0 0 4px 6px'}});
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
}

function makeLegend(title, colors, names) {
  var panel = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
  panel.add(ui.Label({
    value: title,
    style: {fontWeight: 'bold', fontSize: '16px', margin: '0 0 4px 0', padding: '0'}
  }));
  for (var i = 0; i < colors.length; i++) {
    panel.add(makeRow(colors[i], names[i]));
  }
  return panel;
}

Map.add(makeLegend('NDVI classes', palette, [
  '0 · lowest NDVI', '1', '2', '3', '4', '5 · highest NDVI'
]));
Map.add(makeLegend('Counties',
  ['00AF8E', 'FFCCFE', '560133'],
  ['Essex County (VT)', 'Coos County (NH)', 'Franklin County (ME)']
));


// ---------------------------------------------------------------------
// 7. EXPORT (start each task from the Tasks tab with "Run")
// ---------------------------------------------------------------------
// Use a unique folder name: GEE finds the Drive folder by NAME, and a
// read-only shared folder with the same name makes the export fail.

var exportFolder = 'GEE_NDVI_workshop';

Export.image.toDrive({
  image: input.toFloat(),          // must be a single ee.Image
  description: 'ndvi_forests',
  folder: exportFolder,
  region: forests.geometry().bounds(),
  scale: 30,
  crs: 'EPSG:4326',                // for measurements, 'EPSG:32619' (UTM 19N) is better
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ranked.toByte(),
  description: 'ndvi_classes_forests',
  folder: exportFolder,
  region: forests.geometry().bounds(),
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.table.toDrive({
  collection: forests,
  description: 'forests',
  folder: exportFolder,
  fileFormat: 'SHP'
});
