# 기분 달력 & 설정 실기능화 설계

> 배경: 사용자가 두 가지를 지적함 — (1) "오늘의 기분" 페이지의 "최근 흐름" 막대그래프가 가시성이 떨어짐, (2) "마이페이지 → 설정" 화면에 실질적으로 작동하는 기능이 없음(토글이 로컬 상태일 뿐 저장/연동되지 않고, "닉네임 익명 표시"·"대화 내용 암호화 적용 중"은 실제 로직 없는 장식용 텍스트). 이 문서는 서로 독립적인 두 서브 프로젝트(A, B)를 다룬다.

## A. 기분 기록 — "최근 흐름"을 월간 달력으로 교체

**현재 상태:** `app/(shell)/mood/page.tsx`의 "최근 흐름" 카드는 `entries`(로컬스토리지 `somit:mood`, 최근 90개까지 저장)에서 최근 14개만 잘라(`recent`) 막대그래프로 보여준다. 막대가 좁고 색 농도로만 기분을 구분해 가시성이 낮다.

**변경:**

1. **월 이동 state 추가**: `const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })`. `<` `>` 버튼으로 `m`을 ±1 (연도 경계 처리 포함).
2. **월 그리드 생성**: `viewMonth` 기준으로 해당 월 1일의 요일, 말일을 계산해 `(요일 오프셋만큼의 null) + (1..말일 날짜)` 배열을 만든다. 각 날짜에 대해 `entries`에서 `date === "YYYY-MM-DD"`인 항목을 찾아 매칭.
3. **렌더링**: 일~토 요일 헤더 + 7열 그리드. 각 칸: 기록 있으면 해당 `MOODS`의 이모지, 없으면 `·`(연한 색). 오늘 날짜 칸은 `border-2 border-primary-dark`로 강조. 기록 있는 칸은 `onClick`으로 선택 가능(`cursor-pointer`), 기록 없는 칸은 클릭 불가.
4. **상세 카드**: 날짜 선택 시 달력 바로 아래에 카드 하나가 나타나 해당 날짜의 이모지+라벨, 체크리스트(✓ 표시된 항목만 나열해도 되고, 전체 5개를 켜짐/꺼짐으로 보여줘도 됨 — 기존 입력 폼과 동일한 스타일로 전체 5개를 켜짐/꺼짐 표시), 한줄 메모(있으면)를 보여준다. 다른 날짜 클릭 시 내용 교체, 같은 날짜 재클릭 시 접힘.
5. **평균 배지**: 기존 "평균 X/5"(전체 평균)를 **현재 `viewMonth`에 속한 entries의 평균**으로 변경. 그 달에 기록이 하나도 없으면 배지 숨김.
6. **제거되는 것**: `recent` useMemo(최근 14일 slice), 기존 막대그래프 JSX 블록.
7. **유지되는 것**: 카드 상단 입력 플로우(이모지 선택, 체크리스트, 메모, 저장 버튼), `average`/`lowStreak`/`showCrisis` 로직(단, `average`는 위 5번에 따라 "월 평균"으로 의미가 바뀜 — 변수명은 유지하되 계산 범위만 바뀜), 기분 공유 동의 체크박스.

**영향 파일:** `app/(shell)/mood/page.tsx` 단일 파일. 백엔드/새 의존성 없음.

## B. 설정 화면 실기능화

**현재 상태:** `app/(shell)/settings/page.tsx`의 토글 4개(새 메시지 알림, 알림음, 채팅 알림, 닉네임 익명 표시)는 `ToggleRow` 내부 `useState`일 뿐 어디에도 저장되지 않고 아무 동작에도 연결되지 않는다. "대화 내용 암호화" 행은 하드코딩된 "적용 중" 텍스트로, 실제 암호화 기능이 없다. 알림 시스템(`useNotifications`)은 서버 알림(현재 `report_reviewed` 타입 하나만 존재)과 채팅 안읽음 파생 알림(`chatItems`) 두 종류뿐이고, 소리 재생 기능은 앱 전체에 존재하지 않는다.

### B-1. 백엔드

**`server/models/User.js`** — 필드 추가:

```js
notificationPrefs: {
  chatMessages: { type: Boolean, default: true },
  systemAlerts: { type: Boolean, default: true },
},
```

**`server/routes/auth.js`**:

- `GET /me` 응답에 `notificationPrefs: user.notificationPrefs` 포함.
- `PATCH /notification-prefs` (신규, `requireAuth`): body `{ chatMessages?: boolean, systemAlerts?: boolean }`. 전달된 필드만 갱신, 저장 후 갱신된 `notificationPrefs` 반환.
- `PATCH /password` (신규, `requireAuth`): body `{ currentPassword, newPassword }`. 둘 다 없으면 400. `bcrypt.compare(currentPassword, user.passwordHash)` 실패 시 401 `{ error: "현재 비밀번호가 올바르지 않습니다" }`. `newPassword.length < 4`면 400(회원가입과 동일 규칙). 통과 시 `bcrypt.hash` 후 저장, `{}` 200 반환.
- `DELETE /me` (신규, `requireAuth`): body `{ password }`. 없으면 400. `bcrypt.compare` 실패 시 401 `{ error: "비밀번호가 올바르지 않습니다" }`. 통과 시 `Notification.deleteMany({ user: req.user.id })` → `User.findByIdAndDelete(req.user.id)` → 로그아웃과 동일하게 쿠키 clear → `{}` 200 반환.

**Null-safe 표시 폴백** (탈퇴 계정이 참조되는 3곳 — 계정 삭제를 실제로 안전하게 만들기 위한 필수 조치):

- `server/routes/community.js`: `authorName: post.author?.name ?? "(탈퇴한 회원)"`, `authorRole: post.author ? authorLabel(post.author) : "회원"` — 게시글/댓글 직렬화 두 곳(`serializePost`류 함수, 댓글 직렬화) 모두 적용.
- `server/routes/counseling.js:160`: `otherPartyName: other?.name ?? "(탈퇴한 회원)"`.

게시글/댓글/채팅방 자체는 삭제하지 않는다(상대방의 기록 보존).

**테스트**: `server/tests/auth-routes.test.js`에 케이스 추가 — 비밀번호 변경 성공/현재비번 오류/새비번 짧음, 계정 삭제 성공/비번 오류, 삭제 후 해당 유저로 로그인 불가, `GET /me`가 `notificationPrefs` 포함. `community-routes.test.js`/`counseling-routes.test.js`에 "작성자 삭제 후에도 목록 조회가 500이 아니라 폴백 이름으로 성공"하는 케이스 추가.

### B-2. 프론트엔드

**`app/hooks/useAuthStatus.tsx`**:

- `LoggedInUser`에 `notificationPrefs: { chatMessages: boolean; systemAlerts: boolean }` 추가, `refresh()`/`setLoggedIn()`에서 채움.
- `updateNotificationPrefs(patch: Partial<NotificationPrefs>)` 함수 추가: 낙관적으로 로컬 state 갱신 후 `apiFetch("/api/auth/notification-prefs", { method: "PATCH", body: ... })` 호출, 실패 시 `refresh()`로 되돌림(기존 `useNotifications`의 generation 패턴과 동일한 정신).

**`app/hooks/useNotifications.tsx`**:

- `auth.notificationPrefs`를 읽어(`useAuthStatus()`), `chatItems`는 `chatMessages === false`면 빈 배열, `serverItems`는 `systemAlerts === false`면 빈 배열로 필터링. (알림 자체는 서버에 계속 쌓이지만 벨/배지/목록에서 보이지 않게 됨 — 끄고 나서 다시 켜면 그동안 쌓인 알림이 다시 보여야 하므로 삭제가 아니라 필터링.)

**`app/(shell)/settings/page.tsx`** 재구성:

- `ToggleRow`를 controlled로 변경: `{ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }`, 내부 `useState` 제거.
- **알림 섹션**: "새 메시지 알림"(`on={auth.notificationPrefs.chatMessages}`, `onChange={(v) => updateNotificationPrefs({ chatMessages: v })}`), "신고 처리 알림"(`systemAlerts`) 2개만. "알림음" 행 삭제.
- **개인정보 섹션**: 통째로 삭제(`SectionCard title="개인정보"` 블록 전체 — "닉네임 익명 표시", "대화 내용 암호화" 둘 다 실체 없는 표시라 제거).
- **계정 섹션** (로그인 상태에서만 노출, 기존과 동일): 로그아웃 버튼 아래에:
  - **"비밀번호 변경"** 행: 클릭 시 아래로 폼 펼침(현재 비밀번호 / 새 비밀번호 / 새 비밀번호 확인 — 3개 `<input type="password">`). 확인란이 새 비밀번호와 다르면 클라이언트에서 즉시 에러 메시지. 제출 시 `PATCH /api/auth/password` 호출, 성공하면 "변경됐어요" 표시 후 폼 접음, 실패하면 서버 에러 메시지(예: "현재 비밀번호가 올바르지 않습니다") 그대로 표시.
  - **"회원 탈퇴"** 행(`text-danger`, 로그아웃과 같은 스타일): 클릭 시 경고 문구("탈퇴하면 되돌릴 수 없어요") + 비밀번호 입력 + 빨간 "탈퇴하기" 버튼이 펼쳐짐. 제출 시 `DELETE /api/auth/me` 호출, 성공하면 `setLoggedOut()` + `router.push("/")`, 실패하면 에러 메시지 표시.
- **앱 정보 섹션**: 변경 없음(버전만 표시, 기존 그대로).

**영향 파일**: `server/models/User.js`, `server/routes/auth.js`, `server/routes/community.js`, `server/routes/counseling.js`, `server/tests/auth-routes.test.js`(+community/counseling 테스트), `app/hooks/useAuthStatus.tsx`, `app/hooks/useNotifications.tsx`, `app/(shell)/settings/page.tsx`.

## 영향 범위 및 테스트 (공통)

- A는 프론트엔드 전용, B는 백엔드+프론트엔드. 새 npm 의존성 없음.
- `npx tsc --noEmit`, `npx eslint .`, `npm run build`(프론트) 통과.
- `node --test`(백엔드, `server/` 디렉토리) 통과.
- 수동 확인:
  - `/mood`: 여러 날짜에 로컬스토리지로 기록을 채운 뒤 달력에 이모지가 뜨는지, 월 이동이 되는지, 날짜 클릭 시 상세가 펼쳐지는지, 월 평균이 달마다 다르게 계산되는지.
  - `/settings`: 알림 토글 2개를 끄고 새로고침해도 상태가 유지되는지(서버 저장 확인), 끈 상태에서 실제로 알림 벨에 해당 알림이 안 뜨는지, 비밀번호 변경(정상/현재비번 틀림/새비번 4자 미만), 회원 탈퇴 후 해당 계정으로 로그인 시도 시 실패하는지, 탈퇴 전 그 사람이 쓴 게시글이 다른 계정으로 봤을 때 "(탈퇴한 회원)"로 정상 표시되는지.
