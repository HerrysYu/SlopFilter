// The Jev request: one post in `state`, three typed questions about it.
// Jev is a small "System One" decision model, so the questions spell out the
// AI-slop tells in detail instead of relying on the model to know them.
// API reference: https://docs.typesafe.ai/api (POST /v1/systemone)
const SlopPrompt = (() => {
  'use strict';

  const VERSION = '2026-10-30.4';

  const IS_AI_SLOP = {
    type: 'noul',
    instructions: [
      'You are screening posts on the X (Twitter) timeline, including the Chinese-language part of it.',
      'Question: is post_text slop, i.e. engagement filler written by an AI model (ChatGPT, Claude, Grok, Gemini, DeepSeek, Kimi, Doubao and similar) or churned out from a template by a content-farm marketing account (营销号), rather than typed by a person saying something they actually think?',
      'Judge post_text only. replying_to and quoted_post are context for judging it, not things to judge.',
      'author.verified_badge "blue" is a paid X Premium subscription. Paid accounts earn money from replies and impressions, and Chinese-language blue-check marketing accounts (蓝勾营销号) mass-post AI-written replies, clickbait reposts and funnels to groups or DMs. A blue badge together with generic, templated or funnel content is strong evidence; a blue badge alone is not.',
      'automatic_scan lists patterns found by a regex scanner. They are hints and can be wrong.',
      'Weigh the evidence together: one weak tell is not enough, but three or more tells stacked in one short post is strong evidence. A single hard tell (leftover chatbot text, an unfilled placeholder, follow-for-follow spam) is enough on its own.',
      'Low quality, self-promotion by a real person, bad opinions, rudeness or broken English do not make a post slop. If you are unsure, lean towards NO.',
    ].join('\n'),
    criteria: {
      true: [
        'YES: the post reads as machine-generated slop. Typical evidence:',
        '1. Hard tells, enough alone: leftover assistant phrasing ("Certainly!", "As an AI…", "I hope this helps", "Here\'s a tweet about…", 以下是…, 希望对你有帮助), unfilled placeholders like [Your Name] or {link}, the whole post wrapped in quotation marks.',
        '2. Reply farming: a polished, generic reply that restates the parent post and praises it ("Great insight! Consistency really is the key to long-term success 🚀", "This is a game-changer for the industry!", 说得太好了，非常有见地的分享！). It could be pasted under almost any post without changing a word, and it adds no new fact, opinion, joke or personal detail.',
        '3. Template rhetoric: "It\'s not X, it\'s Y" or "This isn\'t just X — it\'s Y" reversals (这不是…而是…, 不仅…更是…), em dashes in casual English, tricolons ("Faster. Smarter. Cheaper."), self-answered questions ("The result? …", "The best part? …"), one sentence per line, a neat moral at the end.',
        '4. Viral hooks and bait: "Here\'s the thing", "Let that sink in", "Read that again", "Most people don\'t know…", "Nobody is talking about this", "🧵👇", "10 AI tools that will replace…", "Bookmark this", ending with "What do you think?" or "Agree?" (你怎么看？评论区告诉我, 建议收藏).',
        '5. Hustle funnels: prompt lists, passive income, faceless channels, "comment PROMPT and I\'ll DM you", unverifiable success numbers, testimonial stories about a cousin or a friend.',
        '6. Clusters of LLM vocabulary: delve, tapestry, testament, landscape, realm, pivotal, crucial, seamless, robust, leverage, unlock, unleash, elevate, empower, harness, foster, resonate, profound, nuanced, multifaceted, ever-evolving, game-changer, "in today\'s fast-paced world", "quietly reshaping", "this matters". Chinese: 值得注意的是, 总而言之, 综上所述, 在当今…时代, 随着…的发展, 赋能, 底层逻辑, 无疑, 堪称, 引发广泛关注, 让我们一起, 深度解析.',
        '7. Formatting: emoji used as bullet points or headers (🚀 💡 ✅ 🔥 👉), Unicode bold letters, three or more generic hashtags (#AI #Innovation #Growth), flawless grammar with no personality, lines of near-identical length.',
        '8. Chinese marketing accounts (营销号), often with a blue badge and a brand-like name (…观察, …日报, …快讯, …研究所, …财经, 互关…):',
        '   - clickbait headlines: 【突发】【重磅】, 震惊, 万万没想到, 细思极恐, 看完沉默了, 终于有人说出了, 网友炸锅了, 一定要看到最后;',
        '   - reposted or rewritten Weibo / Zhihu / Xiaohongshu / Douyin stories: 据…报道, 网传, 网友爆料, 有网友, 消息称, without any first-hand view;',
        '   - follow farming: 互关, 互粉, 回关, 有关必回, 蓝V互关, 新号求关注, 涨粉;',
        '   - funnels: 进群, 电报群, 私信我, 看置顶, 主页有, 评论区扣1, 加V, 免费领资料, 网盘资源, 一文读懂, 保姆级, 建议收藏;',
        '   - crypto and hustle shilling: 撸毛, 空投, 白名单, 土狗, 百倍, 带单, 喊单, 上车, 信息差, 普通人如何, 财富自由, 副业月入;',
        '   - Xiaohongshu ad voice: 家人们, 宝子们, 姐妹们, 绝绝子, 天花板, 闭眼入, 无限回购, 亲测, 种草;',
        '   - reply farming under popular posts: 确实如此, 说得太好了, 很有深度, 值得深思, 学到了, 感谢分享, 支持, often restating the original post in a polished, neutral tone, or the same sentence pasted under many posts.',
        '9. Chinese AI voice (AI腔), the way ChatGPT, DeepSeek, Doubao and Kimi write Chinese:',
        '   - translated-English templates: 不是…而是…, 真正的X从来不是Y而是Z, 这不仅是…更是…, 与其说…不如说…, 你以为…其实…, 每一个…都藏着…, 当…遇上…, 在…的浪潮中, 在这个快节奏的时代;',
        '   - stock openers and closers: 不得不说, 有一说一, 不可否认的是, 很多人不知道的是, 真正的关键在于, 说白了, 本质上, 归根结底, 一句话总结, 总而言之, 综上所述, 毋庸置疑, 愿你…, 与君共勉, 愿我们都能…;',
        '   - press-release words: 赋能, 闭环, 抓手, 价值沉淀, 全新升级, 深耕, 打造, 生态, 全方位, 多维度, 至关重要, 不可或缺;',
        '   - abstract literary nouns used as decoration: 叙事, 张力, 底色, 内核, 注脚, 缩影, 回响, 褶皱, 年轮, 指纹, 锚点, 肌理, 温度 (e.g. 这座城市的温度, 时代的注脚, 生活的褶皱);',
        '   - DeepSeek-style sci-fi metaphors for everyday life: 量子纠缠, 熵增, 坍缩, 黑洞, 拓扑, 蝴蝶效应, 暗物质, 底层代码, 基因密钥 (e.g. a breakup as 无法避免的熵增, love as 量子纠缠的玫瑰, overtime as 屏幕蓝光在视网膜投射出谵妄的嬗变), rare showy words (嬗变, 滥觞, 诡谲);',
        '   - oddly precise numbers in emotional scenes: 左眼的第七根睫毛, 衬衫的第三粒纽扣, 凌晨4:27, 第11次呼吸;',
        '   - pop-psychology healing voice: 被看见, 温柔地接住, 情绪价值, 松弛感, 向内求, 允许一切发生, 和自己和解;',
        '   - punctuation and rhythm: several —— dashes in one short post, 排比 in threes (它是…, 是…, 更是…), a colon before the punchline (答案是：…, 一句话：…), every paragraph ending on a neat aphorism.',
        '10. Terse "expert note" AI voice in Chinese tech and productivity posts (newer models write like this when told to sound casual). Typical example, written by AI:',
        '   「每半个月做一次记忆大扫除」这条被普遍忽略——规则文件不是写完就完，过时规则会反过来指挥现在的活。配套一条：进 AGENTS.md 的东西都该带日期和复审周期，和「否决过的方案留档」一样，都是要维护的资产不是一次性提示词',
        '   Why it reads as AI:',
        '   - named ideas wrapped in 「」 and pointed at with 这条 / 这点, often two of them cross-referenced (和「…」一样，都是…);',
        '   - an "overlooked insight" opener (被普遍忽略, 被严重低估, 很多人没意识到, 反直觉的是) followed by one —— and the explanation;',
        '   - contrast squeezed into one clause without 而是: 是要维护的资产不是一次性提示词, 不是写完就完, 这不是 X 问题，是 Y 问题, X 是手段不是目的;',
        '   - abstract things given agency: 过时规则会反过来指挥现在的活, 省下的时间会在…还回来;',
        '   - label-plus-colon add-ons: 配套一条：, 补一条：, 关键一点：, 核心就一句：, 结论：;',
        '   - rule-like prescriptions (都该…, 一定要…, 别…) with no 我, no anecdote, no hedging;',
        '   - casual words (活, 东西, 写完就完) pasted onto a tightly built argument, and neat spaces between Chinese and English words (进 AGENTS.md 的东西), which people typing fast on Twitter usually skip.',
      ].join('\n'),
      false: [
        'NO: a person wrote it, even if it is short, rude, lazy, promotional, wrong, or in imperfect English. Typical evidence:',
        '- concrete details only the writer would know: names, places, times, numbers tied to their own life or work;',
        '- a specific, opinionated or idiosyncratic point of view; real humor, sarcasm, irony, memes, in-jokes;',
        '- slang and casual typing: lol, lmao, ngl, tbh, fr, 😭, 💀, 笑死, 绷不住, 草, all-lowercase text, typos, fragments, swearing;',
        '- a reply that engages with a specific detail of the post it answers, or disagrees with it;',
        '- brief reactions ("same", "this is so real", "wait what"), questions, news headlines and official announcements written in a normal style, code, links shared with a short personal note;',
        '- Chinese posts about the writer\'s own day, work, family or city, complaints and banter (笑死, 绷不住, 草, 我真的会谢, 无语), a screenshot or photo with a one-line reaction, a reply that argues with a specific point.',
        'Non-native English, translation or a formal tone alone is not evidence of AI. Marketing slang (家人们, 宝子们, 绝绝子) is not a sign of a real person.',
      ].join('\n'),
    },
  };

  const SLOP_KIND = {
    type: 'choice',
    instructions: 'Which description fits post_text best? Choose "human" unless the post clearly reads as AI-generated.',
    criteria: {
      engagement_reply: 'AI reply farming: a generic, polished reply that restates or flatters the post it answers and could fit under almost any post.',
      hook_thread: 'AI viral template: hook lines, listicles or thread bait ("Here\'s why 🧵", "7 lessons…", "Let that sink in", "Bookmark this"), often ending with an engagement question.',
      hustle_funnel: 'AI-written money funnel: prompt lists, passive income, faceless channels, fake testimonials, "comment X and I\'ll DM you".',
      marketing_account: 'Chinese content-farm marketing account (营销号): clickbait headlines (【突发】, 震惊, 万万没想到, 细思极恐), reposted Weibo or Xiaohongshu stories, follow farming (互关, 回关, 求关注), funnels to groups or DMs (进群, 私信, 看置顶, 评论区扣1), crypto shilling (撸毛, 空投, 带单), Xiaohongshu ad voice (家人们, 绝绝子).',
      ai_essay_voice: 'AI essay voice: inflated significance, "not X but Y" reversals, em dashes, tricolons, buzzwords such as delve, testament or landscape, a tidy moral at the end. In Chinese (AI腔): 不是…而是…, 真正的…从来不是…, 说白了, 本质上, 底色, 注脚, 褶皱, 量子纠缠, 熵增, 被看见, 愿你…, many —— dashes; or the terse expert-note style: 「named rule」这条被普遍忽略——…, 是 X 不是 Y, 配套一条：…, 都该…',
      chatbot_leftover: 'Pasted chatbot output with leftovers: "Certainly!", "As an AI", "Here\'s a tweet", placeholders like [Your Name], the whole post in quotes.',
      human: 'Written by a person: natural voice, specific personal details, humor, slang, typos, genuine reactions, or ordinary news and announcement style.',
    },
  };

  // Asked separately because a small model is better at spotting what is
  // present than at proving what is absent. Used as a counterweight.
  const HUMAN_TEXTURE = {
    type: 'noul',
    instructions: 'Does post_text contain clear signs that a real person typed it: first-hand concrete details (names, places, times, personal numbers), a specific opinion, humor or sarcasm, slang, typos, or an emotional reaction in their own words?',
    criteria: {
      true: 'Yes: at least one concrete personal detail, a distinctive voice, humor, slang, typos or a genuine reaction is present.',
      false: 'No: the text is generic, polished and could have been written about anyone by anyone. Marketing slang (家人们, 宝子们, 绝绝子), hype words (重磅, 炸裂, 王炸) and engagement bait do not count as signs of a real person.',
    },
  };

  const clip = (s, n) => {
    s = String(s || '').trim();
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };

  function build(t, model) {
    const state = {
      post_text: clip(t.text, 2400),
      post_language: t.lang || 'unknown',
      post_kind: t.isReply ? 'reply' : t.quoteText ? 'quote post' : 'original post',
      author: {
        display_name: clip(t.name, 60),
        handle: t.handle ? `@${t.handle}` : 'unknown',
        verified_badge: { blue: 'blue', gold: 'gold (organization)', gray: 'gray (government)' }[t.badge || (t.verified ? 'blue' : '')] || 'none',
      },
      has_media: !!t.hasMedia,
    };
    if (t.parentText) state.replying_to = clip(t.parentText, 700);
    if (t.quoteText) state.quoted_post = clip(t.quoteText, 700);
    state.automatic_scan = {
      ai_tells_found: t.tells?.length ? t.tells : ['none'],
      human_tells_found: t.humanTells?.length ? t.humanTells : ['none'],
    };
    return {
      model,
      state,
      questions: { is_ai_slop: IS_AI_SLOP, slop_kind: SLOP_KIND, human_texture: HUMAN_TEXTURE },
    };
  }

  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null);

  // Three framings of the same decision, averaged. A self-ensemble like this
  // is steadier than any single answer from a small model.
  function read(json) {
    const a = json?.answers || {};
    const noul = num(a.is_ai_slop?.noul);
    const probs = a.slop_kind?.probabilities || {};
    const human = num(probs.human);
    const texture = num(a.human_texture?.noul);

    const parts = [];
    if (noul != null) parts.push([noul, 0.5]);
    if (human != null) parts.push([1 - human, 0.3]);
    if (texture != null) parts.push([1 - texture, 0.2]);
    if (!parts.length) throw new Error('Jev 的返回里没有可用的答案');

    const weight = parts.reduce((s, [, w]) => s + w, 0);
    const jev = parts.reduce((s, [p, w]) => s + p * w, 0) / weight;

    let kind = null;
    let best = 0;
    for (const [k, p] of Object.entries(probs)) {
      if (k !== 'human' && typeof p === 'number' && p > best) {
        best = p;
        kind = k;
      }
    }

    return { jev: Math.round(jev * 1000) / 1000, noul, human, texture, kind, model: json.model || null };
  }

  return { VERSION, build, read };
})();
