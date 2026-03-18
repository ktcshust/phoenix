import { css } from "@emotion/react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Alert, Flex, Icon, Icons, Skeleton, Text } from "@phoenix/components";
import { useSequentialChartColors } from "@phoenix/components/chart";
import {
  defaultCartesianGridProps,
  defaultXAxisProps,
  defaultYAxisProps,
} from "@phoenix/components/chart/defaults";
import { usePreferencesContext } from "@phoenix/contexts";
import { getLocale, getTimeZone } from "@phoenix/utils/timeUtils";
import { createTimeFormatter } from "@phoenix/utils/timeFormatUtils";

type NetworkMetrics = {
  bytesSentPerSec: number | null;
  bytesRecvPerSec: number | null;
  tcpEstablished: number | null;
  tcpTimeWait: number | null;
  tcpCloseWait: number | null;
  history: HistoryPoint[];
};

const basename = window.Config.basename;

const POLL_INTERVAL_MS = 2000;

type HistoryPoint = {
  t: number;
  bytesSent: number | null;
  bytesRecv: number | null;
  tcpEstablished: number | null;
  tcpTimeWait: number | null;
  tcpCloseWait: number | null;
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatBytesPerSec(bps: number | null): string {
  if (bps == null) return "N/A";
  if (bps >= 1024 * 1024 * 1024) return `${(bps / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

function bpsToMbps(bps: number | null): number | null {
  if (bps == null) return null;
  return bps / (1024 * 1024);
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      css={css`
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--ac-global-dimension-size-50);
        width: 168px;
        height: 168px;
        border-radius: 50%;
        border: 12px solid var(--chart-cartesian-grid-stroke-color);
        box-sizing: border-box;
        flex-shrink: 0;
      `}
    >
      <Text weight="heavy" size="S">
        {label}
      </Text>
      <span
        css={css`
          font-size: 18px;
          font-weight: 700;
          color: ${color};
          text-align: center;
          word-break: break-all;
        `}
      >
        {value}
      </span>
    </div>
  );
}

// ─── RateMetricRow ────────────────────────────────────────────────────────────

function RateMetricRow({
  title,
  chartData,
  color,
  currentLabel,
  yTickFormatter,
  yLabel,
  timeFormatter,
}: {
  title: string;
  chartData: Array<{ timestamp: number; value: number | null }>;
  color: string;
  currentLabel: string;
  yTickFormatter: (v: number) => string;
  yLabel: string;
  timeFormatter: (date: Date) => string;
}) {
  return (
    <div
      css={css`
        display: grid;
        grid-template-columns: minmax(0, 1fr) 220px;
        gap: var(--ac-global-dimension-size-200);
        align-items: center;
        @media (max-width: 720px) {
          grid-template-columns: 1fr;
          justify-items: center;
        }
      `}
    >
      <div css={css`min-width: 0;`}>
        <Text weight="heavy">{title} (last 1 min)</Text>
        <div css={css`height: 180px;`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 18, bottom: 10, left: 0 }}
            >
              <XAxis
                {...defaultXAxisProps}
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                minTickGap={24}
                tickFormatter={(t) => timeFormatter(new Date(t))}
              />
              <YAxis
                {...defaultYAxisProps}
                domain={[0, "auto"]}
                tickFormatter={yTickFormatter}
                width={64}
                label={{
                  value: yLabel,
                  angle: -90,
                  dx: -24,
                  style: {
                    textAnchor: "middle",
                    fill: "var(--chart-axis-label-color)",
                  },
                }}
              />
              <CartesianGrid vertical={false} {...defaultCartesianGridProps} />
              <Line
                dataKey="value"
                type="monotone"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <StatCard label={title} value={currentLabel} color={color} />
    </div>
  );
}

// ─── CountMetricRow ───────────────────────────────────────────────────────────

function CountMetricRow({
  title,
  chartData,
  color,
  value,
  timeFormatter,
}: {
  title: string;
  chartData: Array<{ timestamp: number; value: number | null }>;
  color: string;
  value: number | null;
  timeFormatter: (date: Date) => string;
}) {
  return (
    <div
      css={css`
        display: grid;
        grid-template-columns: minmax(0, 1fr) 220px;
        gap: var(--ac-global-dimension-size-200);
        align-items: center;
        @media (max-width: 720px) {
          grid-template-columns: 1fr;
          justify-items: center;
        }
      `}
    >
      <div css={css`min-width: 0;`}>
        <Text weight="heavy">{title} (last 1 min)</Text>
        <div css={css`height: 180px;`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 18, bottom: 10, left: 0 }}
            >
              <XAxis
                {...defaultXAxisProps}
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                minTickGap={24}
                tickFormatter={(t) => timeFormatter(new Date(t))}
              />
              <YAxis
                {...defaultYAxisProps}
                domain={[0, "auto"]}
                allowDecimals={false}
                tickFormatter={(v) => `${v}`}
                width={52}
                label={{
                  value: "conns",
                  angle: -90,
                  dx: -18,
                  style: {
                    textAnchor: "middle",
                    fill: "var(--chart-axis-label-color)",
                  },
                }}
              />
              <CartesianGrid vertical={false} {...defaultCartesianGridProps} />
              <Line
                dataKey="value"
                type="monotone"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <StatCard
        label={title}
        value={value == null ? "N/A" : `${value}`}
        color={color}
      />
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MetricRowSkeleton() {
  return (
    <div
      css={css`
        display: grid;
        grid-template-columns: minmax(0, 1fr) 220px;
        gap: var(--ac-global-dimension-size-200);
        align-items: center;
        @media (max-width: 720px) {
          grid-template-columns: 1fr;
          justify-items: center;
        }
      `}
    >
      <div css={css`min-width: 0;`}>
        <Skeleton height={18} width={180} animation="wave" />
        <div
          css={css`
            height: 180px;
            margin-top: var(--ac-global-dimension-size-50);
          `}
        >
          <Skeleton height="100%" width="100%" borderRadius={8} animation="wave" />
        </div>
      </div>
      <div
        css={css`
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--ac-global-dimension-size-50);
        `}
      >
        <Skeleton width={168} height={168} borderRadius="circle" animation="wave" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function NetworkMonitorPage() {
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const chartColors = useSequentialChartColors();

  const displayTimezone = usePreferencesContext(
    (state) => state.displayTimezone
  );
  const timeFormatter = useMemo(() => {
    const timeZone = displayTimezone ?? getTimeZone();
    return createTimeFormatter(getLocale(), {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone,
    });
  }, [displayTimezone]);

  useEffect(() => {
    let isActive = true;
    let timeoutId: number | null = null;
    let abortController: AbortController | null = null;

    async function load() {
      abortController?.abort();
      abortController = new AbortController();
      try {
        const response = await fetch(`${basename}/api/system/network_metrics`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = (await response.json()) as NetworkMetrics;
        if (isActive) {
          setErrorMessage(null);
          setMetrics(data);
          setHistory(data.history ?? []);
        }
      } catch (error) {
        if (!isActive) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setMetrics(null);
      }
    }

    async function poll() {
      await load();
      if (!isActive) return;
      timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      isActive = false;
      abortController?.abort();
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, []);

  const chartSeries = useMemo(
    () => ({
      bytesSent: history.map((p) => ({
        timestamp: p.t,
        value: bpsToMbps(p.bytesSent),
      })),
      bytesRecv: history.map((p) => ({
        timestamp: p.t,
        value: bpsToMbps(p.bytesRecv),
      })),
      tcpEstablished: history.map((p) => ({
        timestamp: p.t,
        value: p.tcpEstablished,
      })),
      tcpTimeWait: history.map((p) => ({
        timestamp: p.t,
        value: p.tcpTimeWait,
      })),
      tcpCloseWait: history.map((p) => ({
        timestamp: p.t,
        value: p.tcpCloseWait,
      })),
    }),
    [history]
  );

  const mbpsFormatter = (v: number) => `${v.toFixed(1)}`;

  return (
    <div
      css={css`
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        height: 100%;
      `}
    >
      {errorMessage ? (
        <Alert
          variant="danger"
          banner
          icon={<Icon svg={<Icons.AlertTriangleOutline />} />}
        >
          Failed to load network metrics: {errorMessage}
        </Alert>
      ) : null}

      {!errorMessage && !metrics ? (
        <Flex
          direction="column"
          gap="size-200"
          css={css`padding: var(--ac-global-dimension-size-200);`}
        >
          <MetricRowSkeleton />
          <MetricRowSkeleton />
          <MetricRowSkeleton />
          <MetricRowSkeleton />
          <MetricRowSkeleton />
        </Flex>
      ) : null}

      {metrics ? (
        <Flex
          direction="column"
          gap="size-200"
          css={css`padding: var(--ac-global-dimension-size-200);`}
        >
          {/* Bytes Sent */}
          <RateMetricRow
            title="Bytes Sent"
            chartData={chartSeries.bytesSent}
            color={chartColors.blue500}
            currentLabel={formatBytesPerSec(metrics.bytesSentPerSec)}
            yTickFormatter={mbpsFormatter}
            yLabel="MB/s"
            timeFormatter={timeFormatter}
          />

          {/* Bytes Received */}
          <RateMetricRow
            title="Bytes Received"
            chartData={chartSeries.bytesRecv}
            color={chartColors.purple400}
            currentLabel={formatBytesPerSec(metrics.bytesRecvPerSec)}
            yTickFormatter={mbpsFormatter}
            yLabel="MB/s"
            timeFormatter={timeFormatter}
          />

          {/* TCP Established */}
          <CountMetricRow
            title="TCP Established"
            chartData={chartSeries.tcpEstablished}
            color={chartColors.orange400}
            value={metrics.tcpEstablished}
            timeFormatter={timeFormatter}
          />

          {/* TCP TIME_WAIT */}
          <CountMetricRow
            title="TCP TIME_WAIT"
            chartData={chartSeries.tcpTimeWait}
            color={chartColors.purple400}
            value={metrics.tcpTimeWait}
            timeFormatter={timeFormatter}
          />

          {/* TCP CLOSE_WAIT */}
          <CountMetricRow
            title="TCP CLOSE_WAIT"
            chartData={chartSeries.tcpCloseWait}
            color={chartColors.magenta400}
            value={metrics.tcpCloseWait}
            timeFormatter={timeFormatter}
          />
        </Flex>
      ) : null}
    </div>
  );
}
