"use client";

type KindarLogoProps = {
  size?: number;
  background?: "light" | "dark" | "sand";
};

export default function KindarLogo({ size = 40, background = "light" }: KindarLogoProps) {
  const coral = background === "dark" ? "#E08870" : "#C07055";
  const teal = background === "dark" ? "#52A898" : "#2E7268";
  const bg = background === "dark" ? "#0E0C0A" : background === "sand" ? "#F5EFE6" : "#FFFFFF";

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <path d="M10 40 C10 20 17 7 28 9 C23 15 21 26 21 40 C21 54 23 65 28 71 C17 73 10 60 10 40Z" fill={coral}/>
      <path d="M70 40 C70 20 63 7 52 9 C57 15 59 26 59 40 C59 54 57 65 52 71 C63 73 70 60 70 40Z" fill={teal}/>
      <circle cx="40" cy="40" r="11" fill={bg}/>
      <circle cx="40" cy="40" r="6" fill={coral} opacity={0.15}/>
      <circle cx="40" cy="40" r="3" fill={bg} stroke={teal} strokeWidth="1.5"/>
      <circle cx="40" cy="40" r="1.4" fill={teal}/>
    </svg>
  );
}
