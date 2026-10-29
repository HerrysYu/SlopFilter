// Hand-written sample posts used by the heuristics test and the mock timeline.
// `slop` is the label we expect; `jev` is what the fake Jev in the mock returns.
export const SAMPLES = [
  {
    id: '1850000000000000001', handle: 'growthwithmia', name: 'Mia | Growth', verified: true, slop: true, jev: 0.94, kind: 'engagement_reply',
    reply: true, parent: 'Building in public for two years taught me that consistency beats intensity every single time.',
    text: 'Great insight! Consistency truly is the key to long-term success. This is a game-changer for anyone building in public 🚀',
  },
  {
    id: '1850000000000000002', handle: 'ai_visionary', name: 'AI Visionary', verified: true, slop: true, jev: 0.9, kind: 'ai_essay_voice',
    text: "AI isn't just a tool — it's a mindset shift.\n\nThe companies that win won't be the ones with the best models.\n\nThey'll be the ones that move fastest.\n\nLet that sink in.",
  },
  {
    id: '1850000000000000003', handle: 'productivityhq', name: 'Productivity HQ', verified: false, slop: true, jev: 0.86, kind: 'hook_thread',
    text: "Here's the thing nobody tells you about productivity:\n\n🚀 Focus beats hustle\n💡 Systems beat goals\n✅ Rest is part of the work\n\nWhat would you add? 👇",
  },
  {
    id: '1850000000000000004', handle: 'promptking', name: 'Prompt King', verified: true, slop: true, jev: 0.95, kind: 'hustle_funnel',
    text: '10 ChatGPT prompts that will replace your $5k/month marketing agency:\n\n1. The brand voice cloner\n2. The 30-day content calendar\n3. The cold email rewriter\n\nComment "PROMPT" and I\'ll DM you the full list.',
  },
  {
    id: '1850000000000000005', handle: 'wellness_daily', name: 'Wellness Daily', verified: false, slop: true, jev: 0.97, kind: 'chatbot_leftover',
    text: 'Certainly! Here\'s a tweet about the importance of mental health: "Taking care of your mind is just as important as taking care of your body. #MentalHealth #SelfCare #Wellness"',
  },
  {
    id: '1850000000000000006', handle: 'kejiqianyan', name: '科技前沿观察', verified: true, slop: true, jev: 0.83, kind: 'ai_essay_voice', lang: 'zh',
    text: '这不仅仅是一次技术升级，更是一场深刻的范式变革。在当今AI飞速发展的时代，我们每个人都需要重新思考自己的定位。值得注意的是，真正的竞争力来自于持续学习。你怎么看？',
  },
  {
    id: '1850000000000000007', handle: 'zhishi_fenxiang', name: '知识分享官', verified: false, slop: true, jev: 0.78, kind: 'engagement_reply', lang: 'zh',
    reply: true, parent: '今天把家里的旧路由器换成了 Wi-Fi 7，卧室终于能跑满千兆了。',
    text: '说得太好了！非常有见地的分享，感谢！🙏',
  },
  {
    id: '1850000000000000008', handle: 'futureofwork_ai', name: 'Future of Work', verified: true, slop: true, jev: 0.92, kind: 'ai_essay_voice',
    text: "In today's fast-paced digital landscape, leveraging AI isn't optional—it's essential. The future belongs to those who adapt. Are you ready? #AI #Innovation #FutureOfWork",
  },
  {
    id: '1850000000000000009', handle: 'dana_codes', name: 'Dana', verified: false, slop: false, jev: 0.04, kind: 'human',
    text: 'lmao my cat just knocked my coffee onto the keyboard during standup, had to finish the call on my phone 😭',
  },
  {
    id: '1850000000000000010', handle: 'nyc_commuter', name: 'Sam', verified: false, slop: false, jev: 0.03, kind: 'human',
    text: "anyone else's train stuck outside 34th st for like 20 min? mta pls",
  },
  {
    id: '1850000000000000011', handle: 'priya_ships', name: 'Priya', verified: false, slop: false, jev: 0.12, kind: 'human',
    text: 'Shipped the new billing page today. Took 3 tries to get the Stripe webhook retries right — the docs are wrong about idempotency keys btw',
  },
  {
    id: '1850000000000000012', handle: 'laowang_tucao', name: '老王吐槽', verified: false, slop: false, jev: 0.05, kind: 'human', lang: 'zh',
    text: '我真的会谢，排了两个小时队结果说今天的号放完了，草',
  },
  {
    id: '1850000000000000013', handle: 'markets_now', name: 'Markets Now', verified: true, slop: false, jev: 0.18, kind: 'human',
    text: 'This is wild. The Fed just cut rates by 50bps, first cut of that size since 2020.',
  },
  {
    id: '1850000000000000014', handle: 'tabs_forever', name: 'Theo', verified: false, slop: false, jev: 0.08, kind: 'human',
    text: 'Hot take: tabs > spaces and I will die on this hill',
  },
  {
    id: '1850000000000000015', handle: 'old_maintainer', name: 'Rui', verified: false, slop: false, jev: 0.06, kind: 'human',
    reply: true, parent: 'Is the new caching layer in v3 actually faster or is it just marketing?',
    text: 'lol no. the 2019 version had the same bug, we reverted it in like a week',
  },
  {
    id: '1850000000000000016', handle: 'berlin_hiring', name: 'Jonas', verified: false, slop: false, jev: 0.21, kind: 'human',
    text: 'Our team is hiring a senior backend engineer in Berlin. Rust + Postgres, hybrid. DM me if interested.',
  },
  // Chinese blue-check marketing accounts (蓝勾营销号)
  {
    id: '1850000000000000017', handle: 'redian_guancha', name: '热点观察局', verified: true, slop: true, jev: 0.88, kind: 'marketing_account', lang: 'zh',
    text: '【突发】万万没想到！某大厂刚刚宣布全员降薪30%，网友炸锅了……细思极恐，你怎么看？',
  },
  {
    id: '1850000000000000018', handle: 'zhineng_shuo', name: '智能说', verified: true, slop: true, jev: 0.8, kind: 'engagement_reply', lang: 'zh',
    reply: true, parent: '刚把用了十年的 ThinkPad 换掉，新电脑开机只要 5 秒，有点感动',
    text: '确实如此，这个观点很有深度，值得我们每个人深思。',
  },
  {
    id: '1850000000000000019', handle: 'hugua_zhushou', name: '互关小助手🔥', verified: true, slop: true, jev: 0.9, kind: 'marketing_account', lang: 'zh',
    text: '蓝V互关🔥 新号求关注，有关必回！#互关 #互粉 #涨粉',
  },
  {
    id: '1850000000000000020', handle: 'bi_quan_ge', name: '币圈老哥💰', verified: true, slop: true, jev: 0.9, kind: 'marketing_account', lang: 'zh',
    text: '家人们！这个土狗刚开盘，百倍潜力，白名单最后50个，私信我上车🚀🚀 进群看置顶',
  },
  {
    id: '1850000000000000021', handle: 'xiaozhou_hz', name: '小周', verified: true, slop: false, jev: 0.06, kind: 'human', lang: 'zh',
    text: '上周去杭州出差，顺路去了趟灵隐寺，排队排了一个小时，下次再也不周末去了',
  },
  // Chinese AI voice (AI腔)
  {
    id: '1850000000000000022', handle: 'yeban_sikao', name: '夜半思考', verified: true, slop: true, jev: 0.86, kind: 'ai_essay_voice', lang: 'zh',
    text: '凌晨两点的写字楼——屏幕蓝光在视网膜上投下生活的褶皱。我们都是困在熵增里的人。真正的成长，从来不是逃离，而是温柔地接住那个疲惫的自己。愿你被看见。',
  },
  {
    id: '1850000000000000023', handle: 'tianwen_xiaoli', name: '小李看星星', verified: false, slop: false, jev: 0.07, kind: 'human', lang: 'zh',
    text: '今晚天文馆讲黑洞，我儿子全程追着讲解员问问题，回家路上还在念叨事件视界，笑死',
  },
  {
    id: '1850000000000000024', handle: 'agent_notes', name: 'Agent 笔记', verified: true, slop: true, jev: 0.82, kind: 'ai_essay_voice', lang: 'zh',
    reply: true, parent: '整理了一份用 Claude Code 的十条经验，最有用的是让它每半个月做一次记忆大扫除',
    text: '「每半个月做一次记忆大扫除」这条被普遍忽略——规则文件不是写完就完，过时规则会反过来指挥现在的活。配套一条：进 AGENTS.md 的东西都该带日期和复审周期，和「否决过的方案留档」一样，都是要维护的资产不是一次性提示词',
  },
  {
    id: '1850000000000000025', handle: 'chen_dev', name: '老陈', verified: false, slop: false, jev: 0.08, kind: 'human', lang: 'zh',
    text: '是不是只有我觉得新版cursor的补全变慢了，昨天改个css等了半天，回滚到上个版本就好了',
  },
];
