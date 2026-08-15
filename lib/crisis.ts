/**
 * 위기 신호 감지 및 안내 리소스.
 *
 * 솜잇은 청소년이 또래 상담사(상담 전공 대학생)와 이야기하는 서비스다.
 * 또래 상담사는 자격을 갖춘 전문가가 아니므로, 자해·자살 위험 신호가 보이면
 * 또래 상담에 맡기지 않고 즉시 전문 기관으로 연결하는 안전망이 반드시 필요하다.
 *
 * 주의: 이 감지기는 "보조 장치"다. 놓치는 경우가 있고 오탐도 있다.
 * 사람이 검토하는 신고/에스컬레이션 절차와 반드시 함께 운영해야 한다.
 */

const CRISIS_PATTERNS: RegExp[] = [
  /죽고\s*싶/,
  /자살/,
  /자해/,
  /사라지고\s*싶/,
  /없어지고\s*싶/,
  /살기\s*싫/,
  /살고\s*싶지\s*않/,
  /끝내고\s*싶/,
  /극단적\s*선택/,
];

export type CrisisResource = {
  name: string;
  tel: string;
  desc: string;
};

/**
 * 배포 전 각 기관의 최신 번호를 반드시 확인할 것.
 * (자살예방상담전화는 2024년 1393 → 109로 변경되었다)
 */
export const CRISIS_RESOURCES: CrisisResource[] = [
  { name: "자살예방상담전화", tel: "109", desc: "24시간 · 전문 상담원이 항상 대기하고 있어요" },
  { name: "청소년전화", tel: "1388", desc: "24시간 · 청소년 전문 상담" },
  { name: "정신건강위기상담", tel: "1577-0199", desc: "24시간 · 지역 정신건강복지센터" },
];

export function detectCrisis(text: string): boolean {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, " ");
  return CRISIS_PATTERNS.some((p) => p.test(normalized));
}
