const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const os = require('os');

function getLatestVersion() {
    return new Promise((resolve, reject) => {
        https.get('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(
                JSON.parse(data.trim()).channels.Stable.version
            ));
        }).on('error', reject);
    });
}

// Detect platform and set appropriate Chrome URL
async function getChromeUrlForPlatform() {
    const platform = os.platform();
    const baseUrl = 'https://storage.googleapis.com/chrome-for-testing-public/' + await getLatestVersion();

    switch (platform) {
        case 'win32':
            return `${baseUrl}/win64/chrome-win64.zip`;
        case 'darwin':
            return `${baseUrl}/mac-x64/chrome-mac-x64.zip`;
        case 'linux':
            return `${baseUrl}/linux64/chrome-linux64.zip`;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

// Global variables for download directory and zip file path
let downloadDir = path.join(__dirname, 'chrome');
let zipFilePath = '';

function shouldLog(options) {
    return options.installlog !== false;
}

async function downloadChrome(options = {}) {
    const log = shouldLog(options);
    const chromeUrl = await getChromeUrlForPlatform();
    downloadDir = path.join(__dirname, 'chrome');
    zipFilePath = path.join(downloadDir, path.basename(chromeUrl));

    function createDirectory() {
        if (!fs.existsSync(downloadDir)) {
            if (log) console.log(`Creating directory: ${downloadDir}`);
            fs.mkdirSync(downloadDir, { recursive: true });
        }
    }

    createDirectory();

    return new Promise((resolve, reject) => {
        if (log) console.log(`Installing Chromium for ${os.platform()} from: ${chromeUrl}`);

        const file = fs.createWriteStream(zipFilePath);
        https.get(chromeUrl, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Download failed. Status Code: ${response.statusCode}`));
            }

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (log && totalSize) {
                    const percent = (downloadedSize / totalSize * 100).toFixed(2);
                    process.stdout.write(`Installing: ${percent}%\r`);
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    if (log) console.log(`\nDownload completed: ${zipFilePath}`);
                    resolve();
                });
            });
        }).on('error', (err) => {
            fs.unlink(zipFilePath, () => { });
            reject(err);
        });

        file.on('error', (err) => {
            fs.unlink(zipFilePath, () => { });
            reject(err);
        });
    });
}

function extractZip(options = {}) {
    const log = shouldLog(options);
    return new Promise((resolve, reject) => {
        if (log) console.log(`Extracting ZIP file: ${zipFilePath}`);

        const platform = os.platform();
        let command, args;

        if (platform === 'win32') {
            command = 'powershell.exe';
            args = ['-command', `Expand-Archive -Path "${zipFilePath}" -DestinationPath "${downloadDir}" -Force`];
        } else if (platform === 'darwin') {
            command = 'unzip';
            args = ['-o', zipFilePath, '-d', downloadDir];
        } else if (platform === 'linux') {
            command = 'unzip';
            args = ['-o', zipFilePath, '-d', downloadDir];
        } else {
            return reject(new Error(`Unsupported platform: ${platform}`));
        }

        const process = spawn(command, args);

        process.stdout.on('data', (data) => {
            if (log) console.log(data.toString());
        });
        process.stderr.on('data', (data) => {
            if (log) console.error(data.toString());
        });

        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Extraction failed with code: ${code}`));
            } else {
                if (log) console.log('Extraction completed');
                resolve();
            }
        });
    });
}

function cleanUp(options = {}) {
    const log = shouldLog(options);
    return new Promise((resolve) => {
        if (log) console.log(`Deleting ZIP file: ${zipFilePath}`);
        fs.unlink(zipFilePath, (err) => {
            if (err) console.warn(`Warning: Could not delete ZIP file: ${err.message}`);
            resolve();
        });
    });
}

async function installChrome(options = {}) {
    const log = shouldLog(options);
    try {
        await downloadChrome(options);
        await extractZip(options);

        const platform = os.platform();
        let chromeBinPath = null;
        if (platform === 'darwin') {
            chromeBinPath = path.join(downloadDir, 'chrome-mac-x64', 'chrome-mac-x64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
        } else if (platform === 'linux') {
            chromeBinPath = path.join(downloadDir, 'chrome-linux64', 'chrome-linux64', 'chrome');
        }
        if (chromeBinPath && fs.existsSync(chromeBinPath)) {
            try {
                fs.chmodSync(chromeBinPath, 0o755);
                if (log) console.log(`Set executable permission: ${chromeBinPath}`);
            } catch (err) {
                console.warn(`Could not set executable permission: ${err.message}`);
            }
        }

        await cleanUp(options);

        if (log) console.log('Chrome installation completed successfully!');
    } catch (error) {
        console.error(`Installation failed: ${error.message}`);
        process.exit(1);
    }
}

module.exports = installChrome