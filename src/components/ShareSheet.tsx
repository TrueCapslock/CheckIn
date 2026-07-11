import { useState } from 'react'
import QRCode from './QRCode'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

interface Props {
  placeId: string
  placeName: string
  onClose: () => void
}

export default function ShareSheet({ placeId, placeName, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const { lang } = useLanguage()
  const shareUrl = `${window.location.origin}/places/${placeId}`

  const canShare = typeof navigator.share === 'function'

  const handleShare = async () => {
    if (canShare) {
      await navigator.share({ title: placeName, url: shareUrl })
    } else {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    // md+: render as a centered modal (matches iOS share-sheet on iPad).
    // Mobile: bottom sheet (full-width, rounded-top corners only).
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl w-full p-6 pb-10 md:rounded-2xl md:max-w-sm md:pb-6 md:mx-4 md:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

        <h2 className="text-lg font-bold text-center mb-4">{t('share_sheet.title', lang).replace('{name}', placeName)}</h2>

        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <QRCode url={shareUrl} size={180} />
        </div>

        <button
          onClick={handleShare}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
        >
          {copied ? (
            t('share_sheet.copied', lang)
          ) : (
            <>
              <span>📤</span> {canShare ? t('share_sheet.share', lang) : t('share_sheet.copy_link', lang)}
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          {t('share_sheet.scan', lang)}
        </p>
      </div>
    </div>
  )
}
