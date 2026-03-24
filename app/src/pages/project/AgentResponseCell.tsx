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

    // action: from attributes.intent_action
    const rawAction = parsedMetadata["intent_action"];
    if (rawAction !== undefined && rawAction !== null) {
      actionValue = String(rawAction).toLowerCase();
    }

    // reflection_score: extract relevance_score from each item in
    // attributes.ebot.reflection_details (JSON string or array)
    const rawReflectionDetails =
      parsedMetadata["ebot.reflection_details"] ??
      parsedMetadata["reflection_details"];
    if (rawReflectionDetails !== undefined && rawReflectionDetails !== null) {
      try {
        const details =
          typeof rawReflectionDetails === "string"
            ? JSON.parse(rawReflectionDetails)
            : rawReflectionDetails;
        const items = Array.isArray(details) ? details : [details];
        const scores = items
          .map((item: Record<string, unknown>) => Number(item?.relevance_score))
          .filter((v: number) => !Number.isNaN(v));
        if (scores.length > 0) {
          reflectionScore = scores;
        }
      } catch (_) {
        // ignore parse errors
      }
    }
    // Also handle case where flattenObject already indexed the array items
    if (!reflectionScore) {
      const scores: number[] = [];
      for (const k of Object.keys(parsedMetadata)) {
        const match = k.match(
          /^(?:ebot\.)?reflection_details\.(\d+)\.relevance_score$/
        );
        if (match) {
          const v = parsedMetadata[k];
          if (!Number.isNaN(Number(v))) {
            scores[Number(match[1])] = Number(v);
          }
        }
      }
      const filtered = scores.filter((v) => v !== undefined);
      if (filtered.length > 0) {
        reflectionScore = filtered;
      }
    }

    // intent_count: len(attributes.ebot.intent_details)
    const rawIntentDetails =
      parsedMetadata["ebot.intent_details"] ?? parsedMetadata["intent_details"];
    if (rawIntentDetails !== undefined && rawIntentDetails !== null) {
      try {
        const details =
          typeof rawIntentDetails === "string"
            ? JSON.parse(rawIntentDetails)
            : rawIntentDetails;
        if (Array.isArray(details)) {
          intentCount = details.length;
        }
      } catch (_) {
        // ignore parse errors
      }
    }
    // Also handle case where flattenObject already indexed the array
    if (intentCount === undefined) {
      let maxIndex = -1;
      for (const k of Object.keys(parsedMetadata)) {
        const match = k.match(/^(?:ebot\.)?intent_details\.(\d+)/);
        if (match) {
          maxIndex = Math.max(maxIndex, Number(match[1]));
        }
      }
      if (maxIndex >= 0) {
        intentCount = maxIndex + 1;
      }
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
