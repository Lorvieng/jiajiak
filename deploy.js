// deploy.js - Hugging Face 专用兼容版
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http'); 
const { spawn } = require('child_process');

// --- [核心修改 1] 必须启动一个网页，防止 503 错误 ---
function startWebInterface() {
    const port = 7860; // 必须是 7860
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <h1>✅ EasyTier 运行中</h1>
            <p>连接状态: 已接通隧道</p>
            <p>SOCKS5 端口: 1234 (内部)</p>
            <hr>
            <p>只要看到这个页面，Hugging Face 状态就会显示为绿色 Running。</p>
        `);
    }).listen(port, '0.0.0.0', () => {
        console.log(`🚀 健康检查网页已在端口 ${port} 启动`);
    });
}

// --- [核心修改 2] 纯净身份显示 (不修改系统 hostname，避免报错) ---
function setIdentity(newName) {
    console.log(`--- 🆔 身份设定: ${newName} ---`);
    process.title = newName;
}

// 执行初始化
setIdentity("USA-Galaxy");
startWebInterface();

// 依赖库检查
let AdmZip;
try {
    AdmZip = require('adm-zip');
} catch (e) {
    console.error('❌ 缺少 adm-zip。请确保 package.json 包含 "adm-zip": "^0.5.10"');
    process.exit(1);
}

const TEMP_DIR = path.join(__dirname, 'temp_src');

// 工具函数：下载与解压
async function downloadFile(url, destPath) {
    console.log(`⬇️ 正在下载: ${url}`);
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) return reject(new Error(`下载失败: ${response.statusCode}`));
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    console.log(`✅ 下载完成`);
                    resolve();
                });
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

function extractZip(zipPath, targetDir) {
    console.log(`📦 正在解压...`);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);
    console.log(`✅ 解压完成`);
}

function findFile(startDir, fileName) {
    const files = fs.readdirSync(startDir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(startDir, file.name);
        if (file.isDirectory()) {
            const found = findFile(fullPath, fileName);
            if (found) return found;
        } else if (file.name === fileName) return fullPath;
    }
    return null;
}

// --- 主流程 ---
async function main() {
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR);

    const etConfig = {
        url: 'https://github.com/EasyTier/EasyTier/releases/download/v2.4.5/easytier-linux-x86_64-v2.4.5.zip',
        zipName: 'easytier.zip',
        binName: 'easytier-core',
        args: [
            '-i', '10.155.155.25',
            '--network-name', process.env.ET_NET_NAME,           
            '--network-secret', process.env.ET_NET_SECRET,           
            '-p', process.env.ET_PEER_URL,   
            '-n', '0.0.0.0/0',               
            '--socks5', process.env.ET_SOCKS_PORT,               
            '--no-tun'                        
        ]
    };

    const zipPath = path.join(TEMP_DIR, etConfig.zipName);
    
    try {
        await downloadFile(etConfig.url, zipPath);
        extractZip(zipPath, TEMP_DIR);
        
        const binaryPath = findFile(TEMP_DIR, etConfig.binName);
        if (!binaryPath) throw new Error(`未找到 easytier-core`);

        fs.chmodSync(binaryPath, '755');
        console.log(`➡️ 正在启动 EasyTier...`);
        
        const child = spawn(binaryPath, etConfig.args, { stdio: 'inherit' });

        child.on('error', (err) => console.error('❌ EasyTier 崩溃:', err));
        child.on('exit', (code) => console.log(`ℹ️ EasyTier 已退出，退出码: ${code}`));
        
    } catch (err) {
        console.error('💥 部署失败:', err.message);
    }
}

main();
