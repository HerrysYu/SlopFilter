// A fake api.typesafe.ai for tests, shared by the in-page mock and the e2e server.
// It validates request bodies against the rules in the API reference and
// answers from the `jev` value of the matching sample post.

const KINDS = ['engagement_reply', 'hook_thread', 'hustle_funnel', 'ai_essay_voice', 'chatbot_leftover', 'human'];
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function validate(body) {
  const errs = [];
  if (typeof body?.model !== 'string') errs.push({ loc: ['body', 'model'], msg: 'field required' });
  if (body?.state == null) errs.push({ loc: ['body', 'state'], msg: 'field required' });
  const qs = body?.questions;
  if (!qs || typeof qs !== 'object' || !Object.keys(qs).length) errs.push({ loc: ['body', 'questions'], msg: 'at least 1 question' });
  for (const [name, q] of Object.entries(qs || {})) {
    const at = ['body', 'questions', name];
    if (!['noul', 'choice', 'score'].includes(q.type)) errs.push({ loc: [...at, 'type'], msg: 'unknown type' });
    if (q.type === 'noul' && q.criteria && Object.keys(q.criteria).some((k) => k !== 'true' && k !== 'false')) errs.push({ loc: [...at, 'criteria'], msg: 'only true/false keys' });
    if (q.type === 'choice') {
      const n = Object.keys(q.criteria || {}).length;
      if (n < 1 || n > 255) errs.push({ loc: [...at, 'criteria'], msg: 'choice needs 1-255 options' });
    }
    if (q.type === 'score' && !(Array.isArray(q.criteria) && q.criteria.length >= 1 && q.criteria.length <= 10)) errs.push({ loc: [...at, 'criteria'], msg: 'score needs 1-10 levels' });
  }
  return errs;
}

export function fakeJev(samples) {
  const api = { calls: 0, lastRequest: null, requests: [] };

  // Returns { status, json }.
  api.handle = ({ method = 'GET', path, key, body }) => {
    if (!String(key || '').startsWith('ts_')) return { status: 401, json: { detail: 'Invalid API key' } };

    if (method === 'GET' && path === '/v1/models') {
      return {
        status: 200,
        json: {
          models: [
            { name: 'jev-latest', description: 'Alias of jev-1.14.0', release_date: '2026-10-08' },
            { name: 'jev-preview', description: 'Newest build', release_date: '2026-10-22' },
            { name: 'jev-1.14.0', description: 'System One decision model', release_date: '2026-10-08' },
          ],
        },
      };
    }

    if (method === 'POST' && path === '/v1/systemone') {
      const errs = validate(body);
      if (errs.length) return { status: 422, json: { detail: errs } };
      api.calls++;
      api.lastRequest = body;
      api.requests.push(body);
      if (api.requests.length > 100) api.requests.shift();
      const text = norm(body.state?.post_text);
      const sample = samples.find((s) => norm(s.text).slice(0, 40) === text.slice(0, 40));
      const p = sample?.jev ?? 0.3;
      const kind = sample?.kind ?? 'human';
      const probabilities = {};
      for (const k of KINDS) {
        if (k === 'human') probabilities[k] = 1 - p;
        else if (kind === 'human') probabilities[k] = p / 5;
        else probabilities[k] = k === kind ? p * 0.85 : (p * 0.15) / 4;
      }
      const best = KINDS.reduce((a, b) => (probabilities[b] > probabilities[a] ? b : a));
      return {
        status: 200,
        json: {
          model: 'jev-1.14.0',
          answers: {
            is_ai_slop: { type: 'noul', noul: p },
            slop_kind: { type: 'choice', choice: best, confidence: probabilities[best], probabilities },
            human_texture: { type: 'noul', noul: Math.min(1, Math.max(0, 1 - p)) },
          },
          usage: { input_tokens: Math.round(JSON.stringify(body).length / 4), output_tokens: 0 },
        },
        sample,
      };
    }

    return { status: 404, json: { detail: 'Not found' } };
  };

  return api;
}
