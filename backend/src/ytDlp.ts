import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface DownloadOptions {
	url: string
	outputDir: string
	trackIndex?: number
}

export async function downloadAudioMp3({
	url,
	outputDir,
	trackIndex = 1,
}: DownloadOptions): Promise<string> {
	if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

	const outputFile = path.join(outputDir, 'current.mp3')

	const args = [
		url,
		'-x', // extract audio
		'--audio-format',
		'mp3',
		'--audio-quality',
		'0',
		'--embed-metadata',
		'--add-metadata',
		'--playlist-items',
		String(trackIndex),
		'--newline',
		'-o',
		outputFile,
	]

	return new Promise((resolve, reject) => {
		const proc = spawn('yt-dlp', args)

		proc.stdout.on('data', data => {
			const lines = data.toString().split('\n')
			for (const line of lines) {
				const trimmed = line.trim()
				if (!trimmed) continue

				// Лог текущего трека
				const destMatch = trimmed.match(/Destination: (.+)$/)
				if (destMatch) console.log(`🎵 Скачивается: ${destMatch[1]}`)

				// Прогресс
				const progressMatch = trimmed.match(/\[download\]\s+(\d+\.\d+)%/)
				if (progressMatch) process.stdout.write(`   ${progressMatch[1]}%\r`)
			}
		})

		proc.stderr.on('data', data => process.stderr.write(data))

		proc.on('error', err =>
			reject(new Error(`Failed to start yt-dlp: ${err.message}`)),
		)

		proc.on('close', code => {
			if (code === 0) resolve(outputFile)
			else reject(new Error(`yt-dlp exited with code ${code}`))
		})
	})
}
