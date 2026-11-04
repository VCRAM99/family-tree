"use client";

import dynamic from "next/dynamic";

import { SplashFrame } from "@/components/splash-frame";

const SplashTree = dynamic(() => import("@/components/splash-tree").then((mod) => mod.SplashTree), {
  ssr: false,
  loading: () => <SplashFrame />,
});

export function LazySplashTree() {
  return <SplashTree />;
}
