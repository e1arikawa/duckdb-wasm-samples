interface SaveToOpfsProgressCallback {
    (current: number, total: number): void;
}

interface FileMessageData {
    action: 'save' | 'existFile';
    file?: File;
    fileName?: string;
}

self.onmessage = async function (event: MessageEvent<FileMessageData>) {
    try {
        const {action} = event.data;
        if (action === "save") {
            const {file} = event.data;
            if (!file) {
                throw new Error("File is not provided for save action");
            }
            await saveToOpfs(file, (current, total) => {
                self.postMessage({progress: {current, total}});
            });
            self.postMessage({status: "completed"});
        } else if (action === "existFile") {
            const {fileName} = event.data;
            if (!fileName) {
                throw new Error("File name is not provided for existFile action");
            }
            const storage = navigator.storage;
            const opfsRoot = await storage.getDirectory();
            try {
                await opfsRoot.getFileHandle(fileName, {create: false});
                self.postMessage({status: "existFileFound"});
            } catch (e) {
                self.postMessage({status: "existFileNotFound"});
            }
        }
    } catch (error: any) {
        self.postMessage({status: "error", message: error.message});
    }
};

async function saveToOpfs(file: File, progress: SaveToOpfsProgressCallback): Promise<void> {
    try {
        const chunkSize = 1024 * 1024;
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(file.name, {create: true});
        const access = await fileHandle.createSyncAccessHandle();
        const totalChunks = Math.ceil(file.size / chunkSize);
        let offset = 0;

        for (let i = 0; i < totalChunks; i++) {
            const chunk = file.slice(offset, offset + chunkSize);
            const arrayBuffer = await chunk.arrayBuffer();
            access.write(arrayBuffer, {at: offset});
            offset += chunkSize;

            if (progress) {
                progress(offset, file.size);
            }
        }
        access.close();
        self.postMessage({status: 'completed'});
    } catch (error: any) {
        console.error("saveToOpfs", error);
        self.postMessage({status: 'error', message: error.message});
    }
}

export default {}
