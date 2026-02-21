export function toCsv(rows, headers) {
  // headers: [{ key, label }]
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [];
  lines.push(headers.map(h => esc(h.label)).join(","));
  for (const r of rows) {
    lines.push(headers.map(h => esc(r[h.key])).join(","));
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
