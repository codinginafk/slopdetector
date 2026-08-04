# SlopDetector — Research Backing & Sources

Collected 2026-08-04. This is the evidence base behind the detector's signals
and the SEO framing on this page. Everything here is either a peer-reviewed
measurement, a documented platform change, or an open-source detector whose
pattern packs we reused.

---

## 1. The statistical fingerprint (how detectors work)

AI text detection converges on a few measurable properties of text:

| Signal | What it measures | Human | Raw AI |
|---|---|---|---|
| **Perplexity** | How predictable each word is to a language model | High (surprising choices) | Low (safe, generic choices) |
| **Burstiness** | Variance of sentence length/complexity (CV = SD/mean) | High (CV > 0.4) | Low (CV < 0.2), flat rhythm |
| **Excess vocabulary** | Words LLMs overuse relative to humans ("delve", "tapestry", "realm") | Rare | Documented surge since 2023 |
| **Typography** | Em dashes, curly quotes, ellipsis, nbsp | ~12% of long-form samples contain em dashes | ~73% of GPT-4 long-form samples contain em dashes |

Key sources:

- **Kobak, González-Márquez & Erdős, "Delving into LLM-assisted writing in biomedical publications through excess vocabulary", Science Advances 2025** — analysed ~15M biomedical abstracts. "Delve" rose ~1,500% between 2022 and 2024. "Intricate", "comprehensive", "potential", "furthermore" also surged. https://pmc.ncbi.nlm.nih.gov/articles/PMC12219543/
- **Liang et al., "Mapping the increasing use of LLMs in scientific papers", Nature Human Behaviour 2025** — over a million papers; "realm", "intricate", "showcasing", "pivotal" were flat for a decade then jumped from 2023. https://www.nature.com/articles/s41562-025-02273-8
- **Guo et al., "How Close is ChatGPT to Human Experts?" (2023)** — em dash present in ~73% of GPT-4 long-form output vs ~12% of human writing; also decorative Unicode in LLM output.
- **Perplexity/burstiness theory** — Burrows 2002; GPTZero's public methodology; formalised as the GPT-2 perplexity + sentence-length CV approach used by most open-source detectors (below).

## 2. Open-source detectors on GitHub (surveyed)

Prose / text detectors (the family this tool belongs to):

| Repo | Approach | What we took from it |
|---|---|---|
| **antydizajn/ai-slop-detect** (MIT, CLI) | 70+ phrase patterns EN/PL, character tells (em-dash, curly quotes, decorative emoji), weak openers ("Certainly,", "Great question,") | Opener list, em-dash handling, phrase-vs-word categorisation. https://github.com/antydizajn/ai-slop-detect |
| **hwajongpark/slop-gate** (zero-dep npx CLI) | em-dash + ~40 vocabulary tells, CI-friendly exit codes | Vocabulary pack design; "flags tells, not authorship" framing. https://github.com/hwajongpark/slop-gate |
| **fbuchinger/smellcheck** (TS) | Typography/unicode/buzzword/unnatural-vocab plugins, position-matched output | Typography plugin idea (curly quotes, ellipsis, nbsp); match-with-reason output shape. https://github.com/fbuchinger/smellcheck |
| **umairinayat/AI-Detection** | GPTZero-style: GPT-2 perplexity + burstiness + DeBERTa ensemble | Burstiness scoring approach (CV of sentence lengths). https://github.com/umairinayat/AI-Detection |
| **julienmiquel/Aletheia** | Perplexity, burstiness, GLTR, TF-IDF + "LLM Judge" semantic layer | The two-layer design (stats first, LLM judge for semantics); human CV > 0.4 vs AI CV < 0.2 thresholds; finding that LLM judges beat statistics on modern models (~85%+ on semantic layer). https://github.com/julienmiquel/Aletheia |
| **meetp2022/ai-text-detector** | 4-signal consensus (perplexity, burstiness, n-gram repetition, stylometric variance), per-sentence scoring | N-gram repetition signal. https://github.com/meetp2022/ai-text-detector |
| **zainmustafam977/ai-text-detector-ensemble** | RoBERTa + GPT-2 perplexity + burstiness, chunking >380 words | Chunking caveat: short texts are unreliable. https://github.com/zainmustafam977/ai-text-detector-ensemble |
| **Ank-Cha/CheckGPT** | Perplexity + burstiness app | Reference UI. https://github.com/Ank-Cha/CheckGPT |
| **Sanjulaperera/ai-detector** | Binoculars + DeBERTa + stylometric ensemble | Stylometric features (TTR, entropy). https://github.com/Sanjulaperera/ai-detector |
| **finnff/nlp-ai-detector** | Feature-based research pipeline (lexical diversity, perplexity, burstiness) | Feature list for TTR/burstiness. https://github.com/finnff/nlp-ai-detector |
| **cem256/GPT-Detector** | Perplexity + burstiness (app) | Burstiness limits (non-native writers false-positive). https://github.com/cem256/GPT-Detector |

Code-slop detectors (adjacent problem — AI-generated code quality):

- **flamehaven01/AI-SLOP-Detector** — 27 checks for "fake-done" code (empty stubs, phantom imports, buzzword-padded docs). https://github.com/flamehaven01/AI-SLOP-Detector
- **scanaislop/aislop** — code slop scanner (narrative comments, swallowed exceptions, dead code). https://github.com/scanaislop/aislop
- **Euraika-Labs/ai-slopcheck** — 72 deterministic rules, SARIF output. https://github.com/Euraika-Labs/ai-slopcheck

Community / PR-review detectors:

- **distil-labs/distil-ai-slop-detector** — 270M model fine-tuned on ~10k examples, runs in-browser via Wllama (242 MB quantized). Privacy-first approach. https://github.com/distil-labs/distil-ai-slop-detector
- **krrish175-byte/ai-slop-guardian** — GitHub App: perplexity 35% + embedding 30% + pattern 25% + burstiness 10% ensemble for PRs. https://github.com/krrish175-byte/ai-slop-guardian
- **Sloppers/Slopper** — scores PRs/issues on reputation + effort + content signals, optional Gemini provider. https://github.com/Sloppers/Slopper

## 3. What platforms are actually doing (the "grudge against AI slop")

- **LinkedIn** — added a report reason for AI-generated/AI-slop content ("Seems like AI slop" button in reports), 2025-2026.
- **YouTube** — automatic AI-detection misfires: it flagged Kurzgesagt's human-made video as AI slop ("YouTube's AI detection kicked us in the face"); that upload was the channel's worst performer since 2013. YouTube enforces a 6-tier synthetic-media policy with mandatory disclosure (from May 2025).
- **Google** — SpamBrain + Helpful Content system demote scaled, low-value content. The June 2026 spam update specifically targeted scaled AI page farms (Semrush coverage). Google does NOT run GPTZero-style detectors; the December 2025 core update expanded E-E-A-T emphasis page-level, rewarding verifiable first-hand expertise.
- **Google Images / YouTube** — AI-generated images carry SynthID + C2PA metadata (Nov 2025); realistic synthetic media on YouTube must be disclosed.

## 4. The SEO truth (why this tool frames things this way)

- **Google's spam policy (updated May 2026):** "scaled content abuse" = many pages generated primarily to manipulate rankings and not help users. Generative AI is named as one method of scaling that abuse — not an automatic trigger. Single well-made AI-assisted articles are not violations. Source: Google Search Central spam policies.
- **Ahrefs, July 2025:** 600,000 pages / 100,000 keywords; correlation between AI-content percentage and ranking position ≈ 0.011 — statistically zero. Google ranks value, not authorship.
- **Semrush:** 9% of position-1 results in their study were pure AI; 80% human-written; the rest hybrid. Human-led AI-assisted (human owns research/outline/fact-check/voice/final edit) is the 2026 production standard (~64% of SEO teams).
- **The real risk of slop:** reader trust and engagement, platform sentiment, and **AI citation (GEO)**. Princeton's GEO study (Aggarwal et al., arXiv:2311.09735): statistics, expert quotes, and authoritative citations lift AI-engine citation odds ~30-41%. Prose texture isn't what answer engines cite — verifiable substance is.
- **Detector limits (why this tool says "style, not authorship"):** false-positive rates vary 1% to 45%+ across tools; formal, technical, academic, and non-native writing triggers rhythm/vocabulary signals. Detectors are a pre-publish editorial signal, not a verdict.

## 5. How the signal lists were built

1. PraveenTechWorld internal avoid-list (the explicit keyword list: embark/delve/invaluable/relentless/groundbreaking/endeavour/enlightening/insights/esteemed/shed light/deep understanding/crucial/elevate/resonate/enhance/expertise/offerings/valuable/leverage/intricate/tapestry/foster/systemic/inherent/treasure trove/testament/peril/landscape/pertinent/synergy/underscores/empower/unleash/unlock/pivotal/adhere/amplify/cognizant/conceptualize/emphasize/complexity/recognize/adapt/promote/critique/comprehensive/implications/complementary/perspectives/holistic/discern/multifaceted/nuanced/underpinnings/cultivate/integral/profound/facilitate/encompass/elucidate/unravel/paramount/characterized/significant — plus "actually" and M-dash guidance from the humanizing playbook).
2. Research-confirmed excess vocabulary (Kobak 2025, Liang 2025).
3. Pattern packs from the open-source tools in section 2.
4. Words are tiered: single-word buzzwords vs multi-word phrase clichés (weighted double) vs "repeat-only" words that are fine once but telling when overused.
