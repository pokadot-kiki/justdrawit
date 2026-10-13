export function withProfileIdentity(item, update) {
  if (!item || (item.playerId !== update.playerId && item.id !== update.playerId)) return item;
  const next = { ...item, name: update.name, avatar: update.avatar };
  for (const field of ["avatarPhoto", "outfit", "title"]) {
    if (Object.hasOwn(update, field)) next[field] = update[field];
  }
  if (item.system && item.kind === "correct" && typeof item.text === "string") {
    if (item.name && item.text.startsWith(item.name)) next.text = update.name + item.text.slice(item.name.length);
    else if (item.text.endsWith(" ทายถูก")) next.text = `${update.name} ทายถูก`;
  }
  return next;
}

export function withProfileList(items, update) {
  return items?.map((item) => withProfileIdentity(item, update)) ?? items;
}
