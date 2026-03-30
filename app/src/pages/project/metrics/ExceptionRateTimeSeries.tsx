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
import type { ProjectMetricViewProps } from "@phoenix/pages/project/metrics/types";

import type { ExceptionRateTimeSeriesQuery } from "./__generated__/ExceptionRateTimeSeriesQuery.graphql";

const STATUS_COLORS: Record<string, string> = {
  "non-exception": "var(--ac-global-color-green-700)",
  exception: "var(--ac-global-color-red-900)",
};

const STATUS_ORDER = ["non-exception", "exception"] as const;

function truncateToTimeBin(date: Date, scale: TimeBinScale): string {
  const d = new Date(date);
  if (scale === "MINUTE") {
    d.setSeconds(0, 0);
  } else if (scale === "HOUR") {
    d.setMinutes(0, 0, 0);
  } else if (scale === "DAY") {
    d.setHours(0, 0, 0, 0);
  } else if (scale === "WEEK") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
  } else if (scale === "MONTH") {
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
        {payload.map((entry, index) => (
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

export function ExceptionRateTimeSeries({
  projectId,
  timeRange,
}: ProjectMetricViewProps) {
  const scale = useTimeBinScale({ timeRange });

  const data = useLazyLoadQuery<ExceptionRateTimeSeriesQuery>(
    graphql`
      query ExceptionRateTimeSeriesQuery(
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
                  statusCode: propagatedStatusCode
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
      const statusText =
        (node as Record<string, unknown>).statusCode === "ERROR"
          ? "exception"
          : "non-exception";

      const binKey = truncateToTimeBin(new Date(node.startTime), scale);
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
            strokeWidth={status === "non-exception" ? 2.5 : 1.5}
            dot={{ r: status === "non-exception" ? 3 : 2 }}
            activeDot={{ r: 4 }}
          />
        ))}
        <Legend {...defaultLegendProps} iconType="line" iconSize={8} />
      </LineChart>
    </ResponsiveContainer>
  );
}
