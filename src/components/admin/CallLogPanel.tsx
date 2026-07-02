import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Download, Mic, Pause, Phone, Play, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const MAX_RECORDING_BYTES = 50 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg']
const ACCEPTED_MIME_PREFIXES = ['audio/']

export interface CallLog {
  id: string
  outcome: string
  duration: number
  at: string
  notes: string
  followUpDate?: string
  recordingUrl?: string
  recordingFileName?: string
  recordingSize?: number
  recordingDuration?: number
}

export type CallRecordingPayload = {
  url: string
  fileName: string
  size: number
}

export const DEFAULT_CALL_OUTCOMES = [
  'Interested',
  'Not Interested',
  'Callback Later',
  'No Answer',
  'Wrong Number',
] as const

export const DEFAULT_OUTCOME_STYLES: Record<string, string> = {
  Interested: 'bg-green-100 text-green-700',
  'Not Interested': 'bg-muted text-muted-foreground',
  'Callback Later': 'bg-blue-100 text-blue-700',
  'No Answer': 'bg-orange-100 text-orange-700',
  'Wrong Number': 'bg-red-100 text-red-700',
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function formatFileSizeMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(2)
}

function isAcceptedAudioFile(file: File) {
  const name = file.name.toLowerCase()
  const extOk = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
  const mimeOk = ACCEPTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))
  return extOk || mimeOk
}

type CallLogAudioContextValue = {
  playingId: string | null
  setPlayingId: (id: string | null) => void
  registerAudio: (id: string, audio: HTMLAudioElement) => void
  unregisterAudio: (id: string) => void
  pauseOthers: (exceptId: string) => void
}

const CallLogAudioContext = createContext<CallLogAudioContextValue | null>(null)

function CallLogAudioProvider({ children }: { children: ReactNode }) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  const registerAudio = useCallback((id: string, audio: HTMLAudioElement) => {
    audioMapRef.current.set(id, audio)
  }, [])

  const unregisterAudio = useCallback((id: string) => {
    audioMapRef.current.delete(id)
  }, [])

  const pauseOthers = useCallback((exceptId: string) => {
    audioMapRef.current.forEach((audio, id) => {
      if (id !== exceptId) audio.pause()
    })
  }, [])

  return (
    <CallLogAudioContext.Provider
      value={{ playingId, setPlayingId, registerAudio, unregisterAudio, pauseOthers }}
    >
      {children}
    </CallLogAudioContext.Provider>
  )
}

function CallRecordingUpload({
  recordingFile,
  onFileChange,
  recordingError,
  onErrorChange,
}: {
  recordingFile: File | null
  onFileChange: (file: File | null) => void
  recordingError: string
  onErrorChange: (msg: string) => void
}) {
  const inputId = useId()

  const handleFile = (file: File | null) => {
    onErrorChange('')
    if (!file) {
      onFileChange(null)
      return
    }
    if (file.size > MAX_RECORDING_BYTES) {
      onErrorChange('File too large. Max 50MB')
      onFileChange(null)
      return
    }
    if (!isAcceptedAudioFile(file)) {
      onErrorChange('Please upload MP3, M4A, WAV, or OGG')
      onFileChange(null)
      return
    }
    onFileChange(file)
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium">Call Recording (optional)</label>
      <p className="mb-2 text-xs text-muted-foreground">
        Upload recorded audio of this call
      </p>

      {!recordingFile ? (
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-border p-4 transition-colors hover:bg-muted/40"
        >
          <Mic className="mb-2 size-8 text-muted-foreground" />
          <span className="text-sm font-medium">Upload call recording</span>
          <span className="mt-1 text-xs text-muted-foreground">
            MP3, M4A, WAV, OGG — max 50MB
          </span>
          <input
            id={inputId}
            type="file"
            accept=".mp3,.m4a,.wav,.ogg,audio/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Mic className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{recordingFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSizeMB(recordingFile.size)} MB · {recordingFile.type || 'audio'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => {
              onFileChange(null)
              onErrorChange('')
            }}
            aria-label="Remove recording"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {recordingError && <p className="mt-2 text-xs text-red-600">{recordingError}</p>}
    </div>
  )
}

export function CallRecordingPlayer({ log }: { log: CallLog }) {
  const ctx = useContext(CallLogAudioContext)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(log.recordingDuration ?? 0)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !log.recordingUrl) return

    ctx?.registerAudio(log.id, audio)

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onLoadedMetadata = () => {
      setLoadError(false)
      if (Number.isFinite(audio.duration)) setDuration(audio.duration)
    }
    const onEnded = () => {
      setIsPlaying(false)
      ctx?.setPlayingId(null)
    }
    const onError = () => setLoadError(true)
    const onPause = () => {
      if (ctx?.playingId === log.id) setIsPlaying(false)
    }
    const onPlay = () => {
      if (ctx?.playingId === log.id) setIsPlaying(true)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
      ctx?.unregisterAudio(log.id)
    }
  }, [ctx, log.id, log.recordingUrl])

  useEffect(() => {
    if (ctx?.playingId !== log.id && isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    }
  }, [ctx?.playingId, isPlaying, log.id])

  if (!log.recordingUrl) return null

  if (loadError) {
    return <p className="mt-2 text-xs text-muted-foreground">⚠️ Recording unavailable</p>
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      ctx?.setPlayingId(null)
      setIsPlaying(false)
    } else {
      ctx?.pauseOthers(log.id)
      ctx?.setPlayingId(log.id)
      void audio.play()
      setIsPlaying(true)
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    audio.currentTime = pct * duration
    setCurrentTime(audio.currentTime)
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Mic className="size-4 text-gray-500" />
        <span className="text-sm font-medium">Call Recording</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 pl-0.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            className="h-1.5 w-full cursor-pointer rounded-full bg-gray-200"
            onClick={handleSeek}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' && audioRef.current) {
                audioRef.current.currentTime = Math.min(duration, currentTime + 5)
              }
              if (e.key === 'ArrowLeft' && audioRef.current) {
                audioRef.current.currentTime = Math.max(0, currentTime - 5)
              }
            }}
          >
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {log.recordingFileName && (
          <span className="max-w-[200px] truncate text-xs text-muted-foreground">
            {log.recordingFileName}
          </span>
        )}
        {log.recordingSize != null && (
          <span className="text-xs text-muted-foreground">
            · {formatFileSizeMB(log.recordingSize)} MB
          </span>
        )}
        <a
          href={log.recordingUrl}
          download={log.recordingFileName ?? 'call-recording'}
          className="inline-flex"
        >
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
            <Download className="size-3" />
            Download
          </Button>
        </a>
      </div>

      <audio ref={audioRef} src={log.recordingUrl} preload="metadata" className="hidden" />
    </div>
  )
}

export type CallLogPanelProps = {
  callLogs: CallLog[]
  showForm: boolean
  onShowFormChange: (show: boolean) => void
  callDuration: string
  onCallDurationChange: (value: string) => void
  callOutcome: string
  onCallOutcomeChange: (value: string) => void
  callNotes: string
  onCallNotesChange: (value: string) => void
  onSave: (recording?: CallRecordingPayload) => boolean | void | Promise<boolean | void>
  formatTimestamp: (iso: string) => string
  outcomeOptions?: readonly string[]
  outcomeBadgeClass?: (outcome: string) => string
  followUpDate?: string
  onFollowUpDateChange?: (value: string) => void
  formPrefix?: ReactNode
  logCallLabel?: string
  saveLabel?: string
  title?: string
}

function CallLogEntryCard({
  log,
  formatTimestamp,
  outcomeBadgeClass,
}: {
  log: CallLog
  formatTimestamp: (iso: string) => string
  outcomeBadgeClass: (outcome: string) => string
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            outcomeBadgeClass(log.outcome),
          )}
        >
          {log.outcome}
        </span>
        <span className="text-sm font-medium">{log.duration} min</span>
        <span className="text-xs text-muted-foreground">· {formatTimestamp(log.at)}</span>
      </div>
      {log.notes && <p className="mt-2 text-sm">{log.notes}</p>}
      {log.followUpDate && (
        <p className="mt-1 text-xs text-muted-foreground">Follow-up: {log.followUpDate}</p>
      )}
      <CallRecordingPlayer log={log} />
    </div>
  )
}

export function CallLogPanel({
  callLogs,
  showForm,
  onShowFormChange,
  callDuration,
  onCallDurationChange,
  callOutcome,
  onCallOutcomeChange,
  callNotes,
  onCallNotesChange,
  onSave,
  formatTimestamp,
  outcomeOptions = DEFAULT_CALL_OUTCOMES,
  outcomeBadgeClass = (outcome) =>
    DEFAULT_OUTCOME_STYLES[outcome] ?? 'bg-muted text-muted-foreground',
  followUpDate,
  onFollowUpDateChange,
  formPrefix,
  logCallLabel = 'Log Call',
  saveLabel = 'Save Call',
  title = 'Call Log',
}: CallLogPanelProps) {
  const [recordingFile, setRecordingFile] = useState<File | null>(null)
  const [recordingError, setRecordingError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const resetForm = () => {
    setRecordingFile(null)
    setRecordingError('')
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const recording: CallRecordingPayload | undefined = recordingFile
        ? {
            url: URL.createObjectURL(recordingFile),
            fileName: recordingFile.name,
            size: recordingFile.size,
          }
        : undefined
      const result = await onSave(recording)
      if (result === false) return
      resetForm()
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    onShowFormChange(false)
    resetForm()
  }

  return (
    <CallLogAudioProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{title}</CardTitle>
          {!showForm && (
            <Button type="button" variant="outline" size="sm" onClick={() => onShowFormChange(true)}>
              {logCallLabel.startsWith('+') ? (
                logCallLabel
              ) : (
                <>
                  <Plus className="size-3" /> {logCallLabel}
                </>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {callLogs.length === 0 && !showForm && (
            <div className="flex flex-col items-center py-8 text-center">
              <Phone className="mb-3 size-10 text-muted-foreground/40" />
              <p className="font-medium">No calls logged yet</p>
              <p className="text-sm text-muted-foreground">Log your first call</p>
            </div>
          )}

          {callLogs.map((log) => (
            <CallLogEntryCard
              key={log.id}
              log={log}
              formatTimestamp={formatTimestamp}
              outcomeBadgeClass={outcomeBadgeClass}
            />
          ))}

          {showForm && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              {formPrefix}
              <div>
                <label className="mb-1 block text-xs font-medium">Duration (minutes)</label>
                <input
                  type="number"
                  min={0}
                  value={callDuration}
                  onChange={(e) => onCallDurationChange(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Outcome</label>
                <select
                  value={callOutcome}
                  onChange={(e) => onCallOutcomeChange(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                >
                  {outcomeOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Notes</label>
                <textarea
                  rows={3}
                  value={callNotes}
                  onChange={(e) => onCallNotesChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                />
              </div>

              <CallRecordingUpload
                recordingFile={recordingFile}
                onFileChange={setRecordingFile}
                recordingError={recordingError}
                onErrorChange={setRecordingError}
              />

              {onFollowUpDateChange && (
                <div>
                  <label className="mb-1 block text-xs font-medium">Follow-up date</label>
                  <input
                    type="date"
                    value={followUpDate ?? ''}
                    onChange={(e) => onFollowUpDateChange(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving ? 'Saving call log...' : saveLabel}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </CallLogAudioProvider>
  )
}
