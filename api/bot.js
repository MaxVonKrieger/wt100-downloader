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
    console.log('�������� URL:', url);
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

// ��������� ���� � �����
async function getVideoInfo(url) {
    console.log('��������� ���������� � ����� ��� URL:', url);
    const { stdout } = await execFileAsync('./yt-dlp.exe', ['-J', url]);
    console.log('���������� � �����:', stdout);
    return JSON.parse(stdout);
}

// ���������� �����/�����
async function downloadMedia(url, format, outBaseName) {
    console.log(`������ ���������� ��� ${url} � ������� ${format}`);
    const outputTemplate = `${outBaseName}.%(ext)s`;
    const args = [
        url,
        '-f', format === 'mp3' ? 'bestaudio' : 'bestvideo+bestaudio',
        '-o', outputTemplate
    ];
    await execFileAsync('./yt-dlp.exe', args);

    const files = glob.sync(`${outBaseName}.*`);
    console.log('��������� �����:', files);
    if (files.length === 0) throw new Error('���� ����� ���������� �� ������.');
    return files[0];
}

// ����������� � MP3
function convertToMp3(inputPath, outputPath) {
    console.log(`����������� � MP3: ${inputPath} -> ${outputPath}`);
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('libmp3lame')
            .save(outputPath)
            .on('end', () => {
                console.log('����������� ���������');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('������ �����������:', err);
                reject(err);
            });
    });
}

// ������ ��� Telegram
app.post('/bot', async (req, res) => {
    console.log('������� ������ �� webhook:', req.body);

    const { message } = req.body;

    // ��������� ������
    if (message) {
        const { text } = message;
        console.log('������������ ����� ���������:', text);

        if (text === '?? ������') {
            console.log('������: ���������� ����������');
            return res.json({
                text: '?? ��������� ������ �� YouTube �����:'
            });
        }

        if (text === '?? ������') {
            console.log('������: ���������� ����������');
            return res.json({
                text: '?? ��������� ������ �� �����. �������� MP3 ��� MP4. � �� ������ ��� ??'
            });
        }

        if (isYouTubeUrl(text)) {
            console.log('URL YouTube ������, ��������� ���������� � �����');
            try {
                const info = await getVideoInfo(text);
                console.log('���������� � ����� ��������:', info);

                if (info.duration > 1800) {
                    console.log('����� ������� ������� (����� 30 �����)');
                    return res.json({
                        text: '?? ����� ������� �������. �������� � 30 �����.'
                    });
                } else {
                    const title = info.title.substring(0, 64);
                    console.log('�������� ������ ����� ���:', title);
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
                console.error('������ ��� ��������� ���������� � �����:', err);
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
    const url = `https://wt100-downloader.onrender.com/bot`; // ���������� ����� URL
    const webhookUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${url}`;
    console.log('������������� webhook �� URL:', webhookUrl);

    try {
        const response = await fetch(webhookUrl);
        const data = await response.json();
        console.log('����� �� Telegram API ��� ��������� webhook:', data);
    } catch (error) {
        console.error('������ ��� ��������� webhook:', error);
    }
};

// ��������� ������ �� �����, ��������� � Render
const port = process.env.PORT || 3000;  // ���������� ���� �� ���������� ��������� ��� 3000 �� ���������
app.listen(port, () => {
    console.log(`��� ������� ���� ${port}...`);
    setWebhook();  // ������������� webhook
});
