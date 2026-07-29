/**
 * 公开模型价格目录同步。
 *
 * 可靠匹配到的远程价格会按来源优先级批量覆盖 model_pricing。
 * 未匹配模型保留原本地价格；pricing_candidates 仅保留最近同步诊断。
 */
const db = require('./database');
const { buildAutomaticPricingPlan } = require('./pricing-logic');

const SOURCE_DEFS = [
  {
    key: 'models.dev',
    url: 'https://models.dev/api.json',
    kind: 'models-dev',
  },
  {
    key: 'LiteLLM',
    url: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
    kind: 'litellm',
  },
  {
    key: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/models',
    kind: 'openrouter',
  },
];

const FETCH_TIMEOUT_MS = 15000;
const SOURCE_PRIORITY = ['models.dev', 'LiteLLM', 'OpenRouter'];

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function perTokenToPerMillion(value) {
  return Math.max(0, finiteNumber(value) * 1e6);
}

function normalizeModelId(model) {
  return String(model || '').trim().toLowerCase();
}

function modelCandidates(model) {
  const result = [];
  const push = (value) => {
    const id = normalizeModelId(value);
    if (id && !result.includes(id)) result.push(id);
  };

  let id = normalizeModelId(model);
  push(id);
  const slash = id.lastIndexOf('/');
  if (slash >= 0) {
    id = id.slice(slash + 1);
    push(id);
  }
  id = id.replace(/:\d+$/, '').replace(/-v\d+$/, '');
  push(id);
  push(id.replace(/-\d{4}-\d{2}-\d{2}$/, ''));
  push(id.replace(/-\d{8}$/, ''));
  for (const candidate of result.slice()) push(candidate.replace(/\./g, '-'));
  return result;
}

function providerHint(model) {
  const id = normalizeModelId(model);
  if (id.startsWith('claude-')) return 'anthropic';
  if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) return 'openai';
  if (id.startsWith('gemini-')) return 'google';
  if (id.startsWith('deepseek-')) return 'deepseek';
  if (id.startsWith('qwen-')) return 'alibaba';
  if (id.startsWith('llama-')) return 'meta';
  return '';
}

function sourceRow(def, values) {
  const priceValues = [values.inputPerM, values.outputPerM, values.cacheReadPerM, values.cacheCreationPerM];
  if (!values.hasPricing || priceValues.some((value) => !Number.isFinite(value))) return null;
  return {
    source: def.key,
    sourceUrl: def.url,
    provider: values.provider || '',
    remoteModelId: values.remoteModelId,
    displayName: values.displayName || values.remoteModelId,
    inputPerM: Math.max(0, values.inputPerM),
    outputPerM: Math.max(0, values.outputPerM),
    cacheReadPerM: Math.max(0, values.cacheReadPerM),
    cacheCreationPerM: Math.max(0, values.cacheCreationPerM),
    tiers: Array.isArray(values.tiers) ? values.tiers : [],
  };
}

function parseModelsDev(payload, def) {
  const rows = [];
  for (const [provider, providerData] of Object.entries(payload || {})) {
    for (const [modelId, model] of Object.entries(providerData && providerData.models || {})) {
      const cost = model && model.cost;
      if (!cost || typeof cost !== 'object') continue;
      const hasPricing = ['input', 'output', 'cache_read', 'cache_write'].some((key) => cost[key] != null)
        || Array.isArray(cost.tiers);
      const row = sourceRow(def, {
        provider,
        remoteModelId: modelId,
        displayName: model.name,
        inputPerM: finiteNumber(cost.input),
        outputPerM: finiteNumber(cost.output),
        cacheReadPerM: finiteNumber(cost.cache_read),
        cacheCreationPerM: finiteNumber(cost.cache_write),
        tiers: cost.tiers || (cost.context_over_200k ? [{ minPromptTokens: 200000, ...cost.context_over_200k }] : []),
        hasPricing,
      });
      if (row) rows.push(row);
    }
  }
  return rows;
}

function parseLiteLLM(payload, def) {
  const rows = [];
  for (const [modelId, model] of Object.entries(payload || {})) {
    if (!model || typeof model !== 'object') continue;
    const hasPricing = [
      'input_cost_per_token',
      'output_cost_per_token',
      'cache_read_input_token_cost',
      'cache_creation_input_token_cost',
    ].some((key) => model[key] != null);
    const row = sourceRow(def, {
      provider: model.litellm_provider || '',
      remoteModelId: modelId,
      displayName: model.display_name || modelId,
      inputPerM: perTokenToPerMillion(model.input_cost_per_token),
      outputPerM: perTokenToPerMillion(model.output_cost_per_token),
      cacheReadPerM: perTokenToPerMillion(model.cache_read_input_token_cost),
      cacheCreationPerM: perTokenToPerMillion(model.cache_creation_input_token_cost),
      tiers: [
        model.input_cost_per_token_above_200k_tokens != null && {
          minPromptTokens: 200000,
          inputPerM: perTokenToPerMillion(model.input_cost_per_token_above_200k_tokens),
          outputPerM: perTokenToPerMillion(model.output_cost_per_token_above_200k_tokens),
          cacheReadPerM: perTokenToPerMillion(model.cache_read_input_token_cost_above_200k_tokens),
        },
        model.input_cost_per_token_above_272k_tokens != null && {
          minPromptTokens: 272000,
          inputPerM: perTokenToPerMillion(model.input_cost_per_token_above_272k_tokens),
          outputPerM: perTokenToPerMillion(model.output_cost_per_token_above_272k_tokens),
          cacheReadPerM: perTokenToPerMillion(model.cache_read_input_token_cost_above_272k_tokens),
        },
      ].filter(Boolean),
      hasPricing,
    });
    if (row) rows.push(row);
  }
  return rows;
}

function parseOpenRouter(payload, def) {
  const rows = [];
  for (const model of payload && payload.data || []) {
    const pricing = model && model.pricing;
    if (!pricing || typeof pricing !== 'object') continue;
    const hasPricing = ['prompt', 'completion', 'input_cache_read', 'input_cache_write'].some((key) => pricing[key] != null);
    const row = sourceRow(def, {
      provider: String(model.id || '').split('/')[0] || '',
      remoteModelId: model.id,
      displayName: model.name || model.id,
      inputPerM: perTokenToPerMillion(pricing.prompt),
      outputPerM: perTokenToPerMillion(pricing.completion),
      cacheReadPerM: perTokenToPerMillion(pricing.input_cache_read),
      cacheCreationPerM: perTokenToPerMillion(pricing.input_cache_write),
      tiers: Array.isArray(pricing.overrides) ? pricing.overrides : [],
      hasPricing,
    });
    if (row) rows.push(row);
  }
  return rows;
}

async function fetchJson(def) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(def.url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSource(def) {
  const payload = await fetchJson(def);
  const rows = def.kind === 'models-dev'
    ? parseModelsDev(payload, def)
    : def.kind === 'litellm'
      ? parseLiteLLM(payload, def)
      : parseOpenRouter(payload, def);
  return { def, rows };
}

function buildSourceIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    for (const candidate of modelCandidates(row.remoteModelId)) {
      const list = index.get(candidate) || [];
      list.push(row);
      index.set(candidate, list);
    }
  }
  return index;
}

function bestMatch(modelId, index) {
  const candidates = modelCandidates(modelId);
  const hint = providerHint(modelId);
  let best = null;
  candidates.forEach((candidate, candidateIndex) => {
    for (const row of index.get(candidate) || []) {
      const providerBonus = hint && (row.provider === hint || row.remoteModelId.startsWith(`${hint}/`)) ? 20 : 0;
      const score = 100 - candidateIndex * 10 + providerBonus;
      if (!best || score > best.score) best = { row, score };
    }
  });
  return best ? best.row : null;
}

function priceValues(row) {
  return [row.inputPerM, row.outputPerM, row.cacheReadPerM, row.cacheCreationPerM];
}

function pricesAgree(rows) {
  if (rows.length < 2) return false;
  const base = priceValues(rows[0]);
  return rows.slice(1).every((row) => priceValues(row).every((value, index) => {
    const diff = Math.abs(value - base[index]);
    return diff <= Math.max(0.001, Math.abs(base[index]) * 0.01);
  }));
}

function sameAsCurrent(current, candidate) {
  if (!current) return false;
  return priceValues(current).every((value, index) => Math.abs(value - priceValues(candidate)[index]) <= 0.001);
}

function listLocalModels() {
  const rows = db.prepare(`
    SELECT model AS modelId FROM usage_logs WHERE model <> ''
    UNION
    SELECT modelId FROM model_pricing WHERE modelId <> ''
    ORDER BY modelId
  `).all();
  return rows.map((row) => row.modelId);
}

function candidateFromMatches(modelId, matches, fetchedAt) {
  const ordered = matches.slice().sort((a, b) => SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source));
  const primary = ordered[0];
  const confidence = matches.length >= 2
    ? (pricesAgree(matches) ? 'verified' : 'conflict')
    : matches.length === 1 ? 'single-source' : 'unmatched';
  const current = db.prepare('SELECT * FROM model_pricing WHERE modelId = ?').get(modelId);
  const status = !primary
    ? 'unmatched'
    : confidence !== 'conflict' && sameAsCurrent(current, primary) ? 'matched' : 'pending';
  return {
    modelId,
    displayName: primary ? primary.displayName : (current && current.displayName) || modelId,
    inputPerM: primary ? primary.inputPerM : 0,
    outputPerM: primary ? primary.outputPerM : 0,
    cacheReadPerM: primary ? primary.cacheReadPerM : 0,
    cacheCreationPerM: primary ? primary.cacheCreationPerM : 0,
    source: primary ? primary.source : '',
    sourceUrl: primary ? primary.sourceUrl : '',
    provider: primary ? primary.provider : '',
    remoteModelId: primary ? primary.remoteModelId : '',
    confidence,
    status,
    fetchedAt,
    tiersJson: JSON.stringify(primary ? primary.tiers : []),
    sourcesJson: JSON.stringify(matches.map((row) => ({
      source: row.source,
      sourceUrl: row.sourceUrl,
      provider: row.provider,
      remoteModelId: row.remoteModelId,
      displayName: row.displayName,
      inputPerM: row.inputPerM,
      outputPerM: row.outputPerM,
      cacheReadPerM: row.cacheReadPerM,
      cacheCreationPerM: row.cacheCreationPerM,
    }))),
  };
}

async function syncPricing() {
  const fetchedAt = Math.floor(Date.now() / 1000);
  const results = await Promise.all(SOURCE_DEFS.map(async (def) => {
    try {
      const result = await fetchSource(def);
      return { source: def.key, url: def.url, ok: true, count: result.rows.length, rows: result.rows };
    } catch (error) {
      return { source: def.key, url: def.url, ok: false, count: 0, error: error.message, rows: [] };
    }
  }));

  const successCount = results.filter((result) => result.ok).length;
  if (!successCount) {
    throw new Error(results.map((result) => `${result.source}: ${result.error}`).join('；'));
  }

  const indexes = results.map((result) => ({ result, index: buildSourceIndex(result.rows) }));
  const candidates = listLocalModels().map((modelId) => {
    const matches = indexes.map(({ index }) => bestMatch(modelId, index)).filter(Boolean);
    return candidateFromMatches(modelId, matches, fetchedAt);
  });

  const plan = buildAutomaticPricingPlan(candidates);
  const applyModel = db.prepare(`
    INSERT INTO model_pricing
      (modelId, displayName, inputPerM, outputPerM, cacheReadPerM, cacheCreationPerM,
       source, sourceUrl, provider, confidence, fetchedAt, pricingVersion, tiersJson)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(modelId) DO UPDATE SET
      displayName = excluded.displayName,
      inputPerM = excluded.inputPerM,
      outputPerM = excluded.outputPerM,
      cacheReadPerM = excluded.cacheReadPerM,
      cacheCreationPerM = excluded.cacheCreationPerM,
      source = excluded.source,
      sourceUrl = excluded.sourceUrl,
      provider = excluded.provider,
      confidence = excluded.confidence,
      fetchedAt = excluded.fetchedAt,
      pricingVersion = excluded.pricingVersion,
      tiersJson = excluded.tiersJson
  `);
  const insertCandidate = db.prepare(`
    INSERT INTO pricing_candidates
      (modelId, displayName, inputPerM, outputPerM, cacheReadPerM, cacheCreationPerM,
       source, sourceUrl, provider, remoteModelId, confidence, status, fetchedAt, tiersJson, sourcesJson)
    VALUES (@modelId, @displayName, @inputPerM, @outputPerM, @cacheReadPerM, @cacheCreationPerM,
       @source, @sourceUrl, @provider, @remoteModelId, @confidence, @status, @fetchedAt, @tiersJson, @sourcesJson)
  `);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM pricing_candidates').run();
    const appliedIds = new Set(plan.apply.map((candidate) => candidate.modelId));
    for (const candidate of candidates) {
      insertCandidate.run({
        ...candidate,
        status: appliedIds.has(candidate.modelId) ? 'applied' : candidate.status,
      });
    }
    for (const candidate of plan.apply) {
      applyModel.run(
        candidate.modelId, candidate.displayName, candidate.inputPerM, candidate.outputPerM,
        candidate.cacheReadPerM, candidate.cacheCreationPerM, candidate.source, candidate.sourceUrl,
        candidate.provider, candidate.confidence, candidate.fetchedAt,
        `${candidate.source || 'remote'}:${candidate.fetchedAt}`, candidate.tiersJson
      );
    }
  });
  tx();

  return {
    fetchedAt,
    sources: results.map(({ source, url, ok, count, error }) => ({ source, url, ok, count, error: error || '' })),
    total: plan.total,
    applied: plan.applied,
    unchanged: plan.unchanged,
    unmatched: plan.unmatched,
    conflicts: plan.conflicts,
  };
}

// 已移除 getCandidates / applyCandidate：候选列表与逐条应用只服务旧 Usage 页面，
// 现在 syncPricing 会直接覆盖可靠匹配项。pricing_candidates 表仍写入，用作同步诊断。

module.exports = {
  syncPricing,
};
