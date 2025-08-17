import Navbar from "./Navbar";
import CategoryBar from "./CategoryBar";
import DailyPlannerExpanded from "./DailyPlannerExpanded";
import MusicPlayer from "./MusicPlayer";
import TimerCard from "./TimerCard";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <CategoryBar />

      <div className="flex flex-1 p-6 gap-6">
        {/* Left: full main screen with animated gradient + timer */}
        <div className="flex-1 rounded-lg overflow-hidden">
          <TimerCard />
        </div>

        {/* Right: planner + music (scrolls internally so it doesn't push layout) */}
        <div className="w-full max-w-md space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">
          <DailyPlannerExpanded />
          <MusicPlayer />
        </div>
      </div>
    </div>
  );
}
