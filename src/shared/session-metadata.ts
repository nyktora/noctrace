/**
 * Session metadata parsers extracted from JSONL content.
 * Supplements parser.ts with functions that extract session-level metadata
 * (result metrics, init context) from JSONL records.
 */
import type { CompactionBoundary, SessionResultMetrics, ModelUsageEntry, SessionInitContext } from './types.js';

function isObj(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Extract compaction boundaries with optional metadata from JSONL content.
 * Returns CompactionBoundary[] with trigger type and pre-compaction token count.
 */
export function parseCompactionBoundaries(content: string): CompactionBoundary[] {
  const lines = content.split('\n');
  const out: CompactionBoundary[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(t); } catch { continue; }
    if (!isObj(parsed)) continue;
    if (parsed['type'] !== 'system') continue;
    if (parsed['subtype'] !== 'compact_boundary') continue;

    const timestamp = typeof parsed['timestamp'] === 'string'
      ? new Date(parsed['timestamp']).getTime() : Date.now();

    // Extract compact_metadata if present
    const meta = isObj(parsed['compact_metadata']) ? parsed['compact_metadata'] : null;
    const trigger = meta && (meta['trigger'] === 'manual' || meta['trigger'] === 'auto')
      ? (meta['trigger'] as 'manual' | 'auto') : null;
    const preTokens = meta && typeof meta['pre_tokens'] === 'number' ? meta['pre_tokens'] : null;

    out.push({ timestamp, trigger, preTokens });
  }
  return out;
}

/**
 * Parse the terminal result record from JSONL content.
 * Extracts duration_api_ms, modelUsage, stop_reason, permission_denials.
 */
export function parseSessionResultMetrics(content: string): SessionResultMetrics {
  const defaults: SessionResultMetrics = {
    durationApiMs: null,
    modelUsage: [],
    stopReason: null,
    permissionDenialCount: 0,
  };

  const lines = content.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(t); } catch { continue; }
    if (!isObj(parsed)) continue;
    if (parsed['type'] !== 'result') continue;

    // duration_api_ms
    if (typeof parsed['duration_api_ms'] === 'number') {
      defaults.durationApiMs = parsed['duration_api_ms'];
    }

    // stop_reason
    const sr = parsed['stop_reason'];
    if (sr === 'end_turn' || sr === 'max_tokens' || sr === 'refusal') {
      defaults.stopReason = sr;
    }

    // permission_denials
    if (Array.isArray(parsed['permission_denials'])) {
      defaults.permissionDenialCount = parsed['permission_denials'].length;
    }

    // modelUsage — { [modelName]: { input_tokens, output_tokens, cache_read_input_tokens?, cache_creation_input_tokens? } }
    const mu = parsed['modelUsage'];
    if (isObj(mu)) {
      const entries: ModelUsageEntry[] = [];
      for (const [model, usage] of Object.entries(mu)) {
        if (!isObj(usage)) continue;
        entries.push({
          model,
          inputTokens: typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : 0,
          outputTokens: typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : 0,
          cacheReadTokens: typeof usage['cache_read_input_tokens'] === 'number' ? usage['cache_read_input_tokens'] : 0,
          cacheCreateTokens: typeof usage['cache_creation_input_tokens'] === 'number' ? usage['cache_creation_input_tokens'] : 0,
        });
      }
      defaults.modelUsage = entries;
    }

    // Only one result record per session — stop scanning
    break;
  }

  return defaults;
}

/**
 * Parse session init context (agents, skills, plugins, effort) from JSONL content.
 * Reads the first system init record.
 */
export function parseInitContext(content: string): SessionInitContext {
  const defaults: SessionInitContext = { agents: [], skills: [], plugins: [], effort: null };

  const lines = content.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(t); } catch { continue; }
    if (!isObj(parsed)) continue;
    if (parsed['type'] !== 'system') continue;

    // Match init records — subtype may be 'init' or absent on the first system record
    const subtype = parsed['subtype'];
    if (subtype !== undefined && subtype !== 'init') continue;

    // agents
    if (Array.isArray(parsed['agents'])) {
      defaults.agents = parsed['agents'].filter((a): a is string => typeof a === 'string');
    }

    // skills
    if (Array.isArray(parsed['skills'])) {
      defaults.skills = parsed['skills'].filter((s): s is string => typeof s === 'string');
    }

    // plugins
    if (Array.isArray(parsed['plugins'])) {
      for (const p of parsed['plugins']) {
        if (isObj(p) && typeof p['name'] === 'string') {
          defaults.plugins.push({
            name: p['name'],
            path: typeof p['path'] === 'string' ? p['path'] : '',
          });
        }
      }
    }

    // effort level
    if (typeof parsed['effort'] === 'string') {
      defaults.effort = parsed['effort'];
    }
    // Also check nested config field where effort might appear
    if (defaults.effort === null && isObj(parsed['config'])) {
      const config = parsed['config'];
      if (typeof config['effort'] === 'string') {
        defaults.effort = config['effort'];
      }
    }

    // Only read the first init record
    break;
  }

  return defaults;
}
