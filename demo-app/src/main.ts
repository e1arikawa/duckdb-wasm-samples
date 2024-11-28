import './style.css'
import {create_db} from "./create_db.ts";
import {send_db} from "./send_db.ts";

var save_button: HTMLButtonElement | null;
var download_button: HTMLButtonElement | null;
var sql_button: HTMLButtonElement | null;
var s3url_textarea: HTMLTextAreaElement | null;
var db_file_name_input: HTMLInputElement | null;
var sql_input: HTMLInputElement | null;
var count_label: HTMLLabelElement | null;
var output_div: HTMLDivElement | null;
var local_upload_button: HTMLButtonElement | null;
var dropzone: HTMLDivElement | null;

async function init() {
    local_upload_button = document.getElementById("local_upload_button") as HTMLButtonElement;
    save_button = document.getElementById("save_button") as HTMLButtonElement;
    download_button = document.getElementById("download_button") as HTMLButtonElement;
    download_button!.disabled = true;
    sql_button = document.getElementById("sql_button") as HTMLButtonElement;
    //
    s3url_textarea = document.getElementById("s3url_textarea") as HTMLTextAreaElement;
    db_file_name_input = document.getElementById("db_file_name_input") as HTMLInputElement;
    sql_input = document.getElementById("sql_input") as HTMLInputElement;
    output_div = document.getElementById("output") as HTMLInputElement;
    //
    count_label = document.getElementById("count_label") as HTMLLabelElement;
    //
    sql_button?.addEventListener("click", async () => {
        try {
            const html = await send_db(sql_input!.value.split(";") ?? [], db_file_name_input!.value);
            output_div!.innerHTML = html;
        } catch (e) {
            console.error(e);
        }
    });
    save_button?.addEventListener("click", async () => {
        save_button!.disabled = true;
        save_button!.textContent = "Create DB File ...";
        let count = await create_db(s3url_textarea!.value, db_file_name_input!.value);
        count_label!.textContent = count + "件";
        download_button!.disabled = false;
        save_button!.disabled = false;
        save_button!.textContent = "Create DB File";
    });
    //
    download_button?.addEventListener("click", async () => {
        if (db_file_name_input instanceof HTMLInputElement) {
            try {
                const rootDir = await navigator.storage.getDirectory();
                const fileHandle = await rootDir.getFileHandle(`${db_file_name_input.value}.db`);
                const file = await fileHandle.getFile();
                const stream = file.stream(); // Fileオブジェクトから直接ストリームを取得

                const response = new Response(stream);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${db_file_name_input.value}.db`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('ファイルのダウンロード中にエラーが発生しました:', error);
            }
        }
    });
    //
    local_upload_button.addEventListener('click', async () => {
        const fileInput = document.getElementById('db_file_input') as HTMLInputElement;

        if (!fileInput.files || fileInput.files.length === 0) {
            return;
        }

        for (const file of fileInput.files) {
            await saveToOpfs(file, (current, total) => {
                console.log(file.name, current, total);
            });
        }
    });

    dropzone = document.getElementById('dropzone') as HTMLDivElement;
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (dropzone!.classList.contains("dragover")) {
                return;
            }
            dropzone!.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone!.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropzone!.classList.remove('dragover');
            if (e.dataTransfer == null) {
                return;
            }
            for (const file of e.dataTransfer.files) {
                await saveToOpfs(file, (current, total) => {
                    console.log(file.name, current, total);
                });
            }
        });
    }
}

init();

async function saveToOpfs(file: File, progress?: (current: number, total: number) => void) {
    try {
        const chunkSize = 1024 * 1024;
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(file.name, {create: true});
        const writable = await fileHandle.createWritable();
        const totalChunks = Math.ceil(file.size / chunkSize);
        let offset = 0;
        for (let i = 0; i < totalChunks; i++) {
            const chunk = file.slice(offset, offset + chunkSize);
            const arrayBuffer = await chunk.arrayBuffer();
            await writable.write({type: "write", position: offset, data: arrayBuffer});
            offset += chunkSize;

            if (progress) {
                progress(offset, file.size);
            }
        }

        await writable.close();
    } catch (error) {
        console.error('ファイルの書き込み中にエラーが発生しました: ', error);
    }
}