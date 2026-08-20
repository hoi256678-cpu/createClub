export type TestType = "stress" | "selfesteem" | "depression";

export type TestCard = {
  type: TestType;
  gradientFrom: string;
  gradientTo: string;
  emoji: string;
  label: string;
  title: string;
  sub: string;
};

export type TestResult = { label: string; desc: string; color: string };

export type TestDef = {
  title: string;
  intro: string;
  /** 역채점 문항의 인덱스(0-based). */
  reverseIdx: number[];
  cols: string[];
  questions: string[];
  /**
   * 문항당 점수의 시작값. 대부분의 척도(PSS, PHQ-9)는 0점부터 세지만,
   * 로젠버그 자존감 척도처럼 1점부터 세는 척도는 1로 지정한다.
   * 없으면 0으로 취급한다.
   */
  scoreBase?: number;
  /**
   * true면 점수가 높을수록 좋은 상태다(예: 자존감). 없으면 점수가 높을수록
   * 더 우려되는 상태(스트레스, 우울)로 취급한다 — 결과 화면의 "상담사 찾기"/
   * "위기 안내" 표시 방향을 결정하는 데 쓰인다.
   */
  higherIsBetter?: boolean;
  getResult(score: number): TestResult;
};

export const TEST_CARDS: TestCard[] = [
  { type: "stress", gradientFrom: "#e07b8b", gradientTo: "#c45c7a", emoji: "💔", label: "PSS · 10문항", title: "스트레스 검사", sub: "최근 한 달의 스트레스" },
  { type: "selfesteem", gradientFrom: "#6aab9c", gradientTo: "#3d8c7a", emoji: "🤲", label: "로젠버그 · 10문항", title: "자존감 검사", sub: "나를 얼마나 사랑하나요" },
  { type: "depression", gradientFrom: "#7a9cc5", gradientTo: "#4a72a8", emoji: "💙", label: "PHQ-9 · 9문항", title: "우울증 검사", sub: "지난 2주간의 기분" },
];

export const TEST_DATA: Record<TestType, TestDef> = {
  // 출처: Cohen 등이 개발한 PSS-10 공식 한국어판(Eun Hyun Lee 역, Carnegie Mellon
  // University Stress/Immunity/Disease Lab 배포) — 문항, 응답 척도, 역채점 문항 전부
  // 이 번역본 기준.
  stress: {
    title: "스트레스 검사 (PSS)",
    intro: "지난 1개월 동안 각 문항의 내용을 얼마나 자주 느꼈는지 선택해주세요.",
    reverseIdx: [3, 4, 6, 7],
    cols: ["전혀 없었다", "거의 없었다", "가끔 있었다", "자주 있었다", "매우 자주 있었다"],
    questions: [
      "예상치 않게 생긴 일 때문에 속상한 적이 얼마나 자주 있었습니까?",
      "중요한 일을 조절할 수 없다고 느낀 적이 얼마나 자주 있었습니까?",
      "불안하고 스트레스받았다고 느낀 적이 얼마나 자주 있었습니까?",
      "개인적인 문제를 잘 처리할 수 있다고 자신감을 가진 적이 얼마나 자주 있었습니까?",
      "일이 내 뜻대로 진행되고 있다고 느낀 적이 얼마나 자주 있었습니까?",
      "자신이 해야 할 모든 일에 잘 대처할 수 없었던 적이 얼마나 자주 있었습니까?",
      "일상에서 짜증나는 것을 잘 조절할 수 있었던 적이 얼마나 자주 있었습니까?",
      "자신이 일을 잘 해냈다고 느낀 적이 얼마나 자주 있었습니까?",
      "자신의 능력으로는 어떻게 해 볼 수 없는 일 때문에 화가 난 적이 얼마나 자주 있었습니까?",
      "어려운 일이 너무 많아져서 극복할 수 없다고 느낀 적이 얼마나 자주 있었습니까?",
    ],
    getResult(score) {
      if (score <= 13) return { label: "낮은 스트레스", desc: "현재 스트레스 수준이 낮은 편이에요. 지금처럼 건강하게 유지해보세요 😊", color: "#50D9A0" };
      if (score <= 26) return { label: "보통 스트레스", desc: "적당한 수준의 스트레스가 있어요. 가끔 휴식을 취하며 스트레스를 관리해보세요.", color: "#F5C842" };
      return { label: "높은 스트레스", desc: "스트레스 수준이 높은 편이에요. 전문가의 도움이나 상담을 받아보시는 게 좋을 것 같아요.", color: "#E05252" };
    },
  },
  // 출처: 로젠버그 자아존중감 척도(RSES) 국내 번역판 — 서울시교육청 학생위기지원
  // '위풀'과 담다무료심리검사(아동상담) 두 곳을 교차 확인. 두 출처 모두 3, 5, 8, 9,
  // 10번 문항이 부정문항(역채점)이며, 국내에서 흔히 쓰이는 5점 응답 척도(1~5점,
  // 총점 10~50점)를 따른다.
  selfesteem: {
    title: "자존감 검사 (로젠버그)",
    intro: "각 문항에 대해 자신에게 해당하는 정도를 선택해주세요.",
    reverseIdx: [2, 4, 7, 8, 9],
    scoreBase: 1,
    higherIsBetter: true,
    cols: ["전혀 그렇지 않다", "그렇지 않다", "그저 그렇다", "그렇다", "매우 그렇다"],
    questions: [
      "나는 남들만큼은 가치있는 사람이다.",
      "나에게 좋은 점이 많이 있다.",
      "대체로 봐서 나는 실패자이다.",
      "나는 남들만큼 일을 해낼 수 있다.",
      "내게는 자랑으로 여길만한 것이 별로 없다.",
      "나는 나 자신에 대해 괜찮게 생각한다.",
      "대체로 나는 나를 만족스럽게 생각한다.",
      "나는 자존심이 좀 더 있었으면 좋겠다.",
      "나는 정말 가치없는 사람으로 생각될 때가 있다.",
      "나는 내가 좋은 점이 하나도 없다고 생각될 때가 있다.",
    ],
    getResult(score) {
      if (score >= 39) return { label: "높은 자존감", desc: "자신을 가치 있게 여기고 긍정적인 자아상을 가지고 있어요 😊", color: "#50D9A0" };
      if (score >= 25) return { label: "보통 자존감", desc: "평균적인 수준의 자존감을 갖고 있어요. 스스로를 더 인정해주면 좋을 것 같아요.", color: "#F5C842" };
      return { label: "낮은 자존감", desc: "자존감이 낮을 수 있어요. 상담을 통해 자신을 더 사랑하는 방법을 찾아보세요 💙", color: "#9EB9E6" };
    },
  },
  // 출처: PHQ-9 공식 한국어판(Pfizer 배포, 임상·연구 목적 사용 허용 명시) — 문항 순서,
  // 4단계 응답 척도, 국제 표준 심각도 구간(0-4/5-9/10-14/15-19/20-27) 전부 이 번역본
  // 및 표준 절단점 기준.
  depression: {
    title: "우울증 검사 (PHQ-9)",
    intro: "지난 2주 동안 다음 문제들로 얼마나 자주 방해를 받았는지 선택해주세요.",
    reverseIdx: [],
    cols: ["전혀 방해받지 않았다", "며칠 동안 방해받았다", "7일 이상 방해받았다", "거의 매일 방해받았다"],
    questions: [
      "일 또는 여가 활동을 하는 데 흥미나 즐거움을 느끼지 못한다.",
      "기분이 가라앉거나, 우울하거나, 희망이 없다고 느낀다.",
      "잠이 들거나 계속 잠을 자는 것이 어렵다. 또는 잠을 너무 많이 잔다.",
      "피곤하다고 느끼거나 기운이 거의 없다.",
      "입맛이 없거나 과식을 한다.",
      "자신을 부정적으로 본다. 혹은 자신이 실패자라고 느끼거나 자신 또는 가족을 실망시켰다고 느낀다.",
      "신문을 읽거나 텔레비전을 보는 것과 같은 일에 집중하는 것이 어렵다.",
      "다른 사람들이 주목할 정도로 너무 느리게 움직이거나 말을 한다. 또는 반대로 평상시보다 많이 움직여서 안절부절 못하거나 들떠 있다.",
      "자신이 죽는 것이 더 낫다고 생각하거나 어떤 식으로든 자신을 해칠 것이라고 생각한다.",
    ],
    getResult(score) {
      if (score <= 4) return { label: "우울증 없음", desc: "현재 우울 증상이 거의 없어요. 좋은 상태를 유지해보세요 😊", color: "#50D9A0" };
      if (score <= 9) return { label: "가벼운 우울증", desc: "가벼운 우울 증상이 있어요. 규칙적인 생활과 사람들과의 소통이 도움이 될 수 있어요.", color: "#F5C842" };
      if (score <= 14) return { label: "중등도 우울증", desc: "중간 수준의 우울 증상이 있어요. 전문 상담사와 이야기해보시는 걸 권장드려요.", color: "#F5930A" };
      if (score <= 19) return { label: "중등도~심한 우울증", desc: "꽤 심한 우울 증상이 있어요. 가능한 빨리 전문가의 도움을 받아보시길 권해드려요.", color: "#E8734A" };
      return { label: "심한 우울증", desc: "심한 우울 증상이 있어요. 가능한 빨리 전문가의 도움을 받으시길 강력히 권장드려요.", color: "#E05252" };
    },
  },
};
