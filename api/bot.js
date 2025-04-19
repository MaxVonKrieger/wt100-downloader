const express = require('express');
const { Telegraf } = require('telegraf');
const { execFile } = require('child_process');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const path = require('path');
const glob = require('glob');
const fetch = require('node-fetch');

// Путь к yt-dlp для Render (Linux)
const ytDlpPath = path.resolve(__dirname, 'bin', 'yt-dlp_linux');

// Создание приложения Express
const app = express();

// Токен бота
const token = '7883427750:AAGMf_eI4EMHjeJoOj3CRd0rgQ0kOnY06Z0'; // Вставь свой токен
const bot = new Telegraf(token);

// Используем bodyParser для парсинга данных из Telegram
app.use(express.json());  // Применяем json middleware для работы с POST запросами

// Главное меню
const mainMenu = {
    keyboard: [
        ['?? Начать'],
        ['?? Загрузки', '? Отмена'],
        ['?? Помощь', '?? Перезапуск']
    ],
    resize: true
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

// Вебхук для Telegram
app.post('/webhook', async (req, res) => {
    const { message } = req.body;

    // Обработка команд
    if (message) {
        const { text } = message;

        if (text === '?? Начать') {
            return res.json({
                text: '?? Отправьте ссылку на YouTube видео:'
            });
        }

        if (text === '?? Помощь') {
            return res.json({
                text: '?? Отправьте ссылку на видео. Выберите MP3 или MP4. Я всё сделаю сам ??'
            });
        }

        if (isYouTubeUrl(text)) {
            try {
                const info = await getVideoInfo(text);
                if (info.duration > 1800) {
                    return res.json({
                        text: '?? Видео слишком длинное. Максимум — 30 минут.'
                    });
                } else {
                    const title = info.title.substring(0, 64);
                    return res.json({
                        text: `?? *${title}*\nВыбери формат:`,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '?? MP3', callback_data: `mp3_${text}` }],
                                [{ text: '?? MP4', callback_data: `mp4_${text}` }]
                            ]
                        }
                    });
                }
            } catch (err) {
                console.error(err);
                return res.json({
                    text: '? Ошибка при получении информации о видео.'
                });
            }
        }
    }

    // Завершаем обработку
    res.status(200).end();
});

// Настройка webhook
const setWebhook = async () => {
    const url = 'https://your-render-url.com/webhook'; // Вставь свой URL на Render
    const webhookUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${url}`;

    try {
        const response = await fetch(webhookUrl);
        const data = await response.json();
        console.log(data);
    } catch (error) {
        console.error('Ошибка при установке webhook:', error);
    }
};

// Запускаем сервер
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Бот слушает порт ${PORT}...`);
    setWebhook();  // Устанавливаем webhook
});
