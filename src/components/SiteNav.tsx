"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Fixtures" },
  { href: "/tables", label: "Tables" },
] as const;

/**
 * Pinned to the top of the viewport so you can switch pages from anywhere in a
 * long list.
 *
 * Its height is fixed at `h-12` on purpose: the fixtures page stacks two more
 * sticky layers underneath (the toolbar at `top-12`, day headings at
 * `top-[6.5rem]`), and those offsets are only correct while this bar keeps a
 * known height.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      <nav className="mx-auto flex h-12 w-full max-w-3xl items-center gap-1 px-4">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
