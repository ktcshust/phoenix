import { Text } from "@phoenix/components";
import {
    jsonStringToFlatObject,
    flattenObject,
    safelyParseJSONString,
} from "@phoenix/utils/jsonUtils";

type AgentResponseCellProps = {
    spanKind: string;
    metadata: unknown;
    isAdditionalSpansRow?: boolean;
};

export const AgentResponseCell = ({
    spanKind,
    metadata,
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

    let hasClarification = false;
    let hasAnswerStatus = false;
    let answerStatusValue: string | undefined = undefined;
    let reflectionScore: number | undefined = undefined;

    try {
        let parsedMetadata: Record<string, string | boolean | number> = {};

        if (typeof metadata === "string") {
            // try to parse string metadata into an object
            // if it's a JSON string this will return a flat object
            parsedMetadata = jsonStringToFlatObject(metadata);
            // If jsonStringToFlatObject returned empty, try a looser parse
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
        hasAnswerStatus = "ebot.answer_status" in parsedMetadata || "answer_status" in parsedMetadata;

        const rawStatus = parsedMetadata["ebot.answer_status"] ?? parsedMetadata["answer_status"];
        if (rawStatus !== undefined && rawStatus !== null) {
            answerStatusValue = String(rawStatus).toUpperCase();
        }

        const score = parsedMetadata["ebot.reflection_score"] ?? parsedMetadata["reflection_score"];
        if (score !== undefined && score !== null && !Number.isNaN(Number(score))) {
            reflectionScore = Number(score);
        }
    } catch (_e) {
        // Ignore parse errors
    }

    let statusText = "ERROR";
    let color: "danger" | "warning" | "success" = "danger";

    if (!hasClarification && !hasAnswerStatus) {
        statusText = "FAILED";
        color = "danger";
    } else if (hasClarification) {
        statusText = "CLARIFICATION";
        color = "warning";
    } else if (hasAnswerStatus) {
        if (answerStatusValue === "TIMEOUT") {
            statusText = "TIMEOUT";
            color = "warning";
        } else if (answerStatusValue === "FAILED") {
            statusText = "FAILED";
            color = "danger";
        } else {
            // FULFILLED or other values → check reflection score
            if (reflectionScore !== undefined && reflectionScore < 75) {
                statusText = "NOT FOUND";
                color = "danger";
            } else {
                statusText = "SUCCESS";
                color = "success";
            }
        }
    }

    return <Text color={color}>{statusText}</Text>;
};
