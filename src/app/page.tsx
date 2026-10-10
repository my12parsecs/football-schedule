import { FixtureBoard } from "@/components/FixtureBoard";

/**
 * The board reads the user's saved clubs from localStorage, so it renders on
 * the client. This page is just the static shell around it.
 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col font-sans">
      <FixtureBoard />
    </div>
  );
}
