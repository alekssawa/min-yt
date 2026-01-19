'use client'
import { useEffect, useRef, useState } from 'react'

interface Track {
	title: string
	index: number
}

export default function PlaylistPlayer() {
	const [url, setUrl] = useState('')
	const [tracks, setTracks] = useState<Track[]>([])
	const [currentIndex, setCurrentIndex] = useState(0)
	const [audioUrl, setAudioUrl] = useState('')
	const [loading, setLoading] = useState(false)
	const audioRef = useRef<HTMLAudioElement>(null)

	// Получение списка треков (для плейлиста)
	const fetchPlaylist = async () => {
		if (!url) return
		setLoading(true)
		try {
			// Получаем список треков через API
			const res = await fetch('http://localhost:4000/api/playlist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url }),
			})
			const data = await res.json()
			if (data.tracks && data.tracks.length > 0) {
				setTracks(
					data.tracks.map((title: string, i: number) => ({ title, index: i })),
				)
				setCurrentIndex(0)
			} else {
				// Если это одиночный трек
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
			const res = await fetch('http://localhost:4000/api/download', {
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
			const nextIndex = currentIndex + 1
			setCurrentIndex(nextIndex)
			downloadTrack(nextIndex)
		}
	}

	// Скачиваем первый трек при обновлении currentIndex
	useEffect(() => {
		if (tracks.length > 0) {
			downloadTrack(currentIndex)
		}
	}, [currentIndex, tracks])

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

			{/* TrackList для плейлиста */}
			{tracks.length > 1 && (
				<div className='mb-4'>
					<h3 className='font-bold mb-2'>Плейлист</h3>
					<ul className='space-y-1'>
						{tracks.map(track => (
							<li
								key={track.index}
								className={`p-2 rounded cursor-pointer ${
									track.index === currentIndex
										? 'bg-blue-500 text-white'
										: 'bg-gray-100'
								}`}
								onClick={() => setCurrentIndex(track.index)}
							>
								{track.title}
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Плеер */}
			{audioUrl && (
				<div>
					<audio
						ref={audioRef}
						src={audioUrl}
						controls
						autoPlay
						onEnded={handleEnded}
						className='w-full'
					/>
					<p className='mt-2'>
						{tracks[currentIndex]?.title} ({currentIndex + 1}/{tracks.length})
					</p>
				</div>
			)}
		</div>
	)
}
