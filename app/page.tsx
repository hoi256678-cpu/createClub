export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[100px]"
        style={{
          background:
            "radial-gradient(closest-side, var(--accent) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
        <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-line bg-ink-2/60 px-4 py-1.5 font-mono text-xs tracking-wide text-muted">
          <span
            className="status-dot h-1.5 w-1.5 rounded-full bg-accent"
            aria-hidden
          />
          CREATECLUB
        </div>

        <h1 className="font-display text-6xl font-medium leading-[1.05] tracking-tight text-paper sm:text-7xl">
          Hello, World
          <span className="text-accent">.</span>
          <span
            className="cursor-blink ml-1 inline-block h-[0.85em] w-[3px] translate-y-1 bg-accent-2 align-middle"
            aria-hidden
          />
        </h1>

        <p className="mt-6 max-w-md text-balance text-base text-muted sm:text-lg">
          The first line of something new. CreateClub is warming up.
        </p>

        <div className="my-12 h-px w-24 bg-gradient-to-r from-transparent via-line to-transparent" />

        <div className="flex w-full items-center justify-between font-mono text-xs text-muted">
          <span>v0.1.0 &middot; initializing</span>
          <span>2026</span>
        </div>
      </div>
    </main>
  );
}
