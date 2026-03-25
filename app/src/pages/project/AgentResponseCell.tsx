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
  childrenMetadata?: unknown[];
  isAdditionalSpansRow?: boolean;
};

type ParsedAgentResponse = {
  hasClarification: boolean;
  hasAnswerStatus: boolean;
  answerStatusValue: string | undefined;
  hasMessageStatus: boolean;
  messageStatusValue: string | undefined;
  reflectionScore: number[] | undefined;
  actionValue: string | undefined;
  intentCount: number | undefined;
};

export function parseAgentMetadata(metadata: unknown): ParsedAgentResponse {
  let hasClarification = false;
  let hasAnswerStatus = false;
  let answerStatusValue: string | undefined = undefined;
  let hasMessageStatus = false;
  // eslint-disable-next-line prefer-const -- reassigned inside try block
  let messageStatusValue: string | undefined = undefined;
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

    // message_status: from child span classify_message_status
    hasMessageStatus =
      "ebot.message_status" in parsedMetadata ||
      "message_status" in parsedMetadata;
    const rawMessageStatus =
      parsedMetadata["ebot.message_status"] ?? parsedMetadata["message_status"];
    if (rawMessageStatus !== undefined && rawMessageStatus !== null) {
      messageStatusValue = String(rawMessageStatus).toUpperCase();
    }

    // action: from attributes.ebot.intent_action
    const rawAction =
      parsedMetadata["ebot.intent_action"] ?? parsedMetadata["intent_action"];
    if (rawAction !== undefined && rawAction !== null) {
      actionValue = String(rawAction).toLowerCase();
    }

    // reflection_score: extract relevance_score from each value in
    // attributes.ebot.reflection_details (JSON string of dict keyed by question)
    const rawReflectionDetails =
      parsedMetadata["ebot.reflection_details"] ??
      parsedMetadata["reflection_details"];
    if (rawReflectionDetails !== undefined && rawReflectionDetails !== null) {
      try {
        const details =
          typeof rawReflectionDetails === "string"
            ? JSON.parse(rawReflectionDetails)
            : rawReflectionDetails;
        const items = Array.isArray(details)
          ? details
          : typeof details === "object" && details !== null
            ? Object.values(details)
            : [];
        const scores = (items as Record<string, unknown>[])
          .map((item) => Number(item?.relevance_score))
          .filter((v: number) => !Number.isNaN(v));
        if (scores.length > 0) {
          reflectionScore = scores;
        }
      } catch (_) {
        // ignore parse errors
      }
    }

    // intent_count: number of keys in attributes.ebot.intent_details
    // (JSON string of dict keyed by question)
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
        } else if (typeof details === "object" && details !== null) {
          intentCount = Object.keys(details).length;
        }
      } catch (_) {
        // ignore parse errors
      }
    }
  } catch (_e) {
    // Ignore parse errors
  }

  return {
    hasClarification,
    hasAnswerStatus,
    answerStatusValue,
    hasMessageStatus,
    messageStatusValue,
    reflectionScore,
    actionValue,
    intentCount,
  };
}

function resolveMessageStatusColor(
  value: string
): "danger" | "warning" | "success" {
  if (value.includes("NOT_FOUND") || value.includes("FAILED")) {
    return "danger";
  }
  if (value.includes("HYBRID") || value.includes("TIMEOUT")) {
    return "warning";
  }
  if (value.includes("FOUND")) {
    return "success";
  }
  return "warning";
}

export function resolveStatus(parsed: ParsedAgentResponse): {
  statusText: string;
  color: "danger" | "warning" | "success";
} {
  const {
    hasClarification,
    hasAnswerStatus,
    answerStatusValue,
    hasMessageStatus,
    messageStatusValue,
    actionValue,
  } = parsed;

  if (actionValue === "direct_answer") {
    return { statusText: "DIRECT ANSWER", color: "success" };
  }

  if (!hasClarification && !hasAnswerStatus) {
    // Fall back to message_status if available — show raw value
    if (hasMessageStatus && messageStatusValue) {
      return {
        statusText: messageStatusValue,
        color: resolveMessageStatusColor(messageStatusValue),
      };
    }
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
  childrenMetadata,
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

  const hasEbotKeys = (p: ParsedAgentResponse) =>
    p.hasClarification || p.hasAnswerStatus || p.hasMessageStatus;

  // If own metadata has no ebot keys, fall back to parent metadata
  if (!hasEbotKeys(parsed) && parentMetadata) {
    parsed = parseAgentMetadata(parentMetadata);
  }

  // If still no ebot keys, fall back to child spans metadata
  // (e.g. classify_message_status span may have ebot.message_status)
  if (!hasEbotKeys(parsed) && childrenMetadata) {
    for (const childMeta of childrenMetadata) {
      const childParsed = parseAgentMetadata(childMeta);
      if (hasEbotKeys(childParsed)) {
        parsed = childParsed;
        break;
      }
    }
  }

  const { statusText, color } = resolveStatus(parsed);

  return <Text color={color}>{statusText}</Text>;
};
