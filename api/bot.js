const express = require('express');
const { Telegraf } = require('telegraf');
const { execFile } = require('child_process');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const path = require('path');
const glob = require('glob');
const fetch = require('node-fetch');

// ���� � yt-dlp ��� Render (Linux)
const ytDlpPath = path.resolve(__dirname, 'bin', 'yt-dlp_linux');

// �������� ���������� Express
const app = express();

// ����� ����
const token = '7883427750:AAGMf_eI4EMHjeJoOj3CRd0rgQ0kOnY06Z0'; // ������ ���� �����
const bot = new Telegraf(token);

// ���������� bodyParser ��� �������� ������ �� Telegram
app.use(express.json());  // ��������� json middleware ��� ������ � POST ���������

// ������� ����
const mainMenu = {
    keyboard: [
        ['?? ������'],
        ['?? ��������', '? ������'],
        ['?? ������', '?? ����������']
    ],
    resize: true
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

// ������ ��� Telegram
app.post('/webhook', async (req, res) => {
    const { message } = req.body;

    // ��������� ������
    if (message) {
        const { text } = message;

        if (text === '?? ������') {
            return res.json({
                text: '?? ��������� ������ �� YouTube �����:'
            });
        }

        if (text === '?? ������') {
            return res.json({
                text: '?? ��������� ������ �� �����. �������� MP3 ��� MP4. � �� ������ ��� ??'
            });
        }

        if (isYouTubeUrl(text)) {
            try {
                const info = await getVideoInfo(text);
                if (info.duration > 1800) {
                    return res.json({
                        text: '?? ����� ������� �������. �������� � 30 �����.'
                    });
                } else {
                    const title = info.title.substring(0, 64);
                    return res.json({
                        text: `?? *${title}*\n������ ������:`,
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
                    text: '? ������ ��� ��������� ���������� � �����.'
                });
            }
        }
    }

    // ��������� ���������
    res.status(200).end();
});

// ��������� webhook
const setWebhook = async () => {
    const url = 'https://your-render-url.com/webhook'; // ������ ���� URL �� Render
    const webhookUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${url}`;

    try {
        const response = await fetch(webhookUrl);
        const data = await response.json();
        console.log(data);
    } catch (error) {
        console.error('������ ��� ��������� webhook:', error);
    }
};

// ��������� ������
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`��� ������� ���� ${PORT}...`);
    setWebhook();  // ������������� webhook
});
