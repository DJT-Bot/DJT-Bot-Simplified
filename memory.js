const fs = require('fs');
const path = './data/history.json';

function ensureFileExists() {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, JSON.stringify({}, null, 2));
    } else {
        const fileContent = fs.readFileSync(path, 'utf8').trim();
        if (!fileContent) {
            fs.writeFileSync(path, JSON.stringify({}, null, 2));
        }
    }
}

function getGuildHistory(guildId) {
    ensureFileExists();
    try {
        const data = fs.readFileSync(path, 'utf8');
        const historyMap = JSON.parse(data);
        return historyMap[guildId] || [];
    } catch (error) {
        console.error("Error reading history file:", error);
        return [];
    }
}

function saveGuildHistory(guildId, historyArray) {
    ensureFileExists();
    try {
        const data = fs.readFileSync(path, 'utf8');
        const historyMap = JSON.parse(data);

        if (historyArray.length > 50) {
            historyArray = historyArray.slice(-50);
        }

        historyMap[guildId] = historyArray;
        fs.writeFileSync(path, JSON.stringify(historyMap, null, 2));
    } catch (error) {
        console.error("Error writing to history file:", error);
    }
}

module.exports = { getGuildHistory, saveGuildHistory };
