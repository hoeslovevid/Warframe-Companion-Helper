/** warframestat CDN for WFCD item art. */
export const ITEM_IMAGE_CDN = 'https://cdn.warframestat.us/img'

export function itemImageUrl(imageName: string | null | undefined): string | null {
  if (!imageName) return null
  const base = imageName.trim().replace(/^\/+/, '')
  if (!base) return null
  return `${ITEM_IMAGE_CDN}/${base}`
}
