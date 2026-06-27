const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function sendText(response, status, body) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}

function normalizeArxivId(value) {
  return decodeURIComponent(value || "")
    .trim()
    .replace(/^arxiv:/i, "")
    .replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, "")
    .replace(/\.pdf$/i, "");
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(source, tagName) {
  const match = source.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? xmlDecode(match[1]) : "";
}

function parseArxivEntry(xml, requestedId) {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/i);
  if (!entryMatch) return null;

  const entry = entryMatch[1];
  const idUrl = extractTag(entry, "id");
  const arxivId = normalizeArxivId(idUrl.split("/").pop() || requestedId);
  const title = extractTag(entry, "title");
  const summary = extractTag(entry, "summary");
  const published = extractTag(entry, "published");
  const updated = extractTag(entry, "updated");
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi)].map((match) =>
    xmlDecode(match[1])
  );
  const categories = [...entry.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((match) => xmlDecode(match[1]));
  const pdfMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/i);

  return {
    id: arxivId,
    title,
    summary,
    authors,
    categories: [...new Set(categories)],
    published,
    updated,
    year: published ? published.slice(0, 4) : "",
    sourceUrl: `https://arxiv.org/abs/${arxivId}`,
    pdfUrl: pdfMatch ? xmlDecode(pdfMatch[1]) : `https://arxiv.org/pdf/${arxivId}`
  };
}

async function fetchArxivPaper(id) {
  const arxivId = normalizeArxivId(id);
  if (!/^[a-z-]+\/\d{7}|\d{4}\.\d{4,5}(v\d+)?$/i.test(arxivId)) {
    throw new Error("Invalid arXiv id");
  }

  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "PaperCommonsMVP/0.1 (local development)"
    }
  });

  if (!response.ok) {
    throw new Error(`arXiv API responded with ${response.status}`);
  }

  const xml = await response.text();
  const paper = parseArxivEntry(xml, arxivId);
  if (!paper) throw new Error("No arXiv entry found");
  return paper;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function readStore() {
  if (!fs.existsSync(STORE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function serveFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "content-type": MIME_TYPES[extension] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(data);
  });
}

function sendPdf(response, data) {
  response.writeHead(200, {
    "content-type": "application/pdf",
    "cache-control": "no-store",
    "content-length": data.byteLength
  });
  response.end(Buffer.from(data));
}

async function proxyPdf(urlValue) {
  const target = new URL(urlValue);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Only HTTP(S) PDF URLs are supported");
  }

  const response = await fetch(target, {
    headers: {
      "user-agent": "PaperCommonsMVP/0.1 (local development)"
    }
  });

  if (!response.ok) {
    throw new Error(`PDF request responded with ${response.status}`);
  }

  return response.arrayBuffer();
}

function resolveStaticPath(pathname) {
  if (pathname === "/" || pathname.startsWith("/paper/")) return path.join(ROOT, "index.html");

  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const resolved = path.resolve(ROOT, cleanPath);
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/arxiv/")) {
    const id = url.pathname.replace("/api/arxiv/", "");
    try {
      const paper = await fetchArxivPaper(id);
      sendJson(response, 200, { paper });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/store") {
    try {
      sendJson(response, 200, { store: readStore() });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/pdf") {
    try {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        sendJson(response, 400, { error: "Missing PDF URL" });
        return;
      }
      const data = await proxyPdf(targetUrl);
      sendPdf(response, data);
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/store") {
    try {
      const body = await readRequestBody(request);
      const store = JSON.parse(body);
      writeStore(store);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  sendJson(response, 404, { error: "Unknown API route" });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  serveFile(response, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Paper Commons listening on http://${HOST}:${PORT}`);
});
