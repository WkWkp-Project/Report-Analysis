import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Calendar, Filter, TrendingUp, TrendingDown, AlertCircle, AlertTriangle, CheckCircle2, Bookmark, Share2, MessageCircle, Eye, EyeOff, Play, Image, LayoutGrid, Link2, Heart, Bolt, Copy, Trophy, FileSpreadsheet, FileText, Sparkles, Target, Info, Repeat } from 'lucide-react';

// ============ MOCK DATA ============
const PAGE_BASELINE = {
  ER: 3.2, save: 1.2, share: 0.69, comment_sentiment: 0.34,
  CPE: 4.60, CPM: 226, hide_rate: 0.08, frequency: 1.8,
  follower: 312000, posts_90d: 47
};

const POSTS = [
  {
    id: '102_84', title: '5 เมนูข้าวเช้าทำง่าย เสร็จใน 10 นาที',
    format: 'Reel', length: 22, type: 'boosted', objective: 'awareness',
    date: '14 มี.ค. 2026', time: '19:30', day: 'ศุกร์',
    impressions: 241803, reach: 184256, frequency: 1.31,
    reach_organic: 94329, reach_paid: 59012, reach_viral: 28914,
    views_3s: 198442, views_15s: 142103, views_completion: 94517,
    avg_watch: 14.2, unique_viewers: 156884, sound_on: 71,
    engagement: 23061, shares: 3148, saves: 7082,
    reactions: { like: 7002, love: 2483, wow: 1012, haha: 567, sad: 145, angry: 78 },
    comments: 1544, comment_avg_words: 18, sentiment: 0.71, question_rate: 31,
    spend: 43890, cpm: 149, cpe: 1.92,
    hide_post: 142, report_spam: 3, hide_all: 21,
    score: 94, grade: 'A',
    score_components: {
      engagement: { value: 38.4, max: 40, reason: 'ER 12.5% ÷ baseline 3.2% = 3.91× → p98 → 38.4' },
      reach: { value: 21.8, max: 25, reason: 'Reach 184K ÷ follower 312K = 59% (sweet spot 50–70%) · viral 0.17 · เสีย 3.2 จุดจาก frequency 1.31' },
      save_share: { value: 19.4, max: 20, reason: 'save 3.84% + share 1.71% = 5.55% · baseline 1.2% = 4.6× → p99' },
      comment: { value: 14.4, max: 15, reason: '1,544 cmts · avg 18 คำ (baseline 6) · sentiment +0.71 · question 31% → p96' }
    },
    summary: 'โพสต์นี้ดีในทุก dimension จุดเด่นสุดคือ save + share rate 4.6× baseline — คอนเทนต์มีคุณค่าระยะยาว เสีย 6 จุดจาก frequency เริ่มเกิน target'
  },
  {
    id: '102_77', title: 'รีวิว 7 ร้านกาแฟย่านอารีย์ ที่ต้องไปก่อนตาย',
    format: 'Carousel', type: 'organic', objective: 'organic',
    date: '21 ก.พ. 2026', time: '11:00', day: 'เสาร์',
    impressions: 108411, reach: 91823, frequency: 1.18,
    reach_organic: 91823, reach_paid: 0, reach_viral: 18421,
    engagement: 10284, shares: 1928, saves: 1858,
    reactions: { like: 4421, love: 982, wow: 421, haha: 152, sad: 22, angry: 8 },
    comments: 502, comment_avg_words: 14, sentiment: 0.62, question_rate: 22,
    spend: 0, cpm: null, cpe: null,
    hide_post: 88, report_spam: 1, hide_all: 12,
    score: 87, grade: 'B'
  },
  {
    id: '102_41', title: 'โปรโมชั่นเปิดสาขาใหม่ ลด 30% สัปดาห์แรก พร้อมเงื่อนไขครบ คลิกที่ลิงก์เพื่อจองคิว',
    format: 'Photo', type: 'ad', objective: 'conversion',
    date: '3 ก.พ. 2026', time: '14:00', day: 'อังคาร',
    impressions: 178240, reach: 37133, frequency: 4.8,
    reach_organic: 0, reach_paid: 37133, reach_viral: 0,
    engagement: 446, shares: 24, saves: 67,
    reactions: { like: 188, love: 12, wow: 4, haha: 8, sad: 21, angry: 18 },
    comments: 38, comment_avg_words: 11, sentiment: -0.21, question_rate: 8,
    spend: 18420, cpm: 103, cpe: 41.30,
    hide_post: 152, report_spam: 14, hide_all: 47,
    score: 41, grade: 'D'
  },
  {
    id: '102_82', title: 'เมนูใหม่: ลาเต้กล้วยหอมหมักน้ำผึ้ง', format: 'Photo', type: 'organic', objective: 'organic',
    date: '8 มี.ค. 2026', time: '10:30', day: 'อาทิตย์',
    reach: 47210, engagement: 1984, shares: 124, saves: 287, comments: 612, score: 72, grade: 'C'
  },
  {
    id: '102_88', title: '3 เคล็ดลับเก็บผักให้สดนาน 2 สัปดาห์', format: 'Reel', length: 18, type: 'boosted', objective: 'awareness',
    date: '7 มี.ค. 2026', time: '19:00', day: 'ศุกร์',
    reach: 142800, engagement: 14728, shares: 2104, saves: 4920, comments: 1102, score: 88, grade: 'B'
  },
  {
    id: '102_71', title: 'แกะกล่อง! เครื่องครัว gadget ที่ต้องมีในปี 2026', format: 'Reel', length: 35, type: 'organic', objective: 'organic',
    date: '24 ก.พ. 2026', time: '20:00', day: 'จันทร์',
    reach: 68420, engagement: 3812, shares: 412, saves: 928, comments: 284, score: 76, grade: 'C'
  }
];

const FORMAT_PERF = [
  { format: 'Reel', ER: 12.3, count: 8, color: '#C2410C' },
  { format: 'Carousel', ER: 7.1, count: 11, color: '#7C3AED' },
  { format: 'Video', ER: 5.4, count: 6, color: '#0F766E' },
  { format: 'Photo', ER: 4.2, count: 18, color: '#525252' },
  { format: 'Link', ER: 2.1, count: 4, color: '#737373' },
];

const CORRELATIONS = [
  { name: 'ตัวเลขใน caption', value: 0.82, positive: true },
  { name: 'วิดีโอ < 30 วินาที', value: 0.74, positive: true },
  { name: 'มี CTA ในประโยคแรก', value: 0.62, positive: true },
  { name: 'โพสต์ช่วงเย็น', value: 0.43, positive: true },
  { name: 'ความยาว caption', value: 0.12, positive: true },
  { name: 'จำนวน hashtag', value: -0.18, positive: false },
  { name: 'แท็กแบรนด์อื่น', value: -0.46, positive: false },
];

const TIME_HEATMAP = [
  { day: 'จ', slots: [1, 2, 1, 3, 2, 1] },
  { day: 'อ', slots: [1, 2, 3, 3, 2, 1] },
  { day: 'พ', slots: [1, 2, 2, 3, 4, 2] },
  { day: 'พฤ', slots: [1, 3, 2, 3, 3, 1] },
  { day: 'ศ', slots: [2, 3, 3, 4, 4, 3] },
  { day: 'ส', slots: [1, 3, 3, 3, 2, 1] },
  { day: 'อา', slots: [1, 4, 3, 2, 2, 1] },
];

const CREATIVE_PATTERNS = [
  { label: 'Hook pattern', value: 'ขึ้นต้นด้วยตัวเลข', detail: 'พบใน 8/10 top posts · +89% ER' },
  { label: 'Visual', value: 'First frame มีหน้าคน', detail: 'พบใน 7/10 · +64% reach' },
  { label: 'Duration', value: '15–28 วินาที', detail: 'sweet spot · completion 76%' },
  { label: 'Caption tone', value: 'ถามคำถามท้ายโพสต์', detail: 'comment rate +2.4×' },
];

const COST_TABLE = [
  { row: 'Reel · awareness', spend: 32000, cpm: 142, cpe: 1.92, roas: 5.8, good: true },
  { row: 'Carousel · traffic', spend: 18000, cpm: 168, cpe: 2.80, roas: 4.6, good: true },
  { row: 'Video · conversion', spend: 22000, cpm: 204, cpe: 3.40, roas: 3.1, good: null },
  { row: 'Photo · engagement', spend: 12000, cpm: 238, cpe: 4.60, roas: 2.2, good: false },
];

// ============ FORMATTERS ============
const fmt = (n) => {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
};
const fmtMoney = (n) => n === null ? 'N/A' : '฿' + (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toLocaleString());
const fmtNum = (n, d = 0) => n === null ? 'N/A' : Number(n).toFixed(d);

// ============ ATOMS ============
const fontStyle = {
  fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif'
};
const monoStyle = {
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace'
};

const FormatIcon = ({ format, size = 18, color }) => {
  const icons = {
    Reel: <Play size={size} style={{ color: color || '#C2410C' }} />,
    Carousel: <LayoutGrid size={size} style={{ color: color || '#7C3AED' }} />,
    Photo: <Image size={size} style={{ color: color || '#0F766E' }} />,
    Video: <Play size={size} style={{ color: color || '#0F766E' }} />,
    Link: <Link2 size={size} style={{ color: color || '#737373' }} />
  };
  return icons[format] || <Image size={size} />;
};

const FormatBg = (format) => ({
  Reel: '#FDF1E5', Carousel: '#F0EAFE', Photo: '#E1F5EE', Video: '#E1F5EE', Link: '#F5F5F4'
}[format] || '#F5F5F4');

const FormatColor = (format) => ({
  Reel: '#9A3412', Carousel: '#5B21B6', Photo: '#0F766E', Video: '#0F766E', Link: '#525252'
}[format] || '#525252');

const TypeBadge = ({ type }) => {
  const styles = {
    boosted: { bg: '#E1F5EE', color: '#0F766E', label: 'Boosted' },
    organic: { bg: '#F5F5F4', color: '#525252', label: 'Organic' },
    ad: { bg: '#FEE2E2', color: '#991B1B', label: 'Ad only' }
  };
  const s = styles[type] || styles.organic;
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', background: s.bg, color: s.color, borderRadius: 999, fontWeight: 500 }}>
      {s.label}
    </span>
  );
};

const GradeChip = ({ grade, score }) => {
  const colors = {
    A: { color: '#0F766E', bg: '#E1F5EE' },
    B: { color: '#65A30D', bg: '#ECFCCB' },
    C: { color: '#CA8A04', bg: '#FEF9C3' },
    D: { color: '#C2410C', bg: '#FFEDD5' },
    F: { color: '#991B1B', bg: '#FEE2E2' }
  };
  const c = colors[grade] || colors.C;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 30, fontWeight: 500, color: c.color, lineHeight: 1, ...monoStyle }}>{grade}</div>
      <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2, ...monoStyle }}>{score} / 100</div>
    </div>
  );
};

// ============ TIER 1: OVERVIEW ============
const TierOverview = ({ onSelectPost, mode, setMode }) => {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {['Reach', 'ER', 'Spend', 'ROAS'].map((label, i) => {
          const values = [
            { v: '1.2M', sub: 'Organic 720K · Paid 480K' },
            { v: '5.8%', sub: 'baseline 3.2%' },
            { v: '฿84.2K', sub: 'CPM ฿175 · CPE ฿2.40' },
            { v: '4.2×', sub: 'awareness ads only' }
          ][i];
          return (
            <div key={label} style={{ flex: 1, background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#78716C', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 500, marginTop: 4, ...monoStyle }}>{values.v}</div>
              <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 4 }}>{values.sub}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top performers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {POSTS.slice(0, 4).map(p => (
              <div key={p.id} onClick={() => onSelectPost(p)} style={{ cursor: 'pointer', display: 'flex', gap: 10, padding: 10, background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, alignItems: 'center', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#0F766E'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E7E5E4'}>
                <div style={{ width: 36, height: 36, background: FormatBg(p.format), borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FormatIcon format={p.format} size={18} color={FormatColor(p.format)} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#78716C', marginBottom: 2 }}>{p.date} · {p.day}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 500, color: p.grade === 'A' ? '#0F766E' : p.grade === 'B' ? '#65A30D' : p.grade === 'C' ? '#CA8A04' : '#C2410C', ...monoStyle }}>{p.score}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Engagement rate ตาม format</div>
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FORMAT_PERF.map(f => (
                <div key={f.format}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{f.format} <span style={{ color: '#A8A29E', fontSize: 10 }}>· n={f.count}</span></span>
                    <span style={{ fontWeight: 500, ...monoStyle }}>{f.ER}%</span>
                  </div>
                  <div style={{ height: 5, background: '#F5F5F4', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(f.ER / 12.3) * 100}%`, height: '100%', background: f.color }}></div>
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
            {TIME_HEATMAP.map((row, i) => (
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
          <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>AI insights · 90 วัน</div>
          <div style={{ background: '#F0F9FF', border: '0.5px solid #BAE6FD', borderRadius: 8, padding: 14, height: 'calc(100% - 28px)' }}>
            <ul style={{ fontSize: 12, color: '#075985', margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Reel ทำ ER สูงกว่ารูปนิ่ง 2.9× → เพิ่มสัดส่วน Reel 60%</li>
              <li>peak: ศุกร์ 18–21 และอาทิตย์ 10–12</li>
              <li>โพสต์ขึ้นต้นด้วยตัวเลข ER สูงกว่า 1.8×</li>
              <li>How-to outperform โฆษณาตรงๆ 3.4×</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ TIER 2: ADS vs ORGANIC ============
const TierAdsOrganic = ({ onSelectPost }) => {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#0F766E' }}></div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Organic</div>
            <div style={{ fontSize: 11, color: '#A8A29E', marginLeft: 'auto' }}>n = 27 posts</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Reach" value={fmt(720000)} sub="60% of total" />
            <Row label="ER" value="7.2%" sub="baseline 3.2%" good />
            <Row label="Avg save rate" value="2.8%" sub="baseline 1.2%" good />
            <Row label="Avg comment sentiment" value="+0.62" sub="positive" good />
            <Row label="Viral coefficient" value="0.18" sub="organic spread" />
          </div>
        </div>

        <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#C2410C' }}></div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Paid</div>
            <div style={{ fontSize: 11, color: '#A8A29E', marginLeft: 'auto' }}>n = 20 ads</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Reach" value={fmt(480000)} sub="40% of total" />
            <Row label="ER" value="3.1%" sub="lower (expected · paid sees broader audience)" />
            <Row label="Spend total" value="฿84.2K" />
            <Row label="ROAS (conv. only)" value="3.4×" sub="n = 6 conversion ads" />
            <Row label="Frequency" value="2.4" sub="cap 2.5 · ระวัง" warn />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Dimensional correlation · อะไรสัมพันธ์กับ engagement</div>
        <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CORRELATIONS.map(c => {
              const pct = Math.abs(c.value) * 100;
              return (
                <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 60px', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 12 }}>{c.name}</span>
                  <div style={{ position: 'relative', height: 5, background: '#F5F5F4', borderRadius: 3 }}>
                    {c.value >= 0 ? (
                      <div style={{ position: 'absolute', left: '50%', width: `${pct / 2}%`, height: '100%', background: pct > 30 ? '#0F766E' : '#A8A29E', borderRadius: '0 3px 3px 0' }}></div>
                    ) : (
                      <div style={{ position: 'absolute', right: '50%', width: `${pct / 2}%`, height: '100%', background: pct > 30 ? '#991B1B' : '#A8A29E', borderRadius: '3px 0 0 3px' }}></div>
                    )}
                    <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 9, background: '#D6D3D1' }}></div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'right', color: c.value >= 0.3 ? '#0F766E' : c.value <= -0.3 ? '#991B1B' : '#A8A29E', ...monoStyle }}>
                    {c.value > 0 ? '+' : ''}{c.value.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 12 }}>Pearson correlation · n = 47 posts · ใช้ trim outlier 5%</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Creative pattern · top 10% มีอะไรเหมือนกัน</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {CREATIVE_PATTERNS.map(p => (
            <div key={p.label} style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 10, color: '#78716C', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{p.label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{p.value}</div>
              <div style={{ fontSize: 11, color: '#A8A29E' }}>{p.detail}</div>
            </div>
          ))}
        </div>
      </div>

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
          {COST_TABLE.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px', gap: 8, fontSize: 12, padding: '8px 0', borderTop: i > 0 ? '0.5px solid #F5F5F4' : 'none' }}>
              <div>{r.row}</div>
              <div style={{ textAlign: 'right', ...monoStyle }}>฿{(r.spend / 1000).toFixed(0)}K</div>
              <div style={{ textAlign: 'right', ...monoStyle }}>฿{r.cpm}</div>
              <div style={{ textAlign: 'right', color: r.good === false ? '#991B1B' : r.good ? '#0F766E' : 'inherit', ...monoStyle }}>฿{r.cpe.toFixed(2)}</div>
              <div style={{ textAlign: 'right', color: r.good === false ? '#991B1B' : r.good ? '#0F766E' : 'inherit', ...monoStyle }}>{r.roas}×</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value, sub, good, warn }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6, borderBottom: '0.5px solid #F5F5F4' }}>
    <div>
      <div style={{ fontSize: 12, color: '#57534E' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 2 }}>{sub}</div>}
    </div>
    <div style={{ fontSize: 14, fontWeight: 500, color: good ? '#0F766E' : warn ? '#CA8A04' : 'inherit', ...monoStyle }}>{value}</div>
  </div>
);

// ============ TIER 3: POST DETAIL ============
const TierPostDetail = ({ post }) => {
  const p = POSTS.find(x => x.id === post.id) || POSTS[0];
  const sc = p.score_components;

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, padding: 14, background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, marginBottom: 14 }}>
        <div style={{ width: 64, height: 64, background: FormatBg(p.format), borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FormatIcon format={p.format} size={28} color={FormatColor(p.format)} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, padding: '2px 7px', background: FormatBg(p.format), color: FormatColor(p.format), borderRadius: 999, fontWeight: 500 }}>{p.format}{p.length ? ` · ${p.length}s` : ''}</span>
            <TypeBadge type={p.type} />
            <span style={{ fontSize: 10, padding: '2px 7px', background: '#F5F5F4', color: '#525252', borderRadius: 999 }}>{p.objective}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
          <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 4, ...monoStyle }}>post_id {p.id} · {p.date} {p.time} · ดึง 14 พ.ค. 14:32</div>
        </div>
        <div style={{ paddingLeft: 14, borderLeft: '0.5px solid #E7E5E4' }}>
          <GradeChip grade={p.grade} score={p.score} />
        </div>
      </div>

      {sc && (
        <>
          <SectionTitle num="1" title="Distribution" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricBox label="Impressions" value={fmt(p.impressions)} field="post_impressions" />
              <MetricBox label="Reach unique" value={fmt(p.reach)} field="impressions_unique" />
              <MetricBox label="Frequency" value={fmtNum(p.frequency, 2)} sub="target ≤ 1.2" warn={p.frequency > 1.2} />
              <MetricBox label="Viral reach" value={fmt(p.reach_viral)} sub={`${((p.reach_viral / p.reach) * 100).toFixed(0)}% spread`} />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ background: '#0F766E', width: `${(p.reach_organic / p.reach) * 100}%` }}></div>
                <div style={{ background: '#C2410C', width: `${(p.reach_paid / p.reach) * 100}%` }}></div>
                <div style={{ background: '#7C3AED', width: `${(p.reach_viral / p.reach) * 100}%` }}></div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10 }}>
                <span><span style={{ color: '#0F766E' }}>●</span> Organic {fmt(p.reach_organic)}</span>
                <span><span style={{ color: '#C2410C' }}>●</span> Paid {fmt(p.reach_paid)}</span>
                <span><span style={{ color: '#7C3AED' }}>●</span> Viral {fmt(p.reach_viral)}</span>
              </div>
            </div>
          </div>

          {p.views_3s && (
            <>
              <SectionTitle num="2" title="Video performance" />
              <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <MetricBox label="3s views" value={fmt(p.views_3s)} sub={`${((p.views_3s / p.impressions) * 100).toFixed(0)}% retention`} />
                  <MetricBox label="15s views" value={fmt(p.views_15s)} sub={`${((p.views_15s / p.views_3s) * 100).toFixed(0)}% from 3s`} />
                  <MetricBox label="Completion" value={fmt(p.views_completion)} sub={`${((p.views_completion / p.views_3s) * 100).toFixed(0)}% finished`} />
                  <MetricBox label="Avg watch" value={`${p.avg_watch}s`} sub={`${Math.round((p.avg_watch / p.length) * 100)}% of length`} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #F5F5F4' }}>
                  <MetricBox label="Unique viewers" value={fmt(p.unique_viewers)} mini />
                  <MetricBox label="Sound on" value={`${p.sound_on}%`} mini />
                  <MetricBox label="Replays" value="N/A" mini />
                </div>
              </div>
            </>
          )}

          <SectionTitle num="3" title="Interactions" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
              <MetricBox label="Engagement" value={fmt(p.engagement)} sub={`ER ${((p.engagement / p.reach) * 100).toFixed(1)}% · ${((p.engagement / p.reach * 100) / PAGE_BASELINE.ER).toFixed(1)}× baseline`} good />
              <MetricBox label="Shares" value={fmt(p.shares)} sub={`${((p.shares / p.reach) * 100).toFixed(2)}% rate`} good />
              <MetricBox label="Saves" value={fmt(p.saves)} sub={`${((p.saves / p.reach) * 100).toFixed(2)}% rate`} good />
            </div>

            <div style={{ fontSize: 10, color: '#A8A29E', marginBottom: 6 }}>Reactions · {fmt(p.reactions.like + p.reactions.love + p.reactions.wow + p.reactions.haha + p.reactions.sad + p.reactions.angry)} total</div>
            <div style={{ display: 'flex', height: 14, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
              {[
                { type: 'like', color: '#3B82F6' }, { type: 'love', color: '#EC4899' },
                { type: 'wow', color: '#F59E0B' }, { type: 'haha', color: '#EAB308' },
                { type: 'sad', color: '#A8A29E' }, { type: 'angry', color: '#737373' }
              ].map(r => {
                const total = p.reactions.like + p.reactions.love + p.reactions.wow + p.reactions.haha + p.reactions.sad + p.reactions.angry;
                const pct = (p.reactions[r.type] / total) * 100;
                return <div key={r.type} style={{ background: r.color, width: `${pct}%`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 500 }}>{pct > 8 ? `${r.type} ${fmt(p.reactions[r.type])}` : ''}</div>;
              })}
            </div>
            <div style={{ fontSize: 10, color: '#A8A29E', marginBottom: 12 }}>Wow {fmt(p.reactions.wow)} · Haha {fmt(p.reactions.haha)} · Sad {fmt(p.reactions.sad)} · Angry {fmt(p.reactions.angry)}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>
              <MetricBox label="Comments" value={`${fmt(p.comments)} · avg ${p.comment_avg_words} คำ`} sub={`sentiment +${p.sentiment.toFixed(2)} · ${p.question_rate}% เป็นคำถาม`} mini />
              <MetricBox label="Link clicks" value="N/A" sub="โพสต์ไม่มีลิงก์" mini />
            </div>
          </div>

          <SectionTitle num="4" title={`Ad performance · ${p.objective} only`} />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricBox label="Spend" value={fmtMoney(p.spend)} />
              <MetricBox label="CPM" value={fmtMoney(p.cpm)} sub="–34% vs awareness avg" good />
              <MetricBox label="CPE" value={`฿${p.cpe.toFixed(2)}`} sub="–58% vs awareness avg" good />
              <MetricBox label="ROAS" value="N/A" sub="awareness · ไม่มี purchase" />
            </div>
            <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>เปรียบเทียบเฉพาะกับ ads · {p.objective} (n = 4) ไม่นำไปเทียบ conversion ads</div>
          </div>

          <SectionTitle num="5" title="Negative signals" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricBox label="Hide post" value={`${p.hide_post} · ${((p.hide_post / p.reach) * 100).toFixed(2)}%`} sub="below median" good mini />
              <MetricBox label="Report spam" value={`${p.report_spam} · <0.01%`} sub="excellent" good mini />
              <MetricBox label="Hide all" value={`${p.hide_all} · ${((p.hide_all / p.reach) * 100).toFixed(2)}%`} sub="normal" mini />
              <MetricBox label="Unfollow" value="N/A" sub="field ไม่เปิด" mini />
            </div>
          </div>

          <SectionTitle title="Health check · สรุปสัญญาณ" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: '4px 0', marginBottom: 14 }}>
            <HealthRow icon={<CheckCircle2 size={16} color="#0F766E" />} text={<><b>ER 12.5% · 4.0× baseline</b> — value signal สูงมาก</>} status="ดีเด่น" color="#0F766E" />
            <HealthRow icon={<CheckCircle2 size={16} color="#0F766E" />} text={<><b>Save + share 5.55% · 4.6× baseline</b> — คนเก็บไปดูซ้ำ ส่งต่อ</>} status="ดีเด่น" color="#0F766E" />
            <HealthRow icon={<CheckCircle2 size={16} color="#0F766E" />} text={<><b>CPE ฿1.92 · –58% vs avg</b> — paid efficiency ดีมาก</>} status="ดี" color="#0F766E" />
            <HealthRow icon={<CheckCircle2 size={16} color="#0F766E" />} text={<><b>Sentiment +0.71</b> — คอมเมนต์เชิงบวก ถามต่อ</>} status="ดี" color="#0F766E" />
            <HealthRow icon={<CheckCircle2 size={16} color="#0F766E" />} text={<><b>Viral reach 17%</b> — organic spread ดี</>} status="ดี" color="#0F766E" />
            <HealthRow icon={<AlertTriangle size={16} color="#CA8A04" />} text={<><b>Frequency 1.31 · เกิน target 1.2</b> — ระวัง fatigue ถ้ารันต่อ</>} status="เตือน" color="#CA8A04" last />
          </div>

          <SectionTitle title="Score breakdown · 4 component" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16, marginBottom: 14 }}>
            <ScoreRow label="Engagement quality · 40%" score={sc.engagement.value} max={sc.engagement.max} reason={sc.engagement.reason} />
            <ScoreRow label="Reach efficiency · 25%" score={sc.reach.value} max={sc.reach.max} reason={sc.reach.reason} />
            <ScoreRow label="Save + share · 20%" score={sc.save_share.value} max={sc.save_share.max} reason={sc.save_share.reason} />
            <ScoreRow label="Comment quality · 15%" score={sc.comment.value} max={sc.comment.max} reason={sc.comment.reason} last />
            <div style={{ marginTop: 14, padding: '12px 14px', background: '#E1F5EE', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#064E3B', marginBottom: 4, ...monoStyle }}>รวม {p.score}.0 / 100 · Grade {p.grade}</div>
              <div style={{ fontSize: 11, color: '#065F46', lineHeight: 1.6 }}>{p.summary}</div>
            </div>
          </div>

          <SectionTitle title="Compare · vs โพสต์เฉลี่ยของเพจ" />
          <div style={{ background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#0F766E', marginBottom: 10 }}>โพสต์นี้</div>
                <CompareRow label="ER" value="12.5%" />
                <CompareRow label="Save" value="3.84%" />
                <CompareRow label="Share" value="1.71%" />
                <CompareRow label="Comment sent." value="+0.71" />
                <CompareRow label="CPE" value="฿1.92" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 28, alignItems: 'center', ...monoStyle, fontSize: 10 }}>
                <div style={{ color: '#0F766E' }}>+291%</div>
                <div style={{ color: '#0F766E' }}>+220%</div>
                <div style={{ color: '#0F766E' }}>+147%</div>
                <div style={{ color: '#0F766E' }}>+109%</div>
                <div style={{ color: '#0F766E' }}>–58%</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>page avg (90d)</div>
                <CompareRow label="ER" value="3.2%" muted />
                <CompareRow label="Save" value="1.2%" muted />
                <CompareRow label="Share" value="0.69%" muted />
                <CompareRow label="Comment sent." value="+0.34" muted />
                <CompareRow label="CPE" value="฿4.60" muted />
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 12, paddingTop: 10, borderTop: '0.5px solid #F5F5F4' }}>เปรียบเทียบกับ awareness ads ของเพจเอง · n = 12 · ไม่นำมาเทียบกับ industry benchmark</div>
          </div>

          <SectionTitle title="Recommendations · ต่อเนื่อง 3 ระยะ" />

          <RecBlock
            icon={<Bolt size={16} color="#0F766E" />}
            title="ตอนนี้ · ขณะแอดยังรัน"
            color="#0F766E" bg="#E1F5EE" textColor="#064E3B"
            items={[
              'เพิ่ม budget +30% · CPE ที่ ฿1.92 (–58% vs avg) มี room ก่อน frequency แตะ cap',
              'ขยาย audience +25% (similar interest) · คุม frequency ไว้ ≤ 2.0',
              'เปิด Advantage+ placements · CPM น่าจะลดเพิ่ม',
              'Cap duration ที่ 7 วันจากนี้ · หลังจากนั้นเสี่ยง fatigue'
            ]}
            action="เพิ่ม budget ผ่าน Ads MCP"
            actionIcon={<TrendingUp size={12} />}
          />

          <RecBlock
            icon={<Copy size={16} color="#CA8A04" />}
            title="โพสต์ถัดไป · ทำซ้ำ pattern"
            color="#CA8A04" bg="#FEF3C7" textColor="#713F12"
            items={[
              'Format: Reel 15–28 วินาที (sweet spot · completion 76%)',
              'Hook: ขึ้นต้นด้วยตัวเลข ("5 X...", "3 X...") · correlation +0.82',
              'First frame: มีหน้าคน · +64% reach ใน top performers',
              'ปิดท้าย: คำถาม · comment rate +2.4×',
              'หัวข้อต่อยอด: "5 เมนูเย็น", "5 เมนูเด็ก", "3 เคล็ดลับเก็บผัก" — keep formula',
              'เวลา: ศุกร์ 19:00 หรืออาทิตย์ 10:30'
            ]}
            action="สร้าง brief อัตโนมัติ"
            actionIcon={<Sparkles size={12} />}
          />

          <RecBlock
            icon={<Trophy size={16} color="#525252" />}
            title="ระยะยาว · template ของแบรนด์"
            color="#A8A29E" bg="#F5F5F4" textColor="#44403C"
            items={[
              '"List-based how-to Reel" คือ winning template · ปรับ content mix เป็น 60%',
              'อย่ารัน creative เดิม > 10 วัน · rotate ทุก 7–10 วัน',
              'ทดสอบ Reel ความยาว 45s, 60s เพื่อหา ceiling ใหม่',
              'Repurpose: คนเก็บ 7K — ทำ carousel "ครบทุกเมนู" ต่อยอด'
            ]}
          />

          <details style={{ background: '#F5F5F4', borderRadius: 8, padding: '10px 14px', marginTop: 4 }}>
            <summary style={{ fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Data quality · ที่มาของทุกตัวเลข</summary>
            <div style={{ fontSize: 11, color: '#57534E', marginTop: 10, lineHeight: 1.7 }}>
              <div><b>Source:</b> Graph API v19.0 · ดึง 14 พ.ค. 2026 14:32 · token: page_admin_long_lived</div>
              <div><b>Available fields (29):</b> impressions · impressions_unique · reach · reach_organic · reach_paid · reach_viral · video_views (3s/15s/30s/complete) · video_avg_watch_time · video_unique_viewers · reactions (by_type) · comments · shares · saves · post_clicks · hide · spam · ad_spend · ad_cpm · ad_cpe · ad_frequency · ...</div>
              <div><b>N/A fields:</b> link_clicks (โพสต์ไม่มีลิงก์) · ROAS (objective ไม่ใช่ conversion) · unfollow_attribution (field ยังไม่เปิด) · video_replays</div>
              <div><b>Baseline:</b> page rolling 90 วัน · n = 47 posts · recomputed ทุก dashboard load</div>
            </div>
          </details>
        </>
      )}

      {!sc && (
        <div style={{ padding: 30, textAlign: 'center', background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: '#78716C' }}>โพสต์นี้ยังไม่มี detailed view (mock data จำกัด)</div>
          <div style={{ fontSize: 11, color: '#A8A29E', marginTop: 6 }}>ใน production จะแสดงครบทุกโพสต์ — ตอนนี้แสดงครบเฉพาะ "5 เมนูข้าวเช้า"</div>
        </div>
      )}
    </div>
  );
};

const SectionTitle = ({ num, title }) => (
  <div style={{ fontSize: 12, fontWeight: 500, color: '#57534E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    {num && <span style={{ ...monoStyle, marginRight: 6 }}>{num} ·</span>}{title}
  </div>
);

const MetricBox = ({ label, value, sub, field, good, warn, mini }) => (
  <div>
    <div style={{ fontSize: 10, color: '#A8A29E', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    <div style={{ fontSize: mini ? 13 : 16, fontWeight: 500, marginTop: 2, color: warn ? '#CA8A04' : 'inherit', ...monoStyle }}>{value}</div>
    {(sub || field) && <div style={{ fontSize: 10, color: good ? '#0F766E' : '#A8A29E', marginTop: 2 }}>{field || sub}</div>}
  </div>
);

const HealthRow = ({ icon, text, status, color, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: last ? 'none' : '0.5px solid #F5F5F4' }}>
    {icon}
    <div style={{ fontSize: 12, flex: 1 }}>{text}</div>
    <span style={{ fontSize: 10, color }}>{status}</span>
  </div>
);

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

const RecBlock = ({ icon, title, color, bg, textColor, items, action, actionIcon }) => (
  <div style={{ background: bg, padding: '12px 14px', borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0', marginBottom: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      {icon}
      <div style={{ fontSize: 13, fontWeight: 500, color: textColor }}>{title}</div>
    </div>
    <ul style={{ fontSize: 12, color: textColor, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
    {action && (
      <button style={{ fontSize: 11, padding: '5px 12px', marginTop: 8, background: 'white', border: `0.5px solid ${color}`, color: textColor, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
        {actionIcon} {action}
      </button>
    )}
  </div>
);

// ============ MAIN APP ============
export default function Dashboard() {
  const [tier, setTier] = useState('overview');
  const [selectedPost, setSelectedPost] = useState(null);
  const [mode, setMode] = useState('combined');

  const handleSelect = (post) => {
    setSelectedPost(post);
    setTier('post');
  };

  return (
    <div style={{ ...fontStyle, background: '#FAFAF9', minHeight: '100vh', padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');
        details > summary { list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
        details > summary::before { content: '▸'; display: inline-block; margin-right: 6px; transition: transform 0.15s; }
        details[open] > summary::before { transform: rotate(90deg); }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 14, borderBottom: '0.5px solid #E7E5E4' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Bangkok Bites · Performance Analyzer</div>
            <div style={{ fontSize: 11, color: '#A8A29E', marginTop: 3 }}>47 posts · 12 boosted · 8 pure ads · 1 ม.ค. – 31 มี.ค. 2026</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'white', border: '0.5px solid #E7E5E4', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              <Calendar size={14} />
              <span style={monoStyle}>1 ม.ค. – 31 มี.ค.</span>
            </div>
            <div style={{ display: 'flex', gap: 3, padding: 3, background: '#F5F5F4', borderRadius: 6 }}>
              {[
                { id: 'combined', label: 'รวม' },
                { id: 'organic', label: 'Organic' },
                { id: 'paid', label: 'Paid' }
              ].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)} style={{
                  fontSize: 11, padding: '5px 11px', borderRadius: 4,
                  background: mode === m.id ? 'white' : 'transparent',
                  color: mode === m.id ? '#1C1917' : '#78716C',
                  fontWeight: mode === m.id ? 500 : 400,
                  border: 'none', cursor: 'pointer',
                  boxShadow: mode === m.id ? '0 0 0 0.5px #E7E5E4' : 'none'
                }}>{m.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 18, fontSize: 12, alignItems: 'center' }}>
          {tier !== 'overview' && (
            <button onClick={() => setTier('overview')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#78716C', padding: '4px 0', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={14} /> Back
            </button>
          )}
          <button onClick={() => setTier('overview')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: tier === 'overview' ? '#1C1917' : '#A8A29E', fontWeight: tier === 'overview' ? 500 : 400, padding: '4px 8px', borderRadius: 4 }}>1 · Overview</button>
          <ChevronRight size={12} color="#D6D3D1" />
          <button onClick={() => setTier('split')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: tier === 'split' ? '#1C1917' : '#A8A29E', fontWeight: tier === 'split' ? 500 : 400, padding: '4px 8px', borderRadius: 4 }}>2 · Ads vs Organic</button>
          <ChevronRight size={12} color="#D6D3D1" />
          <button onClick={() => selectedPost && setTier('post')} disabled={!selectedPost} style={{ background: 'none', border: 'none', cursor: selectedPost ? 'pointer' : 'not-allowed', color: tier === 'post' ? '#1C1917' : '#A8A29E', fontWeight: tier === 'post' ? 500 : 400, padding: '4px 8px', opacity: selectedPost ? 1 : 0.5, borderRadius: 4 }}>
            3 · Post deep-dive {!selectedPost && '(เลือกโพสต์ก่อน)'}
          </button>
        </div>

        {tier === 'overview' && <TierOverview onSelectPost={handleSelect} mode={mode} setMode={setMode} />}
        {tier === 'split' && <TierAdsOrganic onSelectPost={handleSelect} />}
        {tier === 'post' && selectedPost && <TierPostDetail post={selectedPost} />}

      </div>
    </div>
  );
}
