# Data import workflow

Import เป็น workflow แบบ gated stages ไม่ใช่ upload แล้ววิเคราะห์ทันที

```text
Draft → Scope → Map → Validate → Enrich media → Confirm → Analysis ready → Analyze
```

## 1. Scope

ผู้ใช้ต้องเลือก:

- ช่วงวันที่แบบวัน/เดือน/ปี และ timezone
- channel และ connected account อย่างน้อยหนึ่งบัญชี
- campaign ที่เกี่ยวข้อง หรือเลือกทั้งหมดอย่างชัดเจน
- brand assignment เริ่มต้น

Campaign ไม่ถือเป็น brand โดยอัตโนมัติ เพราะหนึ่ง account หรือ campaign อาจมีหลายแบรนด์ ระบบรองรับ rule ตามลำดับความเฉพาะ:

```text
content/ad → ad set → campaign → account
```

rule ที่เฉพาะกว่าชนะ และรายการที่ resolve brand ไม่ได้ต้องหยุดที่ Validate

## 2. Map

ทุกคอลัมน์จาก API, Excel, CSV หรือ Google Sheets ต้อง map เข้าสู่ canonical registry:

- Dimension: date, account, campaign, ad set, ad, post, creative, brand, objective, placement
- Metric: spend, impressions, reach, clicks, engagement, video, leads, conversions, revenue
- Derived metric: CPM, CPC, CPE, CTR, ROAS — ไม่ sum/average จากไฟล์โดยตรงเมื่อคำนวณใหม่จาก base metrics ได้

ไฟล์ต้องมี date, account ID, campaign ID และ numeric metric อย่างน้อยหนึ่งรายการ ผู้ใช้เห็น preview และแก้ type/format ก่อนยืนยัน mapping

## 3. Validate

Quality gate ตรวจอย่างน้อย:

- วันที่ parse ได้และอยู่ใน scope
- account/campaign อยู่ในรายการที่เลือก
- numeric column ไม่มีข้อความปน
- currency และ timezone ชัดเจน
- duplicate key และ missing ID
- brand coverage ครบทุก row
- granularity ของแต่ละ source เช่น `date + campaign` หรือ `date + ad + placement`
- join keys เป็นส่วนหนึ่งของ granularity ทั้งสองด้าน
- metric aggregation ตรง registry

ถ้า source หนึ่งเป็น `date + campaign` แต่อีก source เป็น `date + campaign + placement` ต้อง aggregate ให้เท่ากันก่อน blend เพื่อป้องกันยอดซ้ำ

## 4. Enrich media

หลังข้อมูลหลักผ่าน validation จึงจับคู่ `post_id`, `creative_id` หรือ `media_url` กับรูป/วิดีโอ:

- เก็บ source URL, MIME type, checksum และเวลาที่ดึง
- แสดง unmatched content ให้ผู้ใช้แก้
- media failure ไม่เปลี่ยน metric แต่ต้องแสดง coverage
- AI ใช้ media เฉพาะรายการที่จับคู่กับ canonical content key แล้ว

## 5. Confirm

หน้าสรุปต้องแสดง:

- จำนวน row ที่รับ/ตัดออก
- ช่วงวันที่จริง
- accounts, campaigns และ brands
- mapped dimensions/metrics
- warnings, null coverage และ media coverage
- source lineage และ manifest version

ผู้ใช้ต้องกดยืนยัน dataset ก่อนเปลี่ยนเป็น `analysis_ready`

## 6. Analyze and report

หลัง confirm เท่านั้น:

1. คำนวณ baseline และ derived metrics
2. ทำ scoring/pattern/correlation
3. ประมวลผลรูปและข้อความของ content
4. เรียก AI เพื่อสรุป insight
5. สร้าง report views และ export

หากมีการแก้ mapping, scope หรือไฟล์ ระบบต้องสร้าง dataset version ใหม่และวิเคราะห์ใหม่ ไม่แก้ผลเดิมแบบเงียบ ๆ

## 7. Admin correction and custom metrics

หลัง dataset ผ่าน `analysis_ready` แล้ว แอดมินสามารถแก้ base metric ระดับ campaign ได้ โดยระบบต้องเก็บ field ที่แก้ เหตุผล ผู้แก้ และเวลาแก้ ไม่เขียนทับ raw import/API อย่างเงียบ ๆ จากนั้นคำนวณ derived metric ใหม่จากค่าฐาน เช่น CTR, CPM, ROAS และ ROI

Custom metric ใช้สูตรคณิตศาสตร์แบบจำกัดเฉพาะ canonical metric fields และตัวดำเนินการ `+ - * / %` ไม่อนุญาต function call หรือโค้ด สูตรต้องถูก validate ก่อนบันทึก และผลหารด้วยศูนย์ต้องแสดงเป็นข้อมูลที่คำนวณไม่ได้แทนการทำให้รายงานล้ม

ตาราง Included campaigns คือจุดตรวจสุดท้ายก่อนแชร์หรือ export โดยต้องแสดงทุก campaign ที่อยู่ใน scope, แหล่งข้อมูล, metric ที่แก้ด้วยคน และ metric ที่คำนวณจากสูตรอย่างแยกแยะได้
