// Fondo del hero: el contorno de una cancha generica, sirve para cualquier deporte.
export function CourtHeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gray-950">
      <div className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-brand-500/30 blur-[110px]" />
      <div className="absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full bg-brand-800/35 blur-[110px]" />

      <svg
        className="absolute -right-24 top-1/2 h-[130%] w-auto -translate-y-1/2 text-brand-300/[0.16] sm:right-0"
        viewBox="0 0 400 600"
        fill="none"
      >
        <g transform="rotate(-10 200 300)">
          <rect x="40" y="20" width="320" height="560" rx="10" stroke="currentColor" strokeWidth="2.5" />
          <line x1="40" y1="300" x2="360" y2="300" stroke="currentColor" strokeWidth="2.5" />
          <line x1="40" y1="180" x2="360" y2="180" stroke="currentColor" strokeWidth="1.5" />
          <line x1="40" y1="420" x2="360" y2="420" stroke="currentColor" strokeWidth="1.5" />
          <line x1="200" y1="20" x2="200" y2="180" stroke="currentColor" strokeWidth="1.5" />
          <line x1="200" y1="420" x2="200" y2="580" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="200" cy="300" r="4" className="fill-primary-500" />
        </g>
      </svg>

      <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-gray-950/60 via-transparent to-transparent" />
    </div>
  )
}
