/* ============================================================
   LINGUA · 逐句听透（LISTEN THROUGH）
   输入一段原文 → AI 生成听透方案 → 逐句精听 / 语音解析 /
   生词本 / 固定搭配 / 分级听写 / 理解验证
   ============================================================ */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const FALLBACK_AI = {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
    apiKey: "",
    timeout: 110000
  };
  const AI = Object.assign({}, FALLBACK_AI, (window.LinguaTeach && window.LinguaTeach.config) || {});
  const AI_TIMEOUT = 110000;

  const PLAN_PROMPT = `你是资深英语听力教学专家，面向中国学习者，生词筛选基准为 3500 个常用词。
任务：把用户给出的一段英文原文拆成「逐句听透」学习方案，只输出严格 JSON（不要 markdown、不要解释文字）。

硬性要求：
1. 所有字符串内不得出现英文双引号；需要引用时用中文「」。
2. sentences 按原文顺序逐句拆分，不改写原句；最多 12 句，超过则只取前 12 句并保证 JSON 完整。
3. 每句对象字段：text(原句，保留原标点)、cn(中文翻译，不超过 40 字)、chunks(意群数组 2-4 个，每项 {text} 是原句连续片段)、skeleton(句子主干，用最少的词保留原词形)、contentWords(实词 2-5 个，取原句中的名词/动词/形容词/副词)、speech(语音现象 0-3 个，{type,text,note}，type 只能取 连读/失爆/弱读/同化/浊化/重音/语调/缩略，note 用中文说明怎么读，不超过 24 字)、dictIpa(慢读或词典式音标转写，宽松 IPA，不超过 80 字符)、actual(整句实际口语发音转写，宽松 IPA 或重拼，不超过 80 字符)、stress(重音与语调提示，中文，不超过 28 字)、note(学习提示，中文，不超过 30 字)、hard(布尔，是否难句)。
4. vocab：超出 3500 词或值得学习的生词 4-12 个，不收录人名、地名等专有名词，也不收录 a/the/of 等虚词；word 只填单个英文单词（不含空格），短语和搭配一律放进 collocations；字段 word(原形小写)、phonetic(带斜杠音标)、pos、cn、ctx(本段语境义，不超过 16 字)、level(核心/超纲)、colloc(一个高频搭配)、example(短例句)、sentence(所在句序号，从 1 开始)。
5. collocations：固定搭配/短语动词/习语/口语缩略 4-8 个；字段 phrase、type(固定搭配/短语动词/习语/口语缩略)、meaning、restore(还原完整表达，不是缩略就写空字符串)、example(短例句)、sentence(句序号)。
6. comprehension：3-4 道听力理解题，字段 type(细节/主旨/推理)、q、options(4 项)、answer(正确项下标 0-3)、why(中文解释)。
7. retell：{keywords:[5-8 个英文关键词], prompt:中文复述提示}。
8. scenes：3-4 个同场景拓展，字段 scene(中文场景名)、phrase、meaning、example。
9. notes：1-3 条背景或文化注释，字段 title、text(中文，不超过 40 字)。
10. title(中文标题)、source(推测来源)、level(CEFR 估计 A2/B1/B2/C1)、summary(中文内容概述，不超过 60 字)、translation(整段中文翻译，不超过 160 字)。

数量控制：vocab 不超过 12，collocations 不超过 8，comprehension 3-4，scenes 3-4，notes 1-3。只输出 JSON。`;

  const LS = {
    cache: "lingua.listen.cache.v1",
    book: "lingua.listen.notebook.v1",
    progress: "lingua.listen.progress.v1",
    mistakes: "lingua.listen.mistakes.v1"
  };
  const CACHE_LIMIT = 4;
  const SPEAKER_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h2.4L8 3.6v8.8L5.4 10H3V6Z" stroke-linejoin="round"/><path d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" stroke-linecap="round"/></svg>';
  const BOOK_STATUS = {
    new: { label: "待学", cls: "is-new" },
    learning: { label: "模糊", cls: "is-learning" },
    mastered: { label: "掌握", cls: "is-mastered" }
  };
  const SPEECH_TYPES = {
    "连读": "辅音结尾 + 元音开头，自然滑连",
    "失爆": "爆破音遇辅音，只做口型不送气",
    "弱读": "虚词元音弱化成短促轻声",
    "同化": "相邻音互相影响，读成第三个音",
    "浊化": "清辅音在特定位置读得接近浊音",
    "重音": "实词重读，虚词轻读",
    "语调": "句末升降表达语气与语义",
    "缩略": "gonna / wanna / kinda 等口语形式"
  };
  const STOP_WORDS = new Set(("a an the and or but if so that this these those i you he she it we they me him her us them my your his its our their is am are was were be been being do does did have has had will would can could shall should may might must not no of to in on at for with from by as about into over after before than then there here what who which when where why how".split(" ")));

  const state = {
    data: null,
    text: "",
    hash: "",
    busy: false,
    tab: "overview",
    blind: false,
    speed: 1,
    accent: "us",
    reveal: {},
    mastered: {},
    notebook: readNotebook(),
    vocabFilter: "all",
    speechFilter: "all",
    hideCollocMeaning: false,
    dict: { level: 2, index: 0, checked: false },
    quiz: { submitted: false, answers: {} },
    randomIndex: -1,
    randomReveal: false,
    review: { items: [], index: 0, flipped: false, done: false },
    retellTimer: null,
    retellRemaining: 60
  };

  const output = $("#listenOutput");
  let voices = [];
  let speechToken = 0;

  /* ---------------- 基础工具 ---------------- */
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const txt = (value) => String(value == null ? "" : value).trim();
  const listOf = (value) => (Array.isArray(value) ? value : []);
  const objOf = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function normalizeText(value) {
    return txt(value).replace(/\s+/g, " ").trim();
  }

  function hashText(value) {
    let hash = 5381;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
    }
    return "h" + hash.toString(36);
  }

  function countWords(value) {
    const hits = String(value || "").match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
    return hits ? hits.length : 0;
  }

  function cleanWord(value) {
    return String(value || "").replace(/[’]/g, "'").replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "").toLowerCase();
  }

  function normAnswer(value) {
    return String(value || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
  }

  function stem(value) {
    return String(value || "").toLowerCase()
      .replace(/(ingly|edly|ing|ed|ies|es|s|ly)$/g, "");
  }

  function wordRelated(word, target) {
    const a = cleanWord(word);
    const b = cleanWord(target);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length > 3 && b.length > 3) {
      const sa = stem(a);
      const sb = stem(b);
      if (sa && sa === sb) return true;
      if (a.startsWith(b) || b.startsWith(a)) return true;
    }
    return false;
  }

  function readJson(key, fallback) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      return raw == null ? fallback : raw;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- 生词本 ---------------- */
  function readNotebook() {
    const raw = readJson(LS.book, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && item.word).map((item) => ({
      word: txt(item.word).toLowerCase(),
      phonetic: txt(item.phonetic),
      pos: txt(item.pos),
      cn: txt(item.cn),
      ctx: txt(item.ctx),
      sentence: Number(item.sentence) || 0,
      source: txt(item.source),
      status: BOOK_STATUS[item.status] ? item.status : "new",
      reviews: Number(item.reviews) || 0,
      lastReview: Number(item.lastReview) || 0,
      ts: Number(item.ts) || Date.now()
    }));
  }

  function persistNotebook() {
    if (!writeJson(LS.book, state.notebook)) {
      try { localStorage.removeItem(LS.book); } catch (e) { /* 忽略 */ }
    }
  }

  function bookHas(word) {
    return state.notebook.some((item) => item.word === cleanWord(word));
  }

  function toggleBookWord(word) {
    if (!state.data) return;
    const key = cleanWord(word);
    if (!key) return;
    const index = state.notebook.findIndex((item) => item.word === key);
    if (index >= 0) {
      state.notebook.splice(index, 1);
    } else {
      const vocab = state.data.vocab.find((item) => cleanWord(item.word) === key);
      state.notebook.unshift({
        word: key,
        phonetic: vocab ? vocab.phonetic : "",
        pos: vocab ? vocab.pos : "",
        cn: vocab ? vocab.cn : "—",
        ctx: vocab ? vocab.ctx : "",
        sentence: vocab ? vocab.sentence : 0,
        source: state.data.source || state.data.title || "",
        status: "new",
        reviews: 0,
        lastReview: 0,
        ts: Date.now()
      });
      while (state.notebook.length > 200) state.notebook.pop();
    }
    persistNotebook();
    refreshBookViews();
  }

  function removeBookWord(word) {
    const key = cleanWord(word);
    state.notebook = state.notebook.filter((item) => item.word !== key);
    persistNotebook();
    refreshBookViews();
  }

  function notebookStats() {
    const total = state.notebook.length;
    const mastered = state.notebook.filter((item) => item.status === "mastered").length;
    const learning = state.notebook.filter((item) => item.status === "learning").length;
    return { total, mastered, learning };
  }

  /* ---------------- 学习进度 ---------------- */
  function readProgress() {
    const raw = readJson(LS.progress, {});
    return objOf(raw);
  }

  function loadMastered(hash) {
    const all = readProgress();
    const entry = objOf(all[hash]);
    return objOf(entry.sentences);
  }

  function saveMastered() {
    const all = readProgress();
    all[state.hash] = { sentences: state.mastered, updated: Date.now() };
    const keys = Object.keys(all).sort((a, b) => (Number(objOf(all[b]).updated) || 0) - (Number(objOf(all[a]).updated) || 0));
    while (keys.length > 24) delete all[keys.pop()];
    writeJson(LS.progress, all);
  }

  /* ---------------- 错题本 ---------------- */
  function readMistakes() {
    const raw = readJson(LS.mistakes, []);
    return Array.isArray(raw) ? raw : [];
  }

  function addMistake(sentenceIndex, level, missed) {
    if (!missed || !missed.length) return;
    const list = readMistakes();
    list.unshift({
      hash: state.hash,
      index: sentenceIndex,
      text: state.data && state.data.sentences[sentenceIndex] ? state.data.sentences[sentenceIndex].text : "",
      level,
      missed: missed.slice(0, 8),
      ts: Date.now()
    });
    while (list.length > 60) list.pop();
    writeJson(LS.mistakes, list);
  }

  /* ---------------- 缓存 ---------------- */
  function readCache() {
    const raw = readJson(LS.cache, {});
    return objOf(raw);
  }

  function writeCache(hash, text, data) {
    const cache = readCache();
    cache[hash] = { text, data, ts: Date.now() };
    const keys = Object.keys(cache).sort((a, b) => (Number(objOf(cache[b]).ts) || 0) - (Number(objOf(cache[a]).ts) || 0));
    while (keys.length > CACHE_LIMIT) delete cache[keys.pop()];
    if (!writeJson(LS.cache, cache)) {
      try { localStorage.removeItem(LS.cache); } catch (e) { /* 忽略 */ }
    }
  }

  /* ---------------- JSON 容错 ---------------- */
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

  function parsePlan(content) {
    let text = txt(content).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1) text = end !== -1 ? text.slice(start, end + 1) : text.slice(start);
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

  /* ---------------- 归一化 ---------------- */
  function normalizePlan(raw) {
    if (!raw || typeof raw !== "object") throw new Error("AI 返回内容为空");
    const sentences = listOf(raw.sentences).map((item, index) => ({
      id: index + 1,
      text: normalizeText(item.text),
      cn: txt(item.cn),
      chunks: listOf(item.chunks).map((chunk) => ({ text: normalizeText(typeof chunk === "string" ? chunk : chunk.text) })).filter((chunk) => chunk.text),
      contentWords: listOf(item.contentWords).map(txt).filter(Boolean),
      speech: listOf(item.speech).map((feature) => ({
        type: txt(feature.type) || "语音",
        text: txt(feature.text),
        note: txt(feature.note)
      })).filter((feature) => feature.type),
      skeleton: txt(item.skeleton),
      dictIpa: txt(item.dictIpa || item.dictIPA || item.dictionaryIpa || item.dict),
      actual: txt(item.actual),
      stress: txt(item.stress),
      note: txt(item.note),
      hard: !!item.hard
    })).filter((item) => item.text);

    if (!sentences.length) throw new Error("AI 未返回逐句拆分");

    const sentenceMax = sentences.length;
    const num = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const vocab = listOf(raw.vocab).map((item) => ({
      word: cleanWord(item.word) || txt(item.word).toLowerCase(),
      phonetic: txt(item.phonetic),
      pos: txt(item.pos),
      cn: txt(item.cn),
      ctx: txt(item.ctx),
      level: txt(item.level).includes("超") ? "超纲" : "核心",
      colloc: txt(item.colloc),
      example: txt(item.example),
      sentence: clamp(num(item.sentence, 0), 0, sentenceMax)
    })).filter((item) => item.word && item.cn);

    const collocations = listOf(raw.collocations).map((item) => ({
      phrase: txt(item.phrase),
      type: txt(item.type) || "固定搭配",
      meaning: txt(item.meaning),
      restore: txt(item.restore),
      example: txt(item.example),
      sentence: clamp(num(item.sentence, 0), 0, sentenceMax)
    })).filter((item) => item.phrase && item.meaning);

    const optionText = (option) => {
      if (typeof option === "string") return txt(option);
      if (option && typeof option === "object") return txt(option.text || option.option || option.label || option.value);
      return "";
    };
    const comprehension = listOf(raw.comprehension).map((item) => {
      const options = listOf(item.options).map(optionText).filter(Boolean).slice(0, 4);
      let answer = item.answer;
      if (typeof answer === "string") {
        const letter = answer.trim().toUpperCase();
        if (/^[A-D]$/.test(letter)) answer = letter.charCodeAt(0) - 65;
        else {
          const hit = options.findIndex((option) => normalizeText(option) === normalizeText(answer));
          answer = hit;
        }
      }
      return {
        type: txt(item.type) || "细节",
        q: txt(item.q),
        options,
        answer: clamp(num(answer, 0), 0, Math.max(0, options.length - 1)),
        why: txt(item.why)
      };
    }).filter((item) => item.q && item.options.length >= 2);

    const retellRaw = objOf(raw.retell);

    return {
      title: txt(raw.title) || "逐句听透",
      source: txt(raw.source),
      level: txt(raw.level) || "B1",
      summary: txt(raw.summary),
      translation: txt(raw.translation),
      sentences,
      vocab,
      collocations,
      comprehension,
      retell: {
        keywords: listOf(retellRaw.keywords).map(txt).filter(Boolean),
        prompt: txt(retellRaw.prompt)
      },
      scenes: listOf(raw.scenes).map((item) => ({
        scene: txt(item.scene) || "同场景",
        phrase: txt(item.phrase),
        meaning: txt(item.meaning),
        example: txt(item.example)
      })).filter((item) => item.phrase),
      notes: listOf(raw.notes).map((item) => ({ title: txt(item.title), text: txt(item.text) })).filter((item) => item.title || item.text)
    };
  }

  /* ---------------- 请求 AI ---------------- */
  async function callPlan(text) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), AI_TIMEOUT) : null;
    try {
      const response = await fetch(AI.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + AI.apiKey
        },
        body: JSON.stringify({
          model: AI.model || "deepseek-chat",
          messages: [
            { role: "system", content: PLAN_PROMPT },
            { role: "user", content: text }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 8192,
          stream: false
        }),
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      const choice = payload && payload.choices && payload.choices[0];
      const content = choice && choice.message && choice.message.content;
      if (!content) throw new Error("AI 未返回内容");
      return parsePlan(content);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function describeError(err) {
    const message = String((err && err.message) || err || "");
    if (/abort|timeout/i.test(message)) return "生成超时了，这段原文较长，请重试或缩短到 12 句以内。";
    if (message.includes("401")) return "API 密钥无效或已失效（401），请检查密钥配置。";
    if (message.includes("402")) return "DeepSeek 账户余额不足（402）。";
    if (message.includes("429")) return "请求过于频繁（429），稍等片刻再试。";
    if (/failed to fetch|networkerror|load failed/i.test(message)) return "无法连接 DeepSeek 服务，请检查网络后重试。";
    if (/JSON|逐句拆分|内容为空/i.test(message)) return "AI 返回的结构不完整，请重试一次；若原文过长，可先删减到 12 句以内。";
    return "生成失败：" + message;
  }

  /* ---------------- 语音播放 ---------------- */
  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = window.speechSynthesis.getVoices() || [];
  }

  function pickVoice() {
    const want = state.accent === "uk" ? "en-GB" : "en-US";
    const exact = voices.find((voice) => String(voice.lang || "").replace("_", "-") === want);
    if (exact) return exact;
    const anyEn = voices.find((voice) => /^en/i.test(String(voice.lang || "")));
    return anyEn || null;
  }

  function speak(text, rate) {
    return new Promise((resolve) => {
      const content = txt(text);
      if (!("speechSynthesis" in window) || !content) { resolve(); return; }
      try {
        const utter = new SpeechSynthesisUtterance(content);
        const voice = pickVoice();
        if (voice) utter.voice = voice;
        utter.lang = voice ? voice.lang : (state.accent === "uk" ? "en-GB" : "en-US");
        utter.rate = clamp(Number(rate) || 1, 0.4, 1.4);
        utter.pitch = 1;
        let done = false;
        let guard = null;
        const finish = () => {
          if (done) return;
          done = true;
          if (guard) clearTimeout(guard);
          resolve();
        };
        const factor = utter.rate < 1 ? 1.05 / Math.max(0.5, utter.rate) : 1;
        guard = setTimeout(finish, Math.min(90000, (1800 + content.length * 150) * factor));
        utter.onend = finish;
        utter.onerror = finish;
        window.speechSynthesis.speak(utter);
      } catch (e) {
        resolve();
      }
    });
  }

  function stopSpeech() {
    speechToken += 1;
    if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
    }
    $$(".ln-sent.is-playing, .ln-focus.is-playing").forEach((el) => el.classList.remove("is-playing"));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function tokenOk(token) {
    return token === speechToken;
  }

  async function playSentence(index, rate) {
    const sentence = state.data && state.data.sentences[index];
    if (!sentence) return;
    stopSpeech();
    const token = speechToken;
    const card = document.querySelector('.ln-sent[data-sent="' + index + '"]');
    if (card) card.classList.add("is-playing");
    await speak(sentence.text, rate || state.speed);
    if (!tokenOk(token)) return;
    if (card) card.classList.remove("is-playing");
  }

  async function playChunks(index) {
    const sentence = state.data && state.data.sentences[index];
    if (!sentence) return;
    const chunks = sentence.chunks.length ? sentence.chunks : [{ text: sentence.text }];
    stopSpeech();
    const token = speechToken;
    const card = document.querySelector('.ln-sent[data-sent="' + index + '"]');
    if (card) card.classList.add("is-playing");
    for (let i = 0; i < chunks.length; i += 1) {
      if (!tokenOk(token)) return;
      await speak(chunks[i].text, state.speed);
      if (!tokenOk(token)) return;
      await wait(260);
    }
    if (card) card.classList.remove("is-playing");
  }

  async function shadowSentence(index) {
    const sentence = state.data && state.data.sentences[index];
    if (!sentence) return;
    stopSpeech();
    const token = speechToken;
    const card = document.querySelector('.ln-sent[data-sent="' + index + '"]');
    if (card) card.classList.add("is-playing");
    await speak(sentence.text, Math.min(0.8, state.speed));
    if (!tokenOk(token)) return;
    await wait(2200);
    if (!tokenOk(token)) return;
    await speak(sentence.text, Math.min(0.8, state.speed));
    if (card) card.classList.remove("is-playing");
  }

  async function shadowAll() {
    if (!state.data) return;
    switchTab("sentences");
    stopSpeech();
    const token = speechToken;
    for (let i = 0; i < state.data.sentences.length; i += 1) {
      if (!tokenOk(token)) return;
      const card = document.querySelector('.ln-sent[data-sent="' + i + '"]');
      if (card) {
        $$(".ln-sent").forEach((el) => el.classList.remove("is-playing"));
        card.classList.add("is-playing");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      await speak(state.data.sentences[i].text, Math.min(0.82, state.speed));
      if (!tokenOk(token)) return;
      await wait(1900);
    }
    if (tokenOk(token)) $$(".ln-sent.is-playing").forEach((el) => el.classList.remove("is-playing"));
  }

  async function playAll(rate) {
    if (!state.data) return;
    stopSpeech();
    const token = speechToken;
    for (let i = 0; i < state.data.sentences.length; i += 1) {
      if (!tokenOk(token)) return;
      await speak(state.data.sentences[i].text, rate || state.speed);
      if (!tokenOk(token)) return;
      await wait(320);
    }
  }

  /* ---------------- 句子切词 ---------------- */
  function sentenceTokens(text) {
    const parts = String(text || "").split(/(\s+)/);
    return parts.map((part) => {
      if (!part) return "";
      if (/^\s+$/.test(part)) return part;
      const word = cleanWord(part);
      if (!word) return `<span class="ln-punct">${esc(part)}</span>`;
      return `<button class="ln-word" type="button" data-say="${esc(word)}" title="单独听 ${esc(word)}">${esc(part)}</button>`;
    }).join("");
  }

  /* ---------------- 顶部栏 / 标签 ---------------- */
  function topBarHTML() {
    const d = state.data;
    const words = countWords(d.sentences.map((item) => item.text).join(" "));
    return `<div class="ln-result-bar">
      <div class="ln-bar-main">
        <span class="ln-level-badge">${esc(d.level)}</span>
        <div class="ln-bar-title">
          <h2>${esc(d.title)}</h2>
          <p>${esc(d.source || "来源未标注")} · ${d.sentences.length} 句 · ${words} 词 · ${d.vocab.length} 个生词</p>
        </div>
      </div>
      <div class="ln-bar-tools">
        <label class="ln-select">语速
          <select data-ln-speed aria-label="播放语速">
            <option value="0.5"${state.speed === 0.5 ? " selected" : ""}>0.5x</option>
            <option value="0.75"${state.speed === 0.75 ? " selected" : ""}>0.75x</option>
            <option value="0.9"${state.speed === 0.9 ? " selected" : ""}>0.9x</option>
            <option value="1"${state.speed === 1 ? " selected" : ""}>1.0x</option>
            <option value="1.25"${state.speed === 1.25 ? " selected" : ""}>1.25x</option>
          </select>
        </label>
        <label class="ln-select">口音
          <select data-ln-accent aria-label="朗读口音">
            <option value="us"${state.accent === "us" ? " selected" : ""}>美音</option>
            <option value="uk"${state.accent === "uk" ? " selected" : ""}>英音</option>
          </select>
        </label>
        <button class="ln-tool-btn${state.blind ? " is-on" : ""}" type="button" data-ln-blind aria-pressed="${state.blind}">盲听模式</button>
        <button class="ln-tool-btn" type="button" data-ln-shuffle>随机听句</button>
        <button class="ln-tool-btn" type="button" data-ln-shadow-all>整段跟读</button>
        <button class="ln-tool-btn is-stop" type="button" data-ln-stop>停止</button>
      </div>
    </div>`;
  }

  function tabsInnerHTML() {
    const d = state.data;
    const book = notebookStats();
    const tabs = [
      { id: "overview", label: "总览" },
      { id: "sentences", label: "逐句精听", badge: d.sentences.length },
      { id: "vocab", label: "生词本", badge: book.total },
      { id: "collocations", label: "固定搭配", badge: d.collocations.length },
      { id: "speech", label: "语音现象", badge: d.sentences.reduce((n, item) => n + item.speech.length, 0) },
      { id: "dictation", label: "听写训练" },
      { id: "comprehension", label: "理解验证" }
    ];
    return tabs.map((tab) => `
      <button class="ln-tab${state.tab === tab.id ? " is-active" : ""}" type="button" role="tab" data-ln-tab="${tab.id}" aria-selected="${state.tab === tab.id}">
        ${tab.label}${tab.badge ? `<em>${tab.badge}</em>` : ""}
      </button>`).join("");
  }

  function tabsHTML() {
    return `<div class="ln-tabs" role="tablist">${tabsInnerHTML()}</div>`;
  }

  function refreshTabs() {
    const tabs = document.querySelector(".ln-tabs");
    if (tabs) tabs.innerHTML = tabsInnerHTML();
  }

  /* ---------------- 总览 ---------------- */
  function overviewHTML() {
    const d = state.data;
    const total = d.sentences.length;
    const mastered = Object.keys(state.mastered).filter((key) => state.mastered[key]).length;
    const percent = total ? Math.round((mastered / total) * 100) : 0;
    const book = notebookStats();
    const hardCount = d.sentences.filter((item) => item.hard).length;
    const speechCount = d.sentences.reduce((n, item) => n + item.speech.length, 0);
    const outCount = d.vocab.filter((item) => item.level === "超纲").length;
    const keywords = (d.retell.keywords.length ? d.retell.keywords : d.vocab.slice(0, 6).map((item) => item.word)).slice(0, 8);

    const route = [
      { id: "vocab", num: "01", title: "扫清生词", meta: `${d.vocab.length} 个生词 · ${d.collocations.length} 个搭配` },
      { id: "speech", num: "02", title: "拆解语音", meta: `${speechCount} 处连读 / 弱读 / 语调` },
      { id: "sentences", num: "03", title: "精听跟读", meta: `${total} 句 · 已听懂 ${mastered} 句` },
      { id: "comprehension", num: "04", title: "理解验证", meta: `${d.comprehension.length} 道小题 · 关键词复述` }
    ];

    const notes = d.notes.length ? `
      <section class="ln-block">
        <h3 class="ln-block-h">背景与文化注释</h3>
        <div class="ln-note-list">
          ${d.notes.map((item) => `<div class="ln-note-item"><b>${esc(item.title)}</b><p>${esc(item.text)}</p></div>`).join("")}
        </div>
      </section>` : "";

    const translation = d.translation ? `
      <section class="ln-block">
        <div class="ln-block-head">
          <h3 class="ln-block-h">整段译文</h3>
          <button class="ln-text-btn" type="button" data-ln-toggle-overall>显示 / 隐藏</button>
        </div>
        <p class="ln-overall-cn is-hidden">${esc(d.translation)}</p>
      </section>` : "";

    return `<div class="ln-overview">
      <section class="ln-summary-card">
        <span class="card-label">LISTEN PLAN · 听透方案</span>
        <h3>${esc(d.title)}</h3>
        <p class="ln-summary">${esc(d.summary || "这段原文已拆成生词、语音、精听与理解四步。")}</p>
        <div class="ln-tags">
          <span>${esc(d.level)} 难度</span>
          <span>${total} 句</span>
          <span>${d.vocab.length} 生词</span>
          <span>${speechCount} 处语音变化</span>
          ${hardCount ? `<span class="is-warn">${hardCount} 句难句</span>` : ""}
        </div>
      </section>

      <div class="ln-stats-row">
        <div class="ln-stat"><b>${total}</b><span>句子</span></div>
        <div class="ln-stat"><b>${d.vocab.length}</b><span>生词</span></div>
        <div class="ln-stat"><b>${outCount}</b><span>超纲词</span></div>
        <div class="ln-stat"><b>${speechCount}</b><span>语音现象</span></div>
      </div>

      <section class="ln-block">
        <h3 class="ln-block-h">四步听透路线</h3>
        <div class="ln-route-grid">
          ${route.map((item) => `<button class="ln-route-card" type="button" data-ln-goto="${item.id}">
            <span class="ln-route-num">${item.num}</span>
            <b>${item.title}</b>
            <em>${item.meta}</em>
          </button>`).join("")}
        </div>
      </section>

      <section class="ln-block ln-progress-card">
        <div class="ln-progress-head">
          <div><h3 class="ln-block-h">听透进度</h3><p>每听完一句就标记一次，进度会自动保存。</p></div>
          <b>${mastered} / ${total}</b>
        </div>
        <div class="ln-progress-bar"><i style="width:${percent}%"></i></div>
        <div class="ln-progress-foot">
          <span>生词本 ${book.total} 个 · 已掌握 ${book.mastered} 个 · 模糊 ${book.learning} 个</span>
          <button class="ln-text-btn" type="button" data-book-review ${book.total ? "" : "disabled"}>随机复习生词</button>
        </div>
      </section>

      <section class="ln-block">
        <h3 class="ln-block-h">听前预测</h3>
        <p class="ln-prelisten-copy">先看关键词，猜一猜这段在讲什么，再进入逐句精听。点击单词可以单独听。</p>
        <div class="ln-keyword-row">
          ${keywords.map((word) => `<button class="ln-keyword" type="button" data-say="${esc(word)}">${esc(word)}</button>`).join("") || '<span class="ln-empty-line">暂无关键词</span>'}
        </div>
      </section>

      ${notes}
      ${translation}
    </div>`;
  }

  /* ---------------- 逐句精听 ---------------- */
  function randomFocusHTML() {
    if (state.randomIndex < 0 || !state.data) return "";
    const sentence = state.data.sentences[state.randomIndex];
    if (!sentence) return "";
    const hidden = state.blind && !state.randomReveal;
    return `<div class="ln-focus${hidden ? " is-blind" : ""}">
      <div class="ln-focus-head">
        <span class="ln-focus-kicker">随机听句 · 第 ${state.randomIndex + 1} / ${state.data.sentences.length} 句</span>
        <button class="ln-text-btn" type="button" data-ln-shuffle-close>收起</button>
      </div>
      <p class="ln-focus-text">${hidden ? "先盲听一遍，再决定是否看原文。" : sentenceTokens(sentence.text)}</p>
      <div class="ln-focus-actions">
        <button class="ln-act is-primary" type="button" data-ln-play-sent="${state.randomIndex}">播放</button>
        <button class="ln-act" type="button" data-ln-play-sent="${state.randomIndex}" data-rate="0.6">慢速</button>
        <button class="ln-act" type="button" data-ln-focus-reveal>${hidden ? "显示原文" : "隐藏原文"}</button>
        <button class="ln-act" type="button" data-ln-shuffle>下一句</button>
      </div>
    </div>`;
  }

  function sentenceCardHTML(sentence, index) {
    const mastered = !!state.mastered[index];
    const hidden = state.blind && !state.reveal[index];
    const speech = sentence.speech.length
      ? `<div class="ln-speech-row">${sentence.speech.map((feature) => `
          <span class="ln-speech-item">
            <i class="ln-type" data-type="${esc(feature.type)}">${esc(feature.type)}</i>
            ${feature.text ? `<button class="ln-feature-say" type="button" data-say="${esc(feature.text)}" title="听这个语音片段">${esc(feature.text)}</button>` : ""}
            ${feature.note ? `<em>${esc(feature.note)}</em>` : ""}
          </span>`).join("")}</div>`
      : `<p class="ln-sent-note">本句语音变化较少，注意自然停顿与重音。</p>`;
    const pron = (sentence.dictIpa || sentence.actual || sentence.stress) ? `
      <div class="ln-pron-row">
        ${sentence.dictIpa ? `<span><b>词典音标</b><em>${esc(sentence.dictIpa)}</em></span>` : ""}
        ${sentence.actual ? `<span><b>实际发音</b><em>${esc(sentence.actual)}</em></span>` : ""}
        ${sentence.stress ? `<span><b>重音语调</b><em>${esc(sentence.stress)}</em></span>` : ""}
      </div>` : "";
    const skeleton = sentence.skeleton && normalizeText(sentence.skeleton) !== normalizeText(sentence.text)
      ? `<div class="ln-skeleton-row"><span>主干</span><p>${esc(sentence.skeleton)}</p></div>`
      : "";

    return `<article class="ln-sent${hidden ? " is-blind" : ""}${mastered ? " is-mastered" : ""}" data-sent="${index}">
      <header class="ln-sent-head">
        <span class="ln-sent-num">${String(index + 1).padStart(2, "0")}</span>
        <div class="ln-sent-actions">
          ${sentence.hard ? '<span class="ln-hard">难句</span>' : ""}
          <button class="ln-act" type="button" data-ln-play-sent="${index}">整句</button>
          <button class="ln-act" type="button" data-ln-play-sent="${index}" data-rate="0.6">慢速</button>
          <button class="ln-act" type="button" data-ln-play-chunks="${index}">意群</button>
          <button class="ln-act" type="button" data-ln-shadow-sent="${index}">跟读</button>
          <button class="ln-act is-ghost" type="button" data-ln-toggle-cn="${index}">译文</button>
        </div>
      </header>
      <div class="ln-sent-text-wrap">
        <p class="ln-sent-text">${sentenceTokens(sentence.text)}</p>
        ${hidden ? `<div class="ln-blind-cover"><span>盲听模式</span><button class="ln-act is-primary" type="button" data-ln-reveal="${index}">显示本句</button></div>` : ""}
      </div>
      <p class="ln-sent-cn is-hidden">${esc(sentence.cn || "（暂无翻译）")}</p>
      ${sentence.chunks.length ? `<div class="ln-chunk-row">
        <span class="ln-chunk-label">意群</span>
        ${sentence.chunks.map((chunk, chunkIndex) => `<button class="ln-chunk" type="button" data-say="${esc(chunk.text)}"><em>${chunkIndex + 1}</em>${esc(chunk.text)}</button>`).join("")}
      </div>` : ""}
      ${skeleton}
      ${pron}
      ${speech}
      ${sentence.note ? `<p class="ln-sent-tip">${esc(sentence.note)}</p>` : ""}
      <footer class="ln-sent-foot">
        <button class="ln-master${mastered ? " is-on" : ""}" type="button" data-ln-master="${index}" aria-pressed="${mastered}">${mastered ? "已听懂" : "标记听懂"}</button>
        ${sentence.contentWords.length ? `<span class="ln-content-words"><b>实词</b>${sentence.contentWords.map((word) => `<button type="button" data-say="${esc(word)}">${esc(word)}</button>`).join("")}</span>` : ""}
      </footer>
    </article>`;
  }

  function sentencesHTML() {
    return `<div class="ln-sent-toolbar">
      <div>
        <strong>逐句精听</strong>
        <span>点句中单词可单独听；每句支持慢速、意群、跟读，听完记得标记。</span>
      </div>
      <div class="ln-toolbar-actions">
        <button class="ln-tool-btn" type="button" data-ln-shuffle>随机听句</button>
        <button class="ln-tool-btn" type="button" data-ln-shadow-all>整段跟读</button>
      </div>
    </div>
    ${randomFocusHTML()}
    <div class="ln-sent-list">
      ${state.data.sentences.map((sentence, index) => sentenceCardHTML(sentence, index)).join("")}
    </div>`;
  }

  /* ---------------- 生词本 ---------------- */
  function vocabCardHTML(item) {
    const saved = bookHas(item.word);
    return `<div class="ln-vocab-card">
      <div class="ln-vocab-head">
        <b class="ln-vocab-word">${esc(item.word)}</b>
        ${item.phonetic ? `<span class="ln-ipa">${esc(item.phonetic)}</span>` : ""}
        ${item.pos ? `<span class="ln-pos">${esc(item.pos)}</span>` : ""}
        <span class="ln-level ${item.level === "超纲" ? "is-out" : "is-core"}">${esc(item.level)}</span>
        <button class="ln-mini-btn" type="button" data-say="${esc(item.word)}" title="发音">${SPEAKER_ICON}</button>
        <button class="ln-mini-btn${saved ? " is-saved" : ""}" type="button" data-ln-book="${esc(item.word)}">${saved ? "已收藏" : "收藏"}</button>
      </div>
      <p class="ln-vocab-cn">${esc(item.cn)}${item.ctx ? `<em> · 语境：${esc(item.ctx)}</em>` : ""}</p>
      ${item.colloc ? `<p class="ln-vocab-colloc">搭配 <code>${esc(item.colloc)}</code></p>` : ""}
      ${item.example ? `<p class="ln-vocab-ex">${esc(item.example)}</p>` : ""}
      <span class="ln-vocab-sent">出现在第 ${item.sentence || "—"} 句</span>
    </div>`;
  }

  function bookPanelHTML() {
    const stats = notebookStats();
    const entries = state.notebook;
    return `<section class="ln-book-panel">
      <div class="ln-book-panel-head">
        <div>
          <h3 class="ln-block-h">生词本</h3>
          <p>共 ${stats.total} 个 · 已掌握 ${stats.mastered} 个 · 模糊 ${stats.learning} 个 · 随机复习会自动打乱顺序</p>
        </div>
        <button class="btn btn-primary" type="button" data-book-review ${entries.length ? "" : "disabled"}>随机复习</button>
      </div>
      ${entries.length ? `<div class="ln-book-list">
        ${entries.map((item) => {
          const meta = BOOK_STATUS[item.status] || BOOK_STATUS.new;
          return `<span class="ln-book-chip">
            <b>${esc(item.word)}</b>
            <em class="${meta.cls}">${meta.label}</em>
            <button type="button" data-say="${esc(item.word)}" aria-label="发音">${SPEAKER_ICON}</button>
            <button class="ln-book-remove" type="button" data-book-remove="${esc(item.word)}" aria-label="移出生词本">×</button>
          </span>`;
        }).join("")}
      </div>` : `<p class="ln-empty-line">还没有收藏生词。上面的词卡点「收藏」后，会出现在这里，并支持随机复习。</p>`}
    </section>`;
  }

  function vocabHTML() {
    const filters = [
      { id: "all", label: "全部" },
      { id: "core", label: "核心词" },
      { id: "out", label: "超纲词" },
      { id: "saved", label: "已收藏" }
    ];
    const list = state.data.vocab.filter((item) => {
      if (state.vocabFilter === "core") return item.level !== "超纲";
      if (state.vocabFilter === "out") return item.level === "超纲";
      if (state.vocabFilter === "saved") return bookHas(item.word);
      return true;
    });

    return `<div class="ln-vocab-top">
      <div>
        <h3 class="ln-block-h">生词与语境释义</h3>
        <p>按 3500 词基准筛出超纲词与值得学习的核心词，释义直接对应本段语境。</p>
      </div>
      <div class="ln-filter-row">
        ${filters.map((filter) => `<button class="ln-filter${state.vocabFilter === filter.id ? " is-active" : ""}" type="button" data-ln-vocab-filter="${filter.id}">${filter.label}</button>`).join("")}
      </div>
    </div>
    <div class="ln-vocab-list">
      ${list.map(vocabCardHTML).join("") || '<p class="ln-empty-line">这个筛选下还没有词。</p>'}
    </div>
    ${bookPanelHTML()}`;
  }

  /* ---------------- 固定搭配 ---------------- */
  function collocationsHTML() {
    const list = state.data.collocations;
    return `<div class="ln-colloc-top">
      <div>
        <h3 class="ln-block-h">固定搭配与口语缩略</h3>
        <p>先遮住释义自测，再点开对照。点击短语可整段听读。</p>
      </div>
      <button class="ln-tool-btn${state.hideCollocMeaning ? " is-on" : ""}" type="button" data-ln-hide-meaning aria-pressed="${state.hideCollocMeaning}">${state.hideCollocMeaning ? "显示释义" : "遮住释义自测"}</button>
    </div>
    <div class="ln-colloc-list">
      ${list.map((item) => `
        <div class="ln-colloc-card">
          <div class="ln-colloc-head">
            <span class="ln-colloc-type">${esc(item.type)}</span>
            <button class="ln-mini-btn" type="button" data-say="${esc(item.phrase)}" title="听这个搭配">${SPEAKER_ICON}</button>
          </div>
          <b class="ln-colloc-phrase">${esc(item.phrase)}</b>
          <p class="ln-colloc-meaning${state.hideCollocMeaning ? " is-hidden" : ""}">${esc(item.meaning)}</p>
          ${item.restore ? `<p class="ln-colloc-restore">还原：${esc(item.restore)}</p>` : ""}
          ${item.example ? `<p class="ln-colloc-ex">${esc(item.example)}</p>` : ""}
          <span class="ln-colloc-sent">第 ${item.sentence || "—"} 句</span>
        </div>`).join("") || '<p class="ln-empty-line">本段没有提取到固定搭配。</p>'}
    </div>`;
  }

  /* ---------------- 语音现象 ---------------- */
  function speechHTML() {
    const counts = {};
    state.data.sentences.forEach((sentence) => {
      sentence.speech.forEach((feature) => {
        counts[feature.type] = (counts[feature.type] || 0) + 1;
      });
    });
    const types = Object.keys(SPEECH_TYPES).filter((type) => counts[type]).concat(
      Object.keys(counts).filter((type) => !SPEECH_TYPES[type])
    );
    const list = state.data.sentences
      .map((sentence, index) => ({ sentence, index }))
      .filter(({ sentence }) => {
        if (state.speechFilter === "all") return true;
        return sentence.speech.some((feature) => feature.type === state.speechFilter);
      });

    return `<div class="ln-speech-top">
      <div>
        <h3 class="ln-block-h">语音现象地图</h3>
        <p>先听懂「为什么会听错」，再回到句子里对照。点击类型可以只看相关句子。</p>
      </div>
      <div class="ln-filter-row">
        <button class="ln-filter${state.speechFilter === "all" ? " is-active" : ""}" type="button" data-ln-speech-filter="all">全部</button>
        ${types.map((type) => `<button class="ln-filter${state.speechFilter === type ? " is-active" : ""}" type="button" data-ln-speech-filter="${esc(type)}">${esc(type)} <em>${counts[type]}</em></button>`).join("")}
      </div>
    </div>
    <div class="ln-speech-legend">
      ${types.map((type) => `<span><i>${esc(type)}</i><em>${esc(SPEECH_TYPES[type] || "口语中的真实发音变化")}</em></span>`).join("")}
    </div>
    <div class="ln-speech-list">
      ${list.map(({ sentence, index }) => `
        <div class="ln-speech-sent">
          <div class="ln-speech-sent-head">
            <span>第 ${index + 1} 句</span>
            <button class="ln-mini-btn" type="button" data-ln-play-sent="${index}" title="播放本句">${SPEAKER_ICON}</button>
          </div>
          <p class="ln-speech-sent-text">${esc(sentence.text)}</p>
          ${sentence.speech.length ? `<div class="ln-speech-row">${sentence.speech.map((feature) => `
            <span class="ln-speech-item">
              <i class="ln-type" data-type="${esc(feature.type)}">${esc(feature.type)}</i>
              ${feature.text ? `<button class="ln-feature-say" type="button" data-say="${esc(feature.text)}" title="听这个语音片段">${esc(feature.text)}</button>` : ""}
              ${feature.note ? `<em>${esc(feature.note)}</em>` : ""}
            </span>`).join("")}</div>` : '<p class="ln-sent-note">本句按正常节奏朗读即可。</p>'}
          ${sentence.stress ? `<p class="ln-speech-stress">重音语调：${esc(sentence.stress)}</p>` : ""}
        </div>`).join("") || '<p class="ln-empty-line">这个类型下还没有句子。</p>'}
    </div>`;
  }

  /* ---------------- 听写训练 ---------------- */
  function dictLevelName(level) {
    return level === 1 ? "生词填空" : level === 2 ? "实词挖空" : "整句听写";
  }

  function dictTargets(sentence, level) {
    if (level === 1) {
      const vocab = state.data.vocab.filter((item) => item.sentence === sentence.id);
      return vocab.length ? vocab.map((item) => item.word) : [];
    }
    if (level === 2) {
      if (sentence.contentWords.length) return sentence.contentWords;
      const fallback = [];
      String(sentence.text).split(/\s+/).forEach((part) => {
        const word = cleanWord(part);
        if (word && word.length > 2 && !STOP_WORDS.has(word) && !fallback.includes(word)) fallback.push(word);
      });
      return fallback.slice(0, 6);
    }
    return [];
  }

  function buildDictTokens(sentence, level) {
    const targets = dictTargets(sentence, level);
    let fallbackTargets = null;
    const parts = String(sentence.text).split(/(\s+)/);
    let blanks = 0;
    const tokens = parts.map((raw) => {
      if (!raw) return null;
      if (/^\s+$/.test(raw)) return { raw, space: true };
      const answer = String(raw).replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "").replace(/[’]/g, "'");
      if (!answer) return { raw, word: false };
      let blank = false;
      if (level === 1 || level === 2) {
        blank = targets.some((target) => wordRelated(answer, target));
      }
      if (!blank && level === 1 && targets.length === 0) {
        if (!fallbackTargets) {
          fallbackTargets = [];
          String(sentence.text).split(/\s+/).forEach((part) => {
            const word = cleanWord(part);
            if (word && word.length > 2 && !STOP_WORDS.has(word)) fallbackTargets.push(word);
          });
        }
        blank = fallbackTargets.slice(0, 4).some((target) => wordRelated(answer, target));
      }
      let index = -1;
      if (blank) { index = blanks; blanks += 1; }
      return { raw, answer, blank, blankIndex: index };
    }).filter(Boolean);

    // 若 AI 给的生词/实词与本句词形都没匹配上，退回按实词随机挖空，避免出现空题
    if (!blanks && (level === 1 || level === 2)) {
      const fallback = tokens
        .filter((token) => token.answer && token.answer.length > 2 && !STOP_WORDS.has(cleanWord(token.answer)))
        .map((token) => token.answer)
        .filter((word, index, all) => all.indexOf(word) === index)
        .slice(0, 4);
      tokens.forEach((token) => {
        if (!token.blank && token.answer && fallback.some((target) => wordRelated(token.answer, target))) {
          token.blank = true;
          token.blankIndex = blanks;
          blanks += 1;
        }
      });
    }
    return { tokens, blanks };
  }

  function dictPromptHTML(sentence, level) {
    if (level === 3) {
      return `<textarea class="ln-dict-full" id="lnDictFull" rows="3" placeholder="听到什么就写什么，标点和大小写可以忽略…" spellcheck="false" aria-label="整句听写输入"></textarea>`;
    }
    const plan = buildDictTokens(sentence, level);
    if (!plan.blanks) {
      return `<p class="ln-dict-prompt ln-empty-line">这句没有可挖空的词，直接切到「整句听写」练完整句子。</p>`;
    }
    return `<p class="ln-dict-prompt">${plan.tokens.map((token) => {
      if (token.space) return token.raw;
      if (token.blank) {
        return `<span class="ln-blank-wrap"><input class="ln-blank" type="text" data-answer="${esc(token.answer)}" size="${Math.max(4, token.answer.length + 2)}" autocomplete="off" spellcheck="false" aria-label="填空 ${token.blankIndex + 1}"></span>`;
      }
      return `<span class="ln-dict-word">${esc(token.raw)}</span>`;
    }).join("")}</p>`;
  }

  function mistakesHTML() {
    const list = readMistakes().filter((item) => item.hash === state.hash).slice(0, 8);
    if (!list.length) return "";
    return `<section class="ln-mistakes" data-dict-mistakes>
      <div class="ln-mistakes-head"><h3 class="ln-block-h">听写错题本</h3><p>这些句子最容易漏听，点一下回到原句慢速重听。</p></div>
      <div class="ln-mistakes-list">
        ${list.map((item) => `<button class="ln-mistake" type="button" data-dict-jump="${item.index}">
          <b>第 ${item.index + 1} 句 · ${dictLevelName(item.level)}</b>
          <span>${esc(item.missed.join(" / "))}</span>
        </button>`).join("")}
      </div>
    </section>`;
  }

  function dictationHTML() {
    const total = state.data.sentences.length;
    const index = clamp(state.dict.index, 0, total - 1);
    state.dict.index = index;
    const sentence = state.data.sentences[index];
    const level = state.dict.level;
    const levelButtons = [1, 2, 3].map((value) => `<button class="ln-filter${level === value ? " is-active" : ""}" type="button" data-dict-level="${value}">${dictLevelName(value)}</button>`).join("");

    return `<div class="ln-dict">
      <div class="ln-dict-top">
        <div>
          <h3 class="ln-block-h">分级听写</h3>
          <p>先听再写：生词填空 → 实词挖空 → 整句听写。写错会自动进入错题本。</p>
        </div>
        <div class="ln-filter-row">${levelButtons}</div>
      </div>

      <div class="ln-dict-nav-row">
        <div class="ln-dict-nav">
          <button class="ln-tool-btn" type="button" data-dict-prev>上一句</button>
          <span class="ln-dict-counter">第 ${index + 1} / ${total} 句</span>
          <button class="ln-tool-btn" type="button" data-dict-next>下一句</button>
          <button class="ln-tool-btn" type="button" data-dict-random>随机一句</button>
        </div>
        <button class="ln-tool-btn" type="button" data-dict-play>播放本句</button>
      </div>

      <div class="ln-dict-card">
        <div class="ln-dict-card-head">
          <div>
            <span class="ln-dict-kicker">${dictLevelName(level)}</span>
            <p>${level === 3 ? "整句听写：尽量写出完整句子。" : "听不清就先慢速循环，再逐空填写。"}</p>
          </div>
          <div class="ln-dict-actions">
            <button class="ln-tool-btn" type="button" data-dict-play data-rate="0.6">慢速</button>
            <button class="ln-tool-btn" type="button" data-dict-show>显示原文</button>
          </div>
        </div>
        <div class="ln-dict-body">
          ${dictPromptHTML(sentence, level)}
        </div>
        <div class="ln-dict-foot">
          <button class="btn btn-primary" type="button" data-dict-check>检查答案</button>
          <button class="ln-text-btn" type="button" data-dict-reset>清空重写</button>
        </div>
        <div class="ln-dict-reveal" data-dict-reveal></div>
        <div class="ln-dict-feedback" data-dict-feedback></div>
      </div>

      ${mistakesHTML()}
    </div>`;
  }

  /* ---------------- 理解验证 ---------------- */
  function comprehensionHTML() {
    const quiz = state.data.comprehension;
    const retell = state.data.retell;
    const scenes = state.data.scenes;
    return `<div class="ln-verify">
      <div class="ln-verify-head">
        <div>
          <span class="ln-verify-kicker">先盲听，再作答</span>
          <h3 class="ln-block-h">听力理解小题</h3>
          <p>不看原文，先整段盲听一遍，再完成细节、主旨与推理题。</p>
        </div>
        <div class="ln-verify-actions">
          <button class="ln-tool-btn" type="button" data-ln-play-all>盲听整段</button>
          <button class="ln-tool-btn" type="button" data-ln-play-all data-rate="0.75">慢速盲听</button>
        </div>
      </div>

      <div class="ln-quiz-list">
        ${quiz.map((item, qIndex) => `
          <div class="ln-quiz" data-quiz="${qIndex}">
            <span class="ln-quiz-type">${esc(item.type)}</span>
            <p class="ln-quiz-q">${qIndex + 1}. ${esc(item.q)}</p>
            <div class="ln-options">
              ${item.options.map((option, oIndex) => `
                <label class="ln-option" data-opt="${oIndex}">
                  <input type="radio" name="lnq${qIndex}" value="${oIndex}" data-ln-quiz-answer="${qIndex}">
                  <span><i>${String.fromCharCode(65 + oIndex)}</i>${esc(option)}</span>
                </label>`).join("")}
            </div>
            <p class="ln-quiz-why is-hidden">${item.why ? esc(item.why) : ""}</p>
          </div>`).join("") || '<p class="ln-empty-line">这段原文没有生成理解题。</p>'}
      </div>

      <div class="ln-quiz-footer">
        <button class="btn btn-primary" type="button" data-ln-quiz-submit ${quiz.length ? "" : "disabled"}>提交答案</button>
        <button class="ln-text-btn" type="button" data-ln-quiz-retry>再测一次</button>
        <span class="ln-quiz-score" id="lnQuizScore"></span>
      </div>

      <section class="ln-retell">
        <div class="ln-retell-head">
          <div>
            <h3 class="ln-block-h">关键词复述</h3>
            <p>${esc(retell.prompt || "用下面的关键词，用自己的话复述这段内容。")}</p>
          </div>
          <button class="ln-tool-btn" type="button" data-ln-retell-start>开始 60 秒复述</button>
        </div>
        <div class="ln-retell-words">
          ${(retell.keywords.length ? retell.keywords : state.data.vocab.slice(0, 6).map((item) => item.word)).map((word) => `<button type="button" data-say="${esc(word)}">${esc(word)}</button>`).join("") || '<span class="ln-empty-line">暂无关键词</span>'}
        </div>
        <div class="ln-retell-clock" id="lnRetellClock">60s</div>
      </section>

      <section class="ln-scenes">
        <h3 class="ln-block-h">同场景拓展</h3>
        <p>把这段里的表达迁移到相似场景，听懂一次，会用一类。</p>
        <div class="ln-scene-list">
          ${scenes.map((item) => `
            <div class="ln-scene-card">
              <span class="ln-scene-name">${esc(item.scene)}</span>
              <div class="ln-scene-head">
                <b>${esc(item.phrase)}</b>
                <button class="ln-mini-btn" type="button" data-say="${esc(item.phrase)}" title="听这个表达">${SPEAKER_ICON}</button>
              </div>
              <p class="ln-scene-meaning">${esc(item.meaning)}</p>
              ${item.example ? `<p class="ln-scene-ex">${esc(item.example)}</p>` : ""}
            </div>`).join("") || '<p class="ln-empty-line">暂无同场景拓展。</p>'}
        </div>
      </section>
    </div>`;
  }

  /* ---------------- 组合渲染 ---------------- */
  function renderResult(data) {
    state.data = data;
    state.tab = "overview";
    state.blind = false;
    state.reveal = {};
    state.mastered = loadMastered(state.hash);
    state.randomIndex = -1;
    state.randomReveal = false;
    state.dict = { level: state.dict.level || 2, index: 0, checked: false };
    state.quiz = { submitted: false, answers: {} };
    state.speechFilter = "all";
    state.vocabFilter = "all";
    state.hideCollocMeaning = false;

    if (!output) return;
    output.innerHTML = `<div class="ln-result">
      ${topBarHTML()}
      ${tabsHTML()}
      <div class="ln-panels">
        <div class="ln-panel" data-panel="overview"${state.tab === "overview" ? "" : " hidden"}>${overviewHTML()}</div>
        <div class="ln-panel" data-panel="sentences"${state.tab === "sentences" ? "" : " hidden"}>${sentencesHTML()}</div>
        <div class="ln-panel" data-panel="vocab"${state.tab === "vocab" ? "" : " hidden"}>${vocabHTML()}</div>
        <div class="ln-panel" data-panel="collocations"${state.tab === "collocations" ? "" : " hidden"}>${collocationsHTML()}</div>
        <div class="ln-panel" data-panel="speech"${state.tab === "speech" ? "" : " hidden"}>${speechHTML()}</div>
        <div class="ln-panel" data-panel="dictation"${state.tab === "dictation" ? "" : " hidden"}>${dictationHTML()}</div>
        <div class="ln-panel" data-panel="comprehension"${state.tab === "comprehension" ? "" : " hidden"}>${comprehensionHTML()}</div>
      </div>
    </div>`;

    renderBookMini();
    if (window.innerWidth < 980) {
      output.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function panelEl(name) {
    return document.querySelector('.ln-panel[data-panel="' + name + '"]');
  }

  function refreshOverview() {
    const panel = panelEl("overview");
    if (panel) panel.innerHTML = overviewHTML();
  }

  function refreshVocab() {
    const panel = panelEl("vocab");
    if (panel) panel.innerHTML = vocabHTML();
  }

  function refreshSentences() {
    const panel = panelEl("sentences");
    if (panel) panel.innerHTML = sentencesHTML();
  }

  function refreshSpeech() {
    const panel = panelEl("speech");
    if (panel) panel.innerHTML = speechHTML();
  }

  function renderDictationPanel() {
    const panel = panelEl("dictation");
    if (panel) panel.innerHTML = dictationHTML();
  }

  function refreshBookViews() {
    renderBookMini();
    if (!state.data) return;
    refreshTabs();
    refreshVocab();
    refreshOverview();
  }

  function switchTab(tab) {
    if (!state.data || state.tab === tab && tab !== "overview") return;
    stopSpeech();
    clearRetellTimer();
    state.tab = tab;
    $$(".ln-tab").forEach((button) => {
      const active = button.dataset.lnTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$(".ln-panel").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
    if (tab === "overview") refreshOverview();
    if (tab === "vocab") refreshVocab();
    if (tab === "speech") refreshSpeech();
  }

  function renderBookMini() {
    const box = $("#listenBookMini");
    if (!box) return;
    const stats = notebookStats();
    if (!stats.total) {
      box.innerHTML = `<div class="ln-book-mini-head"><span>生词本</span><b>0 个</b></div>
        <p class="ln-book-mini-note">分析后点词卡上的「收藏」，生词会自动进入这里，支持随机复习。</p>`;
      return;
    }
    box.innerHTML = `<div class="ln-book-mini-head"><span>生词本</span><b>${stats.total} 个</b></div>
      <div class="ln-book-mini-row">
        <span>掌握 ${stats.mastered} · 模糊 ${stats.learning} · 待学 ${stats.total - stats.mastered - stats.learning}</span>
        <button class="ln-text-btn" type="button" data-book-review>随机复习</button>
      </div>`;
  }

  /* ---------------- 听写交互 ---------------- */
  function getDictSentence() {
    return state.data ? state.data.sentences[clamp(state.dict.index, 0, state.data.sentences.length - 1)] : null;
  }

  function checkDictation() {
    const sentence = getDictSentence();
    if (!sentence) return;
    const panel = panelEl("dictation");
    if (!panel) return;
    const feedback = panel.querySelector("[data-dict-feedback]");
    const level = state.dict.level;
    const missed = [];

    if (level === 3) {
      const input = panel.querySelector("#lnDictFull");
      if (!input) return;
      const user = String(input.value || "");
      const userWords = user.split(/\s+/).map(cleanWord).filter(Boolean);
      const targetWords = sentence.text.split(/\s+/).map(cleanWord).filter(Boolean);
      const matchedSet = new Set(userWords);
      let matched = 0;
      const diff = targetWords.map((word) => {
        const hit = matchedSet.has(word);
        if (hit) matched += 1;
        else missed.push(word);
        return hit ? `<span>${esc(word)}</span>` : `<span class="diff-miss">${esc(word)}</span>`;
      }).join(" ");
      const score = targetWords.length ? Math.round((matched / targetWords.length) * 100) : 0;
      if (feedback) {
        feedback.innerHTML = `<div class="ln-dict-result ${score >= 85 ? "is-good" : score >= 50 ? "is-mid" : "is-bad"}">
          <b>${score}%</b><span>${score >= 85 ? "几乎听全了" : score >= 50 ? "抓住了一半，再慢速听一遍" : "漏听较多，建议先看意群"}</span>
        </div>
        <div class="ln-diff"><b>逐词对照</b><p>${diff}</p><em>红色为漏听或写错的词</em></div>`;
      }
    } else {
      const inputs = Array.from(panel.querySelectorAll(".ln-blank"));
      if (!inputs.length) {
        if (feedback) {
          feedback.innerHTML = '<div class="ln-dict-result is-mid"><b>0 / 0</b><span>这一空没有可填的内容，请换一句或切到整句听写。</span></div>';
        }
        return;
      }
      let correct = 0;
      inputs.forEach((input) => {
        const answer = input.dataset.answer || "";
        const ok = normAnswer(input.value) === normAnswer(answer);
        if (ok) correct += 1;
        else missed.push(answer);
        input.classList.toggle("is-ok", ok);
        input.classList.toggle("is-bad", !ok);
        const wrap = input.closest(".ln-blank-wrap");
        if (wrap) {
          const old = wrap.querySelector(".ln-blank-answer");
          if (old) old.remove();
          if (!ok) wrap.insertAdjacentHTML("beforeend", `<span class="ln-blank-answer">${esc(answer)}</span>`);
        }
      });
      const total = inputs.length;
      const score = total ? Math.round((correct / total) * 100) : 0;
      if (feedback) {
        feedback.innerHTML = `<div class="ln-dict-result ${score === 100 ? "is-good" : score >= 50 ? "is-mid" : "is-bad"}">
          <b>${correct} / ${total}</b><span>${score === 100 ? "全部填对" : "红色空格旁是正确答案，再听一遍对应位置"}</span>
        </div>`;
      }
    }

    if (missed.length) addMistake(state.dict.index, level, missed);
    renderMistakesBox();
    state.dict.checked = true;
  }

  function renderMistakesBox() {
    const panel = panelEl("dictation");
    if (!panel) return;
    const old = panel.querySelector("[data-dict-mistakes]");
    if (old) old.remove();
    const html = mistakesHTML();
    if (html) panel.insertAdjacentHTML("beforeend", html);
  }

  function showDictAnswer() {
    const sentence = getDictSentence();
    const panel = panelEl("dictation");
    if (!sentence || !panel) return;
    const box = panel.querySelector("[data-dict-reveal]");
    if (!box) return;
    box.innerHTML = `<div class="ln-dict-answer"><b>原文</b><p>${esc(sentence.text)}</p><span>${esc(sentence.cn)}</span></div>`;
  }

  /* ---------------- 理解验证交互 ---------------- */
  function submitQuiz() {
    if (!state.data || state.quiz.submitted) return;
    const panel = panelEl("comprehension");
    if (!panel) return;
    const questions = state.data.comprehension;
    let correct = 0;
    let answered = 0;
    questions.forEach((item, qIndex) => {
      const selected = panel.querySelector('input[name="lnq' + qIndex + '"]:checked');
      const value = selected ? Number(selected.value) : -1;
      state.quiz.answers[qIndex] = value;
      if (value >= 0) answered += 1;
      if (value === item.answer) correct += 1;
      $$('.ln-quiz[data-quiz="' + qIndex + '"] .ln-option').forEach((label) => {
        const optionIndex = Number(label.dataset.opt);
        label.classList.toggle("is-correct", optionIndex === item.answer);
        label.classList.toggle("is-wrong", optionIndex === value && value !== item.answer);
      });
      const why = panel.querySelector('.ln-quiz[data-quiz="' + qIndex + '"] .ln-quiz-why');
      if (why) why.classList.remove("is-hidden");
      $$('input[name="lnq' + qIndex + '"]', panel).forEach((input) => { input.disabled = true; });
    });
    state.quiz.submitted = true;
    const score = document.getElementById("lnQuizScore");
    if (score) score.textContent = `答对 ${correct} / ${questions.length}（已作答 ${answered} 题）`;
    const submit = panel.querySelector("[data-ln-quiz-submit]");
    if (submit) submit.disabled = true;
  }

  function resetQuiz() {
    clearRetellTimer();
    state.quiz = { submitted: false, answers: {} };
    const panel = panelEl("comprehension");
    if (panel) panel.innerHTML = comprehensionHTML();
  }

  /* ---------------- 复述计时 ---------------- */
  function clearRetellTimer() {
    if (state.retellTimer) {
      clearInterval(state.retellTimer);
      state.retellTimer = null;
    }
    state.retellRemaining = 60;
    const panel = panelEl("comprehension");
    const clock = panel ? panel.querySelector("#lnRetellClock") : null;
    const button = panel ? panel.querySelector("[data-ln-retell-start]") : null;
    if (clock) {
      clock.textContent = "60s";
      clock.classList.remove("is-running");
    }
    if (button) {
      button.disabled = false;
      button.textContent = "开始 60 秒复述";
    }
  }

  function startRetell() {
    clearRetellTimer();
    const panel = panelEl("comprehension");
    const clock = panel ? panel.querySelector("#lnRetellClock") : null;
    const button = panel ? panel.querySelector("[data-ln-retell-start]") : null;
    if (!clock) return;
    state.retellRemaining = 60;
    clock.classList.add("is-running");
    if (button) {
      button.disabled = true;
      button.textContent = "复述中…";
    }
    const tick = () => {
      clock.textContent = state.retellRemaining + "s";
      if (state.retellRemaining <= 0) {
        clearRetellTimer();
        clock.classList.remove("is-running");
        clock.textContent = "时间到";
        if (button) {
          button.disabled = false;
          button.textContent = "再来一次";
        }
        return;
      }
      state.retellRemaining -= 1;
    };
    tick();
    state.retellTimer = setInterval(tick, 1000);
  }

  /* ---------------- 生词本复习弹层 ---------------- */
  function ensureReviewModal() {
    if ($("#lnReview")) return;
    const modal = document.createElement("div");
    modal.id = "lnReview";
    modal.className = "lnm";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="lnm-backdrop" data-lnm-close></div>
      <div class="lnm-panel" role="dialog" aria-modal="true" aria-labelledby="lnmWord">
        <div class="lnm-head">
          <div>
            <span class="lnm-kicker">生词本 · 随机复习</span>
            <h3 id="lnmProgress">—</h3>
          </div>
          <button class="lnm-close" type="button" data-lnm-close aria-label="关闭">×</button>
        </div>
        <div class="lnm-stage">
          <div class="lnm-card" id="lnmCard" role="button" tabindex="0" aria-label="翻面">
            <div class="lnm-face lnm-front">
              <span class="lnm-tag">WORD</span>
              <b class="lnm-word" id="lnmWord">—</b>
              <span class="lnm-phon" id="lnmPhon"></span>
              <span class="lnm-hint">点击翻面看释义</span>
            </div>
            <div class="lnm-face lnm-back">
              <span class="lnm-tag">MEANING</span>
              <b class="lnm-meaning" id="lnmMeaning">—</b>
              <span class="lnm-ctx" id="lnmCtx"></span>
              <span class="lnm-status" id="lnmStatus"></span>
            </div>
          </div>
        </div>
        <div class="lnm-actions" id="lnmRate">
          <button class="lnm-rate is-bad" type="button" data-lnm-rate="new">不认识</button>
          <button class="lnm-rate is-mid" type="button" data-lnm-rate="learning">有点印象</button>
          <button class="lnm-rate is-good" type="button" data-lnm-rate="mastered">认识</button>
        </div>
        <div class="lnm-nav" id="lnmNav" hidden>
          <button class="btn btn-ghost" type="button" data-lnm-close>完成</button>
        </div>
        <div class="lnm-foot">
          <button class="lnm-flip" type="button" data-lnm-flip>翻面</button>
          <span class="lnm-count" id="lnmCount">1 / 1</span>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-lnm-close]")) { closeReview(); return; }
      const rate = event.target.closest("[data-lnm-rate]");
      if (rate && !state.review.done) { rateReview(rate.dataset.lnmRate); return; }
      if (event.target.closest("[data-lnm-flip]")) { flipReview(); return; }
      if (event.target.closest("#lnmCard")) { flipReview(); }
    });
  }

  function openReview() {
    ensureReviewModal();
    if (!state.notebook.length) return;
    const items = state.notebook.slice().sort(() => Math.random() - 0.5);
    state.review = { items, index: 0, flipped: false, done: false };
    const modal = $("#lnReview");
    modal.hidden = false;
    document.body.classList.add("lnm-open");
    renderReviewCard();
  }

  function renderReviewCard() {
    const modal = $("#lnReview");
    if (!modal) return;
    const review = state.review;
    const item = review.items[review.index];
    const done = review.done;
    const card = $("#lnmCard", modal);
    if (card) card.classList.toggle("is-flipped", review.flipped);
    $("#lnmWord", modal).textContent = done ? "本轮完成" : (item ? item.word : "—");
    $("#lnmPhon", modal).textContent = done ? "" : (item ? item.phonetic : "");
    $("#lnmMeaning", modal).textContent = done ? `已复习 ${review.items.length} 个生词` : (item ? (item.cn || "—") : "—");
    $("#lnmCtx", modal).textContent = done ? "掌握状态已更新，下一轮会重新打乱顺序。" : (item && item.ctx ? "语境：" + item.ctx : "");
    const statusEl = $("#lnmStatus", modal);
    if (statusEl) {
      if (done || !item) statusEl.textContent = "";
      else {
        const meta = BOOK_STATUS[item.status] || BOOK_STATUS.new;
        statusEl.textContent = meta.label + (item.reviews ? " · 已复习 " + item.reviews + " 次" : "");
        statusEl.className = "lnm-status " + meta.cls;
      }
    }
    const rate = $("#lnmRate", modal);
    if (rate) rate.hidden = done;
    const nav = $("#lnmNav", modal);
    if (nav) nav.hidden = !done;
    $("#lnmProgress", modal).textContent = done ? "随机复习完成" : `第 ${review.index + 1} / ${review.items.length} 个`;
    const count = $("#lnmCount", modal);
    if (count) count.textContent = done ? "完成" : `${review.index + 1} / ${review.items.length}`;
    const flip = $("[data-lnm-flip]", modal);
    if (flip) flip.textContent = review.flipped ? "回到单词" : "翻面";
  }

  function flipReview() {
    if (state.review.done) return;
    state.review.flipped = !state.review.flipped;
    renderReviewCard();
  }

  function rateReview(status) {
    if (!BOOK_STATUS[status] || state.review.done) return;
    const item = state.review.items[state.review.index];
    if (!item) return;
    const entry = state.notebook.find((bookItem) => bookItem.word === item.word);
    if (entry) {
      entry.status = status;
      entry.reviews = (entry.reviews || 0) + 1;
      entry.lastReview = Date.now();
      persistNotebook();
      refreshBookViews();
    }
    if (state.review.index >= state.review.items.length - 1) {
      state.review.done = true;
      state.review.flipped = false;
    } else {
      state.review.index += 1;
      state.review.flipped = false;
    }
    renderReviewCard();
  }

  function closeReview() {
    const modal = $("#lnReview");
    if (modal) modal.hidden = true;
    document.body.classList.remove("lnm-open");
    refreshBookViews();
  }

  /* ---------------- 分析主流程 ---------------- */
  function renderLoading(text) {
    if (!output) return;
    output.innerHTML = `<div class="ln-loading">
      <div class="loading-head"><span class="spinner"></span>正在把这段原文拆成听透方案…</div>
      <p class="ln-loading-copy">${esc(text.slice(0, 160))}${text.length > 160 ? "…" : ""}</p>
      <div class="ln-loading-steps">
        <span class="is-active">扫清生词</span>
        <span>拆解语音</span>
        <span>生成听写</span>
        <span>理解验证</span>
      </div>
      <div class="shimmer tall"></div>
      <div class="shimmer s1"></div>
      <div class="shimmer s2"></div>
      <div class="shimmer s3"></div>
    </div>`;
  }

  function renderError(message, retry) {
    if (!output) return;
    output.innerHTML = `<div class="state-error">
      <span class="err-badge">生成失败</span>
      <h3>这次没能拆出来</h3>
      <p>${esc(message)}</p>
      ${retry === false ? "" : '<button class="btn btn-primary" type="button" data-ln-retry>重新生成</button>'}
    </div>`;
  }

  function renderEmpty() {
    if (!output) return;
    output.innerHTML = `<div class="state-empty">
      <div class="empty-art">听</div>
      <h2 class="empty-title">先听一遍，再逐句拆透</h2>
      <p>把一段台词、博客或听力原文交给 AI，它会整理出生词、固定搭配、语音现象与精听训练。</p>
      <p class="empty-note">左侧选一段示例，或直接粘贴你正在学的原文。</p>
    </div>`;
  }

  function setBusy(value) {
    state.busy = value;
    const button = $("#listenBtn");
    if (button) button.disabled = value;
    const clear = $("#listenClearBtn");
    if (clear) clear.disabled = value;
    $$(".ln-source-chip").forEach((chip) => { chip.disabled = value; });
  }

  async function requestPlanWithRetry(text) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return normalizePlan(await callPlan(text));
      } catch (err) {
        lastError = err;
        if (/401|402|429|abort|timeout|failed to fetch|network/i.test(String(err && err.message))) throw err;
      }
    }
    throw lastError || new Error("AI 返回的结构不符合预期");
  }

  async function runListen(rawText, options) {
    if (state.busy) return;
    const opts = options || {};
    const text = normalizeText(rawText);
    if (!text) { renderError("请先粘贴一段英文原文。", false); return; }
    if (!/[A-Za-z]/.test(text)) { renderError("这段里没有英文内容，请检查输入。", false); return; }
    if (text.length > 1500) { renderError("原文太长了，请控制在 1500 个字符以内（约 12 句）。", false); return; }

    stopSpeech();
    clearRetellTimer();
    state.text = text;
    state.hash = hashText(text.toLowerCase());
    const input = $("#listenInput");
    if (input && normalizeText(input.value) !== text) input.value = text;

    const cache = readCache()[state.hash];
    if (cache && cache.data && !opts.force) {
      try {
        state.data = normalizePlan(cache.data);
        renderResult(state.data);
        return;
      } catch (e) { /* 缓存损坏，重新生成 */ }
    }

    setBusy(true);
    renderLoading(text);
    try {
      const data = await requestPlanWithRetry(text);
      state.data = data;
      writeCache(state.hash, text, data);
      renderResult(data);
    } catch (err) {
      renderError(describeError(err));
    } finally {
      setBusy(false);
      if (window.innerWidth < 980) output.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function updateInputCount() {
    const input = $("#listenInput");
    const counter = $("#listenCount");
    if (input && counter) counter.textContent = input.value.length + " / 1500";
  }

  /* ---------------- 点击事件 ---------------- */
  function bindOutputEvents() {
    if (!output) return;

    output.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("[data-ln-speed]")) {
        state.speed = Number(target.value) || 1;
        return;
      }
      if (target.matches("[data-ln-accent]")) {
        state.accent = target.value === "uk" ? "uk" : "us";
        refreshVoices();
        return;
      }
      const quizAnswer = target.closest("[data-ln-quiz-answer]");
      if (quizAnswer) {
        state.quiz.answers[Number(quizAnswer.dataset.lnQuizAnswer)] = Number(quizAnswer.value);
      }
    });

    output.addEventListener("click", (event) => {
      const target = event.target;
      const closest = (selector) => target.closest(selector);

      const tab = closest("[data-ln-tab]");
      if (tab) { switchTab(tab.dataset.lnTab); return; }

      const goto = closest("[data-ln-goto]");
      if (goto) { switchTab(goto.dataset.lnGoto); return; }

      if (closest("[data-ln-stop]")) { stopSpeech(); return; }

      if (closest("[data-ln-blind]")) {
        state.blind = !state.blind;
        stopSpeech();
        const button = document.querySelector("[data-ln-blind]");
        if (button) {
          button.classList.toggle("is-on", state.blind);
          button.setAttribute("aria-pressed", String(state.blind));
        }
        refreshSentences();
        return;
      }

      if (closest("[data-ln-shuffle]")) { randomListen(); return; }
      if (closest("[data-ln-shuffle-close]")) {
        state.randomIndex = -1;
        refreshSentences();
        return;
      }
      if (closest("[data-ln-focus-reveal]")) {
        state.randomReveal = !state.randomReveal;
        refreshSentences();
        return;
      }

      if (closest("[data-ln-shadow-all]")) { shadowAll(); return; }

      const playSent = closest("[data-ln-play-sent]");
      if (playSent) {
        const index = Number(playSent.dataset.lnPlaySent);
        const rate = playSent.dataset.rate ? Number(playSent.dataset.rate) : state.speed;
        playSentence(index, rate);
        return;
      }

      const chunkBtn = closest("[data-ln-play-chunks]");
      if (chunkBtn) { playChunks(Number(chunkBtn.dataset.lnPlayChunks)); return; }

      const shadowSent = closest("[data-ln-shadow-sent]");
      if (shadowSent) { shadowSentence(Number(shadowSent.dataset.lnShadowSent)); return; }

      const toggleCn = closest("[data-ln-toggle-cn]");
      if (toggleCn) {
        const index = Number(toggleCn.dataset.lnToggleCn);
        const card = document.querySelector('.ln-sent[data-sent="' + index + '"]');
        const cn = card ? card.querySelector(".ln-sent-cn") : null;
        if (cn) {
          const hidden = cn.classList.toggle("is-hidden");
          toggleCn.textContent = hidden ? "译文" : "隐藏译文";
        }
        return;
      }

      const reveal = closest("[data-ln-reveal]");
      if (reveal) {
        state.reveal[Number(reveal.dataset.lnReveal)] = !state.reveal[Number(reveal.dataset.lnReveal)];
        refreshSentences();
        return;
      }

      const master = closest("[data-ln-master]");
      if (master) {
        const index = Number(master.dataset.lnMaster);
        state.mastered[index] = !state.mastered[index];
        if (!state.mastered[index]) delete state.mastered[index];
        saveMastered();
        master.classList.toggle("is-on", !!state.mastered[index]);
        master.setAttribute("aria-pressed", String(!!state.mastered[index]));
        master.textContent = state.mastered[index] ? "已听懂" : "标记听懂";
        if (state.tab === "overview") refreshOverview();
        return;
      }

      const book = closest("[data-ln-book]");
      if (book) { toggleBookWord(book.dataset.lnBook); return; }

      if (closest("[data-book-review]")) { openReview(); return; }

      const bookRemove = closest("[data-book-remove]");
      if (bookRemove) { removeBookWord(bookRemove.dataset.bookRemove); return; }

      const vocabFilter = closest("[data-ln-vocab-filter]");
      if (vocabFilter) {
        state.vocabFilter = vocabFilter.dataset.lnVocabFilter;
        refreshVocab();
        return;
      }

      const speechFilter = closest("[data-ln-speech-filter]");
      if (speechFilter) {
        state.speechFilter = speechFilter.dataset.lnSpeechFilter;
        refreshSpeech();
        return;
      }

      if (closest("[data-ln-hide-meaning]")) {
        state.hideCollocMeaning = !state.hideCollocMeaning;
        const panel = panelEl("collocations");
        if (panel) panel.innerHTML = collocationsHTML();
        return;
      }

      if (closest("[data-ln-toggle-overall]")) {
        const panel = panelEl("overview");
        const cn = panel ? panel.querySelector(".ln-overall-cn") : null;
        if (cn) cn.classList.toggle("is-hidden");
        return;
      }

      const dictLevel = closest("[data-dict-level]");
      if (dictLevel) {
        state.dict.level = Number(dictLevel.dataset.dictLevel) || 2;
        state.dict.checked = false;
        stopSpeech();
        renderDictationPanel();
        return;
      }

      if (closest("[data-dict-prev]")) {
        state.dict.index = (state.dict.index - 1 + state.data.sentences.length) % state.data.sentences.length;
        state.dict.checked = false;
        stopSpeech();
        renderDictationPanel();
        return;
      }

      if (closest("[data-dict-next]")) {
        state.dict.index = (state.dict.index + 1) % state.data.sentences.length;
        state.dict.checked = false;
        stopSpeech();
        renderDictationPanel();
        return;
      }

      if (closest("[data-dict-random]")) {
        const total = state.data.sentences.length;
        let next = Math.floor(Math.random() * total);
        if (total > 1 && next === state.dict.index) next = (next + 1) % total;
        state.dict.index = next;
        state.dict.checked = false;
        stopSpeech();
        renderDictationPanel();
        return;
      }

      const dictPlay = closest("[data-dict-play]");
      if (dictPlay) {
        const sentence = getDictSentence();
        if (sentence) playSentence(state.dict.index, dictPlay.dataset.rate ? Number(dictPlay.dataset.rate) : state.speed);
        return;
      }

      if (closest("[data-dict-check]")) { checkDictation(); return; }

      if (closest("[data-dict-show]")) { showDictAnswer(); return; }

      if (closest("[data-dict-reset]")) {
        const panel = panelEl("dictation");
        if (panel) {
          const feedback = panel.querySelector("[data-dict-feedback]");
          if (feedback) feedback.innerHTML = "";
          $$(".ln-blank", panel).forEach((input) => {
            input.value = "";
            input.classList.remove("is-ok", "is-bad");
            const wrap = input.closest(".ln-blank-wrap");
            const old = wrap ? wrap.querySelector(".ln-blank-answer") : null;
            if (old) old.remove();
          });
          const full = panel.querySelector("#lnDictFull");
          if (full) full.value = "";
        }
        return;
      }

      const dictJump = closest("[data-dict-jump]");
      if (dictJump) {
        state.dict.index = Number(dictJump.dataset.dictJump) || 0;
        state.dict.checked = false;
        stopSpeech();
        renderDictationPanel();
        playSentence(state.dict.index, 0.6);
        return;
      }

      if (closest("[data-ln-play-all]")) {
        const button = closest("[data-ln-play-all]");
        playAll(button.dataset.rate ? Number(button.dataset.rate) : state.speed);
        return;
      }

      if (closest("[data-ln-quiz-submit]")) { submitQuiz(); return; }
      if (closest("[data-ln-quiz-retry]")) { resetQuiz(); return; }
      if (closest("[data-ln-retell-start]")) { startRetell(); return; }

      if (closest("[data-ln-retry]")) { if (state.text) runListen(state.text, { force: true }); return; }

      const say = closest("[data-say]");
      if (say) {
        const text = say.dataset.say;
        if (text) {
          stopSpeech();
          speak(text, 0.86);
        }
      }
    });
  }

  function randomListen() {
    if (!state.data) return;
    const total = state.data.sentences.length;
    if (!total) return;
    let index = Math.floor(Math.random() * total);
    if (total > 1 && index === state.randomIndex) index = (index + 1) % total;
    state.randomIndex = index;
    state.randomReveal = false;
    if (state.tab !== "sentences") switchTab("sentences");
    refreshSentences();
    const focus = document.querySelector(".ln-focus");
    if (focus) focus.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => playSentence(index, state.speed), 360);
  }

  /* ---------------- 输入区事件 ---------------- */
  function bindInputEvents() {
    const input = $("#listenInput");
    if (input) {
      input.addEventListener("input", updateInputCount);
      input.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          runListen(input.value);
        }
      });
    }

    const button = $("#listenBtn");
    if (button && input) button.addEventListener("click", () => runListen(input.value));

    const clear = $("#listenClearBtn");
    if (clear && input) {
      clear.addEventListener("click", () => {
        input.value = "";
        updateInputCount();
        input.focus();
        if (!state.busy) renderEmpty();
      });
    }

    $$(".ln-source-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (!input) return;
        input.value = chip.dataset.sample || "";
        updateInputCount();
        runListen(input.value);
      });
    });

    const mini = $("#listenBookMini");
    if (mini) {
      mini.addEventListener("click", (event) => {
        if (event.target.closest("[data-book-review]")) openReview();
      });
    }
  }

  function bindGlobalEvents() {
    document.addEventListener("keydown", (event) => {
      const modal = $("#lnReview");
      if (!modal || modal.hidden) return;
      if (event.key === "Escape") closeReview();
      else if (event.key === "ArrowLeft") { /* 复习不倒退 */ }
      else if (event.key === " " || event.key === "Enter") {
        if (event.target && event.target.tagName === "BUTTON") return;
        event.preventDefault();
        flipReview();
      }
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    if (!output) return;
    refreshVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
    bindInputEvents();
    bindOutputEvents();
    bindGlobalEvents();
    renderBookMini();
    updateInputCount();
    renderEmpty();

    const text = new URLSearchParams(location.search).get("t");
    if (text) {
      const input = $("#listenInput");
      if (input) input.value = text;
      updateInputCount();
      runListen(text);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.LinguaListen = {
    analyze: runListen,
    state
  };
})();
