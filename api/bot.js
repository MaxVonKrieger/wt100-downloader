const express = require('express');
const { Telegraf } = require('telegraf');
const { execFile } = require('child_process');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const path = require('path');
const glob = require('glob');
const fetch = require('node-fetch');
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
    console.log('Проверка URL:', url);
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

// Получение инфы о видео
async function getVideoInfo(url) {
    console.log('Получение информации о видео для URL:', url);
    const { stdout } = await execFileAsync('./yt-dlp.exe', ['-J', url]);
    console.log('Информация о видео:', stdout);
    return JSON.parse(stdout);
}

// Скачивание видео/аудио
async function downloadMedia(url, format, outBaseName) {
    console.log(`Начало скачивания для ${url} в формате ${format}`);
    const outputTemplate = `${outBaseName}.%(ext)s`;
    const args = [
        url,
        '-f', format === 'mp3' ? 'bestaudio' : 'bestvideo+bestaudio',
        '-o', outputTemplate
    ];
    await execFileAsync('./yt-dlp.exe', args);

    const files = glob.sync(`${outBaseName}.*`);
    console.log('Найденные файлы:', files);
    if (files.length === 0) throw new Error('Файл после скачивания не найден.');
    return files[0];
}

// Конвертация в MP3
function convertToMp3(inputPath, outputPath) {
    console.log(`Конвертация в MP3: ${inputPath} -> ${outputPath}`);
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('libmp3lame')
            .save(outputPath)
            .on('end', () => {
                console.log('Конвертация завершена');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('Ошибка конвертации:', err);
                reject(err);
            });
    });
}

// Вебхук для Telegram
app.post('/bot', async (req, res) => {
    console.log('Получен запрос на webhook:', req.body);

    const { message } = req.body;

    // Обработка команд
    if (message) {
        const { text } = message;
        console.log('Обработанный текст сообщения:', text);

        if (text === '?? Начать') {
            console.log('Запуск: отправляем инструкцию');
            return res.json({
                text: '?? Отправьте ссылку на YouTube видео:'
            });
        }

        if (text === '?? Помощь') {
            console.log('Помощь: отправляем инструкцию');
            return res.json({
                text: '?? Отправьте ссылку на видео. Выберите MP3 или MP4. Я всё сделаю сам ??'
            });
        }

        if (isYouTubeUrl(text)) {
            console.log('URL YouTube найден, извлекаем информацию о видео');
            try {
                const info = await getVideoInfo(text);
                console.log('Информация о видео получена:', info);

                if (info.duration > 1800) {
                    console.log('Видео слишком длинное (более 30 минут)');
                    return res.json({
                        text: '?? Видео слишком длинное. Максимум — 30 минут.'
                    });
                } else {
                    const title = info.title.substring(0, 64);
                    console.log('Выбираем формат видео для:', title);
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
                console.error('Ошибка при получении информации о видео:', err);
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
    const url = `https://wt100-downloader.onrender.com/bot`; // Используем новый URL
    const webhookUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${url}`;
    console.log('Устанавливаем webhook на URL:', webhookUrl);

    try {
        const response = await fetch(webhookUrl);
        const data = await response.json();
        console.log('Ответ от Telegram API при установке webhook:', data);
    } catch (error) {
        console.error('Ошибка при установке webhook:', error);
    }
};

// Запускаем сервер на порту, указанном в Render
const port = process.env.PORT || 3000;  // Используем порт из переменной окружения или 3000 по умолчанию
app.listen(port, () => {
    console.log(`Бот слушает порт ${port}...`);
    setWebhook();  // Устанавливаем webhook
});
