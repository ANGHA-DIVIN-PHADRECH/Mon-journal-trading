"use client";

import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { TradePlan } from "@/components/trade-plan";

export default function PlanPage() {
  return (
    <Suspense>
      <div>
        <FilterBar title="Plan de trade" />
        <TradePlan />
      </div>
    </Suspense>
  );
}
