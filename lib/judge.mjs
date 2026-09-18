/**
 * judge.mjs — Gemini judge for a second, semantic-layer opinion.
 *
 * The deterministic analyzer catches surface tells. The judge reads the whole
 * text and looks for semantic-level patterns: uniform voice, no first-hand
 * detail, hedge-stacking, empty summary closers, ideas that don't connect.
 *
 * Schema-constrained JSON output (responseSchema), one retry on parse/schema
 * failure, then graceful fallback to the heuristic-only path.
 *
 * Env: GEMINI_API_KEY (required), GEMINI_JUDGE_MODEL (default gemini-3.6-flash)
 */

const DEFAULT_MODEL = process.env.GEMINI_JUDGE_MODEL || "gemini-3.6-flash";
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-2.0-flash"];

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    bucket: {
      type: "STRING",
      enum: ["clean_human", "ai_assisted_edited", "likely_ai_raw", "insufficient_text"],
    },
    ai_likelihood: { type: "INTEGER", description: "Ordinal 0-100, for ranking, not a calibrated probability" },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    tells: { type: "ARRAY", items: { type: "STRING" }, description: "Specific quoted phrases or patterns, max 6" },
    rationale: { type: "STRING", description: "2-3 sentences tied to the tells" },
  },
  required: ["bucket", "ai_likelihood", "confidence", "rationale"],
};

const SYSTEM_PROMPT = `You are a skeptical writing-style analyst and anti-slop editor. You estimate how likely a text is raw AI output, AI-assisted but human-edited, or human-written - based on stylistic tells, not on certainty you can never have. When the signal is weak, say so plainly.

Rules:
1. Be skeptical of generic clichés. The following words and phrases are documented LLM overuse tells (Liang et al. 2025, Kobak et al. 2025) and are strong evidence, not neutral vocabulary: delve/delving/delved, tapestry, treasure trove, a testament to, seamless, leverage, robust, paramount, pivotal, holistic, multifaceted, nuanced, intricate, empower, unleash, unlock the power, elevate, foster, profound, integral, crucial, in today's fast-paced world, in the realm of, it's important to note that, when it comes to, at the end of the day, in conclusion, shed light on, navigate the complexities, cutting-edge, game-changing, harness the power, a wide range of, in this comprehensive guide, delve into, let's dive in. If these appear, quote them as tells and raise ai_likelihood. Do NOT hand a low score to text packed with them.
2. Ordinary formal or technical register (IT, enterprise, academic writing) is NOT a tell by itself. Only flag actual generic padding and clichés.
3. Look beyond surface words for: uniform sentence rhythm, repeated sentence openers, hedge-stacking (the same claim qualified three ways), rule-of-three padding where one item would do, empty summary closers, explaining a term immediately after using it, generic advice that could apply to any topic, and a complete absence of first-hand specifics (no numbers, no named examples, no mistakes, no observable detail).
4. Human-edited AI output usually shows a mix: some tell-heavy paragraphs, then a voice shift, an odd specific detail, a broken rhythm. That is "ai_assisted_edited", not "likely_ai_raw".
5. ai_likelihood is an ORDINAL score for ranking, not a calibrated probability. Use the full range.

For each text assign:
- bucket: "clean_human" (reads like unassisted human writing), "ai_assisted_edited" (AI tells plus clear signs of human revision), "likely_ai_raw" (reads like largely unedited model output), or "insufficient_text" (too short/fragmentary to judge).
- ai_likelihood: integer 0-100.
- confidence: "low" | "medium" | "high". Use "low" liberally for short text, dense statistics, heavy jargon, or any section where style is hard to read either way.
- tells: up to 6 short strings QUOTING the actual phrase or pattern that drove your score (e.g. "delve into the nuances", "It is important to note that..."). Not generic category names.
- rationale: 2-3 plain-language sentences tied to the tells.

Respond ONLY with JSON matching the schema. No prose outside the JSON.`;

export async function judgeWithGemini(text, opts = {}) {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY not configured" };
  if (!text || text.trim().length < 40) {
    return { ok: false, error: "Text too short for the judge" };
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: `Judge the following text for AI-writing tells. The text starts after the marker.\n\n===TEXT_START===\n${text.slice(0, 48000)}\n===TEXT_END===` }],
      },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: 0.3,
      topP: 0.9,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
    },
  };

  const models = [DEFAULT_MODEL, ...FALLBACK_MODELS];
  const deadline = Date.now() + 40000;
  let lastError = null;

  for (const model of models) {
    try {
      const budget = Math.max(5000, deadline - Date.now());
      const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(budget),
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = `${model}: HTTP ${res.status} ${errText.slice(0, 200)}`;
        // model-level failures (404/403 on the model name) -> try next model
        if (res.status === 400 || res.status === 404) continue;
        // transient overload / rate-limit -> try the next model too
        if (res.status === 429 || res.status === 503) {
          lastError = `${model}: HTTP ${res.status} (overloaded), trying fallback`;
          continue;
        }
        return { ok: false, error: lastError };
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = `${model}: empty response`;
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        lastError = `${model}: non-JSON response`;
        continue;
      }

      const valid = validateJudgeOutput(parsed);
      if (!valid.ok) {
        lastError = `${model}: schema mismatch (${valid.error})`;
        continue;
      }

      return {
        ok: true,
        model,
        judge: {
          bucket: parsed.bucket,
          ai_likelihood: Math.max(0, Math.min(100, parsed.ai_likelihood)),
          confidence: parsed.confidence,
          tells: (parsed.tells || []).slice(0, 6),
          rationale: parsed.rationale || "",
        },
      };
    } catch (err) {
      lastError = `${model}: ${err.message}`;
    }
  }

  return { ok: false, error: lastError || "judge failed" };
}

export function validateJudgeOutput(o) {
  if (!o || typeof o !== "object") return { ok: false, error: "not an object" };
  const buckets = ["clean_human", "ai_assisted_edited", "likely_ai_raw", "insufficient_text"];
  if (!buckets.includes(o.bucket)) return { ok: false, error: "bad bucket" };
  if (!Number.isInteger(o.ai_likelihood) || o.ai_likelihood < 0 || o.ai_likelihood > 100)
    return { ok: false, error: "bad ai_likelihood" };
  if (!["low", "medium", "high"].includes(o.confidence)) return { ok: false, error: "bad confidence" };
  if (typeof o.rationale !== "string" || o.rationale.length === 0) return { ok: false, error: "missing rationale" };
  return { ok: true };
}
