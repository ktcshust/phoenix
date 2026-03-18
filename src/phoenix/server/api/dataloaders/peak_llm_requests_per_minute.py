from collections import Counter, defaultdict
from datetime import timezone
from typing import Iterable, NamedTuple, Optional

from sqlalchemy import func, select
from strawberry.dataloader import DataLoader
from typing_extensions import TypeAlias

from phoenix.db import models
from phoenix.server.types import DbSessionFactory

ProjectRowId: TypeAlias = int
Key: TypeAlias = ProjectRowId

_TZ_HCM = timezone.utc  # Used only for fallback; actual UTC+7 conversion is done with timedelta.


class PeakMinuteResult(NamedTuple):
    count: int
    minute: Optional[str]  # "YYYY-MM-DDTHH:MM" in UTC+7, or None if no data


Result: TypeAlias = PeakMinuteResult


class PeakLlmRequestsPerMinuteDataLoader(DataLoader[Key, Result]):
    """Finds the peak LLM request count in any 1-minute window per project.

    Returns a (count, minute_label) pair. minute_label is a UTC+7 datetime string
    "YYYY-MM-DDTHH:MM". Python-side grouping is used for cross-database compatibility
    (works with both SQLite and PostgreSQL).
    """

    def __init__(self, db: DbSessionFactory) -> None:
        super().__init__(load_fn=self._load_fn)
        self._db = db

    async def _load_fn(self, keys: Iterable[Key]) -> list[Result]:
        from datetime import timedelta  # local import to avoid module-level state

        tz_hcm = timezone(timedelta(hours=7))
        unique_keys = list(set(keys))

        stmt = (
            select(models.Trace.project_rowid, models.Span.start_time)
            .join(models.Span)
            .where(func.upper(models.Span.span_kind) == "LLM")
            .where(models.Trace.project_rowid.in_(unique_keys))
        )

        async with self._db() as session:
            rows = await session.execute(stmt)
            all_rows = rows.all()

        by_project: dict[int, Counter[str]] = defaultdict(Counter)
        for project_id, start_time in all_rows:
            if start_time is None:
                continue
            if start_time.tzinfo is None:
                from datetime import timezone as tz_module

                start_time = start_time.replace(tzinfo=tz_module.utc)
            hcm_time = start_time.astimezone(tz_hcm)
            minute_key = hcm_time.strftime("%Y-%m-%dT%H:%M")
            by_project[project_id][minute_key] += 1

        results: list[Result] = []
        for key in keys:
            counter = by_project.get(key)
            if counter:
                peak_minute, peak_count = counter.most_common(1)[0]
                results.append(PeakMinuteResult(count=peak_count, minute=peak_minute))
            else:
                results.append(PeakMinuteResult(count=0, minute=None))
        return results
