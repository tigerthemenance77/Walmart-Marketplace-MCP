export function renderFeedUsageGauge(data: {
  used: number;
  limit: number;
  feedType: string;
  breakdown: Array<{ type: string; count: number; lastUsed?: string }>;
}): string {
  const used = Math.max(0, Number(data.used) || 0);
  const limit = Math.max(1, Number(data.limit) || 6);
  const ratio = Math.min(used, limit) / limit;
  const blocked = used >= limit;

  const color = used >= 6 ? "#ef4444" : used === 5 ? "#f97316" : used >= 3 ? "#eab308" : "#22c55e";

  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const gap = circumference - dash;

  const breakdown = [...(data.breakdown ?? [])]
    .filter((b) => b && b.count > 0)
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  const latestTs = breakdown
    .map((b) => b.lastUsed)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);

  const esc = (s: string): string =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const rows = breakdown.length
    ? breakdown.map((b) => `<li><span>${esc(b.type)}</span><strong>${b.count}</strong></li>`).join("")
    : "<li><span>No feeds submitted today</span><strong>0</strong></li>";

  const centerText = blocked ? "BLOCKED" : `${used}/${limit}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Daily Feed Usage</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; background:#0b0f14; color:#e5e7eb; font:500 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif; }
    .card { max-width:560px; margin:0 auto; padding:16px; }
    h1 { margin:0 0 10px; font-size:clamp(16px,2.5vw,20px); font-weight:700; }
    .sub { color:#94a3b8; margin-bottom:12px; }
    .g { display:grid; place-items:center; margin:8px 0 12px; }
    svg { width:min(280px,100%); height:auto; display:block; }
    .c1 { fill:none; stroke:#1f2937; stroke-width:14; }
    .c2 { fill:none; stroke:${color}; stroke-width:14; stroke-linecap:round; transform:rotate(-90deg); transform-origin:80px 80px; stroke-dasharray:${dash} ${gap}; }
    .center { text-anchor:middle; dominant-baseline:middle; font-weight:800; fill:#f8fafc; font-size:18px; }
    .muted { text-anchor:middle; fill:#94a3b8; font-size:9px; }
    .meta { display:grid; gap:10px; }
    .panel { background:#111827; border:1px solid #1f2937; border-radius:10px; padding:10px 12px; }
    .label { color:#94a3b8; font-size:12px; margin-bottom:4px; }
    ul { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
    li { display:flex; justify-content:space-between; gap:8px; }
    li strong { color:#f8fafc; }
    .ts { color:#cbd5e1; word-break:break-word; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Daily Feed Usage</h1>
    <div class="sub">${esc(data.feedType)} • limit ${limit}/day</div>
    <div class="g">
      <svg viewBox="0 0 160 160" role="img" aria-label="Feed usage gauge ${esc(centerText)}">
        <circle class="c1" cx="80" cy="80" r="72" />
        <circle class="c2" cx="80" cy="80" r="72" />
        <text class="center" x="80" y="78">${esc(centerText)}</text>
        <text class="muted" x="80" y="99">used today</text>
      </svg>
    </div>
    <div class="meta">
      <div class="panel">
        <div class="label">Feed type breakdown (today)</div>
        <ul>${rows}</ul>
      </div>
      <div class="panel">
        <div class="label">Last feed submission</div>
        <div class="ts">${latestTs ? esc(latestTs) : "No submissions recorded today"}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
