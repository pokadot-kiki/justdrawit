const colors = {
  gold: ["#f7b928", "#fff1a4"], flower: ["#f378aa", "#ffe495"], heart: ["#ed5f86", "#ffd1dd"],
  star: ["#e9b840", "#fff3a9"], rainbow: ["#7864e9", "#62d9b3"], ice: ["#64c7eb", "#e1faff"],
  fire: ["#e96539", "#ffbd63"], galaxy: ["#6c4aa8", "#b6a4ef"], cloud: ["#cddfec", "#fff"], lava: ["#bd4034", "#ffad53"],
};
const theme = (id) => Object.entries(colors).find(([name]) => id.startsWith(name))?.[1] || colors.gold;

function Hat({ id }) {
  const outline = { stroke: "#25203c", strokeWidth: 5, strokeLinejoin: "round" };
  switch (id) {
    case "gold_crown": return <><path d="M12 68V30l17 15 21-29 21 29 17-15v38z" fill="#ffca27" {...outline} /><rect x="14" y="58" width="72" height="12" fill="#f4a620" {...outline} /><rect x="45" y="51" width="10" height="8" fill="#e85472" /><rect x="26" y="51" width="7" height="7" fill="#4ad7bc" /><rect x="67" y="51" width="7" height="7" fill="#4ad7bc" /></>;
    case "wizard_hat": return <><path d="M25 66 47 15l14 12 17 39z" fill="#514ab1" {...outline} /><path d="M13 69q37-18 74 0l-8 9H22z" fill="#35348b" {...outline} /><path d="m49 34 4 8 8 2-8 5 1 9-7-5-8 5 2-9-7-5 9-2z" fill="#ffe77c" /></>;
    case "bunny_ears": return <><ellipse cx="31" cy="38" rx="11" ry="31" fill="#f7f1ed" {...outline} /><ellipse cx="69" cy="38" rx="11" ry="31" fill="#f7f1ed" {...outline} /><ellipse cx="31" cy="39" rx="5" ry="23" fill="#f0a7be" /><ellipse cx="69" cy="39" rx="5" ry="23" fill="#f0a7be" /><rect x="20" y="64" width="60" height="10" fill="#f7f1ed" {...outline} /></>;
    case "cat_ears": return <><path d="M16 72 23 21l22 23h10l22-23 7 51z" fill="#4b4a57" {...outline} /><path d="m27 36 13 15H25zm46 0L60 51h15z" fill="#f0a6bf" /></>;
    case "chef_hat": return <><path d="M27 61C11 57 14 37 29 35c1-19 24-24 33-8 18-3 27 17 10 30v17H27z" fill="#fffdf5" {...outline} /><rect x="28" y="59" width="44" height="16" fill="#e4edf6" {...outline} /><path d="M39 39v18m12-21v21m12-17v17" stroke="#c3d3e3" strokeWidth="4" /></>;
    case "pirate_hat": return <><path d="M12 64c19-6 19-35 38-37 19 2 19 31 38 37-19 16-57 16-76 0z" fill="#29273b" {...outline} /><path d="M18 62q32 14 64 0" fill="none" stroke="#d2a344" strokeWidth="6" /><circle cx="50" cy="49" r="8" fill="#fff" /><path d="M44 59h12m-10-5-9 7m17-7 9 7" stroke="#fff" strokeWidth="4" /></>;
    case "mushroom_hat": return <><path d="M14 58C17 18 83 18 86 58z" fill="#e75060" {...outline} /><ellipse cx="50" cy="59" rx="38" ry="11" fill="#fff0db" {...outline} /><circle cx="34" cy="42" r="8" fill="#fff0db" /><circle cx="62" cy="36" r="10" fill="#fff0db" /></>;
    case "angel_halo": return <><ellipse cx="50" cy="32" rx="35" ry="12" fill="none" stroke="#25203c" strokeWidth="12" /><ellipse cx="50" cy="32" rx="35" ry="12" fill="none" stroke="#ffe47b" strokeWidth="7" /><path d="M17 17V7m66 10V7M50 8V1" stroke="#ffe47b" strokeWidth="5" /></>;
    case "sun_cap": return <><path d="M25 64V39q25-26 50 0v25z" fill="#ffe16a" {...outline} /><path d="M13 65h74v9H13z" fill="#ffca38" {...outline} /></>;
    default: return <><rect x="27" y="36" width="46" height="31" fill="#ffe16a" {...outline} /><rect x="14" y="64" width="72" height="10" fill="#ffe16a" {...outline} /></>;
  }
}

export function CosmeticArt({ id, slot, className = "" }) {
  if (!id) return null;
  if (slot === "hat") return <svg className={className} viewBox="0 0 100 100" shapeRendering="crispEdges" aria-hidden="true"><Hat id={id} /></svg>;
  if (slot === "frame") {
    const [main, light] = theme(id);
    if (id === "pixel_glasses") return <svg className={className} viewBox="0 0 100 100" shapeRendering="crispEdges" aria-hidden="true"><path d="M6 40h36v24H6zM58 40h36v24H58zM42 46h16" fill="none" stroke="#25203c" strokeWidth="7" /><path d="M13 47h22v11H13zM65 47h22v11H65z" fill="#8ed9f2" opacity=".7" /></svg>;
    return <svg className={className} viewBox="0 0 100 100" shapeRendering="crispEdges" aria-hidden="true"><rect x="8" y="8" width="84" height="84" rx="15" fill="none" stroke="#25203c" strokeWidth="10" /><rect x="8" y="8" width="84" height="84" rx="15" fill="none" stroke={main} strokeWidth="6" />{[18, 50, 82].map((x) => <g key={x}><path d={`M${x} 5v13m-6-6h12M${x} 82v13m-6-6h12`} stroke={light} strokeWidth="5" /></g>)}<circle cx="9" cy="50" r="5" fill={light} /><circle cx="91" cy="50" r="5" fill={light} />{id === "flower_frame" && <><circle cx="50" cy="8" r="9" fill="#f3a1c5" /><circle cx="50" cy="8" r="4" fill="#ffdf75" /></>}{id === "heart_frame" && <path d="M42 14C29 5 35-5 49 4 63-5 70 5 57 14l-8 8z" fill="#ffd1dd" />}{id === "star_frame" && <path d="m50 0 4 9 10 1-8 7 2 10-8-5-8 5 2-10-8-7 10-1z" fill="#fff2a9" />}{id === "rainbow_frame" && <path d="M25 14h50" stroke="#f17ca0" strokeWidth="4" strokeDasharray="10 5" />}{id === "ice_frame" && <><path d="m50 0 8 11-8 12-8-12z" fill="#e3ffff" /><path d="m50 77 8 11-8 12-8-12z" fill="#e3ffff" /></>}{id === "fire_frame" && <path d="M40 18q2-12 10-18 0 9 6 12 9-11 9-12 8 21-6 26-14 6-19-8z" fill="#ffb85a" />}{id === "galaxy_frame" && <><circle cx="32" cy="12" r="3" fill="#fff" /><circle cx="69" cy="89" r="3" fill="#fff" /></>}</svg>;
  }
  const [main, light] = theme(id);
  if (id === "blue_bow") return <svg className={className} viewBox="0 0 100 100" shapeRendering="crispEdges" aria-hidden="true"><path d="M7 44 44 58 7 75zM93 44 56 58l37 17z" fill="#548bea" stroke="#25203c" strokeWidth="5" strokeLinejoin="round" /><rect x="43" y="50" width="14" height="18" fill="#ffe176" stroke="#25203c" strokeWidth="4" /></svg>;
  return <svg className={className} viewBox="0 0 100 100" shapeRendering="crispEdges" aria-hidden="true"><path d="M10 53h80l7 18-16 14H19L3 71z" fill={main} stroke="#25203c" strokeWidth="5" strokeLinejoin="round" /><path d="M14 55q36-19 72 0v10q-36 13-72 0z" fill={light} stroke="#25203c" strokeWidth="4" />{(id === "cloud_base" || id === "flower_base" || id === "blue_bow") && <><circle cx="31" cy="52" r="10" fill={light} /><circle cx="50" cy="47" r="13" fill={light} /><circle cx="69" cy="52" r="10" fill={light} /></>}{id === "flower_base" && <circle cx="50" cy="48" r="5" fill="#f7b82e" />}{(id === "star_base" || id === "galaxy_base") && <path d="m50 45 4 7 8 1-6 6 1 8-7-4-7 4 1-8-6-6 8-1z" fill="#fff0a4" />}{(id === "rainbow_base" || id === "lava_base") && <path d="M17 68h66" stroke="#ffcf72" strokeWidth="5" strokeDasharray="10 5" />}{id === "gold_base" && <><rect x="29" y="59" width="42" height="10" fill="#fff0a4" /><rect x="40" y="70" width="20" height="5" fill="#ffbc34" /></>}{id === "ice_base" && <path d="m30 55 10-15 10 14 10-18 12 19" fill="none" stroke="#e1ffff" strokeWidth="6" />}{id === "galaxy_base" && <><circle cx="25" cy="65" r="3" fill="#fff" /><circle cx="76" cy="63" r="3" fill="#fff" /></>}</svg>;
}

export default function AvatarAccessories({ outfit }) {
  if (!outfit) return null;
  return <span className="avatar-cosmetics" aria-hidden="true">{outfit.frame && <CosmeticArt id={outfit.frame} slot="frame" className="avatar-cosmetics__frame" />}{outfit.base && <CosmeticArt id={outfit.base} slot="base" className="avatar-cosmetics__base" />}{outfit.hat && <CosmeticArt id={outfit.hat} slot="hat" className="avatar-cosmetics__hat" />}</span>;
}
