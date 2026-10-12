const NEAR_BOTTOM_PX = 48;

export function isNearChatBottom(element) {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= NEAR_BOTTOM_PX;
}
