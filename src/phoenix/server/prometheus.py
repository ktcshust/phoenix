import logging
import os
import sys
import time
from collections import deque
from functools import lru_cache
from threading import Lock, Thread
from typing import Optional, TypedDict

logger = logging.getLogger(__name__)

import psutil
from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    Summary,
    start_http_server,
)
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Match

REQUESTS_PROCESSING_TIME = Summary(
    name="starlette_requests_processing_time_seconds_summary",
    documentation="Summary of requests processing time by method and path (in seconds)",
    labelnames=["method", "path"],
)
EXCEPTIONS = Counter(
    name="starlette_exceptions_total",
    documentation="Total count of exceptions raised by method, path and exception type",
    labelnames=["method", "path", "exception_type"],
)
RAM_METRIC = Gauge(
    name="memory_usage_bytes",
    documentation="Memory usage in bytes",
    labelnames=["type"],
)
CPU_METRIC = Gauge(
    name="cpu_usage_percent",
    documentation="CPU usage percent",
)
VRAM_METRIC = Gauge(
    name="vram_usage_bytes",
    documentation="VRAM (GPU memory) usage in bytes",
    labelnames=["type"],
)
GPU_UTILIZATION_METRIC = Gauge(
    name="gpu_utilization_percent",
    documentation="GPU compute utilization percent (0-100)",
)
GPU_TEMPERATURE_METRIC = Gauge(
    name="gpu_temperature_celsius",
    documentation="GPU temperature in Celsius",
)
GPU_POWER_METRIC = Gauge(
    name="gpu_power_draw_watts",
    documentation="GPU power draw in watts",
)
GPU_CLOCK_METRIC = Gauge(
    name="gpu_clock_mhz",
    documentation="GPU clock speed in MHz",
    labelnames=["type"],
)
STORAGE_METRIC = Gauge(
    name="storage_usage_bytes",
    documentation="Storage/Disk usage in bytes",
    labelnames=["type"],
)
BULK_LOADER_SPAN_INSERTION_TIME = Histogram(
    namespace="phoenix",
    name="bulk_loader_span_insertion_time_seconds",
    documentation="Histogram of span database insertion time (seconds)",
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 180.0],  # 500ms to 3min
)

BULK_LOADER_SPAN_EXCEPTIONS = Counter(
    namespace="phoenix",
    name="bulk_loader_span_exceptions_total",
    documentation="Total count of span insertion exceptions",
)

BULK_LOADER_EVALUATION_INSERTIONS = Counter(
    name="bulk_loader_evaluation_insertions_total",
    documentation="Total count of bulk loader evaluation insertions",
)
BULK_LOADER_EXCEPTIONS = Counter(
    name="bulk_loader_exceptions_total",
    documentation="Total count of bulk loader exceptions",
)

RATE_LIMITER_CACHE_SIZE = Gauge(
    name="rate_limiter_cache_size",
    documentation="Current size of the rate limiter cache",
)

RATE_LIMITER_THROTTLES = Counter(
    name="rate_limiter_throttles_total",
    documentation="Total count of rate limiter throttles",
)

JWT_STORE_TOKENS_ACTIVE = Gauge(
    name="jwt_store_tokens_active",
    documentation="Current number of refresh tokens in the JWT store",
)

JWT_STORE_API_KEYS_ACTIVE = Gauge(
    name="jwt_store_api_keys_active",
    documentation="Current number of API keys in the JWT store",
)

DB_DISK_USAGE_BYTES = Gauge(
    name="database_disk_usage_bytes",
    documentation="Current database disk usage in bytes",
)
DB_DISK_USAGE_RATIO = Gauge(
    name="database_disk_usage_ratio",
    documentation="Current database disk usage as ratio of allocated capacity (0-1)",
)
DB_INSERTIONS_BLOCKED = Gauge(
    name="database_insertions_blocked",
    documentation="Whether database insertions are currently blocked due to disk usage "
    "(1 = blocked, 0 = not blocked)",
)
DB_DISK_USAGE_WARNING_EMAILS_SENT = Counter(
    name="database_disk_usage_warning_emails_sent_total",
    documentation="Total count of database disk usage warning emails sent",
)
DB_DISK_USAGE_WARNING_EMAIL_ERRORS = Counter(
    name="database_disk_usage_warning_email_errors_total",
    documentation="Total count of database disk usage warning email send errors",
)

SPAN_QUEUE_REJECTIONS = Counter(
    namespace="phoenix",
    name="span_queue_rejections_total",
    documentation="Total count of requests rejected due to span queue being full",
)

SPAN_QUEUE_SIZE = Gauge(
    namespace="phoenix",
    name="span_queue_size",
    documentation="Current number of spans in the processing queue",
)

BULK_LOADER_LAST_ACTIVITY = Gauge(
    namespace="phoenix",
    name="bulk_loader_last_activity_timestamp_seconds",
    documentation="Unix timestamp when bulk loader last processed items",
)

RETENTION_SWEEPER_LAST_RUN = Gauge(
    namespace="phoenix",
    name="retention_sweeper_last_run_seconds",
    documentation="Unix timestamp (seconds since epoch) of the last retention sweeper run",
)

RETENTION_POLICY_EXECUTIONS = Counter(
    namespace="phoenix",
    name="retention_policy_executions_total",
    documentation="Total number of retention policy executions",
    labelnames=["status"],
)

# ─── Network I/O metrics ──────────────────────────────────────────────────────

NETWORK_BYTES_SENT_METRIC = Gauge(
    name="network_bytes_sent_per_second",
    documentation="Network bytes sent per second (host-level)",
)
NETWORK_BYTES_RECV_METRIC = Gauge(
    name="network_bytes_recv_per_second",
    documentation="Network bytes received per second (host-level)",
)
NETWORK_CONNECTIONS_METRIC = Gauge(
    name="network_tcp_connections",
    documentation="TCP connection count by state",
    labelnames=["state"],
)

# ─── Disk I/O metrics ─────────────────────────────────────────────────────────

DISK_READ_BYTES_METRIC = Gauge(
    name="disk_read_bytes_per_second",
    documentation="Disk read throughput in bytes per second",
)
DISK_WRITE_BYTES_METRIC = Gauge(
    name="disk_write_bytes_per_second",
    documentation="Disk write throughput in bytes per second",
)
DISK_READ_IOPS_METRIC = Gauge(
    name="disk_read_iops",
    documentation="Disk read operations per second",
)
DISK_WRITE_IOPS_METRIC = Gauge(
    name="disk_write_iops",
    documentation="Disk write operations per second",
)
DISK_BUSY_PERCENT_METRIC = Gauge(
    name="disk_busy_percent",
    documentation="Disk busy time percentage (0-100)",
)
DISK_READ_LATENCY_METRIC = Gauge(
    name="disk_read_latency_ms",
    documentation="Average disk read latency in milliseconds",
)
DISK_WRITE_LATENCY_METRIC = Gauge(
    name="disk_write_latency_ms",
    documentation="Average disk write latency in milliseconds",
)


# ─── Typed history point definitions ────────────────────────────────────────
# These types define the shape of each entry in the ring buffers.
# Library consumers can import these for type-safe access.


class SystemHistoryPoint(TypedDict):
    """One second snapshot of host-level system metrics (percentages 0-100)."""
    t: int                   # Unix timestamp in milliseconds
    cpu: Optional[float]     # CPU usage %
    ram: Optional[float]     # RAM usage %
    vram: Optional[float]    # VRAM usage % (None if no GPU)
    storage: Optional[float] # Storage usage %


class GpuHistoryPoint(TypedDict):
    """One second snapshot of NVIDIA GPU metrics."""
    t: int
    utilization: Optional[float]  # GPU compute utilization %
    temperature: Optional[float]  # GPU temperature °C
    power: Optional[float]        # GPU power draw W
    coreClock: Optional[int]      # GPU core clock MHz
    memoryClock: Optional[int]    # GPU memory clock MHz


class NetworkHistoryPoint(TypedDict):
    """One second snapshot of host network I/O."""
    t: int
    bytesSent: Optional[float]      # Bytes sent per second
    bytesRecv: Optional[float]      # Bytes received per second
    tcpEstablished: Optional[int]   # TCP connections in ESTABLISHED state
    tcpTimeWait: Optional[int]      # TCP connections in TIME_WAIT state
    tcpCloseWait: Optional[int]     # TCP connections in CLOSE_WAIT state


class DiskHistoryPoint(TypedDict):
    """One second snapshot of host disk I/O."""
    t: int
    readBytes: Optional[float]    # Disk read throughput bytes/s
    writeBytes: Optional[float]   # Disk write throughput bytes/s
    readIops: Optional[float]     # Disk read operations/s
    writeIops: Optional[float]    # Disk write operations/s
    busy: Optional[float]         # Disk busy % (Linux only)
    readLatency: Optional[float]  # Average read latency ms
    writeLatency: Optional[float] # Average write latency ms


# ─── Ring buffers for metrics history ──────────────────────────────────────────
# 61 points = 60 seconds at 1-second collection intervals
_HISTORY_MAXLEN = 61
_system_history: deque[SystemHistoryPoint] = deque(maxlen=_HISTORY_MAXLEN)
_gpu_history: deque[GpuHistoryPoint] = deque(maxlen=_HISTORY_MAXLEN)
_network_history: deque[NetworkHistoryPoint] = deque(maxlen=_HISTORY_MAXLEN)
_disk_history: deque[DiskHistoryPoint] = deque(maxlen=_HISTORY_MAXLEN)
_history_lock = Lock()
_collection_start_lock = Lock()
_collection_started = False


def get_system_history() -> list[SystemHistoryPoint]:
    """Return a snapshot of the last 60 seconds of system metrics."""
    with _history_lock:
        return list(_system_history)


def get_gpu_history() -> list[GpuHistoryPoint]:
    """Return a snapshot of the last 60 seconds of GPU metrics."""
    with _history_lock:
        return list(_gpu_history)


def get_network_history() -> list[NetworkHistoryPoint]:
    """Return a snapshot of the last 60 seconds of network I/O metrics."""
    with _history_lock:
        return list(_network_history)


def get_disk_history() -> list[DiskHistoryPoint]:
    """Return a snapshot of the last 60 seconds of disk I/O metrics."""
    with _history_lock:
        return list(_disk_history)


class PrometheusMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        for route in request.app.routes:
            match, _ = route.matches(request.scope)
            if match is Match.FULL:
                path = route.path
                break
        else:
            return await call_next(request)
        method = request.method
        start_time = time.perf_counter()
        try:
            response = await call_next(request)
        except BaseException as e:
            EXCEPTIONS.labels(method=method, path=path, exception_type=type(e).__name__).inc()
            raise
        end_time = time.perf_counter()
        REQUESTS_PROCESSING_TIME.labels(method=method, path=path).observe(end_time - start_time)
        return response


def start_collection() -> None:
    """Start the background thread that collects system metrics every second.

    This populates the ring buffers (get_*_history()) and updates Prometheus
    gauges. Safe to call multiple times — subsequent calls are no-ops because
    the thread is daemonised and will not be restarted.
    """
    global _collection_started
    with _collection_start_lock:
        if _collection_started:
            return
        Thread(target=gather_system_data, daemon=True).start()
        _collection_started = True


def start_prometheus_http(port: int = 9090) -> None:
    """Start the Prometheus HTTP scrape endpoint on the given port.

    Exposes all Prometheus metrics at ``http://<host>:<port>/metrics``.
    Call this only when you want external Prometheus scraping; it is
    independent of metric collection (see :func:`start_collection`).
    """
    _start_http_server_safe(port)


def start_prometheus() -> None:
    """Start both metric collection and the Prometheus HTTP server.

    Convenience wrapper that calls :func:`start_collection` and
    :func:`start_prometheus_http`. Preserved for backward compatibility.
    """
    start_collection()
    start_prometheus_http()


def _start_http_server_safe(port: int = 9090) -> None:
    """Start Prometheus HTTP server with address fallback.

    Tries IPv6 dual-stack first (covers both IPv4+IPv6 on Linux), then falls
    back to IPv4-only. Logs a warning but never crashes the host process so
    that internal metric collection continues working regardless.
    """
    candidates = [
        ("::", "IPv6 dual-stack"),
        ("0.0.0.0", "IPv4"),
    ]
    for addr, label in candidates:
        try:
            start_http_server(port, addr=addr)
            logger.info("Prometheus HTTP server listening on %s:%d (%s)", addr, port, label)
            return
        except OSError as exc:
            logger.debug(
                "Prometheus HTTP server could not bind to %s:%d (%s): %s",
                addr,
                port,
                label,
                exc,
            )
    logger.warning(
        "Prometheus HTTP server could not start on port %d "
        "(tried IPv6 and IPv4). Internal metric collection continues; "
        "set PHOENIX_ENABLE_PROMETHEUS=false to suppress this warning.",
        port,
    )


def _clamp_pct(v: Optional[float]) -> Optional[float]:
    return None if v is None else round(min(100.0, max(0.0, v)), 2)


def gather_system_data() -> None:
    while True:
        time.sleep(1)

        now_ms = int(time.time() * 1000)

        # ── Collect all metrics ────────────────────────────────
        ram_used = estimate_memory_usage_bytes()
        swap_used = estimate_swap_usage_bytes()
        cpu_val = estimate_cpu_usage_percent()
        gpu = _query_all_gpu_metrics()
        storage_used, storage_total = estimate_storage_usage_bytes()
        net = collect_network_metrics()
        disk = collect_disk_io_metrics()

        # ── Set Prometheus gauges ──────────────────────────────
        RAM_METRIC.labels(type="virtual").set(ram_used)
        RAM_METRIC.labels(type="swap").set(swap_used)
        if cpu_val is not None:
            CPU_METRIC.set(cpu_val)

        if gpu["vram_used"] is not None:
            VRAM_METRIC.labels(type="used").set(gpu["vram_used"])
        if gpu["vram_total"] is not None:
            VRAM_METRIC.labels(type="total").set(gpu["vram_total"])
        if gpu["utilization"] is not None:
            GPU_UTILIZATION_METRIC.set(gpu["utilization"])
        if gpu["temperature"] is not None:
            GPU_TEMPERATURE_METRIC.set(gpu["temperature"])
        if gpu["power"] is not None:
            GPU_POWER_METRIC.set(gpu["power"])
        if gpu["core_clock"] is not None:
            GPU_CLOCK_METRIC.labels(type="core").set(gpu["core_clock"])
        if gpu["memory_clock"] is not None:
            GPU_CLOCK_METRIC.labels(type="memory").set(gpu["memory_clock"])

        if storage_used is not None:
            STORAGE_METRIC.labels(type="used").set(storage_used)
        if storage_total is not None:
            STORAGE_METRIC.labels(type="total").set(storage_total)

        if net["bytes_sent_per_sec"] is not None:
            NETWORK_BYTES_SENT_METRIC.set(net["bytes_sent_per_sec"])
        if net["bytes_recv_per_sec"] is not None:
            NETWORK_BYTES_RECV_METRIC.set(net["bytes_recv_per_sec"])
        if net["tcp_established"] is not None:
            NETWORK_CONNECTIONS_METRIC.labels(state="ESTABLISHED").set(net["tcp_established"])
        if net["tcp_time_wait"] is not None:
            NETWORK_CONNECTIONS_METRIC.labels(state="TIME_WAIT").set(net["tcp_time_wait"])
        if net["tcp_close_wait"] is not None:
            NETWORK_CONNECTIONS_METRIC.labels(state="CLOSE_WAIT").set(net["tcp_close_wait"])

        if disk["read_bytes_per_sec"] is not None:
            DISK_READ_BYTES_METRIC.set(disk["read_bytes_per_sec"])
        if disk["write_bytes_per_sec"] is not None:
            DISK_WRITE_BYTES_METRIC.set(disk["write_bytes_per_sec"])
        if disk["read_iops"] is not None:
            DISK_READ_IOPS_METRIC.set(disk["read_iops"])
        if disk["write_iops"] is not None:
            DISK_WRITE_IOPS_METRIC.set(disk["write_iops"])
        if disk["busy_percent"] is not None:
            DISK_BUSY_PERCENT_METRIC.set(disk["busy_percent"])
        if disk["read_latency_ms"] is not None:
            DISK_READ_LATENCY_METRIC.set(disk["read_latency_ms"])
        if disk["write_latency_ms"] is not None:
            DISK_WRITE_LATENCY_METRIC.set(disk["write_latency_ms"])

        # ── Append to ring buffers for history ─────────────────
        ram_total = estimate_memory_total_bytes()
        ram_pct = _clamp_pct((ram_used / ram_total * 100) if ram_total > 0 else None)
        vram_pct = None
        if (
            gpu["vram_used"] is not None
            and gpu["vram_total"] is not None
            and gpu["vram_total"] > 0
        ):
            vram_pct = _clamp_pct(gpu["vram_used"] / gpu["vram_total"] * 100)
        storage_pct = None
        if storage_used is not None and storage_total is not None and storage_total > 0:
            storage_pct = _clamp_pct(storage_used / storage_total * 100)

        with _history_lock:
            _system_history.append(
                {
                    "t": now_ms,
                    "cpu": _clamp_pct(cpu_val),
                    "ram": ram_pct,
                    "vram": vram_pct,
                    "storage": storage_pct,
                }
            )
            _gpu_history.append(
                {
                    "t": now_ms,
                    "utilization": gpu["utilization"],
                    "temperature": gpu["temperature"],
                    "power": gpu["power"],
                    "coreClock": gpu["core_clock"],
                    "memoryClock": gpu["memory_clock"],
                }
            )
            _network_history.append(
                {
                    "t": now_ms,
                    "bytesSent": net["bytes_sent_per_sec"],
                    "bytesRecv": net["bytes_recv_per_sec"],
                    "tcpEstablished": net["tcp_established"],
                    "tcpTimeWait": net["tcp_time_wait"],
                    "tcpCloseWait": net["tcp_close_wait"],
                }
            )
            _disk_history.append(
                {
                    "t": now_ms,
                    "readBytes": disk["read_bytes_per_sec"],
                    "writeBytes": disk["write_bytes_per_sec"],
                    "readIops": disk["read_iops"],
                    "writeIops": disk["write_iops"],
                    "busy": disk["busy_percent"],
                    "readLatency": disk["read_latency_ms"],
                    "writeLatency": disk["write_latency_ms"],
                }
            )


def estimate_memory_usage_bytes() -> int:
    # https://docs.docker.com/engine/containers/runmetrics/
    # psutil reports host-level metrics, use cgroups if running on linux

    if sys.platform == "linux":
        cgroup_v1_file = "/sys/fs/cgroup/memory/memory.usage_in_bytes"
        cgroup_v2_file = "/sys/fs/cgroup/memory.current"

        if is_cgroup_v2():
            try:
                with open(cgroup_v2_file, "r") as f:
                    return int(f.read().strip())
            except Exception:
                pass
        else:
            try:
                with open(cgroup_v1_file, "r") as f:
                    return int(f.read().strip())
            except Exception:
                pass
    return psutil.virtual_memory().used


def estimate_memory_total_bytes() -> int:
    """Return the effective memory limit for the current process/container.

    In a Docker container with a memory limit set (e.g. ``--memory 4g``),
    returns the cgroup limit rather than the host physical RAM so that
    percentage calculations reflect container headroom, not host headroom.

    Falls back to ``psutil.virtual_memory().total`` when:
    - Not on Linux
    - cgroup memory limit is set to "unlimited" (v2 returns ``max``;
      v1 returns a value close to 2^63 which exceeds physical RAM)
    - Any read error
    """
    if sys.platform == "linux":
        host_total = psutil.virtual_memory().total

        if is_cgroup_v2():
            try:
                with open("/sys/fs/cgroup/memory.max", "r") as f:
                    raw = f.read().strip()
                if raw != "max":
                    limit = int(raw)
                    # Sanity check: ignore absurdly large values (unlimited sentinel)
                    if 0 < limit < host_total:
                        return limit
            except Exception:
                pass
        else:
            try:
                with open("/sys/fs/cgroup/memory/memory.limit_in_bytes", "r") as f:
                    limit = int(f.read().strip())
                # cgroup v1 uses 2^63-4096 as the "unlimited" sentinel
                if 0 < limit < host_total:
                    return limit
            except Exception:
                pass

    return psutil.virtual_memory().total


def estimate_swap_usage_bytes() -> int:
    if sys.platform == "linux":
        # cgroup v2: swap usage file (if swap accounting is enabled).
        cgroup_v2_swap_file = "/sys/fs/cgroup/memory.swap.current"
        cgroup_v1_swap_file = "/sys/fs/cgroup/memory/memory.memsw.usage_in_bytes"

        if is_cgroup_v2() and os.path.exists(cgroup_v2_swap_file):
            try:
                with open(cgroup_v2_swap_file, "r") as f:
                    return int(f.read().strip())
            except Exception:
                pass
        elif os.path.exists(cgroup_v1_swap_file):
            try:
                with open(cgroup_v1_swap_file, "r") as f:
                    return int(f.read().strip())
            except Exception:
                pass
    return psutil.swap_memory().used


_previous_cpu_sample: dict[str, tuple[float, float]] = {}  # cache for previous cpu usage sample
_previous_net_sample: dict = {}  # cache for previous network I/O counters
_previous_disk_sample: dict = {}  # cache for previous disk I/O counters (psutil fallback)
_previous_cgroup_disk_sample: dict = {}  # cache for previous cgroup disk I/O sample


def estimate_cpu_usage_percent() -> Optional[float]:
    # https://docs.docker.com/engine/containers/runmetrics/
    # psutil reports host-level metrics, use cgroups if running on linux

    current_time = time.time()

    if sys.platform.startswith("linux"):
        cgroup_v2_cpu_stat = "/sys/fs/cgroup/cpu.stat"
        cgroup_v1_cpu_usage = "/sys/fs/cgroup/cpuacct/cpuacct.usage"
        if is_cgroup_v2():
            try:
                with open(cgroup_v2_cpu_stat, "r") as f:
                    lines = f.readlines()
                stats = {}
                for line in lines:
                    parts = line.strip().split()
                    if len(parts) == 2:
                        stats[parts[0]] = float(parts[1])
                if "usage_usec" in stats:
                    usage = stats["usage_usec"]
                    key = "cgroup_v2"
                    if key in _previous_cpu_sample:
                        prev_usage, prev_time = _previous_cpu_sample[key]
                        delta_usage = usage - prev_usage  # in microseconds
                        delta_time = current_time - prev_time
                        _previous_cpu_sample[key] = (usage, current_time)
                        if delta_time > 0:
                            # Convert microseconds to seconds.
                            return round((delta_usage / (delta_time * 1e6)) * 100, 2)
                    else:
                        _previous_cpu_sample[key] = (usage, current_time)
                        return None  # No previous sample yet.
            except Exception:
                pass
        else:
            try:
                with open(cgroup_v1_cpu_usage, "r") as f:
                    usage = int(f.read().strip())
                key = "cgroup_v1"
                if key in _previous_cpu_sample:
                    prev_usage, prev_time = _previous_cpu_sample[key]
                    delta_usage = usage - prev_usage  # in nanoseconds
                    delta_time = current_time - prev_time
                    _previous_cpu_sample[key] = (usage, current_time)
                    if delta_time > 0:
                        # Convert nanoseconds to seconds.
                        return round((delta_usage / (delta_time * 1e9)) * 100, 2)
                else:
                    _previous_cpu_sample[key] = (usage, current_time)
                    return None  # No previous sample yet.
            except Exception:
                pass
        return psutil.cpu_percent(interval=None)
    return None


@lru_cache(maxsize=1)
def is_cgroup_v2() -> bool:
    return os.path.exists("/sys/fs/cgroup/cgroup.controllers")


def _query_all_gpu_metrics() -> dict:
    """Run nvidia-smi once and return all GPU metrics as a dict.

    Fields: vram_used (bytes), vram_total (bytes), utilization (%), temperature (°C),
            power (W), core_clock (MHz), memory_clock (MHz). Any field is None on failure.
    """
    import subprocess

    empty: dict = {
        "vram_used": None,
        "vram_total": None,
        "utilization": None,
        "temperature": None,
        "power": None,
        "core_clock": None,
        "memory_clock": None,
    }
    try:
        completed = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=memory.used,memory.total,"
                "utilization.gpu,temperature.gpu,"
                "power.draw,clocks.current.graphics,clocks.current.memory",
                "--format=csv,noheader,nounits",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=2,
        )
    except Exception:
        return empty

    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        return empty

    parts = [p.strip() for p in lines[0].split(",")]
    if len(parts) < 7:
        return empty

    def _int(s: str) -> Optional[int]:
        try:
            v = int(float(s))
            return v if v >= 0 else None
        except Exception:
            return None

    def _float(s: str) -> Optional[float]:
        try:
            v = float(s)
            return v if v >= 0 else None
        except Exception:
            return None

    mib = 1024 * 1024
    vram_used_mib = _int(parts[0])
    vram_total_mib = _int(parts[1])
    return {
        "vram_used": vram_used_mib * mib if vram_used_mib is not None else None,
        "vram_total": vram_total_mib * mib if vram_total_mib is not None and vram_total_mib > 0 else None,
        "utilization": _float(parts[2]),
        "temperature": _float(parts[3]),
        "power": _float(parts[4]),
        "core_clock": _int(parts[5]),
        "memory_clock": _int(parts[6]),
    }


def estimate_vram_usage_bytes() -> tuple[Optional[int], Optional[int]]:
    """Estimate VRAM (GPU memory) usage using nvidia-smi.

    Returns:
        Tuple of (used_bytes, total_bytes), or (None, None) if nvidia-smi unavailable.
    """
    gpu = _query_all_gpu_metrics()
    return gpu["vram_used"], gpu["vram_total"]


def estimate_storage_usage_bytes() -> tuple[Optional[int], Optional[int]]:
    """Estimate storage/disk usage for the Phoenix working directory.
    
    Returns:
        Tuple of (used_bytes, total_bytes), or (None, None) if unavailable.
    """
    try:
        from phoenix.config import get_working_dir
        storage = psutil.disk_usage(str(get_working_dir()))
        return int(storage.used), int(storage.total)
    except Exception:
        return None, None


def collect_network_metrics() -> dict:
    """Compute per-second network I/O rates and TCP connection counts.

    Rates are derived from the delta between successive psutil samples collected
    1 second apart by the background thread. Returns None for rate fields on the
    first call (no previous sample) or on any error.

    Returns a dict with keys:
        bytes_sent_per_sec, bytes_recv_per_sec,
        tcp_established, tcp_time_wait, tcp_close_wait
    """
    global _previous_net_sample

    empty: dict = {
        "bytes_sent_per_sec": None,
        "bytes_recv_per_sec": None,
        "tcp_established": None,
        "tcp_time_wait": None,
        "tcp_close_wait": None,
    }

    try:
        net = psutil.net_io_counters()
        now = time.monotonic()

        bytes_sent_per_sec: Optional[float] = None
        bytes_recv_per_sec: Optional[float] = None

        if _previous_net_sample:
            dt = now - _previous_net_sample["t"]
            if dt > 0:
                bytes_sent_per_sec = max(
                    0.0, (net.bytes_sent - _previous_net_sample["bytes_sent"]) / dt
                )
                bytes_recv_per_sec = max(
                    0.0, (net.bytes_recv - _previous_net_sample["bytes_recv"]) / dt
                )

        _previous_net_sample = {
            "t": now,
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
        }

        # TCP connection state counts — may require elevated privileges on some OSes
        try:
            connections = psutil.net_connections(kind="tcp")
            tcp_established = sum(1 for c in connections if c.status == "ESTABLISHED")
            tcp_time_wait = sum(1 for c in connections if c.status == "TIME_WAIT")
            tcp_close_wait = sum(1 for c in connections if c.status == "CLOSE_WAIT")
        except Exception:
            tcp_established = tcp_time_wait = tcp_close_wait = None

        return {
            "bytes_sent_per_sec": bytes_sent_per_sec,
            "bytes_recv_per_sec": bytes_recv_per_sec,
            "tcp_established": tcp_established,
            "tcp_time_wait": tcp_time_wait,
            "tcp_close_wait": tcp_close_wait,
        }
    except Exception:
        return empty


def _read_cgroup_io_stat() -> Optional[dict]:
    """Read cumulative disk I/O counters from the container's cgroup.

    On cgroup v2 reads ``/sys/fs/cgroup/io.stat``; on cgroup v1 reads
    ``blkio.throttle.io_service_bytes`` and ``blkio.throttle.io_serviced``.
    All device stats are summed to give container-wide totals.

    Returns a dict with keys ``read_bytes``, ``write_bytes``, ``read_count``,
    ``write_count``, or ``None`` if cgroup I/O accounting is unavailable.
    """
    if sys.platform != "linux":
        return None

    if is_cgroup_v2():
        # Format per line: MAJ:MIN rbytes=N wbytes=N rios=N wios=N dbytes=N dios=N
        try:
            with open("/sys/fs/cgroup/io.stat", "r") as f:
                content = f.read()
            read_bytes = write_bytes = read_count = write_count = 0
            for line in content.splitlines():
                parts = line.strip().split()
                if len(parts) < 2:
                    continue
                for part in parts[1:]:
                    if "=" in part:
                        k, _, v = part.partition("=")
                        try:
                            val = int(v)
                        except ValueError:
                            continue
                        if k == "rbytes":
                            read_bytes += val
                        elif k == "wbytes":
                            write_bytes += val
                        elif k == "rios":
                            read_count += val
                        elif k == "wios":
                            write_count += val
            return {
                "read_bytes": read_bytes,
                "write_bytes": write_bytes,
                "read_count": read_count,
                "write_count": write_count,
            }
        except Exception:
            return None
    else:
        # cgroup v1: blkio throttle accounting
        try:
            read_bytes = write_bytes = read_count = write_count = 0
            with open("/sys/fs/cgroup/blkio/blkio.throttle.io_service_bytes", "r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) == 3 and parts[0] != "Total":
                        try:
                            val = int(parts[2])
                        except ValueError:
                            continue
                        if parts[1] == "Read":
                            read_bytes += val
                        elif parts[1] == "Write":
                            write_bytes += val
            with open("/sys/fs/cgroup/blkio/blkio.throttle.io_serviced", "r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) == 3 and parts[0] != "Total":
                        try:
                            val = int(parts[2])
                        except ValueError:
                            continue
                        if parts[1] == "Read":
                            read_count += val
                        elif parts[1] == "Write":
                            write_count += val
            return {
                "read_bytes": read_bytes,
                "write_bytes": write_bytes,
                "read_count": read_count,
                "write_count": write_count,
            }
        except Exception:
            return None


def collect_disk_io_metrics() -> dict:
    """Compute per-second disk I/O rates, busy %, and latency.

    Prefers container-accurate cgroup I/O accounting when available
    (cgroup v2 ``io.stat`` or cgroup v1 ``blkio.throttle.*``).  Falls back to
    ``psutil.disk_io_counters()`` which reads host-level ``/proc/diskstats``
    (useful outside Docker or when cgroup I/O accounting is disabled).

    busy_percent and latency are only available on the psutil path because
    cgroup does not expose per-container disk busy time or operation latency.

    Returns a dict with keys:
        read_bytes_per_sec, write_bytes_per_sec,
        read_iops, write_iops,
        busy_percent,
        read_latency_ms, write_latency_ms
    """
    global _previous_disk_sample, _previous_cgroup_disk_sample

    empty: dict = {
        "read_bytes_per_sec": None,
        "write_bytes_per_sec": None,
        "read_iops": None,
        "write_iops": None,
        "busy_percent": None,
        "read_latency_ms": None,
        "write_latency_ms": None,
    }

    try:
        # ── Container-accurate path: cgroup I/O accounting ────────────────────
        cgroup = _read_cgroup_io_stat()
        if cgroup is not None:
            now = time.monotonic()
            read_bytes_per_sec: Optional[float] = None
            write_bytes_per_sec: Optional[float] = None
            read_iops: Optional[float] = None
            write_iops: Optional[float] = None

            if _previous_cgroup_disk_sample:
                dt = now - _previous_cgroup_disk_sample["t"]
                if dt > 0:
                    read_bytes_per_sec = max(
                        0.0,
                        (cgroup["read_bytes"] - _previous_cgroup_disk_sample["read_bytes"]) / dt,
                    )
                    write_bytes_per_sec = max(
                        0.0,
                        (cgroup["write_bytes"] - _previous_cgroup_disk_sample["write_bytes"]) / dt,
                    )
                    delta_ri = cgroup["read_count"] - _previous_cgroup_disk_sample["read_count"]
                    delta_wi = cgroup["write_count"] - _previous_cgroup_disk_sample["write_count"]
                    read_iops = max(0.0, delta_ri / dt)
                    write_iops = max(0.0, delta_wi / dt)

            _previous_cgroup_disk_sample = {
                "t": now,
                "read_bytes": cgroup["read_bytes"],
                "write_bytes": cgroup["write_bytes"],
                "read_count": cgroup["read_count"],
                "write_count": cgroup["write_count"],
            }

            # busy_percent and latency are not available per-container from cgroup
            return {
                "read_bytes_per_sec": read_bytes_per_sec,
                "write_bytes_per_sec": write_bytes_per_sec,
                "read_iops": read_iops,
                "write_iops": write_iops,
                "busy_percent": None,
                "read_latency_ms": None,
                "write_latency_ms": None,
            }

        # ── Fallback: host-level psutil (outside Docker or cgroup I/O disabled) ─
        disk = psutil.disk_io_counters()
        if disk is None:
            return empty

        now = time.monotonic()

        read_bytes_per_sec = None
        write_bytes_per_sec = None
        read_iops = None
        write_iops = None
        busy_percent: Optional[float] = None
        read_latency_ms: Optional[float] = None
        write_latency_ms: Optional[float] = None

        if _previous_disk_sample:
            dt = now - _previous_disk_sample["t"]
            if dt > 0:
                read_bytes_per_sec = max(
                    0.0, (disk.read_bytes - _previous_disk_sample["read_bytes"]) / dt
                )
                write_bytes_per_sec = max(
                    0.0, (disk.write_bytes - _previous_disk_sample["write_bytes"]) / dt
                )

                delta_read_count = disk.read_count - _previous_disk_sample["read_count"]
                delta_write_count = disk.write_count - _previous_disk_sample["write_count"]
                read_iops = max(0.0, delta_read_count / dt)
                write_iops = max(0.0, delta_write_count / dt)

                # busy_time is in milliseconds (Linux only via /proc/diskstats)
                prev_busy = _previous_disk_sample.get("busy_time")
                curr_busy = getattr(disk, "busy_time", None)
                if prev_busy is not None and curr_busy is not None:
                    delta_busy_ms = curr_busy - prev_busy
                    busy_percent = max(0.0, min(100.0, (delta_busy_ms / (dt * 1000.0)) * 100.0))

                # Average latency = total time / operation count for the interval
                delta_read_time = disk.read_time - _previous_disk_sample["read_time"]
                delta_write_time = disk.write_time - _previous_disk_sample["write_time"]
                read_latency_ms = (
                    max(0.0, delta_read_time / delta_read_count)
                    if delta_read_count > 0
                    else 0.0
                )
                write_latency_ms = (
                    max(0.0, delta_write_time / delta_write_count)
                    if delta_write_count > 0
                    else 0.0
                )

        _previous_disk_sample = {
            "t": now,
            "read_bytes": disk.read_bytes,
            "write_bytes": disk.write_bytes,
            "read_count": disk.read_count,
            "write_count": disk.write_count,
            "read_time": disk.read_time,
            "write_time": disk.write_time,
            "busy_time": getattr(disk, "busy_time", None),
        }

        return {
            "read_bytes_per_sec": read_bytes_per_sec,
            "write_bytes_per_sec": write_bytes_per_sec,
            "read_iops": read_iops,
            "write_iops": write_iops,
            "busy_percent": busy_percent,
            "read_latency_ms": read_latency_ms,
            "write_latency_ms": write_latency_ms,
        }
    except Exception:
        return empty
