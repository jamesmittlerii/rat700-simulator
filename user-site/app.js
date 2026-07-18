const USER = 'jamesmittlerii'
const API = `https://api.github.com/users/${USER}/repos?per_page=100&sort=updated`

/** User-site repo names that must not appear as project cards. */
const USER_SITE_NAMES = new Set([
  `${USER}.github.io`,
  'GitHub.io',
  'github.io',
])

/** Friendlier titles / blurbs for known Pages repos. */
const CATALOG = {
  'rat700-simulator': {
    title: 'RAT 700 Simulator',
    description:
      'Browser Telefunken RAT 700 — patch the museum faceplate, compute, watch the phosphor scope.',
  },
  aptrepo: {
    title: 'aptrepo',
    description: 'Published GitHub Pages site for the aptrepo repository.',
  },
}

/** Shown if the GitHub API is unreachable (rate limit / offline). */
const FALLBACK = [
  {
    name: 'rat700-simulator',
    description: CATALOG['rat700-simulator'].description,
  },
]

const projectsEl = document.getElementById('projects')
const statusEl = document.getElementById('status')

function siteUrl(name) {
  // Relative path so this works on https://jamesmittlerii.github.io/
  return `/${name}/`
}

function titleFor(repo) {
  return CATALOG[repo.name]?.title ?? repo.name
}

function descriptionFor(repo) {
  return (
    CATALOG[repo.name]?.description ||
    repo.description ||
    `Project site for ${repo.name}.`
  )
}

function renderRepos(repos) {
  projectsEl.replaceChildren()

  if (repos.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent =
      'No Pages-enabled public repositories yet. Enable Pages on a repo under Settings → Pages.'
    projectsEl.append(empty)
    return
  }

  for (const repo of repos) {
    const a = document.createElement('a')
    a.className = 'project'
    a.href = siteUrl(repo.name)

    const name = document.createElement('span')
    name.className = 'project-name'
    name.textContent = titleFor(repo)

    const desc = document.createElement('span')
    desc.className = 'project-desc'
    desc.textContent = descriptionFor(repo)

    const go = document.createElement('span')
    go.className = 'project-go'
    go.setAttribute('aria-hidden', 'true')
    go.textContent = '→'

    a.append(name, desc, go)
    projectsEl.append(a)
  }
}

async function loadRepos() {
  try {
    const res = await fetch(API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const repos = await res.json()
    const pages = repos
      .filter((r) => r.has_pages && !USER_SITE_NAMES.has(r.name) && !r.private)
      .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
    renderRepos(pages)
    statusEl.textContent =
      pages.length === 1
        ? '1 site with GitHub Pages enabled'
        : `${pages.length} sites with GitHub Pages enabled`
  } catch {
    renderRepos(FALLBACK)
    statusEl.textContent = 'Showing fallback list (GitHub API unavailable)'
  }
}

loadRepos()
