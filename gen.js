const fs = require('fs'), path = require('path');
const base = __dirname;  // always relative to gen.js location

// Auto-discover animation folders: any folder that contains a matching _ske.json
function formatName(str) {
  // "HelloWave" → "Hello Wave", "ArrivalDeparture" → "Arrival Departure"
  return str.replace(/([a-z])([A-Z])/g, '$1 $2');
}

const anims = fs.readdirSync(base)
  .filter(f => {
    const skeFile = path.join(base, f, f + '_ske.json');
    try { return fs.statSync(path.join(base, f)).isDirectory() && fs.existsSync(skeFile); }
    catch { return false; }
  })
  .sort()
  .map(folder => {
    const sep = folder.indexOf('_');
    const categoryKey = folder.slice(0, sep);
    const animKey     = folder.slice(sep + 1);
    return {
      folder,
      anim:     folder,
      category: formatName(categoryKey),
      label:    formatName(animKey),
    };
  });

if (!anims.length) { console.error('No animation folders found.'); process.exit(1); }

// Use the skeleton with the most animations — it will be the most complete one
const richest = anims.reduce((best, a) => {
  const ske = JSON.parse(fs.readFileSync(path.join(base, a.folder, a.folder + '_ske.json'), 'utf8'));
  const count = ske.armature[0].animation.length;
  return count > best.count ? { folder: a.folder, count } : best;
}, { folder: anims[0].folder, count: 0 }).folder;

const skeData = JSON.parse(fs.readFileSync(path.join(base, richest, richest + '_ske.json'), 'utf8'));
const texData = JSON.parse(fs.readFileSync(path.join(base, richest, richest + '_tex.json'), 'utf8'));
// Embed PNG as base64 — avoids file:// cross-origin block in WebGL texImage2D
const pngB64 = 'data:image/png;base64,' +
  fs.readFileSync(path.join(base, richest, richest + '_tex.png')).toString('base64');
console.log('Using skeleton from:', richest, '(' + skeData.armature[0].animation.length + ' animations)');

// aabb: x=-516.19, y=-1189.49, w=1285.14, h=1505.34 (same for all)
const CW = 260, CH = 300;
const SCALE  = Math.min(CW / 1285.14, CH / 1505.34);
// Armature center in DragonBones space (used to keep character centred when zooming)
const AABB_CX = (-516.19 + 1285.14 / 2).toFixed(4);   //  126.38
const AABB_CY = (-1189.49 + 1505.34 / 2).toFixed(4);  // -436.82

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wisp Animations</title>
  <script src="pixi.min.js"></` + `script>
  <script src="dragonBones.js"></` + `script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #111;
      color: #eee;
      padding: 32px 24px;
    }
    h1 {
      text-align: center;
      font-size: 1.6rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      margin-bottom: 40px;
      color: #fff;
    }
    .section { margin-bottom: 40px; }
    .section-title {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #555;
      border-bottom: 1px solid #222;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .row { display: flex; flex-wrap: wrap; gap: 24px; }
    .card {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 12px;
      padding: 16px;
      width: ${CW + 32}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: #555; }
    .card canvas { border-radius: 8px; display: block; }
    .label { text-align: center; font-size: 0.78rem; line-height: 1.5; }
    .label .name { color: #ddd; font-weight: 500; }
    .download {
      display: inline-block;
      font-size: 0.75rem;
      padding: 5px 14px;
      border: 1px solid #444;
      border-radius: 6px;
      color: #bbb;
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
    }
    .download:hover { background: #333; color: #fff; }
    .about {
      max-width: 560px;
      margin: 0 auto 48px;
      text-align: center;
      color: #888;
      font-size: 0.82rem;
      line-height: 1.7;
    }
    .about a { color: #aaa; text-decoration: none; border-bottom: 1px solid #333; }
    .about a:hover { color: #fff; border-color: #666; }
    .slider-wrap {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.68rem;
      color: #555;
    }
    .slider-wrap input[type=range] {
      flex: 1;
      accent-color: #666;
      cursor: pointer;
    }
    #status { text-align: center; color: #888; font-size: 0.8rem; margin-bottom: 16px; min-height: 1.2em; }
  </style>
</head>
<body>
  <h1>Wisp Animations</h1>
  <p class="about">
    A collection of <strong style="color:#ccc">DragonBones skeletal animations</strong> for the Wisp character,
    rendered live in the browser via PixiJS. Each card plays the animation in real time —
    click <em>Download ZIP</em> to grab the skeleton, texture atlas, and atlas data ready to drop into your project.
    <br><br>
    Made by <a href="https://github.com/VukSDev" target="_blank">VukSDev</a>.
  </p>
  <p id="status">Loading texture...</p>
  <div id="sections"></div>

  <script>
var ANIMS    = ${JSON.stringify(anims)};
var SKE_DATA = ${JSON.stringify(skeData)};
var TEX_DATA = ${JSON.stringify(texData)};
var PNG_SRC  = ${JSON.stringify(pngB64)};
var CW = ${CW}, CH = ${CH}, SCALE = ${SCALE.toFixed(6)};
var AABB_CX = ${AABB_CX}, AABB_CY = ${AABB_CY};

(function buildCards() {
  var container = document.getElementById('sections');
  var seen = {}, categories = [];
  ANIMS.forEach(function(a) {
    if (!seen[a.category]) { seen[a.category] = true; categories.push(a.category); }
  });

  categories.forEach(function(cat) {
    var section = document.createElement('div');
    section.className = 'section';

    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = cat;
    section.appendChild(title);

    var row = document.createElement('div');
    row.className = 'row';

    ANIMS.forEach(function(a, i) {
      if (a.category !== cat) return;
      var card = document.createElement('div');
      card.className = 'card';

      var canvas = document.createElement('canvas');
      canvas.width = CW; canvas.height = CH; canvas.id = 'cv' + i;
      card.appendChild(canvas);

      var lbl = document.createElement('div');
      lbl.className = 'label';
      var nm = document.createElement('span'); nm.className = 'name'; nm.textContent = a.label;
      lbl.appendChild(nm);
      card.appendChild(lbl);

      var sliderWrap = document.createElement('div');
      sliderWrap.className = 'slider-wrap';
      var zoomOut = document.createElement('span'); zoomOut.textContent = '−';
      var slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0.5'; slider.max = '2'; slider.step = '0.01'; slider.value = '0.75';
      slider.id = 'sl' + i;
      var zoomIn = document.createElement('span'); zoomIn.textContent = '+';
      sliderWrap.appendChild(zoomOut);
      sliderWrap.appendChild(slider);
      sliderWrap.appendChild(zoomIn);
      card.appendChild(sliderWrap);

      var dl = document.createElement('a');
      dl.className = 'download';
      dl.href = a.folder + '/' + a.folder + '.zip';
      dl.setAttribute('download', '');
      dl.textContent = 'Download ZIP';
      card.appendChild(dl);

      row.appendChild(card);
    });

    section.appendChild(row);
    container.appendChild(section);
  });
})();

var img = new Image();
img.onload = function() {
  try {
    var factory = dragonBones.PixiFactory.factory;
    var baseTexture = new PIXI.BaseTexture(img);
    factory.parseDragonBonesData(SKE_DATA);
    factory.parseTextureAtlasData(TEX_DATA, baseTexture);

    ANIMS.forEach(function(a, i) {
      var canvas = document.getElementById('cv' + i);
      var app = new PIXI.Application({
        width: CW, height: CH,
        backgroundColor: 0x2a2a2a,
        view: canvas,
        antialias: true,
        forceCanvas: true,
      });
      var display = factory.buildArmatureDisplay('Armature');
      if (!display) { console.error('buildArmatureDisplay failed for', a.anim); return; }

      function applyZoom(zoom) {
        var s = SCALE * zoom;
        display.scale.set(s);
        display.x = CW / 2 - AABB_CX * s;
        display.y = CH / 2 - AABB_CY * s;
      }
      applyZoom(0.75);
      app.stage.addChild(display);
      display.animation.play(a.anim, 0);

      var slider = document.getElementById('sl' + i);
      if (slider) slider.addEventListener('input', function() { applyZoom(parseFloat(this.value)); });
    });

    document.getElementById('status').style.display = 'none';
  } catch(e) {
    document.getElementById('status').textContent = 'Error: ' + e.message;
    console.error(e);
  }
};
img.onerror = function() {
  document.getElementById('status').textContent = 'Could not load texture';
};
img.src = PNG_SRC;
  </` + `script>
</body>
</html>`;

fs.writeFileSync(path.join(base, 'index.html'), html, 'utf8');
console.log('Written index.html —', Math.round(html.length / 1024) + 'KB (' + anims.length + ' animations)');
