from typing import Optional

import strawberry


@strawberry.type
class PeakLlmRequestsInfo:
    count: int
    minute: Optional[str]  # "YYYY-MM-DDTHH:MM" in UTC+7, or None if no data
