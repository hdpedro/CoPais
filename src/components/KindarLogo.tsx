"use client";

import Image from "next/image";

type KindarLogoProps = {
  size?: number;
  background?: "light" | "dark" | "sand";
};

export default function KindarLogo({ size = 40 }: KindarLogoProps) {
  return (
    <Image
      src="/kindar-logo.png"
      alt=""
      width={size}
      height={size}
      className="object-contain"
      priority
      aria-hidden="true"
    />
  );
}
