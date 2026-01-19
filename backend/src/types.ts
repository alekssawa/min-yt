export interface DownloadOptions {
	url: string
	outputDir: string
	audioFormat?: 'mp3' | 'm4a' | 'opus'
	quality?: 'best' | 'worst'
	playlist?: boolean
}

export interface TrackInfo {
  title: string
  uploader?: string
  duration?: number
  thumbnail?: string
  url: string
  id?: string
}