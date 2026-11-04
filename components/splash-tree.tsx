"use client";

const people = [
  { id: "eleanor", name: "Eleanor Voss", years: "1942", x: 70, y: 36 },
  { id: "arthur", name: "Arthur Voss", years: "1940 – 2016", x: 250, y: 36 },
  { id: "clara", name: "Clara Hale", years: "1968", x: 28, y: 150 },
  { id: "james", name: "James Voss", years: "1971", x: 292, y: 150 },
  { id: "nora", name: "Nora Hale", years: "1994", x: 8, y: 264 },
  { id: "miles", name: "Miles Cho", years: "1992", x: 168, y: 264 },
  { id: "iris", name: "Iris Cho", years: "2018", x: 78, y: 378 },
];

const branches = [
  "M 160 78 H 250",
  "M 160 78 V 118 H 90 V 150",
  "M 160 118 H 354 V 150",
  "M 90 192 V 232 H 70 V 264",
  "M 90 232 H 230 V 264",
  "M 150 306 V 346 H 140 V 378",
];

export function SplashTree() {
  return (
    <div className="splash-stage relative h-56 overflow-hidden rounded-[2rem] border border-border bg-surface/80 lg:h-[32rem]">
      <style>{splashCss}</style>
      <svg viewBox="0 0 460 460" className="splash-camera h-full w-full" role="img" aria-label="An animated sample of the Voss and Hale families">
        <g className="splash-draw" fill="none" stroke="currentColor" strokeWidth="1.4">
          {branches.map((d) => (
            <path key={d} d={d} className="text-border" />
          ))}
        </g>
        {people.map((person, index) => (
          <g key={person.id} className="splash-person" style={{ animationDelay: `${index * 0.7}s` }}>
            <rect x={person.x} y={person.y} width="132" height="52" rx="16" className="fill-surface stroke-border" />
            <rect x={person.x} y={person.y} width="4" height="52" rx="2" className={index % 2 === 0 ? "fill-mother" : "fill-father"} />
            <text x={person.x + 16} y={person.y + 24} className="fill-text" style={{ fontSize: 14, fontFamily: "Georgia, serif" }}>
              {person.name.split(" ")[0]}
            </text>
            <text x={person.x + 16} y={person.y + 40} className="fill-muted" style={{ fontSize: 11 }}>
              {person.years}
            </text>
          </g>
        ))}
        <g className="splash-focus">
          <rect x="62" y="28" width="148" height="68" rx="20" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-accent" />
          <path d="M210 62 H236" className="text-accent" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M228 54 L238 62 L228 70" className="text-accent" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </g>
      </svg>
    </div>
  );
}

const splashCss = `
.splash-draw path {
  stroke-dasharray: 280;
  stroke-dashoffset: 280;
  animation: splash-draw 8s ease forwards infinite;
}
.splash-person { opacity: 0; animation: splash-in 8s ease infinite; }
.splash-focus { transform-origin: 120px 62px; animation: splash-glide 16s ease-in-out infinite; }
.splash-camera { transform-origin: 50% 40%; animation: splash-camera 16s ease-in-out infinite; }
@keyframes splash-draw { 20% { stroke-dashoffset: 0; } 80% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 280; } }
@keyframes splash-in { 12% { opacity: 0; } 28% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes splash-glide {
  0%, 18% { transform: translate(0, 0); }
  30%, 48% { transform: translate(-40px, 114px); }
  60%, 78% { transform: translate(8px, 228px); }
  100% { transform: translate(0, 0); }
}
@keyframes splash-camera {
  0%, 18% { transform: scale(1) translate(0, 0); }
  30%, 48% { transform: scale(1.08) translate(20px, -30px); }
  60%, 78% { transform: scale(1.12) translate(10px, -70px); }
  100% { transform: scale(1) translate(0, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .splash-draw path, .splash-person, .splash-focus, .splash-camera { animation: none; }
  .splash-draw path { stroke-dashoffset: 0; }
  .splash-person { opacity: 1; }
}
`;
