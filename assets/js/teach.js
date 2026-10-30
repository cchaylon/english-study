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

输出 JSON 结构：
{"translation":"中文翻译","basicPattern":"主谓宾","basicFormula":"S+V+O","pattern":"SVO","patternName":"主谓宾","chunks":[{"text":"I","role":"subject","label":"主语","note":"一句话成分说明","clause":""}],"skeleton":"I ...","clauses":[{"type":"主句","text":"...","note":"..."}],"keyPoints":["..."]}`;

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
      title: "词汇拆解",
      desc: "按词根词缀拆词，串联同义替换，一节课记住一组高频词。",
      status: "soon",
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
  let currentSource = "";
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

  function localSource(item) {
    return item.grammarPoint ? "本地例句库 · " + item.grammarPoint : "本地例句库";
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

    bar.innerHTML = `<span class="module-bar-label">我来教你</span>` + MODULES.map((mod) => {
      const live = mod.status === "live";
      return live
        ? `<button class="module-pill is-live is-active" type="button" data-target="${mod.href}" title="${esc(mod.desc)}">${mod.icon}<span>${esc(mod.title)}</span></button>`
        : `<span class="module-pill is-soon" title="${esc(mod.desc)}">${mod.icon}<span>${esc(mod.title)}</span><em>即将上线</em></span>`;
    }).join("");

    $$(".module-pill.is-live", bar).forEach((pill) => {
      pill.addEventListener("click", () => {
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

    const source = currentSource
      ? `例句来源 <b>${esc(currentSource)}</b>`
      : `AI 解析 · DeepSeek`;

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
            <span class="result-source">${source}</span>
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

  function syncSource(sentence) {
    const sample = SAMPLES.find((item) => item.text === sentence);
    currentSource = sample ? sample.source : "";
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
        currentSource = "";
        let message = "本地例句库中没有找到这句。切换到「AI」后可联网解析任意句子。";
        if (localLoadFailed) {
          message = location.protocol === "file:"
            ? "浏览器禁止 file:// 读取本地 JSON，请用本地服务器打开页面（例如 python3 -m http.server）。"
            : "本地例句库加载失败，请检查 assets/data/sentences.json，或切换到「AI」联网解析。";
        }
        renderError(message, { retry: false });
        return;
      }
      currentSource = localSource(hit);
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

    syncSource(sentence);
    if (opts.source) currentSource = opts.source;

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
    const pool = localSentences.length
      ? localSentences.map((item) => ({ text: item.text, source: localSource(item) }))
      : SAMPLES;
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
    currentSource = sample.source;
    runAnalysis(sample.text, { source: sample.source, scroll: true });
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
        fillSample({ text: sentence, source: "" });
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

  /* ---------------- 初始化 ---------------- */
  function init() {
    if (!output) return;
    renderModules();
    bindEvents();
    updateCount();
    renderEmpty();

    const params = new URLSearchParams(location.search);
    const preset = params.get("s");

    loadLocalSentences().then(() => {
      if (!preset) return;
      const hit = findLocalSentence(preset);
      fillSample(hit
        ? { text: hit.text, source: localSource(hit) }
        : { text: preset.trim(), source: "" });
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
    render: (raw) => renderResult(normalizeResult(raw))
  };
})();
