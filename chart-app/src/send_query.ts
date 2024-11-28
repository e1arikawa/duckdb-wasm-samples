import {AsyncDuckDBConnection} from "@akabana/duckdb-wasm";
import {AsyncRecordBatchStreamReader} from "apache-arrow";

export async function send_query(conn: AsyncDuckDBConnection, sql: string) {
    const batchs: AsyncRecordBatchStreamReader<any> = await conn.send(sql);
    const dataSet = [];
    try {
        for await (const batch of batchs) {
            const batchData = [];
            const keys = batch.schema.fields.map(field => field.name);
            for (let i = 0; i < batch.numRows; i++) {
                const row = batch.get(i);
                if (row) {
                    const rowData = [];
                    for (let j = 0; j < batch.numCols; j++) {
                        let cell = row[keys[j]];
                        rowData.push(cell);
                    }
                    batchData.push(rowData);
                }
            }
            dataSet.push(batchData);
        }
    } catch (e) {
        console.error(e);
    }
    return dataSet;
}
