import { Link } from "react-router-dom";

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B8BFF" />
          <stop offset="1" stopColor="#0B4BD8" />
        </linearGradient>
      </defs>
      <path
        className="brand-pin"
        d="M20 2C11 2 5 8.6 5 16.6 5 27 20 38 20 38s15-11 15-21.4C35 8.6 29 2 20 2z"
        fill="url(#brand-grad)"
      />
      <circle
        className="brand-lens"
        cx="19"
        cy="16"
        r="6.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
      />
      <path
        className="brand-lens"
        d="M23.6 20.6l4 4"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({
  inverse = false,
  to = "/",
}: {
  inverse?: boolean;
  to?: string;
}) {
  return (
    <Link
      className={inverse ? "brand inverse" : "brand"}
      to={to}
      aria-label="FindIt — Trang chủ"
    >
      <BrandMark />
      <span>
        Find<span className="brand-it">It</span>
      </span>
    </Link>
  );
}
