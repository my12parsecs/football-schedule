import { LeagueTableView } from "@/components/LeagueTableView";

export const metadata = {
  title: "Tables | Europe's big five leagues",
  description:
    "Current league tables for the Premier League, La Liga, Serie A, Bundesliga and Ligue 1.",
};

/**
 * The table view highlights the clubs saved in localStorage, so it renders on
 * the client. This page is just the shell around it.
 */
export default function TablesPage() {
  return (
    <div className="flex flex-1 flex-col font-sans">
      <LeagueTableView />
    </div>
  );
}
