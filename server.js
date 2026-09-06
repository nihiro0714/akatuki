// スマホなど同じWi-Fi内の端末から開くための簡易サーバー。
// 起動: node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "docs");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const requested = decodeURIComponent(url.pathname);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const filePath = path.join(ROOT, relative);

  // public の外を読み出せないようにする。
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("403 Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("404 Not Found");
      return;
    }

    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(content);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const addresses = [];
  const interfaces = os.networkInterfaces();

  Object.keys(interfaces).forEach((name) => {
    interfaces[name].forEach((info) => {
      if (info.family === "IPv4" && !info.internal) {
        addresses.push(`http://${info.address}:${PORT}`);
      }
    });
  });

  console.log(`YUマーケットを起動しました`);
  console.log(`  このPC : http://localhost:${PORT}`);
  addresses.forEach((address) => console.log(`  スマホ : ${address}`));
  console.log(`停止する場合は Ctrl+C を押してください。`);
});
