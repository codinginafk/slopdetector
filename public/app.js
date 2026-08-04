(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const tabButtons = document.querySelectorAll(".tab");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tabpane").forEach((p) => p.classList.remove("active"));
      $("#pane-" + btn.dataset.tab).classList.add("active");
    });
  });

  const SAMPLES = {
    slop: `In today's fast-paced digital landscape, it's important to note that leveraging the power of AI is crucial. This comprehensive guide will delve into the intricate tapestry of modern technology, unlocking the full potential of seamless integration. At the end of the day, empowering teams to navigate the complexities of the ever-evolving landscape is paramount. It's worth noting that a testament to the groundbreaking nature of this revolution is the myriad of transformative insights it offers. Unleash your potential and elevate your workflow to the next level. In essence, the synergy between innovation and strategic adaptation fosters a holistic approach that underscores the profound importance of embracing change.`,
    human: `I fixed this same Windows Update hang twice last week, so let me tell you what actually worked. The first time, I spent an hour assuming it was a driver problem. It wasn't. The second machine had the exact same symptom and the fix took four minutes. Open the services console, stop Windows Update, delete the SoftwareDistribution folder, and start the service again. That's it. After that, the update queue restarts from scratch. One machine needed a reboot first, the other didn't. I have no idea why, and it didn't matter.`,
  };

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.example;
      $("#input-text").value = SAMPLES[key];
      tabButtons.forEach((b) => { if (b.dataset.tab === "paste") b.classList.add("active"); else b.classList.remove("active"); });
      document.querySelectorAll(".tabpane").forEach((p) => p.classList.remove("active"));
      $("#pane-paste").classList.add("active");
    });
  });

  const status = $("#status");
  function setStatus(msg, kind) {
    status.textContent = msg;
    status.className = "status " + (kind || "");
    status.hidden = !msg;
  }

  async function scan(payload, btn) {
    btn.disabled = true;
    setStatus("Scanning...", "ok");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Request failed (" + res.status + ")", "error");
        return;
      }
      setStatus("");
      render(data);
    } catch (err) {
      setStatus("Network error: " + err.message, "error");
    } finally {
      btn.disabled = false;
    }
  }

  $("#btn-scan").addEventListener("click", () => {
    const text = $("#input-text").value.trim();
    if (text.length < 20) { setStatus("Paste at least a couple of sentences first.", "error"); return; }
    scan({ text }, $("#btn-scan"));
  });
  $("#btn-scan-url").addEventListener("click", () => {
    const url = $("#input-url").value.trim();
    if (!/^https?:\/\//i.test(url)) { setStatus("Enter a full URL starting with http(s)://", "error"); return; }
    scan({ url }, $("#btn-scan-url"));
  });

  function gradeColor(score) {
    if (score <= 19) return { c: "#3ddc84", label: "score" };
    if (score <= 39) return { c: "#7fd66b", label: "score" };
    if (score <= 59) return { c: "#f5b942", label: "score" };
    if (score <= 79) return { c: "#ff8a3d", label: "score" };
    return { c: "#ff5d5d", label: "score" };
  }

  const SIGNAL_LABELS = {
    buzzwords: ["AI buzzwords", 20],
    repeatedWords: ["Overused words (repeats)", 8],
    phrases: ["Stock phrase clichés", 15],
    openers: ["Chat-style openers", 5],
    fillers: ['"Actually"-style fillers', 5],
    emDashes: ["Em / en dashes", 10],
    burstiness: ["Sentence rhythm (burstiness)", 20],
    lexicalDiversity: ["Vocabulary range (TTR)", 10],
    repetition: ["Repeated 3-word chunks", 5],
    rhythm: ["Same-length sentence runs", 5],
    boldBullets: ["Bold-word-colon bullets", 5],
    typography: ["Typography tells", 5],
  };

  const SIGNAL_DETAIL = {
    burstiness: (s) => `CV ${s.cv} (mean ${s.mean}, SD ${s.sd})`,
    lexicalDiversity: (s) => `TTR ${s.ttr}`,
    repetition: (s) => `${s.surplus} repeated instances`,
    rhythm: (s) => `longest run: ${s.longestRun}`,
    boldBullets: (s) => `${s.count} bullets`,
    emDashes: (s) => `${s.weightedCount} weighted dashes`,
    typography: (s) => (s.found || []).map((f) => f.name).join(", "),
  };

  function render(data) {
    $("#results").hidden = false;

    const c = data.combined;
    const g = gradeColor(c.score);
    $("#dial").style.background = `conic-gradient(${g.c} ${c.score * 3.6}deg, #2b3644 0deg)`;
    $("#dial-score").textContent = c.score;
    $("#grade").textContent = c.grade;
    $("#verdict-note").textContent = c.note;

    $("#s-heuristic").textContent = data.heuristic.score;
    $("#s-judge").textContent = data.judge ? data.judge.ai_likelihood : "n/a";
    $("#s-combined").textContent = c.score;
    $("#judge-note").textContent = data.judge
      ? `Weighted ${(c.judgeWeight * 100).toFixed(0)}% on the Gemini judge (confidence: ${data.judge.confidence}).`
      : (data.judgeError || "Semantic judge not available for this text.");

    // signals
    const signalsEl = $("#signals");
    signalsEl.innerHTML = "";
    for (const [key, [label, max]] of Object.entries(SIGNAL_LABELS)) {
      const s = data.heuristic.signals[key];
      if (!s) continue;
      const pct = Math.min(100, (s.points / max) * 100);
      const detail = SIGNAL_DETAIL[key] ? SIGNAL_DETAIL[key](s) : "";
      const el = document.createElement("div");
      el.className = "signal";
      el.innerHTML =
        `<div class="sig-top"><b>${label}</b><span class="val">${s.points.toFixed(1)} / ${max}${detail ? " · " + detail : ""}</span></div>` +
        `<div class="bar"><i style="width:${pct}%"></i></div>`;
      signalsEl.appendChild(el);
    }

    // matches
    const matchesEl = $("#matches");
    matchesEl.innerHTML = "";
    if (!data.matches || data.matches.length === 0) {
      matchesEl.innerHTML = '<p class="empty">No known tells matched. Good sign — though the semantic judge may still find things a word list cannot.</p>';
    } else {
      data.matches.forEach((m) => {
        const el = document.createElement("div");
        el.className = "match";
        const hint = m.hint ? `<span class="hint">${escapeHtml(m.hint)}</span>` : "";
        el.innerHTML =
          `<div><span class="term">${escapeHtml(m.term)}</span><span class="cat">${escapeHtml(m.category)}</span></div>` +
          `<div class="ctx">${escapeHtml(m.context || "")}</div>${hint}`;
        matchesEl.appendChild(el);
      });
      if (data.meta.words > 100 && data.matches.length >= 60) {
        matchesEl.insertAdjacentHTML("beforeend", '<p class="empty">… and more. First 60 shown.</p>');
      }
    }

    // judge
    const judgeCard = $("#judge-card");
    const judgeBody = $("#judge-body");
    if (data.judge) {
      judgeCard.hidden = false;
      const bucketLabel = {
        clean_human: "reads human-written",
        ai_assisted_edited: "AI-assisted, human-edited",
        likely_ai_raw: "likely raw AI output",
        insufficient_text: "too short to judge",
      }[data.judge.bucket] || data.judge.bucket;
      const tells = (data.judge.tells || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("");
      judgeBody.innerHTML =
        `<div class="judge-block"><div class="j-top">` +
        `<span>Bucket: <b>${bucketLabel}</b></span>` +
        `<span>AI-likelihood: <b>${data.judge.ai_likelihood}</b></span>` +
        `<span>Confidence: <b>${data.judge.confidence}</b></span>` +
        `<span>Model: <b>${escapeHtml(data.judge.model || "")}</b></span></div>` +
        (tells ? `<ul>${tells}</ul>` : "") +
        `<p class="muted small">${escapeHtml(data.judge.rationale || "")}</p></div>`;
    } else {
      judgeCard.hidden = true;
    }

    // humanize
    const humanizeEl = $("#humanize");
    humanizeEl.innerHTML = "";
    (data.humanize || []).forEach((h) => {
      const el = document.createElement("div");
      el.className = "h-item";
      el.innerHTML = `<span class="a">${escapeHtml(h.action)}</span><span class="d">${escapeHtml(h.detail)}</span>`;
      humanizeEl.appendChild(el);
    });

    // meta
    const meta = data.meta;
    const topStatus = document.createElement("span");
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
