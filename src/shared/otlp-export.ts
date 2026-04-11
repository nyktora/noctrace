/**
 * Convert noctrace session data to OpenTelemetry Protocol (OTLP) JSON format.
 * Zero-dependency — formats WaterfallRow[] as OTLP trace spans.
 */
import type { WaterfallRow } from './types.js';

/** OTLP span status code for OK */
const STATUS_OK = 1;
/** OTLP span status code for ERROR */
const STATUS_ERROR = 2;

/** Convert Unix ms timestamp to OTLP nanosecond string */
function toNanos(ms: number): string {
  return (BigInt(ms) * BigInt(1_000_000)).toString();
}

/** Generate a 16-byte hex trace ID from session ID */
function traceIdFromSession(sessionId: string): string {
  const hex = sessionId.replace(/[^a-f0-9]/gi, '');
  return (hex + '0'.repeat(32)).slice(0, 32);
}

/** Generate an 8-byte hex span ID from row ID */
function spanIdFromRow(rowId: string): string {
  const hex = rowId.replace(/[^a-f0-9]/gi, '');
  return (hex + '0'.repeat(16)).slice(0, 16);
}

/** A single OTLP attribute key/value pair */
interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean; doubleValue?: number };
}

function strAttr(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { intValue: String(value) } };
}

function boolAttr(key: string, value: boolean): OtlpAttribute {
  return { key, value: { boolValue: value } };
}

function doubleAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { doubleValue: value } };
}

/** Convert a WaterfallRow to an OTLP span object */
function rowToSpan(
  row: WaterfallRow,
  sessionId: string,
  parentSpanId: string | null,
): Record<string, unknown> {
  const traceId = traceIdFromSession(sessionId);
  const spanId = spanIdFromRow(row.id);
  const endTime = row.endTime ?? row.startTime;

  const attributes: OtlpAttribute[] = [
    strAttr('tool.name', row.toolName),
    strAttr('tool.type', row.type),
    strAttr('tool.label', row.label),
    strAttr('tool.status', row.status),
    intAttr('token.input', row.inputTokens),
    intAttr('token.output', row.outputTokens),
    intAttr('token.delta', row.tokenDelta),
    doubleAttr('context.fill_percent', row.contextFillPercent),
    boolAttr('tool.is_reread', row.isReread),
    boolAttr('tool.is_failure', row.isFailure),
  ];

  if (row.modelName) attributes.push(strAttr('model.name', row.modelName));
  if (row.estimatedCost != null) attributes.push(doubleAttr('cost.usd', row.estimatedCost));
  if (row.agentType) attributes.push(strAttr('agent.type', row.agentType));
  if (row.isFastMode) attributes.push(boolAttr('model.fast_mode', true));
  if (row.duration != null) attributes.push(intAttr('duration_ms', row.duration));

  const span: Record<string, unknown> = {
    traceId,
    spanId,
    name: row.type === 'agent' ? `agent.${row.toolName}` : `tool.${row.toolName}`,
    kind: 1, // SPAN_KIND_INTERNAL
    startTimeUnixNano: toNanos(row.startTime),
    endTimeUnixNano: toNanos(endTime),
    attributes,
    status: {
      code: row.status === 'error' ? STATUS_ERROR : STATUS_OK,
      ...(row.status === 'error' && row.output ? { message: row.output.slice(0, 256) } : {}),
    },
  };

  if (parentSpanId) {
    span['parentSpanId'] = parentSpanId;
  }

  return span;
}

/** Recursively flatten rows and their children into a flat array of OTLP spans */
function flattenSpans(
  rows: WaterfallRow[],
  sessionId: string,
  parentSpanId: string | null,
): Record<string, unknown>[] {
  const spans: Record<string, unknown>[] = [];
  for (const row of rows) {
    const spanId = spanIdFromRow(row.id);
    spans.push(rowToSpan(row, sessionId, parentSpanId));
    if (row.children.length > 0) {
      spans.push(...flattenSpans(row.children, sessionId, spanId));
    }
  }
  return spans;
}

/**
 * Convert a noctrace session to OTLP/HTTP JSON trace export format.
 * The output can be POSTed directly to any OTLP/HTTP collector at /v1/traces.
 *
 * @param rows - Parsed waterfall rows from parseJsonlContent()
 * @param sessionId - Session UUID used to derive the OTLP trace ID
 */
export function sessionToOtlp(rows: WaterfallRow[], sessionId: string): Record<string, unknown> {
  const spans = flattenSpans(rows, sessionId, null);

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            strAttr('service.name', 'noctrace'),
            strAttr('service.version', '0.7.5'),
            strAttr('session.id', sessionId),
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'noctrace', version: '0.7.5' },
            spans,
          },
        ],
      },
    ],
  };
}
