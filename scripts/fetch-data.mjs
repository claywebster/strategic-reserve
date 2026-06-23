#!/usr/bin/env node
/**
 * Refreshes data/*.json from the U.S. EIA Open Data API (v2).
 *
 * Usage:  EIA_API_KEY=xxxx node scripts/fetch-data.mjs
 *
 * Fails soft: if a request fails, the existing JSON for that dataset is left
 * untouched so the site never goes blank. Files are only rewritten when their
 * data actually changes.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const API_KEY = process.env.EIA_API_KEY;
const BASE = "https://api.eia.gov/v2";
const today = new Date().toISOString().slice(0, 10);

if (!API_KEY) {
  console.error("EIA_API_KEY is not set — skipping refresh, keeping committed data.");
  process.exit(0);
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(API_KEY, "***")}`);
  return res.json();
}

async function readData(name) {
  try {
    return JSON.parse(await readFile(join(DATA_DIR, name), "utf8"));
  } catch {
    return null;
  }
}

/** Write only if the serialized content changed. Returns true if written. */
async function writeIfChanged(name, obj) {
  const path = join(DATA_DIR, name);
  const next = JSON.stringify(obj, null, 2) + "\n";
  let prev = "";
  try { prev = await readFile(path, "utf8"); } catch { /* new file */ }
  // Ignore asOf-only differences when deciding whether to write.
  const strip = (s) => s.replace(/"asOf":\s*"[^"]*",?\n?/g, "");
  if (strip(prev) === strip(next)) {
    console.log(`= ${name} unchanged`);
    return false;
  }
  await writeFile(path, next);
  console.log(`✓ ${name} updated`);
  return true;
}

/* ---------------- SPR (series WCSSTUS1, thousand barrels weekly) -------------- */
async function updateSPR() {
  const url = `${BASE}/petroleum/stoc/wstk/data/?api_key=${API_KEY}&frequency=weekly&data[0]=value&facets[series][]=WCSSTUS1&sort[0][column]=period&sort[0][direction]=desc&length=5000`;
  const json = await getJSON(url);
  const rows = json?.response?.data || [];
  if (!rows.length) throw new Error("no SPR rows returned");

  // rows: [{period: 'YYYY-MM-DD', value: <thousand bbl>}], newest first.
  const points = rows
    .map((r) => ({ date: r.period, mbbl: Number(r.value) / 1000 }))
    .filter((p) => Number.isFinite(p.mbbl))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Year-end value for each year >= 2006 (latest observation within that year).
  const byYear = new Map();
  for (const p of points) {
    const y = Number(p.date.slice(0, 4));
    if (y >= 2006) byYear.set(y, p.mbbl); // later dates overwrite -> last of year
  }
  const annual = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, barrels]) => ({ year, barrels: round1(barrels) }));

  const latest = points[points.length - 1];
  const prevWeek = points[points.length - 2];
  const current = round1(latest.mbbl);
  const latestDropM = prevWeek ? Math.max(0, round1(prevWeek.mbbl - latest.mbbl)) : 0;
  const peakPoint = points.reduce((m, p) => (p.mbbl > m.mbbl ? p : m), points[0]);

  const existing = (await readData("spr.json")) || {};
  const out = {
    asOf: today,
    unit: "million barrels",
    current,
    latestDropM,
    lowestSince: existing.lowestSince || "July 1983",
    peak: { year: Number(peakPoint.date.slice(0, 4)), value: round1(peakPoint.mbbl) },
    source: "U.S. Energy Information Administration, Weekly Ending Stocks of Crude Oil in the SPR (WCSSTUS1)",
    sourceUrl: "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCSSTUS1&f=W",
    annual,
    events: existing.events || [{ year: 2022, label: "Historic 180M-barrel release" }],
  };
  await writeIfChanged("spr.json", out);
}

/* ---------------- WTI (series RWTC, $/bbl) ------------------------------------ */
async function updateWTI() {
  // Monthly resolution keeps the panel readable; pull ~3 years.
  const url = `${BASE}/petroleum/pri/spt/data/?api_key=${API_KEY}&frequency=monthly&data[0]=value&facets[series][]=RWTC&sort[0][column]=period&sort[0][direction]=desc&length=36`;
  const json = await getJSON(url);
  const rows = json?.response?.data || [];
  if (!rows.length) throw new Error("no WTI rows returned");

  const series = rows
    .map((r) => ({ date: r.period, price: Number(r.value) }))
    .filter((p) => Number.isFinite(p.price))
    .sort((a, b) => a.date.localeCompare(b.date));

  const out = {
    asOf: today,
    unit: "USD per barrel",
    current: round2(series[series.length - 1].price),
    label: "Cushing, OK WTI Spot Price FOB (light sweet crude)",
    source: "U.S. Energy Information Administration (RWTC)",
    sourceUrl: "https://www.eia.gov/dnav/pet/hist/rwtcd.htm",
    series: series.map((p) => ({ date: p.date, price: round2(p.price) })),
  };
  await writeIfChanged("wti.json", out);
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------------- runner ----------------------------------------------------- */
const tasks = [
  ["SPR", updateSPR],
  ["WTI", updateWTI],
  // exporters.json and hormuz.json are maintained as curated EIA snapshots; the
  // International exports API and the World Oil Transit Chokepoints figures do
  // not expose a clean, stable series for unattended refresh.
];

let failures = 0;
for (const [name, fn] of tasks) {
  try {
    await fn();
  } catch (err) {
    failures++;
    console.error(`✗ ${name} failed: ${err.message} — keeping existing data.`);
  }
}
console.log(failures ? `Done with ${failures} soft failure(s).` : "Done.");
process.exit(0);
