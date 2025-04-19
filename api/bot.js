const express = require('express');
const { Telegraf } = require('telegraf');
const { execFile } = require('child_process');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const path = require('path');
const glob = require('glob');
const fetch = require('node-fetch');

// ������������������� execFile
const execFileAsync = promisify(execFile);

// ���� � yt-dlp
const ytDlpPath = path.resolve(__dirname, 'bin', 'yt-dlp_linux');

// �������� ���������� Express
const app = express();
app.use(express.json());

// ����� ����
const token = '7883427750:AAGMf_eI4EMHjeJoOj3CRd0rgQ0kOnY06Z0';
const bot = new Telegraf(token);

// ������� ����
const mainMenu = {
    keyboard: [
        ['?? ������'],
        ['?? ��������', '? ������'],
        ['?? ������', '?? ����������']
    ],
    resize_keyboard: true
};

// �������� URL
function isYouTubeUrl(url) {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

// ��������� ���� � �����
async function getVideoInfo(url) {
    const { stdout } = await execFileAsync(ytDlpPath, ['-J', url]);
    return JSON.parse(stdout);
}

// ���������� �����/�����
async function downloadMedia(url, format, outBaseName) {
    const outputTemplate = `${outBaseName}.%(ext)s`;
    const args = [
        url,
        '-f', format === 'mp3' ? 'bestaudio' : 'bestvideo+bestaudio',
        '-o', outputTemplate
    ];
    await execFileAsync(ytDlpPath, args);

    const files = glob.sync(`${outBaseName}.*`);
    if (files.length === 0) throw new Error('���� ����� ���������� �� ������.');
    return files[0];
}

// ����������� � MP3
function convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('libmp3lame')
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

// ��������� �������� webhook-�������� �� Telegram
app.post('/bot', async (req, res) => {
    const update = req.body;
    console.log('?? �������� ���������:', JSON.stringify(update, null, 2));

    try {
        await bot.handleUpdate(update);
    } catch (err) {
        console.error('������ ��������� update:', err);
    }

    res.status(200).send('OK');
});

// ��������� ���������
bot.on('message', async (ctx) => {
    const text = ctx.message.text;
    console.log(`?? �������� ���������: ${text}`);

    if (text === '?? ������') {
        return ctx.reply('?? ��������� ������ �� YouTube �����:', {
            reply_markup: mainMenu
        });
    }

    if (text === '?? ������') {
        return ctx.reply('?? ��������� ������ �� �����. �������� MP3 ��� MP4. � �� ������ ��� ??');
    }

    if (isYouTubeUrl(text)) {
        try {
            const info = await getVideoInfo(text);
            console.log('?? �����-����:', info.title);
            if (info.duration > 1800) {
                return ctx.reply('?? ����� ������� �������. �������� � 30 �����.');
            }

            const title = info.title.substring(0, 64);
            return ctx.reply(`?? *${title}*\n������ ������:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '?? MP3', callback_data: `mp3_${text}` }],
                        [{ text: '?? MP4', callback_data: `mp4_${text}` }]
                    ]
                }
            });
        } catch (err) {
            console.error('? ������ ��������� ���������� � �����:', err);
            return ctx.reply('? �� ������� �������� ���������� � �����.');
        }
    }
});

// ��������� �������
async function setWebhook() {
    const url = 'https://wt100-downloader.onrender.com/bot'; // Render URL
    const webhookUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${url}`;

    try {
        const response = await fetch(webhookUrl);
        const data = await response.json();
        console.log('?? ��������� webhook:', data);
    } catch (err) {
        console.error('? ������ ��������� webhook:', err);
    }
}

// ������ �������
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`?? ������ ������� �� ����� ${PORT}`);
    setWebhook(); // ������������� webhook ��� �������
});
