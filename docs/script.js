const REPO = 'hoeslovevid/Warframe-Companion-Helper'
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`
const LATEST_PAGE = `https://github.com/${REPO}/releases/latest`

function pickAsset(assets, kind) {
  if (!Array.isArray(assets)) return null
  const names = assets.map((a) => a.name || '')
  if (kind === 'setup') {
    return assets.find((a) => /Setup.*\.exe$/i.test(a.name) && !/\.blockmap$/i.test(a.name))
  }
  if (kind === 'portable') {
    return assets.find((a) => /portable.*\.exe$/i.test(a.name))
  }
  return names.length ? assets[0] : null
}

function setHref(id, url) {
  const el = document.getElementById(id)
  if (el && url) el.href = url
}

async function loadLatestRelease() {
  const versionLine = document.getElementById('version-line')
  try {
    const res = await fetch(LATEST_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data = await res.json()
    const tag = data.tag_name || data.name || 'latest'
    const setup = pickAsset(data.assets, 'setup')
    const portable = pickAsset(data.assets, 'portable')

    setHref('download-setup', setup?.browser_download_url || LATEST_PAGE)
    setHref('download-setup-2', setup?.browser_download_url || LATEST_PAGE)
    setHref('download-portable', portable?.browser_download_url || LATEST_PAGE)
    setHref('download-portable-2', portable?.browser_download_url || LATEST_PAGE)

    if (versionLine) {
      versionLine.innerHTML = `Latest release <strong>${tag}</strong> · Windows x64`
    }
  } catch {
    setHref('download-setup', LATEST_PAGE)
    setHref('download-setup-2', LATEST_PAGE)
    setHref('download-portable', LATEST_PAGE)
    setHref('download-portable-2', LATEST_PAGE)
    if (versionLine) {
      versionLine.innerHTML = `Get the latest build from <a href="${LATEST_PAGE}">GitHub Releases</a>`
    }
  }
}

function setupReveal() {
  const nodes = document.querySelectorAll('.section-inner, .feature-block, .steps li')
  nodes.forEach((el) => el.classList.add('reveal'))

  if (!('IntersectionObserver' in window)) {
    nodes.forEach((el) => el.classList.add('is-in'))
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  )

  nodes.forEach((el) => io.observe(el))
}

document.addEventListener('DOMContentLoaded', () => {
  void loadLatestRelease()
  setupReveal()
})
