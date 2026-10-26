/* ============================================================
   LINGUA · 课程数据
   课程按编号 20 → 38 排列；课时信息整理自课程目录
   ============================================================ */

const LEVELS = [
  {
    code: "A1",
    name: "务实基础",
    color: "#5f8a70",
    desc: "发音、词汇与语法地基，完成从零到入门的跨越。"
  },
  {
    code: "A2",
    name: "超能飞越",
    color: "#2f7a68",
    desc: "听说读写专项推进，把知识转化为实际运用。"
  },
  {
    code: "B1",
    name: "炉火纯青",
    color: "#3c6785",
    desc: "真实语料与正式场景，建立稳定输出能力。"
  },
  {
    code: "B2",
    name: "融会贯通",
    color: "#b2782f",
    desc: "外刊、学术写作与主题表达，走向独立使用。"
  },
  {
    code: "C1",
    name: "王者英语",
    color: "#7a4a62",
    desc: "高难度学术阅读与演讲，完成接近母语的进阶。"
  }
];

const GRAMMAR_CHAPTERS = [
  { n: 1, title: "名词与代词", href: "lesson-01.html", summary: "从名词分类、可数性到代词体系，搭建造句的第一块基石。" },
  { n: 2, title: "动词", href: "lesson-02.html", summary: "实义动词、系动词与助动词，理解五种句子骨架的发动机。" },
  { n: 3, title: "形容词、副词、数词、冠词", href: "lesson-03.html", summary: "修饰与限定：让名词更具体，让表达更准确。" },
  { n: 4, title: "介词、连词、感叹词", href: "lesson-04.html", summary: "虚词不虚：用小小的连接词搭起完整的意义网络。" },
  { n: 5, title: "句子成分与五种简单句", href: "lesson-05.html", summary: "识别八大成分，掌握英语句子的五种基本构型。" },
  { n: 6, title: "句子类别", href: "lesson-06.html", summary: "陈述、疑问、祈使、感叹：不同交流目的下的句子形态。" },
  { n: 7, title: "英语的基础时态", href: "lesson-07.html", summary: "时间 × 状态，一张表看懂九种基础时态。" },
  { n: 8, title: "并列复合句和主从复合句", href: "lesson-08.html", summary: "从简单句到长难句，读懂并写出有层次的表达。" }
];

const COURSES = [
  {
    id: 20,
    level: "A1",
    series: "务实基础 A1",
    title: "完美发音基础",
    desc: "从元音、辅音到单词与句子发音，系统重建你的英语语音面貌。",
    tags: ["语音基础", "发音纠正", "零基础友好"],
    status: "已完结",
    format: "视频课",
    lessons: [
      { n: 1, title: "元音", fmt: "mp4" },
      { n: 2, title: "双元音", fmt: "mp4" },
      { n: 3, title: "辅音（1）", fmt: "mp4" },
      { n: 4, title: "辅音（2）", fmt: "mp4" },
      { n: 5, title: "单词发音", fmt: "mp4" },
      { n: 6, title: "句子发音", fmt: "mp4" },
      { n: 7, title: "意群、英美音与绕口令", fmt: "mp4" }
    ]
  },
  {
    id: 21,
    level: "A1",
    series: "务实基础 A1",
    title: "核心语法体系",
    desc: "八大章节搭建英语语法骨架：词性、句子成分、时态与复合句一次打通。",
    tags: ["语法体系", "精讲图文", "重点推荐"],
    status: "已完结",
    format: "图文精讲",
    featured: true,
    lessons: GRAMMAR_CHAPTERS.map((c) => ({
      n: c.n,
      title: c.title,
      summary: c.summary,
      href: c.href,
      fmt: "精讲"
    }))
  },
  {
    id: 22,
    level: "A1",
    series: "务实基础 A1",
    title: "基础词汇精讲",
    desc: "以介词、动词、名词、形容词为线索，夯实 A1 阶段最高频的核心词汇。",
    tags: ["核心词汇", "词性梳理"],
    status: "已完结",
    format: "视频课",
    lessons: [
      { n: 1, title: "介词", fmt: "mp4" },
      { n: 2, title: "常用动词（1）", fmt: "mp4" },
      { n: 3, title: "常用动词（2）", fmt: "mp4" },
      { n: 4, title: "常用动词（3）", fmt: "mp4" },
      { n: 5, title: "基础名词", fmt: "mp4" },
      { n: 6, title: "核心形容词", fmt: "mp4" },
      { n: 7, title: "连词与副词", fmt: "mp4" }
    ]
  },
  {
    id: 23,
    level: "A1",
    series: "务实基础 A1",
    title: "日常对话",
    desc: "覆盖自我介绍、兴趣爱好、购物、餐饮、旅行等场景，练出开口即用的表达。",
    tags: ["口语入门", "生活场景"],
    status: "已完结",
    format: "视频课",
    lessons: [
      { n: 1, title: "自我介绍", fmt: "mp4" },
      { n: 2, title: "兴趣爱好", fmt: "mp4" },
      { n: 3, title: "购物专题", fmt: "mp4" },
      { n: 4, title: "餐饮专题", fmt: "mp4" },
      { n: 5, title: "社交专题", fmt: "mp4" },
      { n: 6, title: "旅行专题", fmt: "mp4" },
      { n: 7, title: "校园生活专题", fmt: "mp4" }
    ]
  },
  {
    id: 24,
    level: "A1",
    series: "务实基础 A1",
    title: "A1 阶段总结",
    desc: "回顾 A1 阶段的学习路径，梳理发音、词汇、语法与对话重点，完成入门收束。",
    tags: ["阶段复盘", "知识串讲"],
    status: "已完结",
    format: "视频课",
    lessons: [{ n: 1, title: "A1 阶段总结", fmt: "avi" }]
  },
  {
    id: 25,
    level: "A2",
    series: "超能飞越 A2",
    title: "听口实战运用",
    desc: "针对听力中的数字、时间、短句与篇章，建立一套可复用的听口实战方法。",
    tags: ["听力方法", "口语实战"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "常见听力障碍和实战方法", fmt: "mp4" },
      { n: 2, title: "短句子关键词训练", fmt: "avi" },
      { n: 3, title: "听力数字与时间问题", fmt: "avi" },
      { n: 4, title: "听力题目的类别与应对方法", fmt: "mp4" },
      { n: 5, title: "听力对话训练", fmt: "mp4" },
      { n: 6, title: "听力短篇文章训练", fmt: "mp4" }
    ]
  },
  {
    id: 26,
    level: "A2",
    series: "超能飞越 A2",
    title: "核心词汇扩充",
    desc: "从前缀、后缀到六大常见词根，用构词法成倍扩展 A2 核心词汇量。",
    tags: ["构词法", "词根词缀"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "常见词前缀拓词（上）", fmt: "avi" },
      { n: 2, title: "常见词前缀拓词（下）", fmt: "mp4" },
      { n: 3, title: "常见词后缀拓词（上）", fmt: "mp4" },
      { n: 4, title: "常见词后缀拓词（中）", fmt: "mp4" },
      { n: 5, title: "常见词后缀拓词（下）", fmt: "mp4" },
      { n: 6, title: "常见词根拓词（一）", fmt: "mp4" },
      { n: 7, title: "常见词根拓词（二）", fmt: "mp4" },
      { n: 8, title: "常见词根拓词（三）", fmt: "avi" },
      { n: 9, title: "常见词根拓词（四）", fmt: "avi" },
      { n: 10, title: "常见词根拓词（五）", fmt: "avi" },
      { n: 11, title: "常见词根拓词（六）", fmt: "avi" }
    ]
  },
  {
    id: 27,
    level: "A2",
    series: "超能飞越 A2",
    title: "语法进阶提升",
    desc: "时态、被动语态、各类从句到非谓语与倒装，系统完成 A2 阶段语法进阶。",
    tags: ["语法进阶", "从句体系"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "英文时态进阶（上）", fmt: "avi" },
      { n: 2, title: "英文时态进阶（下）", fmt: "avi" },
      { n: 3, title: "被动语态", fmt: "avi" },
      { n: 4, title: "名词性从句", fmt: "avi" },
      { n: 5, title: "定语从句", fmt: "avi" },
      { n: 6, title: "状语从句", fmt: "avi" },
      { n: 7, title: "非谓语动词（上）", fmt: "avi" },
      { n: 8, title: "非谓语动词（中）", fmt: "avi" },
      { n: 9, title: "非谓语动词（下）", fmt: "mp4" },
      { n: 10, title: "虚拟语气专题", fmt: "mp4" },
      { n: 11, title: "倒装句专题", fmt: "mp4" }
    ]
  },
  {
    id: 28,
    level: "A2",
    series: "超能飞越 A2",
    title: "读写专项训练",
    desc: "从五步法仿写到书信、记叙、图表、议论文与翻译，搭起完整的写作能力。",
    tags: ["写作训练", "翻译技巧"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "初识英文写作：五步法仿写", fmt: "mp4" },
      { n: 2, title: "书信类写作", fmt: "mp4" },
      { n: 3, title: "记叙文写作", fmt: "mp4" },
      { n: 4, title: "图表类写作", fmt: "mp4" },
      { n: 5, title: "议论文写作", fmt: "mp4" },
      { n: 6, title: "翻译的技巧", fmt: "mp4" }
    ]
  },
  {
    id: 29,
    level: "A2",
    series: "超能飞越 A2",
    title: "A2 阶段总结",
    desc: "汇总 A2 阶段核心内容，复盘听说读写四项能力的训练成果与后续路径。",
    tags: ["阶段复盘", "能力盘点"],
    status: "已完结",
    format: "视频课",
    lessons: [{ n: 1, title: "A2 阶段总结", fmt: "mp4" }]
  },
  {
    id: 30,
    level: "B1",
    series: "炉火纯青 B1",
    title: "正式场景表达",
    desc: "面试、Presentation、商务与热点话题，掌握正式场景下的高分口语表达。",
    tags: ["正式口语", "职场表达"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "五步法搞定英文面试", fmt: "mp4" },
      { n: 2, title: "Presentation 必备口语", fmt: "mp4" },
      { n: 3, title: "商务场景必备口语", fmt: "mp4" },
      { n: 4, title: "工作场景必备口语", fmt: "mp4" },
      { n: 5, title: "时事热点必备口语", fmt: "mp4" },
      { n: 6, title: "文体热点必备口语", fmt: "mp4" },
      { n: 7, title: "体育热点必备口语", fmt: "mp4" },
      { n: 8, title: "中西方思维表达方式的差异性", fmt: "mp4" },
      { n: 9, title: "口语考试的高分锦囊", fmt: "mp4" }
    ]
  },
  {
    id: 31,
    level: "B1",
    series: "炉火纯青 B1",
    title: "新闻美剧听说",
    desc: "以新闻与美剧为素材，训练精听、泛听、笔记，以及文化背景的理解。",
    tags: ["新闻听力", "影视英语"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "新闻英语与影视英语的区别和学习指南", fmt: "mp4" },
      { n: 2, title: "短新闻的精听与泛听训练", fmt: "mp4" },
      { n: 3, title: "长文听力笔记如何处理", fmt: "mp4" },
      { n: 4, title: "听力进阶：如何理解英美剧当中的文化梗", fmt: "mp4" },
      { n: 5, title: "听力进阶：带你听懂英美剧中的常用俚语", fmt: "mp4" }
    ]
  },
  {
    id: 32,
    level: "B1",
    series: "炉火纯青 B1",
    title: "专项词汇扩展",
    desc: "财经、法律、时政、医学、科技等九大领域词汇，补齐学术与社会话题词库。",
    tags: ["主题词汇", "学术词库"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "财经词汇专项提升", fmt: "mp4" },
      { n: 2, title: "法律词汇专项提升", fmt: "avi" },
      { n: 3, title: "时政词汇专项提升", fmt: "avi" },
      { n: 4, title: "生物医学词汇专项提升", fmt: "avi" },
      { n: 5, title: "天文地理词汇专项提升", fmt: "avi" },
      { n: 6, title: "历史词汇专项提升", fmt: "avi" },
      { n: 7, title: "艺术词汇专项提升", fmt: "avi" },
      { n: 8, title: "科技类词汇专项提升", fmt: "avi" },
      { n: 9, title: "人文词汇专项提升", fmt: "avi" }
    ]
  },
  {
    id: 33,
    level: "B1",
    series: "炉火纯青 B1",
    title: "原著扩展阅读",
    desc: "从选书、查词到读书笔记与原著实战，建立可持续的英文阅读习惯。",
    tags: ["原著阅读", "阅读方法"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "英文原著的选择和有效阅读", fmt: "avi" },
      { n: 2, title: "手把手教你阅读如何查词", fmt: "avi" },
      { n: 3, title: "大量语料输入：吸收语言结构精华", fmt: "avi" },
      { n: 4, title: "小习惯帮大忙：读书笔记如何做", fmt: "avi" },
      { n: 5, title: "阅读分析中的常用概念（一）", fmt: "avi" },
      { n: 6, title: "阅读分析中的常用概念（二）", fmt: "avi" },
      { n: 7, title: "原著实战阅读训练 1", fmt: "avi" },
      { n: 8, title: "原著实战阅读训练 2", fmt: "avi" }
    ]
  },
  {
    id: 34,
    level: "B2",
    series: "融会贯通 B2",
    title: "全场景覆盖表达",
    desc: "十八个主题陈述训练，覆盖科技、文化、人物、事件、环境与健康等口语高频话题。",
    tags: ["主题口语", "雅思托福"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "什么才是好的口语？（附托福口语考试详解）", fmt: "avi" },
      { n: 2, title: "口语陈述的综合评判标准（附雅思口语考试详解）", fmt: "avi" },
      { n: 3, title: "口语陈述的思维拓展", fmt: "mp4" },
      { n: 4, title: "口语主题陈述 · 科技类", fmt: "mp4" },
      { n: 5, title: "口语主题陈述 · 文化类", fmt: "mp4" },
      { n: 6, title: "口语主题陈述 · 人物类", fmt: "mp4" },
      { n: 7, title: "口语主题陈述 · 事件类", fmt: "avi" },
      { n: 8, title: "口语主题陈述 · 自然与环境类", fmt: "avi" },
      { n: 9, title: "口语主题陈述 · 饮食健康类", fmt: "avi" },
      { n: 10, title: "口语主题陈述 · 事件类", fmt: "avi" },
      { n: 11, title: "口语主题陈述 · 人物类", fmt: "avi" },
      { n: 12, title: "口语主题陈述 · 文化类", fmt: "avi" },
      { n: 13, title: "口语主题陈述 · 科技类", fmt: "avi" },
      { n: 14, title: "口语陈述的思维拓展", fmt: "avi" },
      { n: 15, title: "口语陈述的综合评判标准（附雅思口语考试详解）", fmt: "avi" },
      { n: 16, title: "什么才是好的口语？（附托福口语考试详解）", fmt: "avi" },
      { n: 17, title: "口语主题陈述 · 饮食健康类", fmt: "avi" },
      { n: 18, title: "口语主题陈述 · 自然与环境类", fmt: "avi" }
    ]
  },
  {
    id: 35,
    level: "B2",
    series: "融会贯通 B2",
    title: "经典外刊阅读",
    desc: "以外刊长文为素材，训练读题定位、词义推测、主干提取与匹配类题型。",
    tags: ["外刊精读", "长文阅读"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "读题定位", fmt: "avi" },
      { n: 2, title: "词义推测", fmt: "avi" },
      { n: 3, title: "如何快速寻找句子主干 1", fmt: "avi" },
      { n: 4, title: "如何快速寻找句子主干 2", fmt: "avi" },
      { n: 5, title: "阅读填空题一网打尽", fmt: "avi" },
      { n: 6, title: "匹配类题目详解", fmt: "avi" },
      { n: 7, title: "阅读理解选择题", fmt: "avi" },
      { n: 8, title: "长篇实战训练 1", fmt: "avi" },
      { n: 9, title: "长篇实战训练 2", fmt: "avi" },
      { n: 10, title: "长篇实战训练 3", fmt: "avi" }
    ]
  },
  {
    id: 36,
    level: "B2",
    series: "融会贯通 B2",
    title: "学术写作训练",
    desc: "从学术逻辑、写作误区到篇章分析，完成 B2 阶段学术写作的系统训练。",
    tags: ["学术写作", "篇章分析"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "学术写作的基本逻辑", fmt: "avi" },
      { n: 2, title: "学术写作中的常见误区", fmt: "avi" },
      { n: 3, title: "学术写作类别和写作形式（1）", fmt: "avi" },
      { n: 4, title: "学术写作类别和写作形式（2）", fmt: "avi" },
      { n: 5, title: "学术写作实践精析（1）", fmt: "avi" },
      { n: 6, title: "学术写作实践精析（2）", fmt: "avi" },
      { n: 7, title: "学术写作实践精析（3）", fmt: "avi" },
      { n: 8, title: "学术写作篇章分析（1）", fmt: "avi" },
      { n: 9, title: "学术写作篇章分析（2）", fmt: "avi" }
    ]
  },
  {
    id: 37,
    level: "C1",
    series: "王者英语 C1",
    title: "高级别学术阅读",
    desc: "面向高难度学术阅读，训练同义替换、段落主题、科学类文章与各类题型技巧。",
    tags: ["学术阅读", "长难句"],
    status: "15 / 16 讲",
    format: "视频课",
    lessons: [
      { n: 1, title: "快速摸清段落主题", fmt: "avi" },
      { n: 2, title: "阅读中的同义替换 1", fmt: "avi" },
      { n: 3, title: "阅读中的同义替换 2", fmt: "avi" },
      { n: 4, title: "阅读中的同义替换 3", fmt: "avi" },
      { n: 5, title: "阅读中的同义词 4", fmt: "avi" },
      { n: 6, title: "阅读中的同义词替换 5", fmt: "avi" },
      { n: 7, title: "科学类文章如何找重点 1", fmt: "avi" },
      { n: 8, title: "科学类文章如何找重点 2", fmt: "avi" },
      { n: 9, title: "科学类文章如何找重点 3", fmt: "mp4" },
      { n: 10, title: "高级别考试阅读题型解题技巧 1", fmt: "avi" },
      { n: 11, title: "高级别考试阅读题型解题技巧 2", fmt: "avi" },
      { n: 12, title: "高级别考试阅读题型解题技巧 3", fmt: "avi" },
      { n: 13, title: "高级别考试阅读题型解题技巧 4", fmt: "avi" },
      { n: 14, title: "第 14 课时资料待补充", fmt: "待补", pending: true },
      { n: 15, title: "高难度阅读实战演练 1", fmt: "mp4" },
      { n: 16, title: "高难度阅读实战演练 2", fmt: "mp4" }
    ]
  },
  {
    id: 38,
    level: "C1",
    series: "王者英语 C1",
    title: "英语演讲训练",
    desc: "从演讲要素、选题、写稿到即兴构思与十篇经典演讲赏析，完成 C1 演讲训练。",
    tags: ["英语演讲", "经典赏析"],
    status: "已上线",
    format: "视频课",
    lessons: [
      { n: 1, title: "英文演讲的十大要素", fmt: "mp4" },
      { n: 2, title: "如何提炼演讲题目", fmt: "mp4" },
      { n: 3, title: "如何写一篇英文演讲稿", fmt: "mp4" },
      { n: 4, title: "即兴演讲的构思技巧", fmt: "mp4" },
      { n: 5, title: "不同演讲形式的应对", fmt: "mp4" },
      { n: 6, title: "经典英语演讲赏析 1", fmt: "mp4" },
      { n: 7, title: "经典演讲赏析 2", fmt: "mp4" },
      { n: 8, title: "经典演讲赏析 3", fmt: "mp4" },
      { n: 9, title: "经典演讲赏析 4", fmt: "mp4" },
      { n: 10, title: "经典演讲赏析 5", fmt: "mp4" },
      { n: 11, title: "经典演讲赏析 6", fmt: "mp4" },
      { n: 12, title: "经典演讲赏析 7", fmt: "avi" },
      { n: 13, title: "经典演讲赏析 8", fmt: "avi" },
      { n: 14, title: "经典演讲赏析 9", fmt: "avi" },
      { n: 15, title: "经典演讲赏析 10", fmt: "avi" }
    ]
  }
];

/* 按编号升序，保证目录顺序稳定 */
COURSES.sort((a, b) => a.id - b.id);

const LEVEL_COLOR = Object.fromEntries(LEVELS.map((l) => [l.code, l.color]));
const TOTAL_LESSONS = COURSES.reduce((sum, c) => sum + c.lessons.length, 0);
