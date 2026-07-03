(function (global) {
  "use strict";

  const core = global.IesCore;
  const DEG = core.DEG;
  const EPS = core.EPS;
  const STORAGE_KEY = "iesCalcStateV2";
  const SAMPLE_FILE = "HH-186-15-3090x1800_IESNA2002.IES";
  const GRID_MIN = 2;
  const GRID_MAX = 301;

  // Common farmland area presets (長 X x 寬 Y, meters).
  const AREA_PRESETS = [
    { id: "agri-20x50", name: "農業局面積", length: 20, width: 50 },
    { id: "fen-30x32", name: "一分地", length: 30, width: 32 },
    { id: "fen-40x24", name: "一分地", length: 40, width: 24 },
    { id: "jia-100x97", name: "一甲地", length: 100, width: 97 },
    { id: "mu-44.4x15", name: "一畝地", length: 44.4, width: 15 },
    { id: "mu-33.3x20", name: "一畝地", length: 33.3, width: 20 },
    { id: "mu-26.6x25", name: "一畝地", length: 26.6, width: 25 },
  ];

  const state = {
    ies: null,
    iesText: "",
    iesName: "",
    areaPreset: "custom",
    groundLength: 50,
    groundWidth: 50,
    gridX: 51,
    gridY: 51,
    flux: null,
    fluxUnit: "lm",
    illuminanceUnit: "lux",
    mountHeight: 4,
    fieldRows: 6,
    fieldCols: 7,
    fieldRot: 0,
    luminaires: [],
    levelMode: "percent",
    viewMode: "2d",
    showLumIndex: true,
    showContourLabels: true,
    show3dLuminaires: true,
    show3dPhotometry: false,
    luminaireSize: null,
    photometryRadius: null,
    photometryOpacity: 0.55,
    result: null,
    lut: null,
  };

  const els = {};
  let recalcTimer = null;
  let saveTimer = null;

  function init() {
    cacheElements();
    populateAreaPresets();
    restoreState();
    wireEvents();
    syncInputs();
    renderLumTable();

    if (global.lucide) {
      global.lucide.createIcons();
    }

    observeResize();
    setViewMode(state.viewMode, false);
    scheduleRecalc(0);
  }

  function cacheElements() {
    [
      "areaPreset",
      "swapBtn",
      "groundLengthInput",
      "groundWidthInput",
      "gridXInput",
      "gridYInput",
      "fileInput",
      "sampleBtn",
      "dropZone",
      "fileName",
      "lumInfo",
      "fluxInput",
      "fluxUnit",
      "fluxUnitLabel",
      "mountHeightInput",
      "illuminanceUnit",
      "fieldRowsInput",
      "fieldColsInput",
      "fieldRotInput",
      "generateFieldBtn",
      "lumTableBody",
      "lumCount",
      "addLumBtn",
      "clearLumBtn",
      "levelMode",
      "statMax",
      "statMin",
      "statMaxPos",
      "statMinPos",
      "statAvg",
      "statUniformity",
      "calcUnitLabel",
      "warningPanel",
      "warningList",
      "resetBtn",
      "planCanvas",
      "scene3d",
      "view2dBtn",
      "view3dBtn",
      "resetView3dBtn",
      "rotate3dBtn",
      "showLumIndexChk",
      "showContourLabelsChk",
      "show3dLumChk",
      "show3dPhotChk",
      "lumSizeSlider",
      "lumSizeValue",
      "photRadiusSlider",
      "photRadiusValue",
      "photOpacitySlider",
      "photOpacityValue",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function wireEvents() {
    bindNumber(els.groundLengthInput, (value) => {
      state.groundLength = parsePositiveNumber(value, state.groundLength);
      markCustomArea();
    });
    bindNumber(els.groundWidthInput, (value) => {
      state.groundWidth = parsePositiveNumber(value, state.groundWidth);
      markCustomArea();
    });

    els.areaPreset.addEventListener("change", () => {
      const preset = AREA_PRESETS.find((item) => item.id === els.areaPreset.value);
      state.areaPreset = preset ? preset.id : "custom";
      if (preset) {
        state.groundLength = preset.length;
        state.groundWidth = preset.width;
        els.groundLengthInput.value = preset.length;
        els.groundWidthInput.value = preset.width;
        scheduleRecalc();
      }
      scheduleSave();
    });

    els.swapBtn.addEventListener("click", () => {
      const previousLength = state.groundLength;
      state.groundLength = state.groundWidth;
      state.groundWidth = previousLength;
      els.groundLengthInput.value = state.groundLength;
      els.groundWidthInput.value = state.groundWidth;
      markCustomArea();
      scheduleRecalc();
      scheduleSave();
    });
    bindNumber(els.gridXInput, (value) => {
      state.gridX = clampInt(value, GRID_MIN, GRID_MAX, state.gridX);
    });
    bindNumber(els.gridYInput, (value) => {
      state.gridY = clampInt(value, GRID_MIN, GRID_MAX, state.gridY);
    });
    bindNumber(els.fluxInput, (value) => {
      const parsed = Number(value);
      state.flux = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    });
    bindNumber(els.mountHeightInput, (value) => {
      state.mountHeight = parsePositiveNumber(value, state.mountHeight);
    });
    bindNumber(els.fieldRowsInput, (value) => {
      state.fieldRows = clampInt(value, 1, 100, state.fieldRows);
    }, false);
    bindNumber(els.fieldColsInput, (value) => {
      state.fieldCols = clampInt(value, 1, 100, state.fieldCols);
    }, false);
    bindNumber(els.fieldRotInput, (value) => {
      const parsed = Number(value);
      state.fieldRot = Number.isFinite(parsed) ? parsed : state.fieldRot;
    }, false);

    els.fluxUnit.addEventListener("change", () => {
      state.fluxUnit = els.fluxUnit.value === "PPF" ? "PPF" : "lm";
      updateUnitLabels();
      updateLumInfo();
      scheduleSave();
    });
    els.illuminanceUnit.addEventListener("change", () => {
      state.illuminanceUnit = els.illuminanceUnit.value === "PPFD" ? "PPFD" : "lux";
      updateUnitLabels();
      updateStats();
      draw();
      update3dScene();
      scheduleSave();
    });
    els.levelMode.addEventListener("change", () => {
      state.levelMode = els.levelMode.value === "lux" ? "lux" : "percent";
      draw();
      update3dScene();
      scheduleSave();
    });

    els.view2dBtn.addEventListener("click", () => setViewMode("2d"));
    els.view3dBtn.addEventListener("click", () => setViewMode("3d"));
    els.resetView3dBtn.addEventListener("click", resetCamera3d);
    els.rotate3dBtn.addEventListener("click", () => {
      if (!three.ready) {
        return;
      }
      three.controls.autoRotate = !three.controls.autoRotate;
      els.rotate3dBtn.classList.toggle("is-active", three.controls.autoRotate);
    });
    els.showLumIndexChk.addEventListener("change", () => {
      state.showLumIndex = els.showLumIndexChk.checked;
      draw();
      update3dScene();
      scheduleSave();
    });
    els.showContourLabelsChk.addEventListener("change", () => {
      state.showContourLabels = els.showContourLabelsChk.checked;
      draw();
      update3dScene();
      scheduleSave();
    });
    els.show3dLumChk.addEventListener("change", () => {
      state.show3dLuminaires = els.show3dLumChk.checked;
      update3dScene();
      scheduleSave();
    });
    els.show3dPhotChk.addEventListener("change", () => {
      state.show3dPhotometry = els.show3dPhotChk.checked;
      update3dScene();
      scheduleSave();
    });
    els.lumSizeSlider.addEventListener("input", () => {
      state.luminaireSize = Number(els.lumSizeSlider.value);
      els.lumSizeValue.textContent = formatInputNumber(state.luminaireSize, 2);
      update3dScene();
      scheduleSave();
    });
    els.photRadiusSlider.addEventListener("input", () => {
      state.photometryRadius = Number(els.photRadiusSlider.value);
      els.photRadiusValue.textContent = formatInputNumber(state.photometryRadius, 1);
      update3dScene();
      scheduleSave();
    });
    els.photOpacitySlider.addEventListener("input", () => {
      state.photometryOpacity = Number(els.photOpacitySlider.value);
      els.photOpacityValue.textContent = formatInputNumber(state.photometryOpacity, 2);
      if (three.photMaterial) {
        three.photMaterial.opacity = state.photometryOpacity;
      }
      scheduleSave();
    });

    els.generateFieldBtn.addEventListener("click", generateField);
    els.addLumBtn.addEventListener("click", () => {
      state.luminaires.push({
        x: roundTo(state.groundLength / 2, 3),
        y: roundTo(state.groundWidth / 2, 3),
        rot: 0,
      });
      renderLumTable();
      scheduleRecalc();
      scheduleSave();
    });
    els.clearLumBtn.addEventListener("click", () => {
      state.luminaires = [];
      renderLumTable();
      scheduleRecalc();
      scheduleSave();
    });
    els.resetBtn.addEventListener("click", () => {
      if (!global.confirm("確定要清除所有保存內容並重設嗎？")) {
        return;
      }
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        /* ignore */
      }
      location.reload();
    });

    els.fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) {
        readUploadedFile(file);
      }
      event.target.value = "";
    });
    els.sampleBtn.addEventListener("click", loadSampleFile);

    ["dragenter", "dragover"].forEach((type) => {
      els.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      els.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("is-dragging");
      });
    });
    els.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        readUploadedFile(file);
      }
    });

    global.addEventListener("resize", () => {
      draw();
      resize3d();
    });
  }

  function bindNumber(input, apply, triggersRecalc = true) {
    if (!input) {
      return;
    }
    input.addEventListener("input", () => {
      apply(input.value);
      if (triggersRecalc) {
        scheduleRecalc();
      }
      scheduleSave();
    });
  }

  function populateAreaPresets() {
    AREA_PRESETS.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = `${preset.name} (${preset.length} × ${preset.width} m)`;
      els.areaPreset.appendChild(option);
    });
  }

  // Manual edits to length/width mean the dimensions no longer match a
  // preset, so the selector falls back to 自訂.
  function markCustomArea() {
    if (state.areaPreset !== "custom") {
      state.areaPreset = "custom";
      els.areaPreset.value = "custom";
    }
  }

  function syncInputs() {
    els.areaPreset.value = state.areaPreset;
    els.groundLengthInput.value = state.groundLength;
    els.groundWidthInput.value = state.groundWidth;
    els.gridXInput.value = state.gridX;
    els.gridYInput.value = state.gridY;
    els.fluxInput.value = state.flux == null ? "" : state.flux;
    els.fluxUnit.value = state.fluxUnit;
    els.illuminanceUnit.value = state.illuminanceUnit;
    els.mountHeightInput.value = state.mountHeight;
    els.fieldRowsInput.value = state.fieldRows;
    els.fieldColsInput.value = state.fieldCols;
    els.fieldRotInput.value = state.fieldRot;
    els.levelMode.value = state.levelMode;
    els.showLumIndexChk.checked = state.showLumIndex;
    els.showContourLabelsChk.checked = state.showContourLabels;
    els.show3dLumChk.checked = state.show3dLuminaires;
    els.show3dPhotChk.checked = state.show3dPhotometry;
    syncLuminaireSizeControl();
    els.photOpacitySlider.value = state.photometryOpacity;
    els.photOpacityValue.textContent = formatInputNumber(state.photometryOpacity, 2);
    syncPhotometryRadiusControl();
    els.fileName.textContent = state.iesName || "尚未載入檔案";
    updateUnitLabels();
    updateLumInfo();
    showWarnings(state.ies ? state.ies.warnings : []);
  }

  function updateUnitLabels() {
    els.fluxUnitLabel.textContent = fluxUnitLabel();
    els.calcUnitLabel.textContent = `${illuminanceUnitLabel()} contour`;
  }

  // ---- IES loading -------------------------------------------------------

  function readUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = () => loadIesText(String(reader.result || ""), file.name);
    reader.onerror = () => showWarnings([`無法讀取檔案 ${file.name}。`]);
    reader.readAsText(file);
  }

  async function loadSampleFile() {
    try {
      els.fileName.textContent = "讀取範例中...";
      const response = await fetch(SAMPLE_FILE, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      loadIesText(text, SAMPLE_FILE);
    } catch (error) {
      els.fileName.textContent = state.iesName || "尚未載入檔案";
      showWarnings([`範例檔載入失敗：${error.message}`]);
    }
  }

  function loadIesText(text, filename) {
    try {
      const ies = core.parseIes(text, filename);
      state.ies = ies;
      state.iesText = text;
      state.iesName = filename || "";
      state.lut = null;
      const rated = ratedLumens(ies);
      state.flux = rated > 0 ? roundTo(rated, 1) : null;
      els.fluxInput.value = state.flux == null ? "" : state.flux;
      els.fileName.textContent = state.iesName;
      updateLumInfo();
      showWarnings(ies.warnings);
      scheduleRecalc(0);
      scheduleSave();
    } catch (error) {
      showWarnings([`IES 解析失敗：${error.message}`]);
    }
  }

  function ratedLumens(ies) {
    const perLamp = ies.header.lumensPerLamp;
    if (Number.isFinite(perLamp) && perLamp > 0) {
      return perLamp * Math.max(ies.header.numLamps, 1);
    }
    return ies.stats.estimatedLumens || 0;
  }

  function fluxScale(ies) {
    const rated = ratedLumens(ies);
    if (state.flux != null && state.flux > 0 && rated > 0) {
      return state.flux / rated;
    }
    return 1;
  }

  function updateLumInfo() {
    if (!state.ies) {
      els.lumInfo.textContent = "--";
      return;
    }
    const ies = state.ies;
    const rated = ratedLumens(ies);
    const parts = [];
    if (rated > 0) {
      parts.push(`額定 ${formatNumber(rated, 1)} ${fluxUnitLabel()}`);
    }
    if (Number.isFinite(ies.header.inputWatts) && ies.header.inputWatts > 0) {
      parts.push(`${formatNumber(ies.header.inputWatts, 1)} W`);
    }
    parts.push(`最大 ${formatNumber(ies.stats.maxCandela, 1)} cd`);
    els.lumInfo.textContent = parts.join("　/　");
  }

  // ---- Luminaire layout --------------------------------------------------

  function generateField() {
    const rows = clampInt(state.fieldRows, 1, 100, 1);
    const cols = clampInt(state.fieldCols, 1, 100, 1);
    const list = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        list.push({
          x: roundTo(((2 * c + 1) * state.groundLength) / (2 * cols), 3),
          y: roundTo(((2 * r + 1) * state.groundWidth) / (2 * rows), 3),
          rot: state.fieldRot,
        });
      }
    }
    state.luminaires = list;
    renderLumTable();
    scheduleRecalc();
    scheduleSave();
  }

  function renderLumTable() {
    const body = els.lumTableBody;
    body.textContent = "";
    state.luminaires.forEach((lum, index) => {
      const tr = document.createElement("tr");

      const tdIndex = document.createElement("td");
      tdIndex.className = "lum-index";
      tdIndex.textContent = String(index + 1);
      tr.appendChild(tdIndex);

      [["x", 0.1], ["y", 0.1], ["rot", 1]].forEach(([key, step]) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.step = String(step);
        input.value = String(lum[key]);
        input.addEventListener("input", () => {
          const parsed = Number(input.value);
          if (Number.isFinite(parsed)) {
            lum[key] = parsed;
            scheduleRecalc();
            scheduleSave();
          }
        });
        td.appendChild(input);
        tr.appendChild(td);
      });

      const tdDel = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "lum-del-btn";
      delBtn.title = "刪除";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        state.luminaires.splice(index, 1);
        renderLumTable();
        scheduleRecalc();
        scheduleSave();
      });
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      body.appendChild(tr);
    });
    els.lumCount.textContent = `${state.luminaires.length} 盞`;
  }

  // ---- Calculation -------------------------------------------------------

  function scheduleRecalc(delay = 250) {
    clearTimeout(recalcTimer);
    recalcTimer = setTimeout(recalc, delay);
  }

  // Precomputed candela lookup table (C plane 0-360 x gamma 0-90, 1 degree
  // step) so the per-point loop stays fast for large grids and many lamps.
  function buildLut(ies) {
    const cCount = 361;
    const gCount = 91;
    const values = new Float64Array(cCount * gCount);
    for (let c = 0; c < cCount; c += 1) {
      for (let g = 0; g < gCount; g += 1) {
        values[c * gCount + g] = core.interpolateCandela(ies, c, g);
      }
    }
    return { values, cCount, gCount };
  }

  function lutValue(lut, cDeg, gDeg) {
    const c = core.positiveMod(cDeg, 360);
    const g = Math.min(Math.max(gDeg, 0), 90);
    const c0 = Math.floor(c);
    const g0 = Math.floor(g);
    const c1 = Math.min(c0 + 1, 360);
    const g1 = Math.min(g0 + 1, 90);
    const tc = c - c0;
    const tg = g - g0;
    const v00 = lut.values[c0 * lut.gCount + g0];
    const v01 = lut.values[c0 * lut.gCount + g1];
    const v10 = lut.values[c1 * lut.gCount + g0];
    const v11 = lut.values[c1 * lut.gCount + g1];
    const a = v00 + (v01 - v00) * tg;
    const b = v10 + (v11 - v10) * tg;
    return a + (b - a) * tc;
  }

  function recalc() {
    updateUnitLabels();
    if (!state.ies || !state.luminaires.length) {
      state.result = null;
      updateStats();
      draw();
      update3dScene();
      return;
    }

    if (!state.lut) {
      state.lut = buildLut(state.ies);
    }

    const lut = state.lut;
    const length = Math.max(state.groundLength, 0.01);
    const width = Math.max(state.groundWidth, 0.01);
    const gx = clampInt(state.gridX, GRID_MIN, GRID_MAX, 51);
    const gy = clampInt(state.gridY, GRID_MIN, GRID_MAX, 51);
    const height = Math.max(state.mountHeight, 0.01);
    const scale = fluxScale(state.ies);
    const lums = state.luminaires.map((lum) => ({
      x: Number(lum.x) || 0,
      y: Number(lum.y) || 0,
      rot: Number(lum.rot) || 0,
    }));

    const values = [];
    let sum = 0;
    let maxLux = -Infinity;
    let minLux = Infinity;
    let maxPoint = { x: 0, y: 0 };
    let minPoint = { x: 0, y: 0 };

    for (let iy = 0; iy < gy; iy += 1) {
      const y = (width * iy) / (gy - 1);
      const row = [];
      for (let ix = 0; ix < gx; ix += 1) {
        const x = (length * ix) / (gx - 1);
        let lux = 0;
        for (let i = 0; i < lums.length; i += 1) {
          const dx = x - lums[i].x;
          const dy = y - lums[i].y;
          const r2 = dx * dx + dy * dy;
          const d2 = r2 + height * height;
          if (d2 <= EPS) {
            continue;
          }
          const gammaDeg = Math.atan2(Math.sqrt(r2), height) / DEG;
          const cDeg = r2 < EPS ? 0 : Math.atan2(dy, dx) / DEG - lums[i].rot;
          const candela = lutValue(lut, cDeg, gammaDeg) * scale;
          lux += (candela * height) / (d2 * Math.sqrt(d2));
        }
        row.push(lux);
        sum += lux;
        if (lux > maxLux) {
          maxLux = lux;
          maxPoint = { x, y };
        }
        if (lux < minLux) {
          minLux = lux;
          minPoint = { x, y };
        }
      }
      values.push(row);
    }

    state.result = {
      values,
      gx,
      gy,
      length,
      width,
      height,
      maxLux: Math.max(maxLux, 0),
      minLux: Math.max(minLux, 0),
      avgLux: sum / (gx * gy),
      maxPoint,
      minPoint,
    };
    updateStats();
    draw();
    update3dScene();
  }

  function formatPoint(point) {
    return `(${formatInputNumber(point.x, 2)}, ${formatInputNumber(point.y, 2)}) m`;
  }

  function updateStats() {
    const data = state.result;
    els.statMax.textContent = data ? formatIlluminance(data.maxLux) : "--";
    els.statMin.textContent = data ? formatIlluminance(data.minLux) : "--";
    els.statMaxPos.textContent = data ? formatPoint(data.maxPoint) : "--";
    els.statMinPos.textContent = data ? formatPoint(data.minPoint) : "--";
    els.statAvg.textContent = data ? formatIlluminance(data.avgLux) : "--";
    els.statUniformity.textContent =
      data && data.avgLux > 0 ? (data.minLux / data.avgLux).toFixed(2) : "--";
  }

  // ---- Drawing -----------------------------------------------------------

  function observeResize() {
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => {
        draw();
        resize3d();
      });
      observer.observe(els.planCanvas.parentElement);
    }
  }

  function draw() {
    const canvas = els.planCanvas;
    if (!canvas) {
      return;
    }
    const dpr = global.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) {
      return;
    }
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, cw, ch);

    const margin = { left: 56, right: 100, top: 28, bottom: 46 };
    const length = Math.max(state.groundLength, 0.01);
    const width = Math.max(state.groundWidth, 0.01);
    const availW = cw - margin.left - margin.right;
    const availH = ch - margin.top - margin.bottom;
    if (availW < 60 || availH < 60) {
      return;
    }
    const scale = Math.min(availW / length, availH / width);
    const plotW = length * scale;
    const plotH = width * scale;
    const ox = margin.left + (availW - plotW) / 2;
    const oyBottom = margin.top + (availH - plotH) / 2 + plotH;
    const toPx = (x, y) => ({ x: ox + x * scale, y: oyBottom - y * scale });

    const data = state.result;

    if (data) {
      drawHeatmap(ctx, data, toPx);
    }
    drawGroundGrid(ctx, length, width, scale, toPx);
    if (data) {
      drawContours(ctx, data, toPx, { showLabels: state.showContourLabels });
      drawExtremeMarkers(ctx, data, toPx);
      drawColorScale(ctx, data, cw, margin, oyBottom, plotH);
    }
    drawLuminaires(ctx, toPx);

    if (!state.ies) {
      drawCenteredHint(ctx, cw, ch, "請先讀取 IES 光型檔（或點「範例」）");
    } else if (!state.luminaires.length) {
      drawCenteredHint(ctx, cw, ch, "請新增燈具或按「產生均佈配置」");
    }
  }

  function drawHeatmap(ctx, data, toPx) {
    const maxLux = Math.max(data.maxLux, EPS);
    const stepX = data.length / (data.gx - 1);
    const stepY = data.width / (data.gy - 1);
    for (let iy = 0; iy < data.gy; iy += 1) {
      const y0 = iy === 0 ? 0 : (iy - 0.5) * stepY;
      const y1 = iy === data.gy - 1 ? data.width : (iy + 0.5) * stepY;
      for (let ix = 0; ix < data.gx; ix += 1) {
        const x0 = ix === 0 ? 0 : (ix - 0.5) * stepX;
        const x1 = ix === data.gx - 1 ? data.length : (ix + 0.5) * stepX;
        const rgb = illuminanceColor(data.values[iy][ix] / maxLux);
        const p0 = toPx(x0, y1);
        const p1 = toPx(x1, y0);
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(p0.x, p0.y, p1.x - p0.x + 0.5, p1.y - p0.y + 0.5);
      }
    }
  }

  function drawGroundGrid(ctx, length, width, scale, toPx) {
    const origin = toPx(0, width);
    const corner = toPx(length, 0);
    const step = niceStep(Math.max(length, width));

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < length - EPS; x += step) {
      const p = toPx(x, 0);
      ctx.moveTo(p.x, toPx(0, width).y);
      ctx.lineTo(p.x, p.y);
    }
    for (let y = step; y < width - EPS; y += step) {
      const p = toPx(0, y);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(toPx(length, 0).x, p.y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.strokeRect(origin.x, origin.y, corner.x - origin.x, corner.y - origin.y);

    ctx.fillStyle = "rgba(241,243,245,0.75)";
    ctx.font = "11px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    for (let x = 0; x <= length + EPS; x += step) {
      const p = toPx(Math.min(x, length), 0);
      ctx.fillText(formatInputNumber(Math.min(x, length), 2), p.x, p.y + 16);
    }
    ctx.textAlign = "right";
    for (let y = 0; y <= width + EPS; y += step) {
      const p = toPx(0, Math.min(y, width));
      ctx.fillText(formatInputNumber(Math.min(y, width), 2), p.x - 8, p.y + 4);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(170,178,189,0.9)";
    ctx.fillText("X (m)", (origin.x + corner.x) / 2, corner.y + 34);
    ctx.save();
    ctx.translate(origin.x - 40, (origin.y + corner.y) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Y (m)", 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawContours(ctx, data, toPx, options = {}) {
    const levels = illuminanceLevels(data.maxLux);
    if (!levels.length) {
      return;
    }
    const stepX = data.length / (data.gx - 1);
    const stepY = data.width / (data.gy - 1);
    const pointPx = (ix, iy) => toPx(ix * stepX, iy * stepY);

    ctx.save();
    levels.forEach((level) => {
      const segments = [];
      for (let iy = 0; iy < data.gy - 1; iy += 1) {
        for (let ix = 0; ix < data.gx - 1; ix += 1) {
          collectCellSegments(segments, data, ix, iy, level.value, pointPx);
        }
      }
      if (!segments.length) {
        return;
      }
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      segments.forEach(([a, b]) => {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      });
      ctx.stroke();
      if (options.showLabels !== false) {
        drawContourLabel(ctx, segments, level.label, options.labelScale || 1);
      }
    });
    ctx.restore();
  }

  function collectCellSegments(segments, data, ix, iy, threshold, pointPx) {
    const v00 = data.values[iy][ix];
    const v10 = data.values[iy][ix + 1];
    const v11 = data.values[iy + 1][ix + 1];
    const v01 = data.values[iy + 1][ix];
    const p00 = pointPx(ix, iy);
    const p10 = pointPx(ix + 1, iy);
    const p11 = pointPx(ix + 1, iy + 1);
    const p01 = pointPx(ix, iy + 1);
    const points = [];
    addCrossing(points, threshold, v00, v10, p00, p10);
    addCrossing(points, threshold, v10, v11, p10, p11);
    addCrossing(points, threshold, v11, v01, p11, p01);
    addCrossing(points, threshold, v01, v00, p01, p00);
    if (points.length >= 2) {
      segments.push([points[0], points[1]]);
      if (points.length === 4) {
        segments.push([points[2], points[3]]);
      }
    }
  }

  function addCrossing(points, threshold, aValue, bValue, aPoint, bPoint) {
    const aSide = aValue - threshold;
    const bSide = bValue - threshold;
    if ((aSide < 0 && bSide < 0) || (aSide > 0 && bSide > 0) || Math.abs(aValue - bValue) <= EPS) {
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

  function drawContourLabel(ctx, segments, label, scale = 1) {
    let best = segments[0];
    let bestLength = 0;
    segments.forEach((segment) => {
      const len = Math.hypot(segment[1].x - segment[0].x, segment[1].y - segment[0].y);
      if (len > bestLength) {
        bestLength = len;
        best = segment;
      }
    });
    const mx = (best[0].x + best[1].x) / 2;
    const my = (best[0].y + best[1].y) / 2;
    ctx.save();
    ctx.font = `${Math.round(10 * scale)}px Segoe UI, Arial, sans-serif`;
    const metrics = ctx.measureText(label);
    const pad = 3 * scale;
    ctx.fillStyle = "rgba(17,19,24,0.82)";
    ctx.fillRect(mx - metrics.width / 2 - pad, my - 7 * scale - pad, metrics.width + pad * 2, 14 * scale + pad);
    ctx.fillStyle = "rgba(241,243,245,0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my);
    ctx.restore();
  }

  function drawLuminaires(ctx, toPx) {
    ctx.save();
    state.luminaires.forEach((lum, index) => {
      const x = Number(lum.x) || 0;
      const y = Number(lum.y) || 0;
      const rot = (Number(lum.rot) || 0) * DEG;
      const p = toPx(x, y);
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(rot) * 11, p.y - Math.sin(rot) * 11);
      ctx.stroke();
      ctx.fillStyle = "#ffd166";
      ctx.strokeStyle = "#1a1c20";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (state.showLumIndex) {
        ctx.fillStyle = "rgba(255,226,163,0.85)";
        ctx.font = "10px Segoe UI, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(String(index + 1), p.x + 6, p.y - 6);
      }
    });
    ctx.restore();
  }

  function drawExtremeMarkers(ctx, data, toPx) {
    drawPointMarker(ctx, toPx(data.maxPoint.x, data.maxPoint.y), "#ff6bcb", "max");
    drawPointMarker(ctx, toPx(data.minPoint.x, data.minPoint.y), "#7cc4ff", "min");
  }

  function drawPointMarker(ctx, p, color, label) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y);
    ctx.lineTo(p.x + 6, p.y);
    ctx.moveTo(p.x, p.y - 6);
    ctx.lineTo(p.x, p.y + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = "10px Segoe UI, Arial, sans-serif";
    const metrics = ctx.measureText(label);
    const lx = p.x + 8;
    const ly = p.y - 9;
    ctx.fillStyle = "rgba(17,19,24,0.82)";
    ctx.fillRect(lx - 2, ly - 8, metrics.width + 5, 13);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx, ly - 1);
    ctx.restore();
  }

  function drawColorScale(ctx, data, cw, margin, oyBottom, plotH) {
    const x = cw - margin.right + 26;
    const y = oyBottom - plotH;
    const barWidth = 12;
    const gradient = ctx.createLinearGradient(0, y + plotH, 0, y);
    gradient.addColorStop(0, "#25323a");
    gradient.addColorStop(0.22, "#2ec4b6");
    gradient.addColorStop(0.52, "#ffd166");
    gradient.addColorStop(0.78, "#f77f00");
    gradient.addColorStop(1, "#f8f9fa");
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, plotH);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(x, y, barWidth, plotH);
    ctx.fillStyle = "rgba(241,243,245,0.86)";
    ctx.font = "10px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(formatIlluminance(data.maxLux), x - 4, y - 8);
    ctx.fillText("0", x + 2, y + plotH + 12);
    ctx.restore();
  }

  function drawCenteredHint(ctx, cw, ch, text) {
    ctx.save();
    ctx.fillStyle = "rgba(170,178,189,0.85)";
    ctx.font = "15px Segoe UI, Noto Sans TC, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cw / 2, ch / 2);
    ctx.restore();
  }

  function niceStep(span) {
    const target = span / 10;
    const candidates = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500];
    for (let i = 0; i < candidates.length; i += 1) {
      if (candidates[i] >= target) {
        return candidates[i];
      }
    }
    return candidates[candidates.length - 1];
  }

  function illuminanceLevels(maxLux) {
    if (!Number.isFinite(maxLux) || maxLux <= 0) {
      return [];
    }
    let values;
    if (state.levelMode === "lux") {
      values = [2000, 1500, 1000, 750, 500, 300, 200, 150, 100, 75, 50, 30, 20, 10, 5]
        .filter((value) => value > 0 && value < maxLux);
      if (!values.length) {
        values = [0.75, 0.5, 0.25, 0.1, 0.05].map((ratio) => maxLux * ratio);
      }
    } else {
      values = [0.9, 0.75, 0.5, 0.25, 0.1, 0.05].map((ratio) => maxLux * ratio);
    }
    return values
      .filter((value, index, array) => value > 0 && array.indexOf(value) === index)
      .sort((a, b) => a - b)
      .map((value) => ({ value, label: formatIlluminance(value) }));
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

  // ---- 3D view -----------------------------------------------------------

  const three = {
    ready: false,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    ground: null,
    groundTexture: null,
    textureCanvas: null,
    grid: null,
    lumGroup: null,
    markerGroup: null,
    photGroup: null,
    photGeometry: null,
    photMaterial: null,
    photIes: null,
    raf: null,
    groundLength: 0,
    groundWidth: 0,
  };

  function setViewMode(mode, save = true) {
    state.viewMode = mode === "3d" ? "3d" : "2d";
    const is3d = state.viewMode === "3d";
    els.view2dBtn.classList.toggle("is-active", !is3d);
    els.view3dBtn.classList.toggle("is-active", is3d);
    els.planCanvas.style.display = is3d ? "none" : "block";
    els.scene3d.style.display = is3d ? "block" : "none";
    els.resetView3dBtn.hidden = !is3d;
    els.rotate3dBtn.hidden = !is3d;
    if (is3d) {
      ensureThree();
      resize3d();
      update3dScene();
      startLoop3d();
    } else {
      stopLoop3d();
      draw();
    }
    if (save) {
      scheduleSave();
    }
  }

  function ensureThree() {
    if (three.ready || !global.THREE) {
      return;
    }
    const THREE = global.THREE;
    three.scene = new THREE.Scene();
    three.scene.background = new THREE.Color(0x111318);
    three.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    three.renderer = new THREE.WebGLRenderer({ antialias: true });
    three.renderer.setPixelRatio(global.devicePixelRatio || 1);
    els.scene3d.appendChild(three.renderer.domElement);
    three.controls = new THREE.OrbitControls(three.camera, three.renderer.domElement);
    three.controls.enableDamping = true;
    three.controls.dampingFactor = 0.08;
    three.controls.autoRotate = false;
    three.controls.autoRotateSpeed = 1.2;
    three.lumGroup = new THREE.Group();
    three.markerGroup = new THREE.Group();
    three.photGroup = new THREE.Group();
    three.scene.add(three.lumGroup);
    three.scene.add(three.markerGroup);
    three.scene.add(three.photGroup);
    three.textureCanvas = document.createElement("canvas");
    three.ready = true;
    resize3d();
    resetCamera3d();
  }

  function resetCamera3d() {
    if (!three.ready) {
      return;
    }
    const span = Math.max(state.groundLength, state.groundWidth, state.mountHeight * 2, 1);
    three.camera.position.set(span * 0.55, span * 0.85, span * 1.05);
    three.controls.target.set(0, 0, 0);
    three.controls.update();
  }

  function resize3d() {
    if (!three.ready) {
      return;
    }
    const width = els.scene3d.clientWidth;
    const height = els.scene3d.clientHeight;
    if (!width || !height) {
      return;
    }
    three.camera.aspect = width / height;
    three.camera.updateProjectionMatrix();
    three.renderer.setSize(width, height);
  }

  function startLoop3d() {
    if (!three.ready || three.raf != null) {
      return;
    }
    const tick = () => {
      three.raf = requestAnimationFrame(tick);
      three.controls.update();
      three.renderer.render(three.scene, three.camera);
    };
    tick();
  }

  function stopLoop3d() {
    if (three.raf != null) {
      cancelAnimationFrame(three.raf);
      three.raf = null;
    }
  }

  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children[group.children.length - 1];
      group.remove(child);
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material.map) {
            material.map.dispose();
          }
          material.dispose();
        });
      }
    }
  }

  // Renders the current illuminance map (heatmap + contours + max/min marks)
  // to an offscreen canvas used as the 3D ground texture, so 2D and 3D stay
  // visually consistent.
  function updateGroundTexture() {
    const THREE = global.THREE;
    const data = state.result;
    const canvas = three.textureCanvas;
    const length = Math.max(state.groundLength, 0.01);
    const width = Math.max(state.groundWidth, 0.01);
    let texW;
    let texH;
    if (length >= width) {
      texW = 1024;
      texH = Math.max(64, Math.round((1024 * width) / length));
    } else {
      texH = 1024;
      texW = Math.max(64, Math.round((1024 * length) / width));
    }
    canvas.width = texW;
    canvas.height = texH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a1d22";
    ctx.fillRect(0, 0, texW, texH);

    if (data) {
      const toPx = (x, y) => ({
        x: (x / data.length) * texW,
        y: (1 - y / data.width) * texH,
      });
      drawHeatmap(ctx, data, toPx);
      drawContours(ctx, data, toPx, {
        showLabels: state.showContourLabels,
        labelScale: 1.7,
      });
      drawExtremeMarkers(ctx, data, toPx);
    }

    const step = niceStep(Math.max(length, width));
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < length - EPS; x += step) {
      const px = (x / length) * texW;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, texH);
    }
    for (let y = step; y < width - EPS; y += step) {
      const py = (1 - y / width) * texH;
      ctx.moveTo(0, py);
      ctx.lineTo(texW, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.strokeRect(0.5, 0.5, texW - 1, texH - 1);

    if (!three.groundTexture) {
      three.groundTexture = new THREE.CanvasTexture(canvas);
    } else {
      three.groundTexture.needsUpdate = true;
    }
  }

  function update3dScene() {
    if (state.viewMode !== "3d") {
      return;
    }
    ensureThree();
    if (!three.ready) {
      return;
    }
    const THREE = global.THREE;
    const length = Math.max(state.groundLength, 0.01);
    const width = Math.max(state.groundWidth, 0.01);
    const height = Math.max(state.mountHeight, 0.01);

    updateGroundTexture();

    if (!three.ground || three.groundLength !== length || three.groundWidth !== width) {
      if (three.ground) {
        three.scene.remove(three.ground);
        three.ground.geometry.dispose();
        three.ground.material.dispose();
      }
      const geometry = new THREE.PlaneGeometry(length, width);
      const material = new THREE.MeshBasicMaterial({
        map: three.groundTexture,
        side: THREE.DoubleSide,
      });
      three.ground = new THREE.Mesh(geometry, material);
      three.ground.rotation.x = -Math.PI / 2;
      three.scene.add(three.ground);
      three.groundLength = length;
      three.groundWidth = width;

      if (three.grid) {
        three.scene.remove(three.grid);
        three.grid.geometry.dispose();
        three.grid.material.dispose();
      }
      const span = Math.max(length, width) * 1.35;
      const step = niceStep(Math.max(length, width));
      const divisions = Math.max(2, Math.round(span / step));
      three.grid = new THREE.GridHelper(span, divisions, 0x303640, 0x24282f);
      three.grid.position.y = -0.06;
      three.scene.add(three.grid);
      resetCamera3d();
    } else {
      three.ground.material.map = three.groundTexture;
      three.ground.material.needsUpdate = true;
    }

    clearGroup(three.lumGroup);
    const size = effectiveLuminaireSize() / 2;
    syncLuminaireSizeControl();
    const boxGeometry = new THREE.BoxGeometry(size * 2, size, size * 2);
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const dropMaterial = new THREE.LineBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.3,
    });
    const tickMaterial = new THREE.LineBasicMaterial({ color: 0xfff3c4 });
    state.luminaires.forEach((lum) => {
      const x = (Number(lum.x) || 0) - length / 2;
      const z = width / 2 - (Number(lum.y) || 0);
      const rot = (Number(lum.rot) || 0) * DEG;
      const box = new THREE.Mesh(boxGeometry, boxMaterial);
      box.position.set(x, height, z);
      three.lumGroup.add(box);
      three.lumGroup.add(lineBetween3d(
        new THREE.Vector3(x, height, z),
        new THREE.Vector3(x, 0, z),
        dropMaterial
      ));
      three.lumGroup.add(lineBetween3d(
        new THREE.Vector3(x, height, z),
        new THREE.Vector3(x + Math.cos(rot) * size * 3, height, z - Math.sin(rot) * size * 3),
        tickMaterial
      ));
    });
    three.lumGroup.visible = state.show3dLuminaires;

    updatePhotometry3d(length, width, height);

    clearGroup(three.markerGroup);
    if (state.result) {
      addExtremePillar(state.result.maxPoint, 0xff6bcb, "max", length, width, height);
      addExtremePillar(state.result.minPoint, 0x7cc4ff, "min", length, width, height);
    }
  }

  // ---- Photometric solids at each luminaire ------------------------------

  // Lamp box size (footprint edge, meters): user slider value or an
  // auto default scaled to the ground size.
  function effectiveLuminaireSize() {
    if (Number.isFinite(state.luminaireSize) && state.luminaireSize > 0) {
      return state.luminaireSize;
    }
    const span = Math.max(state.groundLength, state.groundWidth);
    return Math.min(Math.max(span / 45, 0.24), 4);
  }

  function syncLuminaireSizeControl() {
    const size = effectiveLuminaireSize();
    els.lumSizeSlider.value = size;
    els.lumSizeValue.textContent = formatInputNumber(size, 2);
  }

  function effectivePhotometryRadius() {
    if (Number.isFinite(state.photometryRadius) && state.photometryRadius > 0) {
      return state.photometryRadius;
    }
    return autoPhotometryRadius();
  }

  // Auto size: half the closest lamp-to-lamp spacing, so neighbouring solids
  // just touch without overlapping.
  function autoPhotometryRadius() {
    const lums = state.luminaires;
    let minDist = Infinity;
    const count = Math.min(lums.length, 400);
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = (Number(lums[i].x) || 0) - (Number(lums[j].x) || 0);
        const dy = (Number(lums[i].y) || 0) - (Number(lums[j].y) || 0);
        const dist = Math.hypot(dx, dy);
        if (dist > EPS && dist < minDist) {
          minDist = dist;
        }
      }
    }
    if (!Number.isFinite(minDist)) {
      minDist = Math.max(state.groundLength, state.groundWidth) / 4;
    }
    return Math.min(Math.max(minDist / 2, 0.3), 10);
  }

  function syncPhotometryRadiusControl() {
    const radius = effectivePhotometryRadius();
    els.photRadiusSlider.value = radius;
    els.photRadiusValue.textContent = formatInputNumber(radius, 1);
  }

  function decimateIndices(count, maxCount) {
    const indices = [];
    if (count <= maxCount) {
      for (let i = 0; i < count; i += 1) {
        indices.push(i);
      }
      return indices;
    }
    const step = (count - 1) / (maxCount - 1);
    for (let i = 0; i < maxCount; i += 1) {
      indices.push(Math.round(i * step));
    }
    return indices;
  }

  // One shared geometry per IES file, normalized to max radius 1 so the
  // per-lamp mesh scale equals the display radius in meters.
  function buildPhotometryGeometry(ies) {
    const THREE = global.THREE;
    const surface = core.expandHorizontalData(ies);
    const hIdx = decimateIndices(surface.angles.length, 49);
    const vIdx = decimateIndices(ies.verticalAngles.length, 37);
    const maxCd = Math.max(ies.stats.maxCandela, EPS);
    const positions = [];
    const colors = [];
    for (let hi = 0; hi < hIdx.length; hi += 1) {
      const phi = surface.angles[hIdx[hi]] * DEG;
      const row = surface.rows[hIdx[hi]];
      for (let vi = 0; vi < vIdx.length; vi += 1) {
        const gamma = ies.verticalAngles[vIdx[vi]] * DEG;
        const r = Math.max(row[vIdx[vi]], 0) / maxCd;
        const sinG = Math.sin(gamma);
        positions.push(
          r * sinG * Math.cos(phi),
          -r * Math.cos(gamma),
          -r * sinG * Math.sin(phi)
        );
        const rgb = illuminanceColor(r);
        colors.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      }
    }
    const cols = vIdx.length;
    const indices = [];
    for (let hi = 0; hi < hIdx.length - 1; hi += 1) {
      for (let vi = 0; vi < cols - 1; vi += 1) {
        const a = hi * cols + vi;
        const b = a + cols;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  function updatePhotometry3d(length, width, height) {
    const THREE = global.THREE;
    if (!three.photGroup) {
      return;
    }
    clearGroupKeepAssets(three.photGroup);
    if (!state.show3dPhotometry || !state.ies) {
      return;
    }
    if (!three.photGeometry || three.photIes !== state.ies) {
      if (three.photGeometry) {
        three.photGeometry.dispose();
      }
      three.photGeometry = buildPhotometryGeometry(state.ies);
      three.photIes = state.ies;
    }
    if (!three.photMaterial) {
      three.photMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: state.photometryOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    three.photMaterial.opacity = state.photometryOpacity;
    const radius = effectivePhotometryRadius();
    syncPhotometryRadiusControl();
    state.luminaires.forEach((lum) => {
      const mesh = new THREE.Mesh(three.photGeometry, three.photMaterial);
      mesh.position.set(
        (Number(lum.x) || 0) - length / 2,
        height,
        width / 2 - (Number(lum.y) || 0)
      );
      mesh.rotation.y = (Number(lum.rot) || 0) * DEG;
      mesh.scale.setScalar(radius);
      three.photGroup.add(mesh);
    });
  }

  // Removes children without disposing shared geometry/material.
  function clearGroupKeepAssets(group) {
    while (group.children.length) {
      group.remove(group.children[group.children.length - 1]);
    }
  }

  function lineBetween3d(a, b, material) {
    const THREE = global.THREE;
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
    return new THREE.Line(geometry, material);
  }

  function addExtremePillar(point, color, label, length, width, height) {
    const THREE = global.THREE;
    const x = point.x - length / 2;
    const z = width / 2 - point.y;
    const top = Math.max(height * 0.8, 0.4);
    const material = new THREE.LineBasicMaterial({ color });
    three.markerGroup.add(lineBetween3d(
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x, top, z),
      material
    ));
    const sprite = makeTextSprite(label, color);
    const span = Math.max(length, width);
    sprite.scale.set(span * 0.08, span * 0.04, 1);
    sprite.position.set(x, top + span * 0.025, z);
    three.markerGroup.add(sprite);
  }

  function makeTextSprite(text, color) {
    const THREE = global.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(17,19,24,0.85)";
    ctx.fillRect(12, 8, 104, 48);
    ctx.font = "bold 30px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
    ctx.fillText(text, 64, 33);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    return new THREE.Sprite(material);
  }

  // ---- Persistence -------------------------------------------------------

  function scheduleSave(delay = 500) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, delay);
  }

  function saveState() {
    const payload = {
      version: 5,
      areaPreset: state.areaPreset,
      viewMode: state.viewMode,
      showLumIndex: state.showLumIndex,
      showContourLabels: state.showContourLabels,
      show3dLuminaires: state.show3dLuminaires,
      show3dPhotometry: state.show3dPhotometry,
      luminaireSize: state.luminaireSize,
      photometryRadius: state.photometryRadius,
      photometryOpacity: state.photometryOpacity,
      groundLength: state.groundLength,
      groundWidth: state.groundWidth,
      gridX: state.gridX,
      gridY: state.gridY,
      flux: state.flux,
      fluxUnit: state.fluxUnit,
      illuminanceUnit: state.illuminanceUnit,
      mountHeight: state.mountHeight,
      fieldRows: state.fieldRows,
      fieldCols: state.fieldCols,
      fieldRot: state.fieldRot,
      levelMode: state.levelMode,
      luminaires: state.luminaires,
      iesName: state.iesName,
      iesText: state.iesText,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      /* storage full or unavailable: keep running without persistence */
    }
  }

  function restoreState() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return;
    }
    if (!raw) {
      return;
    }
    try {
      const data = JSON.parse(raw);
      state.areaPreset =
        data.areaPreset === "custom" || AREA_PRESETS.some((preset) => preset.id === data.areaPreset)
          ? data.areaPreset
          : "custom";
      state.groundLength = parsePositiveNumber(data.groundLength, state.groundLength);
      state.groundWidth = parsePositiveNumber(data.groundWidth, state.groundWidth);
      state.gridX = clampInt(data.gridX, GRID_MIN, GRID_MAX, state.gridX);
      state.gridY = clampInt(data.gridY, GRID_MIN, GRID_MAX, state.gridY);
      state.flux = Number.isFinite(Number(data.flux)) && Number(data.flux) > 0 ? Number(data.flux) : null;
      state.fluxUnit = data.fluxUnit === "PPF" ? "PPF" : "lm";
      state.illuminanceUnit = data.illuminanceUnit === "PPFD" ? "PPFD" : "lux";
      state.mountHeight = parsePositiveNumber(data.mountHeight, state.mountHeight);
      state.fieldRows = clampInt(data.fieldRows, 1, 100, state.fieldRows);
      state.fieldCols = clampInt(data.fieldCols, 1, 100, state.fieldCols);
      state.fieldRot = Number.isFinite(Number(data.fieldRot)) ? Number(data.fieldRot) : state.fieldRot;
      state.levelMode = data.levelMode === "lux" ? "lux" : "percent";
      state.viewMode = data.viewMode === "3d" ? "3d" : "2d";
      state.showLumIndex = data.showLumIndex !== false;
      state.showContourLabels = data.showContourLabels !== false;
      state.show3dLuminaires = data.show3dLuminaires !== false;
      state.show3dPhotometry = data.show3dPhotometry === true;
      state.luminaireSize =
        Number.isFinite(Number(data.luminaireSize)) && Number(data.luminaireSize) > 0
          ? Number(data.luminaireSize)
          : null;
      state.photometryRadius =
        Number.isFinite(Number(data.photometryRadius)) && Number(data.photometryRadius) > 0
          ? Number(data.photometryRadius)
          : null;
      state.photometryOpacity = Number.isFinite(Number(data.photometryOpacity))
        ? Math.min(Math.max(Number(data.photometryOpacity), 0.15), 1)
        : state.photometryOpacity;
      if (Array.isArray(data.luminaires)) {
        state.luminaires = data.luminaires
          .filter((lum) => lum && Number.isFinite(Number(lum.x)) && Number.isFinite(Number(lum.y)))
          .map((lum) => ({
            x: Number(lum.x),
            y: Number(lum.y),
            rot: Number.isFinite(Number(lum.rot)) ? Number(lum.rot) : 0,
          }));
      }
      if (data.iesText) {
        try {
          state.ies = core.parseIes(data.iesText, data.iesName || "");
          state.iesText = data.iesText;
          state.iesName = data.iesName || "";
        } catch (error) {
          /* stale saved file: ignore */
        }
      }
    } catch (error) {
      /* corrupted storage: start fresh */
    }
  }

  // ---- Warnings / formatting --------------------------------------------

  function showWarnings(warnings) {
    const list = Array.isArray(warnings) ? warnings : [];
    els.warningPanel.hidden = list.length === 0;
    els.warningList.textContent = "";
    list.forEach((warning) => {
      const li = document.createElement("li");
      li.textContent = warning;
      els.warningList.appendChild(li);
    });
  }

  function fluxUnitLabel() {
    return state.fluxUnit === "PPF" ? "PPF" : "lm";
  }

  function illuminanceUnitLabel() {
    return state.illuminanceUnit === "PPFD" ? "PPFD" : "lux";
  }

  function formatIlluminance(value) {
    if (!Number.isFinite(value)) {
      return "--";
    }
    const abs = Math.abs(value);
    let digits = 2;
    if (abs >= 100) {
      digits = 0;
    } else if (abs >= 10) {
      digits = 1;
    }
    return `${formatNumber(value, digits)} ${illuminanceUnitLabel()}`;
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

  function formatInputNumber(value, digits) {
    if (!Number.isFinite(value)) {
      return "";
    }
    const trimmed = Number(value).toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return trimmed === "-0" ? "0" : trimmed;
  }

  function parsePositiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function clampInt(value, min, max, fallback) {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
  }

  function roundTo(value, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  global.IesCalcApp = {
    state,
    three,
    loadIesText,
    recalcNow: () => scheduleRecalc(0),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
