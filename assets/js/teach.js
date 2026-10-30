/* ============================================================
   LINGUA · 我来教你（TEACH ME）
   模块注册表 + 句子分析（DeepSeek 结构化解析 → 前端渲染）
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

  const SYSTEM_PROMPT = `你是资深英语语法教学专家，面向托业 800 分以下的中国学习者。
任务：拆解用户给出的英文句子，只输出严格 JSON（不要 markdown、不要解释文字）。

规则：
1. basicPattern：判断主句属于五大基本句型中的哪一种，只能取以下五个值之一：主谓、主谓宾、主谓双宾、主谓宾宾补、主系表。句子含从句时，仍按主句判断。
2. basicFormula：与 basicPattern 一一对应，只能取：S+V、S+V+O、S+V+O+O、S+V+O+C、S+V+P。
3. chunks：把句子切成连续的片段，按原顺序完整覆盖全句。每个 text 必须是原句中连续的字符片段（保留原有标点），不要改动拼写，不要添加原句没有的词。
4. 每个片段标注 role，取值只能是：subject(主语) / verb(谓语动词) / object(宾语) / complement(宾语补足语) / predicative(表语) / attributive(定语) / adverbial(状语) / conjunction(连词或从句引导词) / other(其他)。label 用对应中文。
5. clause：该片段若属于从句，填写对应从句类型（与 clauses.type 一致，如「定语从句」）；属于主句或不在从句中时填空字符串 ""。
6. pattern：主句句型代码，只能取 SV / SVO / SVOO / SVOC / SVP；若句子含从句，在主句代码后追加从句类型，如 SVO+宾语从句、SVO+定语从句。patternName 用中文，如「主谓宾」「主谓宾+定语从句」。
7. skeleton 用尽量少的词呈现句子主干（保留原句词形）。
8. clauses 列出主句与各从句，type 取 主句/宾语从句/定语从句/状语从句/表语从句/同位语从句/并列句。
9. keyPoints 给 2-3 条中文学习要点，点明易错处，每条不超过 40 字。
10. translation 给出自然、准确的中文翻译。
11. patternAnalysis 说明句型判定：why 说明为什么是这个基本句型（结合主句的主语、谓语、宾语/表语/宾补），judge 说明判断依据，contrast 说明为何不是最容易混淆的其他句型。三条均为中文，每条不超过 60 字。

输出 JSON 结构：
{"translation":"中文翻译","basicPattern":"主谓宾","basicFormula":"S+V+O","pattern":"SVO","patternName":"主谓宾","chunks":[{"text":"I","role":"subject","label":"主语","note":"一句话成分说明","clause":""}],"skeleton":"I ...","clauses":[{"type":"主句","text":"...","note":"..."}],"patternAnalysis":{"why":"...","judge":"...","contrast":"..."},"keyPoints":["..."]}`;

  /* ---------------- 语法角色 ------------- */
  const ROLES = {
    subject: { label: "主语", color: "#2563eb" },
    verb: { label: "谓语", color: "#e11d48" },
    object: { label: "宾语", color: "#ea580c" },
    complement: { label: "宾补", color: "#d946ef" },
    predicative: { label: "表语", color: "#0891b2" },
    attributive: { label: "定语", color: "#7c3aed" },
    adverbial: { label: "状语", color: "#16a34a" },
    conjunction: { label: "连词", color: "#64748b" },
    other: { label: "其他", color: "#94a3b8" }
  };

  // 兼容模型可能返回的英文枚举 / 中文名 / 带括号的写法
  const ROLE_ALIASES = {
    "subject": "subject", "主语": "subject", "主语从句": "subject", "subjectclause": "subject",
    "verb": "verb", "谓语": "verb", "谓语动词": "verb", "predicate": "verb", "动词": "verb",
    "object": "object", "宾语": "object", "宾语从句": "object", "objectclause": "object",
    "直接宾语": "object", "间接宾语": "object", "双宾语": "object",
    "complement": "complement", "宾补": "complement", "补语": "complement",
    "宾语补足语": "complement", "宾语补语": "complement",
    "objectcomplement": "complement", "oc": "complement",
    "predicative": "predicative", "表语": "predicative", "表语从句": "predicative",
    "主语补足语": "predicative", "subjectcomplement": "predicative",
    "attributive": "attributive", "定语": "attributive", "定语从句": "attributive",
    "attributiveclause": "attributive", "modifier": "attributive", "relative": "attributive",
    "前置定语": "attributive", "后置定语": "attributive",
    "adverbial": "adverbial", "状语": "adverbial", "状语从句": "adverbial",
    "adverbialclause": "adverbial",
    "conjunction": "conjunction", "连词": "conjunction", "引导词": "conjunction",
    "从句引导词": "conjunction", "connector": "conjunction",
    "other": "other", "其他": "other", "插入语": "other", "同位语": "other",
    "appositive": "other", "感叹词": "other", "interjection": "other",
    "标点": "other", "punctuation": "other"
  };

  const CORE_ROLES = new Set(["subject", "verb", "object", "complement", "predicative"]);

  // 五大基本句型（与 lesson-05 的表述一致）
  const BASIC_PATTERNS = {
    SV: { name: "主谓", formula: "S + V" },
    SVO: { name: "主谓宾", formula: "S + V + O" },
    SVOO: { name: "主谓双宾", formula: "S + V + O + O" },
    SVOC: { name: "主谓宾宾补", formula: "S + V + O + C" },
    SVP: { name: "主系表", formula: "S + V + P" }
  };

  /* ---------------- 例句库（优先影视原声，难度对标托业 800 以下） ------------- */
  const SAMPLES = [
    { text: "I'm not going to let you eat my sandwich.", source: "《老友记》" },
    { text: "Joey doesn't share food!", source: "《老友记》" },
    { text: "We were on a break!", source: "《老友记》" },
    { text: "Could you tell me where the nearest subway station is?", source: "托业 · 出行场景" },
    { text: "My boss asked me to finish the report by Friday.", source: "托业 · 办公场景" },
    { text: "The guy who lives upstairs keeps playing music that drives me crazy every night.", source: "《老友记》 · 长难句" },
    { text: "If you leave now, you will catch the last train.", source: "《老友记》 · 条件句" },
    { text: "She said she would call me back after the meeting.", source: "托业 · 会议场景" },
    { text: "Do you have any idea how much this costs?", source: "《老友记》" },
    { text: "That's the last thing I want to hear right now.", source: "《老友记》" },
    { text: "The coffee shop where we first met is closing down.", source: "《老友记》 · 定语从句" },
    { text: "I don't think this is a good idea.", source: "《老友记》 · 宾语从句" },
    { text: "You can't just expect me to drop everything.", source: "《老友记》" },
    { text: "Could you keep it down? I'm trying to study.", source: "《老友记》" },
    { text: "The meeting has been moved to three o'clock.", source: "托业 · 会议场景" },
    { text: "It's not that I don't like him; it's that he never listens.", source: "《老友记》 · 进阶" }
  ];

  /* ---------------- 模块注册表（扩展入口） -------------
     新增功能卡片：向 MODULES 追加一条记录即可。
     status: "live" 可点击；"soon" 为占位预告。
  ------------------------------------------------------- */
  const MODULES = [
    {
      id: "sentence",
      title: "句子分析",
      desc: "拆解句子成分，识别五大句型与从句结构，分色高亮主干骨架。",
      status: "live",
      href: "#analyze",
      accent: "#4f46e5",
      icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 5h14M3 10h9M3 15h11" stroke-linecap="round"/><circle cx="16" cy="10" r="1.6" fill="currentColor" stroke="none"/></svg>'
    },
    {
      id: "vocab",
      title: "单词扩展",
      desc: "音标拼读、释义、搭配、分层例句、词族、构词、语义、主题与习语，一次展开并归档词根。",
      status: "live",
      href: "#word",
      accent: "#0891b2",
      icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3"/><path d="M7 7h6M7 10h6M7 13h4" stroke-linecap="round"/></svg>'
    },
    {
      id: "speak",
      title: "发音跟读",
      desc: "逐词标注连读、弱读与语调，跟读一句得分一句。",
      status: "soon",
      accent: "#f43f5e",
      icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8v4M8 5v10M12 7v6M16 9v2" stroke-linecap="round"/></svg>'
    },
    {
      id: "writing",
      title: "写作批改",
      desc: "提交一段英文，逐句纠错并给出更地道的改写版本。",
      status: "soon",
      accent: "#16a34a",
      icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 15 1.6-4.4L14 2.2l3.8 3.8-8.4 8.4L5 15H4Z" stroke-linejoin="round"/><path d="m12.4 4 3.6 3.6" stroke-linecap="round"/></svg>'
    }
  ];

  /* ---------------- 状态 ---------------- */
  const CACHE_KEY = "lingua.teach.sentence.cache.v1";
  const CACHE_LIMIT = 30;
  const LOCAL_DATA_URL = "assets/data/sentences.json";

  let busy = false;
  let lastSentence = "";
  let localSentences = [];
  let localLoadPromise = null;
  let localLoadFailed = false;

  const output = $("#analyzerOutput");

  /* ---------------- 工具函数 ---------------- */
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  function normalizeSentence(text) {
    return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  /* ---------------- 本地例句库 ----------------
     未切换到 AI 时，直接读取 assets/data/sentences.json 中预置的解析结果。
  ------------------------------------------------------- */
  function loadLocalSentences() {
    if (localLoadPromise) return localLoadPromise;
    localLoadPromise = fetch(LOCAL_DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((list) => {
        localSentences = (Array.isArray(list) ? list : [])
          .filter((item) => item && item.text && Array.isArray(item.chunks));
        return localSentences;
      })
      .catch((err) => {
        localSentences = [];
        localLoadFailed = true;
        console.warn("本地例句库加载失败：", err);
        return [];
      });
    return localLoadPromise;
  }

  function findLocalSentence(sentence) {
    const key = normalizeSentence(sentence);
    return localSentences.find((item) => normalizeSentence(item.text) === key) || null;
  }

  function aiEnabled() {
    const toggle = $("#aiToggle");
    return !!(toggle && toggle.checked);
  }

  function normalizeRole(role) {
    const raw = String(role || "").trim();
    const key = raw.toLowerCase().replace(/[\s_\-()]/g, "");
    if (ROLE_ALIASES[key]) return ROLE_ALIASES[key];
    if (ROLES[raw]) return raw;
    return "other";
  }

  function roleMeta(role) {
    return ROLES[role] || ROLES.other;
  }

  function displayText(chunks) {
    let out = "";
    chunks.forEach((chunk, index) => {
      if (index === 0) { out = chunk.text; return; }
      const prev = chunks[index - 1].text;
      const noSpaceBefore = /^[,.;:!?%)\]）”"'’]/.test(chunk.text) || /^['’]/.test(chunk.text);
      const noSpaceAfter = /[(（“‘"]$/.test(prev) || /[\/-]$/.test(prev);
      out += noSpaceBefore || noSpaceAfter ? chunk.text : " " + chunk.text;
    });
    return out;
  }

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function writeCache(sentence, data) {
    try {
      const cache = readCache();
      cache[sentence.toLowerCase()] = data;
      const keys = Object.keys(cache);
      while (keys.length > CACHE_LIMIT) {
        const oldest = keys.shift();
        delete cache[oldest];
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function normalizeResult(raw) {
    const chunks = (Array.isArray(raw.chunks) ? raw.chunks : []).map((chunk) => ({
      text: String(chunk.text || "").trim(),
      role: normalizeRole(chunk.role),
      note: String(chunk.note || "").trim(),
      clause: String(chunk.clause || "").trim()
    })).filter((chunk) => chunk.text);

    if (!chunks.length) throw new Error("解析结果为空");

    const clauses = (Array.isArray(raw.clauses) ? raw.clauses : []).map((clause) => ({
      type: String(clause.type || "从句"),
      text: String(clause.text || ""),
      note: String(clause.note || "")
    }));

    // 五大基本句型：优先取模型字段，缺失时由 pattern 代码回推
    const code = String(raw.pattern || "").split("+")[0].trim().toUpperCase();
    const byCode = BASIC_PATTERNS[code];
    const declared = String(raw.basicPattern || "").trim();
    const declaredHit = Object.keys(BASIC_PATTERNS).find((key) => BASIC_PATTERNS[key].name === declared);
    const basicCode = declaredHit || (byCode ? code : "");
    const basicPattern = declaredHit
      ? declared
      : (byCode ? byCode.name : (declared || "—"));
    const basicFormula = String(raw.basicFormula || "").trim() || (byCode ? byCode.formula : "");
    const pa = raw.patternAnalysis && typeof raw.patternAnalysis === "object" ? raw.patternAnalysis : null;
    const patternAnalysis = pa && (pa.why || pa.judge || pa.contrast)
      ? {
          why: String(pa.why || "").trim(),
          judge: String(pa.judge || "").trim(),
          contrast: String(pa.contrast || "").trim()
        }
      : null;

    return {
      translation: String(raw.translation || "（暂无翻译）"),
      pattern: String(raw.pattern || ""),
      patternName: String(raw.patternName || ""),
      basicPattern,
      basicFormula,
      basicCode,
      chunks,
      skeleton: String(raw.skeleton || "").trim() || displayText(chunks.filter((c) => CORE_ROLES.has(c.role))),
      clauses,
      patternAnalysis,
      keyPoints: (Array.isArray(raw.keyPoints) ? raw.keyPoints : []).map((point) => String(point)).filter(Boolean)
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
  async function requestAnalysis(sentence) {
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
            { role: "user", content: sentence }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 1400,
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
    if (/JSON|解析结果为空/i.test(message)) return "AI 返回的结构不符合预期，换一句或重试一次。";
    return "解析失败：" + message;
  }

  /* ---------------- 渲染：模块选择条 ---------------- */
  function renderModules() {
    const bar = $("#moduleGrid");
    if (!bar) return;

    bar.innerHTML = `<span class="module-bar-label">我来教你</span>` + MODULES.map((mod, index) => {
      const live = mod.status === "live";
      const active = live && index === MODULES.findIndex((item) => item.status === "live");
      return live
        ? `<button class="module-pill is-live${active ? " is-active" : ""}" type="button" data-target="${mod.href}" title="${esc(mod.desc)}">${mod.icon}<span>${esc(mod.title)}</span></button>`
        : `<span class="module-pill is-soon" title="${esc(mod.desc)}">${mod.icon}<span>${esc(mod.title)}</span><em>即将上线</em></span>`;
    }).join("");

    $$(".module-pill.is-live", bar).forEach((pill) => {
      pill.addEventListener("click", () => {
        $$(".module-pill.is-live", bar).forEach((item) => item.classList.remove("is-active"));
        pill.classList.add("is-active");
        const target = document.querySelector(pill.dataset.target || "");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  /* ---------------- 渲染：状态 ---------------- */
  function renderEmpty() {
    output.innerHTML = `
      <div class="state-empty">
        <div class="empty-art">Aa</div>
        <h2 class="empty-title">输入一句英文，看看它的骨架</h2>
        <p>默认从本地 100 句例句库解析；点左侧「随机例句」即可试，切换到「AI」可联网解析任意句子。</p>
        <p class="empty-note">解析完成后，句子会按成分分色高亮，主谓宾骨架单独拎出来。</p>
      </div>`;
  }

  function renderLoading(sentence) {
    output.innerHTML = `
      <div class="state-loading">
        <div class="loading-head"><span class="spinner"></span>正在拆解句子骨架…</div>
        <p style="margin:12px 0 0;font-size:13px;color:var(--muted);font-family:var(--serif);line-height:1.7">${esc(sentence)}</p>
        <div class="shimmer tall"></div>
        <div class="shimmer s1"></div>
        <div class="shimmer s2"></div>
        <div class="shimmer s3"></div>
        <div class="shimmer s4"></div>
      </div>`;
  }

  function renderError(message, options) {
    const opts = options || {};
    const showRetry = opts.retry !== false && lastSentence;
    output.innerHTML = `
      <div class="state-error">
        <span class="err-badge">解析失败</span>
        <h3>这次没能拆出来</h3>
        <p>${esc(message)}</p>
        ${showRetry ? '<button class="btn btn-primary" type="button" id="retryBtn">重新解析</button>' : ""}
      </div>`;
  }

  /* ---------- 句子朗读（Web Speech API） ---------- */
  let sentenceUtter = null;

  function sentenceVoice(lang) {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    return voices.find((voice) => String(voice.lang || "").replace("_", "-") === lang)
      || voices.find((voice) => /^en/i.test(String(voice.lang || "")));
  }

  function speakSentence(text) {
    if (!("speechSynthesis" in window) || !text) return;
    const synth = window.speechSynthesis;
    const button = $("#speakSentenceBtn");

    if (button && button.classList.contains("is-speaking")) {
      synth.cancel();
      button.classList.remove("is-speaking");
      return;
    }

    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = sentenceVoice("en-US");
    if (voice) utter.voice = voice;
    utter.lang = voice ? voice.lang : "en-US";
    utter.rate = 0.92;
    utter.pitch = 1;

    sentenceUtter = utter;
    if (button) button.classList.add("is-speaking");
    const done = () => {
      if (sentenceUtter !== utter) return;
      sentenceUtter = null;
      if (button) button.classList.remove("is-speaking");
    };
    utter.onend = done;
    utter.onerror = done;
    synth.speak(utter);
  }

  /* ---------------- 渲染：分析结果 ---------------- */
  function normalizeClauseText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9'’\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // 模型未给 chunk.clause 时，用 clauses 文本与片段序列比对，回推从句范围（兼容旧缓存）
  function resolveClauseMarks(chunks, clauses) {
    const marks = new Array(chunks.length).fill("");
    const norms = chunks.map((chunk) => normalizeClauseText(chunk.text));
    const targets = clauses
      .filter((clause) => String(clause.type || "").trim() !== "主句" && normalizeClauseText(clause.text))
      .map((clause) => ({ type: String(clause.type).trim(), text: normalizeClauseText(clause.text) }));

    targets.forEach((target) => {
      let matched = false;
      for (let start = 0; start < chunks.length && !matched; start += 1) {
        let joined = "";
        for (let end = start; end < chunks.length && end - start < 9; end += 1) {
          joined = joined ? `${joined} ${norms[end]}` : norms[end];
          if (!joined) continue;
          if (joined === target.text) {
            for (let k = start; k <= end; k += 1) if (!marks[k]) marks[k] = target.type;
            matched = true;
            break;
          }
          if (joined.length >= target.text.length) break;
        }
      }
      if (!matched) {
        const index = norms.findIndex((norm, i) => !marks[i] && norm && ` ${norm} `.includes(` ${target.text} `));
        if (index !== -1) marks[index] = target.type;
      }
    });

    return marks;
  }

  function chunkMarkup(chunks, clauses) {
    const clauseMarks = resolveClauseMarks(chunks, clauses || []);
    let html = "";
    let openClause = "";

    chunks.forEach((chunk, index) => {
      const clauseType = String(chunk.clause || "").trim() || clauseMarks[index] || "";

      // 从句类型变化时先闭合上一段，让同一声明式从句只画一条连续下划线
      if (openClause && clauseType !== openClause) {
        html += "</span>";
        openClause = "";
      }

      if (index > 0) {
        const prev = chunks[index - 1].text;
        const noSpaceBefore = /^[,.;:!?%)\]）”"'’]/.test(chunk.text) || /^['’]/.test(chunk.text);
        const noSpaceAfter = /[(（“‘"]$/.test(prev) || /[\/-]$/.test(prev);
        if (!noSpaceBefore && !noSpaceAfter) html += " ";
      }

      if (clauseType && !openClause) {
        html += `<span class="clause-group" data-clause="${esc(clauseType)}">`;
        openClause = clauseType;
      }

      const meta = roleMeta(chunk.role);
      const core = CORE_ROLES.has(chunk.role) ? 1 : 0;
      const title = `${meta.label}${clauseType ? `（${clauseType}）` : ""}：${chunk.note || chunk.text}`;
      html += `<span class="tchunk${clauseType ? " is-clause" : ""}" data-core="${core}" data-clause="${esc(clauseType)}" style="--c:${meta.color}" title="${esc(title)}"><span class="tchunk-text">${esc(chunk.text)}</span><span class="tchunk-label">${meta.label}</span></span>`;
    });

    if (openClause) html += "</span>";
    return html;
  }

  /* 把 why / judge / contrast 三点拼成一段通顺的话 */
  function mergePatternAnalysis(pa) {
    const end = (text) => (/[。！？；…]$/.test(text) ? text : `${text}。`);
    const why = String(pa.why || "").trim();
    const judge = String(pa.judge || "").trim();
    const contrast = String(pa.contrast || "").trim();
    return [
      why && end(why),
      judge && end(`判断时，${judge}`),
      contrast && end(`至于其他句型，${contrast}`)
    ].filter(Boolean).join("");
  }

  function renderResult(data) {
    const usedRoles = [];
    data.chunks.forEach((chunk) => {
      if (!usedRoles.includes(chunk.role)) usedRoles.push(chunk.role);
    });

    const mainSequence = [];
    data.chunks.forEach((chunk) => {
      if (!CORE_ROLES.has(chunk.role)) return;
      const label = roleMeta(chunk.role).label;
      if (!mainSequence.includes(label)) mainSequence.push(label);
    });

    const legend = usedRoles.map((role) => {
      const meta = roleMeta(role);
      return `<span class="legend-chip" style="--c:${meta.color}"><span class="legend-dot"></span>${meta.label}</span>`;
    }).join("");

    const hasClauses = data.clauses.some((clause) => String(clause.type).trim() !== "主句")
      || data.chunks.some((chunk) => String(chunk.clause || "").trim());
    const legendNote = hasClauses
      ? `<span class="legend-note"><span class="legend-underline"></span>下划线为从句</span>`
      : "";

    const rows = data.chunks.map((chunk) => {
      const meta = roleMeta(chunk.role);
      return `<div class="comp-row">
        <span class="comp-role" style="--c:${meta.color}">${meta.label}</span>
        <div class="comp-body">
          <b>${esc(chunk.text)}</b>
          ${chunk.note ? `<span>${esc(chunk.note)}</span>` : ""}
        </div>
      </div>`;
    }).join("");

    const clauses = data.clauses.length
      ? `<h3 class="sub">从句结构</h3>
         <div class="clause-list">
           ${data.clauses.map((clause) => `
             <div class="clause-item">
               <span class="clause-type">${esc(clause.type)}</span>
               <span class="clause-text">${esc(clause.text)}</span>
               ${clause.note ? `<span class="clause-note">${esc(clause.note)}</span>` : ""}
             </div>`).join("")}
         </div>`
      : "";

    const keyPoints = data.keyPoints.length
      ? `<h3 class="sub">学习要点</h3>
         <ol class="keypoints">${data.keyPoints.map((point) => `<li>${esc(point)}</li>`).join("")}</ol>`
      : "";

    const clauseCount = data.clauses.filter((clause) => String(clause.type).trim() !== "主句").length;

    const pa = data.patternAnalysis;
    const paText = pa ? mergePatternAnalysis(pa) : "";
    const patternAnalysisBlock = paText
      ? `<div class="pattern-analysis">
           <h3>句型解析</h3>
           <p class="pa-text">${esc(paText)}</p>
         </div>`
      : "";

    output.innerHTML = `
      <div class="result">
        <div class="result-bar">
          <span class="pattern-badge">
            <span class="pb-kind">五大基本句型</span>
            <b>${esc(data.basicPattern || "—")}</b>
            <code>${esc(data.basicCode || data.pattern || "SENTENCE")}</code>
          </span>
          ${data.patternName && data.patternName !== data.basicPattern ? `<span class="pattern-full">${esc(data.patternName)}</span>` : ""}
          ${clauseCount ? `<span class="clause-count">含 ${clauseCount} 个从句</span>` : ""}
          <div class="result-tools">
            <button class="tool-btn tool-btn-speak" type="button" id="speakSentenceBtn" title="朗读原句" aria-label="朗读原句">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h2.4L8 3.6v8.8L5.4 10H3V6Z" stroke-linejoin="round"/><path d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" stroke-linecap="round"/></svg>
              <span>朗读</span>
            </button>
            <button class="tool-btn" type="button" id="focusBtn" aria-pressed="false">只看主干</button>
            <button class="tool-btn" type="button" id="reanalyzeBtn">重新解析</button>
          </div>
        </div>

        <div class="gram-card">
          <span class="card-label">原句 · Sentence</span>
          <div class="gram-sentence" id="gramSentence">${chunkMarkup(data.chunks, data.clauses)}</div>
          <div class="gram-legend">${legend}${legendNote}</div>
        </div>

        <div class="skeleton-card">
          <span class="skeleton-label">主干骨架</span>
          <p class="skeleton-text">${esc(data.skeleton)}</p>
          <div class="skeleton-formula">${mainSequence.map((label) => `<span>${esc(label)}</span>`).join("")}</div>
        </div>

        <div class="gram-translation"><b>译</b><span>${esc(data.translation)}</span></div>

        ${patternAnalysisBlock}

        <div class="result-grid">
          <div class="result-panel">
            <h3>句子成分</h3>
            ${rows}
          </div>
          <div class="result-panel">
            ${clauses || `<h3>从句结构</h3><p style="margin:0;font-size:12.5px;color:var(--muted)">本句为简单句，没有从句。</p>`}
            ${keyPoints}
          </div>
        </div>
      </div>`;

    const speakBtn = $("#speakSentenceBtn");
    if (speakBtn) speakBtn.addEventListener("click", () => speakSentence(displayText(data.chunks)));

    const sentenceBox = $("#gramSentence");
    const focusBtn = $("#focusBtn");
    if (focusBtn && sentenceBox) {
      focusBtn.addEventListener("click", () => {
        const active = sentenceBox.classList.toggle("is-focus");
        focusBtn.setAttribute("aria-pressed", String(active));
        focusBtn.textContent = active ? "显示全部" : "只看主干";
      });
    }
  }

  /* ---------------- 主流程 ---------------- */
  function setBusy(value) {
    busy = value;
    ["#analyzeBtn", "#randomBtn"].forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = value;
    });
  }

  async function runAnalysis(rawSentence, options) {
    if (busy) return;
    const opts = options || {};
    const sentence = String(rawSentence || "").replace(/\s+/g, " ").trim();

    if (!sentence) {
      renderError("请先输入一句英文，再开始拆解。", { retry: false });
      return;
    }
    if (!/[A-Za-z]/.test(sentence)) {
      renderError("这句里没有英文单词，请检查输入内容。", { retry: false });
      return;
    }
    if (sentence.length > 240) {
      renderError("句子太长了，请控制在 240 个字符以内。", { retry: false });
      return;
    }

    lastSentence = sentence;
    const input = $("#sentenceInput");
    if (input && input.value.trim() !== sentence) input.value = sentence;

    /* 未勾选 AI：只查本地例句库，不发起网络请求 */
    if (!aiEnabled()) {
      if (localLoadPromise && !localSentences.length) await localLoadPromise;
      const hit = findLocalSentence(sentence);
      if (!hit) {
        let message = "本地例句库中没有找到这句。切换到「AI」后可联网解析任意句子。";
        if (localLoadFailed) {
          message = location.protocol === "file:"
            ? "浏览器禁止 file:// 读取本地 JSON，请用本地服务器打开页面（例如 python3 -m http.server）。"
            : "本地例句库加载失败，请检查 assets/data/sentences.json，或切换到「AI」联网解析。";
        }
        renderError(message, { retry: false });
        return;
      }
      try {
        renderResult(normalizeResult(hit));
      } catch (e) {
        renderError("本地例句数据异常，请换一句试试。", { retry: false });
      }
      if (window.innerWidth < 980) {
        $("#analyze").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    const cacheKey = sentence.toLowerCase();
    if (!opts.force) {
      const cached = readCache()[cacheKey];
      if (cached) {
        try {
          renderResult(normalizeResult(cached));
          if (window.innerWidth < 980 && opts.scroll) $("#analyze").scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        } catch (e) { /* 缓存损坏则重新请求 */ }
      }
    }

    setBusy(true);
    renderLoading(sentence);

    try {
      const result = await requestAnalysis(sentence);
      writeCache(sentence, result);
      renderResult(result);
    } catch (err) {
      renderError(describeError(err));
    } finally {
      setBusy(false);
      if (window.innerWidth < 980) output.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function pickSample() {
    const current = ($("#sentenceInput") ? $("#sentenceInput").value.trim() : "");
    const pool = localSentences.length ? localSentences : SAMPLES;
    const filtered = pool.filter((item) => item.text.toLowerCase() !== current.toLowerCase());
    const list = filtered.length ? filtered : pool;
    return list[Math.floor(Math.random() * list.length)];
  }

  function fillSample(sample) {
    if (busy) return;
    const input = $("#sentenceInput");
    if (input) {
      input.value = sample.text;
      updateCount();
    }
    runAnalysis(sample.text, { scroll: true });
  }

  function updateCount() {
    const input = $("#sentenceInput");
    const counter = $("#charCount");
    if (input && counter) counter.textContent = `${input.value.length} / 240`;
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    const input = $("#sentenceInput");
    if (input) {
      input.addEventListener("input", updateCount);
      input.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          runAnalysis(input.value, { scroll: true });
        }
      });
    }

    const analyzeBtn = $("#analyzeBtn");
    if (analyzeBtn && input) {
      analyzeBtn.addEventListener("click", () => runAnalysis(input.value, { scroll: true }));
    }

    const randomBtn = $("#randomBtn");
    if (randomBtn) {
      randomBtn.addEventListener("click", () => {
        const sample = pickSample();
        fillSample(sample);
      });
    }

    $$(".sentence-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const sentence = chip.dataset.sentence || "";
        fillSample({ text: sentence });
      });
    });

    if (output) {
      output.addEventListener("click", (event) => {
        const target = event.target.closest("button");
        if (!target) return;
        if (target.id === "retryBtn" || target.id === "reanalyzeBtn") {
          if (lastSentence) runAnalysis(lastSentence, { force: true });
        }
      });
    }
  }

  /* ============================================================
     单词扩展（WORD EXPANSION）
     全部数据由 DeepSeek 生成；结果本地缓存，词根自动归档复习
     ============================================================ */

  const WORD_SYSTEM_PROMPT = `你是资深英语词汇教学专家，面向备战托业/雅思的中国学习者。
任务：为用户给出的英文单词生成一张「单词扩展」词卡，只输出严格 JSON（不要 markdown、不要解释文字）。

硬性要求：
1. 所有字符串内不得出现英文双引号；不要使用直接引语，需要引用时用中文「」。
2. 内容精炼不重复；例句自然准确，符合分层：basic 简单句、exam 托业/雅思风格、native 地道原句。
3. 音标用国际音标，中文用简体中文。

字段与数量：
{"word":"单词小写原形",
"phoneticUK":"英式音标，带斜杠","phoneticUS":"美式音标，带斜杠",
"pos":["n.","v."],
"mnemonic":{"syllables":[{"part":"音节","ipa":"该音节音标"}],"stress":"重音位置说明","respell":"重拼读法，如 TRANSS-port","memory":"巧记联想，用中文说明拆词含义","spelling":"拼写记忆提示"},
"senses":[{"pos":"词性","cn":"中文释义","en":"英文释义（不超过 10 词）","note":"用法提示（不超过 12 字，可空）"}],
"forms":[{"label":"复数 / 过去式 等","value":"变形"}],
"collocations":[{"pattern":"含 ... 的搭配","meaning":"中文","example":"英文例句"}],
"patterns":[{"pattern":"含 ... 的句型","meaning":"中文","example":"英文例句"}],
"pitfalls":[{"wrong":"错误表达","right":"正确表达","note":"中文提示"}],
"examples":{"basic":[{"en":"","cn":""}],"exam":[{"en":"","cn":""}],"native":[{"en":"","cn":""}]},
"family":[{"word":"派生词","pos":"词性","meaning":"中文","note":"关系说明，可空"}],
"morphology":{"breakdown":"trans- + port","prefixes":[{"part":"trans-","meaning":"横过"}],"root":{"part":"port","meaning":"carry 携带","origin":"拉丁语 portare"},"suffixes":[{"part":"-ation","meaning":"名词后缀"}],"explain":"构词逻辑，不超过 20 字"},
"rootWords":[{"word":"同词根词","pos":"词性","meaning":"中文","note":"构件说明，不超过 14 字"}],
"semantics":{"synonyms":[{"word":"近义词","nuance":"细微差别，不超过 14 字","example":"英文例句"}],"antonyms":[{"word":"反义词","note":"中文说明"}],"confusables":[{"word":"形近易混词","note":"中文区分"}]},
"themes":[{"name":"主题场景","words":["关联词","关联词","关联词","关联词"]}],
"idioms":[{"phrase":"习语","meaning":"中文","example":"英文例句"}],
"review":{"roots":["port"],"tip":"复习提示，不超过 20 字"}}

数量上限：senses 2-3；forms 0-5（无变化用 []）；collocations 3；patterns 2；pitfalls 2；examples 每层 2；family 3-4；rootWords 4；semantics 每类 2；themes 2（每主题 4 词）；idioms 2（没有真实习语用 []）；review.roots 1-2（只写词根本身，不带连字符）。
只输出 JSON，不要任何多余文字。`;

  const WORD_CACHE_KEY = "lingua.word.cache.v1";
  const WORD_CACHE_LIMIT = 24;
  const ROOTBOOK_KEY = "lingua.word.rootbook.v1";
  const SPEAK_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h2.4L8 3.6v8.8L5.4 10H3V6Z" stroke-linejoin="round"/><path d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" stroke-linecap="round"/></svg>';
  const WORD_LAYERS = [
    { key: "basic", label: "基础" },
    { key: "exam", label: "真题" },
    { key: "native", label: "原生" }
  ];

  let wordBusy = false;
  let lastWord = "";
  let wordOutputEl = null;
  let wordVoices = [];
  let reviewState = { root: "", items: [], index: 0, flipped: false };

  const listOf = (value) => (Array.isArray(value) ? value : []);
  const objOf = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  const txt = (value) => String(value == null ? "" : value).trim();
  const cleanRoot = (value) => txt(value).replace(/^-+|-+$/g, "").replace(/[\s，,、+]+/g, "");

  function cleanWordInput(value) {
    return txt(value).toLowerCase().replace(/[^a-z'-]/g, "");
  }

  /* ---------- 存储：词卡缓存 + 词根复习库 ---------- */
  function readWordCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(WORD_CACHE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) { return {}; }
  }

  function writeWordCache(word, data) {
    try {
      const cache = readWordCache();
      cache[word] = data;
      const keys = Object.keys(cache);
      while (keys.length > WORD_CACHE_LIMIT) delete cache[keys.shift()];
      localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function readRootbook() {
    try {
      const raw = JSON.parse(localStorage.getItem(ROOTBOOK_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((item) => item && item.word) : [];
    } catch (e) { return []; }
  }

  function saveRootEntry(data) {
    if (!data || !data.word) return;
    try {
      const entries = readRootbook();
      const entry = {
        word: data.word,
        roots: listOf(data.review && data.review.roots),
        meaning: txt(data.senses && data.senses[0] && data.senses[0].cn) || "—",
        phonetic: txt(data.phoneticUK) || txt(data.phoneticUS),
        breakdown: txt(data.morphology && data.morphology.breakdown),
        ts: Date.now()
      };
      const index = entries.findIndex((item) => item.word === entry.word);
      if (index >= 0) entries[index] = entry;
      else entries.unshift(entry);
      while (entries.length > 48) entries.pop();
      localStorage.setItem(ROOTBOOK_KEY, JSON.stringify(entries));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function rootGroups(entries) {
    const map = new Map();
    entries.forEach((entry) => {
      listOf(entry.roots).forEach((root) => {
        if (!root) return;
        if (!map.has(root)) map.set(root, []);
        map.get(root).push(entry);
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }

  /* ---------- 发音 ---------- */
  function loadWordVoices() {
    if (!("speechSynthesis" in window)) return;
    const refresh = () => { wordVoices = window.speechSynthesis.getVoices() || []; };
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
  }

  function speakWord(text, accent) {
    if (!("speechSynthesis" in window) || !text) return false;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(String(text));
      const lang = accent === "uk" ? "en-GB" : "en-US";
      const voice = wordVoices.find((item) => item.lang === lang)
        || wordVoices.find((item) => String(item.lang || "").toLowerCase().startsWith("en"));
      if (voice) utter.voice = voice;
      utter.lang = voice ? voice.lang : lang;
      utter.rate = 0.9;
      window.speechSynthesis.speak(utter);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- JSON 容错解析 ---------- */
  function repairLooseJson(text) {
    let out = "";
    let inStr = false;
    let escape = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inStr) {
        if (escape) { out += ch; escape = false; continue; }
        if (ch === "\\") { out += ch; escape = true; continue; }
        if (ch === '"') {
          let next = i + 1;
          while (next < text.length && /\s/.test(text[next])) next += 1;
          const follower = text[next];
          if (follower === undefined || follower === "," || follower === "}" || follower === "]" || follower === ":") {
            inStr = false;
            out += ch;
          } else {
            out += '\\"';
          }
          continue;
        }
        if (ch === "\n" || ch === "\r") { out += "\\n"; continue; }
        out += ch;
        continue;
      }
      if (ch === '"') inStr = true;
      out += ch;
    }
    if (inStr) out += '"';
    let fixed = out.replace(/,\s*([}\]])/g, "$1");
    // 补齐未闭合的括号
    const stack = [];
    inStr = false;
    escape = false;
    for (let i = 0; i < fixed.length; i += 1) {
      const ch = fixed[i];
      if (inStr) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") stack.pop();
    }
    while (stack.length) fixed += stack.pop() === "{" ? "}" : "]";
    return fixed;
  }

  function parseWordResponse(content) {
    let text = txt(content).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    try {
      return JSON.parse(text);
    } catch (e) {
      try {
        return JSON.parse(repairLooseJson(text));
      } catch (err) {
        throw new Error("AI 返回的 JSON 无法解析");
      }
    }
  }

  /* ---------- 归一化 ---------- */
  function normalizeWordResult(raw) {
    if (!raw || typeof raw !== "object") throw new Error("AI 返回内容为空");
    const word = txt(raw.word).toLowerCase();
    if (!word) throw new Error("AI 未返回单词");

    const senses = listOf(raw.senses).map((s) => ({
      pos: txt(s.pos),
      cn: txt(s.cn),
      en: txt(s.en),
      note: txt(s.note)
    })).filter((s) => s.cn || s.en);
    if (!senses.length) throw new Error("AI 未返回释义");

    const mnemonicRaw = objOf(raw.mnemonic);
    const mnemonic = {
      syllables: listOf(mnemonicRaw.syllables).map((s) => ({ part: txt(s.part), ipa: txt(s.ipa) })).filter((s) => s.part),
      stress: txt(mnemonicRaw.stress),
      respell: txt(mnemonicRaw.respell),
      memory: txt(mnemonicRaw.memory),
      spelling: txt(mnemonicRaw.spelling)
    };

    const morphRaw = objOf(raw.morphology);
    const rootRaw = objOf(morphRaw.root);
    const morphology = {
      breakdown: txt(morphRaw.breakdown),
      prefixes: listOf(morphRaw.prefixes).map((p) => ({ part: txt(p.part), meaning: txt(p.meaning) })).filter((p) => p.part),
      root: {
        part: cleanRoot(rootRaw.part),
        meaning: txt(rootRaw.meaning),
        origin: txt(rootRaw.origin)
      },
      suffixes: listOf(morphRaw.suffixes).map((p) => ({ part: txt(p.part), meaning: txt(p.meaning) })).filter((p) => p.part),
      explain: txt(morphRaw.explain)
    };

    let roots = listOf(objOf(raw.review).roots).map(cleanRoot).filter(Boolean);
    if (!roots.length && morphology.root.part) roots = [morphology.root.part];
    roots = Array.from(new Set(roots.map((r) => r.toLowerCase())));

    const examplesRaw = objOf(raw.examples);
    const examples = {};
    WORD_LAYERS.forEach((layer) => {
      examples[layer.key] = listOf(examplesRaw[layer.key])
        .map((e) => ({ en: txt(e.en), cn: txt(e.cn) }))
        .filter((e) => e.en || e.cn);
    });

    const semRaw = objOf(raw.semantics);

    return {
      word,
      phoneticUK: txt(raw.phoneticUK),
      phoneticUS: txt(raw.phoneticUS),
      pos: listOf(raw.pos).map(txt).filter(Boolean),
      mnemonic,
      senses,
      forms: listOf(raw.forms).map((f) => ({ label: txt(f.label), value: txt(f.value) })).filter((f) => f.label || f.value),
      collocations: listOf(raw.collocations).map((c) => ({ pattern: txt(c.pattern), meaning: txt(c.meaning), example: txt(c.example) })).filter((c) => c.pattern || c.meaning),
      patterns: listOf(raw.patterns).map((p) => ({ pattern: txt(p.pattern), meaning: txt(p.meaning), example: txt(p.example) })).filter((p) => p.pattern || p.meaning),
      pitfalls: listOf(raw.pitfalls).map((p) => ({ wrong: txt(p.wrong), right: txt(p.right), note: txt(p.note) })).filter((p) => p.wrong || p.right),
      examples,
      family: listOf(raw.family).map((f) => ({ word: txt(f.word), pos: txt(f.pos), meaning: txt(f.meaning), note: txt(f.note) })).filter((f) => f.word),
      morphology,
      rootWords: listOf(raw.rootWords).map((r) => ({ word: txt(r.word), pos: txt(r.pos), meaning: txt(r.meaning), note: txt(r.note) })).filter((r) => r.word),
      semantics: {
        synonyms: listOf(semRaw.synonyms).map((s) => ({ word: txt(s.word), nuance: txt(s.nuance), example: txt(s.example) })).filter((s) => s.word),
        antonyms: listOf(semRaw.antonyms).map((s) => ({ word: txt(s.word), note: txt(s.note) })).filter((s) => s.word),
        confusables: listOf(semRaw.confusables).map((s) => ({ word: txt(s.word), note: txt(s.note) })).filter((s) => s.word)
      },
      themes: listOf(raw.themes).map((t) => ({ name: txt(t.name), words: listOf(t.words).map(txt).filter(Boolean) })).filter((t) => t.name || t.words.length),
      idioms: listOf(raw.idioms).map((i) => ({ phrase: txt(i.phrase), meaning: txt(i.meaning), example: txt(i.example) })).filter((i) => i.phrase),
      review: {
        roots,
        tip: txt(objOf(raw.review).tip)
      }
    };
  }

  /* ---------- 请求 DeepSeek ---------- */
  async function callDeepSeekWord(word) {
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
            { role: "system", content: WORD_SYSTEM_PROMPT },
            { role: "user", content: "请扩展单词：" + word }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 4096,
          stream: false
        }),
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      const choice = payload && payload.choices && payload.choices[0];
      const content = choice && choice.message && choice.message.content;
      if (!content) throw new Error("AI 未返回内容");
      return content;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function requestWordExpansion(word) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const content = await callDeepSeekWord(word);
      try {
        return normalizeWordResult(parseWordResponse(content));
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("AI 返回的结构不符合预期");
  }

  function describeWordError(err) {
    const message = String((err && err.message) || err || "");
    if (/abort|timeout/i.test(message)) return "生成超时了，请稍后重试。";
    if (message.includes("401")) return "API 密钥无效或已失效（401），请检查密钥配置。";
    if (message.includes("402")) return "DeepSeek 账户余额不足（402）。";
    if (message.includes("429")) return "请求过于频繁（429），稍等片刻再试。";
    if (/failed to fetch|networkerror|load failed/i.test(message)) return "无法连接 DeepSeek 服务，请检查网络后重试。";
    if (/JSON|解析|释义|内容为空/i.test(message)) return "AI 返回的内容不完整，换一个词或再试一次。";
    return "生成失败：" + message;
  }

  /* ---------- 词根复习库 ---------- */
  function renderRootbook() {
    const box = $("#rootbook");
    if (!box) return;
    const entries = readRootbook();
    if (!entries.length) {
      box.innerHTML = `
        <div class="rootbook-head"><span class="rootbook-title">词根复习库</span></div>
        <p class="rootbook-empty">展开单词后会自动归档词根，同根词在这里成组，方便一起复习。</p>`;
      return;
    }
    const groups = rootGroups(entries);
    box.innerHTML = `
      <div class="rootbook-head">
        <span class="rootbook-title">词根复习库</span>
        <span class="rootbook-meta">${groups.length} 个词根 · ${entries.length} 个单词</span>
      </div>
      <div class="rootbook-groups">
        ${groups.slice(0, 6).map(([root, list]) => `
          <div class="root-group">
            <div class="root-group-head">
              <span class="root-name">${esc(root)}</span>
              <button class="root-review-btn" type="button" data-review-root="${esc(root)}">复习 ${list.length}</button>
            </div>
            <div class="root-group-words">
              ${list.map((entry) => `<button class="root-word" type="button" data-word="${esc(entry.word)}">${esc(entry.word)}</button>`).join("")}
            </div>
          </div>`).join("")}
      </div>`;
  }

  /* ---------- 渲染：状态 ---------- */
  function renderWordEmpty() {
    if (!wordOutputEl) return;
    wordOutputEl.innerHTML = `
      <div class="state-empty">
        <div class="empty-art">W</div>
        <h2 class="empty-title">输入一个单词，展开一整张词卡</h2>
        <p>从怎么读、怎么写到怎么用，连同词根与同根词一起归档，方便成组复习。</p>
        <p class="empty-note">点左侧示例词即可试：transport、predict、construct、inspect、commit。</p>
      </div>`;
  }

  function renderWordLoading(word) {
    if (!wordOutputEl) return;
    wordOutputEl.innerHTML = `
      <div class="state-loading">
        <div class="loading-head"><span class="spinner"></span>正在生成「${esc(word)}」词卡…</div>
        <p style="margin:12px 0 0;font-size:13px;color:var(--muted);line-height:1.7">巧记拼读、释义、搭配、例句、词族、构词、语义、主题、习语一次生成。</p>
        <div class="shimmer tall"></div>
        <div class="shimmer s1"></div>
        <div class="shimmer s2"></div>
        <div class="shimmer s3"></div>
        <div class="shimmer s4"></div>
      </div>`;
  }

  function renderWordError(message, options) {
    if (!wordOutputEl) return;
    const opts = options || {};
    const showRetry = opts.retry !== false && !!lastWord;
    wordOutputEl.innerHTML = `
      <div class="state-error">
        <span class="err-badge">生成失败</span>
        <h3>这次没能展开这个词</h3>
        <p>${esc(message)}</p>
        ${showRetry ? '<button class="btn btn-primary" type="button" id="wordRetryBtn">重新生成</button>' : ""}
      </div>`;
  }

  /* ---------- 渲染：词卡 ---------- */
  function wordCard(num, title, sub, body, extra) {
    return `<section class="w-card${extra ? " " + extra : ""}">
      <header class="w-card-head">
        <span class="w-num">${esc(num)}</span>
        <div class="w-card-titles">
          <h3>${esc(title)}</h3>
          <p class="w-card-sub">${esc(sub)}</p>
        </div>
      </header>
      ${body}
    </section>`;
  }

  function renderWordResult(data) {
    if (!wordOutputEl) return;
    const posChips = data.pos.map((pos) => `<span class="w-pos">${esc(pos)}</span>`).join("");

    const phonetics = [];
    if (data.phoneticUK) {
      phonetics.push(`<span class="w-phon-item"><b>UK</b><span>${esc(data.phoneticUK)}</span><button class="w-speak" type="button" data-speak="${esc(data.word)}" data-accent="uk" title="英式发音" aria-label="英式发音">${SPEAK_ICON}</button></span>`);
    }
    if (data.phoneticUS) {
      phonetics.push(`<span class="w-phon-item"><b>US</b><span>${esc(data.phoneticUS)}</span><button class="w-speak" type="button" data-speak="${esc(data.word)}" data-accent="us" title="美式发音" aria-label="美式发音">${SPEAK_ICON}</button></span>`);
    }
    if (!phonetics.length) {
      phonetics.push(`<button class="w-speak" type="button" data-speak="${esc(data.word)}" data-accent="us" title="发音" aria-label="发音">${SPEAK_ICON}</button>`);
    }

    const heroSide = [
      data.mnemonic.stress ? `<span class="w-stress">${esc(data.mnemonic.stress)}</span>` : "",
      data.mnemonic.respell ? `<span class="w-respell">${esc(data.mnemonic.respell)}</span>` : ""
    ].filter(Boolean).join("");

    const formsRow = data.forms.length ? `
      <div class="w-forms-row">
        <span class="w-forms-label">变形</span>
        ${data.forms.map((form) => `<span class="w-form"><em>${esc(form.label)}</em><b>${esc(form.value)}</b></span>`).join("")}
      </div>` : "";

    const syllables = data.mnemonic.syllables.length
      ? data.mnemonic.syllables.map((s) => `<span class="w-syl"><b>${esc(s.part)}</b>${s.ipa ? `<em>${esc(s.ipa)}</em>` : ""}</span>`).join('<span class="w-syl-dot">·</span>')
      : `<span class="w-syl"><b>${esc(data.word)}</b><em>${esc(data.phoneticUK || data.phoneticUS)}</em></span>`;

    const mnemonicBody = `
      <div class="w-syllables">${syllables}</div>
      ${data.mnemonic.memory ? `<div class="w-memory-row"><span class="w-tag is-rose">巧记</span><p>${esc(data.mnemonic.memory)}</p></div>` : ""}
      ${data.mnemonic.spelling ? `<div class="w-memory-row"><span class="w-tag is-emerald">拼写</span><p>${esc(data.mnemonic.spelling)}</p></div>` : ""}
      ${data.mnemonic.stress || data.mnemonic.respell ? `<p class="w-mnemonic-note">${[data.mnemonic.stress, data.mnemonic.respell ? "重拼：" + data.mnemonic.respell : ""].filter(Boolean).map(esc).join(" · ")}</p>` : ""}`;

    const sensesBody = `<div class="w-sense-list">${data.senses.map((sense) => `
      <div class="w-sense">
        <span class="w-sense-pos">${esc(sense.pos || "—")}</span>
        <div class="w-sense-body">
          <p class="w-sense-cn">${esc(sense.cn || sense.en)}</p>
          ${sense.cn && sense.en ? `<p class="w-sense-en">${esc(sense.en)}</p>` : ""}
          ${sense.note ? `<p class="w-sense-note">${esc(sense.note)}</p>` : ""}
        </div>
      </div>`).join("")}</div>`;

    const collocations = data.collocations.length ? data.collocations.map((item) => `
      <div class="w-colloc">
        <code>${esc(item.pattern)}</code>
        <span class="w-colloc-meaning">${esc(item.meaning)}</span>
        ${item.example ? `<p class="w-colloc-example">${esc(item.example)}</p>` : ""}
      </div>`).join("") : '<p class="w-empty-line">暂无高频搭配。</p>';

    const patterns = data.patterns.length ? data.patterns.map((item) => `
      <div class="w-pattern">
        <code>${esc(item.pattern)}</code>
        <span>${esc(item.meaning)}</span>
        ${item.example ? `<p>${esc(item.example)}</p>` : ""}
      </div>`).join("") : '<p class="w-empty-line">暂无常用句型。</p>';

    const pitfalls = data.pitfalls.length ? data.pitfalls.map((item) => `
      <div class="w-pitfall">
        <span class="w-pit-wrong"><i>✕</i>${esc(item.wrong)}</span>
        <span class="w-pit-right"><i>✓</i>${esc(item.right)}</span>
        ${item.note ? `<span class="w-pit-note">${esc(item.note)}</span>` : ""}
      </div>`).join("") : '<p class="w-empty-line">暂无易错点记录。</p>';

    const usageBody = `
      <h4 class="w-sub-h">高频搭配 <em>Collocation</em></h4>
      <div class="w-colloc-list">${collocations}</div>
      <div class="w-usage-split">
        <div>
          <h4 class="w-sub-h">常用句型 <em>Pattern</em></h4>
          <div class="w-pattern-list">${patterns}</div>
        </div>
        <div>
          <h4 class="w-sub-h">易错提醒 <em>Pitfall</em></h4>
          <div class="w-pitfall-list">${pitfalls}</div>
        </div>
      </div>`;

    const tabs = WORD_LAYERS.map((layer, index) => `<button class="w-tab${index === 0 ? " is-active" : ""}" type="button" data-layer="${layer.key}">${layer.label}</button>`).join("");
    const examplePanels = WORD_LAYERS.map((layer, index) => {
      const list = data.examples[layer.key] || [];
      return `<div class="w-example-panel" data-panel="${layer.key}"${index ? " hidden" : ""}>
        ${list.length ? list.map((ex) => `
          <div class="w-example">
            <p class="w-example-en">${esc(ex.en)}</p>
            ${ex.cn ? `<p class="w-example-cn">${esc(ex.cn)}</p>` : ""}
          </div>`).join("") : '<p class="w-empty-line">这一层暂无例句。</p>'}
      </div>`;
    }).join("");
    const examplesBody = `<div class="w-tabs" role="tablist">${tabs}</div>${examplePanels}`;

    const familyList = data.family.length ? data.family.map((item) => `
      <div class="w-leaf">
        <span class="w-leaf-pos">${esc(item.pos || "词")}</span>
        <div class="w-leaf-body">
          <b>${esc(item.word)}</b>
          <span>${esc(item.meaning)}${item.note ? ` · ${esc(item.note)}` : ""}</span>
        </div>
      </div>`).join("") : '<p class="w-empty-line">暂无派生词。</p>';
    const familyBody = `
      <div class="w-tree">
        <div class="w-tree-core"><b>${esc(data.word)}</b><span>核心词 · ${esc(data.pos.join(" / ") || "word")}</span></div>
        <div class="w-tree-list">${familyList}</div>
      </div>`;

    const parts = [];
    data.morphology.prefixes.forEach((item) => parts.push({ part: item.part, meaning: item.meaning, kind: "prefix" }));
    if (data.morphology.root.part) parts.push({ part: data.morphology.root.part, meaning: data.morphology.root.meaning, kind: "root" });
    data.morphology.suffixes.forEach((item) => parts.push({ part: item.part, meaning: item.meaning, kind: "suffix" }));
    const morphChain = parts.length
      ? `${parts.map((part, index) => `${index ? '<span class="w-op">+</span>' : ""}<span class="w-morph-part is-${part.kind}"><b>${esc(part.part)}</b><em>${esc(part.meaning)}</em></span>`).join("")}<span class="w-op">=</span><span class="w-morph-result">${esc(data.word)}</span>`
      : `<span class="w-morph-result">${esc(data.word)}</span>`;
    const rootWordChips = data.rootWords.length ? data.rootWords.map((item) => `
      <button class="w-rootword" type="button" data-word="${esc(item.word)}" title="${esc(item.note || item.meaning)}">
        <b>${esc(item.word)}</b><span>${esc(item.pos ? item.pos + " " : "")}${esc(item.meaning)}</span>
      </button>`).join("") : '<p class="w-empty-line">暂无同词根词。</p>';
    const morphologyBody = `
      <div class="w-morph-chain">${morphChain}</div>
      ${data.morphology.explain ? `<p class="w-morph-explain">${esc(data.morphology.explain)}</p>` : ""}
      <h4 class="w-sub-h">同词根词 <em>Same Root</em></h4>
      <div class="w-rootwords">${rootWordChips}</div>`;

    const synonyms = data.semantics.synonyms.length ? data.semantics.synonyms.map((item) => `
      <div class="w-sem-row">
        <b>${esc(item.word)}</b>
        ${item.nuance ? `<span>${esc(item.nuance)}</span>` : ""}
        ${item.example ? `<p>${esc(item.example)}</p>` : ""}
      </div>`).join("") : '<p class="w-empty-line">暂无。</p>';
    const antonyms = data.semantics.antonyms.length ? data.semantics.antonyms.map((item) => `
      <div class="w-sem-row"><b>${esc(item.word)}</b>${item.note ? `<span>${esc(item.note)}</span>` : ""}</div>`).join("") : '<p class="w-empty-line">暂无。</p>';
    const confusables = data.semantics.confusables.length ? data.semantics.confusables.map((item) => `
      <div class="w-sem-row"><b>${esc(item.word)}</b>${item.note ? `<span>${esc(item.note)}</span>` : ""}</div>`).join("") : '<p class="w-empty-line">暂无。</p>';
    const semanticsBody = `
      <div class="w-sem-grid">
        <div class="w-sem-col"><h4>近义辨析</h4>${synonyms}</div>
        <div class="w-sem-col"><h4>反义词</h4>${antonyms}</div>
        <div class="w-sem-col"><h4>形近易混</h4>${confusables}</div>
      </div>`;

    const themesBody = data.themes.length ? data.themes.map((theme) => `
      <div class="w-theme">
        <div class="w-theme-head"><span>${esc(theme.name)}</span></div>
        <div class="w-tags">${theme.words.map((item) => `<button class="w-tag-item" type="button" data-word="${esc(item)}">${esc(item)}</button>`).join("")}</div>
      </div>`).join("") : '<p class="w-empty-line">暂无主题聚类。</p>';

    const idiomsBody = data.idioms.length ? data.idioms.map((item) => `
      <div class="w-idiom">
        <div class="w-idiom-head"><b>${esc(item.phrase)}</b><span>${esc(item.meaning)}</span></div>
        ${item.example ? `<p>${esc(item.example)}</p>` : ""}
      </div>`).join("") : '<p class="w-empty-line">暂无常用习语，避免编造。</p>';

    const savedEntries = readRootbook();
    const sameRoot = savedEntries.filter((entry) => entry.word !== data.word && listOf(entry.roots).some((root) => data.review.roots.includes(root)));
    const reviewRoot = data.review.roots[0] || "";
    const reviewBody = `
      <div class="w-review-head">
        <div>
          <span class="card-label">ROOT REVIEW · 词根复习</span>
          <div class="w-root-pills">${data.review.roots.map((root) => `<span class="w-root-pill">${esc(root)}</span>`).join("") || '<span class="w-root-pill">—</span>'}</div>
          ${data.review.tip ? `<p class="w-review-tip">${esc(data.review.tip)}</p>` : ""}
        </div>
        <button class="btn btn-ghost" type="button" data-review-root="${esc(reviewRoot)}"${reviewRoot ? "" : " disabled"}>复习同根词${sameRoot.length ? ` (${sameRoot.length + 1})` : ""}</button>
      </div>
      <div class="w-review-words">
        ${sameRoot.length ? sameRoot.map((entry) => `<button class="w-review-word" type="button" data-word="${esc(entry.word)}"><b>${esc(entry.word)}</b><span>${esc(entry.meaning)}</span></button>`).join("") : '<p class="w-empty-line">复习库里还没有同根词，先点下方同词根词展开，它们会自动加入这一组。</p>'}
      </div>
      <h4 class="w-sub-h">同词根词 <em>点击展开并归档</em></h4>
      <div class="w-rootwords">${rootWordChips}</div>`;

    wordOutputEl.innerHTML = `
      <div class="word-result">
        <div class="w-hero">
          <span class="w-ghost" aria-hidden="true">${esc((data.word[0] || "W").toUpperCase())}</span>
          <div class="w-hero-main">
            <span class="card-label">WORD · 单词卡</span>
            <div class="w-title-row">
              <h2 class="w-word">${esc(data.word)}</h2>
              <span class="w-pos-chips">${posChips}</span>
            </div>
            <div class="w-phon">${phonetics.join("")}</div>
          </div>
          <div class="w-hero-side">${heroSide}</div>
          ${formsRow}
        </div>

        <div class="w-grid">
          ${wordCard("00", "巧记拼读", "拆词发音与拼写记忆", mnemonicBody, "span2")}
          ${wordCard("01", "基础释义", "按词性与义项排列", sensesBody, "span2")}
          ${wordCard("02", "用法", "搭配 · 句型 · 易错提醒", usageBody, "span2")}
          ${wordCard("03", "例句", "基础 / 真题 / 原生", examplesBody, "span2")}
          ${wordCard("04", "词族树", "词性派生", familyBody)}
          ${wordCard("05", "构词", "词根词缀 + 同根词", morphologyBody)}
          ${wordCard("06", "语义扩展", "近义辨析 · 反义词 · 形近易混", semanticsBody, "span2")}
          ${wordCard("07", "主题聚类", "同场景关联词", themesBody)}
          ${wordCard("08", "习语", "Idioms", idiomsBody)}
          ${wordCard("09", "词根复习", "同词根单词统一复习", reviewBody, "span2")}
        </div>
      </div>`;
  }

  /* ---------- 词根复习弹层 ---------- */
  function ensureReviewModal() {
    if ($("#wordReview")) return;
    const modal = document.createElement("div");
    modal.id = "wordReview";
    modal.className = "wrm";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="wrm-backdrop" data-wrm-close></div>
      <div class="wrm-panel" role="dialog" aria-modal="true" aria-labelledby="wrmRoot">
        <div class="wrm-head">
          <div>
            <span class="wrm-kicker">词根复习 · Root Review</span>
            <h3 id="wrmRoot">—</h3>
          </div>
          <button class="wrm-close" type="button" data-wrm-close aria-label="关闭">×</button>
        </div>
        <div class="wrm-stage">
          <div class="wrm-card" id="wrmCard" role="button" tabindex="0" aria-label="翻面">
            <div class="wrm-face wrm-front">
              <span class="wrm-index" data-wrm-index>1 / 1</span>
              <b class="wrm-word" id="wrmWord">—</b>
              <span class="wrm-phon" id="wrmPhon"></span>
              <span class="wrm-hint">点击翻面看释义</span>
            </div>
            <div class="wrm-face wrm-back">
              <span class="wrm-index" data-wrm-index>1 / 1</span>
              <b class="wrm-meaning" id="wrmMeaning">—</b>
              <span class="wrm-breakdown" id="wrmBreakdown"></span>
              <span class="wrm-roots" id="wrmRoots"></span>
            </div>
          </div>
        </div>
        <div class="wrm-actions">
          <button class="btn btn-ghost" type="button" id="wrmPrev">上一个</button>
          <button class="btn btn-primary" type="button" id="wrmFlip">翻面</button>
          <button class="btn btn-ghost" type="button" id="wrmNext">下一个</button>
        </div>
        <div class="wrm-progress" id="wrmProgress">1 / 1</div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-wrm-close]")) closeReview();
    });
    $("#wrmPrev", modal).addEventListener("click", () => moveReview(-1));
    $("#wrmNext", modal).addEventListener("click", () => moveReview(1));
    $("#wrmFlip", modal).addEventListener("click", () => flipReview());
    $("#wrmCard", modal).addEventListener("click", () => flipReview());
  }

  function openReview(root) {
    ensureReviewModal();
    const entries = readRootbook().filter((entry) => listOf(entry.roots).includes(root));
    if (!entries.length) return;
    reviewState = { root, items: entries, index: 0, flipped: false };
    const modal = $("#wordReview");
    modal.hidden = false;
    document.body.classList.add("wrm-open");
    $("#wrmRoot", modal).textContent = root;
    renderReviewCard();
    const flip = $("#wrmFlip");
    if (flip) flip.focus();
  }

  function renderReviewCard() {
    const modal = $("#wordReview");
    if (!modal) return;
    const item = reviewState.items[reviewState.index];
    if (!item) return;
    const card = $("#wrmCard", modal);
    card.classList.toggle("is-flipped", reviewState.flipped);
    $("#wrmWord", modal).textContent = item.word || "—";
    $("#wrmPhon", modal).textContent = item.phonetic || "";
    $("#wrmMeaning", modal).textContent = item.meaning || "—";
    $("#wrmBreakdown", modal).textContent = item.breakdown || "";
    $("#wrmRoots", modal).textContent = "词根：" + (listOf(item.roots).join(" / ") || "—");
    const progress = `${reviewState.index + 1} / ${reviewState.items.length} · ${reviewState.root}`;
    $("#wrmProgress", modal).textContent = progress;
    $$("[data-wrm-index]", modal).forEach((el) => { el.textContent = `${reviewState.index + 1} / ${reviewState.items.length}`; });
    const flip = $("#wrmFlip", modal);
    if (flip) flip.textContent = reviewState.flipped ? "回到单词" : "翻面";
  }

  function moveReview(delta) {
    if (!reviewState.items.length) return;
    reviewState.index = (reviewState.index + delta + reviewState.items.length) % reviewState.items.length;
    reviewState.flipped = false;
    renderReviewCard();
  }

  function flipReview() {
    reviewState.flipped = !reviewState.flipped;
    renderReviewCard();
  }

  function closeReview() {
    const modal = $("#wordReview");
    if (modal) modal.hidden = true;
    document.body.classList.remove("wrm-open");
  }

  /* ---------- 交互 ---------- */
  function updateWordCount() {
    const input = $("#wordInput");
    const counter = $("#wordCount");
    if (input && counter) counter.textContent = `${input.value.length} / 24`;
  }

  function setWordBusy(value) {
    wordBusy = value;
    const button = $("#expandBtn");
    if (button) button.disabled = value;
    $$(".word-chip").forEach((chip) => { chip.disabled = value; });
  }

  function switchExampleLayer(tab) {
    const layer = tab.dataset.layer;
    $$("[data-layer]", wordOutputEl).forEach((item) => item.classList.toggle("is-active", item.dataset.layer === layer));
    $$("[data-panel]", wordOutputEl).forEach((panel) => { panel.hidden = panel.dataset.panel !== layer; });
  }

  async function expandWord(rawWord, options) {
    if (wordBusy || !wordOutputEl) return;
    const opts = options || {};
    const word = cleanWordInput(rawWord);

    if (!word) {
      renderWordError("请输入一个英文单词。", { retry: false });
      return;
    }
    if (word.length > 24) {
      renderWordError("单词太长了，请控制在 24 个字符以内。", { retry: false });
      return;
    }
    if (!/^[a-z][a-z'-]*$/.test(word)) {
      renderWordError("只支持单个英文单词，请去掉空格、数字或中文。", { retry: false });
      return;
    }

    lastWord = word;
    const input = $("#wordInput");
    if (input && input.value.trim().toLowerCase() !== word) input.value = word;
    updateWordCount();

    const cached = readWordCache()[word];
    if (cached && !opts.force) {
      try {
        const data = normalizeWordResult(cached);
        saveRootEntry(data);
        renderWordResult(data);
        renderRootbook();
        if (opts.scroll !== false && window.innerWidth < 980) {
          wordOutputEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      } catch (e) { /* 缓存损坏则重新生成 */ }
    }

    setWordBusy(true);
    renderWordLoading(word);

    try {
      const data = await requestWordExpansion(word);
      writeWordCache(word, data);
      saveRootEntry(data);
      renderWordResult(data);
      renderRootbook();
    } catch (err) {
      renderWordError(describeWordError(err));
    } finally {
      setWordBusy(false);
      if (window.innerWidth < 980) wordOutputEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function bindWordEvents() {
    const input = $("#wordInput");
    if (input) {
      input.addEventListener("input", updateWordCount);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          expandWord(input.value, { scroll: true });
        }
      });
    }

    const button = $("#expandBtn");
    if (button && input) button.addEventListener("click", () => expandWord(input.value, { scroll: true }));

    $$(".word-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const word = chip.dataset.word || "";
        if (input) input.value = word;
        updateWordCount();
        expandWord(word, { scroll: true });
      });
    });

    if (wordOutputEl) {
      wordOutputEl.addEventListener("click", (event) => {
        const speakBtn = event.target.closest("[data-speak]");
        if (speakBtn) { speakWord(speakBtn.dataset.speak, speakBtn.dataset.accent); return; }
        const wordBtn = event.target.closest("[data-word]");
        if (wordBtn) { expandWord(wordBtn.dataset.word, { scroll: true }); return; }
        const tab = event.target.closest("[data-layer]");
        if (tab) { switchExampleLayer(tab); return; }
        const reviewBtn = event.target.closest("[data-review-root]");
        if (reviewBtn && !reviewBtn.disabled) { openReview(reviewBtn.dataset.reviewRoot); return; }
        if (event.target.closest("#wordRetryBtn") && lastWord) expandWord(lastWord, { force: true });
      });
    }

    const rootbook = $("#rootbook");
    if (rootbook) {
      rootbook.addEventListener("click", (event) => {
        const reviewBtn = event.target.closest("[data-review-root]");
        if (reviewBtn) { openReview(reviewBtn.dataset.reviewRoot); return; }
        const wordBtn = event.target.closest("[data-word]");
        if (wordBtn) expandWord(wordBtn.dataset.word, { scroll: true });
      });
    }

    document.addEventListener("keydown", (event) => {
      const modal = $("#wordReview");
      if (!modal || modal.hidden) return;
      if (event.key === "Escape") closeReview();
      else if (event.key === "ArrowLeft") moveReview(-1);
      else if (event.key === "ArrowRight") moveReview(1);
      else if (event.key === " " || event.key === "Enter") {
        if (event.target && event.target.tagName === "BUTTON") return;
        event.preventDefault();
        flipReview();
      }
    });
  }

  function initWord() {
    wordOutputEl = $("#wordOutput");
    if (!wordOutputEl) return;
    renderRootbook();
    bindWordEvents();
    loadWordVoices();
    const params = new URLSearchParams(location.search);
    const preset = params.get("w");
    if (preset) expandWord(preset);
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    renderModules();
    initWord();
    if (!output) return;
    bindEvents();
    updateCount();
    renderEmpty();

    const params = new URLSearchParams(location.search);
    const preset = params.get("s");

    loadLocalSentences().then(() => {
      if (!preset) return;
      const hit = findLocalSentence(preset);
      fillSample({ text: hit ? hit.text : preset.trim() });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* 扩展接口：后续模块可复用解析能力 */
  window.LinguaTeach = {
    modules: MODULES,
    samples: SAMPLES,
    analyze: runAnalysis,
    loadLocal: loadLocalSentences,
    getLocal: () => localSentences,
    render: (raw) => renderResult(normalizeResult(raw)),
    expandWord,
    getRootbook: readRootbook,
    reviewRoot: openReview
  };
})();
