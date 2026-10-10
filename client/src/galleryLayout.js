// Return a card width that fits the measured gallery content box.
// A short gallery uses one row; larger galleries aim for two balanced rows.
export function galleryLayout(count, width, minCardWidth, gap) {
  const preferred = count <= 3 ? count : Math.ceil(count / 2);
  const fit = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
  const columns = Math.max(1, Math.min(preferred || 1, fit));
  return { columns, cardWidth: (width - gap * (columns - 1)) / columns };
}
