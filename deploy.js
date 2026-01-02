// deploy.js - Hugging Face/Railway 专用【调试修复版】
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http'); 
const { spawn } = require('child_process');

// --- 1. 网页服务器 (保持不变) ---
function startWebInterface() {
    const port = 7860;
    
    http.createServer((req, res) => {
        if (req.url === '/bg.png') {
            const imgPath = path.join(__dirname, 'bg.png');
            try {
                if (fs.existsSync(imgPath)) {
                    const img = fs.readFileSync(imgPath);
                    res.writeHead(200, { 'Content-Type': 'image/png' });
                    res.end(img);
                    return;
                }
            } catch (err) {
                console.error("图片读取失败:", err);
            }
        }

        const htmlPath = path.join(__dirname, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        try {
            const htmlContent = fs.readFileSync(htmlPath, 'utf8');
            res.end(htmlContent);
        } catch (err) {
            res.end('<h1>404</h1><p>未找到 index.html，但后台服务运行正常。</p>');
        }
    }).listen(port, '0.0.0.0', () => {
        console.log(`🚀 网页服务器已在端口 ${port} 启动`);
    });
}

// --- 2. 身份显示 ---
function setIdentity(newName) {
    console.log(`--- 🆔 身份设定: ${newName} ---`);
    process.title = newName;
}

setIdentity("Coral-Station");
startWebInterface();

// --- 3. 依赖库检查 ---
let AdmZip;
try {
    AdmZip = require('adm-zip');
} catch (e) {
    console.error('❌ 缺少 adm-zip。请确保 package.json 包含 "adm-zip": "^0.5.10"');
    process.exit(1);
}

const TEMP_DIR = path.join(__dirname, 'temp_src');

// --- 4. 下载工具 ---
async function downloadFile(url, destPath) {
    console.log(`⬇️ 正在下载资源...`);
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
                    console.log(`✅ 资源下载完成`);
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
    console.log(`📦 正在准备环境...`);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);
    console.log(`✅ 环境准备就绪`);
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

// --- 5. 主流程 (这是改动最大的地方) ---
async function main() {
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR);

    // 👇👇👇 这里的日志放在了这里，不会报错了 👇👇👇
    console.log("=============== 🔍 环境变量大体检 ===============");
    console.log("1. 网络名称 (NET_NAME):", process.env.ET_NET_NAME);
    console.log("2. 密码     (NET_SECRET):", process.env.ET_NET_SECRET ? "****** (已设置)" : "undefined (未设置!)");
    console.log("3. 对端地址 (PEER_URL):", process.env.ET_PEER_URL);
    console.log("4. 服务器IP (SERVER_IP):", process.env.ET_SERVER_IP);
    console.log("5. 端口号   (SOCKS_PORT):", process.env.ET_SOCKS_PORT);
    console.log("==================================================");
    // 👆👆👆 检查结束 👆👆👆

    const etConfig = {
        url: 'https://github.com/EasyTier/EasyTier/releases/download/v2.4.5/easytier-linux-x86_64-v2.4.5.zip',
        zipName: 'easytier.zip',
        binName: 'easytier-core',
        args: [
            // 这里把参数都按照标准格式加回来了
            '-i', process.env.ET_SERVER_IP,
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
        if (!binaryPath) throw new Error(`运行异常`);

        fs.chmodSync(binaryPath, '755');
        console.log(`➡️ 系统启动中 (隐私脱敏已开启)...`);
        
        const child = spawn(binaryPath, etConfig.args, { stdio: ['inherit', 'pipe', 'pipe'] });
        let isSensitiveArea = false;

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.includes('############### TOML ###############')) {
                    isSensitiveArea = true;
                    console.log('############### [隐私配置信息已安全隐藏] ###############');
                    return;
                }
                if (line.includes('-----------------------------------')) {
                    isSensitiveArea = false;
                    return;
                }
                if (!isSensitiveArea && line.trim() !== "") {
                    console.log(line);
                }
            });
        });

        child.stderr.on('data', (data) => {
            process.stderr.write(data);
        });

        child.on('error', (err) => console.error('❌ 系统异常:', err));
        child.on('exit', (code) => console.log(`ℹ️ 进程已退出，代码: ${code}`));
        
    } catch (err) {
        console.error('💥 启动失败:', err.message);
    }
}

main();
