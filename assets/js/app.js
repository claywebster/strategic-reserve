/* Strategic Petroleum Reserve depletion tracker — front end */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 1) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // Shared Chart.js defaults
  if (window.Chart) {
    Chart.defaults.color = "#9c8c70";
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
  }

  const COLORS = {
    amber: "#f4a52b",
    amberSoft: "#ffcd6b",
    red: "#e23b2e",
    redSoft: "#ff6a4d",
    crude: "#e9c46a",
    grid: "rgba(255,255,255,0.05)",
  };

  // Scriptable gradient helpers — rebuilt from the live chart area so they span
  // the rendered chart correctly at any size (and after resize).
  function hGrad(chart, stops) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return stops[0][1];
    const g = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function vGrad(chart, top, bottom) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return top;
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    return g;
  }

  async function loadJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  /* ---------- Animated count-up for the hero ---------- */
  function countUp(el, target, decimals = 1, ms = 1400) {
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (from + (target - from) * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- SPR: hero + main drawdown chart ---------- */
  function renderSPR(spr) {
    const current = spr.current;
    const peak = spr.peak ? spr.peak.value : Math.max(...spr.annual.map((a) => a.barrels));
    const lost = peak - current;
    const remain = (current / peak) * 100;

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) $("hero-current").textContent = fmt(current);
    else countUp($("hero-current"), current, 1);

    $("hero-delta").textContent = `▼ ${fmt(spr.latestDropM, 0)}M barrels in the latest decline`;
    $("hero-since").textContent = spr.lowestSince || "—";
    $("pill-peak").textContent = `${fmt(peak, 1)}M`;
    $("pill-lost").textContent = `−${fmt(lost, 1)}M`;
    $("pill-remain").textContent = `${fmt(remain, 0)}%`;

    const cap = $("sprCaption");
    if (cap) cap.innerHTML = `Source: <a href="${spr.sourceUrl}" target="_blank" rel="noopener" style="color:#f4a52b">U.S. EIA — SPR weekly stocks (WCSSTUS1)</a>. Values are year-end, in million barrels.`;

    const labels = spr.annual.map((a) => a.year);
    const values = spr.annual.map((a) => a.barrels);

    const canvas = $("sprChart");
    const ctx = canvas.getContext("2d");

    // Horizontal gradients (amber, full -> red, depleted), spanning the live chart area
    const fillGrad = (c) => hGrad(c.chart, [
      [0, "rgba(244,165,43,0.55)"],
      [0.55, "rgba(233,138,40,0.45)"],
      [1, "rgba(226,59,46,0.42)"],
    ]);
    const lineGrad = (c) => hGrad(c.chart, [[0, COLORS.amberSoft], [1, COLORS.redSoft]]);

    // Plugin: dashed marker line for key events (e.g. 2022 historic release)
    const eventMarkers = {
      id: "eventMarkers",
      afterDatasetsDraw(chart) {
        const events = spr.events || [];
        const { ctx, scales: { x, y } } = chart;
        ctx.save();
        events.forEach((ev) => {
          const idx = labels.indexOf(ev.year);
          if (idx < 0) return;
          const px = x.getPixelForValue(ev.year);
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "rgba(255,106,77,0.7)";
          ctx.lineWidth = 1.5;
          ctx.moveTo(px, y.top);
          ctx.lineTo(px, y.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#ff6a4d";
          ctx.font = "600 11px 'Spline Sans Mono', monospace";
          ctx.textAlign = px > chart.width * 0.6 ? "right" : "left";
          const tx = px > chart.width * 0.6 ? px - 8 : px + 8;
          ctx.fillText(ev.label, tx, y.top + 14);
        });
        ctx.restore();
      },
    };

    new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "SPR crude (M bbl)",
          data: values,
          borderColor: lineGrad,
          borderWidth: 2.5,
          backgroundColor: fillGrad,
          fill: true,
          tension: 0.25,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#0a0805",
          pointBorderColor: lineGrad,
          pointBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1200 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a130b",
            borderColor: "#2c2114",
            borderWidth: 1,
            padding: 12,
            titleColor: "#f4ece0",
            bodyColor: "#ffcd6b",
            callbacks: { label: (c) => ` ${fmt(c.parsed.y, 1)} million barrels` },
          },
        },
        scales: {
          x: { grid: { color: COLORS.grid }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
          y: {
            grid: { color: COLORS.grid },
            ticks: { callback: (v) => v + "M" },
            suggestedMin: 0,
          },
        },
      },
      plugins: [eventMarkers],
    });
  }

  /* ---------- WTI price ---------- */
  function renderWTI(wti) {
    $("wti-current").textContent = "$" + fmt(wti.current, 2);
    const sub = $("wti-sub");
    if (sub) sub.textContent = wti.label || "WTI spot, Cushing OK";

    const labels = wti.series.map((p) => p.date);
    const values = wti.series.map((p) => p.price);
    const ctx = $("wtiChart").getContext("2d");

    new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: COLORS.crude,
          borderWidth: 2,
          backgroundColor: (c) => vGrad(c.chart, "rgba(233,196,106,0.35)", "rgba(233,196,106,0)"),
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: COLORS.crude,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a130b",
            callbacks: { label: (c) => ` $${fmt(c.parsed.y, 2)} / bbl` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 6, maxRotation: 0 } },
          y: { grid: { color: COLORS.grid }, ticks: { callback: (v) => "$" + v } },
        },
      },
    });
  }

  /* ---------- Top exporters ---------- */
  function renderExporters(exp) {
    $("exp-year").textContent = exp.year ? `${exp.year} · ${exp.unit}` : "";
    const sub = $("exp-sub");
    if (sub) sub.textContent = exp.label || "Crude oil exports by country";

    const rows = [...exp.countries].sort((a, b) => b.mbpd - a.mbpd);
    const labels = rows.map((c) => c.name);
    const values = rows.map((c) => c.mbpd);
    const ctx = $("expChart").getContext("2d");

    new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: (c) => hGrad(c.chart, [[0, COLORS.amber], [1, COLORS.redSoft]]),
          borderRadius: 5,
          barThickness: "flex",
          maxBarThickness: 22,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a130b",
            callbacks: { label: (c) => ` ${fmt(c.parsed.x, 1)} million bbl/day` },
          },
        },
        scales: {
          x: { grid: { color: COLORS.grid }, ticks: { callback: (v) => v + "M" } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  /* ---------- Hormuz ---------- */
  function renderHormuz(h) {
    $("hormuz-flow").textContent = fmt(h.flowBblPerDay, 1);
    $("hormuz-ships").textContent = fmt(h.shipsPerDay, 0);
    if (h.shareOfGlobalOil) $("hormuz-share").textContent = h.shareOfGlobalOil.replace(/of.*/i, "").trim() || "~20%";
    const note = $("hormuz-note");
    if (note) {
      note.innerHTML = `${h.note || ""} <a href="${h.sourceUrl}" target="_blank" rel="noopener" style="color:#f4a52b">EIA, as of ${h.asOf}</a>.`;
    }
  }

  /* ---------- Footer timestamp ---------- */
  function setUpdated(dates) {
    const valid = dates.filter(Boolean).sort();
    const latest = valid[valid.length - 1];
    const el = $("last-updated");
    if (el && latest) {
      const d = new Date(latest);
      el.textContent = isNaN(d) ? latest : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }
  }

  /* ---------- Boot ---------- */
  async function boot() {
    const results = await Promise.allSettled([
      loadJSON("data/spr.json"),
      loadJSON("data/wti.json"),
      loadJSON("data/exporters.json"),
      loadJSON("data/hormuz.json"),
    ]);
    const [spr, wti, exp, hormuz] = results.map((r) => (r.status === "fulfilled" ? r.value : null));

    try { if (spr) renderSPR(spr); } catch (e) { console.error("SPR render failed", e); }
    try { if (wti) renderWTI(wti); } catch (e) { console.error("WTI render failed", e); }
    try { if (exp) renderExporters(exp); } catch (e) { console.error("Exporters render failed", e); }
    try { if (hormuz) renderHormuz(hormuz); } catch (e) { console.error("Hormuz render failed", e); }

    setUpdated([spr && spr.asOf, wti && wti.asOf, exp && exp.asOf, hormuz && hormuz.asOf]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
