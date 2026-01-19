export interface DownloadOptions {
	url: string
	outputDir: string
	audioFormat?: 'mp3' | 'm4a' | 'opus'
	quality?: 'best' | 'worst'
	playlist?: boolean
}
