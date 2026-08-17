import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Calendar, TrendingUp, AlertTriangle, CheckCircle2, AlertCircle, Copy, Trophy, Sparkles, Bolt, BarChart3, Database, FileSpreadsheet, Layers3, Settings, Upload, RefreshCw, CircleCheck, X, Link2, ShieldCheck, ExternalLink, Unplug, LoaderCircle, LockKeyhole, LogOut, FolderKanban, Plus, MessageSquareText, ListChecks, Lightbulb, TextQuote, Pencil, Trash2, Save, Check, ArrowLeft, ArrowRight, CalendarRange, Cable, Download, Share2, Printer } from 'lucide-react';
import { createBrand, createCampaign, createPeriod, createProject, createReportElement, deleteReportElement, disconnectFacebook, fetchAnalysis, fetchAuthStatus, fetchFacebookStatus, fetchPortfolio, fetchReportElements, login, logout, refreshFacebookConnection, startFacebookConnection, updateReportElement } from './api.js';
import './styles.css';

// ============ FORMATTERS ============
const fmt = (n) => {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
};
const fmtMoney = (n) => (n === null || n === undefined) ? 'N/A' : '฿' + (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toLocaleString());
const fmtNum = (n, d = 0) => (n === null || n === undefined) ? 'N/A' : Number(n).toFixed(d);
const exactNumber = (n, options = {}) => (n === null || n === undefined || Number.isNaN(Number(n))) ? null : new Intl.NumberFormat('th-TH', { maximumFractionDigits: 6, ...options }).format(Number(n));
const exactMoney = (n) => n === null || n === undefined ? null : `฿${exactNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateInputValue = (value) => {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const defaultPeriod = () => {
  const until = new Date();
  const since = new Date(until);
  since.setDate(since.getDate() - 89);
  return { since: dateInputValue(since), until: dateInputValue(until) };
};
const reportStateFromLocation = () => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const since = params.get('since');
  const until = params.get('until');
  if (params.get('view') !== 'report' || !/^\d{4}-\d{2}-\d{2}$/.test(since || '') || !/^\d{4}-\d{2}-\d{2}$/.test(until || '') || since > until) return null;
  return {
    since,
    until,
    projectId: params.get('project_id') || undefined,
    periodId: params.get('period_id') || undefined,
    campaignIds: params.getAll('campaign_ids').filter(Boolean),
  };
};
const reportUrl = period => {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('view', 'report');
  url.searchParams.set('since', period.since);
  url.searchParams.set('until', period.until);
  if (period.projectId) url.searchParams.set('project_id', period.projectId);
  if (period.periodId) url.searchParams.set('period_id', period.periodId);
  (period.campaignIds || []).forEach(id => url.searchParams.append('campaign_ids', id));
  return url.toString();
};
const csvCell = value => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};
const downloadCsv = (data, mode, project) => {
  const rows = applyMode(data.posts || [], mode);
  const headers = ['project', 'period', 'since', 'until', 'mode', 'post_id', 'date', 'title', 'type', 'objective', 'format', 'impressions', 'reach', 'frequency', 'engagement', 'shares', 'saves', 'comments', 'link_clicks', 'spend', 'purchases', 'revenue', 'roas', 'score', 'grade'];
  const values = rows.map(post => [project?.name, data.scope?.period_label, data.range?.since, data.range?.until, mode, post.id, post.date, post.title, post.type, post.objective, post.format, post.impressions, post.reach, post.frequency, post.engagement, post.shares, post.saves, post.comments, post.link_clicks, post.spend, post.purchases, post.revenue, post.roas, post.score, post.grade]);
  const blob = new Blob(['\ufeff', [headers, ...values].map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = (project?.name || data.page?.name || 'report').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'report';
  anchor.href = url;
  anchor.download = `${safeName}_${data.range?.since}_${data.range?.until}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
const pct = (num, den, d = 1) => (num === null || num === undefined || !den) ? null : (num / den * 100).toFixed(d);
const delta = (val, base) => {
  if (val === null || val === undefined || base === null || base === undefined || !base) return null;
  const r = (val / base - 1) * 100;
  return (r >= 0 ? '+' : '') + r.toFixed(0) + '%';
};

const fontStyle = { fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif' };
const monoStyle = { fontFamily: '"IBM Plex Mono", ui-monospace, monospace' };

const FormatBg = (format) => ({ Reel: '#FDF1E5', Carousel: '#F0EAFE', Photo: '#E1F5EE', Video: '#E1F5EE', Link: '#F5F5F4' }[format] || '#F5F5F4');
const FormatColor = (format) => ({ Reel: '#9A3412', Carousel: '#5B21B6', Photo: '#0F766E', Video: '#0F766E', Link: '#525252' }[format] || '#525252');
const gradeColor = (g) => ({ A: '#0F766E', B: '#65A30D', C: '#CA8A04', D: '#C2410C', F: '#991B1B' }[g] || '#525252');

const FREQ_TARGET = 2.0; // backend convention: frequency ควร ≤ 2.0

// ============ ATOMS ============
const ExactValue = ({ children, exact }) => {
  if (!exact || exact === children) return <>{children}</>;
  return <span className="exact-value" tabIndex="0" title={`ค่าจริง ${exact}`} data-exact={exact} aria-label={`${children} — ค่าจริง ${exact}`}>{children}</span>;
};

const TypeBadge = ({ type }) => {
  const styles = {
    boosted: { bg: '#E1F5EE', color: '#0F766E', label: 'Boosted' },
    organic: { bg: '#F5F5F4', color: '#525252', label: 'Organic' },
    ad: { bg: '#FEE2E2', color: '#991B1B', label: 'Ad only' },
  };
  const s = styles[type] || styles.organic;
  return <span style={{ fontSize: 10, padding: '2px 7px', background: s.bg, color: s.color, borderRadius: 999, fontWeight: 500 }}>{s.label}</span>;
};

const GradeChip = ({ grade, score }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 30, fontWeight: 500, color: gradeColor(grade), lineHeight: 1, ...monoStyle }}>{grade || '–'}</div>
    <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2, ...monoStyle }}>{score ?? '–'} / 100</div>
  </div>
);

const SectionTitle = ({ num, title }) => (
  <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    {num && <span style={{ ...monoStyle, marginRight: 6 }}>{num} ·</span>}{title}
  </div>
);

const MetricBox = ({ label, value, exact, sub, good, warn, mini }) => (
  <div>
    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    <div style={{ fontSize: mini ? 13 : 16, fontWeight: 500, marginTop: 2, color: warn ? '#CA8A04' : 'inherit', ...monoStyle }}><ExactValue exact={exact}>{value}</ExactValue></div>
    {sub && <div style={{ fontSize: 10, color: good ? '#0F766E' : '#78716C', marginTop: 2 }}>{sub}</div>}
  </div>
);

const Row = ({ label, value, exact, sub, good, warn }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6, borderBottom: '0.5px solid #F5F5F4' }}>
    <div>
      <div style={{ fontSize: 12, color: '#57534E' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#78716C', marginTop: 2 }}>{sub}</div>}
    </div>
    <div style={{ fontSize: 14, fontWeight: 500, color: good ? '#0F766E' : warn ? '#CA8A04' : 'inherit', ...monoStyle }}><ExactValue exact={exact}>{value}</ExactValue></div>
  </div>
);

const HealthRow = ({ status, text, last }) => {
  const cfg = {
    good: { icon: <CheckCircle2 size={16} color="#0F766E" />, color: '#0F766E', label: 'ดี' },
    warn: { icon: <AlertTriangle size={16} color="#CA8A04" />, color: '#CA8A04', label: 'เตือน' },
    bad: { icon: <AlertCircle size={16} color="#991B1B" />, color: '#991B1B', label: 'ต่ำ' },
    na: { icon: <AlertCircle size={16} color="#78716C" />, color: '#78716C', label: 'N/A' },
  }[status] || {};
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: last ? 'none' : '0.5px solid #F5F5F4' }}>
      {cfg.icon}
      <div style={{ fontSize: 12, flex: 1 }}>{text}</div>
      <span style={{ fontSize: 10, color: cfg.color }}>{cfg.label}</span>
    </div>
  );
};

const ScoreRow = ({ label, score, max, reason, last }) => (
  <div style={{ marginBottom: last ? 0 : 12, paddingBottom: last ? 0 : 12, borderBottom: last ? 'none' : '0.5px solid #F5F5F4' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, ...monoStyle }}>{score} / {max}</span>
    </div>
    <div style={{ height: 5, background: '#F5F5F4', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
      <div style={{ width: `${(score / max) * 100}%`, height: '100%', background: '#0F766E' }}></div>
    </div>
    <div style={{ fontSize: 11, color: '#78716C', lineHeight: 1.6 }}>{reason}</div>
  </div>
);

const CompareRow = ({ label, value, muted }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
    <span style={{ color: '#78716C' }}>{label}</span>
    <span style={{ fontWeight: muted ? 400 : 500, ...monoStyle }}>{value}</span>
  </div>
);

const RecBlock = ({ icon, title, color, bg, textColor, items }) => (
  <div style={{ background: bg, padding: '12px 14px', borderLeft: `1px solid ${color}`, borderRadius: '0 8px 8px 0', marginBottom: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      {icon}
      <div style={{ fontSize: 13, fontWeight: 500, color: textColor }}>{title}</div>
    </div>
    <ul style={{ fontSize: 12, color: textColor, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  </div>
);

const FunnelMetric = ({ label, value, exact, sub, source }) => (
  <div className="funnel-metric">
    <div className="funnel-metric-head">
      <span>{label}</span>
      <small>{source}</small>
    </div>
    <div className="funnel-metric-value"><ExactValue exact={exact}>{value}</ExactValue></div>
    <div className="funnel-metric-sub">{sub || '\u00a0'}</div>
  </div>
);

const FunnelGroup = ({ title, description, metrics }) => (
  <section className="funnel-group" aria-label={title}>
    <header>
      <h3>{title}</h3>
      <p>{description}</p>
    </header>
    <div className="funnel-metric-grid">
      {metrics.map(metric => <FunnelMetric key={metric.label} {...metric} />)}
    </div>
  </section>
);

// ============ TIER 1: OVERVIEW ============
const TierOverview = ({ data, mode, onSelectPost }) => {
  const baseOverview = data.overview;
  const baseline = data.baseline;
  const posts = applyMode(data.posts, mode);
  const ov = mode === 'all' ? baseOverview : summarizePosts(posts);
  const revenueSource = ov.revenue_source === 'meta_action_values'
    ? 'Meta API'
    : ov.revenue_source === 'mixed'
      ? 'API + คำนวณ'
      : ov.revenue_source === 'calculated_from_roas'
        ? 'คำนวณ'
        : 'API / File';
  const funnelGroups = [
    {
      title: 'Awareness',
      description: 'คนเห็นมากแค่ไหน และเห็นซ้ำเพียงใด',
      metrics: [
        { label: 'Reach', value: fmt(ov.reach_total), exact: exactNumber(ov.reach_total), sub: 'จำนวนคนที่เข้าถึง', source: 'Meta API' },
        { label: 'Impressions', value: fmt(ov.impressions_total), exact: exactNumber(ov.impressions_total), sub: 'จำนวนครั้งที่แสดงผล', source: 'Meta API' },
        { label: 'Frequency', value: ov.frequency != null ? `${ov.frequency}×` : 'N/A', exact: exactNumber(ov.frequency), sub: 'Impressions ÷ Reach', source: 'คำนวณ' },
      ],
    },
    {
      title: 'Engagement',
      description: 'คนตอบสนองและเดินทางต่อจากคอนเทนต์หรือไม่',
      metrics: [
        { label: 'Engagement', value: fmt(ov.engagement_total), exact: exactNumber(ov.engagement_total), sub: 'รวม engaged users', source: 'Meta API' },
        { label: 'Engagement rate', value: ov.avg_er != null ? `${ov.avg_er}%` : 'N/A', exact: exactNumber(ov.avg_er), sub: baseline.ER != null ? `Baseline ${baseline.ER}%` : 'Engagement ÷ Reach', source: 'คำนวณ' },
        { label: 'Link clicks', value: fmt(ov.link_clicks_total), exact: exactNumber(ov.link_clicks_total), sub: 'คลิกที่พาออกจากโพสต์', source: 'Meta API' },
        { label: 'Link CTR', value: ov.link_ctr != null ? `${ov.link_ctr}%` : 'N/A', exact: exactNumber(ov.link_ctr), sub: 'Link clicks ÷ Impressions', source: 'คำนวณ' },
      ],
    },
    {
      title: 'Conversion',
      description: 'ผลลัพธ์ทางธุรกิจและเงินที่กลับมาจากงบโฆษณา',
      metrics: [
        { label: 'Purchases', value: fmt(ov.purchases), exact: exactNumber(ov.purchases), sub: ov.purchases == null ? 'รอ Pixel / CAPI หรือไฟล์ยอดขาย' : 'จำนวนคำสั่งซื้อที่ระบุแหล่งได้', source: 'API / File' },
        { label: 'Revenue · ยอดขาย', value: fmtMoney(ov.revenue), exact: exactMoney(ov.revenue), sub: ov.revenue == null ? 'รอ conversion value หรือไฟล์ยอดขาย' : 'มูลค่า conversion รวม', source: revenueSource },
        { label: 'Spend', value: fmtMoney(ov.spend_total), exact: exactMoney(ov.spend_total), sub: <>CPM <ExactValue exact={exactMoney(ov.cpm)}>{fmtMoney(ov.cpm)}</ExactValue> · CPE {ov.cpe != null ? `฿${ov.cpe}` : 'N/A'}</>, source: 'Meta API' },
        { label: 'ROAS', value: ov.roas != null ? `${ov.roas}×` : 'N/A', exact: exactNumber(ov.roas), sub: ov.conversion_spend != null ? <>ยอดขาย ÷ งบ Conversion <ExactValue exact={exactMoney(ov.conversion_spend)}>{fmtMoney(ov.conversion_spend)}</ExactValue></> : 'รอข้อมูล Conversion', source: 'คำนวณ' },
        { label: 'ROI', value: ov.roi != null ? `${ov.roi}%` : 'N/A', exact: exactNumber(ov.roi), sub: '(ยอดขาย − งบ Conversion) ÷ งบ', source: 'คำนวณ' },
      ],
    },
  ];

  const maxER = Math.max(...data.format_perf.map(f => f.ER), 1);
  const insights = buildInsights(data);

  return (
    <div>
      <div className="funnel-overview">
        {funnelGroups.map(group => <FunnelGroup key={group.title} {...group} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top performers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {posts.slice(0, 5).map(p => (
              <button type="button" key={p.id} onClick={() => onSelectPost(p)} style={{ width: '100%', cursor: 'pointer', display: 'flex', gap: 10, padding: 10, background: 'white', color: 'inherit', border: '0.5px solid #E7E5E4', borderRadius: 8, alignItems: 'center', textAlign: 'left' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#0F766E'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E7E5E4'}>
                <div style={{ width: 36, height: 36, background: FormatBg(p.format), borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 500, color: FormatColor(p.format) }}>{p.format.slice(0, 2)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#78716C', marginBottom: 2 }}>{p.date} · {p.day}{p.topic ? <span style={{ color: '#5B21B6' }}> · {p.topic}</span> : ''}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 500, color: gradeColor(p.grade), ...monoStyle, flexShrink: 0 }}>{p.score ?? '–'}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Engagement rate ตาม format</div>
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.format_perf.map(f => (
                <div key={f.format}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{f.format} <span style={{ color: '#78716C', fontSize: 10 }}>· n={f.count}</span></span>
                    <span style={{ fontWeight: 500, ...monoStyle }}>{f.ER}%</span>
                  </div>
                  <div style={{ height: 5, background: '#F5F5F4', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(f.ER / maxER) * 100}%`, height: '100%', background: f.color }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>ช่วงเวลา engagement สูง</div>
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '24px repeat(6, 1fr)', gap: 3, fontSize: 9, color: '#78716C', marginBottom: 4 }}>
              <div></div>
              {[6, 10, 14, 18, 21, 24].map(h => <div key={h} style={{ textAlign: 'center' }}>{h}</div>)}
            </div>
            {data.time_heatmap.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px repeat(6, 1fr)', gap: 3, marginBottom: 3 }}>
                <div style={{ fontSize: 10, color: '#78716C', display: 'flex', alignItems: 'center' }}>{row.day}</div>
                {row.slots.map((v, j) => {
                  const bg = ['#FEF3E7', '#FED7AA', '#FB923C', '#EA580C'][v - 1] || '#FEF3E7';
                  return <div key={j} style={{ aspectRatio: 1, background: bg, borderRadius: 2 }}></div>;
                })}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#57534E', textTransform: 'uppercase', letterSpacing: 0.5 }}>AI insights</span>
            {data.ai?.enabled && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, padding: '1px 6px', background: '#F0EAFE', color: '#5B21B6', borderRadius: 999, fontWeight: 500 }}><Sparkles size={10} /> Claude</span>}
          </div>
          <div style={{ background: '#F0F9FF', border: '0.5px solid #BAE6FD', borderRadius: 8, padding: 14, height: 'calc(100% - 28px)' }}>
            {data.ai_summary && (
              <div style={{ fontSize: 12, color: '#075985', lineHeight: 1.7, marginBottom: insights.length ? 10 : 0, paddingBottom: insights.length ? 10 : 0, borderBottom: insights.length ? '0.5px solid #BAE6FD' : 'none' }}>{data.ai_summary}</div>
            )}
            {insights.length ? (
              <ul style={{ fontSize: 12, color: '#075985', margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                {insights.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            ) : (!data.ai_summary && <div style={{ fontSize: 12, color: '#0369A1' }}>ข้อมูลยังไม่พอสำหรับ insight (ต้องการ ≥ 5 โพสต์)</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ TIER 2: ADS vs ORGANIC ============
const TierAdsOrganic = ({ data }) => {
  const baseline = data.baseline;
  const organic = data.posts.filter(p => p.type === 'organic');
  const paid = data.posts.filter(p => p.type !== 'organic');
  const sideAgg = (list) => {
    const reach = sum(list, 'reach');
    const eng = sum(list, 'engagement');
    const spend = sum(list, 'spend');
    return { reach, er: reach ? (eng / reach * 100).toFixed(1) : null, spend, cpe: eng ? (spend / eng).toFixed(2) : null };
  };
  const o = sideAgg(organic), pp = sideAgg(paid);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#0F766E' }}></div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Organic</div>
            <div style={{ fontSize: 11, color: '#78716C', marginLeft: 'auto' }}>n = {organic.length} posts</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Reach" value={fmt(o.reach)} exact={exactNumber(o.reach)} />
            <Row label="ER" value={o.er != null ? `${o.er}%` : 'N/A'} sub={baseline.ER != null ? `baseline ${baseline.ER}%` : ''} good={o.er != null && baseline.ER != null && o.er > baseline.ER} />
            <Row label="Avg save rate" value={baseline.save != null ? `${baseline.save}%` : 'N/A'} sub="page median" />
          </div>
        </div>

        <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#C2410C' }}></div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Paid</div>
            <div style={{ fontSize: 11, color: '#78716C', marginLeft: 'auto' }}>n = {paid.length} ads</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Reach" value={fmt(pp.reach)} exact={exactNumber(pp.reach)} />
            <Row label="ER" value={pp.er != null ? `${pp.er}%` : 'N/A'} sub="paid sees broader audience" />
            <Row label="Spend total" value={fmtMoney(pp.spend)} exact={exactMoney(pp.spend)} />
            <Row label="Avg CPE" value={pp.cpe != null ? `฿${pp.cpe}` : 'N/A'} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Dimensional correlation · อะไรสัมพันธ์กับ engagement</div>
        <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
          {data.correlations.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.correlations.map(c => {
                const w = Math.abs(c.value) * 100;
                return (
                  <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 60px', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 12 }}>{c.name}</span>
                    <div style={{ position: 'relative', height: 5, background: '#F5F5F4', borderRadius: 3 }}>
                      {c.value >= 0
                        ? <div style={{ position: 'absolute', left: '50%', width: `${w / 2}%`, height: '100%', background: w > 30 ? '#0F766E' : '#78716C', borderRadius: '0 3px 3px 0' }}></div>
                        : <div style={{ position: 'absolute', right: '50%', width: `${w / 2}%`, height: '100%', background: w > 30 ? '#991B1B' : '#78716C', borderRadius: '3px 0 0 3px' }}></div>}
                      <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 9, background: '#D6D3D1' }}></div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'right', color: c.value >= 0.3 ? '#0F766E' : c.value <= -0.3 ? '#991B1B' : '#78716C', ...monoStyle }}>
                      {c.value > 0 ? '+' : ''}{c.value.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <div style={{ fontSize: 10, color: '#78716C', marginTop: 4 }}>Pearson correlation · n = {data.correlations[0]?.n ?? '?'} posts</div>
            </div>
          ) : <div style={{ fontSize: 12, color: '#78716C' }}>ต้องการ ≥ 5 โพสต์สำหรับ correlation analysis</div>}
        </div>
      </div>

      {data.creative_patterns.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Creative pattern · top 10% มีอะไรเหมือนกัน</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {data.creative_patterns.map((p, i) => (
              <div key={i} style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 10, color: '#78716C', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{p.label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{p.value}</div>
                <div style={{ fontSize: 11, color: '#78716C' }}>{p.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.cost_table.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cost efficiency · ads</div>
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px', gap: 8, fontSize: 10, color: '#78716C', paddingBottom: 8, borderBottom: '0.5px solid #E7E5E4', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <div>Format · objective</div>
              <div style={{ textAlign: 'right' }}>Spend</div>
              <div style={{ textAlign: 'right' }}>CPM</div>
              <div style={{ textAlign: 'right' }}>CPE</div>
              <div style={{ textAlign: 'right' }}>ROAS</div>
            </div>
            {data.cost_table.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px', gap: 8, fontSize: 12, padding: '8px 0', borderTop: i > 0 ? '0.5px solid #F5F5F4' : 'none' }}>
                <div>{r.row}</div>
                <div style={{ textAlign: 'right', ...monoStyle }}><ExactValue exact={exactMoney(r.spend)}>{fmtMoney(r.spend)}</ExactValue></div>
                <div style={{ textAlign: 'right', ...monoStyle }}>{r.cpm != null ? `฿${r.cpm}` : 'N/A'}</div>
                <div style={{ textAlign: 'right', color: r.good === false ? '#991B1B' : r.good ? '#0F766E' : 'inherit', ...monoStyle }}>{r.cpe != null ? `฿${r.cpe}` : 'N/A'}</div>
                <div style={{ textAlign: 'right', color: r.good === false ? '#991B1B' : r.good ? '#0F766E' : 'inherit', ...monoStyle }}>{r.roas != null ? `${r.roas}×` : 'N/A'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============ TIER 3: POST DETAIL ============
const TierPostDetail = ({ post: p, baseline }) => {
  const sc = p.score_components;
  const reach = p.reach || 0;
  const er = reach ? p.engagement / reach * 100 : null;
  const saveRate = reach ? (p.saves || 0) / reach * 100 : null;
  const shareRate = reach ? (p.shares || 0) / reach * 100 : null;
  const rxnTotal = p.reactions ? Object.values(p.reactions).reduce((a, b) => a + b, 0) : 0;
  const isVideo = !!p.views_3s;
  const health = buildHealth(p, baseline, er, saveRate, shareRate);
  const recs = buildRecommendations(p, er);

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, padding: 14, background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, marginBottom: 14 }}>
        <div style={{ width: 64, height: 64, background: FormatBg(p.format), borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 500, color: FormatColor(p.format) }}>{p.format}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, padding: '2px 7px', background: FormatBg(p.format), color: FormatColor(p.format), borderRadius: 999, fontWeight: 500 }}>{p.format}{p.length ? ` · ${p.length}s` : ''}</span>
            <TypeBadge type={p.type} />
            <span style={{ fontSize: 10, padding: '2px 7px', background: '#F5F5F4', color: '#525252', borderRadius: 999 }}>{p.objective}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
          <div style={{ fontSize: 10, color: '#78716C', marginTop: 4, ...monoStyle }}>post_id {p.id} · {p.date} {p.time}</div>
        </div>
        <div style={{ paddingLeft: 14, borderLeft: '0.5px solid #E7E5E4' }}>
          <GradeChip grade={p.grade} score={p.score} />
        </div>
      </div>

      <SectionTitle num="1" title="Distribution" />
      <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MetricBox label="Impressions" value={fmt(p.impressions)} exact={exactNumber(p.impressions)} />
          <MetricBox label="Reach unique" value={fmt(p.reach)} exact={exactNumber(p.reach)} />
          <MetricBox label="Frequency" value={fmtNum(p.frequency, 2)} sub={`target ≤ ${FREQ_TARGET}`} warn={p.frequency > FREQ_TARGET} />
          <MetricBox label="Viral reach" value={fmt(p.reach_viral)} exact={exactNumber(p.reach_viral)} sub={pct(p.reach_viral, p.reach) != null ? `${pct(p.reach_viral, p.reach, 0)}% spread` : null} />
        </div>
        {reach > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ background: '#0F766E', width: `${(p.reach_organic || 0) / reach * 100}%` }}></div>
              <div style={{ background: '#C2410C', width: `${(p.reach_paid || 0) / reach * 100}%` }}></div>
              <div style={{ background: '#7C3AED', width: `${(p.reach_viral || 0) / reach * 100}%` }}></div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10 }}>
              <span><span style={{ color: '#0F766E' }}>●</span> Organic <ExactValue exact={exactNumber(p.reach_organic)}>{fmt(p.reach_organic)}</ExactValue></span>
              <span><span style={{ color: '#C2410C' }}>●</span> Paid <ExactValue exact={exactNumber(p.reach_paid)}>{fmt(p.reach_paid)}</ExactValue></span>
              <span><span style={{ color: '#7C3AED' }}>●</span> Viral <ExactValue exact={exactNumber(p.reach_viral)}>{fmt(p.reach_viral)}</ExactValue></span>
            </div>
          </div>
        )}
      </div>

      {isVideo && (
        <>
          <SectionTitle num="2" title="Video performance" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricBox label="3s views" value={fmt(p.views_3s)} exact={exactNumber(p.views_3s)} sub={pct(p.views_3s, p.impressions) != null ? `${pct(p.views_3s, p.impressions, 0)}% of impr.` : null} />
              <MetricBox label="15s views" value={fmt(p.views_15s)} exact={exactNumber(p.views_15s)} sub={pct(p.views_15s, p.views_3s) != null ? `${pct(p.views_15s, p.views_3s, 0)}% from 3s` : null} />
              <MetricBox label="Completion" value={fmt(p.views_completion)} exact={exactNumber(p.views_completion)} sub={pct(p.views_completion, p.views_3s) != null ? `${pct(p.views_completion, p.views_3s, 0)}% finished` : null} />
              <MetricBox label="Avg watch" value={p.avg_watch != null ? `${p.avg_watch}s` : 'N/A'} sub={(p.avg_watch != null && p.length) ? `${Math.round(p.avg_watch / p.length * 100)}% of length` : null} />
            </div>
          </div>
        </>
      )}

      <SectionTitle num="3" title="Interactions" />
      <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
          <MetricBox label="Engagement" value={fmt(p.engagement)} exact={exactNumber(p.engagement)} sub={er != null ? `ER ${er.toFixed(1)}%${baseline.ER ? ` · ${(er / baseline.ER).toFixed(1)}× baseline` : ''}` : null} good={er != null && baseline.ER != null && er > baseline.ER} />
          <MetricBox label="Shares" value={fmt(p.shares)} exact={exactNumber(p.shares)} sub={shareRate != null ? `${shareRate.toFixed(2)}% rate` : null} good />
          <MetricBox label="Saves" value={fmt(p.saves)} exact={exactNumber(p.saves)} sub={saveRate != null ? `${saveRate.toFixed(2)}% rate` : null} good />
        </div>
        {rxnTotal > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#78716C', marginBottom: 6 }}>Reactions · <ExactValue exact={exactNumber(rxnTotal)}>{fmt(rxnTotal)}</ExactValue> total</div>
            <div style={{ display: 'flex', height: 14, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
              {[{ type: 'like', color: '#3B82F6' }, { type: 'love', color: '#EC4899' }, { type: 'wow', color: '#F59E0B' }, { type: 'haha', color: '#EAB308' }, { type: 'sad', color: '#78716C' }, { type: 'angry', color: '#737373' }].map(r => {
                const w = (p.reactions[r.type] / rxnTotal) * 100;
                return <div key={r.type} title={`${r.type}: ${exactNumber(p.reactions[r.type])}`} style={{ background: r.color, width: `${w}%`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 500 }}>{w > 8 ? `${r.type} ${fmt(p.reactions[r.type])}` : ''}</div>;
              })}
            </div>
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>
          <MetricBox label="Comments" value={p.comments != null ? `${fmt(p.comments)}${p.comment_avg_words ? ` · avg ${p.comment_avg_words} คำ` : ''}` : 'N/A'} exact={p.comments != null ? `${exactNumber(p.comments)} comments` : null} sub={p.sentiment != null ? `sentiment ${p.sentiment >= 0 ? '+' : ''}${p.sentiment}` : null} mini />
          <MetricBox label="Link clicks" value={p.link_clicks != null ? fmt(p.link_clicks) : 'N/A'} exact={exactNumber(p.link_clicks)} sub={p.link_clicks == null ? 'โพสต์ไม่มีลิงก์ / ดึงไม่ได้' : null} mini />
        </div>
      </div>

      {p.type !== 'organic' && (
        <>
          <SectionTitle num="4" title={`Ad performance · ${p.objective} only`} />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricBox label="Spend" value={fmtMoney(p.spend)} exact={exactMoney(p.spend)} />
              <MetricBox label="CPM" value={p.cpm != null ? `฿${p.cpm}` : 'N/A'} />
              <MetricBox label="CPE" value={p.cpe != null ? `฿${p.cpe}` : 'N/A'} />
              <MetricBox label="ROAS" value={p.roas != null ? `${p.roas}×` : 'N/A'} sub={p.roas == null ? 'ไม่ใช่ conversion' : null} />
            </div>
            <div style={{ fontSize: 10, color: '#78716C', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>เปรียบเทียบเฉพาะกับ ads · {p.objective} — ไม่นำไปเทียบ objective อื่น</div>
          </div>
        </>
      )}

      <SectionTitle num="5" title="Negative signals" />
      <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MetricBox label="Hide post" value={p.hide_post != null ? `${p.hide_post} · ${pct(p.hide_post, reach, 2)}%` : 'N/A'} mini />
          <MetricBox label="Report spam" value={p.report_spam != null ? `${p.report_spam}` : 'N/A'} mini />
          <MetricBox label="Hide all" value={p.hide_all != null ? `${p.hide_all} · ${pct(p.hide_all, reach, 2)}%` : 'N/A'} mini />
          <MetricBox label="Unfollow" value="N/A" sub="field ไม่เปิด" mini />
        </div>
      </div>

      <SectionTitle title="Health check · สรุปสัญญาณ" />
      <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: '4px 0', marginBottom: 14 }}>
        {health.map((h, i) => <HealthRow key={i} status={h.status} text={h.text} last={i === health.length - 1} />)}
      </div>

      {sc && (
        <>
          <SectionTitle title="Score breakdown · 4 component" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16, marginBottom: 14 }}>
            <ScoreRow label="Engagement quality · 40%" score={sc.engagement.value} max={sc.engagement.max} reason={sc.engagement.reason} />
            <ScoreRow label="Reach efficiency · 25%" score={sc.reach.value} max={sc.reach.max} reason={sc.reach.reason} />
            <ScoreRow label="Save + share · 20%" score={sc.save_share.value} max={sc.save_share.max} reason={sc.save_share.reason} />
            <ScoreRow label="Comment quality · 15%" score={sc.comment.value} max={sc.comment.max} reason={sc.comment.reason} last />
            <div style={{ marginTop: 14, padding: '12px 14px', background: '#E1F5EE', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#064E3B', marginBottom: 4, ...monoStyle }}>รวม {p.score} / 100 · Grade {p.grade}</div>
              <div style={{ fontSize: 11, color: '#065F46', lineHeight: 1.6 }}>{p.summary}</div>
            </div>
          </div>
        </>
      )}

      <SectionTitle title="Compare · vs โพสต์เฉลี่ยของเพจ" />
      <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0F766E', marginBottom: 10 }}>โพสต์นี้</div>
            <CompareRow label="ER" value={er != null ? `${er.toFixed(1)}%` : 'N/A'} />
            <CompareRow label="Save" value={saveRate != null ? `${saveRate.toFixed(2)}%` : 'N/A'} />
            <CompareRow label="Share" value={shareRate != null ? `${shareRate.toFixed(2)}%` : 'N/A'} />
            <CompareRow label="CPE" value={p.cpe != null ? `฿${p.cpe}` : 'N/A'} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 28, alignItems: 'center', ...monoStyle, fontSize: 10 }}>
            <DeltaCell value={delta(er, baseline.ER)} />
            <DeltaCell value={delta(saveRate, baseline.save)} />
            <DeltaCell value={delta(shareRate, baseline.share)} />
            <DeltaCell value={delta(baseline.CPE, p.cpe)} invertGood />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>page avg (90d)</div>
            <CompareRow label="ER" value={baseline.ER != null ? `${baseline.ER}%` : 'N/A'} muted />
            <CompareRow label="Save" value={baseline.save != null ? `${baseline.save}%` : 'N/A'} muted />
            <CompareRow label="Share" value={baseline.share != null ? `${baseline.share}%` : 'N/A'} muted />
            <CompareRow label="CPE" value={baseline.CPE != null ? `฿${baseline.CPE}` : 'N/A'} muted />
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#78716C', marginTop: 12, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>baseline = median ของเพจเอง · n = {baseline.posts_90d ?? '?'} · ไม่นำมาเทียบกับ industry benchmark</div>
      </div>

      <SectionTitle title="Recommendations · ต่อเนื่อง 3 ระยะ" />
      {recs.now.length > 0 && <RecBlock icon={<Bolt size={16} color="#0F766E" />} title="ตอนนี้" color="#0F766E" bg="#E1F5EE" textColor="#064E3B" items={recs.now} />}
      {recs.next.length > 0 && <RecBlock icon={<Copy size={16} color="#CA8A04" />} title="โพสต์ถัดไป" color="#CA8A04" bg="#FEF3C7" textColor="#713F12" items={recs.next} />}
      {recs.long.length > 0 && <RecBlock icon={<Trophy size={16} color="#525252" />} title="ระยะยาว" color="#78716C" bg="#F5F5F4" textColor="#44403C" items={recs.long} />}
    </div>
  );
};

const DeltaCell = ({ value, invertGood }) => {
  if (value == null) return <div style={{ color: '#78716C' }}>–</div>;
  const positive = value.startsWith('+');
  const good = invertGood ? positive : positive;
  return <div style={{ color: good ? '#0F766E' : '#991B1B' }}>{value}</div>;
};

// ============ DERIVED HELPERS ============
function sum(list, key) { return list.reduce((a, p) => a + (p[key] || 0), 0); }

function applyMode(posts, mode) {
  if (mode === 'organic') return posts.filter(p => p.type === 'organic');
  if (mode === 'paid') return posts.filter(p => p.type !== 'organic');
  return posts;
}

function summarizePosts(posts) {
  const impressions = sum(posts, 'impressions');
  const reach = sum(posts, 'reach');
  const engagement = sum(posts, 'engagement');
  const linkClicks = sum(posts, 'link_clicks');
  const spend = sum(posts, 'spend');
  const purchaseValues = posts.filter(p => p.purchases != null).map(p => Number(p.purchases));
  const directRevenue = posts.filter(p => p.revenue != null).map(p => Number(p.revenue));
  const derivedRevenue = posts
    .filter(p => p.revenue == null && p.spend != null && p.roas != null)
    .map(p => Number(p.spend) * Number(p.roas));
  const revenueValues = [...directRevenue, ...derivedRevenue];
  const revenue = revenueValues.length ? revenueValues.reduce((total, value) => total + value, 0) : null;
  const conversionSpend = posts
    .filter(p => p.revenue != null || p.roas != null)
    .reduce((total, post) => total + Number(post.spend || 0), 0);

  return {
    impressions_total: impressions,
    reach_total: reach,
    frequency: reach ? Number((impressions / reach).toFixed(2)) : null,
    engagement_total: engagement,
    avg_er: reach ? Number((engagement / reach * 100).toFixed(1)) : null,
    link_clicks_total: linkClicks,
    link_ctr: impressions ? Number((linkClicks / impressions * 100).toFixed(2)) : null,
    purchases: purchaseValues.length ? purchaseValues.reduce((total, value) => total + value, 0) : null,
    revenue,
    conversion_spend: conversionSpend || null,
    revenue_source: directRevenue.length && derivedRevenue.length ? 'mixed' : directRevenue.length ? 'meta_action_values' : derivedRevenue.length ? 'calculated_from_roas' : null,
    spend_total: spend || null,
    cpm: spend && reach ? Number((spend / reach * 1000).toFixed(0)) : null,
    cpe: spend && engagement ? Number((spend / engagement).toFixed(2)) : null,
    roas: revenue != null && conversionSpend ? Number((revenue / conversionSpend).toFixed(2)) : null,
    roi: revenue != null && conversionSpend ? Number(((revenue - conversionSpend) / conversionSpend * 100).toFixed(1)) : null,
  };
}

function buildInsights(data) {
  const out = [];
  const fp = [...data.format_perf].sort((a, b) => b.ER - a.ER);
  if (fp.length >= 2) out.push(`${fp[0].format} ทำ ER สูงสุด ${fp[0].ER}% (เทียบ ${fp[fp.length - 1].format} ${fp[fp.length - 1].ER}%)`);
  const topCorr = data.correlations.filter(c => Math.abs(c.value) >= 0.3).slice(0, 2);
  topCorr.forEach(c => out.push(`${c.name}: correlation ${c.value > 0 ? '+' : ''}${c.value} กับ ER`));
  data.creative_patterns.slice(0, 2).forEach(p => out.push(`${p.value} — ${p.detail}`));
  if (data.overview.avg_er != null && data.baseline.ER != null) {
    const cmp = data.overview.avg_er > data.baseline.ER ? 'สูงกว่า' : 'ใกล้เคียง';
    out.push(`ER เฉลี่ย ${data.overview.avg_er}% ${cmp} baseline ${data.baseline.ER}%`);
  }
  return out;
}

function buildHealth(p, baseline, er, saveRate, shareRate) {
  const rows = [];
  const judge = (val, base, mult = 0.5) => {
    if (val == null || base == null) return 'na';
    if (val >= base) return 'good';
    if (val >= base * mult) return 'warn';
    return 'bad';
  };
  rows.push({ status: judge(er, baseline.ER), text: er != null && baseline.ER ? `ER ${er.toFixed(1)}% · ${(er / baseline.ER).toFixed(1)}× baseline` : 'ER N/A' });
  const ss = (saveRate || 0) + (shareRate || 0);
  const ssBase = (baseline.save || 0) + (baseline.share || 0);
  rows.push({ status: judge(ss, ssBase), text: `Save+Share ${ss.toFixed(2)}% (baseline ${ssBase.toFixed(2)}%)` });
  if (p.frequency != null) rows.push({ status: p.frequency > FREQ_TARGET ? 'warn' : 'good', text: `Frequency ${p.frequency.toFixed(2)} (target ≤ ${FREQ_TARGET})` });
  if (p.hide_post != null && p.reach) {
    const hr = p.hide_post / p.reach * 100;
    const base = (baseline.hide_rate || 0.08) * 1.5;
    rows.push({ status: hr <= base ? 'good' : 'warn', text: `Hide rate ${hr.toFixed(3)}% (baseline ${(baseline.hide_rate ?? 0).toFixed(3)}%)` });
  }
  if (p.sentiment != null) rows.push({ status: p.sentiment > 0.3 ? 'good' : p.sentiment >= 0 ? 'warn' : 'bad', text: `Comment sentiment ${p.sentiment >= 0 ? '+' : ''}${p.sentiment}` });
  return rows;
}

function buildRecommendations(p, er) {
  const recs = { now: [], next: [], long: [] };
  const paid = p.type !== 'organic';
  if (paid && p.frequency != null && p.frequency > 2.5) recs.now.push(`⚠️ Frequency ${p.frequency.toFixed(2)} เกิน 2.5 — ขยาย audience หรือหยุดแอด`);
  else if (paid && p.frequency != null && p.frequency > FREQ_TARGET) recs.now.push(`Frequency ${p.frequency.toFixed(2)} เริ่มสูง — ตั้ง cap ≤ 2.5`);
  if (paid && p.cpe != null) recs.now.push(`CPE ฿${p.cpe} — เทียบ peers objective เดียวกันก่อนปรับ budget`);
  if (p.grade === 'F' && paid) recs.now.push('Grade F + paid → หยุดแอด รอ audience reset ก่อน reactivate');

  recs.next.push(`ใช้ format ${p.format} ที่ได้ผลในเพจนี้`);
  if (p.length && p.length < 30) recs.next.push('คงความยาววิดีโอ < 30 วินาที (sweet spot)');
  recs.next.push('โพสต์ช่วง peak (ดู heatmap ใน Overview)');

  recs.long.push('Rotate creative ทุก 7–10 วันกัน frequency fatigue');
  if (p.grade === 'A' || p.grade === 'B') recs.long.push('Repurpose โพสต์นี้เป็น format อื่นต่อยอด audience ที่ save ไว้');
  recs.long.push('A/B test: hook ตัวเลข vs คำถาม ใน format เดียวกัน');
  return recs;
}

const WorkspaceSidebar = ({ view, setView, onLogout, canLogout }) => {
  const items = [
    { id: 'report', label: 'Facebook Performance', icon: BarChart3 },
    { id: 'portfolio', label: 'Brands & projects', icon: FolderKanban },
    { id: 'sources', label: 'Data sources', icon: Database },
  ];
  const planned = [
    { label: 'Saved reports', icon: Layers3 },
    { label: 'Metric library', icon: FileSpreadsheet },
  ];

  return (
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="workspace-brand">
        <div className="brand-mark" aria-hidden="true">RA</div>
        <div>
          <div className="brand-name">Report Analysis</div>
          <div className="brand-subtitle">Marketing intelligence</div>
        </div>
      </div>

      <nav className="workspace-nav">
        <div className="nav-group-name">Workspace</div>
        {items.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-label={item.label} onClick={() => setView(item.id)}>
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}

        <div className="nav-group-name nav-group-spaced">Coming next</div>
        {planned.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.label} className="nav-item planned" aria-label={`${item.label} — กำลังวางแผน`} disabled>
              <Icon size={17} />
              <span>{item.label}</span>
              <span className="planned-dot" aria-label="กำลังวางแผน"></span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {canLogout && <button className="nav-item" onClick={onLogout}><LogOut size={17} /><span>ออกจากระบบ</span></button>}
        <button className="nav-item planned" disabled><Settings size={17} /><span>Settings</span></button>
        <div className="workspace-version">UI foundation · v1</div>
      </div>
    </aside>
  );
};

const PeriodControl = ({ value, onChange, onApply, loading }) => {
  const today = dateInputValue(new Date());
  const invalid = !value.since || !value.until || value.since > value.until;
  const applyPreset = days => {
    const untilDate = new Date();
    const sinceDate = new Date(untilDate);
    if (days === 'month') sinceDate.setDate(1);
    else sinceDate.setDate(sinceDate.getDate() - (days - 1));
    const next = { since: dateInputValue(sinceDate), until: dateInputValue(untilDate) };
    onChange(next);
    onApply(next);
  };

  return <div className="period-control" aria-label="กำหนดช่วงเวลารายงาน">
    <div className="period-presets" aria-label="ช่วงเวลาด่วน">
      {[7, 30, 90].map(days => <button key={days} type="button" onClick={() => applyPreset(days)} disabled={loading}>{days} วัน</button>)}
      <button type="button" onClick={() => applyPreset('month')} disabled={loading}>เดือนนี้</button>
    </div>
    <div className="period-dates">
      <label><span>ตั้งแต่</span><input type="date" max={value.until || today} value={value.since} onChange={event => onChange({ since: event.target.value, until: value.until })} /></label>
      <span className="period-separator" aria-hidden="true">—</span>
      <label><span>ถึง</span><input type="date" min={value.since} max={today} value={value.until} onChange={event => onChange({ since: value.since, until: event.target.value })} /></label>
      <button className="period-apply" type="button" onClick={() => onApply(value)} disabled={loading || invalid}>{loading ? <LoaderCircle className="button-spinner" size={15} /> : <Calendar size={15} />} ใช้ช่วงเวลา</button>
    </div>
    {invalid && <div className="period-error" role="alert">วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด</div>}
  </div>;
};

const DataSourcesView = ({ loading, onRefresh, facebook, facebookNotice, onFacebookConnect, onFacebookRefresh, onFacebookDisconnect }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const clearFile = () => setSelectedFile(null);

  const connection = facebook.data?.connection;
  const pages = connection?.pages || [];
  const adAccounts = connection?.ad_accounts || [];
  const grantedScopes = connection?.granted_scopes || [];
  const declinedScopes = connection?.declined_scopes || [];
  const connectionExpired = Boolean(facebook.data?.connected && connection?.expired);
  const facebookConnected = Boolean(facebook.data?.connected && !connectionExpired);
  const sourceStatus = facebook.loading ? 'กำลังตรวจสอบ' : facebook.error ? 'เชื่อมต่อไม่ได้' : facebookConnected ? 'พร้อมเลือก scope' : 'รอเชื่อมต่อ';
  const metrics = [
    { name: 'Reach & impressions', source: 'Facebook API', status: sourceStatus },
    { name: 'Engagement & reactions', source: 'Facebook API', status: sourceStatus },
    { name: 'Spend, CPM & CPE', source: facebookConnected ? 'Meta Marketing API' : 'รอเชื่อมต่อ', status: sourceStatus },
    { name: 'Revenue & offline conversion', source: 'Excel / CSV', status: 'เพิ่มภายหลัง' },
  ];

  const connectLabel = facebook.connecting ? 'กำลังเปิด Meta' : connectionExpired ? 'เชื่อมต่อ Facebook ใหม่' : facebook.data?.configured ? 'เชื่อมต่อ Facebook' : 'รอการตั้งค่า Meta App';

  return (
    <section className="sources-view" aria-labelledby="sources-title">
      <div className="surface-heading">
        <div>
          <h1 id="sources-title">Data sources</h1>
          <p>ดูว่าตัวเลขในรายงานมาจากไหน และเตรียมไฟล์เสริมสำหรับ metric ที่ API ไม่มี</p>
        </div>
        <button className="secondary-action" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={16} /> {loading ? 'กำลังตรวจสอบ' : 'ตรวจสอบสถานะ'}</button>
      </div>

      <div className="source-status-band">
        <div className="source-status-primary">
          <div className="source-icon facebook"><Database size={19} /></div>
          <div>
            <div className="source-title">Facebook data</div>
            <div className="source-copy">{facebook.loading ? 'กำลังตรวจสอบการเชื่อมต่อ' : facebook.error ? 'ไม่สามารถอ่านสถานะ Facebook' : facebookConnected ? `เชื่อมต่อในชื่อ ${connection?.user?.name || 'Facebook user'}` : connectionExpired ? 'Token หมดอายุ ต้องอนุญาตผ่าน Meta ใหม่' : 'ยังไม่ได้เชื่อม Facebook Developer App'}</div>
          </div>
        </div>
        <div className={`source-health ${facebook.error || !facebookConnected ? 'failed' : ''}`}>{facebookConnected ? <CircleCheck size={16} /> : <AlertCircle size={16} />} {facebook.loading ? 'กำลังตรวจสอบ' : facebookConnected ? 'พร้อมกำหนด scope' : 'ต้องเชื่อมต่อ'}</div>
        <div className="source-stat"><span>Pages</span><strong>{facebookConnected ? pages.length : '–'}</strong></div>
        <div className="source-stat"><span>Ad accounts</span><strong>{facebookConnected ? adAccounts.length : '–'}</strong></div>
      </div>

      <section className={`connector-panel ${facebookConnected ? 'connected' : ''}`} aria-labelledby="facebook-connector-title">
        <div className="connector-intro">
          <div className="connector-symbol"><Link2 size={22} /></div>
          <div>
            <div className="connector-title-line">
              <h2 id="facebook-connector-title">Facebook Developer connection</h2>
              <span className={`connector-state ${facebookConnected ? 'ready' : ''}`}>{facebookConnected ? 'เชื่อมแล้ว' : connectionExpired ? 'Token หมดอายุ' : facebook.data?.configured ? 'พร้อมเชื่อม' : 'ต้องตั้งค่า'}</span>
            </div>
            <p>ล็อกอินผ่าน Meta OAuth เพื่อค้นหา Page และ Ad Account ที่เข้าถึงได้ ก่อนเลือก Campaign และช่วงเวลาในขั้น scope ถัดไป โดย token จะอยู่ฝั่ง backend เท่านั้น</p>
          </div>
        </div>

        {facebookNotice && <div className={`connector-notice ${facebookNotice.type}`} role="status">{facebookNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{facebookNotice.message}</span></div>}
        {facebook.error && <div className="connector-notice error" role="alert"><AlertCircle size={16} /><span>{facebook.error}</span></div>}

        {facebookConnected ? (
          <div className="connector-details">
            <div className="connection-identity">
              <span>Connected as</span>
              <strong>{connection.user?.name || 'Facebook user'}</strong>
              <small>Graph API {connection.graph_version}</small>
            </div>
            <div className="resource-summary" aria-label="Facebook resources found">
              <div><strong>{pages.length}</strong><span>Pages</span></div>
              <div><strong>{adAccounts.length}</strong><span>Ad accounts</span></div>
              <div><strong>{grantedScopes.length}</strong><span>Granted</span></div>
            </div>
            {declinedScopes.length > 0 && <div className="permission-warning"><AlertTriangle size={15} /><span>Meta ไม่อนุมัติ {declinedScopes.join(', ')} · metric ที่เกี่ยวข้องจะยังไม่ผ่าน validation</span></div>}
            <div className="connector-actions">
              <button className="secondary-action" type="button" onClick={onFacebookRefresh} disabled={facebook.connecting}><RefreshCw size={15} /> อ่านบัญชีใหม่</button>
              <button className="text-action danger" type="button" onClick={onFacebookDisconnect} disabled={facebook.connecting}><Unplug size={15} /> ยกเลิกการเชื่อม</button>
            </div>
          </div>
        ) : (
          <div className="connector-setup">
            <div className="setup-proof"><ShieldCheck size={17} /><span>ขอเฉพาะสิทธิ์อ่านรายงาน · ตรวจ OAuth state · เข้ารหัส token ก่อนบันทึก</span></div>
            {!facebook.data?.configured && (
              <div className="environment-hint">
                <span>ตั้งค่าที่ backend ก่อน</span>
                <code>FB_APP_ID</code><code>FB_APP_SECRET</code>
              </div>
            )}
            <button className="primary-action" type="button" onClick={onFacebookConnect} disabled={!facebook.data?.configured || facebook.connecting}>
              {facebook.connecting ? <LoaderCircle className="button-spinner" size={17} /> : <ExternalLink size={17} />}
              {connectLabel}
            </button>
          </div>
        )}
      </section>

      <div className="sources-layout">
        <div className="upload-panel">
          <div className="panel-heading">
            <div>
              <h2>เติมข้อมูลด้วย Excel หรือ CSV</h2>
              <p>ใช้เมื่อ API ไม่มี revenue, offline conversion หรือ metric ภายในทีม</p>
            </div>
            <FileSpreadsheet size={20} />
          </div>

          {!selectedFile ? (
            <label className="upload-zone" htmlFor="report-file-upload">
              <input id="report-file-upload" type="file" accept=".xlsx,.xls,.csv" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
              <span className="upload-icon"><Upload size={21} /></span>
              <strong>เลือกไฟล์จากเครื่อง</strong>
              <span>รองรับ .xlsx, .xls และ .csv · ระบบจะยังไม่รวมข้อมูลจนกว่าจะยืนยัน mapping</span>
            </label>
          ) : (
            <div className="selected-file" role="status">
              <div className="file-icon"><FileSpreadsheet size={22} /></div>
              <div className="file-details">
                <strong>{selectedFile.name}</strong>
                <span>{(selectedFile.size / 1024).toFixed(1)} KB · พร้อมเข้าสู่ขั้นตอน column mapping</span>
              </div>
              <button className="icon-action" onClick={clearFile} aria-label="นำไฟล์ออก"><X size={17} /></button>
            </div>
          )}

          <div className="mapping-note">
            <AlertCircle size={16} />
            <span>รอบนี้เป็น UI foundation: ไฟล์ยังไม่ถูกส่งเข้า backend หรือบันทึกไว้ที่ใด</span>
          </div>
        </div>

        <div className="coverage-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Metric coverage</h2>
              <p>แหล่งข้อมูลที่ใช้กับรายงานปัจจุบัน</p>
            </div>
          </div>
          <div className="coverage-list">
            {metrics.map(metric => (
              <div className="coverage-row" key={metric.name}>
                <div><strong>{metric.name}</strong><span>{metric.source}</span></div>
                <span className={`coverage-status ${metric.status === 'พร้อมใช้' ? 'ready' : metric.status === 'พร้อมเลือก scope' ? 'scoped' : metric.status === 'เชื่อมต่อไม่ได้' ? 'failed' : ''}`}>{metric.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const PortfolioView = ({ portfolio, selectedProjectId, navigateRequest, onNavigationComplete, onSelectProject, onPortfolioChange, onSessionExpiry, onOpenReport }) => {
  const snapshot = portfolio.data;
  const brands = snapshot?.brands || [];
  const projects = snapshot?.projects || [];
  const periods = snapshot?.periods || [];
  const campaigns = snapshot?.campaigns || [];
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [openProjectId, setOpenProjectId] = useState(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  const [scopeReady, setScopeReady] = useState(false);
  const [stage, setStage] = useState('brand');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [brandForm, setBrandForm] = useState({ name: '', code: '' });
  const [projectForm, setProjectForm] = useState({ name: '', description: '', brand_ids: [], reporting_mode: 'monthly' });
  const [periodForm, setPeriodForm] = useState(() => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { project_id: '', label: today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }), date_from: dateInputValue(first), date_to: dateInputValue(last), cadence: 'monthly' };
  });
  const [campaignForm, setCampaignForm] = useState({ project_id: '', source: 'facebook', source_account_id: '', source_campaign_id: '', name: '', brand_ids: [] });

  useEffect(() => {
    if (!campaignForm.project_id && projects[0]) {
      setCampaignForm(current => ({ ...current, project_id: projects[0].id, brand_ids: projects[0].brand_ids }));
    }
    if (!periodForm.project_id && projects[0]) {
      setPeriodForm(current => ({ ...current, project_id: projects[0].id }));
    }
  }, [projects, campaignForm.project_id]);

  useEffect(() => {
    if (!navigateRequest?.projectId || !projects.length) return;
    const project = projects.find(item => item.id === navigateRequest.projectId);
    if (!project) return;
    setSelectedBrandId(project.brand_ids[0] || null);
    setOpenProjectId(project.id);
    setSelectedPeriodId(navigateRequest.periodId || null);
    setSelectedCampaignIds(navigateRequest.campaignIds || []);
    setScopeReady(Boolean(navigateRequest.periodId));
    onSelectProject(project.id);
    onNavigationComplete();
  }, [navigateRequest, projects, onNavigationComplete, onSelectProject]);

  const toggleId = (list, id) => list.includes(id) ? list.filter(item => item !== id) : [...list, id];
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      let next;
      if (stage === 'brand') {
        next = await createBrand({ name: brandForm.name, code: brandForm.code || null });
        setBrandForm({ name: '', code: '' });
      } else if (stage === 'project') {
        next = await createProject({ ...projectForm, description: projectForm.description || null });
        setProjectForm({ name: '', description: '', brand_ids: [], reporting_mode: 'monthly' });
      } else if (stage === 'period') {
        next = await createPeriod(periodForm);
      } else {
        next = await createCampaign(campaignForm);
        setCampaignForm(current => ({ ...current, source_account_id: '', source_campaign_id: '', name: '' }));
      }
      onPortfolioChange(next);
    } catch (err) {
      if (!onSessionExpiry(err)) setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedCampaignProject = projects.find(project => project.id === campaignForm.project_id);
  const eligibleBrands = brands.filter(brand => selectedCampaignProject?.brand_ids.includes(brand.id));
  const selectedBrand = brands.find(brand => brand.id === selectedBrandId) || null;
  const brandProjects = selectedBrand ? projects.filter(project => project.brand_ids.includes(selectedBrand.id)) : [];
  const openProject = projects.find(project => project.id === openProjectId) || null;
  const openProjectPeriods = openProject ? periods.filter(period => period.project_id === openProject.id) : [];
  const openProjectCampaigns = openProject ? campaigns.filter(campaign => campaign.project_id === openProject.id) : [];
  const selectedPeriod = openProjectPeriods.find(period => period.id === selectedPeriodId) || null;
  const accountGroups = openProjectCampaigns.reduce((groups, campaign) => {
    const key = `${campaign.source}:${campaign.source_account_id}`;
    groups[key] ||= { source: campaign.source, accountId: campaign.source_account_id, campaigns: [] };
    groups[key].campaigns.push(campaign);
    return groups;
  }, {});
  const reportingModeLabel = { monthly: 'รายเดือน', campaign: 'ตาม Campaign', continuous: 'ต่อเนื่อง' };

  const openBrand = brand => { setSelectedBrandId(brand.id); setOpenProjectId(null); setSelectedPeriodId(null); setSelectedCampaignIds([]); setScopeReady(false); };
  const openProjectDetail = project => { setOpenProjectId(project.id); setSelectedPeriodId(null); setSelectedCampaignIds([]); setScopeReady(false); onSelectProject(project.id); };
  const backToBrands = () => { setSelectedBrandId(null); setOpenProjectId(null); setSelectedPeriodId(null); setSelectedCampaignIds([]); setScopeReady(false); };
  const backToProjects = () => { setOpenProjectId(null); setSelectedPeriodId(null); setSelectedCampaignIds([]); setScopeReady(false); };
  const choosePeriod = period => {
    setSelectedPeriodId(period.id);
    setSelectedCampaignIds([]);
  };
  const toggleCampaign = campaignId => setSelectedCampaignIds(current => current.includes(campaignId) ? current.filter(id => id !== campaignId) : [...current, campaignId]);
  const workflowStep = !selectedBrand ? 0 : !openProject ? 1 : scopeReady ? 3 : 2;
  const workflowSteps = ['Brand', 'Project', 'Period', 'Campaign'];
  const goToWorkflowStep = index => {
    if (index === 0) backToBrands();
    if (index === 1 && selectedBrand) backToProjects();
    if (index === 2 && openProject) setScopeReady(false);
  };

  if (portfolio.loading) return <div className="loading-state"><LoaderCircle size={18} /> กำลังอ่านโครงสร้าง workspace...</div>;
  if (portfolio.error) return <div className="error-state"><AlertCircle size={18} /><div><strong>อ่าน Portfolio ไม่สำเร็จ</strong><span>{portfolio.error}</span></div></div>;

  return (
    <section className="portfolio-view brand-first" aria-labelledby="portfolio-title">
      <div className="surface-heading">
        <div>
          <h1 id="portfolio-title">{openProject ? openProject.name : selectedBrand ? selectedBrand.name : 'Brand dashboard'}</h1>
          <p>{openProject ? 'เลือกรอบรายงานและตรวจว่าข้อมูลมาจากบัญชีหรือ Campaign ใด ก่อนเข้าสู่การวิเคราะห์' : selectedBrand ? 'เลือก Project ของแบรนด์นี้ โดย Project หนึ่งสามารถทำงานร่วมกับหลายแบรนด์ได้' : 'เริ่มจากแบรนด์ แล้วไล่ลงไปยัง Project, รอบรายงาน และ Campaign จากหลายบัญชี'}</p>
        </div>
        <div className="portfolio-counts" aria-label="Portfolio totals"><span>{brands.length} brands</span><span>{projects.length} projects</span><span>{periods.length} periods</span><span>{new Set(campaigns.map(item => `${item.source}:${item.source_account_id}`)).size} accounts</span></div>
      </div>

      {(selectedBrand || openProject) && <nav className="portfolio-breadcrumb" aria-label="Portfolio hierarchy"><button type="button" onClick={backToBrands}>Brands</button><ChevronRight size={13} />{selectedBrand && <button type="button" onClick={backToProjects}>{selectedBrand.name}</button>}{openProject && <><ChevronRight size={13} /><span>{openProject.name}</span></>}</nav>}

      <nav className="workflow-stepper" aria-label="ขั้นตอนสร้างรายงาน">
        {workflowSteps.map((label, index) => <React.Fragment key={label}>
          {index > 0 && <span className={`workflow-line ${index <= workflowStep ? 'complete' : ''}`} aria-hidden="true" />}
          <button type="button" className={index === workflowStep ? 'active' : index < workflowStep ? 'complete' : ''} disabled={index > workflowStep} onClick={() => index < workflowStep && goToWorkflowStep(index)} aria-current={index === workflowStep ? 'step' : undefined}>
            <span>{index < workflowStep ? <Check size={13} /> : index + 1}</span>
            <strong>{label}</strong>
          </button>
        </React.Fragment>)}
      </nav>

      <div className="portfolio-home-layout">
        <div className="portfolio-browser">
          {!selectedBrand && !openProject && (
            !brands.length ? <div className="portfolio-empty"><FolderKanban size={24} /><strong>ยังไม่มี Brand</strong><span>เพิ่ม Brand แรกจากแผงด้านขวา แล้วระบบจะใช้เป็นหน้าเริ่มต้นของ Workspace</span></div> : <div className="brand-card-grid">{brands.map((brand, index) => {
              const relatedProjects = projects.filter(project => project.brand_ids.includes(brand.id));
              const relatedProjectIds = new Set(relatedProjects.map(project => project.id));
              const relatedPeriods = periods.filter(period => relatedProjectIds.has(period.project_id));
              const relatedCampaigns = campaigns.filter(campaign => campaign.brand_ids.includes(brand.id));
              const accounts = new Set(relatedCampaigns.map(campaign => `${campaign.source}:${campaign.source_account_id}`));
              return <button className="brand-card" type="button" key={brand.id} onClick={() => openBrand(brand)}>
                <span className="brand-card-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="brand-card-head"><strong>{brand.name}</strong><small>{brand.code || 'ไม่มีรหัสย่อ'}</small></span>
                <span className="brand-card-stats"><span><strong>{relatedProjects.length}</strong> Projects</span><span><strong>{relatedPeriods.length}</strong> Periods</span><span><strong>{accounts.size}</strong> Accounts</span></span>
                <span className="brand-card-action">เปิดพื้นที่แบรนด์ <ChevronRight size={15} /></span>
              </button>;
            })}</div>
          )}

          {selectedBrand && !openProject && <>
            <button className="back-action" type="button" onClick={backToBrands}><ArrowLeft size={15} /> กลับไปทุกแบรนด์</button>
            {!brandProjects.length ? <div className="portfolio-empty"><FolderKanban size={24} /><strong>แบรนด์นี้ยังไม่มี Project</strong><span>เลือกแท็บ Project ทางขวาและเพิ่มแบรนด์นี้เข้าไปใน Project ใหม่</span></div> : <div className="project-card-list">{brandProjects.map(project => {
              const projectPeriods = periods.filter(period => period.project_id === project.id);
              const projectCampaigns = campaigns.filter(campaign => campaign.project_id === project.id);
              const projectAccounts = new Set(projectCampaigns.map(campaign => `${campaign.source}:${campaign.source_account_id}`));
              const projectBrands = brands.filter(brand => project.brand_ids.includes(brand.id));
              return <button className={`project-card ${selectedProjectId === project.id ? 'selected' : ''}`} type="button" key={project.id} onClick={() => openProjectDetail(project)}>
                <span className="project-card-main"><strong>{project.name}</strong><small>{project.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</small><span>{projectBrands.map(brand => brand.name).join(' · ')}</span></span>
                <span className="project-mode"><CalendarRange size={15} /> {reportingModeLabel[project.reporting_mode]}</span>
                <span className="project-card-stats"><span><strong>{projectPeriods.length}</strong> รอบรายงาน</span><span><strong>{projectAccounts.size}</strong> บัญชี</span><span><strong>{projectCampaigns.length}</strong> Campaigns</span></span>
                <ChevronRight size={17} />
              </button>;
            })}</div>}
          </>}

          {openProject && <>
            <button className="back-action" type="button" onClick={scopeReady ? () => setScopeReady(false) : backToProjects}><ArrowLeft size={15} /> {scopeReady ? 'กลับไปเลือก Period' : 'กลับไป Projects'}</button>
            {!scopeReady && <section className="project-workbench" aria-labelledby="periods-heading">
              <div className="workbench-heading"><div><h2 id="periods-heading">รอบรายงาน</h2><p>แต่ละรอบใช้ช่วงวันที่ของตัวเอง แต่ยังเทียบย้อนหลังภายใน Project เดิมได้</p></div><span>{reportingModeLabel[openProject.reporting_mode]}</span></div>
              {!openProjectPeriods.length ? <div className="compact-empty">ยังไม่มีรอบรายงาน · เพิ่ม Period จากแผงด้านขวา</div> : <div className="period-ledger">{openProjectPeriods.map(period => <button className={selectedPeriodId === period.id ? 'selected' : ''} type="button" key={period.id} onClick={() => choosePeriod(period)}><CalendarRange size={17} /><span><strong>{period.label}</strong><small>{period.date_from} — {period.date_to}</small></span><span className={`period-state ${period.status}`}>{period.status}</span>{selectedPeriodId === period.id ? <Check size={15} /> : <ChevronRight size={15} />}</button>)}</div>}
              <div className="workflow-actions"><span>{selectedPeriod ? `เลือก ${selectedPeriod.label} แล้ว` : 'เลือกรอบรายงานเพื่อไปกำหนด Campaign'}</span><button className="primary-action" type="button" disabled={!selectedPeriod} onClick={() => setScopeReady(true)}>ถัดไป: เลือก Campaign <ArrowRight size={15} /></button></div>
            </section>}

            {scopeReady && <section className="project-workbench" aria-labelledby="accounts-heading">
              <div className="workbench-heading"><div><h2 id="accounts-heading">Data scope</h2><p>{selectedPeriod ? `เลือกบัญชีและ Campaign สำหรับ ${selectedPeriod.label}` : 'เลือก Period ก่อน แล้วจึงกำหนดบัญชีและ Campaign ที่จะใช้ในรายงาน'}</p></div><span>{selectedCampaignIds.length} selected</span></div>
              {!openProjectCampaigns.length ? <div className="compact-empty">ยังไม่มี Campaign binding · เพิ่มจากแผงด้านขวา</div> : <><div className="account-ledger">{Object.values(accountGroups).map(group => <div className="account-row" key={`${group.source}:${group.accountId}`}><div className="account-identity"><Cable size={17} /><span><strong>{group.source === 'facebook' ? 'Facebook Ads' : 'File import'}</strong><small>{group.accountId}</small></span></div><div className="account-campaigns selectable">{group.campaigns.map(campaign => <label key={campaign.id}><input type="checkbox" checked={selectedCampaignIds.includes(campaign.id)} onChange={() => toggleCampaign(campaign.id)} /><span>{campaign.name}<small>{campaign.source_campaign_id}</small></span></label>)}</div></div>)}</div><div className="scope-submit"><button className="secondary-action" type="button" onClick={() => setScopeReady(false)}><ArrowLeft size={15} /> ย้อนกลับ</button><span>ระบบจะส่ง Project, Period และ {selectedCampaignIds.length} Campaigns ไปตรวจที่ backend</span><button className="primary-action" type="button" disabled={!selectedCampaignIds.length} onClick={() => onOpenReport({ since: selectedPeriod.date_from, until: selectedPeriod.date_to, projectId: openProject.id, periodId: selectedPeriod.id, campaignIds: selectedCampaignIds })}><BarChart3 size={16} /> เปิดรายงานตาม scope</button></div></>}
            </section>}

            <section className="future-connectors" aria-label="Future advertising connectors"><div><strong>Google Ads</strong><span>ใช้ Account → Campaign → canonical metrics ชุดเดียวกัน</span><small>Planned</small></div><div><strong>TikTok Ads</strong><span>ใช้ Advertiser Account → Campaign → canonical metrics ชุดเดียวกัน</span><small>Planned</small></div></section>
          </>}
        </div>

        <aside className="portfolio-setup" aria-labelledby="portfolio-setup-title">
          <div className="panel-heading compact"><div><h2 id="portfolio-setup-title">เพิ่มขอบเขตงาน</h2><p>สร้างตามลำดับ Brand → Project → Campaign</p></div></div>
          <div className="setup-tabs" role="tablist" aria-label="Portfolio setup steps">
            {[['brand', 'Brand'], ['project', 'Project'], ['period', 'Period'], ['campaign', 'Campaign']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={stage === id} className={stage === id ? 'active' : ''} onClick={() => { setStage(id); setFormError(null); if (id === 'project' && selectedBrand) setProjectForm(current => ({ ...current, brand_ids: current.brand_ids.includes(selectedBrand.id) ? current.brand_ids : [...current.brand_ids, selectedBrand.id] })); if (id === 'period' && openProject) setPeriodForm(current => ({ ...current, project_id: openProject.id })); if (id === 'campaign' && openProject) setCampaignForm(current => ({ ...current, project_id: openProject.id, brand_ids: openProject.brand_ids })); }} disabled={(id === 'project' && !brands.length) || ((id === 'period' || id === 'campaign') && !projects.length)}>{label}</button>
            ))}
          </div>

          <form className="portfolio-form" onSubmit={submit}>
            {stage === 'brand' && <>
              <label>ชื่อแบรนด์<input required maxLength="120" value={brandForm.name} onChange={event => setBrandForm({ ...brandForm, name: event.target.value })} placeholder="เช่น Northwind" /></label>
              <label>รหัสย่อ <span>ไม่บังคับ</span><input maxLength="40" value={brandForm.code} onChange={event => setBrandForm({ ...brandForm, code: event.target.value })} placeholder="NW" /></label>
            </>}
            {stage === 'project' && <>
              <label>ชื่อโปรเจกต์<input required maxLength="160" value={projectForm.name} onChange={event => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="Q3 Campaign Review" /></label>
              <label>รูปแบบรายงาน<select value={projectForm.reporting_mode} onChange={event => setProjectForm({ ...projectForm, reporting_mode: event.target.value })}><option value="monthly">รายเดือน</option><option value="campaign">ตาม Campaign</option><option value="continuous">ต่อเนื่อง</option></select></label>
              <fieldset><legend>แบรนด์ในโปรเจกต์</legend>{brands.map(brand => <label className="check-row" key={brand.id}><input type="checkbox" checked={projectForm.brand_ids.includes(brand.id)} onChange={() => setProjectForm({ ...projectForm, brand_ids: toggleId(projectForm.brand_ids, brand.id) })} /><span>{brand.name}</span></label>)}</fieldset>
              <label>รายละเอียด <span>ไม่บังคับ</span><textarea maxLength="1000" rows="3" value={projectForm.description} onChange={event => setProjectForm({ ...projectForm, description: event.target.value })} /></label>
            </>}
            {stage === 'period' && <>
              <label>โปรเจกต์<select required value={periodForm.project_id} onChange={event => setPeriodForm({ ...periodForm, project_id: event.target.value })}><option value="">เลือกโปรเจกต์</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label>ชื่อรอบรายงาน<input required maxLength="120" value={periodForm.label} onChange={event => setPeriodForm({ ...periodForm, label: event.target.value })} /></label>
              <label>รูปแบบ<select value={periodForm.cadence} onChange={event => setPeriodForm({ ...periodForm, cadence: event.target.value })}><option value="monthly">รายเดือน</option><option value="custom">กำหนดเอง</option></select></label>
              <div className="portfolio-date-pair"><label>ตั้งแต่<input required type="date" value={periodForm.date_from} max={periodForm.date_to} onChange={event => setPeriodForm({ ...periodForm, date_from: event.target.value })} /></label><label>ถึง<input required type="date" value={periodForm.date_to} min={periodForm.date_from} onChange={event => setPeriodForm({ ...periodForm, date_to: event.target.value })} /></label></div>
            </>}
            {stage === 'campaign' && <>
              <label>โปรเจกต์<select required value={campaignForm.project_id} onChange={event => { const project = projects.find(item => item.id === event.target.value); setCampaignForm({ ...campaignForm, project_id: event.target.value, brand_ids: project?.brand_ids || [] }); }}><option value="">เลือกโปรเจกต์</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label>แหล่งข้อมูล<select value={campaignForm.source} onChange={event => setCampaignForm({ ...campaignForm, source: event.target.value })}><option value="facebook">Facebook API</option><option value="file">Excel / CSV</option></select></label>
              <label>ชื่อ Campaign<input required maxLength="200" value={campaignForm.name} onChange={event => setCampaignForm({ ...campaignForm, name: event.target.value })} /></label>
              <label>Account ID<input required maxLength="128" value={campaignForm.source_account_id} onChange={event => setCampaignForm({ ...campaignForm, source_account_id: event.target.value })} /></label>
              <label>Campaign ID<input required maxLength="128" value={campaignForm.source_campaign_id} onChange={event => setCampaignForm({ ...campaignForm, source_campaign_id: event.target.value })} /></label>
              <fieldset><legend>แบรนด์ที่ Campaign นี้เกี่ยวข้อง</legend>{eligibleBrands.map(brand => <label className="check-row" key={brand.id}><input type="checkbox" checked={campaignForm.brand_ids.includes(brand.id)} onChange={() => setCampaignForm({ ...campaignForm, brand_ids: toggleId(campaignForm.brand_ids, brand.id) })} /><span>{brand.name}</span></label>)}</fieldset>
            </>}
            {formError && <div className="inline-error" role="alert"><AlertCircle size={15} />{formError}</div>}
            <button className="primary-action" type="submit" disabled={saving || (stage === 'project' && !projectForm.brand_ids.length) || (stage === 'campaign' && !campaignForm.brand_ids.length)}>{saving ? <LoaderCircle className="button-spinner" size={16} /> : <Plus size={16} />} เพิ่ม {stage}</button>
          </form>
        </aside>
      </div>
    </section>
  );
};

const ELEMENT_KINDS = {
  text: { label: 'Text box', icon: TextQuote },
  comment: { label: 'Comment', icon: MessageSquareText },
  key_takeaway: { label: 'Key takeaway', icon: Lightbulb },
  next_step: { label: 'Next step', icon: ListChecks },
};

const ReportElementsPanel = ({ project, onOpenPortfolio, onSessionExpiry }) => {
  const [state, setState] = useState({ loading: false, error: null, elements: [] });
  const [form, setForm] = useState({ kind: 'comment', title: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ title: '', content: '' });

  const loadElements = () => {
    if (!project) return;
    setState(current => ({ ...current, loading: true, error: null }));
    fetchReportElements(project.id)
      .then(data => setState({ loading: false, error: null, elements: data.elements || [] }))
      .catch(err => { if (!onSessionExpiry(err)) setState(current => ({ ...current, loading: false, error: err.message })); });
  };
  useEffect(loadElements, [project?.id]);

  const submit = async event => {
    event.preventDefault(); setSaving(true); setState(current => ({ ...current, error: null }));
    try {
      const element = await createReportElement(project.id, { report_key: 'working', kind: form.kind, title: form.title || null, content: form.content, position: state.elements.length });
      setState(current => ({ ...current, elements: [...current.elements, element] }));
      setForm(current => ({ ...current, title: '', content: '' }));
    } catch (err) { if (!onSessionExpiry(err)) setState(current => ({ ...current, error: err.message })); }
    finally { setSaving(false); }
  };
  const patchElement = async (element, changes) => {
    try {
      const updated = await updateReportElement(project.id, element.id, { expected_version: element.version, ...changes });
      setState(current => ({ ...current, elements: current.elements.map(item => item.id === updated.id ? updated : item), error: null }));
      setEditingId(null);
    } catch (err) { if (!onSessionExpiry(err)) setState(current => ({ ...current, error: err.message })); }
  };
  const removeElement = async element => {
    if (!window.confirm('ลบข้อความนี้ออกจาก Project?')) return;
    try {
      await deleteReportElement(project.id, element.id);
      setState(current => ({ ...current, elements: current.elements.filter(item => item.id !== element.id), error: null }));
    } catch (err) { if (!onSessionExpiry(err)) setState(current => ({ ...current, error: err.message })); }
  };

  return <section id="report-elements" className="report-elements" aria-labelledby="report-elements-title">
    <div className="elements-heading"><div><div className="section-kicker">Project workspace</div><h2 id="report-elements-title">Working notes</h2><p>เพิ่มบริบทที่ตัวเลขบอกไม่ได้ และเก็บ Next step ไว้กับ Project นี้โดยตรง</p></div>{project && <span className="project-context-chip">{project.name}</span>}</div>
    {!project ? <div className="elements-locked"><FolderKanban size={21} /><div><strong>เลือก Project ก่อนเพิ่มข้อความ</strong><span>การบังคับ scope ช่วยป้องกันโน้ตของหลายแบรนด์ปะปนกัน</span></div><button className="secondary-action" type="button" onClick={onOpenPortfolio}>ตั้งค่า Project</button></div> : <>
      <form className="element-composer" onSubmit={submit}>
        <div className="kind-selector" role="radiogroup" aria-label="ชนิดข้อความ">{Object.entries(ELEMENT_KINDS).map(([id, config]) => { const Icon = config.icon; return <button key={id} type="button" role="radio" aria-checked={form.kind === id} className={form.kind === id ? 'active' : ''} onClick={() => setForm({ ...form, kind: id })}><Icon size={15} />{config.label}</button>; })}</div>
        <input aria-label="หัวข้อข้อความ" maxLength="160" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="หัวข้อ (ไม่บังคับ)" />
        <textarea id="analysis-comment-input" aria-label="เนื้อหาข้อความ" required maxLength="12000" rows="4" value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder="เขียนข้อสังเกต คีย์สำคัญ หรือสิ่งที่ต้องทำต่อ..." />
        <div className="composer-footer"><span>{form.content.length.toLocaleString()} / 12,000</span><button className="primary-action" type="submit" disabled={saving || !form.content.trim()}>{saving ? <LoaderCircle className="button-spinner" size={16} /> : <Plus size={16} />} เพิ่มในรายงาน</button></div>
      </form>
      {state.error && <div className="inline-error" role="alert"><AlertCircle size={15} />{state.error}<button type="button" onClick={loadElements}>โหลดใหม่</button></div>}
      {state.loading ? <div className="element-loading"><LoaderCircle className="button-spinner" size={16} /> กำลังโหลด Working notes...</div> : !state.elements.length ? <div className="elements-empty">ยังไม่มีข้อความใน Project นี้ — เริ่มจากข้อสังเกตที่ต้องใช้ประกอบการตัดสินใจ</div> : <div className="element-list">{state.elements.map(element => {
        const config = ELEMENT_KINDS[element.kind]; const Icon = config.icon; const editing = editingId === element.id;
        return <article className={`element-row ${element.status === 'done' ? 'done' : ''}`} key={element.id}>
          <div className="element-kind"><Icon size={16} /><span>{config.label}</span></div>
          <div className="element-body">{editing ? <><input aria-label="แก้หัวข้อ" maxLength="160" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /><textarea aria-label="แก้เนื้อหา" required maxLength="12000" rows="3" value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} /></> : <>{element.title && <h3>{element.title}</h3>}<p>{element.content}</p></>}</div>
          <div className="element-actions">{element.kind === 'next_step' && <button className="icon-action" type="button" title={element.status === 'done' ? 'เปิดอีกครั้ง' : 'ทำเสร็จแล้ว'} aria-label={element.status === 'done' ? 'เปิด Next step อีกครั้ง' : 'ทำเครื่องหมายว่าเสร็จ'} onClick={() => patchElement(element, { status: element.status === 'done' ? 'open' : 'done' })}>{element.status === 'done' ? <Check size={16} /> : <CircleCheck size={16} />}</button>}{editing ? <button className="icon-action" type="button" aria-label="บันทึกการแก้ไข" disabled={!draft.content.trim()} onClick={() => patchElement(element, { title: draft.title, content: draft.content })}><Save size={16} /></button> : <button className="icon-action" type="button" aria-label="แก้ข้อความ" onClick={() => { setEditingId(element.id); setDraft({ title: element.title || '', content: element.content }); }}><Pencil size={15} /></button>}<button className="icon-action danger" type="button" aria-label="ลบข้อความ" onClick={() => removeElement(element)}><Trash2 size={15} /></button></div>
        </article>;
      })}</div>}
    </>}
  </section>;
};

const LoginGate = ({ loading, error, onSubmit }) => {
  const [password, setPassword] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(password);
  };

  return (
    <main className="auth-shell" style={fontStyle}>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">RA</div>
          <div>
            <div className="brand-name">Report Analysis</div>
            <div className="brand-subtitle">Marketing intelligence</div>
          </div>
        </div>

        <div className="auth-heading">
          <div className="auth-lock" aria-hidden="true"><LockKeyhole size={19} /></div>
          <h1 id="auth-title">เข้าสู่พื้นที่วิเคราะห์</h1>
          <p>ข้อมูลบัญชี โทเคน และรายงานจะเปิดให้เฉพาะผู้ที่มีรหัสผ่านของ workspace นี้</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="workspace-password">รหัสผ่าน workspace</label>
          <input
            id="workspace-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={1}
            maxLength={256}
            required
            autoFocus
            disabled={loading}
          />
          {error && <div className="auth-error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
          <button className="primary-action auth-submit" type="submit" disabled={loading || !password}>
            {loading ? <><LoaderCircle className="button-spinner" size={16} /> กำลังตรวจสอบ...</> : <><ShieldCheck size={16} /> เข้าสู่ระบบ</>}
          </button>
        </form>

        <div className="auth-note">
          <ShieldCheck size={16} />
          <span>ระบบใช้ session cookie แบบ HttpOnly และไม่ส่งรหัสผ่านไปเก็บใน browser</span>
        </div>
      </section>
    </main>
  );
};

// ============ MAIN APP ============
export default function Dashboard() {
  const [initialReport] = useState(reportStateFromLocation);
  const [view, setView] = useState(initialReport ? 'report' : 'portfolio');
  const [refreshKey, setRefreshKey] = useState(0);
  const [tier, setTier] = useState('overview');
  const [selectedPost, setSelectedPost] = useState(null);
  const [mode, setMode] = useState('combined');
  const [periodDraft, setPeriodDraft] = useState(() => initialReport || defaultPeriod());
  const [periodApplied, setPeriodApplied] = useState(() => initialReport || defaultPeriod());
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [portfolio, setPortfolio] = useState({ loading: true, error: null, data: null });
  const [selectedProjectId, setSelectedProjectId] = useState(initialReport?.projectId || null);
  const [portfolioNavigation, setPortfolioNavigation] = useState(null);
  const [deliveryNotice, setDeliveryNotice] = useState(null);
  const [facebook, setFacebook] = useState({ loading: true, connecting: false, error: null, data: null });
  const [facebookNotice, setFacebookNotice] = useState(null);
  const [auth, setAuth] = useState({ loading: true, submitting: false, error: null, configured: false, required: false, authenticated: false });
  const appReady = !auth.loading && (!auth.required || auth.authenticated);

  const handleSessionExpiry = (err) => {
    if (err?.status !== 401) return false;
    setAuth(current => ({ ...current, authenticated: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }));
    return true;
  };

  useEffect(() => {
    fetchAuthStatus()
      .then(data => setAuth({ loading: false, submitting: false, error: null, ...data }))
      .catch(() => setAuth(current => ({ ...current, loading: false, error: 'ตรวจสอบระบบล็อกอินไม่ได้ กรุณาตรวจว่า backend ทำงานอยู่' })));
  }, []);

  const loadFacebookStatus = () => {
    setFacebook(current => ({ ...current, loading: true, error: null }));
    return fetchFacebookStatus()
      .then(data => setFacebook({ loading: false, connecting: false, error: null, data }))
      .catch(err => {
        if (!handleSessionExpiry(err)) {
          setFacebook(current => ({ ...current, loading: false, connecting: false, error: err.message }));
        }
      });
  };

  useEffect(() => {
    if (!appReady) return;
    loadFacebookStatus();
    const params = new URLSearchParams(window.location.search);
    const result = params.get('facebook');
    if (result) {
      setView('sources');
      const messages = {
        connected: { type: 'success', message: 'เชื่อมต่อ Facebook สำเร็จ ระบบอ่านรายการบัญชีที่คุณเข้าถึงได้แล้ว' },
        cancelled: { type: 'error', message: 'ยกเลิกการเชื่อมต่อแล้ว คุณเริ่มใหม่ได้เมื่อพร้อม' },
        missing_callback: { type: 'error', message: 'Meta ส่งข้อมูลกลับมาไม่ครบ กรุณาเริ่มเชื่อมต่อใหม่' },
        connection_failed: { type: 'error', message: 'เชื่อมต่อไม่สำเร็จ ตรวจสิทธิ์และ Callback URL ใน Meta App แล้วลองใหม่' },
        state_mismatch: { type: 'error', message: 'คำขอเชื่อมต่อไม่ตรงกับ browser นี้หรือหมดรอบไปแล้ว กรุณาเริ่มใหม่จากปุ่มเชื่อมต่อ' },
      };
      setFacebookNotice(messages[result] || null);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [appReady]);

  useEffect(() => {
    if (!appReady) return undefined;
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetchAnalysis(periodApplied)
      .then(data => { if (alive) setState({ loading: false, error: null, data }); })
      .catch(err => {
        if (alive && !handleSessionExpiry(err)) setState({ loading: false, error: err.message, data: null });
      });
    return () => { alive = false; };
  }, [refreshKey, appReady, periodApplied]);

  const loadPortfolio = () => {
    setPortfolio(current => ({ ...current, loading: true, error: null }));
    return fetchPortfolio()
      .then(snapshot => {
        setPortfolio({ loading: false, error: null, data: snapshot });
        setSelectedProjectId(current => snapshot.projects.some(project => project.id === current) ? current : (snapshot.projects.find(project => project.status === 'active')?.id || null));
      })
      .catch(err => {
        if (!handleSessionExpiry(err)) setPortfolio(current => ({ ...current, loading: false, error: err.message }));
      });
  };

  useEffect(() => {
    if (appReady) loadPortfolio();
  }, [appReady]);

  const handleLogin = async (password) => {
    setAuth(current => ({ ...current, submitting: true, error: null }));
    try {
      await login(password);
      const status = await fetchAuthStatus();
      setAuth({ loading: false, submitting: false, error: null, ...status });
    } catch (err) {
      setAuth(current => ({ ...current, submitting: false, error: err.message }));
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setAuth(current => ({ ...current, authenticated: false, error: null }));
      setState({ loading: true, error: null, data: null });
      setPortfolio({ loading: true, error: null, data: null });
      setSelectedProjectId(null);
      setFacebook({ loading: true, connecting: false, error: null, data: null });
    }
  };

  const handleSelect = (post) => { setSelectedPost(post); setTier('post'); };
  const syncReportLocation = nextPeriod => window.history.replaceState({}, '', reportUrl(nextPeriod));
  const handlePeriodApply = nextPeriod => {
    if (!nextPeriod.since || !nextPeriod.until || nextPeriod.since > nextPeriod.until) return;
    const scopedPeriod = { ...periodApplied, ...nextPeriod };
    setSelectedPost(null);
    setTier('overview');
    setPeriodApplied(scopedPeriod);
    syncReportLocation(scopedPeriod);
    setRefreshKey(key => key + 1);
  };
  const handleOpenReportPeriod = nextPeriod => {
    setPeriodDraft(nextPeriod);
    setPeriodApplied(nextPeriod);
    setSelectedPost(null);
    setTier('overview');
    setView('report');
    setDeliveryNotice(null);
    syncReportLocation(nextPeriod);
  };
  const handleProjectSwitch = projectId => {
    setSelectedProjectId(projectId);
    setSelectedPost(null);
    setTier('overview');
    setDeliveryNotice(null);
    setPortfolioNavigation({ projectId });
    setView('portfolio');
    window.history.replaceState({}, '', window.location.pathname);
  };
  const returnToReportScope = () => {
    setPortfolioNavigation({
      projectId: periodApplied.projectId || selectedProjectId,
      periodId: periodApplied.periodId,
      campaignIds: periodApplied.campaignIds || [],
    });
    setView('portfolio');
  };
  const copyReportLink = async () => {
    try {
      await navigator.clipboard.writeText(reportUrl(periodApplied));
      setDeliveryNotice({ type: 'success', message: 'คัดลอกลิงก์แล้ว ผู้รับต้องเข้าสู่ระบบ Workspace ก่อนเปิดรายงาน' });
    } catch {
      setDeliveryNotice({ type: 'error', message: 'คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอก URL จากแถบที่อยู่' });
    }
  };
  const goPreviousTier = () => {
    if (tier === 'post') setTier('split');
    else if (tier === 'split') setTier('overview');
    else returnToReportScope();
  };
  const goNextTier = () => {
    if (tier === 'overview') setTier('split');
    else if (tier === 'split' && selectedPost) setTier('post');
  };
  const focusAnalysisComment = () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('report-elements')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById('analysis-comment-input')?.focus(), 420);
  };
  const handleFacebookConnect = async () => {
    setFacebook(current => ({ ...current, connecting: true, error: null }));
    setFacebookNotice(null);
    try {
      const authorizationUrl = await startFacebookConnection();
      window.location.assign(authorizationUrl);
    } catch (err) {
      if (!handleSessionExpiry(err)) setFacebook(current => ({ ...current, connecting: false, error: err.message }));
    }
  };
  const handleFacebookRefresh = async () => {
    setFacebook(current => ({ ...current, connecting: true, error: null }));
    try {
      await refreshFacebookConnection();
      await loadFacebookStatus();
      setFacebookNotice({ type: 'success', message: 'อัปเดตรายการ Page และ Ad Account จาก Meta แล้ว' });
    } catch (err) {
      if (!handleSessionExpiry(err)) setFacebook(current => ({ ...current, connecting: false, error: err.message }));
    }
  };
  const handleFacebookDisconnect = async () => {
    if (!window.confirm('ยกเลิกการเชื่อม Facebook และลบ token ที่เข้ารหัสไว้ในเครื่องนี้?')) return;
    setFacebook(current => ({ ...current, connecting: true, error: null }));
    try {
      await disconnectFacebook();
      await loadFacebookStatus();
      setFacebookNotice({ type: 'success', message: 'ยกเลิกการเชื่อมและลบ token ที่บันทึกไว้แล้ว' });
    } catch (err) {
      if (!handleSessionExpiry(err)) setFacebook(current => ({ ...current, connecting: false, error: err.message }));
    }
  };
  const handlePortfolioChange = snapshot => {
    setPortfolio({ loading: false, error: null, data: snapshot });
    setSelectedProjectId(current => snapshot.projects.some(project => project.id === current) ? current : (snapshot.projects.find(project => project.status === 'active')?.id || null));
  };
  const { loading, error, data } = state;
  const selectedProject = portfolio.data?.projects.find(project => project.id === selectedProjectId) || null;
  const viewTitles = { report: 'Facebook Performance', portfolio: 'Brands & projects', sources: 'Data workspace' };

  if (auth.loading) {
    return <main className="auth-shell" style={fontStyle}><div className="auth-loading"><LoaderCircle size={18} /> กำลังตรวจสอบพื้นที่ทำงาน...</div></main>;
  }

  if (auth.required && !auth.authenticated) {
    return <LoginGate loading={auth.submitting} error={auth.error} onSubmit={handleLogin} />;
  }

  return (
    <div className="app-shell" style={fontStyle}>
      <WorkspaceSidebar view={view} setView={setView} onLogout={handleLogout} canLogout={auth.configured} />

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <div className="workspace-context">{portfolio.data?.workspace.name || 'Marketing workspace'}</div>
            <div className="workspace-title">{viewTitles[view]}</div>
          </div>
          <div className="topbar-actions">
            {view !== 'portfolio' && (portfolio.data?.projects.length > 0 ? <label className="project-switcher"><span>Project</span><select value={selectedProjectId || ''} onChange={event => handleProjectSwitch(event.target.value)}>{portfolio.data.projects.filter(project => project.status === 'active').map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : <button className="secondary-action" type="button" onClick={() => setView('portfolio')}><FolderKanban size={15} /> ตั้งค่า Project</button>)}
            <button className="data-health-button" onClick={() => setView('sources')}>
              <span className={`health-indicator ${error ? 'error' : ''}`}></span>
              {error ? 'Data source error' : data?.demo ? 'Demo source active' : 'Sources healthy'}
            </button>
          </div>
        </header>

        <div className="workspace-content">
          {view === 'portfolio' ? (
            <PortfolioView portfolio={portfolio} selectedProjectId={selectedProjectId} navigateRequest={portfolioNavigation} onNavigationComplete={() => setPortfolioNavigation(null)} onSelectProject={setSelectedProjectId} onPortfolioChange={handlePortfolioChange} onSessionExpiry={handleSessionExpiry} onOpenReport={handleOpenReportPeriod} />
          ) : view === 'sources' ? (
            <DataSourcesView
              loading={loading}
              onRefresh={() => { setRefreshKey(key => key + 1); loadFacebookStatus(); }}
              facebook={facebook}
              facebookNotice={facebookNotice}
              onFacebookConnect={handleFacebookConnect}
              onFacebookRefresh={handleFacebookRefresh}
              onFacebookDisconnect={handleFacebookDisconnect}
            />
          ) : (
            <section className="report-surface" aria-label="Facebook performance report">
              <div className="report-header">
                <div>
                  <div className="report-title-line">
                    <h1>{data?.page?.name || 'Performance Analyzer'}</h1>
                    {data?.demo && <span className="demo-badge">Demo data</span>}
                  </div>
                  <p>
                    {data ? `${data.counts.total} posts · ${data.counts.boosted} boosted · ${data.counts.ads} pure ads · ${data.range.since} – ${data.range.until}` : 'กำลังเชื่อมต่อ backend...'}
                  </p>
                </div>
                <div className="report-header-actions">
                  <button className="secondary-action comment-jump" type="button" onClick={focusAnalysisComment}><MessageSquareText size={15} /> เพิ่มคอมเมนต์</button>
                  <div className="mode-switch" aria-label="เลือกประเภทข้อมูล">
                    {[{ id: 'combined', label: 'รวม' }, { id: 'organic', label: 'Organic' }, { id: 'paid', label: 'Paid' }].map(m => (
                      <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <PeriodControl value={periodDraft} onChange={setPeriodDraft} onApply={handlePeriodApply} loading={loading} />
              {data?.scope && <div className="scope-evidence" role="status"><ShieldCheck size={16} /><div><strong>{data.scope.project_name} · {data.scope.period_label}</strong><span>{data.scope.campaigns.length} Campaigns จาก {new Set(data.scope.campaigns.map(campaign => `${campaign.source}:${campaign.source_account_id}`)).size} accounts ผ่าน backend validation</span></div></div>}

              <section className="report-delivery" aria-label="ส่งออกรายงาน">
                <div><strong>ส่งรายงานให้ลูกค้า</strong><span>CSV สำหรับตรวจข้อมูล · Print ใช้บันทึกเป็น PDF · ลิงก์ภายในยังต้องเข้าสู่ระบบ</span></div>
                <div className="report-delivery-actions">
                  <button type="button" onClick={copyReportLink} disabled={!data}><Share2 size={15} /> คัดลอกลิงก์</button>
                  <button type="button" onClick={() => data && downloadCsv(data, mode, selectedProject)} disabled={!data}><Download size={15} /> Export CSV</button>
                  <button type="button" onClick={() => window.print()} disabled={!data}><Printer size={15} /> บันทึก PDF</button>
                </div>
              </section>
              {deliveryNotice && <div className={`delivery-notice ${deliveryNotice.type}`} role="status">{deliveryNotice.type === 'success' ? <CircleCheck size={15} /> : <AlertCircle size={15} />}<span>{deliveryNotice.message}</span></div>}

              <nav className="tier-nav" aria-label="Report depth">
                {tier !== 'overview' && (
                  <button className="tier-back" onClick={() => setTier('overview')}><ChevronLeft size={14} /> กลับ</button>
                )}
                <button className={tier === 'overview' ? 'active' : ''} onClick={() => setTier('overview')}><span>1</span> Overview</button>
                <ChevronRight className="tier-chevron" size={13} />
                <button className={tier === 'split' ? 'active' : ''} onClick={() => setTier('split')}><span>2</span> Ads vs Organic</button>
                <ChevronRight className="tier-chevron" size={13} />
                <button className={tier === 'post' ? 'active' : ''} onClick={() => selectedPost && setTier('post')} disabled={!selectedPost}>
                  <span>3</span> Post deep-dive {!selectedPost && <small>เลือกโพสต์ก่อน</small>}
                </button>
              </nav>

              <div className="report-content">
                {loading && <div className="loading-state"><RefreshCw size={18} /> กำลังโหลดข้อมูลจาก backend...</div>}
                {error && (
                  <div className="error-state">
                    <AlertCircle size={18} />
                    <div><strong>เชื่อมต่อ backend ไม่ได้</strong><span>{error} · ตรวจว่ารัน <code>uvicorn server:app --port 8000</code></span></div>
                  </div>
                )}
                {data && !loading && (
                  <>
                    {tier === 'overview' && <TierOverview data={data} mode={mode} onSelectPost={handleSelect} />}
                    {tier === 'split' && <TierAdsOrganic data={data} />}
                    {tier === 'post' && selectedPost && <TierPostDetail post={selectedPost} baseline={data.baseline} />}
                  </>
                )}
              </div>
              <nav className="report-flow-actions" aria-label="ย้อนกลับและไปต่อในรายงาน">
                <button className="secondary-action" type="button" onClick={goPreviousTier}><ArrowLeft size={15} /> {tier === 'overview' ? 'กลับไปเลือก Scope' : tier === 'split' ? 'Overview' : 'Ads vs Organic'}</button>
                <span>{tier === 'overview' ? 'ขั้นถัดไปเปรียบเทียบ Paid และ Organic' : tier === 'split' && !selectedPost ? 'เลือกโพสต์จาก Overview เพื่อเปิด Deep-dive' : tier === 'split' ? 'พร้อมดูรายละเอียดโพสต์ที่เลือก' : 'ถึงขั้นสุดท้ายของรายงานแล้ว'}</span>
                {tier !== 'post' && <button className="primary-action" type="button" onClick={goNextTier} disabled={tier === 'split' && !selectedPost}>{tier === 'overview' ? 'ถัดไป: Ads vs Organic' : 'ถัดไป: Post deep-dive'} <ArrowRight size={15} /></button>}
              </nav>
              {data && <div className="print-report" aria-hidden="true">
                <h2>Overview</h2>
                <TierOverview data={data} mode={mode} onSelectPost={() => {}} />
                <h2>Ads vs Organic</h2>
                <TierAdsOrganic data={data} />
                {selectedPost && <><h2>Post deep-dive</h2><TierPostDetail post={selectedPost} baseline={data.baseline} /></>}
              </div>}
              <ReportElementsPanel project={selectedProject} onOpenPortfolio={() => setView('portfolio')} onSessionExpiry={handleSessionExpiry} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
