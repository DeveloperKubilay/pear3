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

// Download Chrome
async function downloadChrome() {
    const chromeUrl = await getChromeUrlForPlatform();
    downloadDir = path.join(__dirname, 'chrome');
    zipFilePath = path.join(downloadDir, path.basename(chromeUrl));

    // Create directory
    function createDirectory() {
        if (!fs.existsSync(downloadDir)) {
            console.log(`Creating directory: ${downloadDir}`);
            fs.mkdirSync(downloadDir, { recursive: true });
        }
    }

    createDirectory();

    return new Promise((resolve, reject) => {
        console.log(`Installing Chromium for ${os.platform()} from: ${chromeUrl}`);

        const file = fs.createWriteStream(zipFilePath);
        https.get(chromeUrl, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Download failed. Status Code: ${response.statusCode}`));
            }

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const percent = (downloadedSize / totalSize * 100).toFixed(2);
                process.stdout.write(`Installing: ${percent}%\r`);
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    console.log(`\nDownload completed: ${zipFilePath}`);
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

// Extract ZIP file (cross-platform)
function extractZip() {
    return new Promise((resolve, reject) => {
        console.log(`Extracting ZIP file: ${zipFilePath}`);

        const platform = os.platform();
        let command, args;

        if (platform === 'win32') {
            // Use PowerShell for Windows
            command = 'powershell.exe';
            args = ['-command', `Expand-Archive -Path "${zipFilePath}" -DestinationPath "${downloadDir}" -Force`];
        } else if (platform === 'darwin') {
            // Use unzip command for macOS
            command = 'unzip';
            args = ['-o', zipFilePath, '-d', downloadDir];
        } else if (platform === 'linux') {
            // Use unzip command for Linux
            command = 'unzip';
            args = ['-o', zipFilePath, '-d', downloadDir];
        } else {
            return reject(new Error(`Unsupported platform: ${platform}`));
        }

        const process = spawn(command, args);

        process.stdout.on('data', (data) => console.log(data.toString()));
        process.stderr.on('data', (data) => console.error(data.toString()));

        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Extraction failed with code: ${code}`));
            } else {
                console.log('Extraction completed');
                resolve();
            }
        });
    });
}

// Clean up
function cleanUp() {
    return new Promise((resolve) => {
        console.log(`Deleting ZIP file: ${zipFilePath}`);
        fs.unlink(zipFilePath, (err) => {
            if (err) console.warn(`Warning: Could not delete ZIP file: ${err.message}`);
            resolve();
        });
    });
}

// Main installation function
async function installChrome() {
    try {
        await downloadChrome();
        await extractZip();

        // macOS veya Linux ise, chrome dosyasını çalıştırılabilir yap
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
                console.log(`Set executable permission: ${chromeBinPath}`);
            } catch (err) {
                console.warn(`Could not set executable permission: ${err.message}`);
            }
        }
        
        await cleanUp();

        console.log('Chrome installation completed successfully!');
    } catch (error) {
        console.error(`Installation failed: ${error.message}`);
        process.exit(1);
    }
}

module.exports = installChrome