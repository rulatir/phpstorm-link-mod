// A link target the mod rewrites: group 2 is what follows the host.
export const INTERCEPT = /^http(s?):\/\/phpstorm\.intercept\/(.*)$/

// Candidate intercept targets in markdown text. A target ends at whitespace or
// at a character that closes a markdown link or autolink.
const CANDIDATE = /https?:\/\/phpstorm\.intercept\/[^\s()<>\[\]"']*/g

// Limits `Markdown` puts on `pressableLinks`.
const MAX_LINKS = 256
const MAX_LENGTH = 2048

// Returns the distinct intercept targets in `text`, in order of first use.
export function interceptTargets(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(CANDIDATE)) {
    const href = match[0]
    if (href.length <= MAX_LENGTH && INTERCEPT.test(href)) found.add(href)
    if (found.size === MAX_LINKS) break
  }
  return [...found]
}

// A markdown link target `](phpstorm://…)`: group 1 is what follows the scheme.
const PHPSTORM_TARGET = /\]\(phpstorm:\/\/([^\s()]*)\)/g

// Returns `text` with each markdown link target `phpstorm://<rest>` replaced by
// `https://phpstorm.intercept/<rest>`. `Markdown` draws no link for a
// `phpstorm:` target; it draws one for the `https:` target. Link text and
// bare URLs outside link syntax stay as written.
export function rewritePhpstormLinks(text: string): string {
  return text.replace(PHPSTORM_TARGET, '](https://phpstorm.intercept/$1)')
}

// Returns the phpstorm:// URL for an intercept target, or undefined for any
// other target.
export function phpstormUrl(href: string): string | undefined {
  const match = INTERCEPT.exec(href)
  return match ? `phpstorm://${match[2]}` : undefined
}

// Returns the base name of the `file` parameter of a phpstorm:// URL, without
// a `:<line>` suffix, or undefined when the URL names no file.
export function fileBasename(url: string): string | undefined {
  const query = url.split('?')[1]
  if (query === undefined) return undefined
  const file = new URLSearchParams(query).get('file')
  if (!file) return undefined
  const name = file.replace(/:\d+$/, '').split('/').pop()
  return name || undefined
}

// One match tuple of `gdbus call ... org.kde.krunner1.Match`: its id and the
// window title, quoted with ' or with " when the title holds a '.
const MATCH = /\('([^']+)', (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g

// Returns the KWin window-runner match id of the first PhpStorm editor window
// whose title (`<project> – <file>`) names `basename`, from gdbus output.
export function editorWindowId(gdbusOutput: string, basename: string): string | undefined {
  for (const m of gdbusOutput.matchAll(MATCH)) {
    const title = m[2] ?? m[3] ?? ''
    const file = title.split(' – ').slice(1).join(' – ')
    if (file.split('/').pop() === basename) return m[1]
  }
  return undefined
}
