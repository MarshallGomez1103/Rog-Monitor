/* ROG Monitor — Matemática pura del editor de curvas de ventiladores (F3-02).
 * Conversión cap RPM <-> PWM <-> RPM con la calibración medida, estimación de
 * ruido y geometría de la gráfica SVG (°C/PWM <-> x/y). Solo presentación de la
 * UI: NO valida ni aplica curvas (eso es priv.js y el servicio root). Sin DOM
 * ni estado: las funciones que leen el perfil reciben `cfg` (resultado de
 * fan-config: { curves, max_rpm, calibration }) como primer argumento. Script
 * clásico: expone window.RogFanCurveModel y, bajo Node, module.exports. */
(function (root) {
  'use strict';

  const FAN_NAMES = { cpu: 'fan.name.cpu', gpu: 'fan.name.gpu', mid: 'fan.name.mid' };
  const FAN_MAX_DEFAULT = { cpu: 7000, gpu: 6900, mid: 7500 };
  const FAN_GRAPH = {
    tempMin: 40,
    tempMax: 105,
    x0: 42,
    x1: 520,
    yTop: 36,
    yBottom: 204,
    ticks: [40, 50, 60, 70, 80, 90, 100],
  };

  const fanKeys = (cfg) => Object.keys(cfg?.curves || FAN_NAMES);

  const fanCalibrated = (cfg, fan) => (cfg?.calibration?.[fan] || []).length >= 2;

  const fanMaxRpm = (cfg, fan) => cfg?.max_rpm?.[fan] || FAN_MAX_DEFAULT[fan] || 6000;

  /* puntos [pwm, rpm] medidos, sin rpm 0, ordenados por pwm */
  const calPoints = (cfg, fan) => (cfg?.calibration?.[fan] || [])
    .filter(([, r]) => r > 0).sort((a, b) => a[0] - b[0]);

  // PWM límite para un cap en RPM: interpola la calibración medida (igual que
  // el servicio root); sin calibración, regla de tres con el máximo estimado.
  function capToPwm(cfg, cap, fan) {
    const target = cap * 0.985;
    const pts = calPoints(cfg, fan);
    if (pts.length >= 2) {
      if (target >= pts[pts.length - 1][1]) return 255;
      let prev = [0, 0];
      for (const [p, r] of pts) {
        if (r >= target) {
          if (r === prev[1]) return p;
          return Math.round(prev[0] + ((target - prev[1]) / (r - prev[1])) * (p - prev[0]));
        }
        prev = [p, r];
      }
    }
    return Math.min(255, Math.round(target * 255 / fanMaxRpm(cfg, fan)));
  }

  function pwmToRpm(cfg, pwm, fan) {
    const pts = calPoints(cfg, fan);
    if (pts.length >= 2) {
      if (pwm <= pts[0][0]) return Math.round(pts[0][1] * (pwm / Math.max(1, pts[0][0])));
      let prev = pts[0];
      for (const point of pts.slice(1)) {
        const [p, r] = point;
        if (pwm <= p) {
          const frac = (pwm - prev[0]) / Math.max(1, p - prev[0]);
          return Math.round(prev[1] + frac * (r - prev[1]));
        }
        prev = point;
      }
      return pts[pts.length - 1][1];
    }
    return Math.round((pwm / 255) * fanMaxRpm(cfg, fan));
  }

  function estimateFanDba(cfg, fan, rpm) {
    const max = Math.max(1, fanMaxRpm(cfg, fan));
    const ratio = Math.max(0, Math.min(1, rpm / max));
    return 24 + 24 * Math.pow(ratio, 2.15);
  }

  function combinedDba(values) {
    const valid = values.filter((v) => Number.isFinite(v) && v > 0);
    if (!valid.length) return null;
    const power = valid.reduce((sum, db) => sum + Math.pow(10, db / 10), 0);
    return 10 * Math.log10(power);
  }

  function capMapFromSource(caps, keys) {
    const out = {};
    for (const fan of keys) {
      const raw = caps?.[fan];
      const cap = Math.round(+raw);
      if (Number.isFinite(cap) && cap >= 2000) out[fan] = cap;
    }
    return out;
  }

  function capValues(caps) {
    return Object.values(caps || {}).filter((v) => Number.isFinite(+v) && +v >= 2000).map((v) => Math.round(+v));
  }

  /* Texto del tope: `noCapText` si no hay; «N RPM» si es común; «CPU n · GPU n» si difiere.
     `nameOf(fan)` da el nombre visible (i18n lo pone app.js). */
  function fanCapDisplay(caps, nameOf, noCapText) {
    const values = capValues(caps);
    if (!values.length) return noCapText;
    const unique = [...new Set(values)];
    if (unique.length === 1) return `${unique[0]} RPM`;
    return Object.entries(caps)
      .filter(([, v]) => Number.isFinite(+v) && +v >= 2000)
      .map(([fan, v]) => `${nameOf(fan)} ${Math.round(+v)}`)
      .join(' · ');
  }

  function tempToGraphX(temp) {
    const t = Math.max(FAN_GRAPH.tempMin, Math.min(FAN_GRAPH.tempMax, Number(temp) || FAN_GRAPH.tempMin));
    return FAN_GRAPH.x0 + ((t - FAN_GRAPH.tempMin) / (FAN_GRAPH.tempMax - FAN_GRAPH.tempMin)) * (FAN_GRAPH.x1 - FAN_GRAPH.x0);
  }

  function pwmToGraphY(pwm) {
    const p = Math.max(0, Math.min(255, Number(pwm) || 0));
    return FAN_GRAPH.yBottom - (p / 255) * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
  }

  /* x del SVG -> °C entero, entre los vecinos (`tempInputs[i].value`) para mantener el orden estricto */
  function graphXToTemp(x, pointIndex, tempInputs) {
    const ratio = (x - FAN_GRAPH.x0) / (FAN_GRAPH.x1 - FAN_GRAPH.x0);
    const temp = Math.round(FAN_GRAPH.tempMin + ratio * (FAN_GRAPH.tempMax - FAN_GRAPH.tempMin));
    const prev = pointIndex > 0 ? Math.round(+tempInputs[pointIndex - 1].value) + 1 : FAN_GRAPH.tempMin;
    const next = pointIndex < tempInputs.length - 1 ? Math.round(+tempInputs[pointIndex + 1].value) - 1 : FAN_GRAPH.tempMax;
    return Math.max(prev, Math.min(next, temp));
  }

  function graphYToPercent(y) {
    const ratio = (FAN_GRAPH.yBottom - y) / (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }

  const api = {
    FAN_NAMES, FAN_GRAPH, fanKeys, fanCalibrated, fanMaxRpm, capToPwm, pwmToRpm,
    estimateFanDba, combinedDba, capMapFromSource, capValues, fanCapDisplay,
    tempToGraphX, pwmToGraphY, graphXToTemp, graphYToPercent,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RogFanCurveModel = api;
})(typeof window !== 'undefined' ? window : null);
