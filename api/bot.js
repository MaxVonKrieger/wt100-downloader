const express = require('express');
const { Telegraf } = require('telegraf');
const { execFile } = require('child_process');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const path = require('path');
const glob = require('glob');
const fetch = require('node-fetch');

// Промисифицированный execFile
const execFileAsync = promisify(execFile);

// Путь к yt-dlp
const ytDlpPath = path.resolve(__dirname, 'bin', 'yt-dlp_linux');

// Создание приложения Express
const app = express();
app.use(express.json());

// Токен бота
const token = '7883427750:AAGMf_eI4EMHjeJoOj3CRd0rgQ0kOnY06Z0';
const bot = new Telegraf(token);

// Главное меню
const mainMenu = {
    keyboard: [
        ['?? Начать'],
        ['?? Загрузки', '? Отмена'],
        ['?? Помощь', '?? Перезапуск']
    ],
    resize_keyboard: true
};

// Проверка URL
function isYouTubeUrl(url) {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

// Получение инфы о видео
async function getVideoInfo(url) {
    const { stdout } = await execFileAsync(ytDlpPath, ['-J', url]);
    return JSON.parse(stdout);
}

// Скачивание видео/аудио
async function downloadMedia(url, format, outBaseName) {
    const outputTemplate = `${outBaseName}.%(ext)s`;
    const args = [
        url,
        '-f', format === 'mp3' ? 'bestaudio' : 'bestvideo+bestaudio',
        '-o', outputTemplate
    ];
    await execFileAsync(ytDlpPath, args);

    const files = glob.sync(`${outBaseName}.*`);
    if (files.length === 0) throw new Error('Файл после скачивания не найден.');
    return files[0];
}

// Конвертация в MP3
function convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('libmp3lame')
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

// Обработка входящих webhook-запросов от Telegram
app.post('/bot', async (req, res) => {
    const update = req.body;
    console.log('?? Входящее сообщение:', JSON.stringify(update, null, 2));

    try {
        await bot.handleUpdate(update);
    } catch (err) {
        console.error('Ошибка обработки update:', err);
    }

    res.status(200).send('OK');
});

// Обработка сообщений
bot.on('message', async (ctx) => {
    const text = ctx.message.text;
    console.log(`?? Получено сообщение: ${text}`);

    if (text === '?? Начать') {
        return ctx.reply('?? Отправьте ссылку на YouTube видео:', {
            reply_markup: mainMenu
        });
    }

    if (text === '?? Помощь') {
        return ctx.reply('?? Отправьте ссылку на видео. Выберите MP3 или MP4. Я всё сделаю сам ??');
    }

    if (isYouTubeUrl(text)) {
        try {
            const info = await getVideoInfo(text);
            console.log('?? Видео-инфо:', info.title);
            if (info.duration > 1800) {
                return ctx.reply('?? Видео слишком длинное. Максимум — 30 минут.');
            }

            const title = info.title.substring(0, 64);
            return ctx.reply(`?? *${title}*\nВыбери формат:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '?? MP3', callback_data: `mp3_${text}` }],
                        [{ text: '?? MP4', callback_data: `mp4_${text}` }]
                    ]
                }
            });
        } catch (err) {
            console.error('? Ошибка получения информации о видео:', err);
            return ctx.reply('? Не удалось получить информацию о видео.');
        }
    }
});

// Установка вебхука
async function setWebhook() {
    const url = 'https://wt100-downloader.onrender.com/bot'; // Render URL
    const webhookUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${url}`;

    try {
        const response = await fetch(webhookUrl);
        const data = await response.json();
        console.log('?? Установка webhook:', data);
    } catch (err) {
        console.error('? Ошибка установки webhook:', err);
    }
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`?? Сервер запущен на порту ${PORT}`);
    setWebhook(); // Устанавливаем webhook при запуске
});
