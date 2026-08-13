import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Calendar, TrendingUp, AlertTriangle, CheckCircle2, AlertCircle, Copy, Trophy, Sparkles, Bolt } from 'lucide-react';
import { fetchAnalysis } from './api.js';

// ============ FORMATTERS ============
const fmt = (n) => {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
};
const fmtMoney = (n) => (n === null || n === undefined) ? 'N/A' : '฿' + (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toLocaleString());
const fmtNum = (n, d = 0) => (n === null || n === undefined) ? 'N/A' : Number(n).toFixed(d);
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

const MetricBox = ({ label, value, sub, good, warn, mini }) => (
  <div>
    <div style={{ fontSize: 10, color: '#A8A29E', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    <div style={{ fontSize: mini ? 13 : 16, fontWeight: 500, marginTop: 2, color: warn ? '#CA8A04' : 'inherit', ...monoStyle }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: good ? '#0F766E' : '#A8A29E', marginTop: 2 }}>{sub}</div>}
  </div>
);

const Row = ({ label, value, sub, good, warn }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6, borderBottom: '0.5px solid #F5F5F4' }}>
    <div>
      <div style={{ fontSize: 12, color: '#57534E' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 2 }}>{sub}</div>}
    </div>
    <div style={{ fontSize: 14, fontWeight: 500, color: good ? '#0F766E' : warn ? '#CA8A04' : 'inherit', ...monoStyle }}>{value}</div>
  </div>
);

const HealthRow = ({ status, text, last }) => {
  const cfg = {
    good: { icon: <CheckCircle2 size={16} color="#0F766E" />, color: '#0F766E', label: 'ดี' },
    warn: { icon: <AlertTriangle size={16} color="#CA8A04" />, color: '#CA8A04', label: 'เตือน' },
    bad: { icon: <AlertCircle size={16} color="#991B1B" />, color: '#991B1B', label: 'ต่ำ' },
    na: { icon: <AlertCircle size={16} color="#A8A29E" />, color: '#A8A29E', label: 'N/A' },
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
  <div style={{ background: bg, padding: '12px 14px', borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0', marginBottom: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      {icon}
      <div style={{ fontSize: 13, fontWeight: 500, color: textColor }}>{title}</div>
    </div>
    <ul style={{ fontSize: 12, color: textColor, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  </div>
);

// ============ TIER 1: OVERVIEW ============
const TierOverview = ({ data, mode, onSelectPost }) => {
  const ov = data.overview;
  const baseline = data.baseline;
  const posts = applyMode(data.posts, mode);

  const kpis = [
    { label: 'Reach', v: fmt(ov.reach_total), sub: `Organic ${fmt(ov.reach_organic)} · Paid ${fmt(ov.reach_paid)}` },
    { label: 'ER', v: ov.avg_er != null ? `${ov.avg_er}%` : 'N/A', sub: baseline.ER != null ? `baseline ${baseline.ER}%` : '' },
    { label: 'Spend', v: fmtMoney(ov.spend_total), sub: `CPM ${fmtMoney(ov.cpm)} · CPE ${ov.cpe != null ? '฿' + ov.cpe : 'N/A'}` },
    { label: 'ROAS', v: ov.roas != null ? `${ov.roas}×` : 'N/A', sub: 'conversion ads only' },
  ];

  const maxER = Math.max(...data.format_perf.map(f => f.ER), 1);
  const insights = buildInsights(data);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ flex: 1, background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#78716C', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 500, marginTop: 4, ...monoStyle }}>{k.v}</div>
            <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top performers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {posts.slice(0, 5).map(p => (
              <div key={p.id} onClick={() => onSelectPost(p)} style={{ cursor: 'pointer', display: 'flex', gap: 10, padding: 10, background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#0F766E'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E7E5E4'}>
                <div style={{ width: 36, height: 36, background: FormatBg(p.format), borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 500, color: FormatColor(p.format) }}>{p.format.slice(0, 2)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#78716C', marginBottom: 2 }}>{p.date} · {p.day}{p.topic ? <span style={{ color: '#5B21B6' }}> · {p.topic}</span> : ''}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 500, color: gradeColor(p.grade), ...monoStyle, flexShrink: 0 }}>{p.score ?? '–'}</div>
              </div>
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
                    <span>{f.format} <span style={{ color: '#A8A29E', fontSize: 10 }}>· n={f.count}</span></span>
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
            <div style={{ display: 'grid', gridTemplateColumns: '24px repeat(6, 1fr)', gap: 3, fontSize: 9, color: '#A8A29E', marginBottom: 4 }}>
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
            <div style={{ fontSize: 11, color: '#A8A29E', marginLeft: 'auto' }}>n = {organic.length} posts</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Reach" value={fmt(o.reach)} />
            <Row label="ER" value={o.er != null ? `${o.er}%` : 'N/A'} sub={baseline.ER != null ? `baseline ${baseline.ER}%` : ''} good={o.er != null && baseline.ER != null && o.er > baseline.ER} />
            <Row label="Avg save rate" value={baseline.save != null ? `${baseline.save}%` : 'N/A'} sub="page median" />
          </div>
        </div>

        <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#C2410C' }}></div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Paid</div>
            <div style={{ fontSize: 11, color: '#A8A29E', marginLeft: 'auto' }}>n = {paid.length} ads</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Reach" value={fmt(pp.reach)} />
            <Row label="ER" value={pp.er != null ? `${pp.er}%` : 'N/A'} sub="paid sees broader audience" />
            <Row label="Spend total" value={fmtMoney(pp.spend)} />
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
                        ? <div style={{ position: 'absolute', left: '50%', width: `${w / 2}%`, height: '100%', background: w > 30 ? '#0F766E' : '#A8A29E', borderRadius: '0 3px 3px 0' }}></div>
                        : <div style={{ position: 'absolute', right: '50%', width: `${w / 2}%`, height: '100%', background: w > 30 ? '#991B1B' : '#A8A29E', borderRadius: '3px 0 0 3px' }}></div>}
                      <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 9, background: '#D6D3D1' }}></div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'right', color: c.value >= 0.3 ? '#0F766E' : c.value <= -0.3 ? '#991B1B' : '#A8A29E', ...monoStyle }}>
                      {c.value > 0 ? '+' : ''}{c.value.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 4 }}>Pearson correlation · n = {data.correlations[0]?.n ?? '?'} posts</div>
            </div>
          ) : <div style={{ fontSize: 12, color: '#A8A29E' }}>ต้องการ ≥ 5 โพสต์สำหรับ correlation analysis</div>}
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
                <div style={{ fontSize: 11, color: '#A8A29E' }}>{p.detail}</div>
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
                <div style={{ textAlign: 'right', ...monoStyle }}>{fmtMoney(r.spend)}</div>
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
          <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 4, ...monoStyle }}>post_id {p.id} · {p.date} {p.time}</div>
        </div>
        <div style={{ paddingLeft: 14, borderLeft: '0.5px solid #E7E5E4' }}>
          <GradeChip grade={p.grade} score={p.score} />
        </div>
      </div>

      <SectionTitle num="1" title="Distribution" />
      <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MetricBox label="Impressions" value={fmt(p.impressions)} />
          <MetricBox label="Reach unique" value={fmt(p.reach)} />
          <MetricBox label="Frequency" value={fmtNum(p.frequency, 2)} sub={`target ≤ ${FREQ_TARGET}`} warn={p.frequency > FREQ_TARGET} />
          <MetricBox label="Viral reach" value={fmt(p.reach_viral)} sub={pct(p.reach_viral, p.reach) != null ? `${pct(p.reach_viral, p.reach, 0)}% spread` : null} />
        </div>
        {reach > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ background: '#0F766E', width: `${(p.reach_organic || 0) / reach * 100}%` }}></div>
              <div style={{ background: '#C2410C', width: `${(p.reach_paid || 0) / reach * 100}%` }}></div>
              <div style={{ background: '#7C3AED', width: `${(p.reach_viral || 0) / reach * 100}%` }}></div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10 }}>
              <span><span style={{ color: '#0F766E' }}>●</span> Organic {fmt(p.reach_organic)}</span>
              <span><span style={{ color: '#C2410C' }}>●</span> Paid {fmt(p.reach_paid)}</span>
              <span><span style={{ color: '#7C3AED' }}>●</span> Viral {fmt(p.reach_viral)}</span>
            </div>
          </div>
        )}
      </div>

      {isVideo && (
        <>
          <SectionTitle num="2" title="Video performance" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricBox label="3s views" value={fmt(p.views_3s)} sub={pct(p.views_3s, p.impressions) != null ? `${pct(p.views_3s, p.impressions, 0)}% of impr.` : null} />
              <MetricBox label="15s views" value={fmt(p.views_15s)} sub={pct(p.views_15s, p.views_3s) != null ? `${pct(p.views_15s, p.views_3s, 0)}% from 3s` : null} />
              <MetricBox label="Completion" value={fmt(p.views_completion)} sub={pct(p.views_completion, p.views_3s) != null ? `${pct(p.views_completion, p.views_3s, 0)}% finished` : null} />
              <MetricBox label="Avg watch" value={p.avg_watch != null ? `${p.avg_watch}s` : 'N/A'} sub={(p.avg_watch != null && p.length) ? `${Math.round(p.avg_watch / p.length * 100)}% of length` : null} />
            </div>
          </div>
        </>
      )}

      <SectionTitle num="3" title="Interactions" />
      <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
          <MetricBox label="Engagement" value={fmt(p.engagement)} sub={er != null ? `ER ${er.toFixed(1)}%${baseline.ER ? ` · ${(er / baseline.ER).toFixed(1)}× baseline` : ''}` : null} good={er != null && baseline.ER != null && er > baseline.ER} />
          <MetricBox label="Shares" value={fmt(p.shares)} sub={shareRate != null ? `${shareRate.toFixed(2)}% rate` : null} good />
          <MetricBox label="Saves" value={fmt(p.saves)} sub={saveRate != null ? `${saveRate.toFixed(2)}% rate` : null} good />
        </div>
        {rxnTotal > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#A8A29E', marginBottom: 6 }}>Reactions · {fmt(rxnTotal)} total</div>
            <div style={{ display: 'flex', height: 14, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
              {[{ type: 'like', color: '#3B82F6' }, { type: 'love', color: '#EC4899' }, { type: 'wow', color: '#F59E0B' }, { type: 'haha', color: '#EAB308' }, { type: 'sad', color: '#A8A29E' }, { type: 'angry', color: '#737373' }].map(r => {
                const w = (p.reactions[r.type] / rxnTotal) * 100;
                return <div key={r.type} style={{ background: r.color, width: `${w}%`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 500 }}>{w > 8 ? `${r.type} ${fmt(p.reactions[r.type])}` : ''}</div>;
              })}
            </div>
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>
          <MetricBox label="Comments" value={p.comments != null ? `${fmt(p.comments)}${p.comment_avg_words ? ` · avg ${p.comment_avg_words} คำ` : ''}` : 'N/A'} sub={p.sentiment != null ? `sentiment ${p.sentiment >= 0 ? '+' : ''}${p.sentiment}` : null} mini />
          <MetricBox label="Link clicks" value={p.link_clicks != null ? fmt(p.link_clicks) : 'N/A'} sub={p.link_clicks == null ? 'โพสต์ไม่มีลิงก์ / ดึงไม่ได้' : null} mini />
        </div>
      </div>

      {p.type !== 'organic' && (
        <>
          <SectionTitle num="4" title={`Ad performance · ${p.objective} only`} />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricBox label="Spend" value={fmtMoney(p.spend)} />
              <MetricBox label="CPM" value={p.cpm != null ? `฿${p.cpm}` : 'N/A'} />
              <MetricBox label="CPE" value={p.cpe != null ? `฿${p.cpe}` : 'N/A'} />
              <MetricBox label="ROAS" value={p.roas != null ? `${p.roas}×` : 'N/A'} sub={p.roas == null ? 'ไม่ใช่ conversion' : null} />
            </div>
            <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>เปรียบเทียบเฉพาะกับ ads · {p.objective} — ไม่นำไปเทียบ objective อื่น</div>
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
        <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 12, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>baseline = median ของเพจเอง · n = {baseline.posts_90d ?? '?'} · ไม่นำมาเทียบกับ industry benchmark</div>
      </div>

      <SectionTitle title="Recommendations · ต่อเนื่อง 3 ระยะ" />
      {recs.now.length > 0 && <RecBlock icon={<Bolt size={16} color="#0F766E" />} title="ตอนนี้" color="#0F766E" bg="#E1F5EE" textColor="#064E3B" items={recs.now} />}
      {recs.next.length > 0 && <RecBlock icon={<Copy size={16} color="#CA8A04" />} title="โพสต์ถัดไป" color="#CA8A04" bg="#FEF3C7" textColor="#713F12" items={recs.next} />}
      {recs.long.length > 0 && <RecBlock icon={<Trophy size={16} color="#525252" />} title="ระยะยาว" color="#A8A29E" bg="#F5F5F4" textColor="#44403C" items={recs.long} />}
    </div>
  );
};

const DeltaCell = ({ value, invertGood }) => {
  if (value == null) return <div style={{ color: '#A8A29E' }}>–</div>;
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

// ============ MAIN APP ============
export default function Dashboard() {
  const [tier, setTier] = useState('overview');
  const [selectedPost, setSelectedPost] = useState(null);
  const [mode, setMode] = useState('combined');
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetchAnalysis()
      .then(data => { if (alive) setState({ loading: false, error: null, data }); })
      .catch(err => { if (alive) setState({ loading: false, error: err.message, data: null }); });
    return () => { alive = false; };
  }, []);

  const handleSelect = (post) => { setSelectedPost(post); setTier('post'); };
  const { loading, error, data } = state;

  return (
    <div style={{ ...fontStyle, background: '#FAFAF9', minHeight: '100vh', padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 14, borderBottom: '0.5px solid #E7E5E4' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{data?.page?.name || 'Performance Analyzer'}{data?.demo && <span style={{ fontSize: 11, color: '#CA8A04', marginLeft: 8 }}>· DEMO DATA</span>}</div>
            <div style={{ fontSize: 11, color: '#A8A29E', marginTop: 3 }}>
              {data ? `${data.counts.total} posts · ${data.counts.boosted} boosted · ${data.counts.ads} pure ads · ${data.range.since} – ${data.range.until}` : 'กำลังเชื่อมต่อ backend...'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, padding: 3, background: '#F5F5F4', borderRadius: 6 }}>
            {[{ id: 'combined', label: 'รวม' }, { id: 'organic', label: 'Organic' }, { id: 'paid', label: 'Paid' }].map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} style={{ fontSize: 11, padding: '5px 11px', borderRadius: 4, background: mode === m.id ? 'white' : 'transparent', color: mode === m.id ? '#1C1917' : '#78716C', fontWeight: mode === m.id ? 500 : 400, border: 'none', cursor: 'pointer', boxShadow: mode === m.id ? '0 0 0 0.5px #E7E5E4' : 'none' }}>{m.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 18, fontSize: 12, alignItems: 'center' }}>
          {tier !== 'overview' && (
            <button onClick={() => setTier('overview')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#78716C', padding: '4px 0', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={14} /> Back
            </button>
          )}
          <button onClick={() => setTier('overview')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: tier === 'overview' ? '#1C1917' : '#A8A29E', fontWeight: tier === 'overview' ? 500 : 400, padding: '4px 8px' }}>1 · Overview</button>
          <ChevronRight size={12} color="#D6D3D1" />
          <button onClick={() => setTier('split')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: tier === 'split' ? '#1C1917' : '#A8A29E', fontWeight: tier === 'split' ? 500 : 400, padding: '4px 8px' }}>2 · Ads vs Organic</button>
          <ChevronRight size={12} color="#D6D3D1" />
          <button onClick={() => selectedPost && setTier('post')} disabled={!selectedPost} style={{ background: 'none', border: 'none', cursor: selectedPost ? 'pointer' : 'not-allowed', color: tier === 'post' ? '#1C1917' : '#A8A29E', fontWeight: tier === 'post' ? 500 : 400, padding: '4px 8px', opacity: selectedPost ? 1 : 0.5 }}>
            3 · Post deep-dive {!selectedPost && '(เลือกโพสต์ก่อน)'}
          </button>
        </div>

        {loading && <div style={{ padding: 40, textAlign: 'center', color: '#78716C', fontSize: 13 }}>กำลังโหลดข้อมูลจาก backend...</div>}
        {error && (
          <div style={{ padding: 24, background: '#FEE2E2', border: '0.5px solid #FECACA', borderRadius: 8, color: '#991B1B', fontSize: 13 }}>
            เชื่อมต่อ backend ไม่ได้: {error}
            <div style={{ fontSize: 11, color: '#B45309', marginTop: 6 }}>ตรวจว่ารัน <code>uvicorn server:app --port 8000</code> ใน fb_analyzer แล้ว</div>
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
    </div>
  );
}
