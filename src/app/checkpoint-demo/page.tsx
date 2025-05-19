'use client';

import ToolCallDemo from '../../components/CheckpointUI/ToolCallDemo';

export default function CheckpointDemoPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <header className="bg-gray-900 py-4 px-6 mb-6">
        <h1 className="text-xl font-bold">Kibitz Checkpoint System</h1>
        <p className="text-gray-400">Automatic checkpoints and rollbacks with tool integration</p>
      </header>
      
      <main>
        <ToolCallDemo />
      </main>
      
      <footer className="bg-gray-900 py-4 px-6 mt-10 text-center text-gray-400">
        <p>Built with Next.js and Tailwind CSS</p>
      </footer>
    </div>
  );
} 