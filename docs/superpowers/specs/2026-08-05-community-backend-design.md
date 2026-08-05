# 커뮤니티 백엔드 연동 설계

## 배경

`app/(shell)/community/**`는 현재 전부 `mock.ts`의 정적 배열(`COMMUNITY_POSTS`)로만 동작한다. 글쓰기, 댓글, 좋아요 모두 화면의 React state만 바뀌고 새로고침하면 사라진다. 이 문서는 이 부분을 실제 MongoDB 백엔드에 연결하는 설계를 다룬다.

기존 백엔드(`server/`)는 인증(회원가입/로그인/로그아웃/me)만 구현되어 있고, `User` 모델 하나만 존재한다.

## 범위

**포함**
- 게시글 작성 / 목록 조회 / 상세 조회 / 조회수
- 댓글 작성
- 좋아요(사용자당 1회, 토글)
- 마이페이지의 "작성한 글" 개수

**제외 (정적 유지)**
- `NOTICE_POSTS`(공지사항): 사용자가 만드는 콘텐츠가 아니라 앱 설정성 콘텐츠라 이번 범위에서 제외.
- `TOPICS`/`TOPIC_EMOJI`(주목받는 주제 태그 목록): 마찬가지로 정적 설정.
- "저장한 글", "상담 횟수"(마이페이지 통계): 저장 기능 자체가 아직 없고, 상담 횟수는 채팅 백엔드 연동 범위에 속하므로 이번 작업에서 다루지 않는다.

## 확정된 결정 사항

- 글쓰기/댓글/좋아요는 로그인한 사용자만 가능 (조회는 비로그인도 가능, 현재와 동일).
- 기존 데모용 목데이터 8개는 시드로 넣지 않는다 — 커뮤니티는 빈 상태로 시작한다.
- 게시글에 표시되던 작성자 성별/나이(`남성 22세` 등)는 제거하고, 작성자의 역할(`role`)을 이용한 배지("상담사" / "고민 청소년")로 대체한다. 회원가입 시점에 성별/나이 정보를 수집하지 않기 때문.
- 좋아요는 사용자당 1회로 제한하고 토글(좋아요/취소)이 가능해야 한다 — 좋아요를 누른 사용자 목록을 서버에 저장해 중복/취소를 판별한다.

## 데이터 모델

`server/models/Post.js`를 신규 추가한다. 댓글은 별도 컬렉션 없이 게시글 문서 안에 서브도큐먼트 배열로 내장한다 (이 프로젝트 규모에서 별도 컬렉션/조인은 과함).

```js
const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tag: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    views: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
```

기존 `User` 모델에는 `name`, `role`(`counselor` | `client`)이 이미 있으므로, 작성자 표시는 이 두 필드를 populate해서 사용한다 (`role === "counselor"` → "상담사", 그 외 → "고민 청소년").

## API

`server/routes/community.js`를 신규 추가하고 `index.js`에 `/api/community`로 마운트한다. 인증이 필요한 라우트는 기존 `requireAuth` 미들웨어를 그대로 재사용한다.

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/community/posts` | 선택적 | 게시글 목록(최신순). 로그인 상태면 각 글에 `likedByMe` 포함 |
| GET | `/api/community/posts/:id` | 선택적 | 게시글 상세 + 댓글. 호출될 때마다 `views` +1 |
| POST | `/api/community/posts` | 필수 | `{ tag, title, body }`로 게시글 생성 |
| POST | `/api/community/posts/:id/comments` | 필수 | `{ text }`로 댓글 추가 |
| POST | `/api/community/posts/:id/like` | 필수 | 좋아요 토글. 응답: `{ liked, likeCount }` |
| GET | `/api/community/my-posts/count` | 필수 | 현재 로그인한 사용자가 쓴 글 개수 |

응답 형태 예시 (목록 항목):
```json
{
  "id": "665f...",
  "tag": "스트레스",
  "title": "...",
  "body": "...",
  "authorName": "테스트유저",
  "authorRole": "client",
  "createdAt": "2026-08-05T12:00:00.000Z",
  "views": 12,
  "likeCount": 3,
  "cmtCount": 2,
  "likedByMe": false
}
```

상대 시간("1일 전" 등)은 프론트에서 `createdAt`을 기준으로 계산한다 (서버는 절대 시간만 내려줌).

인증이 필요한데 로그인하지 않은 요청은 기존 패턴과 동일하게 401을 반환한다 (`requireAuth` 미들웨어 그대로 사용).

## 프론트엔드 변경

- `app/(shell)/community/page.tsx`: `COMMUNITY_POSTS` import 제거, `GET /api/community/posts` 호출로 대체. 검색/인기글 필터링은 지금처럼 클라이언트에서 계속 처리.
- `app/(shell)/community/[id]/page.tsx`: `GET /api/community/posts/:id` 호출. 좋아요 버튼은 `POST .../like` 호출 후 응답으로 상태 갱신. 댓글 작성은 `POST .../comments` 호출 후 목록 갱신.
- `app/(shell)/community/write/page.tsx`: 제출 시 `POST /api/community/posts` 호출, 성공하면 새 글 상세로 이동. 현재 있는 "아직 연결 전이에요" 안내 문구 제거.
- 게시글 id 타입이 숫자(0~7)에서 Mongo ObjectId 문자열로 바뀌므로 `Number(params.id)`로 비교하던 부분을 문자열 비교로 수정.
- 로그아웃 상태에서 글쓰기/댓글/좋아요 시도 시 로그인 페이지(`/login`)로 이동시킨다. 버튼/입력창 자체는 계속 보이되, 클릭 시 로그인 여부를 확인해 비로그인이면 즉시 `router.push("/login")`으로 이동 (Sidebar의 `handleNavClick`이 이미 쓰는 것과 같은 패턴).
- `app/(shell)/mypage/page.tsx`: "작성한 글" 카운트를 `GET /api/community/my-posts/count` 결과로 표시 (로그인 상태에서만 호출).

## 에러 처리

- 서버 다운/네트워크 오류: 기존 로그인/회원가입 페이지와 동일하게 "백엔드에 연결할 수 없습니다" 류의 안내.
- 없는 게시글 상세 조회(404): 현재 프론트에 이미 있는 "게시글을 찾을 수 없어요" 화면을 그대로 사용 (mock 데이터 없을 때와 동일 UX, API가 404를 반환하면 그 문구를 띄움).
- 유효성 검증: 제목/본문 빈 값 등은 회원가입 라우트처럼 400 + 한글 에러 메시지.

## 테스트

`server/tests/auth-routes.test.js`와 동일한 패턴(`mongodb-memory-server` + `supertest`)으로 `server/tests/community-routes.test.js`를 작성한다. 최소 커버리지:
- 글 작성 → 목록/상세에 반영
- 비로그인 글쓰기/댓글/좋아요 시도 → 401
- 좋아요 토글 (누르면 +1, 다시 누르면 -1, `likedByMe` 값 반전)
- 상세 조회 시 조회수 증가
- 댓글 작성 후 상세에 반영, `cmtCount` 증가
- 내가 쓴 글 개수 카운트

## 미해결/추후 과제 (이번 범위 아님)

- 게시글 검색을 서버 사이드로 옮기는 것 (현재 규모에서는 불필요)
- 게시글 수정/삭제
- "저장한 글" 기능, 채팅/알림 백엔드 연동
