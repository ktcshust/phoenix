import { Text } from "@phoenix/components";
import {
  jsonStringToFlatObject,
  flattenObject,
  safelyParseJSONString,
} from "@phoenix/utils/jsonUtils";

type AgentResponseCellProps = {
  spanKind: string;
  metadata: unknown;
  parentMetadata?: unknown;
  isAdditionalSpansRow?: boolean;
};

type ParsedAgentResponse = {
  hasClarification: boolean;
  hasAnswerStatus: boolean;
  answerStatusValue: string | undefined;
  reflectionScore: number | undefined;
  actionValue: string | undefined;
  intentCount: number | undefined;
};

export function parseAgentMetadata(metadata: unknown): ParsedAgentResponse {
  let hasClarification = false;
  let hasAnswerStatus = false;
  let answerStatusValue: string | undefined = undefined;
  let reflectionScore: number | undefined = undefined;
  // eslint-disable-next-line prefer-const -- reassigned inside try block
  let actionValue: string | undefined = undefined;
  // eslint-disable-next-line prefer-const -- reassigned inside try block
  let intentCount: number | undefined = undefined;

  try {
    let parsedMetadata: Record<string, string | boolean | number> = {};

    if (typeof metadata === "string") {
      parsedMetadata = jsonStringToFlatObject(metadata);
      if (Object.keys(parsedMetadata).length === 0) {
        const loose = safelyParseJSONString(metadata);
        if (typeof loose === "object" && loose !== null) {
          parsedMetadata = flattenObject({ obj: loose as object });
        }
      }
    } else if (typeof metadata === "object" && metadata !== null) {
      parsedMetadata = flattenObject({ obj: metadata as object });
    }

    // keys used by ebot: clarification, answer_status, reflection_score
    hasClarification =
      "ebot.clarification" in parsedMetadata ||
      "ebot.clarify" in parsedMetadata ||
      "clarification" in parsedMetadata;
    hasAnswerStatus =
      "ebot.answer_status" in parsedMetadata ||
      "answer_status" in parsedMetadata;

    const rawStatus =
      parsedMetadata["ebot.answer_status"] ?? parsedMetadata["answer_status"];
    if (rawStatus !== undefined && rawStatus !== null) {
      answerStatusValue = String(rawStatus).toUpperCase();
    }

    const score =
      parsedMetadata["ebot.reflection_score"] ??
      parsedMetadata["reflection_score"];
    if (score !== undefined && score !== null && !Number.isNaN(Number(score))) {
      reflectionScore = Number(score);
    }

    const rawAction = parsedMetadata["ebot.action"] ?? parsedMetadata["action"];
    if (rawAction !== undefined && rawAction !== null) {
      actionValue = String(rawAction).toLowerCase();
    }

    const rawIntentCount =
      parsedMetadata["ebot.intent_count"] ?? parsedMetadata["intent_count"];
    if (
      rawIntentCount !== undefined &&
      rawIntentCount !== null &&
      !Number.isNaN(Number(rawIntentCount))
    ) {
      intentCount = Number(rawIntentCount);
    }
  } catch (_e) {
    // Ignore parse errors
  }

  return {
    hasClarification,
    hasAnswerStatus,
    answerStatusValue,
    reflectionScore,
    actionValue,
    intentCount,
  };
}

export function resolveStatus(parsed: ParsedAgentResponse): {
  statusText: string;
  color: "danger" | "warning" | "success";
} {
  const {
    hasClarification,
    hasAnswerStatus,
    answerStatusValue,
    reflectionScore,
    actionValue,
  } = parsed;

  if (actionValue === "direct_answer") {
    return { statusText: "DIRECT ANSWER", color: "success" };
  }

  if (!hasClarification && !hasAnswerStatus) {
    return { statusText: "FAILED", color: "danger" };
  } else if (hasClarification) {
    return { statusText: "CLARIFICATION", color: "warning" };
  } else if (hasAnswerStatus) {
    if (answerStatusValue === "TIMEOUT") {
      return { statusText: "TIMEOUT", color: "warning" };
    } else if (answerStatusValue === "FAILED") {
      return { statusText: "FAILED", color: "danger" };
    } else {
      // FULFILLED or other values → check reflection score
      if (reflectionScore !== undefined && reflectionScore < 75) {
        return { statusText: "NOT FOUND", color: "danger" };
      }
      return { statusText: "SUCCESS", color: "success" };
    }
  }
  return { statusText: "FAILED", color: "danger" };
}

export const AgentResponseCell = ({
  spanKind,
  metadata,
  parentMetadata,
  isAdditionalSpansRow,
}: AgentResponseCellProps) => {
  if (isAdditionalSpansRow) {
    return null;
  }

  // spanKind values come from GraphQL as lowercase (e.g. "agent", "llm").
  // Accept case-insensitively to avoid mismatches.
  if (!spanKind || String(spanKind).toLowerCase() !== "agent") {
    return <Text color="text-400">--</Text>;
  }

  // Parse own metadata first
  let parsed = parseAgentMetadata(metadata);

  // If own metadata has no ebot keys, fall back to parent metadata
  if (!parsed.hasClarification && !parsed.hasAnswerStatus && parentMetadata) {
    parsed = parseAgentMetadata(parentMetadata);
  }

  const { statusText, color } = resolveStatus(parsed);

  return <Text color={color}>{statusText}</Text>;
};
