import { WorkflowConsole } from "@/components/WorkflowConsole";

export default function Home() {
  return (
    <main className="flex-1 p-8">
      <div className="max-w-4xl mx-auto">
        <WorkflowConsole />
      </div>
    </main>
  );
}
