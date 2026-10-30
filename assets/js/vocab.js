/* ============================================================
   LINGUA · 我来教你（TEACH ME）
   单词扩展（DeepSeek 结构化拆解 → 前端渲染）
   独立的单词扩展页面，与句子分析各自成页
   ============================================================ */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------- DeepSeek 配置 -------------------------------
     静态站点直连 DeepSeek 开放接口；密钥置于前端仅用于演示，
     正式上线请改为服务端代理，避免密钥暴露。
  ------------------------------------------------------------- */
  const DEEPSEEK = {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
    apiKey: "sk-0a4accfdb77846099f8fc504493bf6e7",
    timeout: 55000
  };

  const SYSTEM_PROMPT = `你是资深英语词汇教学专家，面向托业 800 分以下的中国学习者。
任务：对用户给出的英文单词（或短语）做词源拆解与扩展，只输出严格 JSON（不要 markdown、不要解释文字）。

规则：
1. word：规范写法，保留连字符；不要改成短语，除非用户输入的就是短语。
2. phonetic：音标，用 /.../ 包裹；不确定时填空字符串。
3. pos：最常用词性缩写，如 n. / v. / adj. / adv.，多个用 / 分隔。
4. coreMeaning：一句话中文核心释义，不超过 20 字。
5. senses：2-4 条释义，每条 {pos, meaning}，中文，贴近常用义。
6. parts：按构词顺序拆成前缀、词根、后缀等，每项 {part, kind, meaning, note}。kind 只能取 前缀 / 词根 / 后缀 / 词干；note 说明这部分如何影响词义，不超过 24 字。若这个词不适合拆解（如单纯词），返回空数组 []。
7. family：同词族派生词 2-4 个，每项 {word, pos, meaning}，同一词根的其他词性 / 词形。
8. synonyms：同义或近义替换 2-4 个，每项 {word, meaning, nuance}，nuance 说明语体或用法差别，不超过 24 字。
9. collocations：高频搭配 3-5 个，每项 {phrase, zh}。
10. examples：2-3 个例句，每项 {en, zh}，贴近托业、职场或日常场景，句子难度对标托业 800 以下。
11. memoryTip：一条中文记忆钩子，把词根词缀与词义串起来，不超过 40 字。
12. examTips：2-3 条考试或用法要点，中文，每条不超过 30 字。

输出 JSON 结构：
{"word":"sustainable","phonetic":"/səˈsteɪnəbl/","pos":"adj.","coreMeaning":"可持续的","senses":[{"pos":"adj.","meaning":"能长期维持的"}],"parts":[{"part":"sus-","kind":"前缀","meaning":"在下","note":"表示从下面支撑"}],"family":[{"word":"sustain","pos":"v.","meaning":"维持"}],"synonyms":[{"word":"viable","meaning":"可行的","nuance":"更强调能长期运转"}],"collocations":[{"phrase":"sustainable growth","zh":"可持续增长"}],"examples":[{"en":"We need a sustainable plan.","zh":"我们需要一个可持续的方案。"}],"memoryTip":"sus（在下）+ tain（握住）→ 从下面托住 → 可持续的。","examTips":["常修饰 growth / development 等名词"]}`;

  /* ---------------- 词缀类型配色 ---------------- */
  const PART_COLORS = {
    "前缀": "#4f46e5",
    "词根": "#0891b2",
    "后缀": "#16a34a",
    "词干": "#64748b"
  };

  const PART_ALIASES = {
    "prefix": "前缀", "前缀": "前缀",
    "root": "词根", "词根": "词根", "stem": "词干", "词干": "词干",
    "suffix": "后缀", "后缀": "后缀", "base": "词干", "词基": "词干"
  };

  /* ---------------- 示例词 ---------------- */
  const SAMPLES = [
    "sustainable", "significant", "commit", "benefit", "predict", "construct",
    "distract", "transport", "inspect", "negotiate", "efficient", "priority"
  ];

  /* ---------------- 状态 ---------------- */
  const CACHE_KEY = "lingua.teach.vocab.cache.v1";
  const CACHE_LIMIT = 30;

  let busy = false;
  let lastWord = "";

  const output = $("#vocabOutput");

  /* ---------------- 工具函数 ---------------- */
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  const normalizeKey = (text) => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function writeCache(word, data) {
    try {
      const cache = readCache();
      cache[normalizeKey(word)] = data;
      const keys = Object.keys(cache);
      while (keys.length > CACHE_LIMIT) {
        const oldest = keys.shift();
        delete cache[oldest];
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function partKind(kind) {
    const raw = String(kind || "").trim();
    const key = raw.toLowerCase().replace(/[\s_\-()]/g, "");
    return PART_ALIASES[key] || PART_ALIASES[raw] || "词根";
  }

  function normalizeResult(raw) {
    const word = String(raw.word || lastWord || "").trim();
    if (!word) throw new Error("扩展结果为空");

    const parts = (Array.isArray(raw.parts) ? raw.parts : []).map((part) => ({
      part: String(part.part || "").trim(),
      kind: partKind(part.kind),
      meaning: String(part.meaning || "").trim(),
      note: String(part.note || "").trim()
    })).filter((part) => part.part);

    return {
      word,
      phonetic: String(raw.phonetic || "").trim(),
      pos: String(raw.pos || "").trim(),
      coreMeaning: String(raw.coreMeaning || "").trim(),
      senses: (Array.isArray(raw.senses) ? raw.senses : []).map((item) => ({
        pos: String(item.pos || "").trim(),
        meaning: String(item.meaning || "").trim()
      })).filter((item) => item.meaning),
      parts,
      family: (Array.isArray(raw.family) ? raw.family : []).map((item) => ({
        word: String(item.word || "").trim(),
        pos: String(item.pos || "").trim(),
        meaning: String(item.meaning || "").trim()
      })).filter((item) => item.word),
      synonyms: (Array.isArray(raw.synonyms) ? raw.synonyms : []).map((item) => ({
        word: String(item.word || "").trim(),
        meaning: String(item.meaning || "").trim(),
        nuance: String(item.nuance || "").trim()
      })).filter((item) => item.word),
      collocations: (Array.isArray(raw.collocations) ? raw.collocations : []).map((item) => ({
        phrase: String(item.phrase || "").trim(),
        zh: String(item.zh || "").trim()
      })).filter((item) => item.phrase),
      examples: (Array.isArray(raw.examples) ? raw.examples : []).map((item) => ({
        en: String(item.en || "").trim(),
        zh: String(item.zh || "").trim()
      })).filter((item) => item.en),
      memoryTip: String(raw.memoryTip || "").trim(),
      examTips: (Array.isArray(raw.examTips) ? raw.examTips : []).map((tip) => String(tip).trim()).filter(Boolean)
    };
  }

  function parseResponse(content) {
    let text = String(content || "").trim();
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("AI 返回的 JSON 无法解析");
    }
  }

  /* ---------------- 请求 DeepSeek ---------------- */
  async function requestExpansion(word) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), DEEPSEEK.timeout) : null;

    try {
      const response = await fetch(DEEPSEEK.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + DEEPSEEK.apiKey
        },
        body: JSON.stringify({
          model: DEEPSEEK.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: word }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 1600,
          stream: false
        }),
        signal: controller ? controller.signal : undefined
      });

      if (!response.ok) throw new Error("HTTP " + response.status);

      const payload = await response.json();
      const choice = payload && payload.choices && payload.choices[0];
      const content = choice && choice.message && choice.message.content;
      if (!content) throw new Error("AI 未返回内容");

      return normalizeResult(parseResponse(content));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function describeError(err) {
    const message = String((err && err.message) || err || "");
    if (/abort|timeout/i.test(message)) return "请求超时了，请稍后重试。";
    if (message.includes("401")) return "API 密钥无效或已失效（401），请检查密钥配置。";
    if (message.includes("402")) return "DeepSeek 账户余额不足（402）。";
    if (message.includes("429")) return "请求过于频繁（429），稍等片刻再试。";
    if (/failed to fetch|networkerror|load failed/i.test(message)) return "无法连接 DeepSeek 服务，请检查网络后重试。";
    if (/JSON|扩展结果为空/i.test(message)) return "AI 返回的结构不符合预期，换个词或重试一次。";
    return "扩展失败：" + message;
  }

  /* ---------------- 渲染：状态 ---------------- */
  function renderEmpty() {
    output.innerHTML = `
      <div class="state-empty">
        <div class="empty-art">W</div>
        <h2 class="empty-title">输入一个单词，看它怎么长出来</h2>
        <p>默认由 DeepSeek 实时扩展；输入后点「扩展这个词」，或直接点左侧示例。</p>
        <p class="empty-note">扩展完成后，会给出词根词缀拆解、词族派生、同义替换、高频搭配与例句。</p>
      </div>`;
  }

  function renderLoading(word) {
    output.innerHTML = `
      <div class="state-loading">
        <div class="loading-head"><span class="spinner"></span>正在拆解词根词缀…</div>
        <p style="margin:12px 0 0;font-size:13px;color:var(--muted);font-family:var(--serif);line-height:1.7">${esc(word)}</p>
        <div class="shimmer tall"></div>
        <div class="shimmer s1"></div>
        <div class="shimmer s2"></div>
        <div class="shimmer s3"></div>
        <div class="shimmer s4"></div>
      </div>`;
  }

  function renderError(message, options) {
    const opts = options || {};
    const showRetry = opts.retry !== false && lastWord;
    output.innerHTML = `
      <div class="state-error">
        <span class="err-badge">扩展失败</span>
        <h3>这次没能扩展出来</h3>
        <p>${esc(message)}</p>
        ${showRetry ? '<button class="btn btn-primary" type="button" id="retryBtn">重新扩展</button>' : ""}
      </div>`;
  }

  /* ---------------- 渲染：扩展结果 ---------------- */
  function partsBlock(parts) {
    if (!parts.length) {
      return `<p class="parts-empty">这个词是单纯词，不适合硬拆；可以直接按音节记忆，再看下面的词族与搭配。</p>`;
    }
    const flow = parts.map((part, index) => {
      const color = PART_COLORS[part.kind] || PART_COLORS["词根"];
      const sep = index ? '<span class="parts-plus" aria-hidden="true">+</span>' : "";
      return `${sep}<span class="part-chip" style="--pc:${color}">
        <b>${esc(part.part)}</b>
        <em>${esc(part.kind)}</em>
        <span>${esc(part.meaning)}</span>
      </span>`;
    }).join("");

    const notes = parts.filter((part) => part.note).map((part) => `
      <li><b style="color:${PART_COLORS[part.kind] || PART_COLORS["词根"]}">${esc(part.part)}</b>${esc(part.note)}</li>`).join("");

    return `<div class="parts-flow">${flow}</div>${notes ? `<ul class="parts-notes">${notes}</ul>` : ""}`;
  }

  function sensesBlock(senses) {
    if (!senses.length) return "";
    return `<div class="sense-block">
      <span class="card-label">释义</span>
      <ul class="sense-list">
        ${senses.map((item) => `<li>${item.pos ? `<em>${esc(item.pos)}</em>` : ""}<span>${esc(item.meaning)}</span></li>`).join("")}
      </ul>
    </div>`;
  }

  function familyBlock(family) {
    if (!family.length) return "";
    return `<div class="result-panel">
      <h3>词族派生</h3>
      <div class="family-list">
        ${family.map((item) => `<div class="family-item">
          <b>${esc(item.word)}</b>
          ${item.pos ? `<em>${esc(item.pos)}</em>` : ""}
          <span>${esc(item.meaning)}</span>
        </div>`).join("")}
      </div>
    </div>`;
  }

  function synonymBlock(synonyms) {
    if (!synonyms.length) return "";
    return `<div class="result-panel">
      <h3>同义替换</h3>
      <div class="syn-list">
        ${synonyms.map((item) => `<div class="syn-item">
          <div class="syn-head"><b>${esc(item.word)}</b><span>${esc(item.meaning)}</span></div>
          ${item.nuance ? `<em>${esc(item.nuance)}</em>` : ""}
        </div>`).join("")}
      </div>
    </div>`;
  }

  function collocationBlock(collocations) {
    if (!collocations.length) return "";
    return `<div class="result-panel colloc-panel">
      <h3>高频搭配</h3>
      <div class="colloc-list">
        ${collocations.map((item) => `<span class="colloc-chip"><b>${esc(item.phrase)}</b>${item.zh ? `<em>${esc(item.zh)}</em>` : ""}</span>`).join("")}
      </div>
    </div>`;
  }

  function exampleBlock(examples) {
    if (!examples.length) return "";
    return `<div class="result-panel example-panel">
      <h3>例句</h3>
      <ol class="example-list">
        ${examples.map((item) => `<li>
          <p class="ex-en">${esc(item.en)}</p>
          ${item.zh ? `<p class="ex-zh">${esc(item.zh)}</p>` : ""}
        </li>`).join("")}
      </ol>
    </div>`;
  }

  function renderResult(data) {
    const gridItems = familyBlock(data.family) + synonymBlock(data.synonyms);
    const wordBadge = data.phonetic ? `<code>${esc(data.phonetic)}</code>` : "";

    output.innerHTML = `
      <div class="result vocab-result">
        <div class="result-bar">
          <span class="pattern-badge word-badge">
            <span class="pb-kind">单词扩展</span>
            <b>${esc(data.word)}</b>
            ${wordBadge}
          </span>
          ${data.pos ? `<span class="pattern-full">${esc(data.pos)}</span>` : ""}
          <div class="result-tools">
            <button class="tool-btn" type="button" id="speakBtn">朗读发音</button>
            <button class="tool-btn" type="button" id="regenBtn">重新扩展</button>
          </div>
        </div>

        <div class="gram-card word-card">
          <div class="word-headline">
            <span class="card-label">单词 · Word</span>
            <h2 class="word-title">${esc(data.word)}</h2>
            <div class="word-pron">
              ${data.phonetic ? `<span class="word-phonetic">${esc(data.phonetic)}</span>` : ""}
              ${data.pos ? `<span class="word-pos">${esc(data.pos)}</span>` : ""}
            </div>
          </div>
          ${data.coreMeaning ? `<p class="word-core">${esc(data.coreMeaning)}</p>` : ""}
          ${sensesBlock(data.senses)}
        </div>

        <div class="parts-card">
          <div class="parts-head">
            <span class="card-label">词根词缀</span>
            ${data.parts.length ? `<span class="parts-count">${data.parts.length} 段拆解</span>` : ""}
          </div>
          ${partsBlock(data.parts)}
        </div>

        ${gridItems ? `<div class="result-grid vocab-grid">${gridItems}</div>` : ""}
        ${collocationBlock(data.collocations)}
        ${exampleBlock(data.examples)}
        ${data.memoryTip ? `<div class="skeleton-card memory-card">
          <span class="skeleton-label">记忆钩子</span>
          <p class="skeleton-text memory-text">${esc(data.memoryTip)}</p>
        </div>` : ""}
        ${data.examTips.length ? `<div class="pattern-analysis">
          <h3>考试与用法</h3>
          <ol class="keypoints">${data.examTips.map((tip) => `<li>${esc(tip)}</li>`).join("")}</ol>
        </div>` : ""}
      </div>`;

    speakBind(data.word);
  }

  /* ---------------- 朗读 ---------------- */
  function speak(word) {
    if (!("speechSynthesis" in window) || !word) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = "en-US";
      utterance.rate = 0.92;
      window.speechSynthesis.speak(utterance);
    } catch (e) { /* 浏览器不支持时忽略 */ }
  }

  function speakBind(word) {
    const btn = $("#speakBtn");
    if (!btn) return;
    if (!("speechSynthesis" in window)) {
      btn.disabled = true;
      btn.title = "当前浏览器不支持语音朗读";
      return;
    }
    btn.addEventListener("click", () => speak(word));
  }

  /* ---------------- 主流程 ---------------- */
  function setBusy(value) {
    busy = value;
    ["#expandBtn", "#randomWordBtn"].forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = value;
    });
  }

  async function runExpansion(rawWord, options) {
    if (busy) return;
    const opts = options || {};
    const word = String(rawWord || "").replace(/\s+/g, " ").trim();

    if (!word) {
      renderError("请先输入一个英文单词，再开始扩展。", { retry: false });
      return;
    }
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word)) {
      renderError("只能输入英文单词或短语，请检查输入内容。", { retry: false });
      return;
    }
    if (word.length > 60) {
      renderError("太长了，请控制在 60 个字符以内。", { retry: false });
      return;
    }

    lastWord = word;
    const input = $("#wordInput");
    if (input && input.value.trim() !== word) input.value = word;

    const cacheKey = normalizeKey(word);
    if (!opts.force) {
      const cached = readCache()[cacheKey];
      if (cached) {
        try {
          renderResult(normalizeResult(cached));
          return;
        } catch (e) { /* 缓存损坏则重新请求 */ }
      }
    }

    setBusy(true);
    renderLoading(word);

    try {
      const result = await requestExpansion(word);
      writeCache(word, result);
      renderResult(result);
    } catch (err) {
      renderError(describeError(err));
    } finally {
      setBusy(false);
      if (window.innerWidth < 980) $("#expand").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function updateCount() {
    const input = $("#wordInput");
    const counter = $("#wordCount");
    if (input && counter) counter.textContent = `${input.value.length} / 60`;
  }

  function pickSample() {
    const current = ($("#wordInput") ? $("#wordInput").value.trim().toLowerCase() : "");
    const pool = SAMPLES.filter((word) => word !== current);
    const list = pool.length ? pool : SAMPLES;
    return list[Math.floor(Math.random() * list.length)];
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    const input = $("#wordInput");
    if (input) {
      input.addEventListener("input", updateCount);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          runExpansion(input.value);
        }
      });
    }

    const expandBtn = $("#expandBtn");
    if (expandBtn && input) expandBtn.addEventListener("click", () => runExpansion(input.value));

    const randomBtn = $("#randomWordBtn");
    if (randomBtn) {
      randomBtn.addEventListener("click", () => {
        const word = pickSample();
        if (input) input.value = word;
        updateCount();
        runExpansion(word);
      });
    }

    $$(".sentence-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const word = chip.dataset.word || "";
        if (input) input.value = word;
        updateCount();
        runExpansion(word);
      });
    });

    if (output) {
      output.addEventListener("click", (event) => {
        const target = event.target.closest("button");
        if (!target) return;
        if (target.id === "retryBtn" || target.id === "regenBtn") {
          if (lastWord) runExpansion(lastWord, { force: true });
        }
      });
    }
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    if (!output) return;
    bindEvents();
    updateCount();
    renderEmpty();

    const params = new URLSearchParams(location.search);
    const preset = params.get("w") || params.get("word");
    if (preset) {
      const word = preset.trim();
      const input = $("#wordInput");
      if (input) input.value = word;
      updateCount();
      runExpansion(word);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.LinguaVocab = {
    samples: SAMPLES,
    expand: runExpansion,
    render: (raw) => renderResult(normalizeResult(raw))
  };
})();
