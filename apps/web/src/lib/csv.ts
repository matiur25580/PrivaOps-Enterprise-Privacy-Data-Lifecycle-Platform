export function csvDownload(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const csv = [
    columns.map(quote).join(','),
    ...rows.map((row) => columns.map((key) => quote(row[key])).join(',')),
  ].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
