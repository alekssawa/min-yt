import cors from 'cors'
import express from 'express'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { downloadAudioMp3 } from './ytDlp'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

// -------------------------
// Скачать один трек
// -------------------------
app.post('/download', async (req, res) => {
	const { url, trackIndex } = req.body
	if (!url) return res.status(400).json({ error: 'No URL provided' })

	try {
		const outputDir = path.resolve('./downloads')
		const outputFile = path.join(outputDir, 'current.mp3')

		// Получаем JSON инфу о треке
		const infoProc = spawn('yt-dlp', [
			url,
			'--skip-download',
			'--print-json',
			'--playlist-items',
			String(trackIndex ?? 1),
		])

		let infoData = ''
		infoProc.stdout.on('data', d => (infoData += d.toString()))
		infoProc.stderr.on('data', d => process.stderr.write(d))

		await new Promise<void>((resolve, reject) => {
			infoProc.on('close', code =>
				code === 0 ? resolve() : reject(`yt-dlp exited with code ${code}`),
			)
			infoProc.on('error', reject)
		})

		const infoJson = JSON.parse(infoData)
		const trackInfo = {
			title: infoJson.title,
			uploader: infoJson.uploader,
			duration: infoJson.duration,
			thumbnail: infoJson.thumbnail || infoJson.thumbnails?.[0]?.url,
		}

		// Скачиваем трек
		await downloadAudioMp3({ url, outputDir, trackIndex })

		// Отправляем файл как blob и метаданные
		const fileBuffer = fs.readFileSync(outputFile)
		res.setHeader('Content-Type', 'audio/mpeg')
		res.setHeader('X-Track-Title', trackInfo.title)
		res.setHeader('X-Track-Uploader', trackInfo.uploader)
		res.setHeader('X-Track-Duration', String(trackInfo.duration))
		res.setHeader('X-Track-Thumbnail', trackInfo.thumbnail || '')

		res.send(fileBuffer)

		// Удаляем файл после отправки
		fs.unlink(outputFile, err => {
			if (err) console.error('Error deleting file:', err)
			else console.log(`🗑️ File deleted: ${outputFile}`)
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error'
		res.status(500).json({ error: message })
	}
})

// -------------------------
// Получить список треков плейлиста
// -------------------------
app.post('/playlist', async (req, res) => {
	const { url } = req.body
	if (!url) return res.status(400).json({ error: 'No URL provided' })

	try {
		const args = [
			url,
			'--flat-playlist', // только список, не скачиваем
			'--dump-json', // JSON каждой записи
		]

		const proc = spawn('yt-dlp', args)

		const tracks: {
			title: string
			uploader?: string
			duration?: number
			thumbnail?: string
		}[] = []

		proc.stdout.on('data', data => {
			const lines = data.toString().split('\n')
			for (const line of lines) {
				if (!line.trim()) continue
				try {
					const json = JSON.parse(line)
					tracks.push({
						title: json.title,
						uploader: json.uploader,
						duration: json.duration,
						thumbnail: json.thumbnail,
					})
				} catch (err) {
					// игнорируем строки, которые не JSON
				}
			}
		})

		proc.stderr.on('data', data => process.stderr.write(data))

		proc.on('error', err => {
			res.status(500).json({ error: `Failed to start yt-dlp: ${err.message}` })
		})

		proc.on('close', code => {
			if (code === 0) {
				res.json({ tracks })
			} else {
				res.status(500).json({ error: `yt-dlp exited with code ${code}` })
			}
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error'
		res.status(500).json({ error: message })
	}
})

app.listen(PORT, () => {
	console.log(`🎧 Server running on http://localhost:${PORT}`)
})
