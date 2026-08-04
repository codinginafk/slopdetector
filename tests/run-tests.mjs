// run-tests.mjs
//
// Runs slopdetector-test-cases.json against your live API and prints a
// pass/fail-style report. I couldn't reach slopdetector.praveentechworld.com
// myself (network sandbox blocks it, and URL-guessing is blocked on the
// fetch side too), so this is built to run on your machine / in your
// pipeline, not something I executed.
//
// EDIT THE ADAPTER BELOW to match your actual route, payload shape, and
// response shape — I'm guessing a plausible REST contract based on your
// site copy ("Paste text... Scan for slop"), not your real API, since I
// have no way to confirm it.
//
// Usage: node run-tests.mjs

import { readFile } from "node:fs/promises";

const API_BASE = "https://slopdetector.praveentechworld.com";

// ---- ADAPTER: real API contract (see api/analyze.js) -------------------
async function scanText(text) {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${errBody ? " " + errBody.slice(0, 200) : ""}`);
  }

  const data = await res.json();

  return {
    bucket: data.judge?.bucket ?? null,
    score: data.combined?.score ?? data.heuristic?.score ?? null,
    confidence: data.judge?.confidence ?? null,
    heuristic: data.heuristic?.score ?? null,
    judgeScore: data.judge?.ai_likelihood ?? null,
    judgeModel: data.judge?.model ?? null,
    judgeError: data.judgeError ?? null,
    meta: data.meta ?? null,
    raw: data,
  };
}
// ------------------------------------------------------------------------

function judgeAgainstExpectation(testCase, result, error) {
  if (error) return { verdict: "ERROR", detail: error.message };

  const gt = testCase.ground_truth;
  const wantsHigh = gt === "human" ? false : gt === "ai" ? true : null;

  if (wantsHigh === null) {
    // Edge cases: no scripted pass/fail, just surface the result for a human look.
    return { verdict: "REVIEW", detail: "behavioral case — read expected_behavior manually" };
  }

  if (result.score == null) {
    return { verdict: "REVIEW", detail: "no numeric score returned — check adapter mapping" };
  }

  const scoredHigh = result.score >= 50;
  const matches = scoredHigh === wantsHigh;
  return {
    verdict: matches ? "MATCH" : "MISMATCH",
    detail: `ground_truth=${gt}, combined=${result.score}, heuristic=${result.heuristic}, judge=${result.judgeScore} (${result.bucket ?? "n/a"}, ${result.confidence ?? "n/a"}, ${result.judgeModel ?? "no judge"})`,
  };
}

async function main() {
  const raw = await readFile(new URL("./slopdetector-test-cases.json", import.meta.url), "utf-8");
  const cases = JSON.parse(raw);

  console.log(`Running ${cases.length} test cases against ${API_BASE}\n`);
  const rows = [];

  for (const tc of cases) {
    let result = null;
    let error = null;
    try {
      result = await scanText(tc.text);
    } catch (e) {
      error = e;
    }
    const judged = judgeAgainstExpectation(tc, result, error);
    rows.push({
      id: tc.id,
      category: tc.category,
      verdict: judged.verdict,
      detail: judged.detail,
    });
    console.log(`[${judged.verdict.padEnd(8)}] ${tc.id} (${tc.category})`);
    console.log(`           ${judged.detail}`);
    if (result?.meta) {
      const m = result.meta;
      console.log(`           meta: words=${m.words}, type=${m.detectedType ?? "prose"}, codeBlocks=${m.codeBlocks ?? 0}, short=${m.short}`);
    }
    if (result?.judgeError) {
      console.log(`           judge: ${result.judgeError}`);
    }
    console.log(`           expected: ${tc.expected_behavior}`);
    console.log("");
  }

  const mismatches = rows.filter((r) => r.verdict === "MISMATCH" || r.verdict === "ERROR");
  console.log("---");
  console.log(`${rows.length} run, ${mismatches.length} need attention (MISMATCH/ERROR).`);
  if (mismatches.length) {
    console.log("Flagged:", mismatches.map((r) => r.id).join(", "));
  }
}

main().catch((e) => {
  console.error("Test run failed:", e);
  process.exit(1);
});
