import { Text } from "@phoenix/components";
import { jsonStringToFlatObject } from "@phoenix/utils/jsonUtils";

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

    if (spanKind !== "AGENT") {
        return <Text color="text-400">--</Text>;
    }

    let hasClarification = false;
    let hasAnswerStatus = false;
    let reflectionScore: number | undefined = undefined;

    try {
        if (typeof metadata === "string") {
            const parsedMetadata = jsonStringToFlatObject(metadata);
            hasClarification =
                "ebot.clarfication" in parsedMetadata ||
                "ebot.clarification" in parsedMetadata;
            hasAnswerStatus = "ebot.answer_status" in parsedMetadata;

            const score = parsedMetadata["ebot.reflection_score"];
            if (
                score !== undefined &&
                score !== null &&
                !Number.isNaN(Number(score))
            ) {
                reflectionScore = Number(score);
            }
        }
    } catch (_e) {
        // Ignore parse errors
    }

    let statusText = "ERROR";
    let color: "danger" | "warning" | "success" = "danger";

    if (!hasClarification && !hasAnswerStatus) {
        statusText = "ERROR";
        color = "danger";
    } else if (hasClarification) {
        statusText = "CLARFICATION";
        color = "warning";
    } else if (hasAnswerStatus) {
        if (reflectionScore !== undefined) {
            if (reflectionScore < 75) {
                statusText = "NOT FOUND";
                color = "danger";
            } else {
                statusText = "SUCCESS";
                color = "success";
            }
        } else {
            statusText = "SUCCESS";
            color = "success";
        }
    }

    return <Text color={color}>{statusText}</Text>;
};
