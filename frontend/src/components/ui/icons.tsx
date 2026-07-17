import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} width="20" height="20" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}

export function HeartIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base} width="22" height="22" fill={filled ? 'currentColor' : 'none'} {...props}>
      <path d="M12 20s-7-4.3-9.3-8.4C1.2 8.9 2.4 5.5 5.6 5.1 7.6 4.8 9.3 6 12 8.7c2.7-2.7 4.4-3.9 6.4-3.6 3.2.4 4.4 3.8 2.9 6.5C19 15.7 12 20 12 20Z" />
    </svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...base} width="22" height="22" {...props}>
      <path d="M3 3h2l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.2L22 7H6" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} width="22" height="22" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function GiftIcon(props: IconProps) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
      <path d="M3 13h18M12 9v12" />
      <path d="M12 9C10.5 5.5 6 6 6.5 8.5 6.9 10.5 12 9 12 9Zm0 0c1.5-3.5 6-3 5.5-.5C17.1 10.5 12 9 12 9Z" />
    </svg>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <svg {...base} width="28" height="28" {...props}>
      <path d="M4 20C3 12 8 4 20 4c0 12-8 17-16 16Z" />
      <path d="M9 15c3-3 6-4 9-4" />
    </svg>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <svg {...base} width="28" height="28" {...props}>
      <path d="M3 6h11v9H3z" />
      <path d="M14 9h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17.5" cy="18" r="1.6" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base} width="28" height="28" {...props}>
      <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...props}>
      <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
      <path d="M12 2c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7Z" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} width="24" height="24" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} width="22" height="22" {...props}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...base} width="22" height="22" {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}
