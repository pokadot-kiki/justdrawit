import { useLayoutEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { galleryLayout } from "../galleryLayout";

export default function TeamGallery({ entries, myTeam }) {
  const ref = useRef(null);
  const [cardWidth, setCardWidth] = useState(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => {
      const style = getComputedStyle(node);
      const width = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap);
      const minWidth = parseFloat(style.getPropertyValue("--team-gallery-min-card"));
      setCardWidth(galleryLayout(entries.length, width, minWidth, gap).cardWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [entries.length]);

  return (
    <div ref={ref} className="team-gallery" aria-label="ภาพวาดของทุกทีม"
      style={cardWidth == null ? undefined : { "--team-gallery-card-width": `${cardWidth}px` }}>
      {entries.map((entry) => (
        <figure key={entry.team} className={`team-gallery__card team-gallery__card--${entry.team}${entry.team === myTeam ? " team-gallery__card--mine" : ""}`}>
          <figcaption className="team-gallery__caption">
            <strong className="team-gallery__team" title={entry.name}>{entry.name}</strong>
            {entry.team === myTeam && <span className="team-gallery__mine">ภาพทีมของคุณ</span>}
            <span className="team-gallery__drawer">
              {entry.drawer && <Avatar index={entry.drawer.avatar} />}
              <span title={entry.drawer?.name ?? ""}>{entry.drawer?.name ?? "ไม่มีคนวาด"}</span>
            </span>
          </figcaption>
          <div className="team-gallery__art">
            {entry.image ? <img src={entry.image} alt={`ภาพวาดของ${entry.name} โดย ${entry.drawer?.name ?? "ผู้เล่น"}`} />
              : <span>{entry.status === "incomplete" ? "ภาพวาดไม่ครบ" : entry.status === "unavailable" ? "แสดงภาพไม่ได้" : "ไม่มีภาพวาด"}</span>}
          </div>
        </figure>
      ))}
    </div>
  );
}
