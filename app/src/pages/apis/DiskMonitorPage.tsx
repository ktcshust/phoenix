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

// ─── Shared gauge/arc math (copied from GpuMonitorPage pattern) ───────────────

const GAUGE_SIZE = 168;
const STROKE_WIDTH = 12;
const PADDING = 10;
const CX = GAUGE_SIZE / 2;
const CY = GAUGE_SIZE / 2;
const RADIUS = (GAUGE_SIZE - PADDING * 2 - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SWEEP_DEGREES = 240;
const START_ANGLE = 240;
const ACTIVE_ARC = (CIRCUMFERENCE * SWEEP_DEGREES) / 360;
const ROTATE = START_ANGLE - 90;

function pointOnCircle(
  angleFromTwelve: number,
  r: number
): { x: number; y: number } {
  const rad = (angleFromTwelve * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

const MAJOR_TICKS = [START_ANGLE, 0, START_ANGLE - SWEEP_DEGREES + 360];
const MINOR_TICKS = Array.from(
  { length: 11 },
  (_, i) => START_ANGLE + i * (SWEEP_DEGREES / 10)
).filter((a) => !MAJOR_TICKS.some((m) => Math.abs(m - a) < 0.001));

// ─── PercentGauge ─────────────────────────────────────────────────────────────

function PercentGauge({
  label,
  value,
  color,
  detail,
}: {
  label: string;
  value: number | null;
  color: string;
  detail?: string;
}) {
  const clamped = value == null ? null : Math.min(100, Math.max(0, value));
  const progressArc =
    clamped == null ? 0 : (ACTIVE_ARC * clamped) / 100;
  const needleAngle =
    clamped == null ? START_ANGLE : START_ANGLE + (clamped / 100) * SWEEP_DEGREES;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleLen = RADIUS - STROKE_WIDTH / 2 - 6;
  const nx = CX + needleLen * Math.sin(needleRad);
  const ny = CY - needleLen * Math.cos(needleRad);

  function labelPos(a: number) {
    const r = RADIUS + STROKE_WIDTH / 2 + 14;
    const rad = (a * Math.PI) / 180;
    return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
  }

  const [startPos, midPos, endPos] = [
    labelPos(START_ANGLE),
    labelPos(0),
    labelPos(START_ANGLE - SWEEP_DEGREES + 360),
  ];

  return (
    <div
      css={css`
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ac-global-dimension-size-50);
      `}
    >
      <Text weight="heavy" size="S">
        {label}
      </Text>
      <svg
        width={GAUGE_SIZE}
        height={GAUGE_SIZE}
        viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
        role="img"
        aria-label={`${label}`}
      >
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke="var(--chart-cartesian-grid-stroke-color)"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke="var(--chart-axis-stroke-color)"
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={`${ACTIVE_ARC} ${CIRCUMFERENCE}`}
          strokeLinecap="round"
          transform={`rotate(${ROTATE} ${CX} ${CY})`}
          opacity={0.65}
        />
        {clamped != null && clamped > 0 && (
          <circle
            cx={CX}
            cy={CY}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${progressArc} ${CIRCUMFERENCE}`}
            strokeLinecap={clamped >= 100 ? "butt" : "round"}
            transform={`rotate(${ROTATE} ${CX} ${CY})`}
          />
        )}
        {MINOR_TICKS.map((a) => {
          const o = pointOnCircle(a, RADIUS + STROKE_WIDTH / 2 + 2);
          const i = pointOnCircle(a, RADIUS - STROKE_WIDTH / 2 - 6);
          return (
            <line
              key={a}
              x1={i.x}
              y1={i.y}
              x2={o.x}
              y2={o.y}
              stroke="var(--chart-axis-stroke-color)"
              strokeWidth={1.5}
              opacity={0.5}
            />
          );
        })}
        {MAJOR_TICKS.map((a) => {
          const o = pointOnCircle(a, RADIUS + STROKE_WIDTH / 2 + 4);
          const i = pointOnCircle(a, RADIUS - STROKE_WIDTH / 2 - 10);
          return (
            <line
              key={a}
              x1={i.x}
              y1={i.y}
              x2={o.x}
              y2={o.y}
              stroke="var(--chart-axis-stroke-color)"
              strokeWidth={2}
              opacity={0.85}
            />
          );
        })}
        <line
          x1={CX}
          y1={CY}
          x2={nx}
          y2={ny}
          stroke={clamped == null ? "var(--chart-axis-stroke-color)" : color}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle
          cx={CX}
          cy={CY}
          r={7}
          fill={clamped == null ? "var(--chart-axis-stroke-color)" : color}
        />
        <circle cx={CX} cy={CY} r={3} fill="var(--global-text-color-900)" opacity={0.7} />
        <text
          x={startPos.x}
          y={startPos.y + 4}
          textAnchor="middle"
          fill="var(--chart-axis-label-color)"
          fontSize="11"
        >
          0
        </text>
        <text
          x={midPos.x}
          y={midPos.y - 6}
          textAnchor="middle"
          fill="var(--chart-axis-label-color)"
          fontSize="11"
        >
          50
        </text>
        <text
          x={endPos.x}
          y={endPos.y + 4}
          textAnchor="middle"
          fill="var(--chart-axis-label-color)"
          fontSize="11"
        >
          100
        </text>
        <text
          x={CX}
          y={CY + 22}
          textAnchor="middle"
          fill="var(--global-text-color-900)"
          fontSize="16"
          fontWeight={600}
        >
          {clamped == null ? "N/A" : `${clamped.toFixed(0)}%`}
        </text>
        {clamped != null && (
          <text
            x={CX}
            y={CY + 44}
            textAnchor="middle"
            fill="var(--chart-axis-label-color)"
            fontSize="11"
          >
            0–100%
          </text>
        )}
      </svg>
      {detail && (
        <Text size="XS" color="text-700">
          {detail}
        </Text>
      )}
    </div>
  );
}

// ─── StatCard (for raw-value metrics without a fixed max) ─────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

type DiskIoMetrics = {
  readBytesPerSec: number | null;
  writeBytesPerSec: number | null;
  readIops: number | null;
  writeIops: number | null;
  busyPercent: number | null;
  readLatencyMs: number | null;
  writeLatencyMs: number | null;
  history: HistoryPoint[];
};

const basename = window.Config.basename;

const POLL_INTERVAL_MS = 2000;

type HistoryPoint = {
  t: number;
  readBytes: number | null;
  writeBytes: number | null;
  readIops: number | null;
  writeIops: number | null;
  busy: number | null;
  readLatency: number | null;
  writeLatency: number | null;
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatMbPerSec(bps: number | null): string {
  if (bps == null) return "N/A";
  return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}

function toMbps(bps: number | null): number | null {
  if (bps == null) return null;
  return bps / (1024 * 1024);
}

function formatIops(iops: number | null): string {
  if (iops == null) return "N/A";
  return `${iops.toFixed(1)} IOPS`;
}

function formatLatency(ms: number | null): string {
  if (ms == null) return "N/A";
  return `${ms.toFixed(2)} ms`;
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

// ─── PercentMetricRow ─────────────────────────────────────────────────────────

function PercentMetricRow({
  title,
  chartData,
  color,
  value,
  detail,
  timeFormatter,
}: {
  title: string;
  chartData: Array<{ timestamp: number; value: number | null }>;
  color: string;
  value: number | null;
  detail?: string;
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
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                width={44}
                label={{
                  value: "%",
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
      <PercentGauge label={title} value={value} color={color} detail={detail} />
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

export function DiskMonitorPage() {
  const [metrics, setMetrics] = useState<DiskIoMetrics | null>(null);
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
        const response = await fetch(`${basename}/api/system/disk_io_metrics`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = (await response.json()) as DiskIoMetrics;
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
      readBytes: history.map((p) => ({
        timestamp: p.t,
        value: toMbps(p.readBytes),
      })),
      writeBytes: history.map((p) => ({
        timestamp: p.t,
        value: toMbps(p.writeBytes),
      })),
      readIops: history.map((p) => ({ timestamp: p.t, value: p.readIops })),
      writeIops: history.map((p) => ({ timestamp: p.t, value: p.writeIops })),
      busy: history.map((p) => ({ timestamp: p.t, value: p.busy })),
      readLatency: history.map((p) => ({
        timestamp: p.t,
        value: p.readLatency,
      })),
      writeLatency: history.map((p) => ({
        timestamp: p.t,
        value: p.writeLatency,
      })),
    }),
    [history]
  );

  const mbpsTickFmt = (v: number) => `${v.toFixed(1)}`;
  const iopsFmt = (v: number) => `${v.toFixed(0)}`;
  const latFmt = (v: number) => `${v.toFixed(1)}`;

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
          Failed to load disk I/O metrics: {errorMessage}
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
          {/* Read Bytes */}
          <RateMetricRow
            title="Read Bytes"
            chartData={chartSeries.readBytes}
            color={chartColors.blue500}
            currentLabel={formatMbPerSec(metrics.readBytesPerSec)}
            yTickFormatter={mbpsTickFmt}
            yLabel="MB/s"
            timeFormatter={timeFormatter}
          />

          {/* Write Bytes */}
          <RateMetricRow
            title="Write Bytes"
            chartData={chartSeries.writeBytes}
            color={chartColors.orange400}
            currentLabel={formatMbPerSec(metrics.writeBytesPerSec)}
            yTickFormatter={mbpsTickFmt}
            yLabel="MB/s"
            timeFormatter={timeFormatter}
          />

          {/* Read IOPS */}
          <RateMetricRow
            title="Read Count (IOPS)"
            chartData={chartSeries.readIops}
            color={chartColors.purple400}
            currentLabel={formatIops(metrics.readIops)}
            yTickFormatter={iopsFmt}
            yLabel="IOPS"
            timeFormatter={timeFormatter}
          />

          {/* Write IOPS */}
          <RateMetricRow
            title="Write Count (IOPS)"
            chartData={chartSeries.writeIops}
            color={chartColors.purple400}
            currentLabel={formatIops(metrics.writeIops)}
            yTickFormatter={iopsFmt}
            yLabel="IOPS"
            timeFormatter={timeFormatter}
          />

          {/* IO Busy % — uses gauge (Linux only; null on other platforms) */}
          <PercentMetricRow
            title="IO Busy %"
            chartData={chartSeries.busy}
            color={chartColors.red400}
            value={metrics.busyPercent}
            detail={
              metrics.busyPercent != null
                ? `${metrics.busyPercent.toFixed(1)}% (Linux only)`
                : "N/A (Linux only)"
            }
            timeFormatter={timeFormatter}
          />

          {/* Read Latency */}
          <RateMetricRow
            title="Read Latency"
            chartData={chartSeries.readLatency}
            color={chartColors.magenta400}
            currentLabel={formatLatency(metrics.readLatencyMs)}
            yTickFormatter={latFmt}
            yLabel="ms"
            timeFormatter={timeFormatter}
          />

          {/* Write Latency */}
          <RateMetricRow
            title="Write Latency"
            chartData={chartSeries.writeLatency}
            color={chartColors.blue500}
            currentLabel={formatLatency(metrics.writeLatencyMs)}
            yTickFormatter={latFmt}
            yLabel="ms"
            timeFormatter={timeFormatter}
          />
        </Flex>
      ) : null}
    </div>
  );
}
