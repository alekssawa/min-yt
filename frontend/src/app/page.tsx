'use client'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

interface Track {
	title: string
	uploader?: string
	duration?: number
	thumbnail?: string
	index: number
}

export default function PlaylistPlayer() {
	const [url, setUrl] = useState('')
	const [tracks, setTracks] = useState<Track[]>([])
	const [currentIndex, setCurrentIndex] = useState(0)
	const [audioUrl, setAudioUrl] = useState('')
	const [loading, setLoading] = useState(false)
	const [progress, setProgress] = useState(0)
	const [volume, setVolume] = useState(1)
	const audioRef = useRef<HTMLAudioElement>(null)

	// Получаем список треков
	const fetchPlaylist = async () => {
		if (!url) return
		setLoading(true)
		try {
			const res = await fetch('http://localhost:4000/playlist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url }),
			})
			const data = await res.json()

			console.log(data)
			if (data.tracks && data.tracks.length > 0) {
				setTracks(
					data.tracks.map((t: Track, i: number) => ({
						...t,
						index: i,
					})),
				)
				setCurrentIndex(0)
			} else {
				setTracks([{ title: 'Текущий трек', index: 0 }])
				setCurrentIndex(0)
			}
		} catch (err) {
			console.error(err)
			alert('Ошибка получения треков')
		} finally {
			setLoading(false)
		}
	}

	// Скачиваем текущий трек
	const downloadTrack = async (index: number) => {
		setLoading(true)
		try {
			const res = await fetch('http://localhost:4000/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url, trackIndex: index + 1 }),
			})
			if (!res.ok) throw new Error('Download failed')
			const blob = await res.blob()
			const objectUrl = URL.createObjectURL(blob)
			setAudioUrl(objectUrl)
		} catch (err) {
			console.error(err)
			alert('Ошибка скачивания трека')
		} finally {
			setLoading(false)
		}
	}

	// Автозапуск следующего трека
	const handleEnded = () => {
		if (currentIndex + 1 < tracks.length) {
			setCurrentIndex(currentIndex + 1)
		}
	}

	useEffect(() => {
		if (tracks.length > 0) {
			downloadTrack(currentIndex)
		}
	}, [currentIndex, tracks])

	// Прогресс
	useEffect(() => {
		const audio = audioRef.current
		if (!audio) return
		const update = () => setProgress((audio.currentTime / audio.duration) * 100)
		audio.addEventListener('timeupdate', update)
		return () => audio.removeEventListener('timeupdate', update)
	}, [audioUrl])

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
		if (!audio) return
		const rect = e.currentTarget.getBoundingClientRect()
		const clickX = e.clientX - rect.left
		const newTime = (clickX / rect.width) * audio.duration
		audio.currentTime = newTime
		setProgress((newTime / audio.duration) * 100)
	}

	return (
		<div className='p-4 max-w-xl mx-auto'>
			<h1 className='text-2xl font-bold mb-4'>PulseHub Player</h1>

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
			{audioUrl && (
				<div className='bg-gray-900 p-4 rounded-lg shadow-md text-white'>
					{tracks[currentIndex]?.thumbnail && (
						<Image
							src={tracks[currentIndex].thumbnail}
							alt={tracks[currentIndex].title}
							width={500}
							height={300}
							className='w-full rounded mb-2'
						/>
					)}
					<h2 className='font-bold mb-1'>{tracks[currentIndex]?.title}</h2>
					{tracks[currentIndex]?.uploader && (
						<p className='text-sm text-gray-300 mb-1'>
							Автор: {tracks[currentIndex].uploader}
						</p>
					)}
					{tracks[currentIndex]?.duration && (
						<p className='text-sm text-gray-300 mb-2'>
							Длительность: {Math.floor(tracks[currentIndex].duration / 60)}:
							{(tracks[currentIndex].duration % 60).toString().padStart(2, '0')}
						</p>
					)}

					<audio ref={audioRef} src={audioUrl} autoPlay onEnded={handleEnded} />

					<div
						className='h-2 bg-gray-700 rounded cursor-pointer mb-3'
						onClick={handleSeek}
					>
						<div
							className='h-2 bg-blue-500 rounded'
							style={{ width: `${progress}%` }}
						/>
					</div>

					<div className='flex items-center justify-center gap-4'>
						<button
							onClick={handlePrev}
							disabled={currentIndex === 0}
							className='w-10 h-10 p-2 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50'
						>
							◀
						</button>
						<button
							onClick={() =>
								audioRef.current?.paused
									? audioRef.current.play()
									: audioRef.current?.pause()
							}
							className='w-10 h-10 p-2 rounded-full bg-gray-800 hover:bg-gray-700'
						>
							{audioRef.current?.paused ? '▶' : '⏸'}
						</button>
						<button
							onClick={handleNext}
							disabled={currentIndex + 1 === tracks.length}
							className='w-10 h-10 p-2 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50'
						>
							▶
						</button>

						<div className='flex items-center gap-2'>
							<span>🔊</span>
							<input
								type='range'
								min={0}
								max={1}
								step={0.01}
								value={volume}
								onChange={handleVolumeChange}
								className='w-24'
							/>
						</div>
					</div>

					<p className='text-sm mt-2 text-gray-300'>
						{currentIndex + 1}/{tracks.length}
					</p>
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
												{(track.duration % 60).toString().padStart(2, '0')}
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
