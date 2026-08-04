# SlopDetector

AI slop fingerprint scanner for [PraveenTechWorld](https://www.praveentechworld.com),
deployed as a standalone Vercel project at
**https://slopdetector.praveentechworld.com**.

Paste text or scan a URL. Get a two-layer verdict:

1. **Deterministic fingerprint** (free, instant, explainable) — 12 signals:
   AI buzzwords, stock phrase clichés, chat-style openers, em/en dash density,
   "actually"-style fillers, sentence-rhythm burstiness (CV), vocabulary range
   (TTR), repeated 3-word chunks, same-length sentence runs, bold-word-colon
   bullets, and typography tells. Every match ships with its exact context and
   a plain-language fix.
2. **Semantic judge** (Gemini 3.6 Flash via Google AI Studio, schema-constrained
   JSON) — reads the whole text for semantic tells statistics can't see:
   uniform voice, no first-hand detail, hedge-stacking, empty summary closers.
   Falls back through gemini-3.5-flash → gemini-2.5-flash, then heuristic-only.

Scores are blended (heuristic ~70%, judge ~30%, judge down-weighted to 20% on
low confidence). **The score is ordinal, not a calibrated probability** — it
ranks how much text looks like unedited model output. It does not prove
authorship. See `public/RESEARCH.md` for the evidence base.

## Layout

```
slopdetector/
├── api/analyze.js        # Vercel serverless function (POST /api/analyze)
├── lib/analyzer.mjs      # deterministic heuristic engine (zero deps)
├── lib/wordlists.mjs     # tell vocabulary + hints (the knowledge core)
├── lib/judge.mjs         # Gemini semantic judge (schema + retry + fallback)
├── lib/html-extract.mjs  # URL mode: fetch + extract article body (cheerio)
├── public/index.html     # single-page UI
├── public/styles.css
├── public/app.js
├── public/RESEARCH.md    # sources + platform/SEO findings (linked from UI)
├── vercel.json
└── .env.example
```

## Local development

```bash
cd slopdetector
npm install
copy .env.example .env     # put your Gemini key in .env
npm test                   # runs heuristic + judge self-test (slop vs human samples)
```

Full API smoke test:

```bash
node scratch-url.mjs   # not committed - or just call handler() like it does
```

## Deploy to Vercel (slopdetector.praveentechworld.com)

```bash
cd slopdetector
npm i -g vercel            # if not installed
vercel link                # create/link a project (recommend "slopdetector")
vercel env add GEMINI_API_KEY        # production
vercel env add GEMINI_JUDGE_MODEL    # optional; default gemini-3.6-flash
vercel deploy --prod
vercel domains add slopdetector.praveentechworld.com
```

Then set the DNS in your domain registrar/Cloudflare: CNAME `slopdetector`
→ `cname.vercel-dns.com` (Vercel will guide you; `vercel domains` shows the
exact target). The API key never ships in the bundle — it lives only as a
Vercel env var and in local `.env` (gitignored).

## API

`POST /api/analyze`

```json
{ "text": "Paste up to 60k chars..." }
```
or
```json
{ "url": "https://example.com/article" }
```

Response (abridged):

```json
{
  "source": "paste" | "url",
  "meta": { "words": 691, "sentences": 38, "short": false, "judgedByGemini": true },
  "heuristic": { "score": 16, "grade": "Human-sounding", "signals": { ... } },
  "judge": { "bucket": "ai_assisted_edited", "ai_likelihood": 65, "confidence": "high",
             "tells": ["..."], "rationale": "...", "model": "gemini-3.6-flash" },
  "combined": { "score": 31, "grade": "Mostly human, minor tells", "judgeWeight": 0.3, "note": "..." },
  "matches": [ { "category": "phrase", "term": "it's important to note that", "hint": "...", "context": "..." } ],
  "humanize": [ { "action": "Cut AI buzzwords", "detail": "..." } ]
}
```

Errors: `400` bad input / too short · `404` page fetch failed · `429`
rate-limited (simple in-memory limiter, 15/min/IP) · `500` internal.

## Cost & abuse guardrails

- Text capped at 60,000 chars; judge gets max 48,000.
- 15 requests/min/IP in-memory (per warm instance — add a real limiter or
  Turnstile before opening this to the public internet at scale).
- Judge falls back gracefully; heuristic-only responses are still fully useful.

## Calibration note (read before trusting scores)

Per the detector-design spec: run a batch of your **pre-AI, unassisted writing**
through it and record what it scores. That establishes your false-positive
baseline against your own natural voice. Expect formal/technical writing to
trip rhythm and vocabulary signals. A high score means "looks like raw AI" —
it is a trigger for editing and fact-checking, not a verdict.
