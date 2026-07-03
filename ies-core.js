(function (global) {
  "use strict";

  // Shared IES core (V2): LM-63-2002 parsing, candela interpolation and
  // photometric helpers used by both the 3D viewer page and the
  // calculation page. Loaded before app_V2.js / calc_V2.js.

  const DEG = Math.PI / 180;
  const EPS = 1e-7;

  function parseIes(text, filename) {
    const cleaned = String(text || "").replace(/^﻿/, "").replace(/\r/g, "");
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

  // Maps any C-plane angle onto the angle range actually stored in the file,
  // mirroring symmetric data sets (0-90 / 0-180) per LM-63 conventions.
  function reduceHorizontalAngle(ies, angle) {
    const angles = ies.horizontalAngles;
    if (!angles || angles.length <= 1) {
      return angles && angles.length ? angles[0] : 0;
    }
    const first = angles[0];
    const last = angles[angles.length - 1];
    const normalized = normalizePlaneAngle(angle);
    if (Math.abs(last - first) >= 359 - EPS) {
      return normalized;
    }
    if (almost(first, 0) && almost(last, 180)) {
      return normalized > 180 ? 360 - normalized : normalized;
    }
    if (almost(first, 0) && almost(last, 90)) {
      const wrapped = positiveMod(normalized, 180);
      return wrapped > 90 ? 180 - wrapped : wrapped;
    }
    return normalized;
  }

  function interpolateCandela(ies, horizontalAngle, verticalAngle) {
    const row = interpolateHorizontalRow(ies, reduceHorizontalAngle(ies, horizontalAngle));
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

  function normalizePlaneAngle(angle) {
    const normalized = positiveMod(Number(angle), 360);
    return almost(normalized, 360) ? 0 : normalized;
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

  global.IesCore = {
    DEG,
    EPS,
    parseIes,
    parseKeywords,
    tokenizeNumbers,
    expandHorizontalData,
    generateSymmetricSurface,
    interpolateHorizontalRow,
    inferStep,
    estimateLumens,
    interpolateCandela,
    reduceHorizontalAngle,
    normalizePlaneAngle,
    almost,
    positiveMod,
    roundAngle,
  };
})(typeof window !== "undefined" ? window : globalThis);
