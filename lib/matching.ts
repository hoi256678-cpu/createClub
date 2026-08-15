import type { Counselor, CounselorTag } from "@/app/(shell)/counselors/mock";

/** 이 횟수 미만이면 신입으로 본다. 평점 대신 "이제 막 시작했어요"를 표시한다. */
export const NEW_COUNSELOR_THRESHOLD = 5;

/**
 * 상담사 배정 점수.
 *
 * 솜잇은 청소년의 고민 해결과 대학생의 실습 경험, 두 가지를 동시에 목적으로 한다.
 * 평점순으로 정렬하면 잘하는 사람에게 상담이 몰리고 신입은 영영 0회에 머문다(콜드스타트).
 * 그래서 배정 점수에서 평점을 아예 제외하고, 최근 상담이 적은 사람을 위로 올린다.
 *
 * 평점은 순위를 매기는 데 쓰지 않고, 심각하게 낮은 상담사를 배정에서 제외하는 데만 쓴다.
 */
export function matchScore(c: Counselor, topic: CounselorTag | null): number {
  let score = 0;

  // 1순위: 지금 이야기할 수 있는 사람. 연결 성공률이 가장 크게 갈린다.
  if (c.online) score += 1000;

  // 2순위: 주제가 맞는 사람
  if (topic && c.tags.includes(topic)) score += 500;

  // 3순위: 최근 7일간 상담이 적었던 사람 (기회 균등의 핵심)
  //        상한을 두어, 오래 쉰 사람이 무한정 위로 올라가지 않게 한다.
  score += Math.max(0, 40 - Math.min(c.recentSessions, 40)) * 5;

  // 4순위: 누적 상담이 적은 신입에게 가산점
  if (c.sessionCount < NEW_COUNSELOR_THRESHOLD * 4) score += 60;

  return score;
}

/** 평점이 이 값 미만이면 배정 대상에서 뺀다. 후기가 충분히 쌓인 뒤에만 적용한다. */
export function isEligible(c: Counselor): boolean {
  if (c.reviewCount < NEW_COUNSELOR_THRESHOLD) return true;
  return c.rating >= 3.5;
}

export function isNewCounselor(c: Counselor): boolean {
  return c.sessionCount < NEW_COUNSELOR_THRESHOLD || c.reviewCount < NEW_COUNSELOR_THRESHOLD;
}

/**
 * 목록 상위에 신입 상담사 자리를 최소 한 칸 보장한다.
 * 점수만으로 줄을 세우면 신입이 첫 화면에 아예 안 보이는 날이 생긴다.
 */
export function reserveSlotForNewcomer(sorted: Counselor[], slot = 2): Counselor[] {
  const head = sorted.slice(0, slot);
  if (head.some(isNewCounselor)) return sorted;

  const idx = sorted.findIndex(isNewCounselor);
  if (idx < 0) return sorted;

  const next = [...sorted];
  const [newcomer] = next.splice(idx, 1);
  next.splice(slot - 1, 0, newcomer);
  return next;
}
