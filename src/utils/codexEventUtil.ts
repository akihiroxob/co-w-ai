import type { ActivityEventKind } from "../types/StoryWorkflow";

type NormalizedCodexEvent = {
  kind: ActivityEventKind;
  title: string;
  detail: string;
  rawEvent?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
};

const pickString = (record: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return undefined;
};

const summarizeValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) => summarizeValue(item)).filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join(" | ") : undefined;
  }
  if (isRecord(value)) {
    const text =
      pickString(value, ["text", "message", "detail", "summary", "title", "status", "result", "error"]) ??
      summarizeValue(value.content) ??
      summarizeValue(value.payload);
    return text;
  }
  return asString(value);
};

const detectKind = (record: Record<string, unknown>): ActivityEventKind => {
  const label = pickString(record, ["kind", "type", "event", "name"])?.toLowerCase() ?? "";
  if (label.includes("error") || record.error) return "error";
  if (label.includes("tool") || record.tool_name || record.toolName || record.tool) return "tool";
  if (label.includes("result") || label.includes("completed") || label.includes("finished")) return "result";
  if (label.includes("message") || label.includes("assistant") || label.includes("user")) return "message";
  return "progress";
};

const detectToolName = (record: Record<string, unknown>): string | undefined => {
  const direct = pickString(record, ["tool_name", "toolName", "name"]);
  if (direct) return direct;
  if (isRecord(record.tool)) {
    return pickString(record.tool, ["name", "tool_name", "toolName"]);
  }
  return undefined;
};

export const normalizeCodexEvent = (event: unknown): NormalizedCodexEvent => {
  if (!isRecord(event)) {
    return {
      kind: "progress",
      title: "Codex Event",
      detail: summarizeValue(event) ?? "unstructured codex event",
      rawEvent: event,
    };
  }

  const kind = detectKind(event);
  const toolName = detectToolName(event);
  const title =
    kind === "tool"
      ? `Tool: ${toolName ?? "unknown"}`
      : kind === "message"
        ? "Message"
        : kind === "error"
          ? "Error"
          : kind === "result"
            ? "Result"
            : pickString(event, ["type", "event", "name"]) ?? "Progress";

  const detail =
    summarizeValue(event.message) ??
    summarizeValue(event.detail) ??
    summarizeValue(event.result) ??
    summarizeValue(event.error) ??
    summarizeValue(event.content) ??
    summarizeValue(event.payload) ??
    summarizeValue(event.args) ??
    summarizeValue(event.arguments) ??
    (toolName ? `${toolName} executed` : undefined) ??
    "codex event";

  return {
    kind,
    title,
    detail,
    rawEvent: event,
  };
};
