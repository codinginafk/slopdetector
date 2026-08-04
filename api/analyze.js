/**
 * api/analyze.js — Vercel serverless function for SlopDetector.
 *
 * POST /api/analyze   { "text": "..." }  or  { "url": "https://..." }
 * -> { heuristic, judge, combined, grade, matches, signals, humanize, meta }
 *
 * The Gemini key lives ONLY here (server-side env var). Heuristics run free
 * and instant; the judge is a paid optional second opinion.
 *
 * Local test:  node api/analyze.js
 */

import { analyze, stripCodeBlocks } from "../lib/analyzer.mjs";
import { judgeWithGemini } from "../lib/judge.mjs";
import { extractMainText } from "../lib/html-extract.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const config = { maxDuration: 60 };

const MAX_CHARS = 60000;
const MAX_URL_LEN = 2048;

// simple in-memory rate limiter (per warm instance; good smoke guard only)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const win = 60000;
  const entry = hits.get(ip) || { count: 0, resetAt: now + win };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + win;
  }
  entry.count++;
  hits.set(ip, entry);
  if (hits.size > 10000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  return entry.count > 30;
}

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "local"
  );
}

function cors(res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

// Local-dev bootstrap only: load slopdetector/.env when not running on Vercel.
// In production Vercel injects GEMINI_API_KEY as an env var itself.
// NOTE: no dynamic import() here - Vercel's ESM runtime bridge can deadlock
// on await import("node:*") and hang the function until the timeout.
function bootstrapEnv() {
  if (process.env.GEMINI_API_KEY) return;
  try {
    const envPath = fileURLToPath(new URL("../.env", import.meta.url));
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

export default async function handler(req, res) {
  bootstrapEnv();
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  if (rateLimited(clientIp(req))) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  try {
    let text = "";
    let source = "paste";

    if (payload.text && typeof payload.text === "string") {
      text = payload.text.trim();
    } else if (payload.url && typeof payload.url === "string") {
      const url = payload.url.trim();
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: "URL must start with http:// or https://" });
      }
      if (url.length > MAX_URL_LEN) {
        return res.status(400).json({ error: "URL too long" });
      }
      text = await extractMainText(url);
      source = "url";
    } else {
      return res.status(400).json({ error: 'Send {"text": "..."} or {"url": "https://..."}' });
    }

    if (text.length < 20) {
      return res.status(400).json({ error: "Not enough text to analyze (min ~20 chars)." });
    }
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
    }

    const prepared = stripCodeBlocks(text);
    const heuristic = analyze(prepared.text, { codeBlocks: prepared.codeBlocks });

    let judge = null;
    let judgeError = null;
    if (heuristic.meta.words >= 40) {
      const j = await judgeWithGemini(prepared.text);
      if (j.ok) {
        judge = j.judge;
        judge.model = j.model;
      } else {
        judgeError = j.error;
      }
    } else {
      judgeError = "Text too short for the semantic judge; heuristic only.";
    }

    const combined = combineScores(heuristic.score, judge, heuristic.meta.short);

    return res.status(200).json({
      source,
      meta: { ...heuristic.meta, judgedByGemini: !!judge },
      heuristic: {
        score: heuristic.score,
        grade: heuristic.grade,
        signals: heuristic.signals,
      },
      judge,
      judgeError,
      combined,
      matches: heuristic.matches,
      humanize: heuristic.humanize,
    });
  } catch (err) {
    return res.status(500).json({ error: "Analysis failed: " + (err?.message || "unknown error") });
  }
}

function combineScores(heuristicScore, judge, short) {
  let judgeWeight = 0.3;
  if (judge) {
    if (judge.confidence === "low") judgeWeight = 0.2;
    if (short) judgeWeight = 0.15;
  }
  const combined = judge
    ? Math.round(heuristicScore * (1 - judgeWeight) + judge.ai_likelihood * judgeWeight)
    : heuristicScore;

  const grade =
    combined <= 19 ? "Human-sounding" :
    combined <= 39 ? "Mostly human, minor tells" :
    combined <= 59 ? "AI-assisted (edited)" :
    combined <= 79 ? "Likely raw AI output" :
    "AI slop";

  return {
    score: combined,
    grade,
    judgeWeight: judge ? +judgeWeight.toFixed(2) : 0,
    note: judge
      ? `Weighted blend of heuristic fingerprint (${heuristicScore}) and semantic judge (${judge.ai_likelihood}).`
      : "Heuristic fingerprint only (semantic judge unavailable).",
  };
}

// ---------------------------------------------------------------------------
// Local self-test: node api/analyze.js
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && process.argv[1].endsWith("analyze.js");
if (isMain) {
  const slop = `In today's fast-paced digital landscape, it's important to note that leveraging the power of AI is crucial. This comprehensive guide will delve into the intricate tapestry of modern technology, unlocking the full potential of seamless integration. At the end of the day, empowering teams to navigate the complexities of the ever-evolving landscape is paramount. It's worth noting that a testament to the groundbreaking nature of this revolution is the myriad of transformative insights it offers. Unleash your potential and elevate your workflow to the next level.`;

  const human = `I fixed this same Windows Update hang twice last week, so let me tell you what actually worked. The first time, I spent an hour assuming it was a driver problem. It wasn't. The second machine had the exact same symptom and the fix took four minutes. Open the services console, stop Windows Update, delete the SoftwareDistribution folder, and start the service again. That's it. After that, the update queue restarts from scratch. One machine needed a reboot first, the other didn't. I have no idea why, and it didn't matter.`;

  function mockRes() {
    return {
      headers: {},
      statusCode: 200,
      body: null,
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { this.body = o; return this; },
      end() { return this; },
    };
  }

  const run = async (label, text) => {
    const r = mockRes();
    await handler({ method: "POST", headers: {}, body: JSON.stringify({ text }) }, r);
    console.log(`${label}: HTTP ${r.statusCode}`);
    if (r.body) {
      console.log("  combined:", r.body.combined.score, "|", r.body.combined.grade);
      console.log("  heuristic:", r.body.heuristic.score, "| judge:", r.body.judge ? r.body.judge.ai_likelihood + " " + r.body.judge.bucket + " (" + r.body.judge.confidence + ", " + r.body.judge.model + ")" : "none", "| judgeError:", r.body.judgeError || "n/a");
    }
  };

  run("slop sample", slop).then(() => run("human sample", human));
}
