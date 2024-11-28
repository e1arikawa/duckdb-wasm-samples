import {
    AsyncDuckDB,
    ConsoleLogger,
    DuckDBAccessMode,
    DuckDBBundles,
    LogLevel,
    selectBundle
} from '@akabana/duckdb-wasm';

import duckdb_wasm from '@akabana/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@akabana/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@akabana/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@akabana/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const DUCKDB_BUNDLES: DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
    },
};

export async function connect_db(file_name: string) {
    const bundle = await selectBundle(DUCKDB_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new ConsoleLogger(LogLevel.ERROR);
    const db = new AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.open({
        path: `opfs://${file_name}.db`,
        accessMode: DuckDBAccessMode.READ_WRITE
    });
    return db;
}


