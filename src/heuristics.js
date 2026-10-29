// Local AI-slop pattern scanner. Runs in the content script.
// Its findings go to Jev as hints and are blended into the final score,
// and on their own (no API key) they only catch the very obvious cases.
const SlopHeuristics = (() => {
  'use strict';

  // ---------- pattern tables ----------

  const CHATBOT_EN = /\bas an ai\b|\bas an? (?:ai )?language model\b|\bi hope this helps\b|^\s*(?:certainly|absolutely|of course|sure)[!,.]\s+here(?:'s| is)\b|\bhere(?:'s| is) (?:a|an|the|your) (?:\w+[- ])?(?:tweet|reply|response|post|thread|caption)\b|\[(?:your|insert|add|link|name)\b[^\]]{0,40}\]|\{(?:your|insert|link|name)\b[^}]{0,40}\}|\bregenerate response\b|\bmy (?:knowledge|training) cutoff\b/im;
  const CHATBOT_ZH = /作为一?个?(?:AI|人工智能)(?:语言模型|助手|模型)|以下是(?:一?[条篇则段]|为你|为您|根据)|希望(?:以上|这些?)?(?:内容|回答|信息)?(?:对你|对您)?有所?帮助|【(?:你的|您的|插入|填写)[^】]{0,20}】/;

  const PRAISE_EN = /^(?:wow[,!]?\s+)?(?:(?:great|excellent|fantastic|amazing|awesome|incredible|insightful|brilliant|fascinating|powerful|valuable|interesting|thoughtful|impressive|solid|wonderful) (?:insights?|points?|post|thread|take|perspective|share|breakdown|read|analysis|question|thoughts?|reminder|observation|work|stuff|tips?)\b|well said|so true|spot on|absolutely|exactly|100%|couldn't agree more|totally agree|love this|love that|this is (?:so |really |absolutely |such )?(?:true|important|huge|key|powerful|insightful|spot on|brilliant|gold|a great (?:point|reminder|take))|thanks? (?:you )?for sharing|what a (?:great|fantastic|powerful|brilliant|wonderful|amazing))/i;
  const PRAISE_ZH = /^(?:说得(?:太|真|非常)?(?:好|对)了?|说的(?:没错|对|太对了)|太(?:有道理|对|赞|精辟)了|非常(?:赞同|认同|同意|有道理|有见地|精辟|到位)|完全(?:同意|赞同|认同)|深有(?:同感|体会)|(?:感谢|谢谢)(?:您|你)?的?分享|受益匪浅|很有(?:见地|启发|道理|深度|意义|价值)|(?:分析|总结)得(?:太|非常|很)?(?:好|到位|透彻|精辟)|一针见血|醍醐灌顶|确实(?:如此|是这样)|这个观点|值得(?:关注|思考|深思|学习)|学到了|学习了|收藏了|已收藏|好文|干货满满|支持一下|期待后续)/;

  const REVERSAL_EN = [
    /\b(?:is|was|are|were)n't (?:just |only |merely |simply |really )?(?:about )?[^.!?\n;]{2,60}[.;,:—–-]+\s*(?:it|this|that|they)(?:'s|'re| is| are| was| were)\b/i,
    /\b(?:it|this|that)(?:'s| is| was) not (?:just |only |merely |simply |really )?(?:about )?[^.!?\n;]{2,60}[.;,:—–-]+\s*(?:it|this|that)(?:'s| is| was)\b/i,
    /\bnot (?:just|only|merely|simply) (?:a |an |the )?[^.!?\n;]{2,50}?,?\s+(?:but|—|–)\s/i,
    /\bnot because [^.!?\n]{2,60}?,?\s*but because\b/i,
  ];
  const REVERSAL_ZH = /(?:不是|并非|不只是|不仅仅是)[^。！？\n]{1,30}?[，,；;—]+\s*(?:而是|更是)|与其说[^。！？\n]{1,30}?不如说|真正的[^。！？\n，,]{1,12}?(?:从来|往往)?(?:都)?不是|你以为[^。！？\n]{1,30}?其实|每一[个份段次][^。！？\n]{1,20}?都(?:藏着|是|值得)|是(?!不)[^。！？\n，,；;]{1,16}(?<!是)不是[^。！？\n，,；;]{1,16}|不是[^。！？\n，,]{1,8}就(?:完|行|够|好)了?|不是[^。！？\n，,]{1,10}问题[，,]\s*(?:而)?是[^。！？\n，,]{1,10}问题/;
  const NOT_ONLY_ZH = /不仅[^。！？\n]{1,30}?更是/;

  const HOOK_EN = /(?:^|\n)\s*(?:here's (?:the thing|why|what|how|the truth|the kicker|the secret|the deal)|this is (?:huge|wild|insane|massive|crazy|nuts|big)\b|(?:most|many|99% of) people (?:don't|won't|never|have no idea|get this wrong)|no ?one (?:is talking|talks) about|nobody (?:is talking|talks) about|unpopular opinion|hot take|stop scrolling|plot twist|the truth is|the reality is|big news|breaking|🚨|you're not (?:lazy|behind|broken|alone)|i (?:spent|analy[sz]ed|studied|tested|read) (?:\d+|over \d+|hundreds of|thousands of)\b)|\blet that sink in\b|\bread that again\b|\bso you don't have to\b/i;
  const HOOK_ZH = /(?:^|\n)\s*(?:重磅|炸裂|颠覆认知|一定要看|必看|99%的人(?:都)?不知道|很多人(?:都)?不知道|没人告诉你|说个(?:扎心|残酷)的?(?:真相|事实)|真相是|划重点|敲黑板|干货(?:来了|满满)|速看|🚨)/;

  const CTA_EN = /(?:what do you think|what's your take|what are your thoughts|thoughts\?|agree\?|do you agree|who else|am i wrong|drop (?:a|your) .{1,24}(?:below|👇)|let me know (?:in the comments|below|what you think)|follow (?:me |@\w+ )?for more|repost (?:if|to|this)|♻️|bookmark (?:this|it)|save (?:this|it) for later|like (?:and|&) (?:rt|retweet|share)|tag (?:someone|a friend)|share (?:this )?with (?:someone|a friend))[^\w\n]{0,8}\s*(?:#\S+\s*)*$/i;
  const CTA_ZH = /你(?:们)?(?:怎么看|觉得呢|同意吗)|欢迎(?:在)?评论区|评论区(?:留言|聊聊|告诉我|见|说说)|关注我|点赞(?:\s*[+＋和、]\s*)?(?:收藏|关注|转发)|建议收藏|先收藏|码住|转发给(?:需要|身边)/;

  const FUNNEL = /\bcomment ["'“”]?[A-Za-z]{2,}["'“”]?(?: below)?(?: and| &|,)? (?:i'll|i will|to get|for|and get)\b|\bdm me\b|\blink in (?:my )?(?:bio|comments|the comments)\b|评论(?:区)?(?:扣|回复|留言)\s*["“「]?\S{1,8}?["”」]?\s*(?:领取|获取|发你|私发)|私信(?:我)?(?:领取|获取)?|私我|进群|加群|入群|电报群|[tT][gG]\s*群|看置顶|主页置顶|评论区扣\s*\S{1,4}|扣\s*1|加\s*[VvＶ]|加微|薇信|威信|免费领|网盘资源|链接在评论/i;

  const HUSTLE = /passive income|side hustle|\$\d[\d,.]*k?\s*(?:\/|per|a|every)\s*(?:month|mo|week|day)\b|\bmake \$\d|faceless (?:channel|account|page|youtube|tiktok)|while you sleep|silent money|money machine|(?:chatgpt|claude|gemini|grok|midjourney|ai) prompts? (?:to|that|for)\b|\bprompts? (?:that|to) (?:will |can )?(?:replace|make|save|earn)|\breplace(?:s|d)? (?:your|a|an) \$?\d+k?(?:\/\w+)? (?:job|agency|employee|team|marketing)|\bmy (?:cousin|friend|brother|sister|mom|dad|uncle|neighbor) (?:made|used|tried|submitted|sent|lost|got|quit)\b|被动收入|副业|月入\s*\d|日入\s*\d|躺赚|搞钱|信息差|普通人(?:如何|怎么|也能)|财富自由|弯道超车|无人直播|矩阵号|一人公司|AI\s*变现|提示词(?:合集|大全|模板)|prompt\s*(?:合集|大全)/i;

  const VOCAB_EN = /\b(?:delv(?:e|es|ing)|tapestry|testament|landscape|realm|pivotal|crucial|intricate|multifaceted|ever[- ](?:evolving|changing)|fast[- ]paced|game[- ]chang(?:er|ers|ing)|revolutioni[sz](?:e|es|ed|ing)|paradigm shift|synergy|leverag(?:e|es|ing)|unlock(?:s|ed|ing)?|unleash(?:es|ed|ing)?|elevat(?:e|es|ed|ing)|empower(?:s|ed|ing|ment)?|harness(?:es|ed|ing)?|seamless(?:ly)?|robust|foster(?:s|ed|ing)?|resonat(?:e|es|ed|ing)|profound(?:ly)?|nuanced|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|vibrant|meticulous(?:ly)?|embark(?:s|ed|ing)?|beacon|cutting[- ]edge|transformative|holistic|actionable|invaluable|digital age|worth noting|important to note|in conclusion|at its core|navigat(?:e|es|ing) the|redefin(?:e|es|ed|ing)|reimagin(?:e|es|ed|ing)|supercharg(?:e|es|ed|ing)|quietly (?:becoming|reshaping|changing|building|redefining|rewriting|taking over|winning)|stands as|serves as (?:a|an)|a reminder that|speaks volumes|key takeaways?|deep dive|thriv(?:e|es|ing)|mindset shift|next level|in today's (?:world|landscape|digital|fast)|this matters)\b/gi;
  const VOCAB_ZH = /值得(?:注意|一提)的是|不可否认|毋庸置疑|总的来说|总而言之|综上所述|简而言之|归根结底|在当今|当今社会|随着[^。，,！!？?]{1,15}的(?:快速|飞速|不断|迅猛|蓬勃)?发展|赋能|助力|深度解析|底层逻辑|无疑|堪称|不禁让人|引发了?(?:广泛|热烈|网友|全网)的?(?:关注|讨论|热议)|意义深远|划时代|里程碑|新篇章|新纪元|让我们一起|深入探讨|奥秘|旅程|见证|格局|全方位|多维度|一站式|干货|颠覆|革命性|重新定义|核心在于|关键在于|本质上|首先[^。]{2,40}其次|一方面[^。]{2,40}另一方面|范式|折射出?|背后的?(?:逻辑|原因|真相)|深层次|这一现象|值得[^。，,]{0,8}深思|发人深省|令人深思|引人深思|耐人寻味|不容忽视|某种(?:程度|意义)上|风口|赛道|红利|降维打击|闭环|抓手|破圈|说到底|一句话总结|认知(?:升级|差|觉醒)|不得不说|有一说一|很多人不知道的是|真正的关键|说白了|价值沉淀|全新升级|深耕|至关重要|不可或缺|底色|内核|注脚|缩影|回响|褶皱|年轮|锚点|肌理|被看见|温柔地接住|情绪价值|松弛感|向内求|允许一切发生|和自己和解|与君共勉|愿我们都能|在[^。，,]{1,10}的浪潮中|当[^。，,]{1,10}遇上|被(?:普遍|严重|大多数人|很多人)?(?:忽略|忽视|低估)|很多人没(?:意识到|注意到)|容易被忽略|反直觉|反过来(?:指挥|影响|定义|塑造|决定|绑架)|说穿了|这才是关键|是手段(?:而)?不是目的/g;

  const RHETORICAL_EN = /\b(?:the (?:result|results|best part|catch|kicker|secret|truth|lesson|answer|reason|twist|outcome|problem|fix|takeaway|irony)|the real (?:question|problem|answer)|my answer)\?\s+["']?[A-Z0-9]/;
  const RHETORICAL_ZH = /(?:结果|答案|原因|秘诀|关键|真相|核心)(?:呢|是什么)?[？?]\s*[^\s？?]/;

  const TRICOLON = /(?:^|[.!?]\s+|\n)(?:[A-Z][\w']*(?:\s+[\w']+){0,2}[.!]\s+){2}[A-Z][\w']*(?:\s+[\w']+){0,2}[.!](?=\s|$)|\bno \w+(?: \w+)?[.,] no \w+(?: \w+)?[.,] (?:just|only)\b/i;

  const LIST_ITEM = /^\s*(?:\d{1,2}[.)、:]|\d\uFE0F?\u20E3|[①-⑳]|第[一二三四五六七八九十][、，,:：]|[-•·▪►→➤✓✔☑])\s*\S/;
  const THREAD = /🧵|\bthread\b\s*(?:👇|⬇️|below)|^\s*1\/\d*\s|\(1\/\d+\)|^\s*\d+\s+(?:ai |chatgpt |free )?(?:tools|prompts|ways|lessons|habits|things|tips|websites|books|rules|mistakes|signs|skills|steps|apps|secrets)\b/im;
  const EMOJI_LEAD = /^\s*\p{Extended_Pictographic}/u;

  // ---- Chinese marketing accounts (中文营销号) ----
  const ZH_CLICKBAIT = /震惊|万万没想到|竟然是|细思极恐|看完沉默|终于有人(?:说出|敢说|讲清楚)|太真实了|看哭了|炸锅|疯传|刷屏了|速看|速转|一定要看到最后|惊呆了?|突发[！!：:]|重磅[！!：:]|刚刚[，,！!]|官宣[！!：:]|^\s*【[^】]{1,12}】/gm;
  const ZH_FOLLOW_FARM = /互关|互粉|互fo|回关|有关必回|关注(?:即|必)回|求关注|涨粉|蓝[VvＶ标勾]互|互赞|新号求/i;
  const ZH_CRYPTO = /撸毛|空投|白名单|打新|土狗|百倍|千倍|翻倍币|梭哈|带单|喊单|跟单|铭文|meme\s*币|\b\d{2,4}\s*[xX]\b|\b(?:DYOR|NFA|LFG|WAGMI)\b/i;
  const ZH_AD_VOICE = /家人们|宝子们|姐妹们|集美们|老铁们|绝绝子|天花板|冲鸭|闭眼入|无限回购|亲测|种草|拔草|安利|宝藏|爆款|流量密码|抄作业/g;
  const ZH_LISTICLE = /一文(?:读懂|看懂|讲清)|一张图看懂|一个帖子讲清楚|万字长文|保姆级|手把手|超详细|全网最全|最全攻略|收藏(?:慢慢看|备用)|\d+\s*个(?:技巧|方法|工具|网站|习惯|神器|副业|思维|认知)/;
  const ZH_REPOST = /据[^，。,]{1,12}报道|网传|网友爆料|有网友|知情人士|消息称|来源[:：]|转自|搬运|via\s*(?:微博|知乎|小红书|抖音)|(?:微博|知乎|小红书|抖音|B站)上(?:有人|网友|看到)/;
  const MARKETING_NAME = /观察|日报|快讯|资讯|研究所|研究院|财经|热点|头条|百科|干货|情报|内参|速递|精选|看点|揭秘|爆料|吃瓜|搬运|互关|互fo|回关|涨粉|币圈|撸毛|空投|web3|副业|搞钱|赚钱|💰|💎|🚀|🔥/i;

  // DeepSeek-style sci-fi metaphors and showy words in everyday Chinese posts.
  const ZH_SCIFI = /量子纠缠|熵增|坍缩|黑洞|拓扑|蝴蝶效应|暗物质|底层代码|基因(?:密钥|编码|序列)|赛博|嬗变|滥觞|诡谲/g;
  const ZH_PRECISE = /第[一二三四五六七八九十\d]{1,3}(?:根|粒|块|颗|片)(?:睫毛|纽扣|扣子|脊骨|地砖|台阶|花瓣|叶子)|凌晨\s*\d{1,2}\s*[:：]\s*\d{2}[^。]{0,12}第\s*\d+\s*次/;

  // Terse "expert note" voice: 「named rule」这条…, 配套一条：…
  const ZH_LABEL_COLON = /(?:^|[。！？!?\n])\s*(?:配套一条|补一条|再补一条|补充一点|顺带一提|顺手说一句|反直觉的是|一个反直觉的点|关键一点|核心就一句|一句话|结论|划重点|重点是|说穿了|TL;?DR)\s*[:：]/i;
  const TRADITIONAL = /[這說們會來對時為麼點過還後開與從應經]/; // 「」 is the normal quote mark in traditional Chinese
  const CJK_LATIN_SPACED = /[\u4e00-\u9fff] [A-Za-z0-9]|[A-Za-z0-9] [\u4e00-\u9fff]/g;
  const CJK_LATIN_TIGHT = /[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/;

  const SYCOPHANCY_EN = /\b(?:truly|absolutely|incredibly|remarkably|deeply|genuinely|such an?)\b[^.!?]{0,40}\b(?:inspiring|insightful|impressive|valuable|fascinating|important|remarkable|powerful|amazing|incredible|brilliant|thoughtful|refreshing)\b/i;
  const SYCOPHANCY_ZH = /(?:真的|非常|十分|极其|太)(?:有见地|有启发|精彩|深刻|到位|有价值|鼓舞人心)/;

  const HUMAN = [
    { id: 'slang', zh: '口语缩写', en: 'casual slang or abbreviations', re: /\b(?:lol|lmao|lmfao|rofl|tbh|ngl|imo|idk|idc|fr|frfr|bruh|wtf|omg|smh|ong|istg|lowkey|deadass|ain't|gonna|wanna|gotta|kinda|tho|cuz|rn|af|btw)\b/i },
    { id: 'reaction', zh: '情绪表情', en: 'reaction emoji such as 😭 💀 😂', re: /(?:😭|💀|😂|🤣|🫠|🙃|🤡|😩|🥲)/u },
    { id: 'zh_slang', zh: '中文口语', en: 'Chinese internet slang', re: /哈哈+|笑死|卧槽|我靠|绷不住|无语|牛逼|xswl|啊啊啊|呜呜|。。+|？？+|我真的会谢|草$|草，/ },
    { id: 'swear', zh: '粗口', en: 'swearing', re: /\b(?:fuck\w*|shit\w*|damn|crap)\b/i },
    { id: 'stretch', zh: '拉长字母', en: 'stretched words like "soooo"', re: /\b\w*([a-z])\1{3,}\w*\b/i },
    { id: 'lowercase', zh: '全小写', en: 'all-lowercase casual typing', test: (t) => !t.cjk && t.plain.length >= 25 && /[a-z]{3}/.test(t.plain) && !/[A-Z]/.test(t.plain) },
  ];

  const STOP = new Set('this that with from have they your about what when will just really more been were there their would could should into than then them these those very also some such only like make made does doing here because being over after before while where which other every most much many even still well thing things people today think know want need back time good great lets'.split(' '));

  // ---------- helpers ----------

  const ladder = (n, steps) => steps[Math.min(n, steps.length - 1)];

  function tokens(s) {
    const out = new Set();
    const lower = s.toLowerCase();
    for (const w of lower.match(/[a-z][a-z'-]{3,}/g) || []) if (!STOP.has(w)) out.add(w);
    const han = lower.replace(/[^一-鿿]/g, '');
    for (let i = 0; i < han.length - 1; i++) out.add(han.slice(i, i + 2));
    return out;
  }

  function overlap(reply, parent) {
    const a = tokens(reply);
    if (a.size < 4) return 0;
    const b = tokens(parent);
    let hit = 0;
    for (const x of a) if (b.has(x)) hit++;
    return hit / a.size;
  }

  function uniqueMatches(text, re) {
    const seen = new Set();
    for (const m of text.match(re) || []) seen.add(m.toLowerCase().slice(0, 24));
    return [...seen];
  }

  // ---------- rules ----------
  // test(t) returns 0, a weight, or { w, note }.

  const RULES = [
    { id: 'chatbot', zh: 'AI 助手残留', en: 'leftover chatbot phrasing or an unfilled placeholder', hard: true,
      test: (t) => (CHATBOT_EN.test(t.text) || CHATBOT_ZH.test(t.text) ? 0.97 : 0) },
    { id: 'quoted', zh: '整段带引号', en: 'the whole post is wrapped in quotation marks',
      test: (t) => (/^\s*"[^"]{40,}"\s*$/.test(t.text) ? 0.45 : 0) },
    { id: 'praise', zh: '空泛夸赞', en: 'generic praise or agreement opener',
      test: (t) => (PRAISE_EN.test(t.body) || PRAISE_ZH.test(t.body) ? (t.isReply ? 0.3 : 0.12) : 0) },
    { id: 'restate', zh: '复述原帖', en: 'the reply mostly repeats words from the post it answers',
      test: (t) => (t.isReply && t.parentText && overlap(t.body, t.parentText) >= 0.45 ? 0.22 : 0) },
    { id: 'reversal', zh: '“不是…而是…”句式', en: '"not X, but Y" / "it\'s not X, it\'s Y" reversal',
      test: (t) => (REVERSAL_EN.some((re) => re.test(t.text)) ? 0.3 : REVERSAL_ZH.test(t.text) ? 0.25 : NOT_ONLY_ZH.test(t.text) ? 0.12 : 0) },
    { id: 'emdash', zh: '破折号', en: 'em dashes (—) in a casual post',
      test: (t) => {
        if (t.cjk) return 0; // —— is normal Chinese punctuation
        const n = (t.text.match(/—|\s–\s/g) || []).length;
        return n >= 2 ? { w: 0.22, note: `${n}×` } : n === 1 ? 0.12 : 0;
      } },
    { id: 'hook', zh: '流量钩子句', en: 'viral hook formula',
      test: (t) => (HOOK_EN.test(t.text) || HOOK_ZH.test(t.text) ? 0.25 : 0) },
    { id: 'cta', zh: '互动诱导', en: 'engagement-bait call to action',
      test: (t) => (CTA_EN.test(t.text) || CTA_ZH.test(t.text) ? 0.2 : 0) },
    { id: 'funnel', zh: '引流私信', en: 'comment-to-get / DM funnel',
      test: (t) => (FUNNEL.test(t.text) ? 0.3 : 0) },
    { id: 'hustle', zh: '搞钱话术', en: 'hustle or money-funnel pitch',
      test: (t) => (HUSTLE.test(t.text) ? 0.28 : 0) },
    { id: 'listicle', zh: '清单体 / 串推', en: 'listicle or thread template',
      test: (t) => (THREAD.test(t.text) ? 0.25 : t.lines.filter((l) => LIST_ITEM.test(l)).length >= 3 ? 0.2 : 0) },
    { id: 'emoji_bullets', zh: 'emoji 当项目符号', en: 'emoji used as bullet points or headers',
      test: (t) => (t.lines.filter((l) => EMOJI_LEAD.test(l)).length >= 2 ? 0.22 : 0) },
    { id: 'vocab', zh: 'AI 高频词', en: 'cluster of LLM-favored words',
      test: (t) => {
        const words = [...uniqueMatches(t.text, VOCAB_EN), ...uniqueMatches(t.text, VOCAB_ZH)];
        const w = ladder(words.length, [0, 0.06, 0.16, 0.28, 0.4]);
        return w ? { w, note: words.slice(0, 6).join(', ') } : 0;
      } },
    { id: 'rhetorical', zh: '自问自答', en: 'self-answered rhetorical question ("The result? …")',
      test: (t) => (RHETORICAL_EN.test(t.text) || RHETORICAL_ZH.test(t.text) ? 0.18 : 0) },
    { id: 'tricolon', zh: '三连短句', en: 'staccato tricolon ("Faster. Smarter. Cheaper.")',
      test: (t) => (TRICOLON.test(t.text) ? 0.15 : 0) },
    { id: 'broetry', zh: '一句一行', en: 'one-sentence-per-line layout',
      test: (t) => {
        const lines = t.lines.filter((l) => l.trim());
        if (lines.length < 4) return 0;
        const gaps = (t.text.match(/\n\s*\n/g) || []).length;
        const short = lines.filter((l) => l.length <= 80).length / lines.length;
        return gaps >= 2 && short >= 0.8 ? 0.12 : 0;
      } },
    { id: 'hashtags', zh: '堆砌话题标签', en: 'hashtag stuffing',
      test: (t) => {
        const n = (t.text.match(/(?:^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
        return n >= 5 ? 0.25 : n >= 3 ? 0.15 : 0;
      } },
    { id: 'unicode_bold', zh: 'Unicode 花体字', en: 'Unicode bold or italic letters',
      test: (t) => (/[\u{1D400}-\u{1D7FF}]/u.test(t.text) ? 0.22 : 0) },
    { id: 'zh_scifi', zh: '科幻隐喻', en: 'DeepSeek-style sci-fi metaphors or showy words (量子纠缠 / 熵增 / 黑洞 / 嬗变)',
      test: (t) => {
        const hits = uniqueMatches(t.text, ZH_SCIFI);
        const w = ladder(hits.length, [0, 0.18, 0.3, 0.4]);
        return w ? { w, note: hits.slice(0, 4).join(', ') } : 0;
      } },
    { id: 'zh_dash', zh: '破折号', en: '—— dashes in a short Chinese post',
      test: (t) => {
        if (!t.cjk) return 0;
        const n = (t.text.match(/——/g) || []).length;
        return n >= 2 ? 0.15 : n === 1 && t.text.length < 160 ? 0.08 : 0;
      } },
    { id: 'zh_quoted_rule', zh: '「」概念引用', en: 'named ideas wrapped in 「」 and referred to as 这条 / 这点',
      test: (t) => {
        if (!t.cjk || TRADITIONAL.test(t.text)) return 0;
        const n = (t.text.match(/「[^」]{2,30}」/g) || []).length;
        return n >= 2 ? 0.18 : n === 1 && /」\s*(?:这条|这点|这个|这句|这一条)/.test(t.text) ? 0.15 : 0;
      } },
    { id: 'zh_label_colon', zh: '标签加冒号', en: 'label-plus-colon add-on (配套一条： / 关键一点： / 结论：)',
      test: (t) => (ZH_LABEL_COLON.test(t.text) ? 0.2 : 0) },
    { id: 'zh_pangu', zh: '中英文间加空格', en: 'neat spaces between Chinese and English words, rare in fast casual typing',
      test: (t) => (t.cjk && (t.text.match(CJK_LATIN_SPACED) || []).length >= 2 && !CJK_LATIN_TIGHT.test(t.text) ? 0.12 : 0) },
    { id: 'zh_precise', zh: '精确到可疑的数字', en: 'oddly precise numbers in an emotional scene (第七根睫毛 / 凌晨4:27)',
      test: (t) => (ZH_PRECISE.test(t.text) ? 0.15 : 0) },
    { id: 'zh_clickbait', zh: '震惊体标题', en: 'Chinese clickbait headline (震惊 / 突发 / 万万没想到 / 【】 header)',
      test: (t) => {
        const hits = uniqueMatches(t.text, ZH_CLICKBAIT);
        const w = ladder(hits.length, [0, 0.2, 0.32, 0.42]);
        return w ? { w, note: hits.slice(0, 4).join(', ') } : 0;
      } },
    { id: 'follow_farm', zh: '互关涨粉', en: 'follow-for-follow farming (互关 / 回关 / 求关注)',
      test: (t) => (ZH_FOLLOW_FARM.test(t.text) ? 0.6 : 0) },
    { id: 'crypto', zh: '撸毛带单', en: 'crypto shilling (撸毛 / 空投 / 带单 / 百倍)',
      test: (t) => (ZH_CRYPTO.test(t.text) ? 0.25 : 0) },
    { id: 'ad_voice', zh: '小红书营销腔', en: 'Xiaohongshu-style ad voice (家人们 / 绝绝子 / 闭眼入)',
      test: (t) => {
        const hits = uniqueMatches(t.text, ZH_AD_VOICE);
        const w = ladder(hits.length, [0, 0.1, 0.22, 0.32]);
        return w ? { w, note: hits.slice(0, 4).join(', ') } : 0;
      } },
    { id: 'zh_listicle', zh: '干货标题党', en: 'Chinese "ultimate guide" listicle bait (一文读懂 / 保姆级 / N 个技巧)',
      test: (t) => (ZH_LISTICLE.test(t.text) ? 0.25 : 0) },
    { id: 'repost', zh: '搬运洗稿', en: 'reposted second-hand story (据…报道 / 网传 / 网友爆料)',
      test: (t) => (ZH_REPOST.test(t.text) ? 0.12 : 0) },
    { id: 'blue_reply', zh: '蓝勾套话', en: 'paid blue-check account posting a generic reply',
      test: (t) => (t.badge === 'blue' && t.isReply && (PRAISE_EN.test(t.body) || PRAISE_ZH.test(t.body)) ? 0.2 : 0) },
    { id: 'name', zh: '营销号昵称', en: 'display name styled like a content farm or marketing brand',
      test: (t) => (t.name && MARKETING_NAME.test(t.name) ? 0.12 : 0) },
    { id: 'duplicate', zh: '重复刷屏', en: 'the same text was already seen under other posts in this session',
      test: (t) => (t.dupes > 0 ? 0.35 : 0) },
    { id: 'sycophancy', zh: '夸张溢美', en: 'sycophantic intensifiers',
      test: (t) => (t.isReply && t.text.length <= 320 && (SYCOPHANCY_EN.test(t.text) || SYCOPHANCY_ZH.test(t.text)) ? 0.12 : 0) },
  ];

  // ---------- entry point ----------

  function analyze(raw, ctx = {}) {
    const text = String(raw || '')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\r/g, '')
      .trim();
    const body = text.replace(/^(?:@\w{1,15}\s+)+/, '');
    const plain = body.replace(/https?:\/\/\S+/g, '').replace(/[@#][\w一-鿿]+/g, '').trim();
    const cjkChars = (plain.match(/[㐀-鿿]/g) || []).length;
    const t = {
      text,
      body,
      plain,
      lines: text.split('\n'),
      cjk: cjkChars > 0 && cjkChars / Math.max(1, plain.replace(/\s/g, '').length) > 0.3,
      isReply: !!ctx.isReply,
      parentText: ctx.parentText || '',
      badge: ctx.badge || '',
      name: ctx.name || '',
      dupes: ctx.dupes || 0,
    };

    const tells = [];
    let keep = 1;
    let hard = false;
    for (const rule of RULES) {
      const r = rule.test(t);
      const w = typeof r === 'number' ? r : r?.w || 0;
      if (!w) continue;
      const note = typeof r === 'object' ? r.note : '';
      tells.push({ id: rule.id, zh: rule.zh, en: note ? `${rule.en} (${note})` : rule.en, w });
      keep *= 1 - w;
      if (rule.hard) hard = true;
    }

    const human = [];
    for (const m of HUMAN) {
      if (m.re ? m.re.test(text) : m.test(t)) human.push({ id: m.id, zh: m.zh, en: m.en });
    }

    let score = (1 - keep) * Math.max(0.45, 0.78 ** human.length);
    if (hard) score = Math.max(score, 0.97);

    // Weighted visible length: a CJK character carries about two Latin letters of content.
    const visible = [...plain.replace(/\s+/g, '')].reduce((n, ch) => n + (/[㐀-鿿]/.test(ch) ? 2 : 1), 0);

    return {
      score: Math.round(score * 1000) / 1000,
      hard,
      tells,
      human,
      // Too short to judge and nothing suspicious: don't spend an API call on it.
      query: visible >= 24 || tells.length > 0,
    };
  }

  return { analyze };
})();
