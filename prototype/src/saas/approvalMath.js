// Pure helpers for the approval screens (kept separate so they can be tested on their own).

export const MIN_BOTTLENECK_HOURS = 5 / 60; // below 5 minutes on average, no stage is flagged

const groupByItem = (decisions) => {
  const map = new Map();
  for (const d of decisions) {
    if (!map.has(d.item_id)) map.set(d.item_id, []);
    map.get(d.item_id).push(d);
  }
  for (const list of map.values()) list.sort((a, b) => a.stage_position - b.stage_position);
  return map;
};

// For one item: how many stages approved, which stage is next, and since when it has been waiting there.
export function itemState(item, decisionsOfItem = [], stageCount) {
  const approved = decisionsOfItem.filter((d) => d.action === "approved").length;
  const last = decisionsOfItem[decisionsOfItem.length - 1];
  return {
    approved,
    position: item.status === "pending" && approved < stageCount ? approved + 1 : null, // 1-based
    since: last ? last.decided_at : item.created_at,
  };
}

// Time spent per stage = decision time minus the previous decision (stage 1 starts when the item was created).
// Items still waiting count their waiting-so-far toward the stage that holds them.
export function pipelineAnalytics(items, decisions, stages, now = Date.now()) {
  const byItem = groupByItem(decisions);
  const done = Object.fromEntries(stages.map((s) => [s.position, []]));
  const waiting = Object.fromEntries(stages.map((s) => [s.position, []]));

  for (const item of items) {
    const list = byItem.get(item.id) || [];
    let prev = Date.parse(item.created_at);
    for (const d of list) {
      const t = Date.parse(d.decided_at);
      if (done[d.stage_position] && Number.isFinite(t) && t >= prev) done[d.stage_position].push((t - prev) / 36e5);
      if (Number.isFinite(t)) prev = t;
    }
    if (item.status === "pending") {
      const approved = list.filter((d) => d.action === "approved").length;
      const pos = approved + 1;
      if (waiting[pos]) waiting[pos].push(Math.max(0, (now - prev) / 36e5));
    }
  }

  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const rows = stages.map((s) => {
    const all = [...done[s.position], ...waiting[s.position]];
    return { position: s.position, name: s.name, decided: done[s.position].length, waiting: waiting[s.position].length, avgHours: avg(all) };
  });
  const withData = rows.filter((r) => r.decided + r.waiting > 0);
  const slowest = withData.length >= 2 ? withData.reduce((a, b) => (b.avgHours > a.avgHours ? b : a)) : null;
  return {
    rows,
    bottleneck: slowest && slowest.avgHours >= MIN_BOTTLENECK_HOURS ? slowest.position : null,
    totals: {
      items: items.length,
      pending: items.filter((i) => i.status === "pending").length,
      approved: items.filter((i) => i.status === "approved").length,
      rejected: items.filter((i) => i.status === "rejected").length,
    },
  };
}

export function canDecide({ isAdmin, approvalStage }, position) {
  return !!position && (isAdmin || approvalStage === position);
}
