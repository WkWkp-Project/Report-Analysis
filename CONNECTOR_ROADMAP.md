# Multi-channel connector roadmap

## Stable reporting hierarchy

```text
Workspace
  └── Brand
        └── Project
              ├── Report period
              └── Data scope
                    ├── Provider connection
                    ├── External account(s)
                    └── Campaign binding(s)
```

Campaign ไม่ใช่ parent ของ Project เพราะ Project เดียวอาจรวมหลาย Campaign, หลาย Ad Accounts และหลาย provider ส่วน Report period เป็นรอบเวลาแยกจาก Campaign เพื่อให้รายงานรายเดือนเปรียบเทียบย้อนหลังได้โดยไม่สร้าง Project ซ้ำ

## Connection ownership

- OAuth connection อยู่ระดับ Workspace และ token อยู่ backend เท่านั้น
- External account ถูก discover จาก connection แล้วผู้ใช้เลือกผูกกับ Project
- Project หนึ่งผูกหลายบัญชีจาก provider เดียวกันได้
- Campaign binding ใช้ `(provider, external_account_id, external_campaign_id)` เป็น identity ไม่ใช้ชื่อ Campaign เป็น key
- Brand assignment เป็น explicit mapping และ Campaign หนึ่งรองรับหลาย Brand ภายใน Project

## Provider adapter contract

Facebook, Google Ads และ TikTok Ads ควรใช้ interface เดียวกัน:

1. `authorize()` — เริ่ม OAuth ด้วย state ที่ผูก browser และใช้ครั้งเดียว
2. `discover_accounts()` — คืนบัญชีที่ผู้ใช้มีสิทธิ์อ่าน
3. `discover_campaigns(account_id, date_range)` — คืน Campaign สำหรับการเลือก scope
4. `fetch_insights(scope)` — ดึงข้อมูลตาม account, campaign และ period ที่ผ่าน validation
5. `normalize()` — แปลงเป็น canonical metric model พร้อม source lineage
6. `refresh_or_reauthorize()` — จัดการ token lifecycle โดยไม่ส่ง secret ไป frontend

ไฟล์ Excel/CSV ใช้ flow เดียวกันตั้งแต่ mapping เป็นต้นไป แต่แทน discovery ด้วย file preview และ column mapping

## Canonical minimum fields

- `provider`
- `external_account_id`
- `external_campaign_id`
- `project_id`
- `brand_ids[]`
- `period_id`, `date_from`, `date_to`
- `metric_name`, `metric_value`, `currency`
- `source_type`: `api | file | manual | calculated`
- `pulled_at` และ validation status

## Delivery branches

1. `feature/brand-first-workspace-navigation` — Brand → Project → Period → Data scope
2. `feature/provider-account-registry` — connection/account records และ project assignment
3. `feature/facebook-ads-insights-import` — Facebook scope discovery และ canonical import
4. `feature/google-ads-connector` — Google OAuth และ Google Ads adapter
5. `feature/tiktok-ads-connector` — TikTok OAuth และ Marketing API adapter

Google/TikTok UI ต้องไม่แสดงว่าเชื่อมได้จนกว่า adapter, permission validation และ import tests จะพร้อมจริง
