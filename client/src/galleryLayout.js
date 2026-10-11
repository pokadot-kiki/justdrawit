// Return a card width that fits the measured gallery content box.
// A short gallery uses one row; larger galleries aim for two balanced rows.
export function galleryLayout(count, width, minCardWidth, gap) {
  const preferred = count <= 3 ? count : Math.ceil(count / 2);
  const fit = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
  const columns = Math.max(1, Math.min(preferred || 1, fit));
  return { columns, cardWidth: (width - gap * (columns - 1)) / columns };
}

// Phase 1 cards fill one row up to their height cap. If the content box cannot
// fit readable cards, their minimum width makes the gallery scroll sideways.
export function galleryStripLayout(count, width, minCardWidth, maxCardWidth, gap) {
  if (count <= 0 || width <= 0) return { cardWidth: minCardWidth, scrolls: false };
  const fitWidth = (width - gap * (count - 1)) / count;
  const cardWidth = Math.max(minCardWidth, Math.min(maxCardWidth, fitWidth));
  return { cardWidth, scrolls: cardWidth * count + gap * (count - 1) > width };
}
