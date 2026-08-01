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
  reverseIdx: number[];
  cols: string[];
  questions: string[];
  getResult(score: number): TestResult;
};

export const TEST_CARDS: TestCard[] = [
  { type: "stress", gradientFrom: "#e07b8b", gradientTo: "#c45c7a", emoji: "💔", label: "PSS · 10문항", title: "스트레스 검사", sub: "최근 한 달의 스트레스" },
  { type: "selfesteem", gradientFrom: "#6aab9c", gradientTo: "#3d8c7a", emoji: "🤲", label: "로젠버그 · 10문항", title: "자존감 검사", sub: "나를 얼마나 사랑하나요" },
  { type: "depression", gradientFrom: "#7a9cc5", gradientTo: "#4a72a8", emoji: "💙", label: "PHQ-9 · 9문항", title: "우울증 검사", sub: "지난 2주간의 기분" },
];

export const TEST_DATA: Record<TestType, TestDef> = {
  stress: {
    title: "스트레스 검사 (PSS)",
    intro: "지난 1개월 동안 각 문항의 내용을 얼마나 자주 느꼈는지 선택해주세요.",
    reverseIdx: [3, 4, 6, 7],
    cols: ["전혀 없었다", "거의 없었다", "때때로 있었다", "자주 있었다", "매우 자주 있었다"],
    questions: [
      "최근 1개월 동안, 예상치 못했던 일 때문에 당황했던 적이 얼마나 있었습니까?",
      "최근 1개월 동안, 인생에서 중요한 일들을 조절할 수 없다는 느낌을 얼마나 경험하였습니까?",
      "최근 1개월 동안, 신경이 예민해지고 스트레스를 받고 있다는 느낌을 얼마나 경험하였습니까?",
      "최근 1개월 동안, 당신의 개인적 문제들을 다루는 데 있어서 얼마나 자주 자신감을 느끼셨습니까?",
      "최근 1개월 동안, 일상의 일들이 당신의 생각대로 진행되고 있다는 느낌을 얼마나 경험하였습니까?",
      "최근 1개월 동안, 당신이 꼭 해야 하는 일을 처리할 수 없다고 생각한 적이 얼마나 있었습니까?",
      "최근 1개월 동안, 일상생활의 짜증을 얼마나 자주 잘 다스릴 수 있었습니까?",
      "최근 1개월 동안, 최상의 컨디션이라고 얼마나 자주 느끼셨습니까?",
      "최근 1개월 동안, 당신이 통제할 수 없는 일 때문에 화가 난 경험이 얼마나 있었습니까?",
      "최근 1개월 동안, 어려운 일들이 너무 많이 쌓여서 극복하지 못할 것 같은 느낌을 얼마나 자주 경험하였습니까?",
    ],
    getResult(score) {
      if (score <= 13) return { label: "낮은 스트레스", desc: "현재 스트레스 수준이 낮은 편이에요. 지금처럼 건강하게 유지해보세요 😊", color: "#50D9A0" };
      if (score <= 26) return { label: "보통 스트레스", desc: "적당한 수준의 스트레스가 있어요. 가끔 휴식을 취하며 스트레스를 관리해보세요.", color: "#F5C842" };
      return { label: "높은 스트레스", desc: "스트레스 수준이 높은 편이에요. 전문가의 도움이나 상담을 받아보시는 게 좋을 것 같아요.", color: "#E05252" };
    },
  },
  selfesteem: {
    title: "자존감 검사 (로젠버그)",
    intro: "각 문항에 대해 자신에게 해당하는 정도를 선택해주세요.",
    reverseIdx: [],
    cols: ["대체로 그렇지 않다", "보통이다", "대체로 그렇다", "항상 그렇다"],
    questions: [
      "나는 내가 다른 사람들 만큼 가치 있는 사람이라고 생각한다.",
      "나는 가끔 내가 꽤 좋은 성품을 가졌다고 본다.",
      "나는 좋은 자질을 여럿 가지고 있다고 생각한다.",
      "나는 대부분의 사람들과 같이 잘 일 할 수 있다.",
      "나는 내가 자랑할 것이 많은 사람이라고 생각한다.",
      "나는 내가 쓸모있는 사람이라고 느낀다.",
      "나는 적어도 내가 다른 사람들과 평등하게 가치있는 사람이라고 생각한다.",
      "나는 나 자신을 아끼고 존중하는 사람이다.",
      "결과적으로 나는 성공할 사람이란 느낌이 든다.",
      "나는 긍정적인 마음으로 나를 대한다.",
    ],
    getResult(score) {
      if (score >= 34) return { label: "높은 자존감", desc: "자신을 가치 있게 여기고 긍정적인 자아상을 가지고 있어요 😊", color: "#50D9A0" };
      if (score >= 25) return { label: "보통 자존감", desc: "평균적인 수준의 자존감을 갖고 있어요. 스스로를 더 인정해주면 좋을 것 같아요.", color: "#F5C842" };
      return { label: "낮은 자존감", desc: "자존감이 낮을 수 있어요. 상담을 통해 자신을 더 사랑하는 방법을 찾아보세요 💙", color: "#9EB9E6" };
    },
  },
  depression: {
    title: "우울증 검사 (PHQ-9)",
    intro: "지난 2주 동안 다음 문제들로 얼마나 자주 방해를 받았는지 선택해주세요.",
    reverseIdx: [],
    cols: ["아니오", "예"],
    questions: [
      "거의 매일 또는 하루 종일 우울하고 슬프다.",
      "흥미나 즐거움이 눈에 띄게 줄었다.",
      "의도하지 않았는데도 체중이 눈에 띄게 줄거나 늘었다.",
      "거의 매일 잠을 못 자거나 반대로 잠을 너무 많이 잔다.",
      "불안해서 잠시도 가만히 있지 못하거나 몸의 움직임이 느려진다.",
      "늘 피곤하고 무기력하다.",
      "늘 자기를 못났다고 자책하고 죄책감을 많이 느낀다.",
      "집중을 못하며, 어떤 결정을 내리지 못하고 늘 망설인다.",
      "자살을 반복적으로 생각하고, 자살을 시도하거나 계획을 세운다.",
    ],
    getResult(score) {
      if (score === 0) return { label: "우울증 없음", desc: "현재 우울 증상이 거의 없어요. 좋은 상태를 유지해보세요 😊", color: "#50D9A0" };
      if (score <= 3) return { label: "경미한 우울", desc: "가벼운 우울 증상이 있어요. 규칙적인 생활과 사람들과의 소통이 도움이 될 수 있어요.", color: "#F5C842" };
      if (score <= 6) return { label: "중등도 우울", desc: "중간 수준의 우울 증상이 있어요. 전문 상담사와 이야기해보시는 걸 권장드려요.", color: "#F5930A" };
      return { label: "심한 우울", desc: "심한 우울 증상이 있어요. 가능한 빨리 전문가의 도움을 받으시길 강력히 권장드려요.", color: "#E05252" };
    },
  },
};
