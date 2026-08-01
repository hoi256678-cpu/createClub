This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 배포 현황 (솜잇 과제 산출물)

- 프론트엔드 (Vercel): https://create-club-5kro.vercel.app
- 백엔드 (Railway): https://createclub-production.up.railway.app
- DB: MongoDB Atlas M0 Free Tier (백엔드를 통해서만 접근, `/api/health`로 연결 상태 확인 가능)
- Railway에는 반드시 `NODE_ENV=production`을 설정해야 함 — 빠지면 인증 쿠키가 `Secure`/`SameSite=None`이 아닌 상태로 내려가 Vercel↔Railway 크로스 도메인 환경에서 브라우저가 쿠키를 전송하지 않고, 로그인은 200으로 성공하는 것처럼 보이지만 `/me`가 계속 401을 반환하는 조용한 실패로 이어짐
