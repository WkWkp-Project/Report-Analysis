# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ผู้ใช้ที่ต้องวิเคราะห์ performance ของ Facebook content และ advertising จากข้อมูลจริง โดยต้องการเห็นทั้งภาพรวม การเปรียบเทียบ Ads กับ Organic และรายละเอียดระดับโพสต์

กลุ่มผู้ใช้หลักระหว่างทีมการตลาดภายใน เอเจนซี เจ้าของแบรนด์ และลูกค้าที่เปิดดูรายงาน ยังเป็นการตัดสินใจที่ต้องยืนยันเพิ่มเติม

## Product Purpose

Report Analysis ช่วยรวบรวมข้อมูล performance จาก API และไฟล์ Excel/CSV แล้วเปลี่ยนเป็นรายงานที่อ่านง่าย ตรวจสอบที่มาได้ และนำไปตัดสินใจปรับปรุงคอนเทนต์หรือโฆษณาได้

ผลิตภัณฑ์ต้องต่อยอดจาก Facebook Analysis เดิม ไม่แทนที่หรือลดทอนความสามารถที่มีอยู่ การเพิ่ม metric, data source และรูปแบบรายงานต้องทำให้ระบบสมบูรณ์ขึ้นโดยยังคงโครงวิเคราะห์และบุคลิกเดิม

## Positioning

ระบบรายงานที่ไม่ได้แสดงเฉพาะตัวเลข แต่เชื่อม performance scoring, baseline ของเพจ, creative pattern, data quality และคำแนะนำเชิงปฏิบัติไว้ในเส้นทางการวิเคราะห์เดียวกัน

เมื่อ API ไม่มีข้อมูลที่จำเป็น ผู้ใช้สามารถนำเข้า Excel/CSV เพื่อเติมข้อมูลให้รายงานครบ โดยระบบต้องระบุแหล่งที่มาของ metric และไม่ทำให้ข้อมูลจากคนละแหล่งปะปนอย่างคลุมเครือ

## Operating Context

- ใช้ Facebook Graph API และ Marketing API เป็นแหล่งข้อมูลอัตโนมัติหลักในระบบปัจจุบัน
- ใช้ Excel/CSV เป็นแหล่งข้อมูลเสริมหรือ fallback สำหรับ metric ที่ API ดึงไม่ได้
- รองรับ demo data เพื่อทดลอง scoring และ analytics โดยไม่ต้องมี credential
- ผู้ใช้เริ่มจากภาพรวม แล้วลงไปเปรียบเทียบ Ads/Organic และตรวจรายละเอียดระดับโพสต์
- รูปแบบการแชร์รายงาน เช่น dashboard ภายใน, live link หรือ PDF ยังต้องยืนยันขอบเขตระยะแรก

## Capabilities and Constraints

### Existing capabilities to preserve

- Overview dashboard
- Ads vs Organic analysis
- Post deep-dive
- Performance scoring พร้อม reasoning
- Page baseline comparison
- Format performance และ creative patterns
- Time heatmap
- Cost efficiency, CPM, CPE และ ROAS เมื่อมีข้อมูล
- Streamlit UI และ React/FastAPI application
- Optional AI topic extraction และ narrative insight

### Planned extension

- เพิ่ม metric ที่สำคัญต่อการรายงานโดยไม่ลบ metric หรือ workflow เดิม
- รองรับการอัปโหลด Excel/CSV, preview, validation และ column mapping
- ทำ normalized metric model เพื่อให้ข้อมูล API และไฟล์ใช้ร่วมกันได้
- แสดง data source และ data quality ของ metric แต่ละรายการ
- เพิ่ม report views และ filters โดยไม่ทำลายโครง Overview → Ads/Organic → Deep-dive
- การเชื่อมช่องทางอื่นนอกเหนือจาก Facebook ยังเป็น open decision หลัง foundation ระยะแรก

### Binding constraints

- ห้ามลบฟังก์ชันเดิมเพียงเพื่อให้หน้าตาใหม่เรียบขึ้น
- ห้ามเปลี่ยน navigation และ information hierarchy เดิมโดยไม่มีเหตุผลด้านการใช้งานที่ชัดเจน
- การเพิ่มข้อมูลต้องใช้ progressive disclosure เพื่อไม่ทำให้ dashboard แน่นหรือซับซ้อนเกินไป
- ตัวเลขที่คำนวณหรือมาจากไฟล์ต้องแยกจากตัวเลข API ได้อย่างตรวจสอบย้อนกลับ
- การปรับ UI เป็น refinement ของระบบเดิม ไม่ใช่การ redesign ที่ทิ้งอัตลักษณ์เดิม

## Brand Commitments

- รักษากลิ่นอายและบุคลิกของ dashboard ปัจจุบัน
- หน้าตาต้องจริงจัง อ่านง่าย และเหมาะกับการทำงานกับข้อมูลจำนวนมาก
- เพิ่มความสวยงามผ่าน hierarchy, typography, spacing, states และรายละเอียดของ interaction
- สีและองค์ประกอบตกแต่งต้องช่วยสื่อความหมายของข้อมูล ไม่แย่งความสนใจจากข้อมูล
- ของใหม่ต้องดูเหมือนเป็นส่วนหนึ่งของผลิตภัณฑ์เดิม ไม่ใช่โมดูลจากคนละระบบ

## Evidence on Hand

- React dashboard: `frontend/src/Dashboard.jsx`
- Frontend API adapter: `frontend/src/api.js`
- FastAPI backend: `server.py`
- Facebook API client: `api_client.py`
- Scoring and analytics: `scoring.py`, `analyzer.py`
- Payload normalization: `serializer.py`
- Demo dataset: `sample_data.py`
- Existing usage and scoring documentation: `README.md`

ยังไม่มี brand assets, formal accessibility requirement, real customer report examples หรือชุด Excel ตัวอย่างที่ได้รับการยืนยัน

## Product Principles

1. **Preserve before extending** — ของเดิมที่มีคุณค่าต้องอยู่ครบ แล้วจึงเพิ่มความสามารถใหม่อย่างเหมาะสม
2. **Complete but comprehensible** — รายงานต้องครบโดยไม่บังคับให้ผู้ใช้รับข้อมูลทุกอย่างพร้อมกัน
3. **Every number has a source** — ทุก metric ต้องบอกได้ว่ามาจาก API, ไฟล์, manual input หรือการคำนวณ
4. **Analysis leads to action** — การแสดงผลต้องช่วยให้ผู้ใช้รู้ว่าควรทำอะไรต่อ ไม่ใช่จบที่กราฟ
5. **Beauty serves operation** — ความสวยงามต้องเพิ่มความชัดเจน ความเร็ว และความมั่นใจในการใช้งาน

## Accessibility & Inclusion

ยังไม่มีมาตรฐานที่ได้รับการยืนยัน การออกแบบต่อไปควรรองรับ keyboard navigation, visible focus, reduced motion, contrast ที่อ่านได้ และ responsive layout เป็นค่าเริ่มต้น
