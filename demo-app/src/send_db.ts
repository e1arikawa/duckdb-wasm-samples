import './style.css'
import {connect_db} from "./connect_db.ts";
import {AsyncDuckDB, AsyncDuckDBConnection, DuckDBDataProtocol} from "@akabana/duckdb-wasm";

export async function send_db(sqls: string[], file_name: string): Promise<string> {
    if (sqls == null || sqls.length == 0) {
        console.warn("invalid url");
        return "";
    }
    let html = "";
    let db = null;
    let conn = null;
    try {
        db = await connect_db(file_name);
        conn = await db.connect();
        for (const sql of sqls) {
            if (sql == null || sql.length == 0) {
                continue;
            }
            const send_sql = sql.replace(/;/g, "") + ";";
            html = await sendSql(db, conn, send_sql);
        }
    } catch (e: any) {
        console.error(e);
        html = e.message;
    } finally {
        try {
            if (conn) {
                await conn.close();
            }
        } catch (e: any) {
            console.error(e);
        }
        try {
            if (db) {
                await db.terminate();
            }
        } catch (e: any) {
            console.error(e);
        }
    }
    return Promise.resolve(html);
}

export async function sendSql(db: AsyncDuckDB, conn: AsyncDuckDBConnection, sql: string) {
    let need_create_file = true;
    let registerFileName = extractFileNameFromSQL(sql, "FROM");
    if (registerFileName == null) {
        registerFileName = extractFileNameFromSQL(sql, "TO");
        if (registerFileName) {
            need_create_file = true;
        }
    }
    if (registerFileName) {
        const opfsRoot = await navigator.storage.getDirectory();
        const testHandle = await opfsRoot.getFileHandle(registerFileName!, {create: need_create_file});
        await db.registerFileHandle(registerFileName!, testHandle, DuckDBDataProtocol.BROWSER_FSACCESS, need_create_file);
    }
    const results = await conn.send(sql);
    if (registerFileName) {
        await db.dropFile(registerFileName);
    }
    for await (const result of results) {
        return resultToHTMLTable(result);
    }
    return "";
}

export function resultToHTMLTable(result: any): string {
    let tableHTML = '<table border="1" cellpadding="5" cellspacing="0" >';

    tableHTML += '<tr>';
    for (const field of result.schema.fields as any[]) {
        tableHTML += `<th>${field.name}</th>`;
    }
    tableHTML += '</tr>';

    for (const row of result) {
        tableHTML += '<tr>';
        for (const cell of Object.values(row)) {
            tableHTML += `<td>${cell}</td>`;
        }
        tableHTML += '</tr>';
    }

    tableHTML += '</table>';
    return tableHTML;
}

export function extractFileNameFromSQL(sql: string, keyword: 'FROM' | 'TO'): string | null {
    const regex = new RegExp(`${keyword}\\s+(?:\\w+\\s*\\(\\s*)?'([^']+)'`, 'i');
    const match = sql.match(regex);
    return match ? match[1] : null;
}
