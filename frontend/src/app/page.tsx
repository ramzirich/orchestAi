import { BACKEND_URL } from "@/lib/api";
import { WorkflowConsole } from "@/components/WorkflowConsole";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">OrchestAI</h1>
            <p className="text-zinc-400 mt-1">Visual multi-agent workflow builder.</p>
          </div>
          <div className="text-xs text-zinc-500 font-mono">{BACKEND_URL}</div>
        </header>

        <WorkflowConsole />
      </div>
    </main>
  );
}
