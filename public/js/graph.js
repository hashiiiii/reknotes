// force-graph-3d.js must load first to provide the ForceGraph3D global.

document.addEventListener("DOMContentLoaded", function () {
  var container = document.getElementById("graph-container");
  if (!container) return;

  // Reuse the early request so graph data loads alongside the rendering script.
  var dataPromise = window.__graphDataPromise
    || fetch("/api/graph").then(function (r) { return r.json(); });
  dataPromise.then(function (data) { initCosmicGraph(container, data); });
});

var CAMERA = {
  DISTANCE:          300,
  MINI_PADDING:      10,    // Pixel padding keeps mini-graph labels inside the viewport.
  DURATION:          4000,  // Milliseconds, shared by the main and mini graph.
  DELAY:             2000,  // Wait for physics cooldown before camera movement (milliseconds).
  INIT_FAR_Z_FACTOR: 400,   // Scale the initial camera distance by the cube root of the node count.
};

var FORCE = {
  ALPHA_DECAY:     0.02,
  VELOCITY_DECAY:  0.3,
  WARMUP_TICKS:    100,
  COOLDOWN_TICKS:  110,    // About 1.8 seconds at 60 fps; keep shorter than CAMERA.DELAY.
  CHARGE_STRENGTH: -60,
  LINK_DISTANCE:   50,
};

// Tags with more notes use hotter stellar classes with stronger spikes, glow, and pulses.
var STAR_CLASSES = [
  { min: 0,  color: "rgba(255,160,110,0.85)",  label: "rgba(255,190,150,0.9)",   spikes: 4,  spikeW: 1.0, spikeLen: 0.25, glow: 1, pulseAmp: 0.03, pulseSpd: 0.8  }, // M-type red dwarf
  { min: 3,  color: "rgba(255,210,140,0.88)",  label: "rgba(255,225,170,0.92)",  spikes: 4,  spikeW: 1.4, spikeLen: 0.30, glow: 1, pulseAmp: 0.04, pulseSpd: 1.0  }, // K-type orange star
  { min: 5,  color: "rgba(255,245,200,0.90)",  label: "rgba(255,250,220,0.93)",  spikes: 6,  spikeW: 1.8, spikeLen: 0.35, glow: 2, pulseAmp: 0.05, pulseSpd: 1.2  }, // G-type Sun-like star
  { min: 8,  color: "rgba(240,245,255,0.92)",  label: "rgba(235,240,255,0.95)",  spikes: 6,  spikeW: 2.4, spikeLen: 0.40, glow: 2, pulseAmp: 0.06, pulseSpd: 1.5  }, // A-type white star
  { min: 12, color: "rgba(190,215,255,0.94)",  label: "rgba(195,220,255,0.95)",  spikes: 8,  spikeW: 3.0, spikeLen: 0.44, glow: 3, pulseAmp: 0.08, pulseSpd: 1.8  }, // B-type blue-white giant
  { min: 20, color: "rgba(150,185,255,0.96)",  label: "rgba(160,195,255,0.97)",  spikes: 8,  spikeW: 3.5, spikeLen: 0.48, glow: 3, pulseAmp: 0.10, pulseSpd: 2.0  }, // O-type blue supergiant
];

function getStarClass(val) {
  var cls = STAR_CLASSES[0];
  for (var i = 1; i < STAR_CLASSES.length; i++) {
    if (val >= STAR_CLASSES[i].min) cls = STAR_CLASSES[i];
  }
  return cls;
}

function buildAdjacency(data) {
  var adj = {};
  for (var i = 0; i < data.nodes.length; i++) adj[data.nodes[i].id] = new Set();
  for (var j = 0; j < data.links.length; j++) {
    var s = typeof data.links[j].source === "object" ? data.links[j].source.id : data.links[j].source;
    var t = typeof data.links[j].target === "object" ? data.links[j].target.id : data.links[j].target;
    if (adj[s]) adj[s].add(t);
    if (adj[t]) adj[t].add(s);
  }
  return adj;
}

var _highlightState = { active: false, nodeId: null, neighborIds: null };

// Looking inward from beyond the node keeps the graph center behind it.
// Near the origin, use the positive Z axis because there is no outward direction.
function cameraOffset(x, y, z) {
  var hyp = Math.hypot(x, y, z);
  if (hyp < 0.01) return { x: 0, y: 0, z: CAMERA.DISTANCE };
  var d = CAMERA.DISTANCE / hyp;
  return { x: x + x * d, y: y + y * d, z: z + z * d };
}

var _pulsingTags = [];

var NODE_COLORS = [
  "rgba(107,184,115,0.85)", "rgba(141,212,152,0.85)",
  "rgba(160,210,140,0.85)", "rgba(130,200,180,0.85)",
];

function assignNodeStyles(nodes) {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.type === "tag") {
      var cls = getStarClass(n.val);
      n._starClass = cls;
      n._color = cls.color;
      n._size = Math.max(8, Math.min(30, 8 + n.val * 2.2));
    } else {
      n._color = NODE_COLORS[i % NODE_COLORS.length];
      n._size = Math.max(3.5, Math.min(8, 3.5 + n.val * 0.9));
    }
  }
}

function initCosmicGraph(container, data) {
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  assignNodeStyles(data.nodes);

  var adjacency = buildAdjacency(data);

  var Graph = ForceGraph3D()(container)
    .graphData(data)
    .backgroundColor("#08080f")
    .showNavInfo(false)
    .nodeThreeObject(function (node) {
      var obj = createStarNode(node, DPR);
      if (_highlightState.active) {
        if (node.id === _highlightState.nodeId) {
          setNodeBrightness(obj, 1.4);
        } else if (_highlightState.neighborIds && _highlightState.neighborIds.has(node.id)) {
          setNodeBrightness(obj, 1.0);
        } else {
          setNodeBrightness(obj, 0.1);
        }
      }
      return obj;
    })
    .nodeLabel("")
    .linkColor(function (link) {
      if (!_highlightState.active) return "rgba(130,170,220,0.4)";
      var s = typeof link.source === "object" ? link.source.id : link.source;
      var t = typeof link.target === "object" ? link.target.id : link.target;
      var sel = _highlightState.nodeId;
      if (s === sel || t === sel) return "rgba(240,180,80,0.6)";
      return "rgba(100,140,200,0.08)";
    })
    .linkWidth(function (link) {
      if (!_highlightState.active) return 0.45;
      var s = typeof link.source === "object" ? link.source.id : link.source;
      var t = typeof link.target === "object" ? link.target.id : link.target;
      var sel = _highlightState.nodeId;
      if (s === sel || t === sel) return 1.2;
      return 0.15;
    })
    .linkOpacity(0.6)
    .linkDirectionalParticles(function (link) {
      if (!_highlightState.active) return 0;
      var s = typeof link.source === "object" ? link.source.id : link.source;
      var t = typeof link.target === "object" ? link.target.id : link.target;
      var sel = _highlightState.nodeId;
      if (s === sel || t === sel) return 3;
      return 0;
    })
    .linkDirectionalParticleWidth(0.8)
    .linkDirectionalParticleSpeed(0.004)
    .linkDirectionalParticleColor(function () {
      if (!_highlightState.active) return "rgba(150,200,255,0.4)";
      return "rgba(255,200,100,0.8)";
    })
    .d3AlphaDecay(FORCE.ALPHA_DECAY)
    .d3VelocityDecay(FORCE.VELOCITY_DECAY)
    .warmupTicks(FORCE.WARMUP_TICKS)
    .cooldownTicks(FORCE.COOLDOWN_TICKS)
    .onNodeHover(function (node) {
      container.style.cursor = node ? "pointer" : "default";
    })
    .onNodeClick(function (node) {
      highlightNeighbors(node, data, adjacency, Graph);
      // Capture coordinates before the panel changes the layout and moves the simulation.
      var nx = node.x, ny = node.y, nz = node.z;
      showPanel(node, data, Graph);
      Graph.cameraPosition(
        cameraOffset(nx, ny, nz),
        { x: nx, y: ny, z: nz },
        CAMERA.DURATION
      );
      var url = new URL(window.location);
      url.searchParams.set("node", node.id);
      history.pushState({ nodeId: node.id }, "", url);
    })
    .onBackgroundClick(function () {
      clearHighlights(data, Graph);
      dismissPanel();
    });

  Graph.d3Force("charge").strength(FORCE.CHARGE_STRENGTH);
  Graph.d3Force("link").distance(FORCE.LINK_DISTANCE);

  addStarfield(Graph);
  addBloom(Graph);

  startPulseAnimation();

  window._reknGraph = Graph;

  // Warmup establishes the layout; cooldown ends simulation before the camera
  // drifts from a wide view toward a random tag.
  var initNodeId = new URL(window.location).searchParams.get("node");
  if (!initNodeId) {
    // Setting the camera after graphData updates lastSetCameraZ and prevents automatic repositioning.
    var farZ = Math.cbrt(data.nodes.length) * CAMERA.INIT_FAR_Z_FACTOR;
    Graph.cameraPosition({ x: 0, y: 0, z: farZ });

    // Leave a two-second overview before approaching a random tag.
    setTimeout(function () {
      var tags = data.nodes.filter(function (n) { return n.type === "tag"; });
      if (tags.length === 0) return;
      var target = tags[Math.floor(Math.random() * tags.length)];
      if (!target.x && !target.y && !target.z) return;
      Graph.cameraPosition(
        cameraOffset(target.x, target.y, target.z),
        { x: target.x, y: target.y, z: target.z },
        CAMERA.DURATION
      );
    }, CAMERA.DELAY);
  }

  var closeBtn = document.getElementById("panel-close");
  if (closeBtn) closeBtn.addEventListener("click", function () {
    clearHighlights(data, Graph);
    dismissPanel();
  });

  window.addEventListener("popstate", function (evt) {
    var nodeId = evt.state && evt.state.nodeId;
    if (nodeId) {
      var node = data.nodes.find(function (n) { return n.id === nodeId; });
      if (node) {
        highlightNeighbors(node, data, adjacency, Graph);
        showPanel(node, data, Graph);
      }
    } else {
      clearHighlights(data, Graph);
      closePanel();
    }
  });

  if (initNodeId) {
    // Applying highlights immediately prevents unrelated nodes from flashing first.
    var initNode = data.nodes.find(function (n) { return n.id === initNodeId; });
    if (initNode) {
      highlightNeighbors(initNode, data, adjacency, Graph);
      // Resize for the panel first so the camera centers the node in the remaining viewport.
      showPanel(initNode, data, Graph);
      setTimeout(function () {
        var nx = initNode.x || 0, ny = initNode.y || 0, nz = initNode.z || 0;
        Graph.cameraPosition(
          cameraOffset(nx, ny, nz),
          { x: nx, y: ny, z: nz },
          CAMERA.DURATION
        );
      }, CAMERA.DELAY);
    }
  }

  window.addEventListener("resize", function () {
    Graph.width(container.clientWidth);
    Graph.height(container.clientHeight);
  });
}

var _pulseRunning = false;
function startPulseAnimation() {
  if (_pulseRunning) return;
  _pulseRunning = true;
  var startTime = performance.now();
  var lastUpdate = 0;
  var PULSE_INTERVAL = 33; // About 30 fps is sufficient for smooth pulses.
  (function tick() {
    var now = performance.now();
    if (now - lastUpdate >= PULSE_INTERVAL) {
      lastUpdate = now;
      var t = (now - startTime) / 1000;
      for (var i = 0; i < _pulsingTags.length; i++) {
        var entry = _pulsingTags[i];
        var pulse = 1 + Math.sin(t * entry.speed) * entry.amp;
        var base = entry.baseScale;
        entry.sprite.scale.set(base * pulse, base * pulse, 1);
        for (var g = 0; g < entry.glows.length; g++) {
          var gp = 1 + Math.sin(t * entry.speed * 0.7 + g * 0.8) * entry.amp * 1.5;
          var gb = entry.glowBaseScales[g];
          entry.glows[g].scale.set(gb * gp, gb * gp, 1);
        }
      }
    }
    requestAnimationFrame(tick);
  })();
}

function highlightNeighbors(node, data, adjacency, Graph) {
  var neighbors = adjacency[node.id] || new Set();
  _highlightState = { active: true, nodeId: node.id, neighborIds: neighbors };

  for (var i = 0; i < data.nodes.length; i++) {
    var n = data.nodes[i];
    var obj = n.__threeObj;
    if (!obj) continue;
    if (n.id === node.id) {
      setNodeBrightness(obj, 1.4);
    } else if (neighbors.has(n.id)) {
      setNodeBrightness(obj, 1.0);
    } else {
      setNodeBrightness(obj, 0.1);
    }
  }
  refreshLinks(Graph);
}

function clearHighlights(data, Graph) {
  _highlightState = { active: false, nodeId: null, neighborIds: null };
  for (var i = 0; i < data.nodes.length; i++) {
    var obj = data.nodes[i].__threeObj;
    if (obj) setNodeBrightness(obj, 1.0);
  }
  refreshLinks(Graph);
}

function refreshLinks(Graph) {
  Graph.linkColor(Graph.linkColor())
    .linkWidth(Graph.linkWidth())
    .linkDirectionalParticles(Graph.linkDirectionalParticles())
    .linkDirectionalParticleColor(Graph.linkDirectionalParticleColor());
}

function setNodeBrightness(group, brightness) {
  group.traverse(function (child) {
    if (child.material) {
      if (child.material._baseOpacity == null) child.material._baseOpacity = child.material.opacity;
      child.material.opacity = child.material._baseOpacity * brightness;
    }
  });
}


function createStarNode(node, DPR) {
  var size = node._size || 4;
  var color = node._color || "rgba(200,200,255,0.8)";
  var isTag = node.type === "tag";
  var group = new THREE.Group();

  var starSprite = createStarSprite(node, size, color, isTag, DPR);
  group.add(starSprite);

  // Higher stellar classes need additional glow layers around their tag sprites.
  var glowSprites = [];
  var glowBaseScales = [];
  if (isTag) {
    var cls = node._starClass || STAR_CLASSES[0];
    for (var g = 0; g < cls.glow; g++) {
      var gs = createGlowLayer(color, size, g, DPR);
      group.add(gs);
      glowSprites.push(gs);
      glowBaseScales.push(gs.scale.x);
    }
    _pulsingTags.push({
      sprite: starSprite,
      baseScale: starSprite.scale.x,
      speed: cls.pulseSpd,
      amp: cls.pulseAmp,
      glows: glowSprites,
      glowBaseScales: glowBaseScales,
    });
  }

  var label = createTextLabel(node, isTag, DPR);
  label.position.set(0, -(size * 1.2 + 5), 0);
  group.add(label);

  return group;
}

function createStarSprite(node, size, color, isTag, DPR) {
  var res = Math.round(128 * DPR);
  var canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  var ctx = canvas.getContext("2d");
  var cx = res / 2;
  var cy = res / 2;

  var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, res / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.08, color);
  gradient.addColorStop(0.25, color.replace(/[\d.]+\)$/, "0.3)"));
  gradient.addColorStop(0.6, color.replace(/[\d.]+\)$/, "0.05)"));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, res, res);

  var coreRad = isTag ? res * 0.07 : res * 0.09;
  var coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRad);
  coreGrad.addColorStop(0, "rgba(255,255,255,0.97)");
  coreGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, res, res);

  if (isTag) {
    var cls = node._starClass || STAR_CLASSES[0];
    drawSpikes(ctx, cx, cy, res, cls, color, DPR);
  }

  var texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  var material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material._baseOpacity = 1.0;
  var sprite = new THREE.Sprite(material);
  var s = size * 2.5;
  sprite.scale.set(s, s, 1);
  return sprite;
}

function drawSpikes(ctx, cx, cy, res, cls, color, DPR) {
  var spikeCount = cls.spikes;
  var spikeLen = res * cls.spikeLen;
  var spikeW = cls.spikeW * DPR;

  for (var a = 0; a < spikeCount; a++) {
    var angle = (a * Math.PI * 2) / spikeCount;
    var endX = cx + Math.cos(angle) * spikeLen;
    var endY = cy + Math.sin(angle) * spikeLen;

    var sg = ctx.createLinearGradient(cx, cy, endX, endY);
    sg.addColorStop(0, color.replace(/[\d.]+\)$/, "0.7)"));
    sg.addColorStop(0.6, color.replace(/[\d.]+\)$/, "0.2)"));
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.strokeStyle = sg;
    ctx.lineWidth = spikeW;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Classes G and above add thinner, slightly longer secondary spikes.
    if (cls.glow >= 2) {
      var subLen = spikeLen * 1.3;
      var subEndX = cx + Math.cos(angle) * subLen;
      var subEndY = cy + Math.sin(angle) * subLen;
      var sg2 = ctx.createLinearGradient(cx, cy, subEndX, subEndY);
      sg2.addColorStop(0, color.replace(/[\d.]+\)$/, "0.25)"));
      sg2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = sg2;
      ctx.lineWidth = spikeW * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(subEndX, subEndY);
      ctx.stroke();
    }
  }
}

function createGlowLayer(color, size, layerIndex, DPR) {
  var res = Math.round(64 * DPR);
  var canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  var ctx = canvas.getContext("2d");
  var cx = res / 2;
  var cy = res / 2;

  var alphaBase = 0.12 - layerIndex * 0.03;
  var gradient = ctx.createRadialGradient(cx, cy, res * 0.05, cx, cy, res / 2);
  gradient.addColorStop(0, color.replace(/[\d.]+\)$/, alphaBase + ")"));
  gradient.addColorStop(0.5, color.replace(/[\d.]+\)$/, alphaBase * 0.4 + ")"));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, res, res);

  var texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  var material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  var opacity = 0.6 - layerIndex * 0.15;
  material.opacity = opacity;
  material._baseOpacity = opacity;
  var sprite = new THREE.Sprite(material);
  var scale = size * (3.5 + layerIndex * 2.0);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function createTextLabel(node, isTag, DPR) {
  var text = isTag ? "#" + node.label : node.label;
  var baseFontSize = isTag ? 26 : 18;
  var maxChars = isTag ? 20 : 16;
  if (text.length > maxChars) text = text.substring(0, maxChars) + "…";

  var fontSize = Math.round(baseFontSize * DPR);
  var fontStr = (isTag ? "600 " : "500 ") + fontSize + "px -apple-system, 'Helvetica Neue', Arial, sans-serif";

  var measure = document.createElement("canvas").getContext("2d");
  measure.font = fontStr;
  var textWidth = Math.ceil(measure.measureText(text).width);
  var padX = Math.round(20 * DPR);
  var padY = Math.round(14 * DPR);

  // Exact text dimensions avoid unused canvas space; power-of-two dimensions are unnecessary.
  var cw = textWidth + padX * 2;
  var ch = Math.round(fontSize * 1.2) + padY * 2;

  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");

  // A corner radius of half the height gives the label a pill-shaped background.
  var radius = ch / 2;
  ctx.fillStyle = isTag ? "rgba(12,12,28,0.6)" : "rgba(12,12,28,0.35)";
  roundRect(ctx, 0, 0, cw, ch, radius);
  ctx.fill();

  ctx.font = fontStr;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (isTag) {
    var cls = node._starClass || STAR_CLASSES[0];
    ctx.fillStyle = cls.label;
  } else {
    ctx.fillStyle = "rgba(210,210,220,0.8)";
  }
  ctx.fillText(text, cw / 2, ch / 2);

  var texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 2;
  var material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  material._baseOpacity = 1.0;
  var sprite = new THREE.Sprite(material);
  var aspect = cw / ch;
  var worldScale = isTag ? 18 : 10;
  sprite.scale.set(worldScale * aspect, worldScale, 1);
  return sprite;
}

function nextPow2(v) { var p = 1; while (p < v) p *= 2; return p; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function addStarfield(Graph) {
  var scene = Graph.scene();
  var count = 2500;
  var positions = new Float32Array(count * 3);
  var spread = 1800;

  for (var i = 0; i < count; i++) {
    // Uniform directions and cube-root-scaled radii give uniform density throughout the sphere.
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(2 * Math.random() - 1);
    var r = Math.cbrt(Math.random()) * spread / 2;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  var material = new THREE.PointsMaterial({
    color: 0x6688bb, size: 0.7, transparent: true, opacity: 0.45,
    sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  var stars = new THREE.Points(geometry, material);
  scene.add(stars);

  (function animate() {
    stars.rotation.y += 0.00004;
    stars.rotation.x += 0.00001;
    requestAnimationFrame(animate);
  })();
}

function addBloom(Graph) {
  if (typeof THREE.EffectComposer === "undefined") return;
  try {
    var composer = new THREE.EffectComposer(Graph.renderer());
    composer.addPass(new THREE.RenderPass(Graph.scene(), Graph.camera()));
    composer.addPass(new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.3
    ));
    Graph.postProcessingComposer(composer);
  } catch (e) {
    console.info("Bloom not available, using default rendering");
  }
}


function showPanel(node, data) {
  var panel = document.getElementById("graph-panel");
  var content = document.getElementById("panel-content");
  if (!panel || !content) return;

  var neighborNotes = [];
  for (var i = 0; i < data.links.length; i++) {
    var link = data.links[i];
    var neighborId = null;
    if (link.source === node.id || (link.source && link.source.id === node.id)) {
      neighborId = typeof link.target === "object" ? link.target.id : link.target;
    } else if (link.target === node.id || (link.target && link.target.id === node.id)) {
      neighborId = typeof link.source === "object" ? link.source.id : link.source;
    }
    if (neighborId) {
      var neighbor = data.nodes.find(function (n) { return n.id === neighborId; });
      if (neighbor && neighbor.type === "note" && neighbor.id !== node.id) {
        neighborNotes.push(neighbor);
      }
    }
  }

  var seen = {};
  neighborNotes = neighborNotes.filter(function (n) {
    if (seen[n.id]) return false;
    seen[n.id] = true;
    return true;
  });

  var noteList = neighborNotes.map(function (n) {
    return '<a href="/notes/' + n.id.replace("note-", "") + '" class="panel-note-link">' +
      '<span class="panel-note-title">' + escapeHtml(n.label) + '</span>' +
      '<span class="panel-note-date">' + formatDate(n.created_at) + '</span>' +
      '</a>';
  }).join("");

  if (node.type === "note") {
    content.innerHTML =
      '<div class="panel-header">' +
        '<h2 class="panel-title">' + escapeHtml(node.label) + '</h2>' +
        '<time class="panel-date">' + formatDate(node.created_at) + '</time>' +
      '</div>' +
      (node.snippet ? '<p class="panel-snippet">' + escapeHtml(node.snippet) + '...</p>' : '') +
      '<a href="/notes/' + node.id.replace("note-", "") + '" class="btn btn-primary panel-open-btn">ノートを開く</a>' +
      (neighborNotes.length > 0
        ? '<div class="panel-section"><h3>同じタグのノート (' + neighborNotes.length + ')</h3><div class="panel-note-list">' + noteList + '</div></div>'
        : '');
  } else if (node.type === "tag") {
    content.innerHTML =
      '<div class="panel-header">' +
        '<h2 class="panel-title">#' + escapeHtml(node.label) + '</h2>' +
        '<p class="panel-tag-count">' + neighborNotes.length + ' ノート</p>' +
      '</div>' +
      (neighborNotes.length > 0
        ? '<div class="panel-section"><h3>ノート一覧</h3><div class="panel-note-list">' + noteList + '</div></div>'
        : '');
  }

  panel.hidden = false;
}

function dismissPanel() {
  closePanel();
  var url = new URL(window.location);
  url.searchParams.delete("node");
  history.pushState({}, "", url);
}

function closePanel() {
  var panel = document.getElementById("graph-panel");
  if (panel) panel.hidden = true;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  var d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}


function initMiniGraph(container, data, focusNodeId) {
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  assignNodeStyles(data.nodes);

  var Graph = ForceGraph3D()(container)
    .width(container.clientWidth)
    .height(container.clientHeight)
    .graphData(data)
    .backgroundColor("#08080f")
    .showNavInfo(false)
    .nodeThreeObject(function (node) {
      return createStarNode(node, DPR);
    })
    .nodeLabel("")
    .linkColor(function () { return "rgba(130,170,220,0.4)"; })
    .linkWidth(0.45)
    .linkOpacity(0.6)
    .linkDirectionalParticles(0)
    .d3AlphaDecay(FORCE.ALPHA_DECAY)
    .d3VelocityDecay(FORCE.VELOCITY_DECAY)
    .warmupTicks(FORCE.WARMUP_TICKS)
    .cooldownTicks(FORCE.COOLDOWN_TICKS)
    .onNodeHover(function (node) {
      container.style.cursor = node ? "pointer" : "default";
    })
    .onNodeClick(function (node) {
      if (node.type === "note") {
        window.location.href = "/notes/" + node.id.replace("note-", "");
      } else if (node.type === "tag") {
        window.location.href = "/graph?node=" + encodeURIComponent(node.id);
      }
    });

  Graph.d3Force("charge").strength(FORCE.CHARGE_STRENGTH);
  Graph.d3Force("link").distance(FORCE.LINK_DISTANCE);

  addStarfield(Graph);

  // Fit the warmed-up graph with extra padding to keep labels from overlapping its edges.
  setTimeout(function () { Graph.zoomToFit(CAMERA.DURATION, CAMERA.MINI_PADDING); }, CAMERA.DELAY);

  startPulseAnimation();
}

// The note template's inline script needs this global entry point.
window.initMiniGraph = initMiniGraph;
