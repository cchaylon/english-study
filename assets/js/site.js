/* ============================================================
   LINGUA · 站点交互
   目录筛选 / 课程页渲染 / 章节页目录 / 学习进度 / 自测题
   ============================================================ */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ICONS = {
    play: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.6v10.8c0 .5.6.9 1 .6l8.4-5.4c.4-.3.4-.9 0-1.2L5 2c-.4-.3-1 .1-1 .6z"/></svg>',
    clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.3 1.4" stroke-linecap="round"/></svg>',
    layers: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 2 1.8 5.2 8 8.4l6.2-3.2L8 2Z" stroke-linejoin="round"/><path d="m2 8.6 6 3 6-3M2 11.8l6 3 6-3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 8h9M8.4 4.2 12.2 8l-3.8 3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 8.4 3.2 3.2L13 4.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="m10.6 10.6 3 3" stroke-linecap="round"/></svg>'
  };

  /* ---------- 全局明暗主题 ---------- */
  function initTheme() {
    const root = document.documentElement;
    const btn = $("[data-theme-toggle]");
    const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    const readStored = () => {
      try { return localStorage.getItem("lingua.theme"); } catch (e) { return null; }
    };
    const writeStored = (value) => {
      try { localStorage.setItem("lingua.theme", value); } catch (e) { /* 忽略隐私模式限制 */ }
    };

    const isDark = () => root.getAttribute("data-theme") === "dark";

    const paint = () => {
      if (!btn) return;
      const dark = isDark();
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "切换到浅色模式" : "切换到深色模式");
      btn.title = dark ? "切换到浅色模式" : "切换到深色模式";
    };

    const apply = (dark) => {
      root.setAttribute("data-theme", dark ? "dark" : "light");
      paint();
    };

    // 页面 head 里的初始化脚本通常会先写入，缺失时在这里兜底
    if (!root.getAttribute("data-theme")) {
      const saved = readStored();
      apply(saved ? saved === "dark" : Boolean(media && media.matches));
    } else {
      paint();
    }

    if (btn) {
      btn.addEventListener("click", () => {
        const next = !isDark();
        apply(next);
        writeStored(next ? "dark" : "light");
      });
    }

    // 未手动选择过时，跟随系统主题变化
    if (media) {
      const onChange = (e) => { if (!readStored()) apply(e.matches); };
      if (media.addEventListener) media.addEventListener("change", onChange);
      else if (media.addListener) media.addListener(onChange);
    }
  }

  /* ---------- 移动端导航 ---------- */
  function initMobileNav() {
    const toggle = $(".nav-toggle");
    const nav = $(".main-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  /* ---------- 首页目录 ---------- */
  function initCatalog() {
    const grid = $("#courseGrid");
    if (!grid) return;

    const searchInput = $("#courseSearch");
    const chips = $$("#levelChips .chip");
    const countEl = $("#catalogCount");
    let activeLevel = "ALL";

    const render = () => {
      const keyword = (searchInput ? searchInput.value : "").trim().toLowerCase();
      const items = COURSES.filter((c) => {
        const levelOK = activeLevel === "ALL" || c.level === activeLevel;
        if (!levelOK) return false;
        if (!keyword) return true;
        const haystack = [
          String(c.id),
          c.title,
          c.series,
          c.level,
          c.desc,
          c.tags.join(" "),
          c.lessons.map((l) => l.title).join(" ")
        ].join(" ").toLowerCase();
        return haystack.includes(keyword);
      });

      grid.innerHTML = items.length
        ? items.map(courseCard).join("")
        : '<div class="empty-state"><b>没有找到相关课程</b>试试其他关键词，或切换等级筛选。</div>';

      if (countEl) countEl.textContent = `显示 ${items.length} / ${COURSES.length} 门课程`;
    };

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        activeLevel = chip.dataset.level || "ALL";
        chips.forEach((c) => c.classList.toggle("is-active", c === chip));
        render();
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", render);
      const jump = $("[data-search-jump]");
      if (jump) {
        jump.addEventListener("click", (e) => {
          e.preventDefault();
          $("#catalog").scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => searchInput.focus(), 480);
        });
      }
    }

    const params = new URLSearchParams(location.search);
    const lv = params.get("level");
    if (lv) {
      const target = chips.find((c) => c.dataset.level === lv.toUpperCase());
      if (target) target.click();
      else render();
    } else {
      render();
    }
  }

  function courseCard(c) {
    const color = LEVEL_COLOR[c.level] || "#1e5a4a";
    return `
      <a class="course-card" href="course.html?id=${c.id}" style="--lv:${color}" data-level="${c.level}">
        <div class="course-top">
          <span class="course-no">COURSE ${c.id}</span>
          <span class="badge">${c.level}</span>
        </div>
        <span class="course-series">${c.series}</span>
        <h3>${c.title}</h3>
        <p>${c.desc}</p>
        <div class="course-meta">
          <em>${ICONS.layers}${c.lessons.length} 课时</em>
          <em>${ICONS.play}${c.format}</em>
        </div>
        <div class="course-link">
          <span>进入课程 <span class="status">· ${c.status}</span></span>
          <span class="arrow">→</span>
        </div>
      </a>`;
  }

  /* ---------- 课程详情页 ---------- */
  function initCoursePage() {
    const root = $("#courseDetail");
    if (!root) return;

    const id = Number(new URLSearchParams(location.search).get("id"));
    const course = COURSES.find((c) => c.id === id);

    if (!course) {
      root.innerHTML = `
        <div class="container" style="padding:90px 28px">
          <div class="empty-state">
            <b>课程不存在</b>
            请从课程目录重新选择，或返回首页浏览全部课程。
            <p style="margin-top:18px"><a class="btn btn-primary" href="index.html#catalog">返回课程目录</a></p>
          </div>
        </div>`;
      document.title = "课程不存在 · LINGUA";
      return;
    }

    const color = LEVEL_COLOR[course.level] || "#1e5a4a";
    document.title = `${course.title} · ${course.series} · LINGUA`;
    root.style.setProperty("--lv", color);

    const hasDetail = course.lessons.some((l) => l.href);
    const facts = `
      <div class="fact"><span>课时</span><b>${course.lessons.length}<i>讲</i></b></div>
      <div class="fact"><span>等级</span><b>${course.level}</b></div>
      <div class="fact"><span>状态</span><b style="font-size:16px">${course.status}</b></div>`;

    const lessonRows = course.lessons.map((l) => {
      const pending = l.pending || l.fmt === "待补";
      const inner = `
        <span class="idx">${String(l.n).padStart(2, "0")}</span>
        <span class="icon">${ICONS.play}</span>
        <span class="info">
          <b>${l.title}</b>
          ${l.summary ? `<span>${l.summary}</span>` : `<span>${course.series} · 第 ${l.n} 讲</span>`}
        </span>
        ${pending ? '<span class="fmt">待补</span>' : `<span class="fmt">${l.fmt}</span>`}
        ${l.href ? `<span class="enter">开始学习 ${ICONS.arrow}</span>` : ""}`;

      if (l.href) return `<a class="lesson-row" href="${l.href}">${inner}</a>`;
      return `<div class="lesson-row${pending ? " is-pending" : ""}">${inner}</div>`;
    }).join("");

    root.innerHTML = `
      <section class="course-hero">
        <div class="container">
          <nav class="breadcrumb">
            <a href="index.html">首页</a><span class="sep">/</span>
            <a href="index.html#catalog">课程目录</a><span class="sep">/</span>
            <span>${course.series}</span>
          </nav>
          <div class="course-hero-grid">
            <div>
              <span class="course-series-line">${course.series} · COURSE ${course.id}</span>
              <h1>${course.title}</h1>
              <p class="lede">${course.desc}</p>
              <div class="hero-tags">${course.tags.map((t) => `<span>${t}</span>`).join("")}</div>
            </div>
            <div class="course-facts">${facts}</div>
          </div>
        </div>
      </section>

      <section class="course-body">
        <div class="container course-layout">
          <div>
            <div class="lessons-head">
              <h2>课程目录</h2>
              <span>${hasDetail ? "本章节支持在线图文精讲" : "视频资料已整理，按讲次排列"}</span>
            </div>
            <div class="lesson-list">${lessonRows}</div>
          </div>

          <aside class="course-side">
            <div class="side-card">
              <h3>课程信息</h3>
              <div class="side-list">
                <div><span>所属阶段</span><b>${course.series}</b></div>
                <div><span>课程编号</span><b>No.${course.id}</b></div>
                <div><span>课程形式</span><b>${course.format}</b></div>
                <div><span>课时数量</span><b>${course.lessons.length} 讲</b></div>
                <div><span>学习状态</span><b>${course.status}</b></div>
              </div>
            </div>
            <div class="side-card">
              <h3>学习建议</h3>
              <p>${suggestion(course)}</p>
            </div>
            ${hasDetail ? `<div class="side-card">
              <h3>推荐入口</h3>
              <p>从第 1 讲开始，按顺序完成 8 个章节；每讲附有知识地图、例句与自测题。</p>
              <p style="margin-top:14px"><a class="btn btn-primary" style="width:100%" href="${course.lessons[0].href}">进入第 1 讲 ${ICONS.arrow}</a></p>
            </div>` : ""}
          </aside>
        </div>
      </section>`;
  }

  function suggestion(course) {
    const map = {
      A1: "A1 阶段重输入与模仿：先听清、读准，再动笔。建议按课程顺序学习，每讲配合课后复述。",
      A2: "A2 阶段开始从“会认”走向“会用”。学完每个专项后，用 3–5 句话复述要点，并整理自己的例句。",
      B1: "B1 阶段需要真实语料支撑。建议新闻、美剧、原著与词汇课交替推进，保持每天稳定的输入量。",
      B2: "B2 阶段强调输出质量。外刊阅读与学术写作可以同步进行，把读到的结构迁移到自己的表达中。",
      C1: "C1 阶段聚焦高难度文本与公开表达。建议以题型和篇章为单位复盘，并录音检查演讲的逻辑与节奏。"
    };
    return map[course.level] || "按讲次顺序学习，并配合笔记与复盘。";
  }

  /* ---------- 章节学习页 ---------- */
  function initLesson() {
    const main = $(".lesson-main");
    if (!main) return;

    const lessonNo = Number(document.body.dataset.lesson || 1);
    const total = GRAMMAR_CHAPTERS.length;
    const storageKey = "lingua.grammar.progress";

    const readProgress = () => {
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey) || "[]");
        return Array.isArray(raw) ? raw.filter((n) => n >= 1 && n <= total) : [];
      } catch (e) {
        return [];
      }
    };
    const writeProgress = (list) => {
      try { localStorage.setItem(storageKey, JSON.stringify(list)); } catch (e) { /* 忽略隐私模式限制 */ }
    };

    let done = readProgress();
    const btn = $(".complete-btn");

    const paintProgress = () => {
      const count = done.length;
      const bar = $(".sidebar-progress .sp-bar i");
      const label = $(".sidebar-progress .sp-count");
      if (bar) bar.style.width = `${(count / total) * 100}%`;
      if (label) label.textContent = `${count} / ${total}`;
      $$(".chapter-nav a").forEach((a) => {
        const n = Number(a.dataset.chapter);
        a.classList.toggle("is-done", done.includes(n));
      });
      if (btn) {
        const isDone = done.includes(lessonNo);
        btn.classList.toggle("is-done", isDone);
        btn.innerHTML = isDone ? `${ICONS.check} 已完成本讲` : `${ICONS.check} 标记为已学完`;
      }
    };

    if (btn) {
      btn.addEventListener("click", () => {
        if (done.includes(lessonNo)) done = done.filter((n) => n !== lessonNo);
        else done = done.concat(lessonNo).sort((a, b) => a - b);
        writeProgress(done);
        paintProgress();
      });
    }

    paintProgress();

    /* 本页目录 */
    const toc = $("#pageToc");
    if (toc) {
      const headings = $$("h2[id], h3[id]", main);
      toc.innerHTML = headings.map((h) => {
        const level = h.tagName === "H2" ? "lv2" : "lv3";
        return `<a class="${level}" href="#${h.id}">${h.textContent.replace(/^[A-Z]\d+[.、\s]*/, "")}</a>`;
      }).join("");

      const links = $$("a", toc);
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === `#${entry.target.id}`));
        });
      }, { rootMargin: "-90px 0px -70% 0px", threshold: 0 });
      headings.forEach((h) => observer.observe(h));
    }

    /* 自测题 */
    const quizItems = $$(".quiz-item");
    let answered = 0;
    let correct = 0;

    quizItems.forEach((item) => {
      const answer = item.dataset.answer;
      const explain = $(".quiz-explain", item);
      $$(".quiz-opt", item).forEach((opt) => {
        opt.addEventListener("click", () => {
          if (item.dataset.done) return;
          item.dataset.done = "1";
          answered += 1;
          const picked = opt.dataset.opt;
          const right = picked === answer;
          if (right) correct += 1;
          $$(".quiz-opt", item).forEach((o) => {
            o.disabled = true;
            if (o.dataset.opt === answer) o.classList.add("is-correct");
            else if (o === opt) o.classList.add("is-wrong");
          });
          if (explain) explain.classList.add("show");

          const score = $(".quiz-score");
          if (score && answered === quizItems.length) {
            score.classList.add("show");
            score.textContent = `本讲自测完成：答对 ${correct} / ${quizItems.length} 题。${correct === quizItems.length ? "全部正确，可以进入下一讲。" : "建议回看错题对应的知识点，再进入下一讲。"}`;
          }
        });
      });
    });

    /* 顶部学习进度：已访问即记录 */
    if (!done.includes(lessonNo)) {
      // 仅标记“访问过”，不自动记为完成；进度环仍以手动标记为准
    }

    /* 键盘左右切换 */
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea")) return;
      const prev = $(".pager-link.prev");
      const next = $(".pager-link.next");
      if (e.key === "ArrowLeft" && prev && !prev.classList.contains("is-disabled")) location.href = prev.href;
      if (e.key === "ArrowRight" && next && !next.classList.contains("is-disabled")) location.href = next.href;
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initMobileNav();
    initCatalog();
    initCoursePage();
    initLesson();
  });
})();
