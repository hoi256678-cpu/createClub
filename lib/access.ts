/**
 * 게스트(비로그인)와 계정 사용자의 이용 범위.
 *
 * 게스트를 넓게 열수록 유입 문턱은 낮아지지만, 문제가 생겼을 때 할 수 없는 일이 생긴다.
 * 계정이 없으면 다시 연락할 수도, 나이를 확인할 수도, 보호자에게 알릴 수도 없고,
 * 제재해도 쿠키만 지우면 새 게스트가 된다.
 *
 * 그래서 기준을 "혼자 하는 일"과 "사람을 만나는 일"로 나눈다.
 * 실시간 1:1 비공개 대화만 계정을 요구하고, 나머지는 게스트에게 연다.
 */
export const GUEST_ALLOWED = {
  psychTest: true,
  moodTracker: true,
  communityRead: true,
  /** 비동기 상담(글로 남기고 답변 받기)은 검수가 쉬워 게스트에게도 연다. */
  asyncCounseling: true,
  /** 실시간 1:1 채팅은 계정 필요. 추적 불가능한 비공개 대화는 열지 않는다. */
  liveChat: false,
  communityWrite: false,
} as const;

export const GUEST_UPGRADE_REASON: Record<string, string> = {
  liveChat: "실시간 상담은 안전한 진행을 위해 계정이 필요해요",
  communityWrite: "글을 남기려면 계정이 필요해요",
};
