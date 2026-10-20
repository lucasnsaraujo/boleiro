export function parseCsv(text) {
    const rows = [];
    let field = "";
    let row = [];
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            }
            else if (char === '"')
                quoted = false;
            else
                field += char;
        }
        else if (char === '"')
            quoted = true;
        else if (char === ",") {
            row.push(field);
            field = "";
        }
        else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[i + 1] === "\n")
                i++;
            row.push(field);
            if (row.some((value) => value !== ""))
                rows.push(row);
            row = [];
            field = "";
        }
        else
            field += char;
    }
    if (field || row.length)
        rows.push([...row, field]);
    const [header = [], ...body] = rows;
    const keys = header.map((key) => key.replace(/^\uFEFF/, ""));
    return body.map((values) => Object.fromEntries(keys.map((key, i) => [key, values[i] ?? ""])));
}
