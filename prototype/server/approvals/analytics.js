// Approval-pipeline analytics: how long items spend at each stage, which
// stage is the bottleneck, and which pending items have waited longest.
// Dwell time per stage = decision time - previous decision time (the first
// stage starts at the item's created_time). Items still waiting count their
// waiting-so-far toward the stage that currently holds them.

import { getSchema, queryAll, readText, parseLog, currentStage, normalize, LOG_PROPERTY, STAGES } from "./shared.js";

const round1 = (n) => Math.round(n * 10) / 10;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: "NOTION_TOKEN is not configured on the server" });

  try {
    const schema = await getSchema(token);
    const titleKey = Object.values(schema).find((p) => p.type === "title")?.actualName;
    const logKey = schema[normalize(LOG_PROPERTY)]?.actualName;
    const statusKey = schema["status"]?.actualName;
    const pages = await queryAll(token);

    const completed = Object.fromEntries(STAGES.map((s) => [s, []])); // hours per finished stage decision
    const waiting = Object.fromEntries(STAGES.map((s) => [s, []])); // hours waited so far, still pending
    const pendingList = [];
    let approved = 0;
    let rejected = 0;
    const now = Date.now();

    for (const page of pages) {
      const log = logKey ? parseLog(page.properties[logKey]) : [];
      const status = statusKey ? readText(page.properties[statusKey]) : "";
      if (status === "Approved") approved += 1;
      if (status === "Rejected") rejected += 1;

      let prev = new Date(page.created_time).getTime();
      for (const e of log) {
        const t = new Date(e.t).getTime();
        if (Number.isFinite(t) && t >= prev) completed[e.s].push((t - prev) / 36e5);
        prev = Number.isFinite(t) ? t : prev;
      }

      if (status === "Pending") {
        const stage = currentStage(log) || STAGES[0];
        const hours = Math.max(0, (now - prev) / 36e5);
        waiting[stage].push(hours);
        pendingList.push({
          id: page.id,
          title: titleKey ? readText(page.properties[titleKey]) : "",
          stage,
          waitingHours: round1(hours),
        });
      }
    }

    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const stages = STAGES.map((s) => {
      const all = [...completed[s], ...waiting[s]];
      return {
        stage: s,
        decisions: completed[s].length,
        pending: waiting[s].length,
        avgHours: round1(avg(all)),
        maxHours: round1(all.length ? Math.max(...all) : 0),
      };
    });

    const withData = stages.filter((s) => s.decisions + s.pending > 0);
    const bottleneck = withData.length ? withData.reduce((a, b) => (b.avgHours > a.avgHours ? b : a)).stage : null;

    return res.status(200).json({
      totals: { items: pages.length, approved, rejected, pending: pendingList.length },
      stages,
      bottleneck,
      longestWaiting: pendingList.sort((a, b) => b.waitingHours - a.waitingHours).slice(0, 5),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
