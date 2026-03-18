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

type GpuMetrics = {
  gpuUtilizationPercent: number | null;
  gpuTemperatureCelsius: number | null;
  gpuPowerDrawWatts: number | null;
  gpuCoreClockMhz: number | null;
  gpuMemoryClockMhz: number | null;
  gpuVramUsedBytes: number | null;
  gpuVramTotalBytes: number | null;
  history: HistoryPoint[];
};

const basename = window.Config.basename;

const POLL_INTERVAL_MS = 2000;

type HistoryPoint = {
  t: number;
  utilization: number | null;
  temperature: number | null;
  power: number | null;
  coreClock: number | null;
  memoryClock: number | null;
};

// ─── Shared gauge/arc math ───────────────────────────────────────────────────

const GAUGE_SIZE = 168;
const STROKE_WIDTH = 12;
const PADDING = 10;
const CX = GAUGE_SIZE / 2;
const CY = GAUGE_SIZE / 2;
const RADIUS = (GAUGE_SIZE - PADDING * 2 - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SWEEP_DEGREES = 240;
const START_ANGLE = 240; // from 12 o'clock
const ACTIVE_ARC = (CIRCUMFERENCE * SWEEP_DEGREES) / 360;
const ROTATE = START_ANGLE - 90; // start at 8 o'clock (SVG 3 o'clock origin)

function pointOnCircle(
  angleFromTwelve: number,
  r: number
): { x: number; y: number } {
  const rad = (angleFromTwelve * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

const MAJOR_TICKS = [START_ANGLE, 0, START_ANGLE - SWEEP_DEGREES + 360]; // 240, 0, 120
const MINOR_TICKS = Array.from(
  { length: 11 },
  (_, i) => START_ANGLE + i * (SWEEP_DEGREES / 10)
).filter((a) => !MAJOR_TICKS.some((m) => Math.abs(m - a) < 0.001));

// ─── PercentGauge (utilization 0-100%) ───────────────────────────────────────

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
  const clamped =
    value == null ? null : Math.min(100, Math.max(0, value));
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
      <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`} role="img" aria-label={`${label}`}>
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="var(--chart-cartesian-grid-stroke-color)" strokeWidth={STROKE_WIDTH} />
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="var(--chart-axis-stroke-color)" strokeWidth={STROKE_WIDTH} strokeDasharray={`${ACTIVE_ARC} ${CIRCUMFERENCE}`} strokeLinecap="round" transform={`rotate(${ROTATE} ${CX} ${CY})`} opacity={0.65} />
        {clamped != null && clamped > 0 && (
          <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeDasharray={`${progressArc} ${CIRCUMFERENCE}`} strokeLinecap={clamped >= 100 ? "butt" : "round"} transform={`rotate(${ROTATE} ${CX} ${CY})`} />
        )}
        {MINOR_TICKS.map((a) => {
          const o = pointOnCircle(a, RADIUS + STROKE_WIDTH / 2 + 2);
          const i = pointOnCircle(a, RADIUS - STROKE_WIDTH / 2 - 6);
          return <line key={a} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="var(--chart-axis-stroke-color)" strokeWidth={1.5} opacity={0.5} />;
        })}
        {MAJOR_TICKS.map((a) => {
          const o = pointOnCircle(a, RADIUS + STROKE_WIDTH / 2 + 4);
          const i = pointOnCircle(a, RADIUS - STROKE_WIDTH / 2 - 10);
          return <line key={a} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="var(--chart-axis-stroke-color)" strokeWidth={2} opacity={0.85} />;
        })}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke={clamped == null ? "var(--chart-axis-stroke-color)" : color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={7} fill={clamped == null ? "var(--chart-axis-stroke-color)" : color} />
        <circle cx={CX} cy={CY} r={3} fill="var(--global-text-color-900)" opacity={0.7} />
        <text x={startPos.x} y={startPos.y + 4} textAnchor="middle" fill="var(--chart-axis-label-color)" fontSize="11">0</text>
        <text x={midPos.x} y={midPos.y - 6} textAnchor="middle" fill="var(--chart-axis-label-color)" fontSize="11">50</text>
        <text x={endPos.x} y={endPos.y + 4} textAnchor="middle" fill="var(--chart-axis-label-color)" fontSize="11">100</text>
        <text x={CX} y={CY + 22} textAnchor="middle" fill="var(--global-text-color-900)" fontSize="16" fontWeight={600}>
          {clamped == null ? "N/A" : `${clamped.toFixed(0)}%`}
        </text>
        {clamped != null && (
          <text x={CX} y={CY + 44} textAnchor="middle" fill="var(--chart-axis-label-color)" fontSize="11">0–100%</text>
        )}
      </svg>
      {detail && <Text size="XS" color="text-700">{detail}</Text>}
    </div>
  );
}

// ─── ValueGauge (temperature, power, clocks — raw values with configurable max) ─

function ValueGauge({
  label,
  value,
  max,
  unit,
  color,
  fractionDigits = 0,
}: {
  label: string;
  value: number | null;
  max: number;
  unit: string;
  color: string;
  fractionDigits?: number;
}) {
  const ratio = value == null ? null : Math.min(1, Math.max(0, value / max));
  const progressArc = ratio == null ? 0 : ACTIVE_ARC * ratio;
  const needleAngle = ratio == null ? START_ANGLE : START_ANGLE + ratio * SWEEP_DEGREES;
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
  const midVal = max / 2;

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
      <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`} role="img" aria-label={label}>
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="var(--chart-cartesian-grid-stroke-color)" strokeWidth={STROKE_WIDTH} />
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="var(--chart-axis-stroke-color)" strokeWidth={STROKE_WIDTH} strokeDasharray={`${ACTIVE_ARC} ${CIRCUMFERENCE}`} strokeLinecap="round" transform={`rotate(${ROTATE} ${CX} ${CY})`} opacity={0.65} />
        {ratio != null && ratio > 0 && (
          <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeDasharray={`${progressArc} ${CIRCUMFERENCE}`} strokeLinecap={ratio >= 1 ? "butt" : "round"} transform={`rotate(${ROTATE} ${CX} ${CY})`} />
        )}
        {MINOR_TICKS.map((a) => {
          const o = pointOnCircle(a, RADIUS + STROKE_WIDTH / 2 + 2);
          const i = pointOnCircle(a, RADIUS - STROKE_WIDTH / 2 - 6);
          return <line key={a} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="var(--chart-axis-stroke-color)" strokeWidth={1.5} opacity={0.5} />;
        })}
        {MAJOR_TICKS.map((a) => {
          const o = pointOnCircle(a, RADIUS + STROKE_WIDTH / 2 + 4);
          const i = pointOnCircle(a, RADIUS - STROKE_WIDTH / 2 - 10);
          return <line key={a} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="var(--chart-axis-stroke-color)" strokeWidth={2} opacity={0.85} />;
        })}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke={ratio == null ? "var(--chart-axis-stroke-color)" : color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={7} fill={ratio == null ? "var(--chart-axis-stroke-color)" : color} />
        <circle cx={CX} cy={CY} r={3} fill="var(--global-text-color-900)" opacity={0.7} />
        <text x={startPos.x} y={startPos.y + 4} textAnchor="middle" fill="var(--chart-axis-label-color)" fontSize="10">0</text>
        <text x={midPos.x} y={midPos.y - 6} textAnchor="middle" fill="var(--chart-axis-label-color)" fontSize="10">{midVal % 1 === 0 ? midVal : midVal.toFixed(1)}</text>
        <text x={endPos.x} y={endPos.y + 4} textAnchor="middle" fill="var(--chart-axis-label-color)" fontSize="10">{max}</text>
        <text x={CX} y={CY + 18} textAnchor="middle" fill="var(--global-text-color-900)" fontSize="15" fontWeight={600}>
          {value == null ? "N/A" : value.toFixed(fractionDigits)}
        </text>
        {value != null && (
          <text x={CX} y={CY + 36} textAnchor="middle" fill={color} fontSize="12" fontWeight={500}>{unit}</text>
        )}
        {value != null && (
          <text x={CX} y={CY + 52} textAnchor="middle" fill="var(--chart-axis-label-color)" fontSize="10">0–{max} {unit}</text>
        )}
      </svg>
    </div>
  );
}

// ─── MetricRow variants ───────────────────────────────────────────────────────

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
            <LineChart data={chartData} margin={{ top: 10, right: 18, bottom: 10, left: 0 }}>
              <XAxis {...defaultXAxisProps} dataKey="timestamp" type="number" scale="time" domain={["dataMin", "dataMax"]} minTickGap={24} tickFormatter={(t) => timeFormatter(new Date(t))} />
              <YAxis {...defaultYAxisProps} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} label={{ value: "%", angle: -90, dx: -18, style: { textAnchor: "middle", fill: "var(--chart-axis-label-color)" } }} />
              <CartesianGrid vertical={false} {...defaultCartesianGridProps} />
              <Line dataKey="value" type="monotone" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <PercentGauge label={title} value={value} color={color} detail={detail} />
    </div>
  );
}

function ValueMetricRow({
  title,
  chartData,
  color,
  value,
  max,
  unit,
  fractionDigits = 0,
  timeFormatter,
}: {
  title: string;
  chartData: Array<{ timestamp: number; value: number | null }>;
  color: string;
  value: number | null;
  max: number;
  unit: string;
  fractionDigits?: number;
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
            <LineChart data={chartData} margin={{ top: 10, right: 18, bottom: 10, left: 0 }}>
              <XAxis {...defaultXAxisProps} dataKey="timestamp" type="number" scale="time" domain={["dataMin", "dataMax"]} minTickGap={24} tickFormatter={(t) => timeFormatter(new Date(t))} />
              <YAxis {...defaultYAxisProps} domain={[0, max]} tickFormatter={(v) => `${v}`} width={52} label={{ value: unit, angle: -90, dx: -20, style: { textAnchor: "middle", fill: "var(--chart-axis-label-color)" } }} />
              <CartesianGrid vertical={false} {...defaultCartesianGridProps} />
              <Line dataKey="value" type="monotone" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ValueGauge label={title} value={value} max={max} unit={unit} color={color} fractionDigits={fractionDigits} />
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
      <div css={css`min-width: 0;`}>
        <Skeleton height={18} width={180} animation="wave" />
        <div css={css`height: 180px; margin-top: var(--ac-global-dimension-size-50);`}>
          <Skeleton height="100%" width="100%" borderRadius={8} animation="wave" />
        </div>
      </div>
      <div css={css`display: flex; flex-direction: column; align-items: center; gap: var(--ac-global-dimension-size-50);`}>
        <Skeleton height={16} width={60} animation="wave" />
        <Skeleton width={168} height={168} borderRadius="circle" animation="wave" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function GpuMonitorPage() {
  const [metrics, setMetrics] = useState<GpuMetrics | null>(null);
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
        const response = await fetch(`${basename}/api/system/gpu_metrics`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = (await response.json()) as GpuMetrics;
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
      utilization: history.map((p) => ({ timestamp: p.t, value: p.utilization })),
      temperature: history.map((p) => ({ timestamp: p.t, value: p.temperature })),
      power: history.map((p) => ({ timestamp: p.t, value: p.power })),
      coreClock: history.map((p) => ({ timestamp: p.t, value: p.coreClock })),
      memoryClock: history.map((p) => ({ timestamp: p.t, value: p.memoryClock })),
    }),
    [history]
  );

  const noGpu =
    metrics != null &&
    metrics.gpuUtilizationPercent == null &&
    metrics.gpuTemperatureCelsius == null &&
    metrics.gpuPowerDrawWatts == null;

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
          Failed to load GPU metrics: {errorMessage}
        </Alert>
      ) : null}

      {noGpu ? (
        <Alert
          variant="warning"
          banner
          icon={<Icon svg={<Icons.AlertCircleOutline />} />}
        >
          No NVIDIA GPU detected. Make sure <code>nvidia-smi</code> is available
          and a compatible GPU is present.
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

      {metrics && !noGpu ? (
        <Flex
          direction="column"
          gap="size-200"
          css={css`padding: var(--ac-global-dimension-size-200);`}
        >
          {/* GPU Compute Utilization */}
          <PercentMetricRow
            title="GPU Compute Utilization"
            chartData={chartSeries.utilization}
            color={chartColors.blue500}
            value={metrics.gpuUtilizationPercent}
            detail={
              metrics.gpuUtilizationPercent != null
                ? `${metrics.gpuUtilizationPercent.toFixed(1)}%`
                : undefined
            }
            timeFormatter={timeFormatter}
          />

          {/* GPU Temperature */}
          <ValueMetricRow
            title="GPU Temperature"
            chartData={chartSeries.temperature}
            color={chartColors.orange400}
            value={metrics.gpuTemperatureCelsius}
            max={120}
            unit="°C"
            timeFormatter={timeFormatter}
          />

          {/* GPU Power Draw */}
          <ValueMetricRow
            title="GPU Power Draw"
            chartData={chartSeries.power}
            color={chartColors.red400}
            value={metrics.gpuPowerDrawWatts}
            max={200}
            unit="W"
            fractionDigits={1}
            timeFormatter={timeFormatter}
          />

          {/* GPU Core Clock */}
          <ValueMetricRow
            title="GPU Core Clock"
            chartData={chartSeries.coreClock}
            color={chartColors.blue500}
            value={metrics.gpuCoreClockMhz}
            max={2000}
            unit="MHz"
            timeFormatter={timeFormatter}
          />

          {/* GPU Memory Clock */}
          <ValueMetricRow
            title="GPU Memory Clock"
            chartData={chartSeries.memoryClock}
            color={chartColors.purple400}
            value={metrics.gpuMemoryClockMhz}
            max={1000}
            unit="MHz"
            timeFormatter={timeFormatter}
          />
        </Flex>
      ) : null}
    </div>
  );
}
