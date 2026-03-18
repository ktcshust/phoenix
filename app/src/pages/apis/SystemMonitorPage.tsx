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
import { storageSizeFormatter } from "@phoenix/utils/storageSizeFormatUtils";

type SystemMetrics = {
  cpuPercent: number;
  ramUsedBytes: number;
  ramTotalBytes: number;
  vramUsedBytes: number | null;
  vramTotalBytes: number | null;
  storageUsedBytes: number;
  storageTotalBytes: number;
  history: HistoryPoint[];
};

const basename = window.Config.basename;

const POLL_INTERVAL_MS = 2000;

function percent(used: number, total: number) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return (used / total) * 100;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

type HistoryPoint = {
  t: number;
  cpu: number;
  ram: number | null;
  vram: number | null;
  storage: number | null;
};

function Gauge({
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
  const clamped = value == null ? null : clampPercent(value);
  const size = 168;
  const strokeWidth = 12;
  const padding = 10;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - padding * 2 - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Speedometer-like arc range:
  // - 0% at 8 o'clock
  // - 50% at 12 o'clock
  // - 100% at 4 o'clock
  // That is a 240° sweep, leaving the 4h→8h region as gray.
  const sweepDegrees = 240;
  const startAngleFromTwelveDegrees = 240;
  const endAngleFromTwelveDegrees = 120;
  const activeArcLength = (circumference * sweepDegrees) / 360;

  const isFull = clamped != null && clamped >= 100;
  const hasProgress = clamped != null && clamped > 0;
  const progressArcLength =
    clamped == null ? 0 : (activeArcLength * clampPercent(clamped)) / 100;

  // SVG circle starts at 3 o'clock; rotate so our 0% starts at 8 o'clock.
  // 8 o'clock is 240° clockwise from 12 o'clock, which is 150° from 3 o'clock.
  const rotationFromThreeDegrees = startAngleFromTwelveDegrees - 90;

  const needleAngleFromTwelveDegrees =
    clamped == null
      ? startAngleFromTwelveDegrees
      : startAngleFromTwelveDegrees + (clamped / 100) * sweepDegrees;
  const needleAngleRadians = (needleAngleFromTwelveDegrees * Math.PI) / 180;
  const needleLength = radius - strokeWidth / 2 - 6;
  const needleX = cx + needleLength * Math.sin(needleAngleRadians);
  const needleY = cy - needleLength * Math.cos(needleAngleRadians);

  function labelPosition(angleFromTwelveDegrees: number) {
    const angleRadians = (angleFromTwelveDegrees * Math.PI) / 180;
    const labelRadius = radius + strokeWidth / 2 + 14;
    return {
      x: cx + labelRadius * Math.sin(angleRadians),
      y: cy - labelRadius * Math.cos(angleRadians),
    };
  }

  function pointOnCircle(
    angleFromTwelveDegrees: number,
    pointRadius: number
  ): { x: number; y: number } {
    const angleRadians = (angleFromTwelveDegrees * Math.PI) / 180;
    return {
      x: cx + pointRadius * Math.sin(angleRadians),
      y: cy - pointRadius * Math.cos(angleRadians),
    };
  }

  const majorTickAnglesFromTwelveDegrees = [
    startAngleFromTwelveDegrees,
    0,
    endAngleFromTwelveDegrees,
  ];

  const minorTickAnglesFromTwelveDegrees = Array.from(
    { length: 11 },
    (_, index) => startAngleFromTwelveDegrees + index * (sweepDegrees / 10)
  ).filter(
    (angle) =>
      !majorTickAnglesFromTwelveDegrees.some(
        (majorAngle) => Math.abs(majorAngle - angle) < 0.0001
      )
  );

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
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label} utilization`}
      >
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--chart-cartesian-grid-stroke-color)"
          strokeWidth={strokeWidth}
        />

        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--chart-axis-stroke-color)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${activeArcLength} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(${rotationFromThreeDegrees} ${cx} ${cy})`}
          opacity={0.65}
        />

        {hasProgress ? (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${progressArcLength} ${circumference}`}
            strokeLinecap={isFull ? "butt" : "round"}
            transform={`rotate(${rotationFromThreeDegrees} ${cx} ${cy})`}
          />
        ) : null}

        {minorTickAnglesFromTwelveDegrees.map((angle) => {
          const outer = pointOnCircle(angle, radius + strokeWidth / 2 + 2);
          const inner = pointOnCircle(angle, radius - strokeWidth / 2 - 6);
          return (
            <line
              key={angle}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--chart-axis-stroke-color)"
              strokeWidth={1.5}
              opacity={0.5}
            />
          );
        })}

        {majorTickAnglesFromTwelveDegrees.map((angle) => {
          const outer = pointOnCircle(angle, radius + strokeWidth / 2 + 4);
          const inner = pointOnCircle(angle, radius - strokeWidth / 2 - 10);
          return (
            <line
              key={angle}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--chart-axis-stroke-color)"
              strokeWidth={2}
              opacity={0.85}
            />
          );
        })}

        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke={clamped == null ? "var(--chart-axis-stroke-color)" : color}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cy}
          r={7}
          fill={clamped == null ? "var(--chart-axis-stroke-color)" : color}
        />
        <circle
          cx={cx}
          cy={cy}
          r={3}
          fill="var(--global-text-color-900)"
          opacity={0.7}
        />

        {(() => {
          const startPos = labelPosition(startAngleFromTwelveDegrees);
          const midPos = labelPosition(0);
          const endPos = labelPosition(endAngleFromTwelveDegrees);
          return (
            <>
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
            </>
          );
        })()}

        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          fill="var(--global-text-color-900)"
          fontSize="16"
          fontWeight={600}
        >
          {clamped == null ? "N/A" : `${clamped.toFixed(0)}%`}
        </text>

        {clamped != null ? (
          <text
            x={cx}
            y={cy + 44}
            textAnchor="middle"
            fill="var(--chart-axis-label-color)"
            fontSize="11"
          >
            0–100%
          </text>
        ) : null}
      </svg>

      {detail ? (
        <Text size="XS" color="text-700">
          {detail}
        </Text>
      ) : null}
    </div>
  );
}

function MetricRow({
  title,
  chartData,
  color,
  value,
  detail,
  timeFormatter,
  connectNulls,
}: {
  title: string;
  chartData: Array<{ timestamp: number; value: number | null }>;
  color: string;
  value: number | null;
  detail?: string;
  timeFormatter: (date: Date) => string;
  connectNulls?: boolean;
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
      <div
        css={css`
          min-width: 0;
        `}
      >
        <Text weight="heavy">{title} (last 1 min)</Text>
        <div
          css={css`
            height: 180px;
          `}
        >
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
                tickFormatter={(tickValue) => `${tickValue}%`}
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
                connectNulls={connectNulls}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Gauge label={title} value={value} color={color} detail={detail} />
    </div>
  );
}

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
      <div
        css={css`
          min-width: 0;
        `}
      >
        <Skeleton height={18} width={180} animation="wave" />
        <div
          css={css`
            height: 180px;
            margin-top: var(--ac-global-dimension-size-50);
          `}
        >
          <Skeleton
            height="100%"
            width="100%"
            borderRadius={8}
            animation="wave"
          />
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
        <Skeleton height={16} width={60} animation="wave" />
        <Skeleton
          width={168}
          height={168}
          borderRadius="circle"
          animation="wave"
        />
        <Skeleton height={14} width={160} animation="wave" />
      </div>
    </div>
  );
}

export function SystemMonitorPage() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
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
        const response = await fetch(`${basename}/api/system/metrics`, {
          headers: {
            Accept: "application/json",
          },
          credentials: "same-origin",
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = (await response.json()) as SystemMetrics;
        if (isActive) {
          setErrorMessage(null);
          setMetrics(data);
          setHistory(data.history ?? []);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(message);
        setMetrics(null);
      }
    }

    async function poll() {
      await load();
      if (!isActive) {
        return;
      }
      timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      isActive = false;
      abortController?.abort();
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const derived = useMemo(() => {
    if (!metrics) {
      return null;
    }
    const ramPercent = percent(metrics.ramUsedBytes, metrics.ramTotalBytes);
    const storagePercent = percent(
      metrics.storageUsedBytes,
      metrics.storageTotalBytes
    );
    const vramPercent =
      metrics.vramUsedBytes != null && metrics.vramTotalBytes != null
        ? percent(metrics.vramUsedBytes, metrics.vramTotalBytes)
        : null;

    return {
      cpuPercent: clampPercent(metrics.cpuPercent),
      cpuText: `${metrics.cpuPercent.toFixed(1)}%`,
      ramPercent: ramPercent == null ? null : clampPercent(ramPercent),
      ramText: `${storageSizeFormatter(metrics.ramUsedBytes)} / ${storageSizeFormatter(metrics.ramTotalBytes)}${
        ramPercent == null ? "" : ` (${ramPercent.toFixed(1)}%)`
      }`,
      vramPercent: vramPercent == null ? null : clampPercent(vramPercent),
      vramText:
        metrics.vramUsedBytes == null || metrics.vramTotalBytes == null
          ? "N/A"
          : `${storageSizeFormatter(metrics.vramUsedBytes)} / ${storageSizeFormatter(metrics.vramTotalBytes)}${
              vramPercent == null ? "" : ` (${vramPercent.toFixed(1)}%)`
            }`,
      storagePercent: storagePercent == null ? null : clampPercent(storagePercent),
      storageText: `${storageSizeFormatter(metrics.storageUsedBytes)} / ${storageSizeFormatter(metrics.storageTotalBytes)}${
        storagePercent == null ? "" : ` (${storagePercent.toFixed(1)}%)`
      }`,
    };
  }, [metrics]);

  const chartSeries = useMemo(() => {
    const cpu = history.map((point) => ({ timestamp: point.t, value: point.cpu }));
    const ram = history.map((point) => ({
      timestamp: point.t,
      value: point.ram,
    }));
    const vram = history.map((point) => ({
      timestamp: point.t,
      value: point.vram,
    }));
    const storage = history.map((point) => ({
      timestamp: point.t,
      value: point.storage,
    }));

    return { cpu, ram, vram, storage };
  }, [history]);

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
          Failed to load system metrics: {errorMessage}
        </Alert>
      ) : null}
      {!errorMessage && !metrics ? (
        <Flex
          direction="column"
          gap="size-200"
          css={css`
            padding: var(--ac-global-dimension-size-200);
          `}
        >
          <MetricRowSkeleton />
          <MetricRowSkeleton />
          <MetricRowSkeleton />
          <MetricRowSkeleton />
        </Flex>
      ) : null}

      {derived ? (
        <Flex
          direction="column"
          gap="size-200"
          css={css`
            padding: var(--ac-global-dimension-size-200);
          `}
        >
          <MetricRow
            title="CPU"
            chartData={chartSeries.cpu}
            color={chartColors.blue500}
            value={derived.cpuPercent}
            detail={derived.cpuText}
            timeFormatter={timeFormatter}
          />
          <MetricRow
            title="RAM"
            chartData={chartSeries.ram}
            color={chartColors.orange400}
            value={derived.ramPercent}
            detail={derived.ramText}
            timeFormatter={timeFormatter}
            connectNulls
          />
          <MetricRow
            title="VRAM"
            chartData={chartSeries.vram}
            color={chartColors.purple400}
            value={derived.vramPercent}
            detail={derived.vramText}
            timeFormatter={timeFormatter}
            connectNulls
          />
          <MetricRow
            title="Storage"
            chartData={chartSeries.storage}
            color={chartColors.magenta400}
            value={derived.storagePercent}
            detail={derived.storageText}
            timeFormatter={timeFormatter}
            connectNulls
          />
        </Flex>
      ) : null}
    </div>
  );
}
