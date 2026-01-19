import cors from 'cors'
import express from 'express'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'stream'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

// -------------------------
// Stream audio with HTTP Range support
// -------------------------
app.get('/stream', async (req, res) => {
    const url = req.query.url as string
    if (!url) return res.status(400).json({ error: 'No URL provided' })

    const trackId = createHash('md5').update(url).digest('hex')
    const outputDir = path.resolve('./downloads')
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    
    // Используем .webm или .m4a, так как стриминг mp3 через yt-dlp stdout нестабилен
    // Браузер (Chrome/Firefox/Safari) отлично играет этот формат.
    const filePath = path.join(outputDir, `${trackId}.webm`) 

    // -------------------------
    // СЦЕНАРИЙ 1: Файл уже существует (полностью скачан)
    // -------------------------
    // Проверяем, есть ли файл и не "нулевой" ли он
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
        const stat = fs.statSync(filePath)
        const range = req.headers.range

        if (!range) {
            res.writeHead(200, {
                'Content-Type': 'audio/webm', // или audio/mpeg, если все же mp3
                'Content-Length': stat.size,
            })
            fs.createReadStream(filePath).pipe(res)
        } else {
            const parts = range.replace(/bytes=/, "").split("-")
            const start = parseInt(parts[0], 10)
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
            const chunksize = (end - start) + 1

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'audio/webm',
            })
            fs.createReadStream(filePath, { start, end }).pipe(res)
        }
        return
    }

    // -------------------------
    // СЦЕНАРИЙ 2: Файла нет, качаем и стримим одновременно
    // -------------------------
    console.log(`🚀 Starting live stream for: ${url}`)
    
    // Запускаем yt-dlp с выводом в STDOUT ('-o', '-')
    // Убираем конвертацию в mp3, так как она требует post-processing на диске.
    // '-f', 'bestaudio' отдаст лучший звук (обычно opus/m4a), что идеально для веба.
    const ytdlp = spawn('yt-dlp', [
        url,
        '-f', 'bestaudio', 
        '-o', '-',         // Вывод в консоль (stdout), а не в файл
        '--quiet',         // Убираем лишний мусор из логов
        '--no-playlist'
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    // Устанавливаем заголовки для потоковой передачи
    // Важно: НЕ ставим Content-Length, так как мы его не знаем!
    res.writeHead(200, {
        'Content-Type': 'audio/webm',
        'Transfer-Encoding': 'chunked' // Браузер поймет, что это поток
    })

    // Создаем "Тройник" (PassThrough stream)
    // Данные от yt-dlp пойдут и в ответ (res), и в файл (fileStream)
    const teeStream = new PassThrough()
    const fileStream = fs.createWriteStream(filePath)

    // Пайпинг:
    // yt-dlp -> teeStream
    // teeStream -> res (юзер слышит звук сразу)
    // teeStream -> file (сохраняем на диск для следующего раза)
    
    ytdlp.stdout.pipe(teeStream)
    teeStream.pipe(res)
    teeStream.pipe(fileStream)

    // Обработка закрытия соединения клиентом
    res.on('close', () => {
        // Если клиент ушел, но загрузка еще идет — решайте сами:
        // ytdlp.kill() // раскомментировать, если хотите обрывать загрузку при уходе юзера
    })

    ytdlp.on('close', (code) => {
        console.log(`✅ Download finished with code ${code}`)
        // Файл записан полностью
    })
    
    // Удаление через 5 минут (как у вас было)
    setTimeout(() => {
         if (fs.existsSync(filePath)) {
            // fs.unlink(filePath, () => console.log('Deleted cached file'))
         }
    }, 5 * 60 * 1000)
})
// -------------------------
// Получить инфо о треке или плейлисте
// -------------------------
interface TrackInfo {
  title: string
  uploader?: string
  duration?: number
  thumbnail?: string
  url: string
}

app.post('/info', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'No URL provided' })

  try {
    // Плейлист
    if (url.includes('list=')) {
      const args = [url, '--dump-json', '--flat-playlist']
      const proc = spawn('yt-dlp', args)

      const tracks: TrackInfo[] = []

      proc.stdout.on('data', data => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)

            // console.log()
            tracks.push({
              title: json.title,
              uploader: json.uploader,
              duration: json.duration,
              thumbnail: `https://i.ytimg.com/vi/${json.id}/maxresdefault.jpg`,
              url: json.webpage_url || json.url,
            })
          } catch {}
        }
      })

      proc.stderr.on('data', d => process.stderr.write(d))
      proc.on('close', code => {
        if (code === 0) res.json({ tracks })
        else res.status(500).json({ error: `yt-dlp exited with code ${code}` })
      })

      return
    }

    // Один трек
    const args = [
      url,
      '--no-playlist',
      '--skip-download',
      '--print',
      '%(title)s|%(uploader)s|%(duration)s|%(thumbnail)s|%(webpage_url)s',
    ]

    const proc = spawn('yt-dlp', args, {
      env: {
        ...process.env,
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        PYTHONIOENCODING: 'utf-8',
      },
    })

    let output = ''
    proc.stdout.on('data', d => (output += d.toString('utf8')))
    proc.stderr.on('data', d => process.stderr.write(d))
    proc.on('close', code => {
      if (code !== 0 || !output.trim()) return res.json({ tracks: [] })

      const [title, uploader, duration, thumbnail, webpage_url] = output.trim().split('|')

      res.json({
        tracks: [
          {
            title,
            uploader,
            duration: Number(duration),
            thumbnail,
            url: webpage_url,
          },
        ],
      })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.listen(PORT, () => {
  console.log(`🎧 Server running on http://localhost:${PORT}`)
})
