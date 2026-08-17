import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Calendar, TrendingUp, AlertTriangle, CheckCircle2, AlertCircle, Copy, Trophy, Sparkles, Bolt, BarChart3, Database, FileSpreadsheet, Layers3, Settings, Upload, RefreshCw, CircleCheck, X, Link2, ShieldCheck, ExternalLink, Unplug, LoaderCircle, LockKeyhole, LogOut, FolderKanban, Plus, MessageSquareText, ListChecks, Lightbulb, TextQuote, Pencil, Trash2, Save, Check, ArrowLeft, ArrowRight, CalendarRange, Cable, Download, Share2, Printer, Table2, Sigma, Eye } from 'lucide-react';
import { archiveSavedReport, createBrand, createCampaign, createCustomMetric, createPeriod, createProject, createReportElement, createReportShare, createSavedReport, deleteReportElement, disconnectFacebook, fetchAnalysis, fetchAuthStatus, fetchFacebookStatus, fetchPortfolio, fetchPublicReport, fetchReport, fetchReportElements, fetchReports, login, logout, publishSavedReport, refreshFacebookConnection, startFacebookConnection, updateCampaignMetrics, updateReportElement, updateSavedReport } from './api.js';
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
const shareTokenFromLocation = () => {
  if (typeof window === 'undefined') return null;
  const token = new URLSearchParams(window.location.search).get('share');
  return token && /^[A-Za-z0-9_-]{32,120}$/.test(token) ? token : null;
};
const sharedContentIdFromLocation = () => {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('content');
  return value && value.length <= 160 ? value : null;
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

const FunnelMetric = ({ label, value, exact, sub, source, editableKey, onEdit }) => (
  <div className="funnel-metric">
    <div className="funnel-metric-head">
      <span>{label}</span>
      <small>{source}</small>
      {editableKey && onEdit && <button className="metric-card-edit" type="button" onClick={() => onEdit({ key: editableKey, label })} aria-label={`แก้ไข ${label}`} title={`แก้ไข ${label}`}><Pencil size={12} /></button>}
    </div>
    <div className="funnel-metric-value"><ExactValue exact={exact}>{value}</ExactValue></div>
    <div className="funnel-metric-sub">{sub || '\u00a0'}</div>
  </div>
);

const FunnelGroup = ({ title, description, metrics, onEditMetric }) => (
  <section className="funnel-group" aria-label={title}>
    <header>
      <h3>{title}</h3>
      <p>{description}</p>
    </header>
    <div className="funnel-metric-grid">
      {metrics.map(metric => <FunnelMetric key={metric.label} {...metric} onEdit={onEditMetric} />)}
    </div>
  </section>
);

const CAMPAIGN_BASE_COLUMNS = [
  ['impressions', 'Impressions'], ['reach', 'Reach'], ['engagement', 'Engagement'],
  ['link_clicks', 'Link clicks'], ['spend', 'Spend'], ['purchases', 'Purchases'], ['revenue', 'Revenue'],
];
const CAMPAIGN_DERIVED_COLUMNS = [
  ['frequency', 'Frequency'], ['er', 'ER'], ['ctr', 'CTR'], ['cpm', 'CPM'],
  ['cpe', 'CPE'], ['roas', 'ROAS'], ['roi', 'ROI'],
];
const campaignMetricValue = (key, value, definition) => {
  if (value == null) return 'N/A';
  const unit = definition?.unit || (['spend', 'revenue', 'cpm', 'cpe'].includes(key) ? 'currency' : ['er', 'ctr', 'roi'].includes(key) ? 'percent' : key === 'roas' || key === 'frequency' ? 'ratio' : 'number');
  if (unit === 'currency') return fmtMoney(value);
  if (unit === 'percent') return `${exactNumber(value)}%`;
  if (unit === 'ratio') return `${exactNumber(value)}×`;
  return fmt(value);
};

const metricPreview = row => {
  const ratio = (a, b, scale = 1) => a != null && b ? Number((a / b * scale).toFixed(2)) : null;
  return { frequency: ratio(row.impressions, row.reach), er: ratio(row.engagement, row.reach, 100), ctr: ratio(row.link_clicks, row.impressions, 100), cpm: ratio(row.spend, row.impressions, 1000), cpe: ratio(row.spend, row.engagement), roas: ratio(row.revenue, row.spend), roi: row.revenue != null && row.spend ? Number(((row.revenue - row.spend) / row.spend * 100).toFixed(2)) : null };
};

const aggregateCampaignRows = (rows, template = {}) => {
  const sum = key => {
    const values = rows.map(row => row[key]).filter(value => value != null && Number.isFinite(Number(value)));
    return values.length ? values.reduce((total, value) => total + Number(value), 0) : null;
  };
  const totals = {
    impressions: sum('impressions'), reach: sum('reach'), engagement: sum('engagement'),
    link_clicks: sum('link_clicks'), spend: sum('spend'), purchases: sum('purchases'), revenue: sum('revenue'),
  };
  const derived = metricPreview(totals);
  const hasFileSource = rows.some(row => row.source === 'file' || row.manual_fields?.includes('revenue'));
  const hasApiSource = rows.some(row => row.source !== 'file');
  return {
    ...template,
    ...totals,
    ...derived,
    impressions_total: totals.impressions,
    reach_total: totals.reach,
    reach_organic: 0,
    reach_paid: totals.reach,
    engagement_total: totals.engagement,
    link_clicks_total: totals.link_clicks,
    spend_total: totals.spend,
    purchases: totals.purchases,
    revenue: totals.revenue,
    conversion_spend: totals.spend,
    frequency: derived.frequency,
    avg_er: derived.er,
    link_ctr: derived.ctr,
    cpm: derived.cpm,
    cpe: derived.cpe,
    roas: derived.roas,
    roi: derived.roi,
    revenue_source: hasFileSource && hasApiSource ? 'mixed' : hasFileSource ? 'manual_or_import' : (template.revenue_source || 'meta_action_values'),
    manual_fields: [...new Set(rows.flatMap(row => row.manual_fields || []))],
  };
};

const applyMetricSelection = (data, selectedIds) => {
  const allRows = data?.campaign_results || [];
  if (!allRows.length || !selectedIds.length || selectedIds.length === allRows.length) return data;
  const selected = new Set(selectedIds);
  const rows = allRows.filter(row => selected.has(row.campaign_id));
  if (!rows.length) return data;
  return {
    ...data,
    campaign_results: rows,
    campaign_overview: aggregateCampaignRows(rows, data.campaign_overview),
    scope: data.scope ? { ...data.scope, campaigns: data.scope.campaigns.filter(campaign => selected.has(campaign.id)) } : data.scope,
  };
};
const validateMetricCandidate = (candidate, previous, key) => {
  const errors = [], warnings = [];
  const value = Number(candidate[key]);
  if (Number.isFinite(value) && value < 0) errors.push(`${key} ต้องไม่ติดลบ`);
  if (['reach', 'impressions', 'engagement', 'link_clicks', 'purchases'].includes(key) && Number.isFinite(value) && !Number.isInteger(value)) errors.push(`${key} ต้องเป็นจำนวนเต็ม`);
  if (candidate.reach != null && candidate.impressions != null && candidate.reach > candidate.impressions) errors.push('Reach ต้องไม่มากกว่า Impressions');
  if (candidate.link_clicks != null && candidate.impressions != null && candidate.link_clicks > candidate.impressions) errors.push('Link clicks ต้องไม่มากกว่า Impressions');
  if (candidate.engagement != null && candidate.reach != null && candidate.engagement > candidate.reach) warnings.push('Engagement สูงกว่า Reach โปรดตรวจนิยาม metric หรือข้อมูลซ้ำ');
  if (candidate.purchases > 0 && !candidate.revenue) warnings.push('มี Purchases แต่ Revenue เป็นศูนย์หรือไม่มีข้อมูล');
  if (candidate.revenue > 0 && !candidate.purchases) warnings.push('มี Revenue แต่ Purchases เป็นศูนย์หรือไม่มีข้อมูล');
  const before = Number(previous[key]); const after = Number(candidate[key]);
  if (before > 0 && (after >= before * 1.5 || after <= before * .5)) warnings.push(`ค่าเปลี่ยนจาก ${exactNumber(before)} เป็น ${exactNumber(after)} ตั้งแต่ 50%`);
  return { errors, warnings, derived: metricPreview(candidate) };
};

const CardMetricEditor = ({ data, metric, onClose, onRefresh, onSessionExpiry }) => {
  const rows = data?.campaign_results || [];
  const ownerId = data?.scope?.project_id || data?.report?.id;
  const periodId = data?.scope?.period_id || data?.report?.id;
  const [rowId, setRowId] = useState(rows[0]?.campaign_id || '');
  const row = rows.find(item => item.campaign_id === rowId) || rows[0];
  const [value, setValue] = useState(row?.[metric.key] ?? '');
  const [reason, setReason] = useState('แก้ไขหลังตรวจสอบแหล่งข้อมูล');
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setValue(row?.[metric.key] ?? ''); setAcknowledged(false); setError(null); }, [rowId, metric.key]);
  if (!row || !ownerId) return null;
  const numeric = value === '' ? null : Number(value);
  const changed = (row[metric.key] ?? null) !== numeric;
  const candidate = { ...row, [metric.key]: numeric };
  const validation = Number.isFinite(numeric) || numeric === null ? validateMetricCandidate(candidate, row, metric.key) : { errors: ['กรุณากรอกตัวเลขที่ถูกต้อง'], warnings: [], derived: {} };
  const save = async () => {
    if (!changed) return setError('ค่ายังไม่เปลี่ยน');
    if (validation.errors.length) return setError(validation.errors[0]);
    if (validation.warnings.length && !acknowledged) return setError('ต้องตรวจสอบและยืนยันคำเตือนก่อนบันทึก');
    if (reason.trim().length < 3) return setError('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร');
    setSaving(true); setError(null);
    try {
      await updateCampaignMetrics(ownerId, { period_id: periodId, campaign_id: row.campaign_id, values: { [metric.key]: numeric }, reason: reason.trim(), acknowledge_warnings: acknowledged });
      await onRefresh(); onClose();
    } catch (err) { if (!onSessionExpiry?.(err)) setError(err.message); }
    finally { setSaving(false); }
  };
  return <section className="card-metric-editor" aria-labelledby="card-metric-editor-title"><div className="card-editor-heading"><div><h2 id="card-metric-editor-title">ตรวจแก้ {metric.label}</h2><p>ระบบจะคำนวณ Derived metrics ใหม่ก่อนบันทึก และเก็บเหตุผลไว้ใน Audit trail</p></div><button type="button" onClick={onClose} aria-label="ปิด"><X size={15} /></button></div>{rows.length > 1 && <label>Campaign<select value={row.campaign_id} onChange={event => setRowId(event.target.value)}>{rows.map(item => <option value={item.campaign_id} key={item.campaign_id}>{item.campaign_name}</option>)}</select></label>}<div className="card-editor-grid"><label>ค่าปัจจุบัน<strong>{campaignMetricValue(metric.key, row[metric.key])}</strong></label><label>ค่าใหม่<input autoFocus type="number" min="0" step="any" value={value} onChange={event => { setValue(event.target.value); setAcknowledged(false); }} /></label><label className="card-editor-reason">เหตุผล<input maxLength="500" value={reason} onChange={event => setReason(event.target.value)} /></label></div>{validation.errors.length > 0 && <div className="metric-validation error"><AlertCircle size={15} /><div><strong>บันทึกไม่ได้</strong>{validation.errors.map(item => <span key={item}>{item}</span>)}</div></div>}{validation.warnings.length > 0 && <div className="metric-validation warning"><AlertTriangle size={15} /><div><strong>ตัวเลขผิดปกติ — กรุณาตรวจสอบ</strong>{validation.warnings.map(item => <span key={item}>{item}</span>)}<label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> ตรวจสอบกับแหล่งข้อมูลแล้วและยืนยันค่าตามนี้</label></div></div>}<div className="derived-preview"><span>ผลคำนวณใหม่</span>{Object.entries(validation.derived).map(([key, calculated]) => <div key={key}><small>{key.toUpperCase()}</small><strong>{campaignMetricValue(key, calculated)}</strong></div>)}</div>{error && <div className="inline-error" role="alert"><AlertCircle size={14} />{error}</div>}<div className="card-editor-actions"><button type="button" onClick={onClose}>ยกเลิก</button><button className="primary-action" type="button" disabled={saving || !changed || validation.errors.length > 0 || (validation.warnings.length > 0 && !acknowledged)} onClick={save}>{saving ? <LoaderCircle className="button-spinner" size={14} /> : <Save size={14} />} ยืนยันและคำนวณใหม่</button></div></section>;
};

const MetricDisplayScope = ({ rows, selectedIds, onChange }) => {
  const selected = new Set(selectedIds);
  const accounts = Object.values(rows.reduce((groups, row) => {
    const id = row.source_account_id || row.source || 'manual';
    groups[id] ||= { id, source: row.source, rows: [] };
    groups[id].rows.push(row);
    return groups;
  }, {}));
  const toggleRow = id => {
    if (selected.has(id) && selected.size === 1) return;
    onChange(selected.has(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id]);
  };
  const toggleAccount = account => {
    const accountIds = account.rows.map(row => row.campaign_id);
    const allSelected = accountIds.every(id => selected.has(id));
    const next = allSelected ? selectedIds.filter(id => !accountIds.includes(id)) : [...new Set([...selectedIds, ...accountIds])];
    if (next.length) onChange(next);
  };
  return <section className="metric-display-scope" aria-labelledby="metric-display-scope-title">
    <div className="metric-scope-heading"><div><h3 id="metric-display-scope-title">เลือกรายการที่ใช้คำนวณและแสดงผล</h3><p>การ์ด Overview ตาราง Export และ Client link ใช้ {selectedIds.length} แถวที่เลือกชุดเดียวกัน</p></div><strong>{selectedIds.length}/{rows.length} แถว</strong></div>
    <div className="metric-account-options" aria-label="เลือกตามบัญชี">{accounts.map(account => {
      const count = account.rows.filter(row => selected.has(row.campaign_id)).length;
      const allSelected = count === account.rows.length;
      const wouldRemoveLast = allSelected && count === selectedIds.length;
      return <button type="button" className={allSelected ? 'selected' : count ? 'partial' : ''} key={account.id} onClick={() => toggleAccount(account)} aria-pressed={allSelected} disabled={wouldRemoveLast} title={wouldRemoveLast ? 'รายงานต้องมีอย่างน้อย 1 แถว' : undefined}><Cable size={14} /><span><small>{account.source === 'file' ? 'File import' : 'Ad account'}</small><strong>{account.id}</strong></span><b>{count}/{account.rows.length}</b></button>;
    })}</div>
    <div className="metric-row-options">{rows.map(row => <label className={selected.has(row.campaign_id) ? 'selected' : ''} key={row.campaign_id}><input type="checkbox" checked={selected.has(row.campaign_id)} disabled={selected.has(row.campaign_id) && selected.size === 1} onChange={() => toggleRow(row.campaign_id)} /><span><strong>{row.campaign_name}</strong><small>{row.source_account_id || row.source_campaign_id}</small></span></label>)}</div>
  </section>;
};

const CampaignResultsTable = ({ data, scopeRows, selectedRowIds, onSelectionChange, readOnly = false, onRefresh, onSessionExpiry }) => {
  const rows = data?.campaign_results || [];
  const definitions = data?.custom_metrics || [];
  const tableTotal = aggregateCampaignRows(rows);
  const metricOwnerId = data?.scope?.project_id || data?.report?.id;
  const metricPeriodId = data?.scope?.period_id || data?.report?.id;
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [reason, setReason] = useState('แก้ไขหลังตรวจสอบข้อมูลนำเข้า');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [tableWarnings, setTableWarnings] = useState([]);
  const [tableWarningsAcknowledged, setTableWarningsAcknowledged] = useState(false);
  const [formula, setFormula] = useState({ key: '', label: '', formula: 'revenue / spend', unit: 'ratio', decimals: 2 });

  useEffect(() => {
    setEditing(false);
    setDrafts({});
    setError(null);
    setFormulaOpen(false);
    setTableWarnings([]);
    setTableWarningsAcknowledged(false);
  }, [data?.scope?.project_id, data?.scope?.period_id, data?.scope?.campaign_ids?.join('|')]);

  const beginEdit = () => {
    setDrafts(Object.fromEntries(rows.map(row => [row.campaign_id, Object.fromEntries(CAMPAIGN_BASE_COLUMNS.map(([key]) => [key, row[key] ?? '']))])));
    setEditing(true);
    setError(null);
    setTableWarnings([]);
    setTableWarningsAcknowledged(false);
  };
  const saveChanges = async () => {
    if (!reason.trim() || reason.trim().length < 3) return setError('กรุณาระบุเหตุผลการแก้ไขอย่างน้อย 3 ตัวอักษร');
    setSaving(true);
    setError(null);
    try {
      const changes = [];
      for (const row of rows) {
        const values = {};
        CAMPAIGN_BASE_COLUMNS.forEach(([key]) => {
          const raw = drafts[row.campaign_id]?.[key];
          const next = raw === '' ? null : Number(raw);
          if ((row[key] ?? null) !== next) values[key] = next;
        });
        if (Object.keys(values).length) {
          const validations = Object.keys(values).map(key => validateMetricCandidate({ ...row, ...values }, row, key));
          const validationErrors = [...new Set(validations.flatMap(item => item.errors))];
          const validationWarnings = [...new Set(validations.flatMap(item => item.warnings))];
          if (validationErrors.length) { setError(`${row.campaign_name}: ${validationErrors.join(' · ')}`); setSaving(false); return; }
          changes.push({ row, values, warnings: validationWarnings });
        }
      }
      const warnings = changes.flatMap(item => item.warnings.map(warning => `${item.row.campaign_name}: ${warning}`));
      if (warnings.length && !tableWarningsAcknowledged) { setTableWarnings(warnings); setError('ตรวจพบตัวเลขผิดปกติ กรุณาตรวจสอบและยืนยันก่อนบันทึก'); setSaving(false); return; }
      for (const item of changes) await updateCampaignMetrics(metricOwnerId, { period_id: metricPeriodId, campaign_id: item.row.campaign_id, values: item.values, reason: reason.trim(), acknowledge_warnings: tableWarningsAcknowledged });
      setEditing(false);
      await onRefresh();
    } catch (err) {
      if (!onSessionExpiry?.(err)) setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const addFormula = async event => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createCustomMetric(metricOwnerId, { ...formula, decimals: Number(formula.decimals) });
      setFormula({ key: '', label: '', formula: 'revenue / spend', unit: 'ratio', decimals: 2 });
      setFormulaOpen(false);
      await onRefresh();
    } catch (err) {
      if (!onSessionExpiry?.(err)) setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!metricOwnerId) return null;
  return <section className="campaign-results" aria-labelledby="campaign-results-title">
    <div className="campaign-results-heading">
      <div><h2 id="campaign-results-title"><Table2 size={17} /> Detailed report metrics</h2><p>{data?.scope ? `${rows.length} จาก ${scopeRows?.length || rows.length} Campaigns ถูกนำมาคำนวณและแสดงในรายงาน` : 'ยอดรวม Brand + Period ของรายงานนี้'} · ค่าที่แก้เองมีเครื่องหมาย Manual และสูตรจะคำนวณใหม่อัตโนมัติ</p></div>
      {!readOnly && <div className="campaign-admin-actions">
        {!editing ? <button type="button" onClick={beginEdit}><Pencil size={14} /> แก้ไขตัวเลข</button> : <><button type="button" onClick={() => setEditing(false)} disabled={saving}>ยกเลิก</button><button className="save" type="button" onClick={saveChanges} disabled={saving}>{saving ? <LoaderCircle className="button-spinner" size={14} /> : <Save size={14} />} บันทึก</button></>}
        <button type="button" onClick={() => setFormulaOpen(value => !value)}><Sigma size={14} /> สร้าง Metric</button>
      </div>}
    </div>
    {!readOnly && scopeRows?.length > 1 && <MetricDisplayScope rows={scopeRows} selectedIds={selectedRowIds} onChange={onSelectionChange} />}
    {editing && <label className="override-reason">เหตุผลการแก้ไข<input value={reason} maxLength="500" onChange={event => setReason(event.target.value)} /></label>}
    {tableWarnings.length > 0 && <div className="metric-validation warning table-validation"><AlertTriangle size={15} /><div><strong>ตรวจพบค่าที่อาจทำให้รายงานคลาดเคลื่อน</strong>{tableWarnings.map(item => <span key={item}>{item}</span>)}<label><input type="checkbox" checked={tableWarningsAcknowledged} onChange={event => setTableWarningsAcknowledged(event.target.checked)} /> ตรวจสอบกับแหล่งข้อมูลแล้วและยืนยันค่าตามนี้</label></div></div>}
    {formulaOpen && !readOnly && <form className="formula-builder" onSubmit={addFormula}>
      <label>ชื่อ Metric<input required maxLength="80" value={formula.label} onChange={event => setFormula({ ...formula, label: event.target.value })} placeholder="เช่น Cost per purchase" /></label>
      <label>Metric key<input required pattern="[a-z][a-z0-9_]{1,39}" value={formula.key} onChange={event => setFormula({ ...formula, key: event.target.value.toLowerCase() })} placeholder="cost_per_purchase" /></label>
      <label className="formula-expression">สูตร<input required maxLength="200" value={formula.formula} onChange={event => setFormula({ ...formula, formula: event.target.value })} /><small>ใช้ impressions, reach, engagement, link_clicks, spend, purchases, revenue และ + − × ÷ %</small></label>
      <label>หน่วย<select value={formula.unit} onChange={event => setFormula({ ...formula, unit: event.target.value })}><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percent</option><option value="ratio">Ratio</option></select></label>
      <button className="primary-action" type="submit" disabled={saving}><Plus size={14} /> เพิ่ม Metric</button>
    </form>}
    {error && <div className="inline-error" role="alert"><AlertCircle size={14} />{error}</div>}
    <div className="campaign-table-scroll">
      <table className="campaign-table">
        <thead><tr><th>Campaign</th><th>Source</th>{CAMPAIGN_BASE_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}{CAMPAIGN_DERIVED_COLUMNS.map(([, label]) => <th className="calculated" key={label}>{label}<small>fx</small></th>)}{definitions.map(item => <th className="custom" key={item.key}>{item.label}<small>{item.formula}</small></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.campaign_id}>
          <th scope="row"><strong>{row.campaign_name}</strong><small>{row.post_count} records</small></th>
          <td><span className={`record-source ${row.record_source}`}>{row.record_source === 'demo' ? 'Demo allocation' : row.source}</span></td>
          {CAMPAIGN_BASE_COLUMNS.map(([key]) => <td className={row.manual_fields?.includes(key) ? 'manual' : ''} key={key}>{editing ? <input type="number" min="0" step="any" value={drafts[row.campaign_id]?.[key] ?? ''} onChange={event => setDrafts(current => ({ ...current, [row.campaign_id]: { ...current[row.campaign_id], [key]: event.target.value } }))} aria-label={`${row.campaign_name} ${key}`} /> : <ExactValue exact={exactNumber(row[key])}>{campaignMetricValue(key, row[key])}</ExactValue>}{row.manual_fields?.includes(key) && <small title={row.override_reason}>Manual</small>}</td>)}
          {CAMPAIGN_DERIVED_COLUMNS.map(([key]) => <td className="calculated" key={key}><ExactValue exact={exactNumber(row[key])}>{campaignMetricValue(key, row[key])}</ExactValue></td>)}
          {definitions.map(item => <td className="custom" key={item.key}><ExactValue exact={exactNumber(row.custom_metrics?.[item.key])}>{campaignMetricValue(item.key, row.custom_metrics?.[item.key], item)}</ExactValue></td>)}
        </tr>)}</tbody>
        {rows.length > 0 && <tfoot><tr><th scope="row"><strong>รวมรายการที่เลือก</strong><small>{rows.length} แถว · ชุดเดียวกับการ์ด Overview</small></th><td><span className="record-source selected-scope">Selected scope</span></td>{CAMPAIGN_BASE_COLUMNS.map(([key]) => <td key={key}><ExactValue exact={exactNumber(tableTotal[key])}>{campaignMetricValue(key, tableTotal[key])}</ExactValue></td>)}{CAMPAIGN_DERIVED_COLUMNS.map(([key]) => <td className="calculated" key={key}><ExactValue exact={exactNumber(tableTotal[key])}>{campaignMetricValue(key, tableTotal[key])}</ExactValue></td>)}{definitions.map(item => <td className="custom" key={item.key}>—</td>)}</tr></tfoot>}
      </table>
    </div>
    {!rows.length && <div className="compact-empty">ยังไม่มี Campaign result ใน scope นี้</div>}
  </section>;
};

// ============ TIER 1: OVERVIEW ============
const TierOverview = ({ data, mode, onSelectPost, onEditMetric }) => {
  const baseOverview = data.campaign_overview || data.overview;
  const baseline = data.baseline;
  const posts = applyMode(data.posts, mode);
  const ov = data.campaign_overview && mode !== 'organic' ? baseOverview : mode === 'combined' ? baseOverview : summarizePosts(posts);
  const revenueSource = ov.revenue_source === 'manual_or_import'
    ? 'Manual / File'
    : ov.revenue_source === 'meta_action_values'
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
        { label: 'Reach', editableKey: 'reach', value: fmt(ov.reach_total), exact: exactNumber(ov.reach_total), sub: 'จำนวนคนที่เข้าถึง', source: 'Meta API' },
        { label: 'Impressions', editableKey: 'impressions', value: fmt(ov.impressions_total), exact: exactNumber(ov.impressions_total), sub: 'จำนวนครั้งที่แสดงผล', source: 'Meta API' },
        { label: 'Frequency', value: ov.frequency != null ? `${ov.frequency}×` : 'N/A', exact: exactNumber(ov.frequency), sub: 'Impressions ÷ Reach', source: 'คำนวณ' },
      ],
    },
    {
      title: 'Engagement',
      description: 'คนตอบสนองและเดินทางต่อจากคอนเทนต์หรือไม่',
      metrics: [
        { label: 'Engagement', editableKey: 'engagement', value: fmt(ov.engagement_total), exact: exactNumber(ov.engagement_total), sub: 'รวม engaged users', source: 'Meta API' },
        { label: 'Engagement rate', value: ov.avg_er != null ? `${ov.avg_er}%` : 'N/A', exact: exactNumber(ov.avg_er), sub: baseline.ER != null ? `Baseline ${baseline.ER}%` : 'Engagement ÷ Reach', source: 'คำนวณ' },
        { label: 'Link clicks', editableKey: 'link_clicks', value: fmt(ov.link_clicks_total), exact: exactNumber(ov.link_clicks_total), sub: 'คลิกที่พาออกจากโพสต์', source: 'Meta API' },
        { label: 'Link CTR', value: ov.link_ctr != null ? `${ov.link_ctr}%` : 'N/A', exact: exactNumber(ov.link_ctr), sub: 'Link clicks ÷ Impressions', source: 'คำนวณ' },
      ],
    },
    {
      title: 'Conversion',
      description: 'ผลลัพธ์ทางธุรกิจและเงินที่กลับมาจากงบโฆษณา',
      metrics: [
        { label: 'Purchases', editableKey: 'purchases', value: fmt(ov.purchases), exact: exactNumber(ov.purchases), sub: ov.purchases == null ? 'รอ Pixel / CAPI หรือไฟล์ยอดขาย' : 'จำนวนคำสั่งซื้อที่ระบุแหล่งได้', source: 'API / File' },
        { label: 'Revenue · ยอดขาย', editableKey: 'revenue', value: fmtMoney(ov.revenue), exact: exactMoney(ov.revenue), sub: ov.revenue == null ? 'รอ conversion value หรือไฟล์ยอดขาย' : 'มูลค่า conversion รวม', source: revenueSource },
        { label: 'Spend', editableKey: 'spend', value: fmtMoney(ov.spend_total), exact: exactMoney(ov.spend_total), sub: <>CPM <ExactValue exact={exactMoney(ov.cpm)}>{fmtMoney(ov.cpm)}</ExactValue> · CPE {ov.cpe != null ? `฿${ov.cpe}` : 'N/A'}</>, source: 'Meta API' },
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
        {funnelGroups.map(group => <FunnelGroup key={group.title} {...group} onEditMetric={onEditMetric} />)}
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
    { id: 'reports', label: 'Report library', icon: Layers3 },
    { id: 'report', label: 'Facebook Performance', icon: BarChart3 },
    { id: 'portfolio', label: 'Brands & projects', icon: FolderKanban },
    { id: 'sources', label: 'Data sources', icon: Database },
  ];
  const planned = [
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

const ReportLibraryView = ({ portfolio, onOpenDraft, onOpenRevision, onSessionExpiry }) => {
  const brands = portfolio.data?.brands || [];
  const projects = portfolio.data?.projects || [];
  const campaigns = portfolio.data?.campaigns || [];
  const [brandId, setBrandId] = useState(brands[0]?.id || '');
  const [state, setState] = useState({ loading: true, error: null, reports: [] });
  const [creating, setCreating] = useState(false);
  const [history, setHistory] = useState({});
  const initialDates = defaultPeriod();
  const [form, setForm] = useState({ name: '', date_from: initialDates.since, date_to: initialDates.until, project_id: '', campaign_ids: [] });
  const selectedProjects = projects.filter(project => project.brand_ids.includes(brandId) && project.status === 'active');
  const selectedCampaigns = campaigns.filter(campaign => campaign.project_id === form.project_id && campaign.brand_ids.includes(brandId));

  const load = () => {
    if (!brandId) return setState({ loading: false, error: null, reports: [] });
    setState(current => ({ ...current, loading: true, error: null }));
    fetchReports(brandId).then(result => setState({ loading: false, error: null, reports: result.reports })).catch(err => {
      if (!onSessionExpiry?.(err)) setState({ loading: false, error: err.message, reports: [] });
    });
  };
  useEffect(load, [brandId]);
  useEffect(() => { if (!brandId && brands[0]) setBrandId(brands[0].id); }, [brands.length]);

  const submit = async event => {
    event.preventDefault();
    setCreating(true);
    try {
      const report = await createSavedReport({ brand_id: brandId, name: form.name, date_from: form.date_from, date_to: form.date_to, project_id: form.project_id || null, campaign_ids: form.project_id ? form.campaign_ids : [] });
      setForm({ name: '', date_from: form.date_from, date_to: form.date_to, project_id: '', campaign_ids: [] });
      await load();
      onOpenDraft(report);
    } catch (err) {
      if (!onSessionExpiry?.(err)) setState(current => ({ ...current, error: err.message }));
    } finally { setCreating(false); }
  };
  const openLatest = async report => {
    if (!report.current_revision) return onOpenDraft(report);
    try {
      const detail = await fetchReport(report.id);
      onOpenRevision(report, detail.revisions[0]);
    } catch (err) { if (!onSessionExpiry?.(err)) setState(current => ({ ...current, error: err.message })); }
  };
  const toggleHistory = async report => {
    if (history[report.id]) return setHistory(current => ({ ...current, [report.id]: null }));
    try {
      const detail = await fetchReport(report.id);
      setHistory(current => ({ ...current, [report.id]: detail.revisions }));
    } catch (err) { if (!onSessionExpiry?.(err)) setState(current => ({ ...current, error: err.message })); }
  };
  const archive = async report => {
    if (!window.confirm(`เก็บ “${report.name}” เข้า Archive? Revision ที่ Publish แล้วจะไม่ถูกลบถาวร`)) return;
    try { await archiveSavedReport(report.id); await load(); }
    catch (err) { if (!onSessionExpiry?.(err)) setState(current => ({ ...current, error: err.message })); }
  };

  return <section className="report-library" aria-labelledby="report-library-title">
    <header className="library-hero"><div><div className="section-kicker">Brand-first workspace</div><h1 id="report-library-title">กล่องรายงาน</h1><p>รายงานทุกชิ้นมี Draft, Period และ Revision ของตัวเอง จึงไม่ทับข้อมูลเดือนก่อน</p></div><button className="primary-action" type="button" onClick={() => document.getElementById('new-report-form')?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}><Plus size={15} /> สร้างรายงาน</button></header>
    <div className="brand-report-strip" aria-label="เลือกแบรนด์">{brands.map(brand => <button type="button" className={brandId === brand.id ? 'active' : ''} key={brand.id} onClick={() => setBrandId(brand.id)}><span>{brand.code || brand.name.slice(0, 2)}</span><strong>{brand.name}</strong><small>{state.reports.filter(report => report.brand_id === brand.id).length || 'ดู'} reports</small></button>)}</div>
    <div className="library-layout">
      <div className="report-ledger">
        <div className="ledger-head"><span>ชื่อรายงาน</span><span>Period</span><span>สถานะ</span><span>Revision</span><span>จัดการ</span></div>
        {state.loading ? <div className="loading-state"><LoaderCircle className="button-spinner" size={17} /> กำลังเปิดกล่องรายงาน...</div> : state.reports.length ? state.reports.map(report => <React.Fragment key={report.id}><div className="ledger-row">
          <div><strong>{report.name}</strong><small>{report.project_id ? 'มี Project/Campaign filter' : 'Brand + Period'}</small></div>
          <div><strong>{new Date(report.date_from).toLocaleDateString('th-TH')} – {new Date(report.date_to).toLocaleDateString('th-TH')}</strong><small>อัปเดต {new Date(report.updated_at).toLocaleDateString('th-TH')}</small></div>
          <div><span className={`report-status ${report.status}`}>{report.status === 'published' ? 'Published' : 'Draft'}</span></div>
          <div><strong>{report.current_revision ? `v${report.current_revision}` : '—'}</strong><small>{report.current_revision ? 'เก็บ snapshot แล้ว' : 'ยังไม่ Submit'}</small></div>
          <div className="ledger-actions"><button type="button" onClick={() => onOpenDraft(report)}><Pencil size={14} /> ทำงานต่อ</button>{report.current_revision > 0 && <button type="button" onClick={() => toggleHistory(report)}><Eye size={14} /> Versions</button>}<button className="archive" type="button" onClick={() => archive(report)}><Trash2 size={14} /></button></div>
        </div>{history[report.id] && <div className="revision-drawer"><strong>Revision history</strong><div>{history[report.id].map(revision => <button type="button" key={revision.id} onClick={() => onOpenRevision(report, revision)}><span>v{revision.version}</span><b>{new Date(revision.created_at).toLocaleString('th-TH')}</b><small>{revision.note || 'Published snapshot'}</small></button>)}</div></div>}</React.Fragment>) : <div className="portfolio-empty"><Layers3 size={24} /><strong>แบรนด์นี้ยังไม่มีรายงาน</strong><span>ตั้งชื่อและเลือก Period ได้ทันที โดยไม่ต้องสร้าง Project หรือ Campaign</span></div>}
        {state.error && <div className="inline-error" role="alert"><AlertCircle size={14} /> {state.error}</div>}
      </div>
      <form id="new-report-form" className="new-report-card" onSubmit={submit}><div><div className="section-kicker">New draft</div><h2>สร้างรายงานใหม่</h2><p>Project และ Campaign เป็นตัวเลือกเสริม</p></div><label>ชื่อรายงาน<input required maxLength="160" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="เช่น Monthly Performance · สิงหาคม" /></label><div className="portfolio-date-pair"><label>ตั้งแต่<input required type="date" value={form.date_from} max={form.date_to} onChange={event => setForm({ ...form, date_from: event.target.value })} /></label><label>ถึง<input required type="date" value={form.date_to} min={form.date_from} onChange={event => setForm({ ...form, date_to: event.target.value })} /></label></div><label>Project filter <small>ไม่บังคับ</small><select value={form.project_id} onChange={event => setForm({ ...form, project_id: event.target.value, campaign_ids: [] })}><option value="">ไม่ใช้ Project</option>{selectedProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>{form.project_id && <fieldset><legend>Campaign ที่ Include <small>เลือกได้หลายรายการ</small></legend>{selectedCampaigns.map(campaign => <label className="campaign-check" key={campaign.id}><input type="checkbox" checked={form.campaign_ids.includes(campaign.id)} onChange={() => setForm(current => ({ ...current, campaign_ids: current.campaign_ids.includes(campaign.id) ? current.campaign_ids.filter(id => id !== campaign.id) : [...current.campaign_ids, campaign.id] }))} />{campaign.name}</label>)}</fieldset>}<button className="primary-action" type="submit" disabled={creating || !brandId}>{creating ? <LoaderCircle className="button-spinner" size={15} /> : <Plus size={15} />} สร้าง Draft และเปิด</button></form>
    </div>
  </section>;
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
    setStage(navigateRequest.periodId ? 'campaign' : 'period');
    setPeriodForm(current => ({ ...current, project_id: project.id }));
    setCampaignForm(current => ({ ...current, project_id: project.id, brand_ids: project.brand_ids[0] ? [project.brand_ids[0]] : [] }));
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
        next = await createProject({ ...projectForm, brand_ids: selectedBrand ? [selectedBrand.id] : projectForm.brand_ids, description: projectForm.description || null });
        setProjectForm({ name: '', description: '', brand_ids: [], reporting_mode: 'monthly' });
      } else if (stage === 'period') {
        next = await createPeriod(periodForm);
      } else {
        next = await createCampaign({ ...campaignForm, brand_ids: selectedBrand ? [selectedBrand.id] : campaignForm.brand_ids });
        setCampaignForm(current => ({ ...current, source_account_id: '', source_campaign_id: '', name: '' }));
      }
      onPortfolioChange(next);
    } catch (err) {
      if (!onSessionExpiry(err)) setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedBrand = brands.find(brand => brand.id === selectedBrandId) || null;
  const brandProjects = selectedBrand ? projects.filter(project => project.brand_ids.includes(selectedBrand.id)) : [];
  const openProject = projects.find(project => project.id === openProjectId) || null;
  const openProjectPeriods = openProject ? periods.filter(period => period.project_id === openProject.id) : [];
  const openProjectCampaigns = openProject ? campaigns.filter(campaign => campaign.project_id === openProject.id && (!selectedBrand || campaign.brand_ids.includes(selectedBrand.id))) : [];
  const selectedPeriod = openProjectPeriods.find(period => period.id === selectedPeriodId) || null;
  const accountGroups = openProjectCampaigns.reduce((groups, campaign) => {
    const key = `${campaign.source}:${campaign.source_account_id}`;
    groups[key] ||= { source: campaign.source, accountId: campaign.source_account_id, campaigns: [] };
    groups[key].campaigns.push(campaign);
    return groups;
  }, {});
  const reportingModeLabel = { monthly: 'รายเดือน', campaign: 'ตาม Campaign', continuous: 'ต่อเนื่อง' };
  const contextProjects = openProject ? [openProject] : selectedBrand ? brandProjects : projects;
  const contextProjectIds = new Set(contextProjects.map(project => project.id));
  const contextPeriods = periods.filter(period => contextProjectIds.has(period.project_id));
  const contextCampaigns = openProject
    ? openProjectCampaigns
    : selectedBrand
      ? campaigns.filter(campaign => campaign.brand_ids.includes(selectedBrand.id))
      : campaigns;
  const contextAccounts = new Set(contextCampaigns.map(item => `${item.source}:${item.source_account_id}`));

  const openBrand = brand => { setSelectedBrandId(brand.id); setOpenProjectId(null); setSelectedPeriodId(null); setSelectedCampaignIds([]); setScopeReady(false); setStage('project'); setProjectForm(current => ({ ...current, brand_ids: [brand.id] })); };
  const openProjectDetail = project => { setOpenProjectId(project.id); setSelectedPeriodId(null); setSelectedCampaignIds([]); setScopeReady(false); setStage('period'); setPeriodForm(current => ({ ...current, project_id: project.id })); setCampaignForm(current => ({ ...current, project_id: project.id, brand_ids: selectedBrand ? [selectedBrand.id] : project.brand_ids })); onSelectProject(project.id); };
  const backToBrands = () => { setSelectedBrandId(null); setOpenProjectId(null); setSelectedPeriodId(null); setSelectedCampaignIds([]); setScopeReady(false); setStage('brand'); };
  const backToProjects = () => { setOpenProjectId(null); setSelectedPeriodId(null); setSelectedCampaignIds([]); setScopeReady(false); setStage('project'); };
  const choosePeriod = period => {
    setSelectedPeriodId(period.id);
    setSelectedCampaignIds([]);
  };
  const toggleCampaign = campaignId => setSelectedCampaignIds(current => current.includes(campaignId) ? current.filter(id => id !== campaignId) : [...current, campaignId]);
  const workflowStep = !selectedBrand ? 0 : !openProject ? 1 : scopeReady ? 3 : 2;
  const workflowSteps = ['Brand', 'Project', 'Period', 'Campaign'];
  const setupStages = !selectedBrand ? [['brand', 'Brand']] : !openProject ? [['project', 'Project']] : [['period', 'Period'], ['campaign', 'Campaign']];
  const goToWorkflowStep = index => {
    if (index === 0) backToBrands();
    if (index === 1 && selectedBrand) backToProjects();
    if (index === 2 && openProject) { setScopeReady(false); setStage('period'); }
  };

  if (portfolio.loading) return <div className="loading-state"><LoaderCircle size={18} /> กำลังอ่านโครงสร้าง workspace...</div>;
  if (portfolio.error) return <div className="error-state"><AlertCircle size={18} /><div><strong>อ่าน Portfolio ไม่สำเร็จ</strong><span>{portfolio.error}</span></div></div>;

  return (
    <section className="portfolio-view brand-first" aria-labelledby="portfolio-title">
      <div className="surface-heading">
        <div>
          <h1 id="portfolio-title">{openProject ? openProject.name : selectedBrand ? selectedBrand.name : 'Brand dashboard'}</h1>
          <p>{openProject ? `ข้อมูลในหน้านี้ถูกจำกัดไว้ที่ ${selectedBrand?.name || 'แบรนด์ที่เลือก'} · เลือกรอบรายงานและ Campaign ก่อนเข้าสู่การวิเคราะห์` : selectedBrand ? `แสดงเฉพาะ Project และข้อมูลที่เกี่ยวข้องกับ ${selectedBrand.name}` : 'เริ่มจากแบรนด์ แล้วไล่ลงไปยัง Project, รอบรายงาน และ Campaign จากหลายบัญชี'}</p>
        </div>
        <div className="portfolio-counts" aria-label={selectedBrand ? `ข้อมูลภายใน ${selectedBrand.name}` : 'Portfolio totals'}><span>{selectedBrand ? 1 : brands.length} brands</span><span>{contextProjects.length} projects</span><span>{contextPeriods.length} periods</span><span>{contextAccounts.size} accounts</span></div>
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
              const projectCampaigns = campaigns.filter(campaign => campaign.project_id === project.id && campaign.brand_ids.includes(selectedBrand.id));
              const projectAccounts = new Set(projectCampaigns.map(campaign => `${campaign.source}:${campaign.source_account_id}`));
              return <button className={`project-card ${selectedProjectId === project.id ? 'selected' : ''}`} type="button" key={project.id} onClick={() => openProjectDetail(project)}>
                <span className="project-card-main"><strong>{project.name}</strong><small>{project.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</small><span>{selectedBrand.name}</span></span>
                <span className="project-mode"><CalendarRange size={15} /> {reportingModeLabel[project.reporting_mode]}</span>
                <span className="project-card-stats"><span><strong>{projectPeriods.length}</strong> รอบรายงาน</span><span><strong>{projectAccounts.size}</strong> บัญชี</span><span><strong>{projectCampaigns.length}</strong> Campaigns</span></span>
                <span className="project-open-cue">เปิด Project <ChevronRight size={14} /></span>
              </button>;
            })}</div>}
          </>}

          {openProject && <>
            <button className="back-action" type="button" onClick={scopeReady ? () => { setScopeReady(false); setStage('period'); } : backToProjects}><ArrowLeft size={15} /> {scopeReady ? 'กลับไปเลือก Period' : 'กลับไป Projects'}</button>
            {!scopeReady && <section className="project-workbench" aria-labelledby="periods-heading">
              <div className="workbench-heading"><div><h2 id="periods-heading">รอบรายงาน</h2><p>แต่ละรอบใช้ช่วงวันที่ของตัวเอง แต่ยังเทียบย้อนหลังภายใน Project เดิมได้</p></div><span>{reportingModeLabel[openProject.reporting_mode]}</span></div>
              {!openProjectPeriods.length ? <div className="compact-empty">ยังไม่มีรอบรายงาน · เพิ่ม Period จากแผงด้านขวา</div> : <div className="period-ledger">{openProjectPeriods.map(period => <button className={selectedPeriodId === period.id ? 'selected' : ''} type="button" key={period.id} onClick={() => choosePeriod(period)}><CalendarRange size={17} /><span><strong>{period.label}</strong><small>{period.date_from} — {period.date_to}</small></span><span className={`period-state ${period.status}`}>{period.status}</span>{selectedPeriodId === period.id ? <Check size={15} /> : <ChevronRight size={15} />}</button>)}</div>}
              <div className="workflow-actions"><span>{selectedPeriod ? `เลือก ${selectedPeriod.label} แล้ว` : 'เลือกรอบรายงานเพื่อไปกำหนด Campaign'}</span><button className="primary-action" type="button" disabled={!selectedPeriod} onClick={() => { setScopeReady(true); setStage('campaign'); }}>ถัดไป: เลือก Campaign <ArrowRight size={15} /></button></div>
            </section>}

            {scopeReady && <section className="project-workbench" aria-labelledby="accounts-heading">
              <div className="workbench-heading"><div><h2 id="accounts-heading">Data scope</h2><p>{selectedPeriod ? `เลือกบัญชีและ Campaign สำหรับ ${selectedPeriod.label}` : 'เลือก Period ก่อน แล้วจึงกำหนดบัญชีและ Campaign ที่จะใช้ในรายงาน'}</p></div><span>{selectedCampaignIds.length} selected</span></div>
              {!openProjectCampaigns.length ? <div className="compact-empty">ยังไม่มี Campaign binding · เพิ่มจากแผงด้านขวา</div> : <><div className="account-ledger">{Object.values(accountGroups).map(group => <div className="account-row" key={`${group.source}:${group.accountId}`}><div className="account-identity"><Cable size={17} /><span><strong>{group.source === 'facebook' ? 'Facebook Ads' : 'File import'}</strong><small>{group.accountId}</small></span></div><div className="account-campaigns selectable">{group.campaigns.map(campaign => <label key={campaign.id}><input type="checkbox" checked={selectedCampaignIds.includes(campaign.id)} onChange={() => toggleCampaign(campaign.id)} /><span>{campaign.name}<small>{campaign.source_campaign_id}</small></span></label>)}</div></div>)}</div><div className="scope-submit"><button className="secondary-action" type="button" onClick={() => { setScopeReady(false); setStage('period'); }}><ArrowLeft size={15} /> ย้อนกลับ</button><span>ระบบจะส่ง Project, Period และ {selectedCampaignIds.length} Campaigns ไปตรวจที่ backend</span><button className="primary-action" type="button" disabled={!selectedCampaignIds.length} onClick={() => onOpenReport({ since: selectedPeriod.date_from, until: selectedPeriod.date_to, projectId: openProject.id, periodId: selectedPeriod.id, campaignIds: selectedCampaignIds })}><BarChart3 size={16} /> เปิดรายงานตาม scope</button></div></>}
            </section>}

            <section className="future-connectors" aria-label="Future advertising connectors"><div><strong>Google Ads</strong><span>ใช้ Account → Campaign → canonical metrics ชุดเดียวกัน</span><small>Planned</small></div><div><strong>TikTok Ads</strong><span>ใช้ Advertiser Account → Campaign → canonical metrics ชุดเดียวกัน</span><small>Planned</small></div></section>
          </>}
        </div>

        <aside className="portfolio-setup" aria-labelledby="portfolio-setup-title">
          <div className="panel-heading compact"><div><h2 id="portfolio-setup-title">{openProject ? `จัดการ ${openProject.name}` : selectedBrand ? `จัดการ ${selectedBrand.name}` : 'เพิ่มแบรนด์'}</h2><p>{openProject ? `อยู่ภายใต้ ${selectedBrand.name}` : selectedBrand ? 'บริบทแบรนด์ถูกล็อกแล้ว' : 'สร้างแบรนด์ก่อนเข้าสู่ขอบเขตงาน'}</p></div></div>
          <div className="setup-tabs" role="tablist" aria-label="Portfolio setup steps">
            {setupStages.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={stage === id} className={stage === id ? 'active' : ''} onClick={() => { setStage(id); setFormError(null); if (id === 'project' && selectedBrand) setProjectForm(current => ({ ...current, brand_ids: [selectedBrand.id] })); if (id === 'period' && openProject) setPeriodForm(current => ({ ...current, project_id: openProject.id })); if (id === 'campaign' && openProject) setCampaignForm(current => ({ ...current, project_id: openProject.id, brand_ids: selectedBrand ? [selectedBrand.id] : openProject.brand_ids })); }} disabled={(id === 'project' && !brands.length) || ((id === 'period' || id === 'campaign') && !projects.length)}>{label}</button>
            ))}
          </div>

          <form className="portfolio-form" onSubmit={submit}>
            {stage === 'brand' && <>
              <label>ชื่อแบรนด์<input required maxLength="120" value={brandForm.name} onChange={event => setBrandForm({ ...brandForm, name: event.target.value })} placeholder="เช่น Northwind" /></label>
              <label>รหัสย่อ <span>ไม่บังคับ</span><input maxLength="40" value={brandForm.code} onChange={event => setBrandForm({ ...brandForm, code: event.target.value })} placeholder="NW" /></label>
            </>}
            {stage === 'project' && <>
              {selectedBrand && <div className="scope-context-lock"><LockKeyhole size={15} /><span><small>แบรนด์ที่เลือก</small><strong>{selectedBrand.name}</strong></span></div>}
              <label>ชื่อโปรเจกต์<input required maxLength="160" value={projectForm.name} onChange={event => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="Q3 Campaign Review" /></label>
              <label>รูปแบบรายงาน<select value={projectForm.reporting_mode} onChange={event => setProjectForm({ ...projectForm, reporting_mode: event.target.value })}><option value="monthly">รายเดือน</option><option value="campaign">ตาม Campaign</option><option value="continuous">ต่อเนื่อง</option></select></label>
              <label>รายละเอียด <span>ไม่บังคับ</span><textarea maxLength="1000" rows="3" value={projectForm.description} onChange={event => setProjectForm({ ...projectForm, description: event.target.value })} /></label>
            </>}
            {stage === 'period' && <>
              {openProject && <div className="scope-context-lock"><LockKeyhole size={15} /><span><small>แบรนด์ · โปรเจกต์</small><strong>{selectedBrand.name} · {openProject.name}</strong></span></div>}
              <label>ชื่อรอบรายงาน<input required maxLength="120" value={periodForm.label} onChange={event => setPeriodForm({ ...periodForm, label: event.target.value })} /></label>
              <label>รูปแบบ<select value={periodForm.cadence} onChange={event => setPeriodForm({ ...periodForm, cadence: event.target.value })}><option value="monthly">รายเดือน</option><option value="custom">กำหนดเอง</option></select></label>
              <div className="portfolio-date-pair"><label>ตั้งแต่<input required type="date" value={periodForm.date_from} max={periodForm.date_to} onChange={event => setPeriodForm({ ...periodForm, date_from: event.target.value })} /></label><label>ถึง<input required type="date" value={periodForm.date_to} min={periodForm.date_from} onChange={event => setPeriodForm({ ...periodForm, date_to: event.target.value })} /></label></div>
            </>}
            {stage === 'campaign' && <>
              {openProject && <div className="scope-context-lock"><LockKeyhole size={15} /><span><small>แบรนด์ · โปรเจกต์</small><strong>{selectedBrand.name} · {openProject.name}</strong></span></div>}
              <label>แหล่งข้อมูล<select value={campaignForm.source} onChange={event => setCampaignForm({ ...campaignForm, source: event.target.value })}><option value="facebook">Facebook API</option><option value="file">Excel / CSV</option></select></label>
              <label>ชื่อ Campaign<input required maxLength="200" value={campaignForm.name} onChange={event => setCampaignForm({ ...campaignForm, name: event.target.value })} /></label>
              <label>Account ID<input required maxLength="128" value={campaignForm.source_account_id} onChange={event => setCampaignForm({ ...campaignForm, source_account_id: event.target.value })} /></label>
              <label>Campaign ID<input required maxLength="128" value={campaignForm.source_campaign_id} onChange={event => setCampaignForm({ ...campaignForm, source_campaign_id: event.target.value })} /></label>
            </>}
            {formError && <div className="inline-error" role="alert"><AlertCircle size={15} />{formError}</div>}
            <button className="primary-action" type="submit" disabled={saving || (stage === 'project' && !selectedBrand && !projectForm.brand_ids.length) || (stage === 'campaign' && !selectedBrand && !campaignForm.brand_ids.length)}>{saving ? <LoaderCircle className="button-spinner" size={16} /> : <Plus size={16} />} เพิ่ม {stage}</button>
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
  const isSavedReport = project?.id?.startsWith('rpt_');
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
    <div className="elements-heading"><div><div className="section-kicker">{isSavedReport ? 'Report workspace' : 'Project workspace'}</div><h2 id="report-elements-title">Working notes</h2><p>เพิ่มบริบทที่ตัวเลขบอกไม่ได้ และเก็บ Next step ไว้กับ{isSavedReport ? 'รายงาน' : ' Project'}นี้โดยตรง</p></div>{project && <span className="project-context-chip">{project.name}</span>}</div>
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

const ClientContentIndex = ({ posts, onSelect }) => <section className="client-content-index" aria-labelledby="client-content-title">
  <div className="client-section-heading"><div><h2 id="client-content-title">Content results</h2><p>กดรายการเพื่อดู metric, scoring reason, creative pattern และคำแนะนำของคอนเทนต์ชิ้นนั้น</p></div><span>{posts.length} contents</span></div>
  <div className="client-content-table-wrap"><table className="client-content-table"><thead><tr><th>Content</th><th>Type</th><th>Format</th><th>Reach</th><th>Engagement</th><th>Score</th><th></th></tr></thead><tbody>{posts.map(post => <tr key={post.id}><th scope="row"><strong>{post.title}</strong><small>{post.date} · {post.day}</small></th><td>{post.type}</td><td>{post.format}</td><td><ExactValue exact={exactNumber(post.reach)}>{fmt(post.reach)}</ExactValue></td><td><ExactValue exact={exactNumber(post.engagement)}>{fmt(post.engagement)}</ExactValue></td><td><span className="content-score" style={{ color: gradeColor(post.grade) }}>{post.score ?? '—'} · {post.grade || 'N/A'}</span></td><td><button type="button" onClick={() => onSelect(post)}>ดูรายละเอียด <ChevronRight size={14} /></button></td></tr>)}</tbody></table></div>
</section>;

const PublicReportView = ({ token }) => {
  const [state, setState] = useState({ loading: true, error: null, snapshot: null });
  const [section, setSection] = useState('overview');
  const [selectedPost, setSelectedPost] = useState(null);
  const [contentLinkCopied, setContentLinkCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchPublicReport(token)
      .then(snapshot => {
        if (!alive) return;
        const requested = sharedContentIdFromLocation();
        const post = requested ? snapshot.report.posts.find(item => item.id === requested) : null;
        setSelectedPost(post || null);
        setSection(post ? 'post' : 'overview');
        setState({ loading: false, error: null, snapshot });
      })
      .catch(error => { if (alive) setState({ loading: false, error: error.message, snapshot: null }); });
    return () => { alive = false; };
  }, [token]);
  useEffect(() => {
    const restore = () => {
      const requested = sharedContentIdFromLocation();
      const post = requested ? state.snapshot?.report?.posts?.find(item => item.id === requested) : null;
      setSelectedPost(post || null);
      setSection(post ? 'post' : 'content');
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [state.snapshot]);
  if (state.loading) return <main className="client-report-shell" style={fontStyle}><div className="client-report-state"><LoaderCircle className="button-spinner" size={18} /> กำลังเปิดรายงาน...</div></main>;
  if (state.error) return <main className="client-report-shell" style={fontStyle}><div className="client-report-state error"><AlertCircle size={18} /><strong>เปิดรายงานไม่ได้</strong><span>{state.error}</span></div></main>;
  const data = state.snapshot.report;
  const openPost = post => {
    const url = new URL(window.location.href);
    url.searchParams.set('content', post.id);
    window.history.pushState({}, '', url);
    setSelectedPost(post);
    setSection('post');
    window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const closePost = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('content');
    window.history.pushState({}, '', url);
    setSelectedPost(null);
    setSection('content');
  };
  const copyContentLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setContentLinkCopied(true);
      window.setTimeout(() => setContentLinkCopied(false), 2000);
    } catch {
      setContentLinkCopied(false);
    }
  };
  return <main className="client-report-shell" style={fontStyle}>
    <header className="client-report-header">
      <div><div className="client-report-brand">Report Analysis</div><h1>{data.scope?.project_name || data.page?.name}</h1><p>{data.scope?.period_label || `${data.range.since} — ${data.range.until}`} · Snapshot อ่านอย่างเดียว</p></div>
      <div className="client-report-actions"><span><Eye size={14} /> Client view</span><button type="button" onClick={() => window.print()}><Printer size={15} /> บันทึก PDF</button></div>
    </header>
    <div className="client-report-meta"><ShieldCheck size={15} /><span>Interactive client view · กดดูรายละเอียดและตัวเลขเต็มได้ แต่แก้ข้อมูล สูตร หรือ Workspace ไม่ได้ · หมดอายุ {new Date(state.snapshot.expires_at).toLocaleDateString('th-TH')}</span></div>
    <nav className="client-report-nav" aria-label="ส่วนต่าง ๆ ของรายงาน">
      <button type="button" className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}>Overview</button>
      <button type="button" className={section === 'content' ? 'active' : ''} onClick={() => setSection('content')}>Content <span>{data.posts.length}</span></button>
      <button type="button" className={section === 'split' ? 'active' : ''} onClick={() => setSection('split')}>Ads vs Organic</button>
      {selectedPost && <button type="button" className={section === 'post' ? 'active' : ''} onClick={() => setSection('post')}>Content detail</button>}
    </nav>
    {section === 'overview' && <><TierOverview data={data} mode="combined" onSelectPost={openPost} /><CampaignResultsTable data={data} readOnly /></>}
    {section === 'content' && <ClientContentIndex posts={data.posts} onSelect={openPost} />}
    {section === 'split' && <section className="client-report-section"><h2>Ads vs Organic</h2><TierAdsOrganic data={data} /></section>}
    {section === 'post' && selectedPost && <section className="client-post-detail"><div className="client-post-actions"><button className="secondary-action" type="button" onClick={closePost}><ArrowLeft size={14} /> กลับไป Content ทั้งหมด</button><button className="secondary-action" type="button" onClick={copyContentLink}>{contentLinkCopied ? <Check size={14} /> : <Link2 size={14} />} {contentLinkCopied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์คอนเทนต์นี้'}</button></div><TierPostDetail post={selectedPost} baseline={data.baseline} /></section>}
  </main>;
};

// ============ MAIN APP ============
export default function Dashboard() {
  const [shareToken] = useState(shareTokenFromLocation);
  const [initialReport] = useState(reportStateFromLocation);
  const [view, setView] = useState(initialReport ? 'report' : 'reports');
  const [refreshKey, setRefreshKey] = useState(0);
  const [tier, setTier] = useState('overview');
  const [selectedPost, setSelectedPost] = useState(null);
  const [mode, setMode] = useState('combined');
  const [periodDraft, setPeriodDraft] = useState(() => initialReport || defaultPeriod());
  const [periodApplied, setPeriodApplied] = useState(() => initialReport || defaultPeriod());
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [activeSavedReport, setActiveSavedReport] = useState(null);
  const [previewSnapshot, setPreviewSnapshot] = useState(null);
  const [cardMetricEdit, setCardMetricEdit] = useState(null);
  const [selectedMetricRowIds, setSelectedMetricRowIds] = useState([]);
  const [portfolio, setPortfolio] = useState({ loading: true, error: null, data: null });
  const [selectedProjectId, setSelectedProjectId] = useState(initialReport?.projectId || null);
  const [reportSourceMode] = useState('demo');
  const [portfolioNavigation, setPortfolioNavigation] = useState(null);
  const [deliveryNotice, setDeliveryNotice] = useState(null);
  const [shareCreating, setShareCreating] = useState(false);
  const [facebook, setFacebook] = useState({ loading: true, connecting: false, error: null, data: null });
  const [facebookNotice, setFacebookNotice] = useState(null);
  const [auth, setAuth] = useState({ loading: true, submitting: false, error: null, configured: false, required: false, authenticated: false });
  const appReady = !shareToken && !auth.loading && (!auth.required || auth.authenticated);
  const rawData = previewSnapshot || state.data;
  const metricScopeSignature = rawData?.campaign_results?.map(row => row.campaign_id).join('|') || '';
  useEffect(() => {
    setSelectedMetricRowIds(rawData?.campaign_results?.map(row => row.campaign_id) || []);
  }, [metricScopeSignature]);
  const data = useMemo(() => applyMetricSelection(rawData, selectedMetricRowIds), [rawData, selectedMetricRowIds]);

  const handleSessionExpiry = (err) => {
    if (err?.status !== 401) return false;
    setAuth(current => ({ ...current, authenticated: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }));
    return true;
  };

  useEffect(() => {
    if (shareToken) return;
    fetchAuthStatus()
      .then(data => setAuth({ loading: false, submitting: false, error: null, ...data }))
      .catch(() => setAuth(current => ({ ...current, loading: false, error: 'ตรวจสอบระบบล็อกอินไม่ได้ กรุณาตรวจว่า backend ทำงานอยู่' })));
  }, [shareToken]);

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
    fetchAnalysis({ ...periodApplied, demo: reportSourceMode === 'demo' })
      .then(data => { if (alive) setState({ loading: false, error: null, data }); })
      .catch(err => {
        if (alive && !handleSessionExpiry(err)) setState({ loading: false, error: err.message, data: null });
      });
    return () => { alive = false; };
  }, [refreshKey, appReady, periodApplied, reportSourceMode]);

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
    setActiveSavedReport(null);
    setPreviewSnapshot(null);
    setPeriodDraft(nextPeriod);
    setPeriodApplied(nextPeriod);
    setSelectedPost(null);
    setTier('overview');
    setView('report');
    setDeliveryNotice(null);
    syncReportLocation(nextPeriod);
  };
  const handleOpenSavedDraft = report => {
    const nextPeriod = { since: report.date_from, until: report.date_to, reportId: report.id };
    setActiveSavedReport(report);
    setPreviewSnapshot(null);
    setPeriodDraft(nextPeriod);
    setPeriodApplied(nextPeriod);
    setSelectedPost(null);
    setTier('overview');
    setView('report');
    setDeliveryNotice(null);
    window.history.replaceState({}, '', window.location.pathname);
  };
  const handleOpenSavedRevision = (report, revision) => {
    setActiveSavedReport(report);
    setPreviewSnapshot(revision.snapshot);
    setPeriodDraft({ since: report.date_from, until: report.date_to, reportId: report.id });
    setSelectedPost(null);
    setTier('overview');
    setView('report');
    setDeliveryNotice({ type: 'success', message: `กำลังดู Revision v${revision.version} แบบ snapshot · การแก้ไขจะไม่เปลี่ยน Revision นี้` });
    window.history.replaceState({}, '', window.location.pathname);
  };
  const publishActiveReport = async () => {
    if (!activeSavedReport) return;
    setShareCreating(true);
    try {
      let reportToPublish = activeSavedReport;
      const savedCampaignIds = activeSavedReport.campaign_ids || [];
      const metricScopeChanged = selectedMetricRowIds.length !== savedCampaignIds.length || selectedMetricRowIds.some(id => !savedCampaignIds.includes(id));
      if (activeSavedReport.project_id && selectedMetricRowIds.length && metricScopeChanged) {
        reportToPublish = await updateSavedReport(activeSavedReport.id, { campaign_ids: selectedMetricRowIds });
      }
      const result = await publishSavedReport(reportToPublish.id, `Published จากหน้ารายงาน ${new Date().toLocaleDateString('th-TH')}`);
      setActiveSavedReport(result.report);
      setDeliveryNotice({ type: 'success', message: `Publish สำเร็จ · เก็บ Revision v${result.revision.version} ในกล่องรายงานแล้ว` });
    } catch (err) {
      if (!handleSessionExpiry(err)) setDeliveryNotice({ type: 'error', message: err.message || 'Publish ไม่สำเร็จ' });
    } finally { setShareCreating(false); }
  };
  const handleSavedPeriodApply = async nextPeriod => {
    if (!activeSavedReport || !nextPeriod.since || !nextPeriod.until || nextPeriod.since > nextPeriod.until) return;
    try {
      const updated = await updateSavedReport(activeSavedReport.id, { date_from: nextPeriod.since, date_to: nextPeriod.until });
      setActiveSavedReport(updated);
      setPreviewSnapshot(null);
      setPeriodApplied({ since: updated.date_from, until: updated.date_to, reportId: updated.id });
      setRefreshKey(key => key + 1);
      setDeliveryNotice({ type: 'success', message: 'อัปเดต Period ของ Draft แล้ว · Revision ที่ Publish ก่อนหน้ายังไม่เปลี่ยน' });
    } catch (err) { if (!handleSessionExpiry(err)) setDeliveryNotice({ type: 'error', message: err.message }); }
  };
  const renameActiveReport = async () => {
    if (!activeSavedReport) return;
    const name = window.prompt('ชื่อรายงาน', activeSavedReport.name)?.trim();
    if (!name || name === activeSavedReport.name) return;
    try {
      const updated = await updateSavedReport(activeSavedReport.id, { name });
      setActiveSavedReport(updated);
      setDeliveryNotice({ type: 'success', message: 'แก้ชื่อ Draft แล้ว · Revision เก่ายังคงชื่อและข้อมูลเดิม' });
    } catch (err) { if (!handleSessionExpiry(err)) setDeliveryNotice({ type: 'error', message: err.message }); }
  };
  const handleProjectSwitch = projectId => {
    setSelectedProjectId(projectId);
    setSelectedPost(null);
    setTier('overview');
    setDeliveryNotice(null);
    const projectPeriods = (portfolio.data?.periods || []).filter(item => item.project_id === projectId).sort((a, b) => b.date_to.localeCompare(a.date_to));
    const projectCampaigns = (portfolio.data?.campaigns || []).filter(item => item.project_id === projectId);
    if (projectPeriods[0] && projectCampaigns.length) {
      handleOpenReportPeriod({ since: projectPeriods[0].date_from, until: projectPeriods[0].date_to, projectId, periodId: projectPeriods[0].id, campaignIds: projectCampaigns.map(item => item.id) });
      return;
    }
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
    if (!periodApplied.projectId || !periodApplied.periodId || !periodApplied.campaignIds?.length) {
      setDeliveryNotice({ type: 'error', message: 'ต้องเลือกรายงานแบบ Project + Period + Campaign ก่อนสร้างลิงก์ลูกค้า' });
      return;
    }
    setShareCreating(true);
    try {
      const selectedCampaignIds = selectedMetricRowIds.filter(id => periodApplied.campaignIds.includes(id));
      const created = await createReportShare({ since: periodApplied.since, until: periodApplied.until, project_id: periodApplied.projectId, period_id: periodApplied.periodId, campaign_ids: selectedCampaignIds.length ? selectedCampaignIds : periodApplied.campaignIds, demo: reportSourceMode === 'demo', expires_days: 30 });
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('share', created.token);
      await navigator.clipboard.writeText(url.toString());
      setDeliveryNotice({ type: 'success', message: `สร้าง Client view แบบอ่านอย่างเดียวและคัดลอกแล้ว · หมดอายุ ${new Date(created.expires_at).toLocaleDateString('th-TH')}` });
    } catch (err) {
      if (!handleSessionExpiry(err)) setDeliveryNotice({ type: 'error', message: err.message || 'สร้างลิงก์ลูกค้าไม่สำเร็จ' });
    } finally {
      setShareCreating(false);
    }
  };
  const goPreviousTier = () => {
    if (tier === 'post') setTier('content');
    else if (tier === 'split') setTier('content');
    else if (tier === 'content') setTier('overview');
    else if (activeSavedReport) setView('reports');
    else returnToReportScope();
  };
  const goNextTier = () => {
    if (tier === 'overview') setTier('content');
    else if (tier === 'content') setTier('split');
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
  const { loading, error } = state;
  const selectedProject = portfolio.data?.projects.find(project => project.id === selectedProjectId) || null;
  const viewTitles = { reports: 'Report library', report: 'Facebook Performance', portfolio: 'Brands & projects', sources: 'Data workspace' };

  if (shareToken) return <PublicReportView token={shareToken} />;

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
            {view === 'report' && !activeSavedReport && (portfolio.data?.projects.length > 0 ? <label className="project-switcher"><span>Project</span><select value={selectedProjectId || ''} onChange={event => handleProjectSwitch(event.target.value)}>{portfolio.data.projects.filter(project => project.status === 'active').map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : <button className="secondary-action" type="button" onClick={() => setView('portfolio')}><FolderKanban size={15} /> ตั้งค่า Project</button>)}
            <button className="data-health-button" onClick={() => setView('sources')}>
              <span className={`health-indicator ${error ? 'error' : ''}`}></span>
              {error ? 'Data source error' : data?.demo ? 'Demo source active' : 'Sources healthy'}
            </button>
          </div>
        </header>

        <div className="workspace-content">
          {view === 'reports' ? (
            <ReportLibraryView portfolio={portfolio} onOpenDraft={handleOpenSavedDraft} onOpenRevision={handleOpenSavedRevision} onSessionExpiry={handleSessionExpiry} />
          ) : view === 'portfolio' ? (
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
                    <h1>{activeSavedReport?.name || data?.page?.name || 'Performance Analyzer'}</h1>
                    {activeSavedReport && <button className="report-title-edit" type="button" onClick={renameActiveReport} aria-label="แก้ชื่อรายงาน"><Pencil size={13} /></button>}
                    {data?.demo && <span className="demo-badge">Demo simulation</span>}
                    {activeSavedReport && <span className={`report-status ${activeSavedReport.status}`}>{activeSavedReport.status === 'published' ? `Published · v${activeSavedReport.current_revision}` : 'Draft'}</span>}
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

              <PeriodControl value={periodDraft} onChange={setPeriodDraft} onApply={activeSavedReport ? handleSavedPeriodApply : handlePeriodApply} loading={loading} />
              {data?.scope && <div className="scope-evidence" role="status"><ShieldCheck size={16} /><div><strong>{data.scope.project_name} · {data.scope.period_label}</strong><span>{data.scope.campaigns.length} Campaigns จาก {new Set(data.scope.campaigns.map(campaign => `${campaign.source}:${campaign.source_account_id}`)).size} accounts ผ่าน backend validation</span></div></div>}

              <section className="report-delivery" aria-label="ส่งออกรายงาน">
                <div><strong>{activeSavedReport ? 'จัดเก็บและส่งมอบรายงาน' : 'ส่งรายงานให้ลูกค้า'}</strong><span>{activeSavedReport ? 'Submit จะสร้าง Revision ใหม่ในกล่องรายงาน · ข้อมูลเก่าไม่ถูกเขียนทับ' : 'CSV สำหรับตรวจข้อมูล · PDF สำหรับส่งไฟล์ · Client link เป็น snapshot อ่านอย่างเดียว 30 วัน'}</span></div>
                <div className="report-delivery-actions">
                  {activeSavedReport && <button className="publish-report-button" type="button" onClick={publishActiveReport} disabled={!data || shareCreating}><Check size={15} /> {activeSavedReport.current_revision ? 'Publish Revision ใหม่' : 'Submit & Publish'}</button>}
                  {!activeSavedReport && <button type="button" onClick={copyReportLink} disabled={!data || shareCreating}>{shareCreating ? <LoaderCircle className="button-spinner" size={15} /> : <Share2 size={15} />} {shareCreating ? 'กำลังสร้าง...' : 'สร้าง Client link'}</button>}
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
                <button className={tier === 'content' ? 'active' : ''} onClick={() => setTier('content')}><span>2</span> Content table</button>
                <ChevronRight className="tier-chevron" size={13} />
                <button className={tier === 'split' ? 'active' : ''} onClick={() => setTier('split')}><span>3</span> Ads vs Organic</button>
                <ChevronRight className="tier-chevron" size={13} />
                <button className={tier === 'post' ? 'active' : ''} onClick={() => selectedPost && setTier('post')} disabled={!selectedPost}>
                  <span>4</span> Post deep-dive {!selectedPost && <small>เลือกคอนเทนต์ก่อน</small>}
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
                    {tier === 'overview' && <>{cardMetricEdit && <CardMetricEditor data={data} metric={cardMetricEdit} onClose={() => setCardMetricEdit(null)} onRefresh={() => setRefreshKey(key => key + 1)} onSessionExpiry={handleSessionExpiry} />}<TierOverview data={data} mode={mode} onSelectPost={handleSelect} onEditMetric={mode === 'combined' ? setCardMetricEdit : null} /><CampaignResultsTable data={data} scopeRows={rawData?.campaign_results || []} selectedRowIds={selectedMetricRowIds} onSelectionChange={setSelectedMetricRowIds} onRefresh={() => setRefreshKey(key => key + 1)} onSessionExpiry={handleSessionExpiry} /></>}
                    {tier === 'content' && <ClientContentIndex posts={applyMode(data.posts, mode)} onSelect={handleSelect} />}
                    {tier === 'split' && <TierAdsOrganic data={data} />}
                    {tier === 'post' && selectedPost && <TierPostDetail post={selectedPost} baseline={data.baseline} />}
                  </>
                )}
              </div>
              <nav className="report-flow-actions" aria-label="ย้อนกลับและไปต่อในรายงาน">
                <button className="secondary-action" type="button" onClick={goPreviousTier}><ArrowLeft size={15} /> {tier === 'overview' ? (activeSavedReport ? 'กลับกล่องรายงาน' : 'กลับไปเลือก Scope') : tier === 'content' ? 'Overview' : tier === 'split' ? 'Content table' : 'Content table'}</button>
                <span>{tier === 'overview' ? 'ขั้นถัดไปดูรายการคอนเทนต์ทั้งหมด' : tier === 'content' ? 'กดรายการเพื่อเปิดรายละเอียด หรือไปต่อเพื่อเทียบ Paid/Organic' : tier === 'split' && !selectedPost ? 'เลือกคอนเทนต์จากตารางเพื่อเปิด Deep-dive' : tier === 'split' ? 'พร้อมดูรายละเอียดคอนเทนต์ที่เลือก' : 'ถึงขั้นสุดท้ายของรายงานแล้ว'}</span>
                {tier !== 'post' && <button className="primary-action" type="button" onClick={goNextTier} disabled={tier === 'split' && !selectedPost}>{tier === 'overview' ? 'ถัดไป: Content table' : tier === 'content' ? 'ถัดไป: Ads vs Organic' : 'ถัดไป: Post deep-dive'} <ArrowRight size={15} /></button>}
              </nav>
              {data && <div className="print-report" aria-hidden="true">
                <h2>Overview</h2>
                <TierOverview data={data} mode={mode} onSelectPost={() => {}} />
                <CampaignResultsTable data={data} readOnly />
                <h2>Content results</h2>
                <ClientContentIndex posts={applyMode(data.posts, mode)} onSelect={() => {}} />
                <h2>Ads vs Organic</h2>
                <TierAdsOrganic data={data} />
                {selectedPost && <><h2>Post deep-dive</h2><TierPostDetail post={selectedPost} baseline={data.baseline} /></>}
              </div>}
              <ReportElementsPanel project={activeSavedReport ? { id: activeSavedReport.id, name: activeSavedReport.name } : selectedProject} onOpenPortfolio={() => setView(activeSavedReport ? 'reports' : 'portfolio')} onSessionExpiry={handleSessionExpiry} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
