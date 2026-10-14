// Vercel Serverless Function
// Searches the "Historical Archive" Notion database for resolutions
// matching a plain-text query (checks both the Meeting title and the
// Resolution text).

const ARCHIVE_DB_ID = "3ded4b6a-ebb1-80fb-8483-fa6ecd2caca5";

function normalize(str) {
  return String(str || "").replace(/\s+/g, " ").trim().toLowerCase();
}

async function getSchema(token) {
  const res = await fetch(`https://api.notion.com/v1/databases/${ARCHIVE_DB_ID}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Could not read Historical Archive schema");
  const map = {};
  for (const [actualName, prop] of Object.entries(data.properties || {})) {
    map[normalize(actualName)] = { actualName, type: prop.type };
  }
  return map;
}

function readText(prop) {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title || []).map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text || []).map((t) => t.plain_text).join("");
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "NOTION_TOKEN is not configured on the server" });
  }

  const q = (req.query.q || "").trim();

  try {
    const schema = await getSchema(token);
    const titleKey = Object.values(schema).find((p) => p.type === "title")?.actualName;
    const dateKey = schema["date"]?.actualName;
    const resolutionKey = schema["resolution"]?.actualName;

    const body = { page_size: 50 };
    if (q && titleKey && resolutionKey) {
      body.filter = {
        or: [
          { property: titleKey, title: { contains: q } },
          { property: resolutionKey, rich_text: { contains: q } },
        ],
      };
    }

    // Load up to 300 entries (Notion returns at most 100 per request) so the
    // search box can suggest matches from the whole archive, not just 50.
    body.page_size = 100;
    const all = [];
    let cursor;
    do {
      const notionRes = await fetch(
        `https://api.notion.com/v1/databases/${ARCHIVE_DB_ID}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...body, ...(cursor ? { start_cursor: cursor } : {}) }),
        }
      );
      const data = await notionRes.json();
      if (!notionRes.ok) {
        return res.status(notionRes.status).json({ error: data });
      }
      all.push(...(data.results || []));
      cursor = data.has_more && all.length < 300 ? data.next_cursor : null;
    } while (cursor);

    const items = all.map((page) => ({
      id: page.id,
      meeting: titleKey ? readText(page.properties[titleKey]) : "",
      date: dateKey ? readText(page.properties[dateKey]) : "",
      resolution: resolutionKey ? readText(page.properties[resolutionKey]) : "",
    }));

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
