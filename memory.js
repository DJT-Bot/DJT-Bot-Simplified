const fs = require('fs/promises');
const path = './data/history.json';

let writeQueue = Promise.resolve(); // serializes writes so concurrent saves don't clobber each other

async function ensureFileExists() {
    try {
        await fs.access(path);
        const fileContent = (await fs.readFile(path, 'utf8')).trim();
        if (!fileContent) {
            await fs.writeFile(path, JSON.stringify({ history: {}, anger: {} }, null, 2));
        }
    } catch {
        await fs.writeFile(path, JSON.stringify({ history: {}, anger: {} }, null, 2));
    }
}

async function readStore() {
    await ensureFileExists();
    try {
        const data = await fs.readFile(path, 'utf8');
        const parsed = JSON.parse(data);

        if (!parsed.history && !parsed.anger) {
            return { history: parsed, anger: {} }; // migrate old flat format
        }

        parsed.history = parsed.history || {};
        parsed.anger = parsed.anger || {};
        return parsed;
    } catch (error) {
        console.error("Error reading history file:", error);
        return { history: {}, anger: {} };
    }
}

function writeStore(store) {
    // queue writes so two concurrent saves can't interleave and corrupt the file
    writeQueue = writeQueue.then(() =>
        fs.writeFile(path, JSON.stringify(store, null, 2)).catch(error => {
            console.error("Error writing to history file:", error);
        })
    );
    return writeQueue;
}

async function getGuildHistory(guildId) {
    const store = await readStore();
    return store.history[guildId] || [];
}

async function saveGuildHistory(guildId, historyArray) {
    const store = await readStore();

    if (historyArray.length > 250) {
        historyArray = historyArray.slice(-250);
    }

    store.history[guildId] = historyArray;
    await writeStore(store);
}

async function getAngerLevel(guildId) {
    const store = await readStore();
    return store.anger[guildId] || { level: 0, lastAsk: 0 };
}

async function saveAngerLevel(guildId, angerState) {
    const store = await readStore();
    store.anger[guildId] = angerState;
    await writeStore(store);
}

module.exports = { getGuildHistory, saveGuildHistory, getAngerLevel, saveAngerLevel };
