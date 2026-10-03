import { Icon } from "./Icons";

// ป้าย Mini Challenge เหนือกระดาน (ข้อ 5)
// แถบเล็กสีม่วง (อยู่ซ้ายของคำที่ต้องวาด) ตัวหนังสือขาว ถอดความจาก events.md หัวข้อ 5 ตรง ๆ
//
// ป้ายนี้ขึ้นกับ "challenge ของตานี้" ที่ server ส่งมากับ round_start เท่านั้น
// type "none" (หรือไม่มีก้อนมาเลย) = ไม่มีป้าย ไม่ต้องแสดงอะไร
// คนที่เข้าห้องกลางตาก็ได้ challenge ชุดเดียวกัน เพราะ server ส่ง round_start ให้เขาใหม่พร้อมค่านั้น
const CHALLENGES = {
  colour_fix: ["palette", "COLOUR FIX", "วาดได้สีเดียว"],
  dont_lift_pen: ["pen", "DON'T LIFT PEN", "ห้ามยกปากกา"],
  shapes_only: ["shape-rect", "SHAPES ONLY", "ใช้ได้แต่รูปทรง"],
};

// คำอธิบายสั้นหนึ่งบรรทัด ใช้ในป้ายใหญ่ตอนเริ่มตา และกล่องเลือกคำ (ที่เดียวกันทุกที่ ไม่ให้ข้อความไม่ตรงกัน)
export const CHALLENGE_INFO = {
  colour_fix: { icon: "palette", title: "COLOUR FIX", desc: "ตานี้วาดได้แค่สีเดียว ใช้สีที่ล็อกไว้เท่านั้น" },
  dont_lift_pen: { icon: "pen", title: "DON'T LIFT PEN", desc: "ลากเส้นเดียวต่อเนื่อง ห้ามยกปากกา ย้อนกลับไม่ได้" },
  shapes_only: { icon: "shape-rect", title: "SHAPES ONLY", desc: "ตานี้วาดด้วยรูปทรงเท่านั้น (เส้น สี่เหลี่ยม วงกลม สามเหลี่ยม) ห้ามวาดมือเปล่า" },
};

export default function ChallengeBanner({ challenge }) {
  const found = CHALLENGES[challenge?.type];
  if (!found) return null;
  const [icon, title, sub] = found;
  return (
    <div className="challenge">
      <Icon name={icon} size={24} />
      <span className="challenge__text">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      {/* colour_fix โชว์ตัวอย่างสีที่ล็อกไว้ด้วย เพราะ "วาดได้สีเดียว" ไม่ได้บอกว่าสีอะไร
          ถ้าไม่โชว์ ผู้เล่นต้องเดาเองว่าสีที่ใช้ได้คือสีไหน (client ที่ไม่โชว์ = ผู้เล่นกดผิดแล้วงงว่าทำไมไม่ขึ้น)
          สีมาจาก server เท่านั้น ห้ามให้ client สุ่มหรือเดาเอง */}
      {challenge.type === "colour_fix" && challenge.color && (
        <span
          className="challenge__swatch"
          style={{ background: challenge.color }}
          title={`สีที่ใช้ได้ตานี้: ${challenge.color}`}
          aria-label={`สีที่ใช้ได้ตานี้ ${challenge.color}`}
        />
      )}
    </div>
  );
}
