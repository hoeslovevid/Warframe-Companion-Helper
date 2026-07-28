import { useEffect, useState } from 'react'
import { itemImageUrl } from '../lib/itemImage'

type Size = 'sm' | 'md' | 'lg'

type Props = {
  imageName: string | null | undefined
  name: string
  size?: Size
  className?: string
}

function initial(name: string): string {
  const t = name.trim()
  return t ? t[0]!.toUpperCase() : '?'
}

export function ItemThumb({ imageName, name, size = 'sm', className = '' }: Props) {
  const url = itemImageUrl(imageName)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [url])

  const showImg = Boolean(url) && !failed

  return (
    <span
      className={`item-thumb item-thumb--${size} ${className}`.trim()}
      aria-hidden
      title={name}
    >
      {showImg ? (
        <img src={url!} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="item-thumb__fallback">{initial(name)}</span>
      )}
    </span>
  )
}
