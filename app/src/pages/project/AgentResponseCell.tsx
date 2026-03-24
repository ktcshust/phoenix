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
  reflectionScore: number[] | undefined;
  actionValue: string | undefined;
  intentCount: number | undefined;
};

export function parseAgentMetadata(metadata: unknown): ParsedAgentResponse {
  let hasClarification = false;
  let hasAnswerStatus = false;
  let answerStatusValue: string | undefined = undefined;
  let reflectionScore: number[] | undefined = undefined;
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

    // reflection_score can be a single value or an array (flattened as .0, .1, …)
    // When flattenObject processes an array, the parent key is removed and only
    // indexed keys (e.g. ebot.reflection_score.0) remain, so we must also
    // detect the prefix from those indexed keys.
    let scorePrefix: string | undefined =
      "ebot.reflection_score" in parsedMetadata
        ? "ebot.reflection_score"
        : "reflection_score" in parsedMetadata
          ? "reflection_score"
          : undefined;
    if (!scorePrefix) {
      // Check for indexed keys produced by flattenObject on arrays
      for (const k of Object.keys(parsedMetadata)) {
        if (k.match(/^ebot\.reflection_score\.\d+$/)) {
          scorePrefix = "ebot.reflection_score";
          break;
        }
        if (k.match(/^reflection_score\.\d+$/)) {
          scorePrefix = "reflection_score";
          break;
        }
      }
    }
    if (scorePrefix) {
      const directVal = parsedMetadata[scorePrefix];
      if (directVal !== undefined && !Number.isNaN(Number(directVal))) {
        // single value → wrap in array
        reflectionScore = [Number(directVal)];
      }
      // also collect indexed entries like reflection_score.0, .1, …
      const indexed: number[] = [];
      for (const k of Object.keys(parsedMetadata)) {
        const match = k.match(new RegExp(`^${scorePrefix}\\.(\\d+)$`));
        if (match) {
          const v = parsedMetadata[k];
          if (!Number.isNaN(Number(v))) {
            indexed[Number(match[1])] = Number(v);
          }
        }
      }
      if (indexed.length > 0) {
        reflectionScore = indexed.filter((v) => v !== undefined);
      }
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
  const { hasClarification, hasAnswerStatus, answerStatusValue, actionValue } =
    parsed;

  if (actionValue === "direct_answer") {
    return { statusText: "DIRECT ANSWER", color: "success" };
  }

  if (!hasClarification && !hasAnswerStatus) {
    return { statusText: "FAILED", color: "danger" };
  } else if (hasClarification) {
    return { statusText: "CLARIFICATION", color: "warning" };
  } else if (hasAnswerStatus) {
    if (answerStatusValue === "TIMEOUT") {
      return { statusText: "TIMEOUT", color: "danger" };
    } else if (answerStatusValue === "FAILED") {
      return { statusText: "FAILED", color: "danger" };
    } else if (
      answerStatusValue === "NOT FOUND" ||
      answerStatusValue === "NOT_FOUND"
    ) {
      return { statusText: "NOT FOUND", color: "danger" };
    } else if (answerStatusValue === "HYBRID") {
      return { statusText: "HYBRID", color: "warning" };
    } else {
      // FULFILLED or other values → SUCCESS
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
