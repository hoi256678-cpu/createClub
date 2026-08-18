# 설정/공지사항/기분기록 버그 수정 설계 (A그룹)

> 배경: 사용자가 8개 버그/기능 요청을 한번에 전달했음. 그중 5,6,7,8번(상담사 배정 시스템)은 새 서브시스템 설계가 필요해 별도 스펙으로 분리하고, 이 문서는 독립적인 4개 소규모 수정(1,2,3,4번)만 다룬다.

## 범위

1. 마이페이지 → 설정 화면 토글 버튼이 좁은 화면에서 트랙 밖으로 벗어나 렌더링되는 시각적 버그 수정
2. 설정 화면의 "백엔드 연결 상태" 표시 제거
3. 커뮤니티 공지사항 클릭 시 상세 내용을 볼 수 있게 만들기
4. 오늘의 기분 기록 후 "최근 흐름" 막대그래프가 렌더링되지 않는 버그 수정

## 1. 설정 토글 버튼 위치 버그

**현재 상태:** `app/(shell)/settings/page.tsx`의 `ToggleRow` 컴포넌트에서 thumb(`<span>`)이 `absolute` + `top-0.5`만 지정되어 있고 `left`가 없다. 이 상태에서 `translate-x-[22px]`(켜짐) / `translate-x-0.5`(꺼짐)로 이동시키는데, `left`가 미지정이면 브라우저가 static position을 계산해서 기준점을 잡고, 이 기준점이 넓은 화면에서는 우연히 맞아떨어지지만 좁은 화면(모바일 폭)에서는 버튼 오른쪽 바깥으로 계산되어 thumb이 트랙 밖에 떠 있는 것처럼 보인다. 실제로 모바일 폭 탭에서 측정한 결과 트랙은 x:545~589px인데 thumb은 x:589~609px로 트랙 오른쪽 경계 밖에 통째로 렌더링됨을 확인했다.

**수정:** thumb `<span>`에 `left-0.5`를 명시적으로 추가해 기준 위치를 고정한다. `translate-x-[22px]` / `translate-x-0.5`는 그대로 두되, 이제 `left-0.5`(2px)를 기준으로 한 상대 이동이 되어 화면 폭과 무관하게 일관되게 계산된다.

```tsx
<span
  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
    on ? "translate-x-[22px]" : "translate-x-0"
  }`}
/>
```

(off 상태의 `translate-x-0.5`는 `left-0.5`가 이미 2px를 담당하므로 `translate-x-0`으로 단순화)

## 2. 백엔드 연결 상태 제거

**현재 상태:** `app/(shell)/settings/page.tsx`의 "앱 정보" 섹션에 `<SystemStatus />`를 사용해 백엔드 헬스체크 상태를 보여주는 행이 있다.

**수정:** 해당 행(`백엔드 연결 상태` label + `<SystemStatus />`)을 삭제하고 `SystemStatus` import를 제거한다. `app/components/SystemStatus.tsx`를 다른 곳에서 참조하는지 확인 후, 안 쓰이면 파일 자체도 삭제한다.

## 3. 공지사항 상세 페이지

**현재 상태:** `app/(shell)/community/mock.ts`의 `NOTICE_POSTS`는 `{ id, title, time }`만 가진 정적 배열이고, `app/(shell)/community/page.tsx`의 두 곳(공지사항 탭, 사이드바 카드)에서 `<Card>`/`<div>`로 제목만 렌더링할 뿐 클릭 핸들러가 전혀 없다.

**수정:**
- `NOTICE_POSTS` 각 항목에 `body: string` 필드를 추가한다(공지 3개에 짧은 샘플 본문을 채워 넣는다 — 실제 문구는 추후 직접 교체 가능하도록 평이한 문장으로 작성).
- 새 라우트 `app/(shell)/community/notice/[id]/page.tsx`를 추가한다. `id`로 `NOTICE_POSTS`에서 항목을 찾아 제목/날짜/본문을 카드로 보여준다. 게시글 상세(`community/[id]/page.tsx`)와 톤은 맞추되 좋아요·댓글 UI는 없다. 못 찾으면 "공지를 찾을 수 없어요" + 목록으로 돌아가기 링크(기존 상담사 상세 페이지의 not-found 패턴과 동일).
- `community/page.tsx`의 두 `NOTICE_POSTS.map(...)` 블록을 각각 `<Link href={`/community/notice/${n.id}`}>`로 감싸 클릭 가능하게 만든다.

이 기능은 정적 mock 데이터만 사용하며 백엔드 변경이 없다.

## 4. 기분 기록 "최근 흐름" 차트 렌더링 버그

**현재 상태:** `app/(shell)/mood/page.tsx`에서 막대그래프 컨테이너가 `flex h-28 items-end gap-1.5`이고, 각 막대의 wrapper(`flex flex-1 flex-col items-center gap-1`)는 높이가 지정되어 있지 않다. `items-end`는 flex item(=wrapper)을 늘리지 않고 콘텐츠 높이만큼만 차지하게 만들기 때문에, wrapper의 실제 높이는 auto가 되고, 그 안의 막대 `<div style={{height: '${pct}%'}}>`는 부모가 auto 높이라 퍼센트 높이를 계산할 기준이 없어 0으로 무너진다. 결과적으로 막대가 전혀 보이지 않고 날짜 라벨만 남는다.

**수정:** 컨테이너에서 `items-end`를 제거(기본값 `items-stretch`로 각 wrapper가 컨테이너 전체 높이 112px로 늘어남)하고, wrapper에 `h-full flex flex-col justify-end items-center gap-1`을 적용한다. 이제 막대의 퍼센트 높이가 확실한 112px 기준으로 계산되고, `justify-end`가 막대+라벨을 바닥에 붙여 기존 디자인과 동일하게 보인다.

## 영향 범위 및 테스트

- 변경 파일: `app/(shell)/settings/page.tsx`, `app/components/SystemStatus.tsx`(삭제 가능성), `app/(shell)/community/mock.ts`, `app/(shell)/community/page.tsx`, `app/(shell)/community/notice/[id]/page.tsx`(신규), `app/(shell)/mood/page.tsx`
- 백엔드/DB 변경 없음, 새 npm 의존성 없음
- 수동 확인: 설정 화면 토글 클릭(넓은 화면 + 좁은 화면 폭 모두), 공지사항 클릭 → 상세 페이지 이동 → 뒤로가기, 기분 기록 저장 후 "최근 흐름" 막대가 실제로 보이는지
- `npx tsc --noEmit`, `npx eslint .`, `npm run build` 통과 확인
