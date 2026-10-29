// Shared by the background worker and the content script.
const SF = {
  DEFAULT_SETTINGS: {
    enabled: true,
    sensitivity: 'balanced', // relaxed | balanced | strict
    action: 'collapse', // collapse | hide
    blueStrict: true, // paid blue-check authors face a lower bar
    model: 'jev-latest',
    corner: 'br', // where the capsule sits: tl | tr | bl | br
    trusted: [], // lower-case handles that are never blocked
  },

  // Final score needed to block a post, per sensitivity.
  THRESHOLDS: { relaxed: 0.74, balanced: 0.62, strict: 0.5 },

  // Without a Jev verdict, local rules alone only block above this bar.
  LOCAL_ONLY_MIN: 0.72,

  // How much lower the bar is for blue-check authors when 蓝勾从严 is on.
  BLUE_STRICT: 0.08,

  KIND_LABELS: {
    engagement_reply: '套话回复',
    hook_thread: '流量钩子',
    hustle_funnel: '引流话术',
    marketing_account: '营销号',
    ai_essay_voice: 'AI 腔',
    chatbot_leftover: 'AI 残留',
  },

  // Jev carries most of the weight; local tells nudge borderline cases.
  // A hard local tell (pasted chatbot output) wins on its own.
  blend(local, remote) {
    if (local.hard) return Math.max(local.score, remote?.jev ?? 0);
    if (typeof remote?.jev !== 'number') return local.score;
    return 0.7 * remote.jev + 0.3 * local.score;
  },
};
