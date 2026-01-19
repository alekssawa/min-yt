'use client'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

interface Track {
	title: string
	uploader?: string
	duration?: number
	thumbnail?: string
	index: number
	url: string
}

export default function PlaylistPlayer() {
	const [url, setUrl] = useState('')
	const [tracks, setTracks] = useState<Track[]>([])
	const [currentIndex, setCurrentIndex] = useState(0)
	const [loading, setLoading] = useState(false)

	const [progress, setProgress] = useState(0)
	const [buffered, setBuffered] = useState(0) // 🆕 Состояние для буфера
	const [volume, setVolume] = useState(1)

	const audioRef = useRef<HTMLAudioElement>(null)

	// ... (fetchPlaylist оставляем без изменений) ...
	const fetchPlaylist = async () => {
		if (!url.trim()) return
		setLoading(true)
		try {
			const res = await fetch('http://localhost:4000/info', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url }),
			})
			const data = await res.json()
			if (data.tracks && data.tracks.length > 0) {
				setTracks(prev => {
					const startIndex = prev.length
					const newTracks = data.tracks.map((t: Track, i: number) => ({
						...t,
						index: i + startIndex,
					}))
					return [...prev, ...newTracks]
				})
				if (tracks.length === 0) setCurrentIndex(0)
			}
		} catch (err) {
			console.error(err)
			alert('Ошибка получения треков')
		} finally {
			setUrl('')
			setLoading(false)
		}
	}

	const setStreamTrack = (index: number) => {
		const track = tracks[index]
		if (!track) return

		// Сбрасываем прогресс и буфер при смене трека
		setProgress(0)
		setBuffered(0)

		const streamUrl = `http://localhost:4000/stream?url=${encodeURIComponent(track.url)}`
		if (audioRef.current) {
			audioRef.current.src = streamUrl
			audioRef.current.play()
		}
	}

	const handleEnded = () => {
		if (currentIndex + 1 < tracks.length) {
			setCurrentIndex(currentIndex + 1)
		}
	}

	useEffect(() => {
		if (tracks.length > 0) {
			setStreamTrack(currentIndex)
		}
	}, [currentIndex, tracks])

	// -------------------------
	// 🆕 Логика прогресса и буферизации
	// -------------------------
	const handleTimeUpdate = () => {
		const audio = audioRef.current
		if (!audio) return

		// Текущее время воспроизведения
		if (audio.duration) {
			setProgress((audio.currentTime / audio.duration) * 100)
		}

		// Вычисляем буфер
		if (audio.buffered.length > 0 && audio.duration) {
			// audio.buffered может содержать несколько отрезков.
			// Обычно нас интересует тот, который в конце (сколько всего скачано).
			// Но для точности берем конец последнего буферизированного отрезка.
			const bufferedEnd = audio.buffered.end(audio.buffered.length - 1)
			setBuffered((bufferedEnd / audio.duration) * 100)
		}
	}

	const handlePrev = () => {
		if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
	}
	const handleNext = () => {
		if (currentIndex + 1 < tracks.length) setCurrentIndex(currentIndex + 1)
	}

	const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const audio = audioRef.current
		if (!audio) return
		const newVolume = parseFloat(e.target.value)
		audio.volume = newVolume
		setVolume(newVolume)
	}

	const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
		const audio = audioRef.current
		if (!audio || !audio.duration) return

		const rect = e.currentTarget.getBoundingClientRect()
		const clickX = e.clientX - rect.left
		const newTime = (clickX / rect.width) * audio.duration

		// Проверка: разрешаем мотать только туда, где уже скачано (или чуть-чуть вперед)
		// Если трек уже полностью на сервере - буфер будет 100%, можно мотать везде.
		// Если качается - можно мотать только внутри серой полоски.
		if (audio.buffered.length > 0) {
			const bufferedEnd = audio.buffered.end(audio.buffered.length - 1)
			if (newTime > bufferedEnd) {
				// Опционально: можно запретить клик или поставить на самый край буфера
				audio.currentTime = bufferedEnd - 1 // прыгаем в самый конец загруженного
			} else {
				audio.currentTime = newTime
			}
		} else {
			audio.currentTime = newTime
		}

		setProgress((audio.currentTime / audio.duration) * 100)
	}

	return (
		<div className='p-4 max-w-xl mx-auto'>
			<h1 className='text-2xl font-bold mb-4'>Lisync</h1>

			<div className='flex gap-2 mb-4'>
				<input
					type='text'
					value={url}
					onChange={e => setUrl(e.target.value)}
					placeholder='Вставьте ссылку на трек или плейлист'
					className='flex-1 p-2 border rounded'
				/>
				<button
					onClick={fetchPlaylist}
					className='bg-blue-500 text-white p-2 rounded'
					disabled={loading}
				>
					{loading ? 'Загрузка...' : 'Загрузить'}
				</button>
			</div>

			{/* Плеер */}
			{tracks[currentIndex] && (
				<div className='bg-gray-900 p-4 rounded-lg shadow-md text-white'>
					{/* ... (Image и заголовки оставляем как были) ... */}
					<div className='mb-4'>
						{tracks[currentIndex]?.thumbnail && (
							<Image
								src={tracks[currentIndex].thumbnail}
								alt={tracks[currentIndex].title}
								width={500}
								height={300}
								className='w-full rounded mb-2'
							/>
						)}
						<h2 className='font-bold'>{tracks[currentIndex]?.title}</h2>
					</div>

					{/* Добавляем onProgress для обновления буфера чаще */}
					<audio
						ref={audioRef}
						autoPlay
						onEnded={handleEnded}
						onTimeUpdate={handleTimeUpdate}
						onProgress={handleTimeUpdate}
					/>

					{/* --- ТАЙМЛАЙН --- */}
					<div
						className='relative h-2 bg-gray-700 rounded cursor-pointer mb-3 select-none'
						onClick={handleSeek}
					>
						{/* 1. Полоска буферизации (серая, как на YouTube) */}
						<div
							className='absolute top-0 left-0 h-full bg-gray-500 rounded transition-all duration-300'
							style={{ width: `${buffered}%` }}
						/>

						{/* 2. Полоска прогресса (синяя/красная) */}
						<div
							className='absolute top-0 left-0 h-full bg-blue-500 rounded z-10'
							style={{ width: `${progress}%` }}
						/>

						{/* 3. Головка воспроизведения (опционально) */}
						<div
							className='absolute top-1/2 -mt-1.5 w-3 h-3 bg-white rounded-full shadow z-20 pointer-events-none'
							style={{ left: `calc(${progress}% - 6px)` }}
						/>
					</div>
					{/* ---------------- */}

					{/* Контролы (оставляем как были) */}
					<div className='flex items-center justify-center gap-4'>
						<button onClick={handlePrev} className='text-2xl'>
							⏮
						</button>
						<button
							onClick={() =>
								audioRef.current?.paused
									? audioRef.current.play()
									: audioRef.current?.pause()
							}
							className='w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-xl'
						>
							⏯
						</button>
						<button onClick={handleNext} className='text-2xl'>
							⏭
						</button>

						<input
							type='range'
							min={0}
							max={1}
							step={0.01}
							value={volume}
							onChange={handleVolumeChange}
							className='w-20 accent-blue-500'
						/>
					</div>
				</div>
			)}

			{/* Список треков */}
			{tracks.length > 1 && (
				<div className='mt-4 bg-gray-900 p-4 rounded-lg shadow-md'>
					<h3 className='font-bold mb-3 text-gray-100 text-lg'>Плейлист</h3>
					<ul className='space-y-2'>
						{tracks.map(track => (
							<li
								key={track.index}
								className={`p-3 rounded-lg cursor-pointer transition-colors duration-200 ${
									track.index === currentIndex
										? 'bg-blue-600 text-white shadow-lg'
										: 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
								}`}
								onClick={() => setCurrentIndex(track.index)}
							>
								<div className='flex items-center gap-2'>
									{track.thumbnail && (
										<Image
											src={track.thumbnail}
											alt={track.title}
											width={48}
											height={48}
											className='w-12 h-12 rounded'
										/>
									)}
									<div className='flex flex-col'>
										<span className='font-semibold'>{track.title}</span>
										{track.uploader && (
											<span className='text-xs text-gray-300'>
												{track.uploader}
											</span>
										)}
										{track.duration && (
											<span className='text-xs text-gray-300'>
												{Math.floor(track.duration / 60)}:
												{String(track.duration % 60).padStart(2, '0')}
											</span>
										)}
									</div>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	)
}
