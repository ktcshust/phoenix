import { useMemo } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { intFormatter } from "@phoenix/utils/numberFormatUtils";

import type { ExceptionStatusTimeSeriesQuery } from "./__generated__/ExceptionStatusTimeSeriesQuery.graphql";

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
            shape="circle"
            name={entry.name ?? ""}
            value={intFormatter(
              typeof entry.value === "number" ? entry.value : null
            )}
          />
        ))}
      </ChartTooltip>
    );
  }
  return null;
}

export function ExceptionStatusTimeSeries({
  projectId,
  timeRange,
}: ProjectMetricViewProps) {
  const scale = useTimeBinScale({ timeRange });

  const data = useLazyLoadQuery<ExceptionStatusTimeSeriesQuery>(
    graphql`
      query ExceptionStatusTimeSeriesQuery(
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
    const bins = new Map<string, Record<string, string | number>>();

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
        bin = { timestamp: binKey };
        for (const s of STATUS_ORDER) {
          bin[s] = 0;
        }
        bins.set(binKey, bin);
      }
      bin[statusText] = ((bin[statusText] as number) ?? 0) + 1;
    }

    return Array.from(bins.values()).sort(
      (a, b) =>
        new Date(a.timestamp as string).getTime() -
        new Date(b.timestamp as string).getTime()
    );
  }, [data, scale]);

  const timeTickFormatter = useBinTimeTickFormatter({ scale });
  const interval = useBinInterval({ scale });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 0, right: 18, left: 8, bottom: 0 }}
        barSize={10}
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
          tickFormatter={(x) => intFormatter(x)}
          label={{
            value: "Count",
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
          <Bar
            key={status}
            dataKey={status}
            stackId="a"
            fill={STATUS_COLORS[status]}
            radius={
              status === STATUS_ORDER[STATUS_ORDER.length - 1]
                ? [2, 2, 0, 0]
                : undefined
            }
          />
        ))}
        <Legend {...defaultLegendProps} iconType="circle" iconSize={8} />
      </BarChart>
    </ResponsiveContainer>
  );
}
