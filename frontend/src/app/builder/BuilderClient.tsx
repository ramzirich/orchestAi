"use client";

import dynamic from "next/dynamic";

const WorkflowBuilder = dynamic(
  () => import("@/components/WorkflowBuilder").then((m) => m.WorkflowBuilder),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
        Loading builder...
      </div>
    ),
  },
);

export default function BuilderClient() {
  return <WorkflowBuilder />;
}
