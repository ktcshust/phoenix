import { css } from "@emotion/react";
import type { ReactNode } from "react";
import { startTransition, useEffect, useState } from "react";
import { Focusable } from "react-aria";
import { graphql, useRefetchableFragment } from "react-relay";

import {
  ErrorBoundary,
  Flex,
  RichTooltip,
  Text,
  TextErrorBoundaryFallback,
  TooltipArrow,
  TooltipTrigger,
  View,
} from "@phoenix/components";
import { useCategoryChartColors } from "@phoenix/components/chart/colors";
import { RichTokenBreakdown } from "@phoenix/components/RichTokenCostBreakdown";
import { LatencyText } from "@phoenix/components/trace/LatencyText";
import { useStreamState } from "@phoenix/contexts/StreamStateContext";
import { costFormatter, intFormatter } from "@phoenix/utils/numberFormatUtils";

import type { ProjectPageHeader_stats$key } from "./__generated__/ProjectPageHeader_stats.graphql";
import type { ProjectPageHeaderQuery } from "./__generated__/ProjectPageHeaderQuery.graphql";
import { AnnotationSummary } from "./AnnotationSummary";
import { DocumentEvaluationSummary } from "./DocumentEvaluationSummary";

export function ProjectPageHeader(props: {
  project: ProjectPageHeader_stats$key;
  /**
   * the extra component displayed on the right side of the header
   */
  extra: ReactNode;
}) {
  const { extra } = props;
  const { fetchKey } = useStreamState();
  const [data, refetch] = useRefetchableFragment<
    ProjectPageHeaderQuery,
    ProjectPageHeader_stats$key
  >(
    graphql`
      fragment ProjectPageHeader_stats on Project
      @refetchable(queryName: "ProjectPageHeaderQuery") {
        timeRangeTraceCount: traceCount(timeRange: $timeRange)
        timeRangeMessageCount: messageCount(timeRange: $timeRange)
        timeRangeLlmRequestCount: llmRequestCount(timeRange: $timeRange)
        messagesToday
        llmRequestsCurrentMinute
        llmRequestsPeakMinute {
          count
          minute
        }
        costSummary(timeRange: $timeRange) {
          total {
            cost
          }
          prompt {
            cost
          }
          completion {
            cost
          }
        }
        latencyMsP50: latencyMsQuantile(probability: 0.50, timeRange: $timeRange)
        latencyMsP99: latencyMsQuantile(probability: 0.99, timeRange: $timeRange)
        spanAnnotationNames
        documentEvaluationNames
      }
    `,
    props.project
  );

  // Refetch the count of traces if the fetchKey changes
  useEffect(() => {
    startTransition(() => {
      refetch({}, { fetchPolicy: "store-and-network" });
    });
  }, [fetchKey, refetch]);

  // Refetch at every minute boundary so llmRequestsCurrentMinute resets to 0
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    const now = new Date();
    const msUntilNextMinute =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const timeoutId = setTimeout(() => {
      startTransition(() => {
        refetch({}, { fetchPolicy: "store-and-network" });
      });
      intervalId = setInterval(() => {
        startTransition(() => {
          refetch({}, { fetchPolicy: "store-and-network" });
        });
      }, 60_000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [refetch]);

  // Live UTC+7 clock
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clockDateStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(clockNow);
  const clockTimeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(clockNow);

  const latencyMsP50 = data?.latencyMsP50;
  const latencyMsP99 = data?.latencyMsP99;
  const spanAnnotationNames = data?.spanAnnotationNames?.filter(
    (name) => name !== "note"
  );
  const documentEvaluationNames = data?.documentEvaluationNames;

  const colors = useCategoryChartColors();
  return (
    <View
      paddingStart="size-200"
      paddingEnd="size-200"
      paddingTop="size-200"
      paddingBottom="size-50"
      flex="none"
    >
      <Flex direction="row" justifyContent="space-between" alignItems="center">
        <div
          css={css`
            overflow-x: auto;
            overflow-y: hidden;
            flex: 1 1 auto;
            background-image:
              linear-gradient(
                to right,
                var(--global-color-gray-75),
                var(--global-color-gray-75)
              ),
              linear-gradient(
                to right,
                var(--global-color-gray-75),
                var(--global-color-gray-75)
              ),
              linear-gradient(
                to right,
                rgba(var(--global-color-gray-300-rgb), 0.9),
                rgba(var(--global-color-gray-300-rgb), 0)
              ),
              linear-gradient(
                to left,
                rgba(var(--global-color-gray-300-rgb), 0.9),
                rgba(var(--global-color-gray-300-rgb), 0)
              );
            background-repeat: no-repeat;
            background-size:
              32px 100%,
              32px 100%,
              32px 100%,
              32px 100%;
            background-position:
              left center,
              right center,
              left center,
              right center;
            background-attachment: local, local, scroll, scroll;
          `}
        >
          <Flex direction="row" gap="size-400" alignItems="center">
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                Total Traces
              </Text>
              <Text size="L" fontFamily="mono">
                {intFormatter(data?.timeRangeTraceCount)}
              </Text>
            </Flex>
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                Total Messages
              </Text>
              <Text size="L" fontFamily="mono">
                {intFormatter(data?.timeRangeMessageCount)}
              </Text>
            </Flex>
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                Total LLM Requests
              </Text>
              <Text size="L" fontFamily="mono">
                {intFormatter(data?.timeRangeLlmRequestCount)}
              </Text>
            </Flex>
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                Messages Today
              </Text>
              <Text size="L" fontFamily="mono">
                {intFormatter(data?.messagesToday)}
              </Text>
            </Flex>
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                LLM/min (now)
              </Text>
              <Text size="L" fontFamily="mono">
                {intFormatter(data?.llmRequestsCurrentMinute)}
              </Text>
            </Flex>
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                Peak LLM/min
              </Text>
              <Text size="L" fontFamily="mono">
                {data?.llmRequestsPeakMinute?.count ?? 0}
              </Text>
              {data?.llmRequestsPeakMinute?.minute != null && (
                <Text size="XS" color="text-500">
                  @ {data.llmRequestsPeakMinute.minute}
                </Text>
              )}
            </Flex>
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                Total Cost
              </Text>
              <TooltipTrigger delay={0}>
                <Focusable>
                  <Text size="L" role="button" fontFamily="mono">
                    {costFormatter(data?.costSummary?.total?.cost ?? 0)}
                  </Text>
                </Focusable>
                <RichTooltip placement="bottom">
                  <TooltipArrow />
                  <View width="size-3600">
                    <RichTokenBreakdown
                      valueLabel="cost"
                      totalValue={data?.costSummary?.total?.cost ?? 0}
                      formatter={costFormatter}
                      segments={[
                        {
                          name: "Prompt",
                          value: data?.costSummary?.prompt?.cost ?? 0,
                          color: colors.category1,
                        },
                        {
                          name: "Completion",
                          value: data?.costSummary?.completion?.cost ?? 0,
                          color: colors.category2,
                        },
                      ]}
                    />
                  </View>
                </RichTooltip>
              </TooltipTrigger>
            </Flex>
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                Latency P50
              </Text>
              {latencyMsP50 != null ? (
                <LatencyText latencyMs={latencyMsP50} size="L" />
              ) : (
                <Text size="L">--</Text>
              )}
            </Flex>
            <Flex direction="column" flex="none">
              <Text elementType="h3" size="S" color="text-700">
                Latency P99
              </Text>

              {latencyMsP99 != null ? (
                <LatencyText latencyMs={latencyMsP99} size="L" />
              ) : (
                <Text size="L">--</Text>
              )}
            </Flex>
            {spanAnnotationNames.map((name) => (
              <ErrorBoundary key={name} fallback={TextErrorBoundaryFallback}>
                <AnnotationSummary key={name} annotationName={name} />
              </ErrorBoundary>
            ))}
            {documentEvaluationNames.map((name) => (
              <DocumentEvaluationSummary
                key={`document-${name}`}
                evaluationName={name}
              />
            ))}
          </Flex>
        </div>
        <View flex="none" paddingStart="size-100">
          <Flex direction="row" gap="size-200" alignItems="center">
            <Flex direction="column" alignItems="end" flex="none">
              <Text size="XS" color="text-500">
                {clockDateStr}
              </Text>
              <Text size="S" fontFamily="mono">
                {clockTimeStr}
              </Text>
            </Flex>
            {extra}
          </Flex>
        </View>
      </Flex>
    </View>
  );
}
