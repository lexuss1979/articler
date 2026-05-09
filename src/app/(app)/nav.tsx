'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/profiles', label: 'Profiles' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/settings/budget', label: 'Budget' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== '/dashboard' && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              'px-3 py-1.5 rounded ' +
              (active
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100')
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
