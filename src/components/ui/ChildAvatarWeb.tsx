"use client";

/**
 * ChildAvatarWeb — paridade web do native ChildAvatar.
 *
 * Renderiza foto da crianca; em erro de carga (signed URL expirou,
 * 404, RLS), faz fallback automatico pra inicial colorida. Sem foto
 * (photoUrl null), tambem cai na inicial.
 *
 * Background sage-light + texto coral pra coerencia visual com native.
 */
import { useState } from "react";

interface Props {
  photoUrl: string | null | undefined;
  firstName: string;
  /** Tamanho em px (lado do quadrado) — default 36 (~9 em tailwind w-9) */
  size?: number;
}

export default function ChildAvatarWeb({ photoUrl, firstName, size = 36 }: Props) {
  const [errored, setErrored] = useState(false);
  const initial = firstName?.charAt(0)?.toUpperCase() || "?";
  const showImage = !!photoUrl && !errored;

  const baseStyle = {
    width: size,
    height: size,
  } as const;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed URL do Supabase Storage; next/image nao adiciona valor aqui
      <img
        src={photoUrl as string}
        alt={`Foto de ${firstName}`}
        onError={() => setErrored(true)}
        style={baseStyle}
        className="rounded-full object-cover flex-shrink-0 bg-white/80"
      />
    );
  }

  return (
    <div
      style={baseStyle}
      className="bg-white/80 rounded-full flex items-center justify-center flex-shrink-0"
    >
      <span className="text-[16px] font-bold text-[#D4735A]">{initial}</span>
    </div>
  );
}
