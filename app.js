(function (global) {
  "use strict";

  const SAMPLE_FILE = "HH-186-15-3090x9A_IESNA2002.IES";
  const DEG = Math.PI / 180;
  const EPS = 1e-7;

  const state = {
    ies: null,
    surface: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    distributionGroup: null,
    displayMode: "render",
    autoRotate: true,
    radiusScale: 4.2,
    scaleMode: "linear",
    opacity: 0.92,
    profilePlaneAngle: 45,
    groundHeight: 1.5,
    groundRange: 3,
    illuminanceMode: "percent",
    illuminanceGridSize: 121,
    illuminanceData: null,
    hoveredIlluminanceContour: null,
    illuminanceFullscreenOpen: false,
    illuminanceShowLabels: false,
    raf: null,
  };

  const els = {};

  function init() {
    cacheElements();
    wireDomEvents();
    syncControlValues();
    initThree();
    drawEmptyPreview();
    drawEmptyIlluminance();

    if (global.lucide) {
      global.lucide.createIcons();
    }

    loadSampleFile();
  }

  function cacheElements() {
    [
      "scene",
      "resetViewBtn",
      "rotateBtn",
      "displayModeBtn",
      "captureBtn",
      "sceneTitle",
      "sceneMax",
      "fileInput",
      "sampleBtn",
      "dropZone",
      "fileName",
      "maxCandela",
      "maxAngle",
      "angleCounts",
      "inputWatts",
      "lampLumens",
      "estimatedLumens",
      "radiusSlider",
      "radiusValue",
      "scaleMode",
      "displayMode",
      "opacitySlider",
      "opacityValue",
      "customPlaneInput",
      "customPlaneLabel",
      "profileCanvas",
      "groundHeightInput",
      "groundRangeInput",
      "illuminanceMode",
      "illuminanceCanvas",
      "illuminanceFullscreenBtn",
      "illuminanceFullscreen",
      "illuminanceFullscreenCanvas",
      "illuminanceCloseBtn",
      "fullscreenValueToggleBtn",
      "centerLux",
      "maxLux",
      "maxLuxPoint",
      "avgLux",
      "keywordList",
      "warningPanel",
      "warningList",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function wireDomEvents() {
    els.fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) {
        readUploadedFile(file);
      }
    });

    els.sampleBtn.addEventListener("click", loadSampleFile);
    els.resetViewBtn.addEventListener("click", resetCamera);
    els.rotateBtn.addEventListener("click", () => {
      state.autoRotate = !state.autoRotate;
      state.controls.autoRotate = state.autoRotate;
      els.rotateBtn.classList.toggle("is-active", state.autoRotate);
    });

    els.displayModeBtn.addEventListener("click", () => {
      cycleDisplayMode();
      renderCurrentIes();
    });

    els.captureBtn.addEventListener("click", downloadCanvas);

    els.radiusSlider.addEventListener("input", () => {
      state.radiusScale = Number(els.radiusSlider.value);
      els.radiusValue.value = state.radiusScale.toFixed(1);
      renderCurrentIes();
    });

    els.scaleMode.addEventListener("change", () => {
      state.scaleMode = els.scaleMode.value;
      renderCurrentIes();
    });

    els.displayMode.addEventListener("change", () => {
      state.displayMode = els.displayMode.value;
      updateDisplayModeUi();
      renderCurrentIes();
    });

    els.opacitySlider.addEventListener("input", () => {
      state.opacity = Number(els.opacitySlider.value);
      els.opacityValue.value = state.opacity.toFixed(2);
      renderCurrentIes();
    });

    els.customPlaneInput.addEventListener("input", () => {
      state.profilePlaneAngle = parseProfilePlaneAngle(els.customPlaneInput.value);
      updateProfilePlaneUi();
      if (state.ies) {
        drawPolarPreview(state.ies);
      }
    });

    els.customPlaneInput.addEventListener("change", () => {
      if (state.profilePlaneAngle != null) {
        els.customPlaneInput.value = formatPlaneAngle(state.profilePlaneAngle);
      }
    });

    els.groundHeightInput.addEventListener("input", () => {
      state.groundHeight = parsePositiveNumber(els.groundHeightInput.value, state.groundHeight);
      renderGroundIlluminance();
    });

    els.groundHeightInput.addEventListener("change", () => {
      els.groundHeightInput.value = formatInputNumber(state.groundHeight, 2);
    });

    els.groundRangeInput.addEventListener("input", () => {
      state.groundRange = parsePositiveNumber(els.groundRangeInput.value, state.groundRange);
      renderGroundIlluminance();
    });

    els.groundRangeInput.addEventListener("change", () => {
      els.groundRangeInput.value = formatInputNumber(state.groundRange, 2);
    });

    els.illuminanceMode.addEventListener("change", () => {
      state.illuminanceMode = els.illuminanceMode.value;
      renderGroundIlluminance();
    });

    els.illuminanceCanvas.addEventListener("pointermove", handleIlluminancePointerMove);
    els.illuminanceCanvas.addEventListener("pointerdown", handleIlluminancePointerMove);
    els.illuminanceCanvas.addEventListener("pointerleave", clearIlluminanceHover);
    els.illuminanceFullscreenBtn.addEventListener("click", openIlluminanceFullscreen);
    els.illuminanceCloseBtn.addEventListener("click", closeIlluminanceFullscreen);
    els.fullscreenValueToggleBtn.addEventListener("click", toggleFullscreenValueLabels);
    els.illuminanceFullscreenCanvas.addEventListener("pointermove", handleFullscreenIlluminancePointerMove);
    els.illuminanceFullscreenCanvas.addEventListener("pointerdown", handleFullscreenIlluminancePointerMove);
    els.illuminanceFullscreenCanvas.addEventListener("pointerleave", clearFullscreenIlluminanceHover);

    ["dragenter", "dragover"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("is-dragging");
      });
    });

    els.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        readUploadedFile(file);
      }
    });

    window.addEventListener("resize", () => {
      resizeRenderer();
      resizeFullscreenIlluminance();
    });
    document.addEventListener("keydown", handleDocumentKeydown);
  }

  function syncControlValues() {
    els.radiusSlider.value = String(state.radiusScale);
    els.radiusValue.value = state.radiusScale.toFixed(1);
    els.scaleMode.value = state.scaleMode;
    els.displayMode.value = state.displayMode;
    updateDisplayModeUi();
    els.opacitySlider.value = String(state.opacity);
    els.opacityValue.value = state.opacity.toFixed(2);
    els.customPlaneInput.value = formatPlaneAngle(state.profilePlaneAngle);
    updateProfilePlaneUi();
    els.groundHeightInput.value = formatInputNumber(state.groundHeight, 2);
    els.groundRangeInput.value = formatInputNumber(state.groundRange, 2);
    els.illuminanceMode.value = state.illuminanceMode;
    updateFullscreenValueToggle();
  }

  function cycleDisplayMode() {
    const modes = ["render", "wire", "both"];
    const current = modes.indexOf(state.displayMode);
    state.displayMode = modes[(current + 1) % modes.length];
    els.displayMode.value = state.displayMode;
    updateDisplayModeUi();
  }

  function updateDisplayModeUi() {
    const label = displayModeLabel(state.displayMode);
    els.displayModeBtn.title = `顯示模式：${label}`;
    els.displayModeBtn.setAttribute("aria-label", `顯示模式：${label}`);
    els.displayModeBtn.classList.toggle("is-active", state.displayMode !== "render");
  }

  function initThree() {
    if (!global.THREE) {
      showWarnings(["Three.js 載入失敗，請確認網路或 CDN 存取。"]);
      return;
    }

    const THREE = global.THREE;
    const rect = els.scene.getBoundingClientRect();

    state.scene = new THREE.Scene();
    state.scene.fog = new THREE.Fog(0x101114, 12, 26);

    state.camera = new THREE.PerspectiveCamera(42, rect.width / Math.max(rect.height, 1), 0.05, 80);
    state.camera.position.set(6.5, 4.8, 7.2);

    state.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.setSize(rect.width, rect.height);
    state.renderer.outputEncoding = THREE.sRGBEncoding;
    els.scene.appendChild(state.renderer.domElement);

    state.controls = new THREE.OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.08;
    state.controls.autoRotate = state.autoRotate;
    state.controls.autoRotateSpeed = 0.55;
    state.controls.target.set(0, 0, 0);

    state.scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 0.82);
    key.position.set(5, 8, 6);
    state.scene.add(key);
    const fill = new THREE.DirectionalLight(0x2ec4b6, 0.28);
    fill.position.set(-5, -2, -4);
    state.scene.add(fill);

    state.distributionGroup = new THREE.Group();
    state.scene.add(state.distributionGroup);
    state.scene.add(createReferenceGrid(5.2));

    animate();
  }

  function animate() {
    state.raf = requestAnimationFrame(animate);
    if (!state.renderer || !state.scene || !state.camera) {
      return;
    }
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
  }

  function resizeRenderer() {
    if (!state.renderer || !state.camera) {
      return;
    }
    const rect = els.scene.getBoundingClientRect();
    state.camera.aspect = rect.width / Math.max(rect.height, 1);
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(rect.width, rect.height);
  }

  function openIlluminanceFullscreen() {
    state.illuminanceFullscreenOpen = true;
    state.hoveredIlluminanceContour = null;
    els.illuminanceFullscreen.hidden = false;
    document.body.classList.add("has-illuminance-fullscreen");
    updateFullscreenValueToggle();
    resizeFullscreenIlluminance();
  }

  function closeIlluminanceFullscreen() {
    state.illuminanceFullscreenOpen = false;
    state.hoveredIlluminanceContour = null;
    els.illuminanceFullscreen.hidden = true;
    document.body.classList.remove("has-illuminance-fullscreen");
    if (state.illuminanceData) {
      drawIlluminanceMap(state.illuminanceData);
    }
  }

  function toggleFullscreenValueLabels() {
    state.illuminanceShowLabels = !state.illuminanceShowLabels;
    updateFullscreenValueToggle();
    drawFullscreenIlluminance();
  }

  function updateFullscreenValueToggle() {
    if (!els.fullscreenValueToggleBtn) {
      return;
    }
    els.fullscreenValueToggleBtn.setAttribute("aria-pressed", state.illuminanceShowLabels ? "true" : "false");
  }

  function resizeFullscreenIlluminance() {
    if (!state.illuminanceFullscreenOpen || !els.illuminanceFullscreenCanvas) {
      return;
    }
    const stage = els.illuminanceFullscreenCanvas.parentElement;
    const rect = stage.getBoundingClientRect();
    const width = Math.max(360, Math.floor(rect.width));
    const height = Math.max(320, Math.floor(rect.height));
    if (els.illuminanceFullscreenCanvas.width !== width || els.illuminanceFullscreenCanvas.height !== height) {
      els.illuminanceFullscreenCanvas.width = width;
      els.illuminanceFullscreenCanvas.height = height;
      state.hoveredIlluminanceContour = null;
    }
    drawFullscreenIlluminance();
  }

  function drawFullscreenIlluminance() {
    if (!state.illuminanceFullscreenOpen || !els.illuminanceFullscreenCanvas) {
      return;
    }
    if (!state.illuminanceData) {
      drawEmptyIlluminanceCanvas(els.illuminanceFullscreenCanvas);
      return;
    }
    drawIlluminanceMap(state.illuminanceData, els.illuminanceFullscreenCanvas, {
      showLabels: state.illuminanceShowLabels,
      labelFontSize: 12,
    });
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape" && state.illuminanceFullscreenOpen) {
      closeIlluminanceFullscreen();
    }
  }

  function resetCamera() {
    if (!state.camera || !state.controls) {
      return;
    }
    state.camera.position.set(6.5, 4.8, 7.2);
    state.controls.target.set(0, 0, 0);
    state.controls.update();
  }

  async function loadSampleFile() {
    try {
      setFileName("讀取範例中...");
      const response = await fetch(SAMPLE_FILE, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      loadIesText(text, SAMPLE_FILE);
    } catch (error) {
      setFileName("請選擇 .IES 檔案");
      showWarnings([`範例檔無法自動載入：${error.message}`]);
    }
  }

  function readUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      loadIesText(String(reader.result || ""), file.name);
    };
    reader.onerror = () => {
      showWarnings([`檔案讀取失敗：${file.name}`]);
    };
    reader.readAsText(file);
  }

  function loadIesText(text, filename) {
    try {
      const ies = parseIes(text, filename);
      state.ies = ies;
      setFileName(filename);
      updateInfoPanel(ies);
      renderCurrentIes();
      drawPolarPreview(ies);
      renderGroundIlluminance();
      showWarnings(ies.warnings);
    } catch (error) {
      showWarnings([error.message]);
    }
  }

  function setFileName(value) {
    els.fileName.textContent = value;
  }

  function parseIes(text, filename) {
    const cleaned = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "");
    const lines = cleaned.split("\n");
    const nonEmptyFirst = lines.find((line) => line.trim().length > 0) || "";
    const version = nonEmptyFirst.trim();
    const warnings = [];

    if (!/^IESNA:LM-63/i.test(version)) {
      warnings.push("第一行不是 IESNA:LM-63 標記，仍會嘗試解析。");
    }

    const tiltIndex = lines.findIndex((line) => /^\s*TILT\s*=/i.test(line));
    if (tiltIndex < 0) {
      throw new Error("找不到 TILT= 行，無法定位 LM-63 數值區。");
    }

    const keywords = parseKeywords(lines.slice(0, tiltIndex));
    const tiltLine = lines[tiltIndex].trim();
    const tiltMode = tiltLine.split("=")[1] ? tiltLine.split("=").slice(1).join("=").trim() : "";
    const numericText = lines.slice(tiltIndex + 1).join("\n");
    const tokens = tokenizeNumbers(numericText);
    let index = 0;

    function need(count, label) {
      if (index + count > tokens.length) {
        throw new Error(`${label} 數值不足，需要 ${count} 個，剩餘 ${tokens.length - index} 個。`);
      }
    }

    function readNumber(label) {
      need(1, label);
      return tokens[index++];
    }

    function readInt(label) {
      return Math.round(readNumber(label));
    }

    let tilt = { mode: tiltMode || "NONE", geometry: null, angles: [], multipliers: [] };
    if (/^INCLUDE$/i.test(tilt.mode)) {
      tilt.geometry = readInt("TILT geometry");
      const tiltCount = readInt("TILT angle count");
      need(tiltCount, "TILT angles");
      tilt.angles = tokens.slice(index, index + tiltCount);
      index += tiltCount;
      need(tiltCount, "TILT multipliers");
      tilt.multipliers = tokens.slice(index, index + tiltCount);
      index += tiltCount;
    } else if (!/^NONE$/i.test(tilt.mode)) {
      warnings.push("TILT 外部檔未載入，本 viewer 只顯示主配光資料。");
    }

    // LM-63-2002 numeric block after TILT: 13 header fields, vertical angles,
    // horizontal angles, then candela values by horizontal plane.
    const header = {
      numLamps: readInt("number of lamps"),
      lumensPerLamp: readNumber("lumens per lamp"),
      candelaMultiplier: readNumber("candela multiplier"),
      numVerticalAngles: readInt("number of vertical angles"),
      numHorizontalAngles: readInt("number of horizontal angles"),
      photometricType: readInt("photometric type"),
      unitsType: readInt("units type"),
      width: readNumber("width"),
      length: readNumber("length"),
      height: readNumber("height"),
      ballastFactor: readNumber("ballast factor"),
      ballastLampPhotometricFactor: readNumber("ballast lamp photometric factor"),
      inputWatts: readNumber("input watts"),
    };

    if (header.numVerticalAngles <= 0 || header.numHorizontalAngles <= 0) {
      throw new Error("角度數量必須大於 0。");
    }

    need(header.numVerticalAngles, "vertical angles");
    const verticalAngles = tokens.slice(index, index + header.numVerticalAngles);
    index += header.numVerticalAngles;

    need(header.numHorizontalAngles, "horizontal angles");
    const horizontalAngles = tokens.slice(index, index + header.numHorizontalAngles);
    index += header.numHorizontalAngles;

    const valueCount = header.numVerticalAngles * header.numHorizontalAngles;
    need(valueCount, "candela table");
    const candela = [];
    let maxCandela = -Infinity;
    let minCandela = Infinity;
    let maxLocation = { hIndex: 0, vIndex: 0, horizontal: 0, vertical: 0 };
    let sumCandela = 0;

    for (let h = 0; h < header.numHorizontalAngles; h += 1) {
      const row = [];
      for (let v = 0; v < header.numVerticalAngles; v += 1) {
        const value = tokens[index++] * header.candelaMultiplier;
        row.push(value);
        sumCandela += value;
        if (value > maxCandela) {
          maxCandela = value;
          maxLocation = {
            hIndex: h,
            vIndex: v,
            horizontal: horizontalAngles[h],
            vertical: verticalAngles[v],
          };
        }
        if (value < minCandela) {
          minCandela = value;
        }
      }
      candela.push(row);
    }

    if (tokens.length > index) {
      warnings.push(`檔案尾端有 ${tokens.length - index} 個未使用數值。`);
    }

    if (header.photometricType !== 1) {
      warnings.push("目前 3D 幾何以 Type C 顯示，Type A/B 檔案的方向可能需要額外轉換。");
    }

    if (header.numHorizontalAngles > 1) {
      const firstH = horizontalAngles[0];
      const lastH = horizontalAngles[horizontalAngles.length - 1];
      if (Math.abs(lastH - firstH) < 359 && !(almost(firstH, 0) && (almost(lastH, 90) || almost(lastH, 180)))) {
        warnings.push("水平角未覆蓋完整 360 度，曲面可能不是封閉形狀。");
      }
    }

    const ies = {
      filename: filename || "",
      version,
      keywords,
      tilt,
      header,
      verticalAngles,
      horizontalAngles,
      candela,
      warnings,
      stats: {
        maxCandela,
        minCandela,
        averageCandela: sumCandela / Math.max(valueCount, 1),
        maxLocation,
        estimatedLumens: null,
      },
    };
    ies.stats.estimatedLumens = estimateLumens(ies);
    return ies;
  }

  function parseKeywords(lines) {
    const keywords = {};
    let lastKey = null;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || /^IESNA:LM-63/i.test(trimmed)) {
        return;
      }
      const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (match) {
        const key = match[1].trim().toUpperCase();
        const value = match[2].trim();
        if (key === "MORE" && lastKey) {
          keywords[lastKey] = `${keywords[lastKey] || ""} ${value}`.trim();
        } else {
          if (keywords[key]) {
            keywords[key] = `${keywords[key]} ${value}`.trim();
          } else {
            keywords[key] = value;
          }
          lastKey = key;
        }
      }
    });
    return keywords;
  }

  function tokenizeNumbers(text) {
    const matches = String(text || "").match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/g);
    return matches ? matches.map(Number) : [];
  }

  function renderCurrentIes() {
    if (!state.ies || !state.scene || !global.THREE) {
      return;
    }

    clearDistribution();
    state.surface = expandHorizontalData(state.ies);
    const meshGroup = createDistributionSurface(state.ies, state.surface);
    state.distributionGroup.add(meshGroup);
    updateSceneLabels(state.ies);
  }

  function clearDistribution() {
    if (!state.distributionGroup) {
      return;
    }
    while (state.distributionGroup.children.length) {
      const child = state.distributionGroup.children.pop();
      disposeObject(child);
    }
  }

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
      if (child.texture) {
        child.texture.dispose();
      }
    });
  }

  function createDistributionSurface(ies, surface) {
    const THREE = global.THREE;
    const group = new THREE.Group();
    const verticalAngles = ies.verticalAngles;
    const maxCd = Math.max(ies.stats.maxCandela, EPS);
    const hCount = surface.angles.length;
    const vCount = verticalAngles.length;
    const positions = [];
    const colors = [];
    const indices = [];

    for (let h = 0; h < hCount; h += 1) {
      const phi = surface.angles[h] * DEG;
      for (let v = 0; v < vCount; v += 1) {
        const theta = verticalAngles[v] * DEG;
        const cd = Math.max(surface.rows[h][v], 0);
        const normalized = cd / maxCd;
        const radius = intensityRadius(normalized) * state.radiusScale;
        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = -radius * Math.cos(theta);
        const z = radius * Math.sin(theta) * Math.sin(phi);
        positions.push(x, y, z);
        const color = colorForIntensity(normalized);
        colors.push(color.r, color.g, color.b);
      }
    }

    for (let h = 0; h < hCount - 1; h += 1) {
      for (let v = 0; v < vCount - 1; v += 1) {
        const a = h * vCount + v;
        const b = (h + 1) * vCount + v;
        const c = (h + 1) * vCount + v + 1;
        const d = h * vCount + v + 1;
        indices.push(a, b, d, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    if (state.displayMode !== "wire") {
      const material = new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide,
        vertexColors: true,
        roughness: 0.48,
        metalness: 0.02,
        transparent: state.opacity < 1,
        opacity: state.opacity,
      });

      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);
    }

    if (state.displayMode !== "render") {
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: state.displayMode === "wire" ? 0x9ffcf2 : 0xf1f3f5,
          transparent: true,
          opacity: state.displayMode === "wire" ? 0.72 : 0.22,
        })
      );
      group.add(wire);
    }

    const maxPoint = createMaxPointMarker(ies);
    group.add(maxPoint);
    return group;
  }

  function createMaxPointMarker(ies) {
    const THREE = global.THREE;
    const max = ies.stats.maxLocation;
    const cd = ies.stats.maxCandela;
    const normalized = cd / Math.max(ies.stats.maxCandela, EPS);
    const radius = intensityRadius(normalized) * state.radiusScale;
    const theta = max.vertical * DEG;
    const phi = max.horizontal * DEG;
    const markerGeometry = new THREE.SphereGeometry(0.075, 18, 18);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.set(
      radius * Math.sin(theta) * Math.cos(phi),
      -radius * Math.cos(theta),
      radius * Math.sin(theta) * Math.sin(phi)
    );
    return marker;
  }

  function createReferenceGrid(radius) {
    const THREE = global.THREE;
    const group = new THREE.Group();
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x4b5563, transparent: true, opacity: 0.34 });
    const axisMaterialX = new THREE.LineBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.78 });
    const axisMaterialY = new THREE.LineBasicMaterial({ color: 0xf1f3f5, transparent: true, opacity: 0.58 });
    const axisMaterialZ = new THREE.LineBasicMaterial({ color: 0x2ec4b6, transparent: true, opacity: 0.78 });

    [1.5, 3, 4.5].forEach((r) => {
      const points = [];
      for (let i = 0; i <= 160; i += 1) {
        const a = (i / 160) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(geometry, gridMaterial));
    });

    group.add(lineBetween(new THREE.Vector3(-radius, 0, 0), new THREE.Vector3(radius, 0, 0), axisMaterialX));
    group.add(lineBetween(new THREE.Vector3(0, -radius, 0), new THREE.Vector3(0, radius, 0), axisMaterialY));
    group.add(lineBetween(new THREE.Vector3(0, 0, -radius), new THREE.Vector3(0, 0, radius), axisMaterialZ));
    return group;
  }

  function lineBetween(start, end, material) {
    const THREE = global.THREE;
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    return new THREE.Line(geometry, material);
  }

  function intensityRadius(value) {
    const n = Math.max(0, Math.min(1, value));
    return n;
  }

  function colorForIntensity(value) {
    const THREE = global.THREE;
    const stops = [
      { at: 0, color: new THREE.Color("#25323a") },
      { at: 0.18, color: new THREE.Color("#2ec4b6") },
      { at: 0.48, color: new THREE.Color("#ffd166") },
      { at: 0.78, color: new THREE.Color("#f77f00") },
      { at: 1, color: new THREE.Color("#f8f9fa") },
    ];
    const n = Math.max(0, Math.min(1, value));
    for (let i = 1; i < stops.length; i += 1) {
      if (n <= stops[i].at) {
        const previous = stops[i - 1];
        const current = stops[i];
        const t = (n - previous.at) / Math.max(current.at - previous.at, EPS);
        return previous.color.clone().lerp(current.color, t);
      }
    }
    return stops[stops.length - 1].color.clone();
  }

  function expandHorizontalData(ies) {
    const angles = ies.horizontalAngles;
    const rows = ies.candela;
    const first = angles[0];
    const last = angles[angles.length - 1];
    const step = inferStep(angles) || 5;

    if (angles.length <= 1) {
      return { angles: [0, 360], rows: [rows[0], rows[0].slice()] };
    }

    if (Math.abs(last - first) >= 359 - EPS) {
      const fullAngles = angles.slice();
      const fullRows = rows.map((row) => row.slice());
      if (!almost(fullAngles[fullAngles.length - 1], fullAngles[0] + 360)) {
        fullAngles.push(fullAngles[0] + 360);
        fullRows.push(fullRows[0].slice());
      }
      return { angles: fullAngles, rows: fullRows };
    }

    if (almost(first, 0) && almost(last, 180)) {
      return generateSymmetricSurface(ies, step, (angle) => {
        const wrapped = positiveMod(angle, 360);
        return wrapped > 180 ? 360 - wrapped : wrapped;
      });
    }

    if (almost(first, 0) && almost(last, 90)) {
      return generateSymmetricSurface(ies, step, (angle) => {
        const wrapped = positiveMod(angle, 180);
        return wrapped > 90 ? 180 - wrapped : wrapped;
      });
    }

    return { angles: angles.slice(), rows: rows.map((row) => row.slice()) };
  }

  function generateSymmetricSurface(ies, step, reducer) {
    const targetAngles = [];
    const targetRows = [];
    const safeStep = Math.max(step, 1);
    for (let angle = 0; angle < 360 - EPS; angle += safeStep) {
      const reduced = reducer(angle);
      targetAngles.push(roundAngle(angle));
      targetRows.push(interpolateHorizontalRow(ies, reduced));
    }
    targetAngles.push(360);
    targetRows.push(targetRows[0].slice());
    return { angles: targetAngles, rows: targetRows };
  }

  function interpolateHorizontalRow(ies, angle) {
    const angles = ies.horizontalAngles;
    const rows = ies.candela;
    if (angle <= angles[0]) {
      return rows[0].slice();
    }
    if (angle >= angles[angles.length - 1]) {
      return rows[rows.length - 1].slice();
    }
    for (let i = 0; i < angles.length - 1; i += 1) {
      const a = angles[i];
      const b = angles[i + 1];
      if (angle >= a - EPS && angle <= b + EPS) {
        const t = (angle - a) / Math.max(b - a, EPS);
        return rows[i].map((value, idx) => value + (rows[i + 1][idx] - value) * t);
      }
    }
    return rows[0].slice();
  }

  function inferStep(angles) {
    let best = Infinity;
    for (let i = 1; i < angles.length; i += 1) {
      const delta = Math.abs(angles[i] - angles[i - 1]);
      if (delta > EPS && delta < best) {
        best = delta;
      }
    }
    return Number.isFinite(best) ? best : 0;
  }

  function estimateLumens(ies) {
    const surface = expandHorizontalData(ies);
    const vAngles = ies.verticalAngles;
    if (surface.angles.length < 2 || vAngles.length < 2) {
      return null;
    }

    let lumens = 0;
    for (let h = 0; h < surface.angles.length - 1; h += 1) {
      const phi1 = surface.angles[h] * DEG;
      const phi2 = surface.angles[h + 1] * DEG;
      const dPhi = Math.abs(phi2 - phi1);
      for (let v = 0; v < vAngles.length - 1; v += 1) {
        const theta1 = vAngles[v] * DEG;
        const theta2 = vAngles[v + 1] * DEG;
        const solidAngle = dPhi * Math.abs(Math.cos(theta1) - Math.cos(theta2));
        const avgCd = (
          surface.rows[h][v] +
          surface.rows[h + 1][v] +
          surface.rows[h][v + 1] +
          surface.rows[h + 1][v + 1]
        ) / 4;
        lumens += avgCd * solidAngle;
      }
    }
    return lumens;
  }

  function updateInfoPanel(ies) {
    const h = ies.header;
    const stats = ies.stats;
    els.maxCandela.textContent = formatNumber(stats.maxCandela, 2);
    els.maxAngle.textContent = `H ${formatNumber(stats.maxLocation.horizontal, 1)} / V ${formatNumber(stats.maxLocation.vertical, 1)}`;
    els.angleCounts.textContent = `${h.numVerticalAngles} x ${h.numHorizontalAngles}`;
    els.inputWatts.textContent = h.inputWatts > 0 ? `${formatNumber(h.inputWatts, 2)} W` : "--";
    els.lampLumens.textContent = h.lumensPerLamp > 0 ? `${formatNumber(h.lumensPerLamp * h.numLamps, 1)} lm` : "absolute";
    els.estimatedLumens.textContent = stats.estimatedLumens ? `${formatNumber(stats.estimatedLumens, 1)} lm` : "--";

    const list = [
      ["版本", ies.version || "--"],
      ["測試", ies.keywords.TEST || "--"],
      ["實驗室", ies.keywords.TESTLAB || "--"],
      ["製造商", ies.keywords.MANUFAC || "--"],
      ["型錄", ies.keywords.LUMCAT || "--"],
      ["燈具", ies.keywords.LUMINAIRE || "--"],
      ["TILT", ies.tilt.mode || "NONE"],
      ["Photometric Type", photometricTypeName(h.photometricType)],
      ["尺寸", `${formatNumber(h.width, 3)} x ${formatNumber(h.length, 3)} x ${formatNumber(h.height, 3)} ${h.unitsType === 2 ? "m" : "ft"}`],
    ];

    els.keywordList.innerHTML = "";
    list.forEach(([term, value]) => {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      wrap.append(dt, dd);
      els.keywordList.appendChild(wrap);
    });
  }

  function updateSceneLabels(ies) {
    const title = ies.keywords.LUMCAT || ies.keywords.LUMINAIRE || ies.filename || "IES 3D Viewer";
    els.sceneTitle.textContent = title;
    els.sceneMax.textContent = `${formatNumber(ies.stats.maxCandela, 1)} cd`;
  }

  function showWarnings(warnings) {
    const items = (warnings || []).filter(Boolean);
    els.warningPanel.hidden = items.length === 0;
    els.warningList.innerHTML = "";
    items.forEach((message) => {
      const li = document.createElement("li");
      li.textContent = message;
      els.warningList.appendChild(li);
    });
  }

  function drawEmptyPreview() {
    const canvas = els.profileCanvas;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPreviewGrid(ctx, canvas.width, canvas.height);
  }

  function drawPolarPreview(ies) {
    const canvas = els.profileCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    drawPreviewGrid(ctx, width, height);

    const maxCd = Math.max(ies.stats.maxCandela, EPS);
    drawOpposingPlaneCurve(ctx, ies, 0, 180, maxCd, "#2ec4b6");
    drawOpposingPlaneCurve(ctx, ies, 90, 270, maxCd, "#ffd166");
    if (state.profilePlaneAngle != null) {
      const customAngle = normalizePlaneAngle(state.profilePlaneAngle);
      const oppositeAngle = positiveMod(customAngle + 180, 360);
      drawOpposingPlaneCurve(ctx, ies, customAngle, oppositeAngle, maxCd, "#ff6bcb", 2.4);
    }
  }

  function drawPreviewGrid(ctx, width, height) {
    const cx = width / 2;
    const cy = height * 0.53;
    const r = Math.min(width * 0.36, height * 0.42);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    [0.33, 0.66, 1].forEach((ratio) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * ratio, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();
    ctx.restore();
  }

  function drawOpposingPlaneCurve(ctx, ies, forwardAngle, reverseAngle, maxCd, color, lineWidth = 2.2) {
    const forwardRow = interpolateHorizontalRow(ies, forwardAngle);
    const reverseRow = interpolateHorizontalRow(ies, reverseAngle);
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const cx = width / 2;
    const cy = height * 0.53;
    const scale = Math.min(width * 0.36, height * 0.42);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    ies.verticalAngles.forEach((angle, index) => {
      const theta = angle * DEG;
      const radius = (Math.max(forwardRow[index], 0) / maxCd) * scale;
      const x = cx + Math.sin(theta) * radius;
      const y = cy + Math.cos(theta) * radius;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    for (let index = ies.verticalAngles.length - 1; index >= 0; index -= 1) {
      const theta = ies.verticalAngles[index] * DEG;
      const radius = (Math.max(reverseRow[index], 0) / maxCd) * scale;
      const x = cx - Math.sin(theta) * radius;
      const y = cy + Math.cos(theta) * radius;
      ctx.lineTo(x, y);
    }

    ctx.stroke();
    ctx.restore();
  }

  function parseProfilePlaneAngle(value) {
    if (value === "") {
      return null;
    }
    const angle = Number(value);
    return Number.isFinite(angle) ? normalizePlaneAngle(angle) : null;
  }

  function updateProfilePlaneUi() {
    if (state.profilePlaneAngle == null) {
      els.customPlaneLabel.value = "--";
      return;
    }
    const forward = normalizePlaneAngle(state.profilePlaneAngle);
    const reverse = positiveMod(forward + 180, 360);
    els.customPlaneLabel.value = `C${formatPlaneAngle(forward)}-C${formatPlaneAngle(reverse)}`;
  }

  function normalizePlaneAngle(angle) {
    const normalized = positiveMod(Number(angle), 360);
    return almost(normalized, 360) ? 0 : normalized;
  }

  function formatPlaneAngle(angle) {
    const rounded = Math.round(normalizePlaneAngle(angle) * 10) / 10;
    const normalized = almost(rounded, 360) ? 0 : rounded;
    return normalized.toFixed(1).replace(/\.0$/, "");
  }

  function drawEmptyIlluminance() {
    if (!els.illuminanceCanvas) {
      return;
    }
    state.illuminanceData = null;
    state.hoveredIlluminanceContour = null;
    drawEmptyIlluminanceCanvas(els.illuminanceCanvas);
    if (state.illuminanceFullscreenOpen) {
      drawEmptyIlluminanceCanvas(els.illuminanceFullscreenCanvas);
    }
    updateIlluminanceStats(null);
  }

  function drawEmptyIlluminanceCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    const plot = getIlluminancePlot(canvas);
    ctx.strokeRect(plot.x, plot.y, plot.size, plot.size);
  }

  function renderGroundIlluminance() {
    if (!state.ies) {
      drawEmptyIlluminance();
      return;
    }
    const data = calculateIlluminanceGrid(state.ies);
    state.illuminanceData = data;
    state.hoveredIlluminanceContour = null;
    drawIlluminanceMap(data);
    drawFullscreenIlluminance();
    updateIlluminanceStats(data);
  }

  function calculateIlluminanceGrid(ies) {
    const size = state.illuminanceGridSize;
    const height = Math.max(state.groundHeight, 0.01);
    const range = Math.max(state.groundRange, 0.01);
    const values = [];
    let sumLux = 0;
    let maxLux = -Infinity;
    let minLux = Infinity;
    let maxPoint = { x: 0, y: 0 };

    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      const y = range - (rowIndex / (size - 1)) * range * 2;
      const row = [];
      for (let colIndex = 0; colIndex < size; colIndex += 1) {
        const x = -range + (colIndex / (size - 1)) * range * 2;
        const lux = groundLuxAtPoint(ies, x, y, height);
        row.push(lux);
        sumLux += lux;
        if (lux > maxLux) {
          maxLux = lux;
          maxPoint = { x, y };
        }
        if (lux < minLux) {
          minLux = lux;
        }
      }
      values.push(row);
    }

    return {
      values,
      size,
      height,
      range,
      centerLux: groundLuxAtPoint(ies, 0, 0, height),
      maxLux: Math.max(maxLux, 0),
      minLux: Math.max(minLux, 0),
      avgLux: sumLux / (size * size),
      maxPoint,
    };
  }

  function groundLuxAtPoint(ies, x, y, height) {
    const r = Math.hypot(x, y);
    const gamma = Math.atan2(r, height);
    const gammaDeg = gamma / DEG;
    const cPlane = r < EPS ? 0 : positiveMod(Math.atan2(y, x) / DEG, 360);
    const candela = interpolateCandela(ies, cPlane, gammaDeg);
    const distanceSquared = height * height + r * r;
    const cosine = Math.cos(gamma);
    if (cosine <= 0 || distanceSquared <= EPS) {
      return 0;
    }
    return (candela * cosine) / distanceSquared;
  }

  function interpolateCandela(ies, horizontalAngle, verticalAngle) {
    const row = interpolateHorizontalRow(ies, normalizePlaneAngle(horizontalAngle));
    const angles = ies.verticalAngles;
    if (verticalAngle <= angles[0]) {
      return row[0];
    }
    if (verticalAngle >= angles[angles.length - 1]) {
      return row[row.length - 1];
    }

    for (let i = 0; i < angles.length - 1; i += 1) {
      const a = angles[i];
      const b = angles[i + 1];
      if (verticalAngle >= a - EPS && verticalAngle <= b + EPS) {
        const t = (verticalAngle - a) / Math.max(b - a, EPS);
        return row[i] + (row[i + 1] - row[i]) * t;
      }
    }
    return row[0];
  }

  function drawIlluminanceMap(data, canvas = els.illuminanceCanvas, options = {}) {
    if (!data || !canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    const plot = getIlluminancePlot(canvas);
    const maxLux = Math.max(data.maxLux, EPS);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawIlluminanceHeatmap(ctx, data, plot, maxLux);
    drawIlluminanceContours(ctx, data, plot, {
      canvas,
      showLabels: Boolean(options.showLabels),
      labelFontSize: options.labelFontSize || 10,
    });
    drawIlluminanceAxes(ctx, data, plot);
    drawIlluminanceScale(ctx, data, plot);
  }

  function getIlluminancePlot(canvas) {
    const size = Math.min(canvas.width - 70, canvas.height - 58);
    return {
      x: 34,
      y: 18,
      size,
    };
  }

  function drawIlluminanceHeatmap(ctx, data, plot, maxLux) {
    const temp = document.createElement("canvas");
    temp.width = data.size;
    temp.height = data.size;
    const tempCtx = temp.getContext("2d");
    const image = tempCtx.createImageData(data.size, data.size);
    let offset = 0;
    for (let y = 0; y < data.size; y += 1) {
      for (let x = 0; x < data.size; x += 1) {
        const color = illuminanceColor(data.values[y][x] / maxLux);
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = 255;
        offset += 4;
      }
    }
    tempCtx.putImageData(image, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(temp, plot.x, plot.y, plot.size, plot.size);
    ctx.restore();
  }

  function drawIlluminanceContours(ctx, data, plot, options = {}) {
    const contours = getIlluminanceContours(data, plot);
    const hovered = state.hoveredIlluminanceContour;
    ctx.save();
    ctx.lineWidth = 1.25;
    contours.forEach((contour) => {
      ctx.strokeStyle = `rgba(248, 249, 250, ${0.42 + contour.levelIndex * 0.07})`;
      ctx.beginPath();
      contour.lines.forEach((line) => traceContourLine(ctx, line));
      ctx.stroke();
      if (options.showLabels) {
        drawContourLineLabels(ctx, contour, plot, options);
      }
    });
    if (hovered && hovered.data === data && hovered.canvas === options.canvas) {
      drawHoveredContour(ctx, hovered, plot, options);
    }
    ctx.restore();
  }

  function getIlluminanceContours(data, plot) {
    const key = `${plot.x}:${plot.y}:${plot.size}:${state.illuminanceMode}`;
    if (!data.contourCache) {
      data.contourCache = new Map();
    }
    if (!data.contourCache.has(key)) {
      data.contourCache.set(key, buildIlluminanceContours(data, plot));
    }
    return data.contourCache.get(key);
  }

  function buildIlluminanceContours(data, plot) {
    return illuminanceLevels(data.maxLux).map((level, levelIndex) => {
      const allSegments = [];
      for (let row = 0; row < data.size - 1; row += 1) {
        for (let col = 0; col < data.size - 1; col += 1) {
          contourCellSegments(data, plot, row, col, level.value).forEach((segment) => {
            allSegments.push(segment);
          });
        }
      }
      return {
        ...level,
        levelIndex,
        lines: contourPolylines(allSegments),
      };
    });
  }

  function drawContourLineLabels(ctx, contour, plot, options = {}) {
    const line = longestContourLine(contour.lines);
    const segment = line ? contourLineLabelSegment(line, contour.levelIndex) : null;
    if (segment) {
      drawContourLabel(ctx, segment, contour.label, plot, options);
    }
  }

  function longestContourLine(lines) {
    let best = null;
    let bestLength = 0;
    lines.forEach((line) => {
      const length = polylineLength(line);
      if (length > bestLength) {
        best = line;
        bestLength = length;
      }
    });
    return best;
  }

  function drawHoveredContour(ctx, hovered, plot, options = {}) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = options.showLabels ? 3 : 2.6;
    ctx.shadowColor = "rgba(46, 196, 182, 0.68)";
    ctx.shadowBlur = 7;
    ctx.beginPath();
    traceContourLine(ctx, hovered.line);
    ctx.stroke();
    drawContourLabel(ctx, hovered.segment, hovered.level.label, plot, {
      ...options,
      labelFontSize: Math.max(options.labelFontSize || 10, 12),
    });
    ctx.restore();
  }

  function traceContourLine(ctx, line) {
    if (!line || line.length < 2) {
      return;
    }
    ctx.moveTo(line[0].x, line[0].y);
    for (let i = 1; i < line.length; i += 1) {
      ctx.lineTo(line[i].x, line[i].y);
    }
  }

  function contourPolylines(segments) {
    const items = segments
      .filter((segment) => segmentLength(segment) > 0.5)
      .map((segment) => ({ segment, used: false }));
    const adjacency = new Map();
    items.forEach((item) => {
      addContourEndpoint(adjacency, item.segment[0], item);
      addContourEndpoint(adjacency, item.segment[1], item);
    });

    const lines = [];
    items.forEach((item) => {
      if (item.used) {
        return;
      }
      item.used = true;
      const line = [item.segment[0], item.segment[1]];
      extendContourLine(line, adjacency, true);
      extendContourLine(line, adjacency, false);
      if (polylineLength(line) > 2) {
        lines.push(line);
      }
    });
    return lines;
  }

  function addContourEndpoint(adjacency, point, item) {
    const key = contourPointKey(point);
    if (!adjacency.has(key)) {
      adjacency.set(key, []);
    }
    adjacency.get(key).push(item);
  }

  function extendContourLine(line, adjacency, forward) {
    while (true) {
      const endpoint = forward ? line[line.length - 1] : line[0];
      const endpointKey = contourPointKey(endpoint);
      const candidates = adjacency.get(endpointKey) || [];
      const next = candidates.find((item) => !item.used);
      if (!next) {
        break;
      }
      next.used = true;
      const firstKey = contourPointKey(next.segment[0]);
      const other = firstKey === endpointKey ? next.segment[1] : next.segment[0];
      if (forward) {
        line.push(other);
      } else {
        line.unshift(other);
      }
    }
  }

  function contourPointKey(point) {
    return `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
  }

  function contourLineLabelSegment(line, lineIndex) {
    const total = polylineLength(line);
    if (line.length < 2 || total < 18) {
      return null;
    }
    const ratios = [0.5, 0.42, 0.58, 0.35, 0.65];
    const target = total * ratios[lineIndex % ratios.length];
    let distance = 0;
    let longest = [line[0], line[1]];
    let longestLength = segmentLength(longest);
    for (let i = 0; i < line.length - 1; i += 1) {
      const segment = [line[i], line[i + 1]];
      const length = segmentLength(segment);
      if (length > longestLength) {
        longest = segment;
        longestLength = length;
      }
      if (distance + length >= target) {
        return segment;
      }
      distance += length;
    }
    return longest;
  }

  function drawContourLabel(ctx, segment, label, plot, options = {}) {
    const x = (segment[0].x + segment[1].x) / 2;
    const y = (segment[0].y + segment[1].y) / 2;
    const fontSize = options.labelFontSize || 10;
    const paddingX = Math.max(4, Math.round(fontSize * 0.45));
    const paddingY = Math.max(2, Math.round(fontSize * 0.22));
    ctx.save();
    ctx.font = `${fontSize}px Segoe UI, Arial, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const metrics = ctx.measureText(label);
    const width = metrics.width + paddingX * 2;
    const height = fontSize + paddingY * 2 + 2;
    const bx = Math.max(plot.x + 2, Math.min(plot.x + plot.size - width - 2, x - width / 2));
    const by = Math.max(plot.y + 2, Math.min(plot.y + plot.size - height - 2, y - height / 2));
    ctx.fillStyle = "rgba(17, 19, 24, 0.84)";
    ctx.fillRect(bx, by, width, height);
    ctx.strokeStyle = "rgba(248,249,250,0.34)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, width, height);
    ctx.fillStyle = "rgba(248,249,250,0.96)";
    ctx.fillText(label, bx + width / 2, by + height / 2 + paddingY * 0.1);
    ctx.restore();
  }

  function handleIlluminancePointerMove(event) {
    handleIlluminancePointerMoveForCanvas(event, els.illuminanceCanvas, 9);
  }

  function handleFullscreenIlluminancePointerMove(event) {
    handleIlluminancePointerMoveForCanvas(event, els.illuminanceFullscreenCanvas, 13);
  }

  function handleIlluminancePointerMoveForCanvas(event, canvas, hitDistance) {
    const data = state.illuminanceData;
    if (!data || !canvas) {
      return;
    }
    const point = pointerToCanvasPoint(canvas, event);
    const plot = getIlluminancePlot(canvas);
    const hit = nearestIlluminanceContour(data, plot, point);
    const next = hit && hit.distance <= hitDistance ? { ...hit, canvas } : null;
    const previous = state.hoveredIlluminanceContour;
    const changed =
      (!previous && next) ||
      (previous && !next) ||
      (previous && next && (
        previous.canvas !== next.canvas ||
        previous.line !== next.line ||
        previous.segment[0] !== next.segment[0] ||
        previous.segment[1] !== next.segment[1]
      ));
    state.hoveredIlluminanceContour = next;
    if (changed) {
      drawIlluminanceCanvas(canvas);
    }
  }

  function clearIlluminanceHover() {
    clearIlluminanceHoverForCanvas(els.illuminanceCanvas);
  }

  function clearFullscreenIlluminanceHover() {
    clearIlluminanceHoverForCanvas(els.illuminanceFullscreenCanvas);
  }

  function clearIlluminanceHoverForCanvas(canvas) {
    if (!state.hoveredIlluminanceContour || !state.illuminanceData) {
      state.hoveredIlluminanceContour = null;
      return;
    }
    if (state.hoveredIlluminanceContour.canvas !== canvas) {
      return;
    }
    state.hoveredIlluminanceContour = null;
    drawIlluminanceCanvas(canvas);
  }

  function drawIlluminanceCanvas(canvas) {
    if (!state.illuminanceData || !canvas) {
      return;
    }
    drawIlluminanceMap(state.illuminanceData, canvas, {
      showLabels: canvas === els.illuminanceFullscreenCanvas && state.illuminanceShowLabels,
      labelFontSize: canvas === els.illuminanceFullscreenCanvas ? 12 : 10,
    });
  }

  function pointerToCanvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, EPS)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(rect.height, EPS)) * canvas.height,
    };
  }

  function nearestIlluminanceContour(data, plot, point) {
    let best = null;
    getIlluminanceContours(data, plot).forEach((level) => {
      level.lines.forEach((line) => {
        for (let i = 0; i < line.length - 1; i += 1) {
          const segment = [line[i], line[i + 1]];
          const distance = pointToSegmentDistance(point, segment[0], segment[1]);
          if (!best || distance < best.distance) {
            best = {
              data,
              level,
              line,
              segment,
              distance,
            };
          }
        }
      });
    });
    return best;
  }

  function pointToSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= EPS) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const x = start.x + dx * t;
    const y = start.y + dy * t;
    return Math.hypot(point.x - x, point.y - y);
  }

  function contourCellSegments(data, plot, row, col, threshold) {
    const x0 = plot.x + (col / (data.size - 1)) * plot.size;
    const x1 = plot.x + ((col + 1) / (data.size - 1)) * plot.size;
    const y0 = plot.y + (row / (data.size - 1)) * plot.size;
    const y1 = plot.y + ((row + 1) / (data.size - 1)) * plot.size;
    const v00 = data.values[row][col];
    const v10 = data.values[row][col + 1];
    const v11 = data.values[row + 1][col + 1];
    const v01 = data.values[row + 1][col];
    const points = [];
    addContourPoint(points, threshold, v00, v10, { x: x0, y: y0 }, { x: x1, y: y0 });
    addContourPoint(points, threshold, v10, v11, { x: x1, y: y0 }, { x: x1, y: y1 });
    addContourPoint(points, threshold, v11, v01, { x: x1, y: y1 }, { x: x0, y: y1 });
    addContourPoint(points, threshold, v01, v00, { x: x0, y: y1 }, { x: x0, y: y0 });
    if (points.length < 2) {
      return [];
    }
    if (points.length === 2) {
      return [[points[0], points[1]]];
    }
    return [
      [points[0], points[1]],
      [points[2], points[3]],
    ];
  }

  function addContourPoint(points, threshold, aValue, bValue, aPoint, bPoint) {
    const aSide = aValue - threshold;
    const bSide = bValue - threshold;
    if ((aSide < 0 && bSide < 0) || (aSide > 0 && bSide > 0) || almost(aValue, bValue)) {
      return;
    }
    const t = (threshold - aValue) / (bValue - aValue);
    if (t < -EPS || t > 1 + EPS) {
      return;
    }
    points.push({
      x: aPoint.x + (bPoint.x - aPoint.x) * t,
      y: aPoint.y + (bPoint.y - aPoint.y) * t,
    });
  }

  function segmentLength(segment) {
    return Math.hypot(segment[1].x - segment[0].x, segment[1].y - segment[0].y);
  }

  function polylineLength(line) {
    let length = 0;
    for (let i = 0; i < line.length - 1; i += 1) {
      length += segmentLength([line[i], line[i + 1]]);
    }
    return length;
  }

  function drawIlluminanceAxes(ctx, data, plot) {
    const cx = plot.x + plot.size / 2;
    const cy = plot.y + plot.size / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.size, plot.size);
    ctx.beginPath();
    ctx.moveTo(plot.x, cy);
    ctx.lineTo(plot.x + plot.size, cy);
    ctx.moveTo(cx, plot.y);
    ctx.lineTo(cx, plot.y + plot.size);
    ctx.stroke();

    const maxPointPx = groundPointToCanvas(data.maxPoint.x, data.maxPoint.y, data, plot);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff6bcb";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(maxPointPx.x - 5, maxPointPx.y);
    ctx.lineTo(maxPointPx.x + 5, maxPointPx.y);
    ctx.moveTo(maxPointPx.x, maxPointPx.y - 5);
    ctx.lineTo(maxPointPx.x, maxPointPx.y + 5);
    ctx.stroke();

    ctx.fillStyle = "rgba(241,243,245,0.86)";
    ctx.font = "11px Segoe UI, Arial, sans-serif";
    ctx.fillText("C180", plot.x, plot.y + plot.size + 22);
    ctx.fillText("C0", plot.x + plot.size - 16, plot.y + plot.size + 22);
    ctx.fillText("C90", plot.x + 4, plot.y + 12);
    ctx.fillText("C270", plot.x + 4, plot.y + plot.size - 6);
    ctx.fillText(`${formatInputNumber(data.range, 2)} m`, plot.x + plot.size / 2 - 16, plot.y + plot.size + 22);
    ctx.restore();
  }

  function groundPointToCanvas(x, y, data, plot) {
    return {
      x: plot.x + ((x + data.range) / (2 * data.range)) * plot.size,
      y: plot.y + ((data.range - y) / (2 * data.range)) * plot.size,
    };
  }

  function drawIlluminanceScale(ctx, data, plot) {
    const x = plot.x + plot.size + 10;
    const y = plot.y;
    const width = 10;
    const height = plot.size;
    const gradient = ctx.createLinearGradient(0, y + height, 0, y);
    gradient.addColorStop(0, "#25323a");
    gradient.addColorStop(0.22, "#2ec4b6");
    gradient.addColorStop(0.52, "#ffd166");
    gradient.addColorStop(0.78, "#f77f00");
    gradient.addColorStop(1, "#f8f9fa");
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = "rgba(241,243,245,0.86)";
    ctx.font = "10px Segoe UI, Arial, sans-serif";
    ctx.fillText(formatLux(data.maxLux), x - 2, y - 4);
    ctx.fillText("0", x + 1, y + height + 12);
    ctx.restore();
  }

  function illuminanceLevels(maxLux) {
    if (!Number.isFinite(maxLux) || maxLux <= 0) {
      return [];
    }
    let values;
    if (state.illuminanceMode === "lux") {
      values = [1000, 750, 500, 300, 200, 100, 50, 20, 10].filter((value) => value > 0 && value < maxLux);
      if (!values.length) {
        values = [0.75, 0.5, 0.25, 0.1, 0.05].map((ratio) => maxLux * ratio);
      }
    } else {
      values = [0.75, 0.5, 0.25, 0.1, 0.05].map((ratio) => maxLux * ratio);
    }
    return values
      .filter((value, index, array) => value > 0 && array.indexOf(value) === index)
      .sort((a, b) => a - b)
      .map((value) => ({ value, label: `${formatLux(value)} lx` }));
  }

  function illuminanceColor(value) {
    const n = Math.max(0, Math.min(1, value));
    const stops = [
      { at: 0, rgb: [37, 50, 58] },
      { at: 0.22, rgb: [46, 196, 182] },
      { at: 0.52, rgb: [255, 209, 102] },
      { at: 0.78, rgb: [247, 127, 0] },
      { at: 1, rgb: [248, 249, 250] },
    ];
    for (let i = 1; i < stops.length; i += 1) {
      if (n <= stops[i].at) {
        const prev = stops[i - 1];
        const next = stops[i];
        const t = (n - prev.at) / Math.max(next.at - prev.at, EPS);
        return prev.rgb.map((channel, index) => Math.round(channel + (next.rgb[index] - channel) * t));
      }
    }
    return stops[stops.length - 1].rgb;
  }

  function updateIlluminanceStats(data) {
    if (!data) {
      els.centerLux.textContent = "--";
      els.maxLux.textContent = "--";
      els.maxLuxPoint.textContent = "--";
      els.avgLux.textContent = "--";
      return;
    }
    els.centerLux.textContent = `${formatLux(data.centerLux)} lx`;
    els.maxLux.textContent = `${formatLux(data.maxLux)} lx`;
    els.maxLuxPoint.textContent = `${formatInputNumber(data.maxPoint.x, 2)}, ${formatInputNumber(data.maxPoint.y, 2)} m`;
    els.avgLux.textContent = `${formatLux(data.avgLux)} lx`;
  }

  function parsePositiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function formatInputNumber(value, digits) {
    if (!Number.isFinite(value)) {
      return "";
    }
    const trimmed = Number(value).toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return trimmed === "-0" ? "0" : trimmed;
  }

  function formatLux(value) {
    if (!Number.isFinite(value)) {
      return "--";
    }
    const abs = Math.abs(value);
    if (abs >= 100) {
      return formatNumber(value, 0);
    }
    if (abs >= 10) {
      return formatNumber(value, 1);
    }
    return formatNumber(value, 2);
  }

  function downloadCanvas() {
    if (!state.renderer) {
      return;
    }
    const link = document.createElement("a");
    link.download = "ies-3d-view.png";
    link.href = state.renderer.domElement.toDataURL("image/png");
    link.click();
  }

  function photometricTypeName(type) {
    if (type === 1) {
      return "Type C";
    }
    if (type === 2) {
      return "Type B";
    }
    if (type === 3) {
      return "Type A";
    }
    return `Type ${type}`;
  }

  function displayModeLabel(mode) {
    if (mode === "wire") {
      return "wire frame";
    }
    if (mode === "both") {
      return "wire frame+rendering";
    }
    return "rendering";
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) {
      return "--";
    }
    return new Intl.NumberFormat("zh-Hant", {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(value);
  }

  function almost(a, b) {
    return Math.abs(a - b) <= 1e-4;
  }

  function positiveMod(value, base) {
    return ((value % base) + base) % base;
  }

  function roundAngle(value) {
    return Math.round(value * 100000) / 100000;
  }

  global.Ies3DApp = {
    parseIes,
    tokenizeNumbers,
    expandHorizontalData,
    estimateLumens,
  };

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }
})(typeof window !== "undefined" ? window : globalThis);
