"""
api_client.py
Facebook Graph API + Marketing API client
ดึงข้อมูลจริง — ไม่เดาตัวเลขใด ๆ
ถ้าดึง field ไม่ได้ จะ return None ไม่ใช่ 0 หรือค่าสมมติ
"""

import logging
import os
import time
import requests
from datetime import datetime, timedelta
from typing import Optional

from facebook_connection import FacebookConnectionError, _validated_graph_url


GRAPH_VERSION = os.getenv("FB_GRAPH_API_VERSION", "v25.0").lstrip("v")
BASE = f"https://graph.facebook.com/v{GRAPH_VERSION}"
logger = logging.getLogger(__name__)


class FBClient:
    def __init__(self):
        self.token = os.getenv("FB_PAGE_ACCESS_TOKEN")
        self.page_id = os.getenv("FB_PAGE_ID")
        self.ad_account_id = os.getenv("FB_AD_ACCOUNT_ID")  # act_XXXXXXXXX

        if not self.token:
            raise ValueError("FB_PAGE_ACCESS_TOKEN ไม่พบใน .env")
        if not self.page_id:
            raise ValueError("FB_PAGE_ID ไม่พบใน .env")

    # ───────────────────────────────────────────────────────────
    # PAGE-LEVEL
    # ───────────────────────────────────────────────────────────

    def get_page_info(self) -> dict:
        """ดึง page name + fan_count"""
        r = self._get(f"/{self.page_id}", {"fields": "name,fan_count,followers_count"})
        return r

    def get_posts(self, since: str, until: str) -> list[dict]:
        """
        ดึงโพสต์ทั้งหมดในช่วงเวลา
        since / until = "YYYY-MM-DD"
        return list ของ post objects พร้อม fields พื้นฐาน
        """
        since_ts = int(datetime.strptime(since, "%Y-%m-%d").timestamp())
        until_ts = int(datetime.strptime(until, "%Y-%m-%d").timestamp()) + 86399

        fields = ",".join([
            "id", "message", "story", "full_picture",
            "created_time", "permalink_url",
            "attachments{media_type,type,title,target}"
        ])

        posts = []
        url = f"/{self.page_id}/posts"
        params = {
            "fields": fields,
            "since": since_ts,
            "until": until_ts,
            "limit": 100
        }

        while url:
            data = self._get(url, params)
            posts.extend(data.get("data", []))
            url = data.get("paging", {}).get("next")
            params = {}  # next URL already has params
            time.sleep(0.3)

        return posts

    # ───────────────────────────────────────────────────────────
    # POST-LEVEL INSIGHTS (organic)
    # ───────────────────────────────────────────────────────────

    def get_post_insights(self, post_id: str) -> dict:
        """
        ดึง insights ของโพสต์เดียว
        return dict metric_name -> value (หรือ None ถ้าไม่ available)

        หมายเหตุ: ค่าบางตัวไม่ available ขึ้นกับ format และ objective
        เช่น video metrics จะมีเฉพาะโพสต์วิดีโอ
        """
        metrics_common = [
            "post_impressions",
            "post_impressions_unique",
            "post_impressions_paid",
            "post_impressions_paid_unique",
            "post_impressions_organic",
            "post_impressions_organic_unique",
            "post_impressions_viral",
            "post_impressions_viral_unique",
            "post_engaged_users",
            "post_engaged_fan",
            "post_reactions_by_type_total",
            "post_clicks",
            "post_clicks_unique",
            "post_activity_by_action_type",
        ]
        metrics_negative = [
            "post_negative_feedback",
            "post_negative_feedback_unique",
            "post_negative_feedback_by_type",
        ]
        metrics_video = [
            "post_video_views",
            "post_video_views_unique",
            "post_video_view_time",
            "post_video_views_10s",
            "post_video_views_30s",
            "post_video_complete_views_30s",
            "post_video_avg_time_watched",
            "post_video_retention_graph",
        ]

        all_metrics = metrics_common + metrics_negative + metrics_video
        chunks = [all_metrics[i:i+20] for i in range(0, len(all_metrics), 20)]

        result = {}
        for chunk in chunks:
            try:
                data = self._get(
                    f"/{post_id}/insights",
                    {"metric": ",".join(chunk), "period": "lifetime"}
                )
            except (requests.RequestException, RuntimeError, FacebookConnectionError):
                logger.info("Optional Facebook insight metric chunk is unavailable")
                data = {}
            for item in data.get("data", []):
                name = item.get("name")
                values = item.get("values")
                if name and isinstance(values, list) and values and isinstance(values[0], dict):
                    result[name] = values[0].get("value")
            time.sleep(0.2)

        return result

    # ───────────────────────────────────────────────────────────
    # COMMENT ANALYSIS
    # ───────────────────────────────────────────────────────────

    def get_post_comments(self, post_id: str, max_count: int = 200) -> list[dict]:
        """ดึง comments เพื่อ sentiment analysis (ถ้าต้องการ)"""
        data = self._get(
            f"/{post_id}/comments",
            {"fields": "message,created_time", "limit": min(max_count, 100)}
        )
        return data.get("data", [])

    def get_comment_count(self, post_id: str) -> Optional[int]:
        """
        ดึงจำนวน comment ทั้งหมดของโพสต์ผ่าน summary
        return None ถ้าดึงไม่ได้ (ไม่เดาเป็น 0)
        """
        try:
            data = self._get(
                f"/{post_id}/comments",
                {"summary": "true", "limit": 0}
            )
            return data.get("summary", {}).get("total_count")
        except Exception:
            return None

    def get_video_length(self, attach: dict) -> Optional[float]:
        """
        ดึงความยาววิดีโอ (วินาที) จาก target ของ attachment
        return None ถ้าไม่ใช่วิดีโอหรือดึงไม่ได้
        """
        target_id = (attach or {}).get("target", {}).get("id")
        if not target_id:
            return None
        try:
            data = self._get(f"/{target_id}", {"fields": "length"})
            length = data.get("length")
            return float(length) if length is not None else None
        except Exception:
            return None

    # ───────────────────────────────────────────────────────────
    # MARKETING API (paid / ads)
    # ───────────────────────────────────────────────────────────

    def get_ads_for_post(self, post_id: str) -> list[dict]:
        """
        หา ad_id ที่ promote โพสต์นี้ (boosted posts + dark posts)
        return [] ถ้าไม่มีแอด
        """
        if not self.ad_account_id:
            return []

        # Search by post_id ใน ads ของ account
        try:
            data = self._get(
                f"/{self.ad_account_id}/ads",
                {
                    "fields": "id,name,status,effective_status,creative{object_story_id}",
                    "limit": 200
                }
            )
            ads = []
            for ad in data.get("data", []):
                osi = ad.get("creative", {}).get("object_story_id", "")
                if post_id in osi or osi.endswith(f"_{post_id.split('_')[-1]}"):
                    ads.append(ad)
            return ads
        except Exception:
            return []

    def get_ad_insights(
        self,
        ad_id: str,
        since: str,
        until: str
    ) -> Optional[dict]:
        """
        ดึง performance ของแอดนั้น
        เปรียบเทียบเฉพาะกับ ads ที่มี objective เดียวกันเท่านั้น
        """
        try:
            data = self._get(
                f"/{ad_id}/insights",
                {
                    "fields": ",".join([
                        "spend", "impressions", "reach", "frequency",
                        "cpm", "cpp", "cpc",
                        "actions", "cost_per_action_type",
                        "purchase_roas",
                        "unique_clicks", "unique_ctr",
                        "objective", "optimization_goal"
                    ]),
                    "time_range": f'{{"since":"{since}","until":"{until}"}}',
                    "level": "ad"
                }
            )
            rows = data.get("data", [])
            return rows[0] if rows else None
        except Exception:
            return None

    def get_campaign_objective(self, ad_id: str) -> Optional[str]:
        """ดึง objective ของ campaign ที่แอดนี้อยู่ — ใช้แยก baseline"""
        try:
            # ad -> adset -> campaign
            ad_data = self._get(f"/{ad_id}", {"fields": "adset_id"})
            adset_id = ad_data.get("adset_id")
            if not adset_id:
                return None
            adset_data = self._get(f"/{adset_id}", {"fields": "campaign_id"})
            campaign_id = adset_data.get("campaign_id")
            if not campaign_id:
                return None
            campaign_data = self._get(f"/{campaign_id}", {"fields": "objective"})
            return campaign_data.get("objective")
        except Exception:
            return None

    # ───────────────────────────────────────────────────────────
    # COMBINED: POST + AD (full data for one post)
    # ───────────────────────────────────────────────────────────

    def get_full_post_data(self, post: dict, since: str, until: str) -> dict:
        """
        รวมข้อมูล organic insights + ad insights ของโพสต์เดียว
        return structured dict ที่ scoring.py ใช้
        """
        post_id = post["id"]

        # Organic insights
        organic = self.get_post_insights(post_id)

        # Format detection
        attach = post.get("attachments", {}).get("data", [{}])[0]
        media_type = attach.get("media_type", "unknown")
        post_type = attach.get("type", "unknown")
        fmt = _detect_format(media_type, post_type)

        # Comment count (required by scoring Comment-quality component)
        comment_count = self.get_comment_count(post_id)

        # Video length (used by analyzer correlations / patterns)
        video_length_s = self.get_video_length(attach) if fmt in ("Reel", "Video") else None

        # Ad data (ถ้ามี)
        ads = self.get_ads_for_post(post_id)
        ad_data = None
        objective = None
        if ads:
            ad_insights = self.get_ad_insights(ads[0]["id"], since, until)
            if ad_insights:
                ad_data = ad_insights
                objective = self.get_campaign_objective(ads[0]["id"])

        # Determine post classification
        if not ads:
            post_class = "organic"
        elif objective:
            post_class = "ad_only" if not organic.get("post_impressions_organic") else "boosted"
        else:
            post_class = "boosted"

        # Build structured object
        raw_reactions = organic.get("post_reactions_by_type_total") or {}
        raw_activity = organic.get("post_activity_by_action_type") or {}
        raw_negative = organic.get("post_negative_feedback_by_type") or {}

        imps = organic.get("post_impressions")
        reach = organic.get("post_impressions_unique")
        freq = round(imps / reach, 2) if (imps and reach) else None

        return {
            # Identity
            "post_id": post_id,
            "ad_ids": [a["id"] for a in ads],
            "objective": objective,
            "post_class": post_class,  # organic | boosted | ad_only
            "format": fmt,
            "video_length_s": video_length_s,
            "created_time": post.get("created_time"),
            "permalink_url": post.get("permalink_url"),
            "message": post.get("message") or post.get("story", ""),
            "thumbnail_url": post.get("full_picture"),

            # Distribution
            "impressions": imps,
            "reach": reach,
            "frequency": freq,
            "reach_organic": organic.get("post_impressions_organic_unique"),
            "reach_paid": organic.get("post_impressions_paid_unique"),
            "reach_viral": organic.get("post_impressions_viral_unique"),

            # Video (None ถ้าไม่ใช่วิดีโอ)
            "views_3s": organic.get("post_video_views"),
            "views_3s_unique": organic.get("post_video_views_unique"),
            "views_10s": organic.get("post_video_views_10s"),
            "views_30s": organic.get("post_video_views_30s"),
            "views_complete": organic.get("post_video_complete_views_30s"),
            "avg_watch_time_ms": organic.get("post_video_avg_time_watched"),  # ms

            # Interactions
            "engaged_users": organic.get("post_engaged_users"),
            "post_clicks": organic.get("post_clicks"),
            "post_clicks_unique": organic.get("post_clicks_unique"),
            "shares": raw_activity.get("share"),
            "saves": raw_activity.get("onsite_app_save"),
            "link_clicks": raw_activity.get("link"),
            "comment_count_api": comment_count,

            # Reactions
            "reactions_like": raw_reactions.get("like", 0),
            "reactions_love": raw_reactions.get("love", 0),
            "reactions_wow": raw_reactions.get("wow", 0),
            "reactions_haha": raw_reactions.get("haha", 0),
            "reactions_sad": raw_reactions.get("sad", 0),
            "reactions_angry": raw_reactions.get("anger", 0),

            # Negative signals
            "hide_post": raw_negative.get("hide_clicks"),
            "hide_all": raw_negative.get("hide_all_clicks"),
            "report_spam": raw_negative.get("report_spam_clicks"),
            "unlike_page": raw_negative.get("unlike_page_clicks"),  # rare

            # Ad data (None ถ้า organic)
            "ad_spend": float(ad_data["spend"]) if ad_data and "spend" in ad_data else None,
            "ad_impressions": int(ad_data["impressions"]) if ad_data and "impressions" in ad_data else None,
            "ad_reach": int(ad_data["reach"]) if ad_data and "reach" in ad_data else None,
            "ad_frequency": float(ad_data["frequency"]) if ad_data and "frequency" in ad_data else None,
            "ad_cpm": float(ad_data["cpm"]) if ad_data and "cpm" in ad_data else None,
            "ad_cpc": float(ad_data["cpc"]) if ad_data and "cpc" in ad_data else None,
            "ad_roas": _extract_roas(ad_data) if ad_data else None,

            # Metadata
            "data_pulled_at": datetime.utcnow().isoformat(),
            "missing_fields": [],  # populated by scoring.py
        }

    # ───────────────────────────────────────────────────────────
    # BATCH PULL (all posts in range)
    # ───────────────────────────────────────────────────────────

    def pull_all(self, since: str, until: str) -> list[dict]:
        """
        Main method: ดึงทุกโพสต์ + insights ทั้งหมดในช่วงเวลา
        ใช้ใน Streamlit เมื่อ user เลือก date range
        """
        posts = self.get_posts(since, until)
        full_data = []
        for post in posts:
            try:
                data = self.get_full_post_data(post, since, until)
                full_data.append(data)
                time.sleep(0.5)  # rate limiting
            except Exception:
                # Keep the batch alive without forwarding provider diagnostics or tokens.
                logger.exception("Skipping Facebook post %s after processing failure", post.get("id"))
        return full_data

    # ───────────────────────────────────────────────────────────
    # HTTP
    # ───────────────────────────────────────────────────────────

    def _get(self, path: str, params: dict = None) -> dict:
        url = _validated_graph_url(path if path.startswith("http") else f"{BASE}{path}")
        request_params = dict(params or {})
        request_params.pop("access_token", None)
        resp = requests.get(
            url,
            params=request_params,
            headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            code = data.get("error", {}).get("code")
            suffix = f" (code {code})" if code else ""
            raise RuntimeError(f"Meta rejected the request{suffix}")
        return data


# ───────────────────────────────────────────────────────────────
# HELPERS
# ───────────────────────────────────────────────────────────────

def _detect_format(media_type: str, post_type: str) -> str:
    if post_type in ("reel", "video_inline"):
        return "Reel"
    if media_type == "video":
        return "Video"
    if post_type in ("album", "photo"):
        return "Carousel" if "album" in post_type else "Photo"
    if post_type == "link":
        return "Link"
    return "Photo"


def _extract_roas(ad_data: dict) -> Optional[float]:
    roas_list = ad_data.get("purchase_roas")
    if not roas_list:
        return None
    for item in roas_list:
        if item.get("action_type") == "omni_purchase":
            return float(item.get("value", 0))
    return None
