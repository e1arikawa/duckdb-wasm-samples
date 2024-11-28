import './style.css'
import {connect_db} from "./connect_db.ts";
// import {DuckDBDataProtocol} from "@duckdb/duckdb-wasm";

export async function create_db(url: string, file_name: string) {
    if (url == null || url.length == 0) {
        console.warn("invalid url");
        return -1;
    }
    let count_value = 0;
    const db = await connect_db(file_name);
    const conn = await db.connect();
    await conn.send(`CREATE TABLE ${file_name} AS SELECT * FROM parquet_scan('${url}');`);
    const results = await conn.send(`SELECT count(*)::INTEGER as cnt FROM ${file_name};`);
    for await (const result of results) {
        count_value = result.getChildAt(0)?.get(0);
    }
    await conn.send(`CHECKPOINT;`);
    await conn.close();
    await db.terminate();
    return count_value;
}


