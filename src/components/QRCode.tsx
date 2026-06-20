import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

interface Props {
  url: string
  size?: number
}

export default function QRCode({ url, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: '#1e3a5f', light: '#ffffff' },
    })
  }, [url, size])

  return <canvas ref={canvasRef} className="mx-auto" />
}
