﻿const express = require('express');
const { Telegraf } = require('telegraf');
const { execFile } = require('child_process');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const glob = require('glob');
const fetch = require('node-fetch');

// Путь к yt-dlp
const ytDlpPath = path.join(__dirname, 'bin', 'yt-dlp_linux'); // Правильный путь к yt-dlp
const cookiesPath = path.join(__dirname, 'cookies.txt'); // Путь к cookies.txt в корне проекта

const execFileAsync = (...args) =>
    new Promise((resolve, reject) => {
        execFile(...args, (error, stdout, stderr) => {
            if (error) return reject(error);
            resolve({ stdout, stderr });
        });
    });

const token = '7883427750:AAGMf_eI4EMHjeJoOj3CRd0rgQ0kOnY06Z0';
const bot = new Telegraf(token);
const app = express();

app.use(express.json());

// Главное меню
const mainMenu = {
    keyboard: [
        ['🚀 Начать'],
        ['📥 Загрузки', '❌ Отмена'],
        ['ℹ️ Помощь', '🔄 Перезапуск']
    ],
    resize_keyboard: true
};

// === Вспомогательные функции ===

function normalizeYouTubeUrl(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w\-]{11})/);
    if (match) {
        return `https://www.youtube.com/watch?v=${match[1]}`;
    }
    return url;
}

function isYouTubeUrl(url) {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

async function getVideoInfo(url) {
    const cleanUrl = normalizeYouTubeUrl(url);
    const chmodCommand = `chmod +x ${ytDlpPath}`;
    execFile('sh', ['-c', chmodCommand], (error) => {
        if (error) console.error(`Ошибка chmod: ${error.message}`);
    });

    const { stdout } = await execFileAsync(ytDlpPath, ['--cookies', cookiesPath, '-J', cleanUrl]);
    return JSON.parse(stdout);
}

async function downloadMedia(url, format, outBaseName) {
    const cleanUrl = normalizeYouTubeUrl(url);
    const outputTemplate = `${outBaseName}.%(ext)s`;
    const args = [
        '--cookies', cookiesPath,
        cleanUrl,
        '-f', format === 'mp3' ? 'bestaudio' : 'bestvideo+bestaudio',
        '-o', outputTemplate
    ];

    await execFileAsync(ytDlpPath, args);

    const files = glob.sync(`${outBaseName}.*`);
    if (files.length === 0) throw new Error('Файл после скачивания не найден.');
    return files[0];
}

function convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('libmp3lame')
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

// === Команды бота ===

bot.start((ctx) => {
    console.log('▶️ Получена команда /start');
    ctx.reply('Привет! Отправь ссылку на YouTube 🎬', {
        reply_markup: mainMenu
    });
});

bot.hears('🚀 Начать', (ctx) => {
    ctx.reply('📎 Отправьте ссылку на YouTube видео:');
});

bot.hears('ℹ️ Помощь', (ctx) => {
    ctx.reply('📌 Отправьте ссылку на видео. Выберите MP3 или MP4. Я всё сделаю сам 😉');
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (!isYouTubeUrl(text)) return;

    try {
        console.log(`🔍 Получение информации о видео: ${text}`);
        const cleanUrl = normalizeYouTubeUrl(text);
        const info = await getVideoInfo(cleanUrl);

        if (info.duration > 1800) {
            return ctx.reply('⚠️ Видео слишком длинное. Максимум — 30 минут.');
        }

        const title = info.title.substring(0, 64);
        return ctx.replyWithMarkdown(`🎬 *${title}*\nВыбери формат:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎵 MP3', callback_data: `mp3_${cleanUrl}` }],
                    [{ text: '🎬 MP4', callback_data: `mp4_${cleanUrl}` }]
                ]
            }
        });
    } catch (err) {
        console.error('Ошибка получения инфы:', err);
        return ctx.reply('❌ Ошибка при получении информации о видео.');
    }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const [format, rawUrl] = data.split('_');
    const url = normalizeYouTubeUrl(rawUrl);
    const base = `output_${Date.now()}`;

    try {
        await ctx.answerCbQuery();
        await ctx.reply(`⏬ Загружаю в формате ${format.toUpperCase()}...`);

        const downloaded = await downloadMedia(url, format, base);
        let fileToSend = downloaded;

        if (format === 'mp3') {
            const mp3Path = base + '.mp3';
            await convertToMp3(downloaded, mp3Path);
            fs.unlinkSync(downloaded);
            fileToSend = mp3Path;
        }

        await ctx.replyWithDocument({ source: fileToSend });
        fs.unlinkSync(fileToSend);
    } catch (err) {
        console.error('Ошибка при скачивании/отправке:', err);
        await ctx.reply('❌ Не удалось скачать видео.');
    }
});

// === WEBHOOK ===

app.post('/bot', (req, res) => {
    console.log('📩 Получено обновление:', JSON.stringify(req.body, null, 2));
    bot.handleUpdate(req.body).catch((err) => console.error('Ошибка в handleUpdate:', err));
    res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
    const port = process.env.PORT || 3000;
    console.log(`🚀 Сервер запущен на порту ${port}`);
    const webhookUrl = `https://wt100-downloader.onrender.com/bot`;
    fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`)
        .then(res => res.json())
        .then(data => {
            console.log('✅ Установка webhook:', data);
        })
        .catch(err => {
            console.error('❌ Ошибка при установке webhook:', err);
        });
});
