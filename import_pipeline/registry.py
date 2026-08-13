"""Canonical dimensions and metrics accepted by the reporting pipeline."""

from dataclasses import dataclass
from enum import Enum


class FieldRole(str, Enum):
    DIMENSION = "dimension"
    METRIC = "metric"


class DataType(str, Enum):
    STRING = "string"
    DATE = "date"
    INTEGER = "integer"
    DECIMAL = "decimal"
    PERCENTAGE = "percentage"
    CURRENCY = "currency"
    URL = "url"


class Aggregation(str, Enum):
    SUM = "sum"
    AVERAGE = "average"
    MAX = "max"
    MIN = "min"
    LATEST = "latest"
    NON_AGGREGATABLE = "non_aggregatable"


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    role: FieldRole
    data_type: DataType
    aggregation: Aggregation | None = None
    unit: str | None = None
    required_for_import: bool = False


DIMENSIONS = {
    spec.key: spec
    for spec in [
        FieldSpec("date", "Date", FieldRole.DIMENSION, DataType.DATE, required_for_import=True),
        FieldSpec("source_account_id", "Source account ID", FieldRole.DIMENSION, DataType.STRING, required_for_import=True),
        FieldSpec("source_account_name", "Source account name", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("campaign_id", "Campaign ID", FieldRole.DIMENSION, DataType.STRING, required_for_import=True),
        FieldSpec("campaign_name", "Campaign name", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("adset_id", "Ad set ID", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("adset_name", "Ad set name", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("ad_id", "Ad ID", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("ad_name", "Ad name", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("post_id", "Post ID", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("creative_id", "Creative ID", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("content_name", "Content name", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("brand_id", "Brand ID", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("objective", "Objective", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("placement", "Placement", FieldRole.DIMENSION, DataType.STRING),
        FieldSpec("media_url", "Media URL", FieldRole.DIMENSION, DataType.URL),
    ]
}


METRICS = {
    spec.key: spec
    for spec in [
        FieldSpec("spend", "Spend", FieldRole.METRIC, DataType.CURRENCY, Aggregation.SUM, "currency"),
        FieldSpec("impressions", "Impressions", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("reach", "Reach", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "people"),
        FieldSpec("frequency", "Frequency", FieldRole.METRIC, DataType.DECIMAL, Aggregation.AVERAGE, "ratio"),
        FieldSpec("clicks", "Clicks", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("link_clicks", "Link clicks", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("engagement", "Engagement", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("reactions", "Reactions", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("comments", "Comments", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("shares", "Shares", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("saves", "Saves", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("video_views_3s", "3-second video views", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("video_views_15s", "15-second video views", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("video_completions", "Video completions", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("leads", "Leads", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("conversions", "Conversions", FieldRole.METRIC, DataType.INTEGER, Aggregation.SUM, "count"),
        FieldSpec("revenue", "Revenue", FieldRole.METRIC, DataType.CURRENCY, Aggregation.SUM, "currency"),
        FieldSpec("cpm", "CPM", FieldRole.METRIC, DataType.CURRENCY, Aggregation.NON_AGGREGATABLE, "currency"),
        FieldSpec("cpc", "CPC", FieldRole.METRIC, DataType.CURRENCY, Aggregation.NON_AGGREGATABLE, "currency"),
        FieldSpec("cpe", "CPE", FieldRole.METRIC, DataType.CURRENCY, Aggregation.NON_AGGREGATABLE, "currency"),
        FieldSpec("ctr", "CTR", FieldRole.METRIC, DataType.PERCENTAGE, Aggregation.NON_AGGREGATABLE, "percent"),
        FieldSpec("roas", "ROAS", FieldRole.METRIC, DataType.DECIMAL, Aggregation.NON_AGGREGATABLE, "ratio"),
    ]
}


FIELDS = {**DIMENSIONS, **METRICS}
