import Link from "next/link";

interface HeaderProps {
  currentPath?: string;
}

export function Header({ currentPath }: HeaderProps) {
  return (
    <header className="border-b-3 border-border bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link
          href="/"
          className="flex min-w-0 items-baseline gap-2 leading-none"
        >
          <h1
            className="text-sm font-extrabold leading-none tracking-[0.05em] sm:text-xl sm:tracking-[0.08em]"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            INTERDIMENSIONAL CABLE
          </h1>
        </Link>

        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          {currentPath !== "/create" && (
            <Link
              href="/create"
              className="flex items-center gap-1 border-3 border-border bg-accent px-3 py-2 text-xs font-bold uppercase tracking-wider sm:px-5 sm:text-sm shadow-[3px_3px_0_var(--border)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--border)]"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              Create Show
            </Link>
          )}
          {!currentPath?.startsWith("/templates") && (
            <Link
              href="/templates"
              className="flex items-center gap-1 border-3 border-border bg-surface px-3 py-2 text-xs font-bold uppercase tracking-wider sm:px-5 sm:text-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              Templates
            </Link>
          )}
          {currentPath !== "/media" && currentPath !== "/" && (
            <Link
              href="/media"
              className="flex items-center gap-1 border-3 border-border bg-surface px-3 py-2 text-xs font-bold uppercase tracking-wider sm:px-5 sm:text-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              Browse
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
