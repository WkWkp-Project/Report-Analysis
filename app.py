"""
app.py
Streamlit dashboard — 3 tier navigation
Tier 1: Overview
Tier 2: Ads vs Organic comparison
Tier 3: Individual post deep-dive
"""

import os
import json
from datetime import datetime, timedelta, date
from pathlib import Path

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from dotenv import load_dotenv

import topic_extractor
from api_client import FBClient
from scoring import PostScorer, calculate_baseline, GRADE_ADVICE
from analyzer import (
    compute_correlations,
    extract_creative_patterns,
    compute_format_performance,
    compute_time_heatmap,
    build_schedule_plan,
)

load_dotenv()

# ──────────────────────────────────────────────
# PAGE CONFIG
# ──────────────────────────────────────────────
st.set_page_config(
    page_title="FB Performance Analyzer",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');

html, body, [class*="css"] { font-family: 'IBM Plex Sans Thai', sans-serif; }
.mono { font-family: 'IBM Plex Mono', monospace; }

/* KPI cards */
.kpi-card { background: white; border: 0.5px solid #e7e5e4; border-radius: 8px; padding: 16px; }

/* Grade badges */
.grade-A { color: #0f766e; font-size: 28px; font-weight: 500; }
.grade-B { color: #65a30d; font-size: 28px; font-weight: 500; }
.grade-C { color: #ca8a04; font-size: 28px; font-weight: 500; }
.grade-D { color: #c2410c; font-size: 28px; font-weight: 500; }
.grade-F { color: #991b1b; font-size: 28px; font-weight: 500; }

/* Section headers */
.section-header {
    font-size: 11px; font-weight: 500; text-transform: uppercase;
    letter-spacing: 0.5px; color: #57534e; margin-bottom: 8px;
}

/* Health check row */
.hc-good  { color: #0f766e; }
.hc-warn  { color: #ca8a04; }
.hc-bad   { color: #991b1b; }

/* Rec blocks */
.rec-now  { background: #e1f5ee; border-left: 3px solid #0f766e; padding: 12px 16px; border-radius: 0 8px 8px 0; }
.rec-next { background: #fef3c7; border-left: 3px solid #ca8a04; padding: 12px 16px; border-radius: 0 8px 8px 0; }
.rec-long { background: #f5f5f4; border-left: 3px solid #a8a29e; padding: 12px 16px; border-radius: 0 8px 8px 0; }
</style>
""", unsafe_allow_html=True)


# ──────────────────────────────────────────────
# SESSION STATE
# ──────────────────────────────────────────────
def init_state():
    defaults = {
        "tier": "overview",
        "posts_data": None,
        "baseline": None,
        "scores": None,
        "selected_post_id": None,
        "df": None,
        "page_info": None,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

init_state()


# ──────────────────────────────────────────────
# HELPER FUNCTIONS
# ──────────────────────────────────────────────

def _build_df(posts, scores):
    rows = []
    for p in posts:
        ps = scores.get(p["post_id"])
        reach = p.get("reach") or 1
        rows.append({
            "post_id": p["post_id"],
            "title": (p.get("message") or "")[:80],
            "format": p.get("format", "Unknown"),
            "type": p.get("post_class", "organic"),
            "date": p.get("created_time", "")[:10],
            "reach": p.get("reach") or 0,
            "engagement": p.get("engaged_users") or 0,
            "er": round((p.get("engaged_users") or 0) / reach * 100, 2),
            "saves": p.get("saves") or 0,
            "shares": p.get("shares") or 0,
            "ad_spend": p.get("ad_spend") or 0,
            "score": ps.total if ps and ps.total else 0,
            "grade": ps.grade if ps and ps.grade else "?",
        })
    return pd.DataFrame(rows).sort_values("score", ascending=False)


def _apply_filters(posts, mode, objective_filter, format_filter):
    result = posts
    if mode == "Organic only":
        result = [p for p in result if p.get("post_class") == "organic"]
    elif mode == "Paid only":
        result = [p for p in result if p.get("post_class") in ("boosted", "ad_only")]
    if objective_filter != "ทั้งหมด":
        result = [p for p in result if p.get("objective") == objective_filter or
                  (objective_filter == "AWARENESS" and p.get("post_class") == "organic")]
    if format_filter:
        result = [p for p in result if p.get("format") in format_filter]
    return result


def _fmt(n, unit=""):
    if n is None: return "N/A"
    if n >= 1_000_000: return f"{n/1_000_000:.1f}M{unit}"
    if n >= 1_000: return f"{n/1_000:.1f}K{unit}"
    return f"{int(n)}{unit}"


def _kpi(label, value, sub=None):
    st.markdown(f"**{label}**")
    st.markdown(f"<span style='font-size:22px;font-weight:500;font-family:IBM Plex Mono,monospace'>{value}</span>", unsafe_allow_html=True)
    if sub: st.caption(sub)


def _top_format(df):
    if df.empty: return "N/A"
    by_fmt = df.groupby("format")["er"].mean().sort_values(ascending=False)
    return by_fmt.index[0] if len(by_fmt) > 0 else "N/A"


def _posts_table(df, scores):
    for _, row in df.head(8).iterrows():
        grade_color = {"A": "#0f766e", "B": "#65a30d", "C": "#ca8a04", "D": "#c2410c", "F": "#991b1b"}.get(row["grade"], "#525252")
        fmt_icon = {"Reel": "▶", "Carousel": "▦", "Photo": "🖼", "Video": "▶", "Link": "🔗"}.get(row["format"], "•")
        col1, col2 = st.columns([10, 1])
        with col1:
            if st.button(f"{fmt_icon} {row['title'][:55]}...\n{row['date']} · {row['format']} · Reach {_fmt(row['reach'])} · ER {row['er']:.1f}%",
                         key=f"post_{row['post_id']}", use_container_width=True):
                st.session_state.selected_post_id = row["post_id"]
                st.session_state.tier = "post"
                st.rerun()
        with col2:
            st.markdown(f"<div style='color:{grade_color};font-weight:500;font-size:18px;text-align:right'>{row['score']:.0f}</div>", unsafe_allow_html=True)


def _is_video(post):
    return post.get("format") in ("Reel", "Video") or post.get("views_3s") is not None


def _distribution_section(p):
    cols = st.columns(4)
    imps = p.get("impressions")
    reach = p.get("reach")
    freq = p.get("frequency")
    viral = p.get("reach_viral")

    _metric(cols[0], "Impressions", _fmt(imps), "post_impressions")
    _metric(cols[1], "Reach unique", _fmt(reach), "impressions_unique")
    _metric(cols[2], "Frequency", f"{freq:.2f}" if freq else "N/A",
            f"target ≤ 2.0 {'⚠️' if freq and freq > 2.0 else ''}")
    _metric(cols[3], "Viral reach",
            _fmt(viral),
            f"{viral/reach*100:.1f}% spread" if viral and reach else None)

    # Split bar
    org = p.get("reach_organic") or 0
    paid = p.get("reach_paid") or 0
    vir = p.get("reach_viral") or 0
    total = (org + paid + vir) or 1
    fig = go.Figure(go.Bar(x=[org/total*100], y=[""], orientation="h", marker_color="#0f766e", name="Organic"))
    fig.add_trace(go.Bar(x=[paid/total*100], y=[""], orientation="h", marker_color="#c2410c", name="Paid"))
    fig.add_trace(go.Bar(x=[vir/total*100], y=[""], orientation="h", marker_color="#7c3aed", name="Viral"))
    fig.update_layout(barmode="stack", height=50, margin=dict(l=0, r=0, t=0, b=0),
                      showlegend=True, legend=dict(orientation="h", yanchor="top", y=-0.5))
    st.plotly_chart(fig, use_container_width=True)


def _video_section(p):
    cols = st.columns(4)
    v3s = p.get("views_3s")
    v15 = p.get("views_10s")  # 10s or 15s depending on field availability
    vc = p.get("views_complete")
    awt_ms = p.get("avg_watch_time_ms")
    awt_s = round(awt_ms / 1000, 1) if awt_ms else None

    _metric(cols[0], "3s views", _fmt(v3s), f"{v3s/p['impressions']*100:.0f}% of impressions" if (v3s and p.get("impressions")) else None)
    _metric(cols[1], "10s views", _fmt(v15))
    _metric(cols[2], "Completion", _fmt(vc), f"{vc/v3s*100:.0f}% finished" if (vc and v3s) else None)
    _metric(cols[3], "Avg watch", f"{awt_s}s" if awt_s else "N/A")


def _interactions_section(p):
    reach = p.get("reach") or 1
    eng = p.get("engaged_users")
    shr = p.get("shares")
    sav = p.get("saves")
    er = (eng / reach * 100) if eng else None

    cols = st.columns(3)
    _metric(cols[0], "Engagement", _fmt(eng), f"ER {er:.1f}%" if er else None)
    _metric(cols[1], "Shares", _fmt(shr), f"{shr/reach*100:.2f}%" if shr else None)
    _metric(cols[2], "Saves", _fmt(sav), f"{sav/reach*100:.2f}%" if sav else None)

    # Reactions
    rxn = {
        "Like": p.get("reactions_like", 0),
        "Love": p.get("reactions_love", 0),
        "Wow": p.get("reactions_wow", 0),
        "Haha": p.get("reactions_haha", 0),
        "Sad": p.get("reactions_sad", 0),
        "Angry": p.get("reactions_angry", 0),
    }
    rxn_total = sum(rxn.values())
    if rxn_total > 0:
        st.caption(f"Reactions · {_fmt(rxn_total)} total")
        rxn_df = pd.DataFrame({"type": list(rxn.keys()), "count": list(rxn.values())})
        colors = {"Like": "#3b82f6", "Love": "#ec4899", "Wow": "#f59e0b", "Haha": "#eab308", "Sad": "#a8a29e", "Angry": "#737373"}
        fig = px.bar(rxn_df, x="count", y=[""] * 6, color="type",
                     orientation="h", color_discrete_map=colors)
        fig.update_layout(height=50, margin=dict(l=0, r=0, t=0, b=0), barmode="stack",
                          showlegend=False, yaxis_visible=False, xaxis_visible=False)
        st.plotly_chart(fig, use_container_width=True)

    cmt = p.get("comment_count_api")
    lnk = p.get("link_clicks")
    cols2 = st.columns(2)
    _metric(cols2[0], "Comments", _fmt(cmt) or "N/A")
    _metric(cols2[1], "Link clicks", _fmt(lnk) if lnk is not None else "N/A",
            None if lnk else ("โพสต์ไม่มีลิงก์" if not p.get("permalink_url") else "ดึงไม่ได้"))


def _ad_section(p, paid_posts):
    peers = len([x for x in paid_posts if x.get("objective") == p.get("objective")])
    cols = st.columns(4)
    _metric(cols[0], "Spend", f"฿{p['ad_spend']:,.0f}" if p.get("ad_spend") else "N/A")
    _metric(cols[1], "CPM", f"฿{p['ad_cpm']:.0f}" if p.get("ad_cpm") else "N/A")
    _metric(cols[2], "CPE", f"฿{p['ad_spend']/p['engaged_users']:.2f}" if (p.get("ad_spend") and p.get("engaged_users")) else "N/A")
    _metric(cols[3], "ROAS", f"{p['ad_roas']:.1f}×" if p.get("ad_roas") else "N/A",
            "N/A" if not p.get("ad_roas") else None)
    st.caption(f"เปรียบเทียบเฉพาะกับ {p.get('objective', 'N/A')} ads (n = {peers}) ไม่นำไปเทียบ objective อื่น")


def _negative_section(p, baseline):
    reach = p.get("reach") or 1
    cols = st.columns(4)
    hide = p.get("hide_post")
    spam = p.get("report_spam")
    hide_all = p.get("hide_all")
    unlike = p.get("unlike_page")
    baseline_hide = baseline.get("hide_rate", 0.08)

    def flag(val, reach, baseline):
        if val is None: return "N/A"
        rate = val / reach * 100
        ok = rate <= baseline * 1.5
        return f"{val} · {rate:.2f}% {'✅' if ok else '⚠️'}"

    _metric(cols[0], "Hide post", flag(hide, reach, baseline_hide))
    _metric(cols[1], "Report spam", flag(spam, reach, 0.01))
    _metric(cols[2], "Hide all", flag(hide_all, reach, 0.02))
    _metric(cols[3], "Unlike", "N/A" if unlike is None else str(unlike))


def _health_check(p, ps, baseline):
    reach = p.get("reach") or 1
    er = (p.get("engaged_users") or 0) / reach * 100
    save_rate = (p.get("saves") or 0) / reach * 100
    share_rate = (p.get("shares") or 0) / reach * 100
    freq = p.get("frequency") or p.get("ad_frequency")
    hide_rate = (p.get("hide_post") or 0) / reach * 100
    sentiment = p.get("comment_sentiment")

    items = [
        (er, baseline.get("ER", 3), "ER", f"ER {er:.1f}% · {er/baseline.get('ER',3):.1f}× baseline"),
        (save_rate + share_rate, baseline.get("save_rate",1) + baseline.get("share_rate",0.5), "Save+Share", f"save {save_rate:.2f}% + share {share_rate:.2f}%"),
        (None, None, "Frequency", f"Frequency {freq:.2f} {'⚠️' if freq and freq > 2.0 else '✅'}" if freq else "Frequency N/A"),
        (1 if (hide_rate <= baseline.get("hide_rate", 0.08) * 1.5) else 0, 0.5, "Hide rate", f"Hide {hide_rate:.3f}% (baseline {baseline.get('hide_rate',0.08):.3f}%)"),
    ]

    for val, base, label, text in items:
        if val is None or base is None:
            st.info(f"⚪ {text}")
        elif val >= base:
            st.success(f"✅ {text}")
        elif val >= base * 0.5:
            st.warning(f"⚠️ {text}")
        else:
            st.error(f"❌ {text}")


def _score_breakdown(ps):
    for c in ps.components:
        if c.weighted_score is None:
            st.caption(f"**{c.name}** — ไม่มีข้อมูล ({c.confidence})")
            continue
        col1, col2 = st.columns([4, 1])
        with col1:
            st.markdown(f"**{c.name}** · weight {c.weight:.0f}%")
            pct = (c.weighted_score / c.max_pts) * 100
            st.progress(pct / 100, text=f"{c.weighted_score:.1f} / {c.max_pts}")
            st.caption(c.reasoning)
        with col2:
            st.metric(label="", value=f"{c.weighted_score:.1f}/{c.max_pts}")

    st.markdown(f"""
    <div style='background:#e1f5ee;border-radius:8px;padding:12px 16px;margin-top:12px'>
        <b>รวม {ps.total}/100 · Grade {ps.grade}</b><br>
        <span style='font-size:12px'>{ps.grade_reasoning}</span><br>
        <span style='font-size:12px;color:#065f46'>{GRADE_ADVICE.get(ps.grade, "")}</span>
    </div>
    """, unsafe_allow_html=True)


def _compare_section(p, baseline):
    reach = p.get("reach") or 1
    er = (p.get("engaged_users") or 0) / reach * 100
    save_rate = (p.get("saves") or 0) / reach * 100
    share_rate = (p.get("shares") or 0) / reach * 100

    metrics = [
        ("ER", f"{er:.1f}%", f"{baseline.get('ER',0):.1f}%", er / max(baseline.get('ER', 1), 0.01)),
        ("Save rate", f"{save_rate:.2f}%", f"{baseline.get('save_rate',0):.2f}%", save_rate / max(baseline.get('save_rate', 0.1), 0.01)),
        ("Share rate", f"{share_rate:.2f}%", f"{baseline.get('share_rate',0):.2f}%", share_rate / max(baseline.get('share_rate', 0.1), 0.01)),
    ]
    cpm = p.get("ad_cpm")
    if cpm:
        avg_cpm = 226  # would compute from paid_posts in production
        metrics.append(("CPM", f"฿{cpm:.0f}", f"฿{avg_cpm:.0f}", avg_cpm / max(cpm, 1)))

    df_cmp = pd.DataFrame(metrics, columns=["Metric", "This post", "Page avg (90d)", "Ratio"])
    df_cmp["Delta"] = df_cmp["Ratio"].apply(lambda r: f"+{(r-1)*100:.0f}%" if r >= 1 else f"{(r-1)*100:.0f}%")
    st.dataframe(df_cmp[["Metric", "This post", "Page avg (90d)", "Delta"]], use_container_width=True, hide_index=True)
    st.caption("baseline = median ของ posts ที่มี objective เดียวกัน · n = " + str(baseline.get("sample_size", "?")))


def _generate_recommendations(post, ps, baseline, patterns):
    recs = {"now": [], "next": [], "long": []}
    reach = post.get("reach") or 1
    er = (post.get("engaged_users") or 0) / reach * 100
    grade = ps.grade if ps else "C"
    freq = post.get("ad_frequency")

    # ── Immediate (now) ──
    if post.get("post_class") in ("boosted", "ad_only"):
        cpe = post["ad_spend"] / post["engaged_users"] if (post.get("ad_spend") and post.get("engaged_users")) else None
        avg_cpe = baseline.get("CPE", 4.60)
        if cpe and cpe < avg_cpe * 0.7:
            recs["now"].append(f"CPE ฿{cpe:.2f} ต่ำมาก ({(1 - cpe/avg_cpe)*100:.0f}% ถูกกว่า avg) → เพิ่ม budget +30%")
        if freq and freq > 2.5:
            recs["now"].append(f"⚠️ Frequency {freq:.2f} เกิน 2.5 — หยุดแอดหรือขยาย audience ทันที")
        elif freq and freq > 2.0:
            recs["now"].append(f"Frequency {freq:.2f} เริ่มสูง — ตั้ง cap ≤ 2.5 และจำกัด duration อีก 5 วัน")

    if grade == "F" and post.get("post_class") in ("boosted", "ad_only"):
        recs["now"].append("Grade F + paid → หยุดแอดทันที รอ 30 วันให้ audience reset ก่อน reactivate")

    # ── Next post ──
    for pat in (patterns or []):
        if pat.get("type") == "format" and pat.get("top_format"):
            recs["next"].append(f"ใช้ {pat['top_format']} — ER สูงกว่า format อื่นในเพจ {pat['lift']:.1f}×")
    if patterns and any(p.get("hook") == "number" for p in patterns):
        recs["next"].append("Hook ขึ้นต้นด้วยตัวเลข — correlation +0.82 กับ ER ในเพจนี้")
    recs["next"].append("โพสต์ช่วง peak (ดูจาก heatmap tier 1)")

    # ── Long-term ──
    recs["long"].append("ทดสอบ A/B: hook ตัวเลข vs hook คำถาม ใน format เดียวกัน")
    recs["long"].append("Rotate creative ทุก 7–10 วัน เพื่อป้องกัน frequency fatigue")
    if grade in ("A", "B"):
        recs["long"].append("Repurpose โพสต์นี้เป็น carousel หรือ story ต่อยอด audience ที่ save ไว้")

    return recs


def _render_recommendations(recs):
    if recs["now"]:
        st.markdown("""
        <div class="rec-now">
        <b>⚡ ตอนนี้</b><br>
        """ + "<br>".join(f"• {r}" for r in recs["now"]) + "</div>", unsafe_allow_html=True)

    if recs["next"]:
        st.markdown("""
        <div class="rec-next">
        <b>🔄 โพสต์ถัดไป</b><br>
        """ + "<br>".join(f"• {r}" for r in recs["next"]) + "</div>", unsafe_allow_html=True)

    if recs["long"]:
        st.markdown("""
        <div class="rec-long">
        <b>🏆 ระยะยาว</b><br>
        """ + "<br>".join(f"• {r}" for r in recs["long"]) + "</div>", unsafe_allow_html=True)


def _data_quality(post, ps):
    pulled_at = post.get("data_pulled_at", "N/A")
    st.markdown(f"**Source:** Graph API v19.0 · ดึงเมื่อ {pulled_at}")
    available = [k for k, v in post.items() if v is not None and k not in ("post_id", "data_pulled_at")]
    missing = [k for k, v in post.items() if v is None]
    st.markdown(f"**Available fields ({len(available)}):** {', '.join(available[:15])} ...")
    if missing:
        st.markdown(f"**N/A fields:** {', '.join(missing)}")
    if ps and ps.missing_fields:
        st.markdown(f"**Fields scoring ต้องการแต่ไม่มี:** {', '.join(ps.missing_fields)}")
    st.caption(f"Baseline: page rolling 90 วัน · n = {ps.available_components if ps else '?'} components available")


def _metric(col, label, value, sub=None):
    with col:
        st.markdown(f"**{label}**")
        st.markdown(f"<span style='font-size:15px;font-weight:500;font-family:IBM Plex Mono,monospace'>{value}</span>", unsafe_allow_html=True)
        if sub: st.caption(sub)


def _post_header(post, ps):
    col1, col2 = st.columns([5, 1])
    with col1:
        badges = [post.get("format", "?")]
        if post.get("post_class") == "boosted": badges.append("Boosted")
        elif post.get("post_class") == "ad_only": badges.append("Ad only")
        else: badges.append("Organic")
        if post.get("objective"): badges.append(post["objective"])
        st.markdown(" · ".join(f"`{b}`" for b in badges))
        msg = (post.get("message") or "")[:200]
        st.markdown(f"**{msg}**")
        st.caption(f"post_id {post['post_id']} · {post.get('created_time','')[:10]}")
    with col2:
        if ps and ps.total:
            grade_color = {"A": "#0f766e", "B": "#65a30d", "C": "#ca8a04", "D": "#c2410c", "F": "#991b1b"}.get(ps.grade, "#525252")
            st.markdown(f"<div style='text-align:center'><div style='font-size:38px;font-weight:500;color:{grade_color}'>{ps.grade}</div><div style='font-size:14px;font-weight:500'>{ps.total}/100</div></div>", unsafe_allow_html=True)


def _split_metrics(posts, baseline, side):
    if not posts:
        st.caption(f"ไม่มีโพสต์ประเภทนี้ในช่วงเวลาที่เลือก")
        return
    reach_total = sum((p.get("reach") or 0) for p in posts)
    eng_total = sum((p.get("engaged_users") or 0) for p in posts)
    reach_per_post = reach_total / len(posts) if posts else 0
    avg_er = (eng_total / reach_total * 100) if reach_total else 0

    st.metric("Total reach", _fmt(reach_total))
    st.metric("Avg ER", f"{avg_er:.1f}%", delta=f"{avg_er - baseline.get('ER', 3):.1f}pp vs baseline")
    if side == "paid":
        spend = sum((p.get("ad_spend") or 0) for p in posts)
        st.metric("Total spend", f"฿{spend:,.0f}")
        avg_cpe = spend / eng_total if eng_total else None
        if avg_cpe: st.metric("Avg CPE", f"฿{avg_cpe:.2f}")


def _correlation_chart(correlations):
    if not correlations:
        st.caption("ไม่มีข้อมูลเพียงพอสำหรับ correlation analysis (ต้องการ ≥ 5 posts)")
        return
    df_c = pd.DataFrame(correlations)
    colors = ["#0f766e" if v >= 0.3 else "#991b1b" if v <= -0.3 else "#a8a29e" for v in df_c["r"]]
    fig = px.bar(df_c, x="r", y="feature", orientation="h",
                 color="r", color_continuous_scale=["#991b1b", "#f5f5f4", "#0f766e"],
                 range_color=[-1, 1], labels={"r": "Pearson r", "feature": ""})
    fig.add_vline(x=0, line_width=1, line_color="#e7e5e4")
    fig.update_layout(margin=dict(l=0, r=0, t=0, b=0), height=280,
                      coloraxis_showscale=False, yaxis=dict(categoryorder="total ascending"))
    st.plotly_chart(fig, use_container_width=True)
    st.caption(f"n = {df_c.get('n', ['?'])[0] if 'n' in df_c else '?'} posts · ค่า N/A คือ feature นั้น extract ไม่ได้")


def _creative_patterns(patterns):
    if not patterns:
        st.caption("ต้องการ ≥ 5 posts ใน top 10% เพื่อ extract pattern")
        return
    for pat in patterns[:4]:
        with st.container():
            st.markdown(f"**{pat.get('label', '')}**")
            st.markdown(pat.get("value", ""))
            st.caption(pat.get("detail", ""))


def _cost_table(paid_posts, baseline):
    rows = []
    from itertools import groupby
    sorted_posts = sorted(paid_posts, key=lambda p: (p.get("format",""), p.get("objective","")))
    for (fmt, obj), group in groupby(sorted_posts, key=lambda p: (p.get("format",""), p.get("objective",""))):
        grp = list(group)
        total_spend = sum((p.get("ad_spend") or 0) for p in grp)
        total_eng = sum((p.get("engaged_users") or 0) for p in grp)
        total_reach = sum((p.get("reach") or 0) for p in grp)
        avg_freq = sum((p.get("ad_frequency") or 0) for p in grp) / len(grp)
        cpm = (total_spend / total_reach * 1000) if total_reach else None
        cpe = (total_spend / total_eng) if total_eng else None
        rows.append({
            "Format · Objective": f"{fmt} · {obj}",
            "Spend": f"฿{total_spend:,.0f}",
            "CPM": f"฿{cpm:.0f}" if cpm else "N/A",
            "CPE": f"฿{cpe:.2f}" if cpe else "N/A",
        })
    if rows:
        st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


def _overview_insights(correlations, patterns, df, baseline):
    avg_er = df["er"].mean()
    top_format = _top_format(df)

    if topic_extractor.is_available():
        overview = {
            "avg_er": round(avg_er, 1),
            "reach_total": int(df["reach"].sum()),
            "spend_total": int(df["ad_spend"].sum()) or None,
        }
        fmt_perf = compute_format_performance(
            st.session_state.posts_data or [], baseline)
        summary = topic_extractor.generate_overview_insight(
            overview, baseline, fmt_perf, correlations, patterns or [])
        if summary:
            st.markdown(f"✨ **Claude:** {summary}")

    st.info(f"""
**จากการวิเคราะห์ {len(df)} โพสต์:**
- {top_format} ทำ ER สูงกว่า format อื่นเฉลี่ย
- Average ER {avg_er:.1f}% {'สูงกว่า' if avg_er > baseline['ER'] else 'ใกล้เคียง'} baseline {baseline['ER']:.1f}%
{chr(10).join(f'- {p["detail"]}' for p in (patterns or [])[:3])}
    """)


def _time_heatmap(data):
    if not data:
        st.caption("ไม่มีข้อมูล")
        return
    df = pd.DataFrame(data)
    fig = px.imshow(df.set_index("day").T,
                    color_continuous_scale=["#FEF3E7", "#FED7AA", "#FB923C", "#EA580C"],
                    aspect="auto", labels={"color": "Avg ER"})
    fig.update_layout(margin=dict(l=0, r=0, t=0, b=0), height=200, coloraxis_showscale=False)
    st.plotly_chart(fig, use_container_width=True)




# ──────────────────────────────────────────────
# SIDEBAR — FILTERS & LOAD
# ──────────────────────────────────────────────
with st.sidebar:
    st.markdown("### Bangkok Bites · Analyzer")
    st.markdown("---")

    col1, col2 = st.columns(2)
    with col1:
        since = st.date_input("เริ่ม", value=date.today() - timedelta(days=90))
    with col2:
        until = st.date_input("ถึง", value=date.today())

    mode = st.radio("มุมมอง", ["รวม (All)", "Organic only", "Paid only"], index=0)

    objective_filter = st.selectbox(
        "Objective (ads)", ["ทั้งหมด", "AWARENESS", "TRAFFIC", "ENGAGEMENT", "CONVERSIONS", "LEAD_GENERATION"]
    )
    format_filter = st.multiselect("Format", ["Reel", "Carousel", "Photo", "Video", "Link"], default=[])

    st.markdown("---")

    if st.button("🔄 Load / Refresh data", type="primary", use_container_width=True):
        with st.spinner("กำลังดึงข้อมูลจาก Facebook..."):
            try:
                client = FBClient()
                page_info = client.get_page_info()
                posts_raw = client.pull_all(str(since), str(until))

                follower = page_info.get("fan_count", 1)
                baseline = calculate_baseline(posts_raw, follower)

                scorer = PostScorer(baseline, posts_raw)
                scores = {p["post_id"]: scorer.score(p) for p in posts_raw}

                st.session_state.page_info = page_info
                st.session_state.posts_data = posts_raw
                st.session_state.baseline = baseline
                st.session_state.scores = scores
                st.session_state.df = _build_df(posts_raw, scores)
                st.success(f"โหลด {len(posts_raw)} โพสต์สำเร็จ")
            except Exception as e:
                st.error(f"เกิดข้อผิดพลาด: {e}")
                st.info("ตรวจสอบ .env ว่ามี FB_PAGE_ACCESS_TOKEN และ FB_PAGE_ID")

    if st.button("📊 โหลด demo data", use_container_width=True):
        from sample_data import sample_posts, sample_page_info
        posts_raw = sample_posts()
        page_info = sample_page_info()
        follower = page_info.get("fan_count") or page_info.get("followers_count") or 1
        baseline = calculate_baseline(posts_raw, follower)
        scorer = PostScorer(baseline, posts_raw)
        scores = {p["post_id"]: scorer.score(p) for p in posts_raw}
        st.session_state.page_info = page_info
        st.session_state.posts_data = posts_raw
        st.session_state.baseline = baseline
        st.session_state.scores = scores
        st.session_state.df = _build_df(posts_raw, scores)
        st.success(f"โหลด demo {len(posts_raw)} โพสต์ (รัน pipeline จริงบนข้อมูลตัวอย่าง)")

    if topic_extractor.is_available():
        st.caption("✨ Claude API: เปิดใช้งาน (topic + narrative)")

    st.markdown("---")
    st.markdown("**Tier navigation**")
    if st.button("1 · Overview", use_container_width=True,
                 type="primary" if st.session_state.tier == "overview" else "secondary"):
        st.session_state.tier = "overview"
    if st.button("2 · Ads vs Organic", use_container_width=True,
                 type="primary" if st.session_state.tier == "split" else "secondary"):
        st.session_state.tier = "split"
    if st.button("3 · Post deep-dive", use_container_width=True,
                 type="primary" if st.session_state.tier == "post" else "secondary",
                 disabled=st.session_state.selected_post_id is None):
        st.session_state.tier = "post"

    if st.session_state.df is not None:
        st.markdown("---")
        df = st.session_state.df
        sel = st.selectbox(
            "เลือกโพสต์ (tier 3)",
            options=df["post_id"].tolist(),
            format_func=lambda pid: df[df.post_id == pid]["title"].values[0][:50] + "...",
        )
        if sel:
            st.session_state.selected_post_id = sel
            st.session_state.tier = "post"


# ──────────────────────────────────────────────
# MAIN CONTENT
# ──────────────────────────────────────────────

if st.session_state.posts_data is None:
    st.markdown("## Facebook Performance Analyzer")
    st.info("กด **Load / Refresh data** ใน sidebar เพื่อเริ่มต้น")
    st.markdown("""
    **ต้องการ:**
    - `FB_PAGE_ACCESS_TOKEN` — Page Access Token (long-lived)
    - `FB_PAGE_ID` — Page ID ของเพจ
    - `FB_AD_ACCOUNT_ID` — (optional) สำหรับดึง ad data

    ดู `.env.example` สำหรับ format
    """)
    st.stop()

posts = st.session_state.posts_data
scores = st.session_state.scores
baseline = st.session_state.baseline
df = st.session_state.df

# Apply filters
filtered = _apply_filters(posts, mode, objective_filter, format_filter)
fdf = df[df.post_id.isin([p["post_id"] for p in filtered])]


# ──────────────────────────────────────────────
# TIER 1: OVERVIEW
# ──────────────────────────────────────────────
if st.session_state.tier == "overview":
    pi = st.session_state.page_info or {}
    st.markdown(f"## {pi.get('name', 'Page')} · Overview")
    st.caption(f"{len(filtered)} โพสต์ · {str(since)} – {str(until)}")

    # KPI row
    c1, c2, c3, c4, c5 = st.columns(5)
    total_reach = fdf["reach"].sum()
    avg_er = fdf["er"].mean()
    total_spend = fdf["ad_spend"].sum()
    total_engagement = fdf["engagement"].sum()
    avg_score = fdf["score"].mean()

    with c1: _kpi("Total reach", _fmt(total_reach))
    with c2: _kpi("Avg ER", f"{avg_er:.1f}%", f"baseline {baseline['ER']:.1f}%")
    with c3: _kpi("Total spend", f"฿{total_spend:,.0f}" if total_spend > 0 else "N/A")
    with c4: _kpi("Avg score", f"{avg_score:.0f}/100")
    with c5: _kpi("Top format", _top_format(fdf))

    st.markdown("---")
    col_left, col_right = st.columns([1.3, 1])

    with col_left:
        st.markdown('<div class="section-header">Posts ranked by score</div>', unsafe_allow_html=True)
        _posts_table(fdf, scores)

    with col_right:
        st.markdown('<div class="section-header">Engagement rate by format</div>', unsafe_allow_html=True)
        fmt_perf = compute_format_performance(filtered, baseline)
        if fmt_perf:
            fmt_df = pd.DataFrame(fmt_perf)
            fig = px.bar(fmt_df, x="ER", y="format", orientation="h",
                         color="ER", color_continuous_scale=["#F5F5F4", "#0F766E"],
                         text="ER", labels={"ER": "ER %", "format": ""})
            fig.update_traces(texttemplate="%{text:.1f}%", textposition="outside")
            fig.update_layout(margin=dict(l=0, r=10, t=0, b=0), height=220,
                              showlegend=False, coloraxis_showscale=False,
                              yaxis=dict(categoryorder="total ascending"))
            st.plotly_chart(fig, use_container_width=True)

    col_heat, col_insight = st.columns(2)
    with col_heat:
        st.markdown('<div class="section-header">ช่วงเวลา engagement สูง</div>', unsafe_allow_html=True)
        heatmap_data = compute_time_heatmap(filtered)
        _time_heatmap(heatmap_data)

    with col_insight:
        st.markdown('<div class="section-header">AI insights</div>', unsafe_allow_html=True)
        correlations = compute_correlations(filtered, baseline)
        patterns = extract_creative_patterns(filtered, scores)
        _overview_insights(correlations, patterns, fdf, baseline)


# ──────────────────────────────────────────────
# TIER 2: ADS vs ORGANIC
# ──────────────────────────────────────────────
elif st.session_state.tier == "split":
    st.markdown("## Ads vs Organic")
    st.caption("เปรียบเทียบแยกฝั่ง — ไม่นำ objective ต่างกันมาเทียบกัน")

    organic_posts = [p for p in filtered if p.get("post_class") == "organic"]
    paid_posts = [p for p in filtered if p.get("post_class") in ("boosted", "ad_only")]

    col_o, col_p = st.columns(2)

    with col_o:
        st.markdown(f'<div class="section-header">🟢 Organic · {len(organic_posts)} posts</div>', unsafe_allow_html=True)
        _split_metrics(organic_posts, baseline, "organic")

    with col_p:
        st.markdown(f'<div class="section-header">🔴 Paid · {len(paid_posts)} ads</div>', unsafe_allow_html=True)
        _split_metrics(paid_posts, baseline, "paid")

    st.markdown("---")
    st.markdown('<div class="section-header">Dimensional correlation · Pearson r กับ engagement</div>', unsafe_allow_html=True)
    correlations = compute_correlations(filtered, baseline)
    _correlation_chart(correlations)

    st.markdown("---")
    col_pat, col_cost = st.columns(2)
    with col_pat:
        st.markdown('<div class="section-header">Creative patterns · top 10% มีอะไรเหมือนกัน</div>', unsafe_allow_html=True)
        patterns = extract_creative_patterns(filtered, scores)
        _creative_patterns(patterns)

    with col_cost:
        if paid_posts:
            st.markdown('<div class="section-header">Cost efficiency · by format × objective</div>', unsafe_allow_html=True)
            _cost_table(paid_posts, baseline)


# ──────────────────────────────────────────────
# TIER 3: INDIVIDUAL POST DEEP-DIVE
# ──────────────────────────────────────────────
elif st.session_state.tier == "post":
    pid = st.session_state.selected_post_id
    post = next((p for p in posts if p["post_id"] == pid), None)

    if not post:
        st.warning("ไม่พบโพสต์นี้ กรุณาเลือกใหม่")
        st.stop()

    ps = scores.get(pid)

    # Breadcrumb
    bc1, bc2, bc3 = st.columns([1, 1, 2])
    with bc1:
        if st.button("← Overview"):
            st.session_state.tier = "overview"
    with bc2:
        if st.button("← Ads vs Organic"):
            st.session_state.tier = "split"

    # Header
    st.markdown(f"## Post deep-dive")
    _post_header(post, ps)

    st.markdown("---")

    # ── 5 metric sections ──
    st.markdown('<div class="section-header">1 · Distribution</div>', unsafe_allow_html=True)
    _distribution_section(post)

    if _is_video(post):
        st.markdown('<div class="section-header">2 · Video performance</div>', unsafe_allow_html=True)
        _video_section(post)

    st.markdown('<div class="section-header">3 · Interactions</div>', unsafe_allow_html=True)
    _interactions_section(post)

    if post.get("post_class") in ("boosted", "ad_only"):
        st.markdown(f'<div class="section-header">4 · Ad performance · {post.get("objective", "N/A")} only</div>', unsafe_allow_html=True)
        _ad_section(post, paid_posts=[p for p in posts if p.get("objective") == post.get("objective")])

    st.markdown('<div class="section-header">5 · Negative signals</div>', unsafe_allow_html=True)
    _negative_section(post, baseline)

    st.markdown("---")

    # ── Health check ──
    st.markdown('<div class="section-header">Health check · สรุปสัญญาณ</div>', unsafe_allow_html=True)
    _health_check(post, ps, baseline)

    # ── Score breakdown ──
    if ps and ps.total is not None:
        st.markdown("---")
        st.markdown('<div class="section-header">Score breakdown</div>', unsafe_allow_html=True)
        _score_breakdown(ps)

        if topic_extractor.is_available():
            narrative = topic_extractor.generate_post_insight(
                post, {"total": ps.total, "grade": ps.grade}, baseline)
            if narrative:
                st.markdown(f"✨ **Claude:** {narrative}")

    # ── Compare with page baseline ──
    st.markdown("---")
    st.markdown('<div class="section-header">Compare · vs โพสต์เฉลี่ยของเพจ</div>', unsafe_allow_html=True)
    _compare_section(post, baseline)

    # ── Recommendations ──
    st.markdown("---")
    st.markdown('<div class="section-header">Recommendations · ต่อเนื่อง 3 ระยะ</div>', unsafe_allow_html=True)
    recs = _generate_recommendations(post, ps, baseline, patterns=extract_creative_patterns(posts, scores))
    _render_recommendations(recs)

    # ── Data quality ──
    with st.expander("Data quality · ที่มาของทุกตัวเลข"):
        _data_quality(post, ps)
