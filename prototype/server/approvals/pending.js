// Lists agenda items still awaiting a decision, each with the stage that
// currently holds it and how long it has been waiting there.

import { getSchema, queryAll, readText, parseLog, currentStage, normalize, LOG_PROPERTY, STAGES } from "./shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: "NOTION_TOKEN is not configured on the server" });

  try {
    const schema = await getSchema(token);
    const status = schema["status"];
    const filter = status
      ? status.type === "select"
        ? { property: status.actualName, select: { equals: "Pending" } }
        : { property: status.actualName, rich_text: { equals: "Pending" } }
      : undefined;
    const pages = await queryAll(token, filter ? { filter } : {});

    const titleKey = Object.values(schema).find((p) => p.type === "title")?.actualName;
    const byKey = schema["submitted by"]?.actualName;
    const meetingKey = schema["meeting"]?.actualName;
    const commentKey = schema["comment"]?.actualName;
    const logKey = schema[normalize(LOG_PROPERTY)]?.actualName;

    const now = Date.now();
    const items = pages.map((page) => {
      const log = logKey ? parseLog(page.properties[logKey]) : [];
      const stage = currentStage(log) || STAGES[0];
      const since = log.length ? log[log.length - 1].t : page.created_time;
      return {
        id: page.id,
        title: titleKey ? readText(page.properties[titleKey]) : "",
        submittedBy: byKey ? readText(page.properties[byKey]) : "",
        meeting: meetingKey ? readText(page.properties[meetingKey]) : "",
        comment: commentKey ? readText(page.properties[commentKey]) : "",
        stage,
        stageIndex: STAGES.indexOf(stage),
        since,
        waitingHours: Math.max(0, (now - new Date(since).getTime()) / 36e5),
        history: log,
      };
    });

    return res.status(200).json({ items, stages: STAGES });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
