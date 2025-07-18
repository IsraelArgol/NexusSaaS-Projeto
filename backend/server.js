// NexusSaaS/backend/server.js

// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

const express = require('express'); // <<< LINHA CRÍTICA! DEVE ESTAR AQUI!
const cors = require('cors');
const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');

const app = express(); // <<< ESTA LINHA DEPENDE DE 'express' ACIMA!
const PORT = process.env.PORT || 8080; // Backend rodará na porta 8080
const TEMP_CLONES_DIR = path.join(__dirname, 'temp_clones');

// Garante que o diretório temporário exista (síncrono na inicialização)
fse.ensureDirSync(TEMP_CLONES_DIR);

app.use(express.json());
// Adiciona este middleware para parsear dados de formulário HTML (x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));
console.log('[BACKEND] Middleware express.urlencoded carregado.'); // Log para confirmar o carregamento

app.use(cors({
    origin: [
        'http://127.0.0.1:5500', // Para desenvolvimento local
        'http://localhost:5500', // Para desenvolvimento local
        'https://nexus-saa-s-projeto-6l56jyaqh-israel-argolos-projects.vercel.app' // <<< ADICIONE ESTA LINHA COM A SUA URL REAL!
    ]
}));
// Rota de teste simples
app.get('/', (req, res) => {
    res.send('Backend do NexusSaaS está online e operacional!');
});

// --- Rotas de Autenticação (Login e Registro - Lógica Simulada) ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    console.log(`Tentativa de login recebida: E-mail: ${email}, Senha: ${password}`);

    if (email === 'teste@exemplo.com' && password === 'senha123') {
        res.status(200).json({ message: 'Login bem-sucedido! Bem-vindo ao NexusSaaS.', token: 'simulated_jwt_token_abc123' });
    } else {
        res.status(401).json({ message: 'Credenciais inválidas. Use "teste@exemplo.com" e "senha123".' });
    }
});

app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    console.log(`Tentativa de registro recebida: E-mail: ${email}, Senha: ${password}`);

    if (email && password) {
        res.status(201).json({ message: 'Usuário registrado com sucesso (simulado)!' });
    } else {
        res.status(400).json({ message: 'E-mail e senha são obrigatórios para registro.' });
    }
});
// -----------------------------------------------------------------------

// --- FUNÇÃO AUXILIAR PARA BAIXAR ATIVOS ---
async function downloadAsset(url, savePath) { /* ... */ }

// --- ROTA PRINCIPAL DE CLONAGEM (AGORA RETORNA JSON COM URL DE DOWNLOAD) ---
app.post('/api/clone', async (req, res) => {
    console.log('[CLONAR] Conteúdo de req.body:', req.body);

    const { originalUrl, originalCheckoutLink, newCheckoutLink } = req.body;

    if (!originalUrl || !originalCheckoutLink || !newCheckoutLink) {
        // Em caso de campos vazios, RETORNA JSON de ERRO 400
        console.warn('[CLONAR] Campos obrigatórios vazios. Retornando erro 400.');
        return res.status(400).json({ message: 'Todos os campos (URL Original, Link de Checkout ORIGINAL e NOVO Link de Checkout) são obrigatórios.' });
    }

    console.log(`[CLONAR] Recebida solicitação para clonar: ${originalUrl}`);
    console.log(`[CLONAR] Substituir LINK ORIGINAL: "${originalCheckoutLink}" por NOVO LINK: "${newCheckoutLink}"`);

    let browser;
    let tempDir;
    let outputZipName = ''; 

    try {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        tempDir = path.join(TEMP_CLONES_DIR, `cloned_page_${timestamp}_${randomId}`);
        await fse.ensureDir(tempDir);
        console.log(`[CLONAR] Diretório temporário criado: ${tempDir}`);

        browser = await chromium.launch();
        const page = await browser.newPage();
        
        console.log(`[CLONAR] Navegando para: ${originalUrl}`);
        await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000); 
        console.log(`[CLONAR] Página carregada no Playwright.`);

        let htmlContent = await page.content();

        const escapedOriginalLink = originalCheckoutLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexToReplace = new RegExp(escapedOriginalLink, 'g');

        if (htmlContent.includes(originalCheckoutLink)) {
            htmlContent = htmlContent.replace(regexToReplace, newCheckoutLink);
            console.log(`[CLONAR] Substituição do link "${originalCheckoutLink}" por "${newCheckoutLink}" realizada.`);
        } else {
            console.warn(`[CLONAR] Atenção: Link original de checkout "${originalCheckoutLink}" NÃO ENCONTRADO na página clonada.`);
        }

        const htmlFilePath = path.join(tempDir, 'index.html');
        await fse.writeFile(htmlFilePath, htmlContent);
        console.log(`[CLONAR] HTML principal salvo em: ${htmlFilePath}`);

        const $ = cheerio.load(htmlContent, { decodeEntities: false });

        const assetPromises = [];
        const baseUrl = new URL(originalUrl);

        const resolveUrl = (relativeUrl) => {
            try {
                return new URL(relativeUrl, baseUrl).href;
            } catch (e) {
                console.warn(`[CLONAR] Não foi possível resolver URL relativa: ${relativeUrl} com base em ${baseUrl.href}. Erro: ${e.message}`);
                return null;
            }
        };

        // Processar <link> tags (CSS)
        $('link[rel="stylesheet"]').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                const absoluteUrl = resolveUrl(href);
                if (absoluteUrl) {
                    const assetFileName = path.basename(new URL(absoluteUrl).pathname);
                    const assetDir = path.join(tempDir, 'assets', 'css');
                    const assetPath = path.join(assetDir, assetFileName);
                    assetPromises.push(downloadAsset(absoluteUrl, assetPath).then(() => {
                        $(el).attr('href', path.relative(path.dirname(htmlFilePath), assetPath).replace(/\\/g, '/'));
                    }).catch(err => console.error(`[CLONAR] Erro na promise de download CSS ${absoluteUrl}:`, err.message)));
                }
            }
        });

        // Processar <img> tags
        $('img').each((i, el) => {
            const src = $(el).attr('src');
            if (src) {
                const absoluteUrl = resolveUrl(src);
                if (absoluteUrl) {
                    const assetFileName = path.basename(new URL(absoluteUrl).pathname);
                    const assetDir = path.join(tempDir, 'assets', 'img');
                    const assetPath = path.join(assetDir, assetFileName);
                    assetPromises.push(downloadAsset(absoluteUrl, assetPath).then(() => {
                        $(el).attr('src', path.relative(path.dirname(htmlFilePath), assetPath).replace(/\\/g, '/'));
                    }).catch(err => console.error(`[CLONAR] Erro na promise de download IMG ${absoluteUrl}:`, err.message)));
                }
            }
        });

        // Processar <script> tags
        $('script[src]').each((i, el) => {
            const src = $(el).attr('src');
            if (src) {
                const absoluteUrl = resolveUrl(src);
                if (absoluteUrl) {
                    const assetFileName = path.basename(new URL(absoluteUrl).pathname);
                    const assetDir = path.join(tempDir, 'assets', 'js');
                    const assetPath = path.join(assetDir, assetFileName);
                    assetPromises.push(downloadAsset(absoluteUrl, assetPath).then(() => {
                        $(el).attr('src', path.relative(path.dirname(htmlFilePath), assetPath).replace(/\\/g, '/'));
                    }).catch(err => console.error(`[CLONAR] Erro na promise de download JS ${absoluteUrl}:`, err.message)));
                    
                }
            }
        });
        
        console.log(`[CLONAR] Tentando baixar ${assetPromises.length} ativos.`);
        await Promise.all(assetPromises.filter(p => p !== null)); 
        console.log(`[CLONAR] Todos os ativos processados (baixados ou ignorados erros).`);

        // Salvar o HTML com os caminhos reescritos novamente
        await fse.writeFile(htmlFilePath, $.html());
        console.log(`[CLONAR] HTML com caminhos de ativos reescritos salvo.`);

        // 6. Compactar a pasta para download
        outputZipName = `cloned_page_${timestamp}.zip`;
        const outputZipPath = path.join(TEMP_CLONES_DIR, outputZipName);

        const output = fs.createWriteStream(outputZipPath);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        const archivePromise = new Promise((resolve, reject) => {
            output.on('close', () => {
                console.log(`[CLONAR] Página clonada compactada em: ${outputZipPath} (${archive.pointer()} bytes)`);
                resolve();
            });
            archive.on('error', (err) => {
                console.error('[CLONAR] Erro ao compactar:', err);
                reject(err);
            });
        });

        archive.pipe(output);
        archive.directory(tempDir, false); 
        archive.finalize();

        await archivePromise;
        console.log(`[CLONAR] Arquivo ZIP criado: ${outputZipName}`);

        // 7. Retorna JSON com a URL de download!
        res.status(200).json({
            message: 'Página clonada com sucesso! O download será iniciado automaticamente.',
            downloadUrl: `http://localhost:${PORT}/download/${outputZipName}`
        });

    } catch (error) {
        console.error('[ERRO GERAL NA CLONAGEM]:', error);
        if (browser) {
            await browser.close();
        }
        if (tempDir && fse.existsSync(tempDir)) {
            await fse.remove(tempDir).catch(cleanErr => console.error('Erro ao limpar tempDir após erro:', cleanErr));
        }
        if (outputZipName && fse.existsSync(path.join(TEMP_CLONES_DIR, outputZipName))) {
            await fse.remove(path.join(TEMP_CLONES_DIR, outputZipName)).catch(cleanErr => console.error('Erro ao limpar ZIP após erro:', cleanErr));
        }
        res.status(500).json({ message: 'Ocorreu um erro interno ao clonar a página. Tente novamente mais tarde.' });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// --- NOVA ROTA GET PARA SERVIR O DOWNLOAD REAL DO ARQUIVO ZIP ---
// --- NOVA ROTA GET PARA FORÇAR O DOWNLOAD DIRETO NO NAVEGADOR ---
app.get('/download/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(TEMP_CLONES_DIR, filename);

    if (fse.existsSync(filePath)) {
        // Força o navegador a baixar o arquivo como ZIP
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/zip');

        res.sendFile(filePath, async (err) => {
            if (err) {
                console.error(`[DOWNLOAD] Erro ao enviar o arquivo ZIP ${filename}:`, err);
                if (err.code === 'ECONNABORTED') {
                    console.log(`[DOWNLOAD] Download de ${filename} abortado pelo cliente.`);
                }
            } else {
                console.log(`[DOWNLOAD] Arquivo ${filename} enviado com sucesso para download.`);
            }

            try {
                if (fse.existsSync(filePath)) {
                    await fse.remove(filePath);
                    console.log(`[DOWNLOAD] Arquivo ZIP ${filePath} removido.`);
                }

                const folderName = filename.replace('.zip', '');
                const tempFolderToClean = path.join(TEMP_CLONES_DIR, folderName);
                if (fse.existsSync(tempFolderToClean)) {
                    await fse.remove(tempFolderToClean);
                    console.log(`[DOWNLOAD] Pasta temporária ${tempFolderToClean} removida.`);
                }
            } catch (cleanErr) {
                console.error(`[DOWNLOAD] Erro ao limpar arquivos temporários após download de ${filename}:`, cleanErr);
            }
        });
    } else {
        console.warn(`[DOWNLOAD] Arquivo ${filename} não encontrado para download em ${filePath}`);
        res.status(404).json({ message: 'Arquivo não encontrado.' });
    }
});


// Inicia o servidor Node.js
app.listen(PORT, () => {
    console.log(`🚀 Motor do NexusSaaS iniciado na porta ${PORT}`);
    console.log(`Acesse o backend em: http://localhost:${PORT}`);
});