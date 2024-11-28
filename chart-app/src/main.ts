import "./style.css";
import {connect_db} from "./connect_db.ts";

import {Chart, registerables} from 'chart.js';
import {AsyncDuckDB, AsyncDuckDBConnection, DuckDBDataProtocol} from "@akabana/duckdb-wasm";
import {send_query} from "./send_query.ts";

import MainWorker from "./worker?worker&inline";

const worker = new MainWorker();

const table = "world_populations";
const file_csv = `${table}.csv`;
const file_db = `${table}.db`;
const file_db_wal = `${table}.db.wal`;

let db: AsyncDuckDB | null;
let conn: AsyncDuckDBConnection | null;

document.addEventListener("DOMContentLoaded", async () => {
    console.warn("isSecureContext", window.isSecureContext);
    await init();
});

async function init() {
    Chart.register(...registerables);

    let dataButton = document.getElementById("data-title") as HTMLButtonElement;
    let canConnect = await existFile(file_db);
    if (canConnect) {
        try {
            await initDb();
            await prepreaData();
            await updateList(`country`);
        } catch (e) {
            console.error(e);
        }
        dataButton.textContent = "Disconnect";
    } else {
        console.warn("wait connect");
        dataButton.textContent = "Connect";
    }

    document.getElementById('search_word')!.addEventListener('input', () => {
        updateList(currentdisplayType); // 国リストを表示
    });

    // 切り替えボタンのイベント設定
    document.getElementById('toggle-country')!.addEventListener('click', () => {
        (document.getElementById("search_word") as HTMLInputElement)!.value = "";
        updateList('country'); // 国リストを表示
    });

    document.getElementById('toggle-year')!.addEventListener('click', () => {
        (document.getElementById("search_word") as HTMLInputElement)!.value = "";
        updateList('year'); // 年リストを表示
    });

    document.getElementById('data-title')!.addEventListener('click', async () => {
        if (dataButton.textContent!.startsWith("Disconnect")) {
            try {
                if (conn) {
                    await conn.close();
                }
                if (db) {
                    await db.terminate();
                }
            } catch (e) {
                console.error("Disconnect", e);
            }
            conn = null;
            db = null;
            await updateList(`country`);
            destroyChartInstance();
            await clearFiles();
            document.getElementById('data-title')!.textContent = "Connect";
        } else {
            try {
                const currentPath = window.location.pathname;
                const directoryPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
                const csvUrl = `${window.location.origin}${directoryPath}/${file_csv}`;
                const response = await fetch(csvUrl);
                if (!response.ok) {
                    throw new Error('File download failed');
                }
                const blob = await response.blob();
                await saveToOpfs(new File([blob], file_csv));
                await createDb();
                await prepreaData();
                await updateList(`country`);
                document.getElementById('data-title')!.textContent = "Disconnect";
            } catch (e) {
                console.error("Connect", e);
            }
        }
    });
}

async function initDb() {
    try {
        const opfsRoot = await navigator.storage.getDirectory();
        const dbHandle = await opfsRoot.getFileHandle(file_db, {create: false});
        const dbFile = await dbHandle.getFile();
        if (dbFile.size < 15 * 1000) {
            throw new Error("db file size error");
        }
        db = await connect_db(table);
        conn = await db.connect();
    } catch (e) {
        console.error("initDb", e);
        await clearFiles();
    }
}

async function createDb() {
    try {
        db = await connect_db(table);
        await db.registerFileHandle(file_csv, null, DuckDBDataProtocol.BROWSER_FSACCESS, false);
        conn = await db.connect();
        await conn.send(`CREATE TABLE ${table} AS SELECT * FROM '${file_csv}';`);
        await conn.send(`CHECKPOINT;`);
        await conn.close();
        await db.dropFile(file_csv);
        conn = await db.connect();
    } catch (e) {
        console.error("createDb", e);
        await clearFiles();
    } finally {
        try {
            const opfsRoot = await navigator.storage.getDirectory();
            await opfsRoot.removeEntry(file_csv);
        } catch (e) {
            console.error(e);
        }
    }
}

async function prepreaData() {
    yearList = [];
    for (let i = 1960; i <= 2023; i++) {
        yearList.push(i.toString());
    }
}

let currentdisplayType: `country` | 'year' = `country`;

async function updateList(displayType: `country` | 'year') {
    currentdisplayType = displayType;
    const listData = document.getElementById('list-data') as HTMLUListElement;
    const listTitle = document.getElementById('right-pane-title') as HTMLUListElement;
    listData.innerHTML = '';

    if (displayType === `country`) {
        listTitle.textContent = "Select a Country:";
        const countries = await getCountries();
        countries.forEach(country => {
            const li = document.createElement('li');
            li.textContent = country;
            li.addEventListener('click', () => createChartForCountry(country)); // 国クリックでグラフ更新
            listData.appendChild(li);
        });
        document.getElementById('toggle-country')!.classList.add("selected");
        document.getElementById('toggle-year')!.classList.remove("selected");
    } else {
        listTitle.textContent = "Select a Year:";
        const years = await getYears();
        [...years].reverse().forEach(year => {
            const li = document.createElement('li');
            li.textContent = year;
            li.addEventListener('click', () => createChartForYear(year)); // 年クリックでグラフ更新
            listData.appendChild(li);
        });
        document.getElementById('toggle-country')!.classList.remove("selected");
        document.getElementById('toggle-year')!.classList.add("selected");
    }
}

async function getCountries(): Promise<any[]> {
    if (!conn || !db) {
        console.error("db disconnected");
        return Promise.resolve([]);
    }
    const searchWordInput = document.getElementById("search_word") as HTMLInputElement;
    const searchWord = (searchWordInput.value as string).toUpperCase();
    const data = await send_query(conn, `SELECT \"Country Name\" FROM world_populations WHERE upper(\"Country Name\") LIKE '${searchWord}%';`);
    return data[0];
}

let yearList: string[] = [];

async function getYears(): Promise<any[]> {
    if (!conn || !db) {
        console.error("db disconnected");
        return Promise.resolve([]);
    }
    const searchWordInput = document.getElementById("search_word") as HTMLInputElement;
    const searchWord = (searchWordInput.value as string).toUpperCase();
    if (searchWord && searchWord.length > 0) {
        return Promise.resolve(yearList.filter((value) => {
            return value.startsWith(searchWord);
        }));
    } else {
        return Promise.resolve(yearList);
    }
}

async function getPopulationByCountry(countryName: string): Promise<any[]> {
    if (!conn || !db) {
        console.error("db disconnected");
        return Promise.resolve([]);
    }
    const years = yearList;
    let columnsArra: string[] = [];
    for (let i = 0; i < years.length; i++) {
        columnsArra.push(`\"${years[i]}\"::BIGINT AS \"${years[i]}\"`);
    }
    const columns = columnsArra.join(",");
    const result = await send_query(conn, `SELECT ${columns} FROM world_populations WHERE \"Country Name\" = '${countryName}';`);
    const dataSet: any = {};
    for (let i = 0; i < years.length; i++) {
        let year = years[i].toString();
        dataSet[year.toString()] = +((result[0][0][i]).toString().replace("n", ""));
    }
    return Promise.resolve(dataSet);
}

async function getPopulationByYear(year: string): Promise<any[]> {
    if (!conn || !db) {
        console.error("db disconnected");
        return Promise.resolve([]);
    }
    const result = await send_query(conn, `SELECT \"Country Name\",\"${year}\"::BIGINT FROM world_populations ORDER BY \"${year}\"::BIGINT DESC LIMIT 30;`);
    result[0].splice(0, 1);
    return Promise.resolve(result[0]);
}

async function createChartForCountry(countryName: string) {
    if (!conn || !db) {
        console.error("db disconnected");
        return Promise.resolve([]);
    }
    document.getElementById("chart-title")!.textContent = "Population Chart of " + countryName;
    let years = await getYears();
    const populations = await getPopulationByCountry(countryName);

    destroyChartInstance();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
            datasets: [{
                label: `Population of ${countryName}`,
                data: populations,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {beginAtZero: true}
            }
        }
    });
}

async function createChartForYear(year: string) {
    if (!conn || !db) {
        console.error("db disconnected");
        return Promise.resolve([]);
    }
    document.getElementById("chart-title")!.textContent = "Population Chart of " + year;
    const populations = await getPopulationByYear(year);
    const countries = populations.map((item => {
        return item[0];
    }));
    const dataSet: any = {};
    for (let i = 0; i < populations.length; i++) {
        let item = populations[i];
        dataSet[item[0]] = +((item[1]).toString().replace("n", ""));
    }

    destroyChartInstance();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: countries,
            datasets: [{
                label: `Population in ${year}`,
                data: dataSet,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {beginAtZero: true}
            }
        }
    });
}

const ctx = (document.getElementById('populationChart') as HTMLCanvasElement).getContext('2d')!;
let chartInstance: Chart | null = null;


function destroyChartInstance() {
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
}

async function existFile(fileName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        worker.onmessage = function (event: MessageEvent) {
            if (event.data.status === 'existFileFound') {
                resolve(true);
            } else if (event.data.status === 'existFileNotFound') {
                resolve(false);
            } else {
                reject(new Error(event.data.message));
            }
        };
        worker.postMessage({
            action: "existFile",
            fileName: fileName
        });
    });
}

async function saveToOpfs(file: File) {
    return new Promise((resolve, reject) => {
        worker.onmessage = function (event: MessageEvent) {
            if (event.data.progress) {
                const {current, total} = event.data.progress;
                console.log(`Progress: ${(current / total) * 100}%`);
            } else if (event.data.status === 'completed') {
                resolve("File saved successfully!");
            } else if (event.data.status === 'error') {
                reject(new Error(event.data.message));
            } else {
                console.warn("Unhanded", event);
            }
        };
        worker.postMessage({
            action: "save",
            file: file
        });
    });
}

async function clearFiles() {
    try {
        const opfsRoot = await navigator.storage.getDirectory();
        await opfsRoot.removeEntry(file_db_wal);
        await opfsRoot.removeEntry(file_db);
        await opfsRoot.removeEntry(file_csv);
    } catch (e) {
        console.error("clearFiles", e);
    }
}