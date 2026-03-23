import { useMemo } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Text } from "@phoenix/components";
import {
  ChartTooltip,
  ChartTooltipItem,
  defaultCartesianGridProps,
  defaultLegendProps,
  defaultXAxisProps,
  defaultYAxisProps,
  useBinInterval,
  useBinTimeTickFormatter,
} from "@phoenix/components/chart";
import { useTimeBinScale } from "@phoenix/hooks/useTimeBin";
import { useTimeFormatters } from "@phoenix/hooks/useTimeFormatters";
import { useUTCOffsetMinutes } from "@phoenix/hooks/useUTCOffsetMinutes";
import {
  parseAgentMetadata,
  resolveStatus,
} from "@phoenix/pages/project/AgentResponseCell";
import type { ProjectMetricViewProps } from "@phoenix/pages/project/metrics/types";

import type { AgentSuccessRateTimeSeriesQuery } from "./__generated__/AgentSuccessRateTimeSeriesQuery.graphql";

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "var(--ac-global-color-green-700)",
  "DIRECT ANSWER": "var(--ac-global-color-blue-700)",
  CLARIFICATION: "var(--ac-global-color-orange-700)",
  "NOT FOUND": "var(--ac-global-color-red-500)",
  TIMEOUT: "var(--ac-global-color-yellow-700)",
  FAILED: "var(--ac-global-color-red-900)",
};

const STATUS_ORDER = [
  "SUCCESS",
  "DIRECT ANSWER",
  "CLARIFICATION",
  "NOT FOUND",
  "TIMEOUT",
  "FAILED",
] as const;

type TimeBinScale = "minute" | "hour" | "day" | "week" | "month" | "year";

function truncateToTimeBin(date: Date, scale: TimeBinScale): string {
  const d = new Date(date);
  if (scale === "minute") {
    d.setSeconds(0, 0);
  } else if (scale === "hour") {
    d.setMinutes(0, 0, 0);
  } else if (scale === "day") {
    d.setHours(0, 0, 0, 0);
  } else if (scale === "week") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
  } else if (scale === "month") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

function TooltipContent(props: Record<string, unknown>) {
  const { fullTimeFormatter } = useTimeFormatters();
  const active = props.active as boolean | undefined;
  const payload = props.payload as
    | Array<{ value?: number; color?: string; name?: string }>
    | undefined;
  const label = props.label as string | undefined;
  if (active && payload && payload.length) {
    return (
      <ChartTooltip>
        {label && (
          <Text weight="heavy" size="S">
            {fullTimeFormatter(new Date(label))}
          </Text>
        )}
        {payload.map((entry: { value?: number; color?: string; name?: string }, index: number) => (
          <ChartTooltipItem
            key={index}
            color={entry.color ?? ""}
            shape="line"
            name={entry.name ?? ""}
            value={`${((entry.value as number) ?? 0).toFixed(1)}%`}
          />
        ))}
      </ChartTooltip>
    );
  }
  return null;
}

export function AgentSuccessRateTimeSeries({
  projectId,
  timeRange,
}: ProjectMetricViewProps) {
  const scale = useTimeBinScale({ timeRange });
  const utcOffsetMinutes = useUTCOffsetMinutes();
  void utcOffsetMinutes;

  const data = useLazyLoadQuery<AgentSuccessRateTimeSeriesQuery>(
    graphql`
      query AgentSuccessRateTimeSeriesQuery(
        $projectId: ID!
        $timeRange: TimeRange!
        $filterCondition: String!
      ) {
        project: node(id: $projectId) {
          ... on Project {
            spans(
              first: 1000
              filterCondition: $filterCondition
              timeRange: $timeRange
              sort: { col: startTime, dir: asc }
            ) {
              edges {
                node {
                  spanKind
                  metadata
                  startTime
                }
              }
            }
          }
        }
      }
    `,
    {
      projectId,
      timeRange: {
        start: timeRange.start?.toISOString(),
        end: timeRange.end?.toISOString(),
      },
      filterCondition: 'span_kind == "AGENT"',
    }
  );

  const chartData = useMemo(() => {
    const bins = new Map<
      string,
      { timestamp: string; counts: Record<string, number>; total: number }
    >();

    const spans = data.project.spans?.edges ?? [];
    for (const edge of spans) {
      const node = edge.node;
      const parsed = parseAgentMetadata(node.metadata);
      const { statusText } = resolveStatus(parsed);
      const binKey = truncateToTimeBin(
        new Date(node.startTime),
        scale as TimeBinScale
      );

      let bin = bins.get(binKey);
      if (!bin) {
        bin = { timestamp: binKey, counts: {}, total: 0 };
        for (const s of STATUS_ORDER) {
          bin.counts[s] = 0;
        }
        bins.set(binKey, bin);
      }
      bin.counts[statusText] = (bin.counts[statusText] ?? 0) + 1;
      bin.total += 1;
    }

    return Array.from(bins.values())
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      .map((bin) => {
        const result: Record<string, string | number> = {
          timestamp: bin.timestamp,
        };
        for (const s of STATUS_ORDER) {
          result[s] = bin.total > 0 ? (bin.counts[s] / bin.total) * 100 : 0;
        }
        return result;
      });
  }, [data, scale]);

  const timeTickFormatter = useBinTimeTickFormatter({ scale });
  const interval = useBinInterval({ scale });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 0, right: 18, left: 8, bottom: 0 }}
        syncId={"projectMetrics"}
      >
        <XAxis
          {...defaultXAxisProps}
          dataKey="timestamp"
          interval={interval}
          tickFormatter={(x) => timeTickFormatter(new Date(x))}
        />
        <YAxis
          {...defaultYAxisProps}
          width={55}
          domain={[0, 100]}
          tickFormatter={(x) => `${x}%`}
          label={{
            value: "Rate (%)",
            angle: -90,
            dx: -28,
            style: {
              textAnchor: "middle",
              fill: "var(--chart-axis-label-color)",
            },
          }}
        />
        <CartesianGrid {...defaultCartesianGridProps} vertical={false} />
        <Tooltip
          content={TooltipContent}
          cursor={{ fill: "var(--chart-tooltip-cursor-fill-color)" }}
        />
        {STATUS_ORDER.map((status) => (
          <Line
            key={status}
            type="monotone"
            dataKey={status}
            stroke={STATUS_COLORS[status]}
            strokeWidth={status === "SUCCESS" ? 2.5 : 1.5}
            dot={{ r: status === "SUCCESS" ? 3 : 2 }}
            activeDot={{ r: 4 }}
          />
        ))}
        <Legend {...defaultLegendProps} iconType="line" iconSize={8} />
      </LineChart>
    </ResponsiveContainer>
  );
}
